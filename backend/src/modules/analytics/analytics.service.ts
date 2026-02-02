import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';
import { System } from '../../database/entities/system.entity';
import { StabilityScoringService } from './services/stability-scoring.service';
import {
  StabilityOverviewResponseDto,
  SystemClassificationResponseDto,
  R7GapAnalysisResponseDto,
  RecoveryStatusResponseDto,
  SystemInsightsResponseDto,
  AnalyticsSummaryResponseDto,
} from './dto/analytics-response.dto';
import { SystemStabilityMetrics } from './interfaces/stability-classification.interface';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
    private stabilityScoringService: StabilityScoringService,
  ) {}

  /**
   * Get stability overview
   */
  async getStabilityOverview(days: number = 30, env?: string): Promise<StabilityOverviewResponseDto> {
    this.logger.log(`Getting stability overview for ${days} days${env ? ` in ${env}` : ''}`);

    const overview = await this.stabilityScoringService.getStabilityOverview(days, env);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return {
      ...overview,
      dateRange: {
        startDate,
        endDate,
        days,
      },
    };
  }

  /**
   * Get system classification with detailed metrics (OPTIMIZED)
   */
  async getSystemClassification(days: number = 30, env?: string): Promise<SystemClassificationResponseDto> {
    this.logger.log(`Getting system classification for ${days} days${env ? ` in ${env}` : ''}`);

    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get latest snapshot date
    const latestDateResult = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .where('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .getRawOne();

    if (!latestDateResult?.maxDate) {
      return {
        systems: [],
        overview: await this.stabilityScoringService.getStabilityOverview(days, env),
        actionableSystems: [],
        expectedBehaviorSystems: [],
      };
    }

    const latestDate = new Date(latestDateResult.maxDate);

    // Get all unique systems from latest snapshot with their environment
    const systemsQueryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.shortname', 'shortname')
      .addSelect('snapshot.env', 'env')
      .where('DATE(snapshot.importDate) = DATE(:latestDate)', { latestDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .groupBy('snapshot.shortname')
      .addGroupBy('snapshot.env');

    if (env) {
      systemsQueryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const systems = await systemsQueryBuilder.getRawMany();
    const shortnames = systems.map(s => s.shortname);
    
    // Create a map of shortname to env for later use
    const systemEnvMap = new Map<string, string | null>();
    systems.forEach(s => systemEnvMap.set(s.shortname, s.env));

    if (shortnames.length === 0) {
      return {
        systems: [],
        overview: await this.stabilityScoringService.getStabilityOverview(days, env),
        actionableSystems: [],
        expectedBehaviorSystems: [],
      };
    }

    // OPTIMIZATION: Fetch all snapshots in bulk
    const allSnapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.shortname IN (:...shortnames)', { shortnames })
      .andWhere('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .orderBy('snapshot.shortname', 'ASC')
      .addOrderBy('snapshot.importDate', 'ASC')
      .getMany();

    // Group snapshots by system
    const snapshotsBySystem = new Map<string, any[]>();
    for (const snapshot of allSnapshots) {
      if (!snapshotsBySystem.has(snapshot.shortname)) {
        snapshotsBySystem.set(snapshot.shortname, []);
      }
      snapshotsBySystem.get(snapshot.shortname)!.push(snapshot);
    }

    // Analyze each system using bulk-fetched data
    const metrics: SystemStabilityMetrics[] = [];
    for (const shortname of shortnames) {
      const systemSnapshots = snapshotsBySystem.get(shortname) || [];
      if (systemSnapshots.length > 0) {
        const metric = await this.stabilityScoringService.analyzeSystemStabilityFromSnapshots(
          shortname,
          systemSnapshots,
          endDate,
        );
        if (metric) {
          // Add environment data from the map
          const metricWithEnv = {
            ...metric,
            env: systemEnvMap.get(shortname) || null,
          };
          metrics.push(metricWithEnv);
        }
      }
    }

    // Separate actionable and expected behavior systems
    const actionableSystems = metrics.filter(m => m.isActionable);
    const expectedBehaviorSystems = metrics.filter(m => !m.isActionable);

    // Get overview (will use cached data if called recently)
    const overview = await this.stabilityScoringService.getStabilityOverview(days, env);

    return {
      systems: metrics,
      overview,
      actionableSystems,
      expectedBehaviorSystems,
    };
  }

  /**
   * Get R7 gap analysis
   */
  async getR7GapAnalysis(env?: string): Promise<R7GapAnalysisResponseDto> {
    this.logger.log(`Getting R7 gap analysis${env ? ` for ${env}` : ''}`);

    const analyses = await this.stabilityScoringService.getR7GapAnalysis(env);

    const totalSystems = analyses.length;
    const r7Present = analyses.filter(a => a.r7Found).length;
    const expectedGaps = analyses.filter(a => !a.r7Found && a.isExpected).length;
    const investigateGaps = analyses.filter(a => !a.r7Found && !a.isExpected).length;

    const gapBreakdown = {
      expectedRecentOffline: analyses.filter(a => a.classification === 'EXPECTED_RECENT_OFFLINE').length,
      expectedInactive: analyses.filter(a => a.classification === 'EXPECTED_INACTIVE').length,
      expectedOffline: analyses.filter(a => a.classification === 'EXPECTED_OFFLINE').length,
      investigateR7Issue: analyses.filter(a => a.classification === 'INVESTIGATE_R7_ISSUE').length,
    };

    const systemsToInvestigate = analyses.filter(a => !a.isExpected);
    const expectedGapSystems = analyses.filter(a => !a.r7Found && a.isExpected);

    return {
      totalSystems,
      r7Present,
      expectedGaps,
      investigateGaps,
      gapBreakdown,
      systemsToInvestigate,
      expectedGapSystems,
    };
  }

  /**
   * Get recovery status
   */
  async getRecoveryStatus(days: number = 30, env?: string): Promise<RecoveryStatusResponseDto> {
    this.logger.log(`Getting recovery status for ${days} days${env ? ` in ${env}` : ''}`);

    const trackings = await this.stabilityScoringService.getRecoveryTracking(days, env);

    const totalRecovering = trackings.length;
    const normalRecovery = trackings.filter(t => t.status === 'NORMAL_RECOVERY').length;
    const stuckRecovery = trackings.filter(t => t.status === 'STUCK_RECOVERY' || t.status === 'NOT_RECOVERING').length;
    const fullyRecovered = trackings.filter(t => t.status === 'FULLY_RECOVERED').length;

    // Calculate average recovery time for completed recoveries
    const completedRecoveries = trackings.filter(t => t.status === 'FULLY_RECOVERED' && t.daysSinceRecoveryStart !== null);
    const averageRecoveryTime = completedRecoveries.length > 0
      ? Math.round(completedRecoveries.reduce((sum, t) => sum + (t.daysSinceRecoveryStart || 0), 0) / completedRecoveries.length * 10) / 10
      : 0;

    const recoveringSystems = trackings.filter(t => 
      t.status === 'NORMAL_RECOVERY' || t.status === 'STUCK_RECOVERY' || t.status === 'NOT_RECOVERING'
    );
    const stuckSystems = trackings.filter(t => t.isStuck);

    return {
      totalRecovering,
      normalRecovery,
      stuckRecovery,
      fullyRecovered,
      averageRecoveryTime,
      recoveringSystems,
      stuckSystems,
    };
  }

  /**
   * Get detailed insights for a specific system
   */
  async getSystemInsights(shortname: string, days: number = 30): Promise<SystemInsightsResponseDto | null> {
    this.logger.log(`Getting insights for system: ${shortname}`);

    // Get system info
    const system = await this.systemRepository.findOne({ where: { shortname } });
    if (!system) {
      return null;
    }

    // Get stability metrics
    const metrics = await this.stabilityScoringService.analyzeSystemStability(shortname, days);
    if (!metrics) {
      return null;
    }

    // Get health history
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.shortname = :shortname', { shortname })
      .andWhere('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .orderBy('snapshot.importDate', 'ASC')
      .getMany();

    const healthHistory = snapshots.map(s => ({
      date: s.importDate,
      healthStatus: this.calculateHealthStatus(s) as 'fully' | 'partially' | 'unhealthy' | 'inactive',
      r7Found: s.r7Found === 1,
      amFound: s.amFound === 1,
      dfFound: s.dfFound === 1,
      itFound: s.itFound === 1,
      itLagDays: s.itLagDays,
    }));

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics);

    return {
      shortname: system.shortname,
      fullname: system.fullname,
      env: system.env,
      stabilityScore: metrics.stabilityScore,
      classification: metrics.classification,
      healthChangeCount: metrics.healthChangeCount,
      consecutiveDaysStable: metrics.consecutiveDaysStable,
      daysTracked: metrics.daysTracked,
      currentHealthStatus: metrics.currentHealthStatus,
      previousHealthStatus: metrics.previousHealthStatus,
      lastHealthChange: metrics.lastHealthChange,
      r7GapClassification: metrics.r7GapClassification,
      r7GapReason: metrics.r7GapReason,
      recoveryStatus: metrics.recoveryStatus,
      recoveryDays: metrics.recoveryDays,
      isActionable: metrics.isActionable,
      actionReason: metrics.actionReason,
      recommendations,
      healthHistory,
    };
  }

  /**
   * Get analytics summary for dashboard
   */
  async getAnalyticsSummary(days: number = 30, env?: string): Promise<AnalyticsSummaryResponseDto> {
    this.logger.log(`Getting analytics summary for ${days} days${env ? ` in ${env}` : ''}`);

    // Get all analytics data
    const overview = await this.stabilityScoringService.getStabilityOverview(days, env);
    const r7Analysis = await this.getR7GapAnalysis(env);
    const recoveryStatus = await this.getRecoveryStatus(days, env);
    const classification = await this.getSystemClassification(days, env);

    // Generate critical insights
    const criticalInsights: AnalyticsSummaryResponseDto['criticalInsights'] = [];

    // Actionable systems insight
    if (overview.actionableCount > 0) {
      criticalInsights.push({
        type: 'warning',
        title: 'Systems Requiring Investigation',
        message: `${overview.actionableCount} system(s) need immediate attention`,
        count: overview.actionableCount,
        systems: classification.actionableSystems.slice(0, 5).map(s => s.shortname),
      });
    }

    // Flapping systems insight
    if (overview.flapping > 0) {
      criticalInsights.push({
        type: 'info',
        title: 'Flapping Systems Detected',
        message: `${overview.flapping} system(s) showing normal offline/online cycles - no action needed`,
        count: overview.flapping,
      });
    }

    // Recovery insight
    if (recoveryStatus.stuckRecovery > 0) {
      criticalInsights.push({
        type: 'warning',
        title: 'Stuck Recovery',
        message: `${recoveryStatus.stuckRecovery} system(s) stuck in recovery - may need intervention`,
        count: recoveryStatus.stuckRecovery,
        systems: recoveryStatus.stuckSystems.slice(0, 5).map(s => s.shortname),
      });
    }

    // Positive insight
    if (overview.stableHealthy > 0) {
      criticalInsights.push({
        type: 'success',
        title: 'Stable Healthy Systems',
        message: `${overview.stableHealthy} system(s) consistently healthy`,
        count: overview.stableHealthy,
      });
    }

    // R7 gap summary
    const r7GapSummary = {
      expectedGaps: r7Analysis.expectedGaps,
      investigateGaps: r7Analysis.investigateGaps,
      percentageExpected: r7Analysis.totalSystems > 0
        ? Math.round((r7Analysis.expectedGaps / (r7Analysis.expectedGaps + r7Analysis.investigateGaps)) * 100)
        : 0,
    };

    // Recovery summary
    const recoverySummary = {
      normalRecovery: recoveryStatus.normalRecovery,
      stuckRecovery: recoveryStatus.stuckRecovery,
      averageRecoveryTime: recoveryStatus.averageRecoveryTime,
    };

    // Generate action items
    const actionItems: AnalyticsSummaryResponseDto['actionItems'] = [];

    // High priority: Stable unhealthy systems
    const stableUnhealthySystems = classification.actionableSystems.filter(
      s => s.classification === 'STABLE_UNHEALTHY'
    );
    if (stableUnhealthySystems.length > 0) {
      actionItems.push({
        priority: 'high',
        category: 'Chronic Issues',
        description: 'Systems consistently unhealthy - require immediate remediation',
        systemCount: stableUnhealthySystems.length,
        systems: stableUnhealthySystems.slice(0, 10).map(s => s.shortname),
      });
    }

    // High priority: R7 configuration issues
    if (r7Analysis.investigateGaps > 0) {
      actionItems.push({
        priority: 'high',
        category: 'R7 Configuration',
        description: 'R7 missing but other tools present - possible agent or configuration issue',
        systemCount: r7Analysis.investigateGaps,
        systems: r7Analysis.systemsToInvestigate.slice(0, 10).map(s => s.shortname),
      });
    }

    // Medium priority: Stuck recovery
    if (recoveryStatus.stuckRecovery > 0) {
      actionItems.push({
        priority: 'medium',
        category: 'Stuck Recovery',
        description: 'Systems taking longer than expected to recover',
        systemCount: recoveryStatus.stuckRecovery,
        systems: recoveryStatus.stuckSystems.slice(0, 10).map(s => s.shortname),
      });
    }

    // Medium priority: Degrading systems
    const degradingSystems = classification.systems.filter(s => s.classification === 'DEGRADING');
    if (degradingSystems.length > 0) {
      actionItems.push({
        priority: 'medium',
        category: 'Degrading Health',
        description: 'Systems recently lost health - monitor closely',
        systemCount: degradingSystems.length,
        systems: degradingSystems.slice(0, 10).map(s => s.shortname),
      });
    }

    // Low priority: Expected behavior
    actionItems.push({
      priority: 'low',
      category: 'Expected Behavior',
      description: 'Systems with normal patterns - no action needed',
      systemCount: overview.expectedBehaviorCount,
      systems: [],
    });

    return {
      overview,
      criticalInsights,
      r7GapSummary,
      recoverySummary,
      actionItems,
    };
  }

  /**
   * Calculate health status for a snapshot
   * Uses grace period to provide "true state" health vs strict daily check-in
   */
  private calculateHealthStatus(snapshot: DailySnapshot): string {
    // Health grace period - same as systems service
    const HEALTH_GRACE_PERIOD_DAYS = 3;
    
    if (!snapshot.itFound || (snapshot.itLagDays !== null && snapshot.itLagDays > 15)) {
      return 'inactive';
    }

    // Count health tools using "true state" logic with grace period
    // Tool counts if it either:
    // 1. Checked in today (found = 1), OR
    // 2. Checked in within grace period (lagDays <= HEALTH_GRACE_PERIOD_DAYS)
    const healthTools = [
      snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= HEALTH_GRACE_PERIOD_DAYS),
      snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= HEALTH_GRACE_PERIOD_DAYS),
      snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= HEALTH_GRACE_PERIOD_DAYS),
    ].filter(Boolean).length;

    if (healthTools === 3) return 'fully';
    if (healthTools >= 1) return 'partially';
    return 'unhealthy';
  }

  /**
   * Generate recommendations for a system
   */
  private generateRecommendations(metrics: SystemStabilityMetrics): string[] {
    const recommendations: string[] = [];

    // Based on classification
    switch (metrics.classification) {
      case 'STABLE_UNHEALTHY':
        recommendations.push('System consistently unhealthy - investigate tool agent status and connectivity');
        recommendations.push('Check if system is properly configured in all security tools');
        break;
      case 'DEGRADING':
        recommendations.push('System health recently declined - investigate what changed');
        recommendations.push('Check system logs for errors or configuration changes');
        break;
      case 'FLAPPING':
        recommendations.push('System shows normal offline/online cycles - no immediate action needed');
        recommendations.push('If system should be always-on, investigate power management or network issues');
        break;
      case 'RECOVERING':
        recommendations.push('System recovering normally - monitor for completion within 1-2 days');
        break;
      case 'STABLE_HEALTHY':
        recommendations.push('System operating normally - continue monitoring');
        break;
    }

    // Based on R7 gap
    if (metrics.r7GapClassification === 'INVESTIGATE_R7_ISSUE') {
      recommendations.push('R7 agent may need reinstallation or configuration check');
      recommendations.push('Verify R7 agent service is running and can communicate with R7 servers');
    } else if (metrics.r7GapClassification === 'EXPECTED_RECENT_OFFLINE') {
      recommendations.push('R7 gap is expected - system was recently offline');
      recommendations.push('R7 should resume reporting within 24 hours of system coming back online');
    }

    // Based on recovery status
    if (metrics.recoveryStatus === 'STUCK_RECOVERY') {
      recommendations.push('Recovery taking longer than expected - manual intervention may be needed');
      recommendations.push('Check tool agent status and restart services if necessary');
    } else if (metrics.recoveryStatus === 'NOT_RECOVERING') {
      recommendations.push('No improvement detected - immediate investigation required');
      recommendations.push('Verify network connectivity and tool agent configurations');
    }

    return recommendations;
  }
}
