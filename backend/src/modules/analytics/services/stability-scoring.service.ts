import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailySnapshot } from '../../../database/entities/daily-snapshot.entity';
import {
  StabilityClassification,
  R7GapClassification,
  RecoveryStatus,
  SystemStabilityMetrics,
  StabilityOverview,
  R7GapAnalysis,
  RecoveryTracking,
} from '../interfaces/stability-classification.interface';

@Injectable()
export class StabilityScoringService {
  private readonly logger = new Logger(StabilityScoringService.name);
  private readonly INTUNE_INACTIVE_DAYS = 15;
  private readonly R7_REMOVAL_THRESHOLD = 15;
  private readonly NORMAL_RECOVERY_DAYS = 2;
  private readonly STUCK_RECOVERY_DAYS = 3;
  private readonly FLAPPING_THRESHOLD = 5; // Changes in 30 days to be considered flapping
  private readonly STABLE_DAYS_THRESHOLD = 7; // Days stable to be considered stable

  constructor(
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

  /**
   * Calculate system health status based on tool reporting
   */
  private calculateHealthStatus(
    snapshot: DailySnapshot,
    referenceDate: Date,
  ): 'fully' | 'partially' | 'unhealthy' | 'inactive' {
    // Check if system is active in Intune
    if (!snapshot.itFound || (snapshot.itLagDays !== null && snapshot.itLagDays > this.INTUNE_INACTIVE_DAYS)) {
      return 'inactive';
    }

    // Count health tools (R7, AM, DF)
    const healthTools = [
      snapshot.r7Found,
      snapshot.amFound,
      snapshot.dfFound,
    ].filter(Boolean).length;

    if (healthTools === 3) return 'fully';
    if (healthTools >= 1) return 'partially';
    return 'unhealthy';
  }

  /**
   * Calculate stability score for a system (0-100)
   * Higher score = more stable
   */
  private calculateStabilityScore(
    healthChanges: number,
    daysTracked: number,
    consecutiveDaysStable: number,
  ): number {
    if (daysTracked === 0) return 0;

    // Base score: 100 - (change frequency * 100)
    const changeFrequency = healthChanges / daysTracked;
    let score = 100 - (changeFrequency * 100);

    // Bonus for long stable periods
    if (consecutiveDaysStable >= 30) {
      score = Math.min(100, score + 10);
    } else if (consecutiveDaysStable >= 14) {
      score = Math.min(100, score + 5);
    }

    // Penalty for very recent changes
    if (consecutiveDaysStable < 3) {
      score = Math.max(0, score - 10);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Classify system based on stability metrics
   */
  private classifySystem(
    stabilityScore: number,
    healthChanges: number,
    consecutiveDaysStable: number,
    currentHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive',
    previousHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null,
    daysTracked: number,
  ): StabilityClassification {
    // Flapping: frequent changes
    if (healthChanges >= this.FLAPPING_THRESHOLD && daysTracked >= 30) {
      return 'FLAPPING';
    }

    // Recovering: recently improved
    if (previousHealth && this.isImprovement(previousHealth, currentHealth) && consecutiveDaysStable < this.STABLE_DAYS_THRESHOLD) {
      return 'RECOVERING';
    }

    // Degrading: recently declined
    if (previousHealth && this.isDegradation(previousHealth, currentHealth) && consecutiveDaysStable < this.STABLE_DAYS_THRESHOLD) {
      return 'DEGRADING';
    }

    // Stable healthy: consistently healthy
    if (currentHealth === 'fully' && stabilityScore >= 70) {
      return 'STABLE_HEALTHY';
    }

    // Stable unhealthy: consistently unhealthy
    if ((currentHealth === 'unhealthy' || currentHealth === 'inactive') && stabilityScore >= 70) {
      return 'STABLE_UNHEALTHY';
    }

    // Default to stable healthy/unhealthy based on current state
    return currentHealth === 'fully' ? 'STABLE_HEALTHY' : 'STABLE_UNHEALTHY';
  }

  /**
   * Check if health status improved
   */
  private isImprovement(
    previous: 'fully' | 'partially' | 'unhealthy' | 'inactive',
    current: 'fully' | 'partially' | 'unhealthy' | 'inactive',
  ): boolean {
    const healthOrder = { inactive: 0, unhealthy: 1, partially: 2, fully: 3 };
    return healthOrder[current] > healthOrder[previous];
  }

  /**
   * Check if health status degraded
   */
  private isDegradation(
    previous: 'fully' | 'partially' | 'unhealthy' | 'inactive',
    current: 'fully' | 'partially' | 'unhealthy' | 'inactive',
  ): boolean {
    const healthOrder = { inactive: 0, unhealthy: 1, partially: 2, fully: 3 };
    return healthOrder[current] < healthOrder[previous];
  }

  /**
   * Classify R7 gap
   */
  private classifyR7Gap(
    snapshot: DailySnapshot,
  ): { classification: R7GapClassification; reason: string; isExpected: boolean } {
    if (snapshot.r7Found) {
      return {
        classification: 'R7_PRESENT',
        reason: 'Rapid7 is reporting normally',
        isExpected: true,
      };
    }

    const intuneLagDays = snapshot.itLagDays || 0;
    const otherToolsPresent = snapshot.amFound || snapshot.dfFound;

    // R7 missing, system recently offline
    if (snapshot.itFound && intuneLagDays < this.R7_REMOVAL_THRESHOLD) {
      return {
        classification: 'EXPECTED_RECENT_OFFLINE',
        reason: `System recently offline (Intune lag: ${intuneLagDays} days). R7 removes entries after 15 days of no check-in.`,
        isExpected: true,
      };
    }

    // R7 missing, system inactive
    if (!snapshot.itFound || intuneLagDays > this.INTUNE_INACTIVE_DAYS) {
      return {
        classification: 'EXPECTED_INACTIVE',
        reason: `System inactive (Intune lag: ${intuneLagDays || 'N/A'} days). R7 correctly removed.`,
        isExpected: true,
      };
    }

    // R7 missing but other tools present - potential issue
    if (otherToolsPresent) {
      return {
        classification: 'INVESTIGATE_R7_ISSUE',
        reason: 'Other tools reporting but R7 missing. Possible R7 agent or configuration issue.',
        isExpected: false,
      };
    }

    // R7 missing, system offline
    return {
      classification: 'EXPECTED_OFFLINE',
      reason: 'System appears offline. R7 gap is expected.',
      isExpected: true,
    };
  }

  /**
   * Determine recovery status
   */
  private determineRecoveryStatus(
    currentHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive',
    previousHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null,
    daysSinceChange: number | null,
  ): { status: RecoveryStatus; explanation: string; isStuck: boolean } {
    if (!previousHealth || daysSinceChange === null) {
      return {
        status: 'NOT_APPLICABLE',
        explanation: 'No previous health data available',
        isStuck: false,
      };
    }

    const isImproving = this.isImprovement(previousHealth, currentHealth);
    const isDegrading = this.isDegradation(previousHealth, currentHealth);

    // Fully recovered
    if (currentHealth === 'fully' && isImproving) {
      return {
        status: 'FULLY_RECOVERED',
        explanation: `Successfully recovered to fully healthy in ${daysSinceChange} days`,
        isStuck: false,
      };
    }

    // Currently recovering
    if (isImproving) {
      if (daysSinceChange <= this.NORMAL_RECOVERY_DAYS) {
        return {
          status: 'NORMAL_RECOVERY',
          explanation: `Recovering normally (${daysSinceChange} days). Expected to complete within 1-2 days.`,
          isStuck: false,
        };
      } else if (daysSinceChange > this.STUCK_RECOVERY_DAYS) {
        return {
          status: 'STUCK_RECOVERY',
          explanation: `Recovery taking longer than expected (${daysSinceChange} days). May need investigation.`,
          isStuck: true,
        };
      } else {
        return {
          status: 'NORMAL_RECOVERY',
          explanation: `Recovering (${daysSinceChange} days). Monitor for completion.`,
          isStuck: false,
        };
      }
    }

    // Not recovering
    if (isDegrading || (currentHealth !== 'fully' && daysSinceChange > this.STUCK_RECOVERY_DAYS)) {
      return {
        status: 'NOT_RECOVERING',
        explanation: `No improvement detected after ${daysSinceChange} days. Needs investigation.`,
        isStuck: true,
      };
    }

    return {
      status: 'NOT_APPLICABLE',
      explanation: 'System status stable',
      isStuck: false,
    };
  }

  /**
   * Analyze system stability over a time period
   */
  async analyzeSystemStability(
    shortname: string,
    days: number = 30,
  ): Promise<SystemStabilityMetrics | null> {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get snapshots for this system
    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.shortname = :shortname', { shortname })
      .andWhere('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .orderBy('snapshot.importDate', 'ASC')
      .getMany();

    if (snapshots.length === 0) {
      return null;
    }

    // Calculate health status for each day
    const healthHistory: Array<{
      date: Date;
      health: 'fully' | 'partially' | 'unhealthy' | 'inactive';
    }> = [];

    for (const snapshot of snapshots) {
      const health = this.calculateHealthStatus(snapshot, new Date(snapshot.importDate));
      healthHistory.push({
        date: snapshot.importDate,
        health,
      });
    }

    // Count health changes
    let healthChangeCount = 0;
    for (let i = 1; i < healthHistory.length; i++) {
      if (healthHistory[i].health !== healthHistory[i - 1].health) {
        healthChangeCount++;
      }
    }

    // Calculate consecutive days stable
    let consecutiveDaysStable = 1;
    const currentHealth = healthHistory[healthHistory.length - 1].health;
    for (let i = healthHistory.length - 2; i >= 0; i--) {
      if (healthHistory[i].health === currentHealth) {
        consecutiveDaysStable++;
      } else {
        break;
      }
    }

    // Find last health change date
    let lastHealthChange: Date | null = null;
    let previousHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null = null;
    for (let i = healthHistory.length - 2; i >= 0; i--) {
      if (healthHistory[i].health !== currentHealth) {
        lastHealthChange = healthHistory[i + 1].date;
        previousHealth = healthHistory[i].health;
        break;
      }
    }

    // Calculate stability score
    const stabilityScore = this.calculateStabilityScore(
      healthChangeCount,
      healthHistory.length,
      consecutiveDaysStable,
    );

    // Classify system
    const classification = this.classifySystem(
      stabilityScore,
      healthChangeCount,
      consecutiveDaysStable,
      currentHealth,
      previousHealth,
      healthHistory.length,
    );

    // Analyze R7 gap
    const latestSnapshot = snapshots[snapshots.length - 1];
    const r7Analysis = this.classifyR7Gap(latestSnapshot);

    // Determine recovery status
    const daysSinceChange = lastHealthChange
      ? Math.floor((endDate.getTime() - new Date(lastHealthChange).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const recoveryAnalysis = this.determineRecoveryStatus(currentHealth, previousHealth, daysSinceChange);

    // Determine if actionable
    const isActionable = 
      classification === 'STABLE_UNHEALTHY' ||
      classification === 'DEGRADING' ||
      !r7Analysis.isExpected ||
      recoveryAnalysis.isStuck;

    let actionReason: string | null = null;
    if (isActionable) {
      const reasons: string[] = [];
      if (classification === 'STABLE_UNHEALTHY') {
        reasons.push('System consistently unhealthy');
      }
      if (classification === 'DEGRADING') {
        reasons.push('System health degrading');
      }
      if (!r7Analysis.isExpected) {
        reasons.push(r7Analysis.reason);
      }
      if (recoveryAnalysis.isStuck) {
        reasons.push(recoveryAnalysis.explanation);
      }
      actionReason = reasons.join('; ');
    }

    return {
      shortname,
      stabilityScore,
      classification,
      healthChangeCount,
      consecutiveDaysStable,
      daysTracked: healthHistory.length,
      currentHealthStatus: currentHealth,
      previousHealthStatus: previousHealth,
      lastHealthChange,
      r7GapClassification: r7Analysis.classification,
      r7GapReason: r7Analysis.reason,
      recoveryStatus: recoveryAnalysis.status,
      recoveryDays: daysSinceChange,
      isActionable,
      actionReason,
    };
  }

  /**
   * Get stability overview for all systems
   */
  async getStabilityOverview(days: number = 30, env?: string): Promise<StabilityOverview> {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get latest snapshot date
    const latestDateResult = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestDateResult?.maxDate) {
      return this.getEmptyOverview();
    }

    const latestDate = new Date(latestDateResult.maxDate);

    // Get all unique systems from latest snapshot
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('DATE(snapshot.importDate) = DATE(:latestDate)', { latestDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const systems = await queryBuilder.getRawMany();

    // Analyze each system
    const metrics: SystemStabilityMetrics[] = [];
    for (const system of systems) {
      const metric = await this.analyzeSystemStability(system.shortname, days);
      if (metric) {
        metrics.push(metric);
      }
    }

    // Calculate overview
    const overview: StabilityOverview = {
      totalSystems: metrics.length,
      stableHealthy: metrics.filter(m => m.classification === 'STABLE_HEALTHY').length,
      stableUnhealthy: metrics.filter(m => m.classification === 'STABLE_UNHEALTHY').length,
      recovering: metrics.filter(m => m.classification === 'RECOVERING').length,
      degrading: metrics.filter(m => m.classification === 'DEGRADING').length,
      flapping: metrics.filter(m => m.classification === 'FLAPPING').length,
      actionableCount: metrics.filter(m => m.isActionable).length,
      expectedBehaviorCount: metrics.filter(m => !m.isActionable).length,
      averageStabilityScore: metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m.stabilityScore, 0) / metrics.length)
        : 0,
    };

    return overview;
  }

  /**
   * Get R7 gap analysis for all systems
   */
  async getR7GapAnalysis(env?: string): Promise<R7GapAnalysis[]> {
    // Get latest snapshot date
    const latestDateResult = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestDateResult?.maxDate) {
      return [];
    }

    const latestDate = new Date(latestDateResult.maxDate);

    // Get latest snapshots
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('DATE(snapshot.importDate) = DATE(:latestDate)', { latestDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder.getMany();

    // Analyze each system
    const analyses: R7GapAnalysis[] = [];
    for (const snapshot of snapshots) {
      const r7Analysis = this.classifyR7Gap(snapshot);
      analyses.push({
        shortname: snapshot.shortname,
        r7Found: snapshot.r7Found === 1,
        intuneFound: snapshot.itFound === 1,
        intuneLagDays: snapshot.itLagDays,
        otherToolsPresent: snapshot.amFound === 1 || snapshot.dfFound === 1,
        classification: r7Analysis.classification,
        isExpected: r7Analysis.isExpected,
        explanation: r7Analysis.reason,
      });
    }

    return analyses;
  }

  /**
   * Get recovery tracking for all systems
   */
  async getRecoveryTracking(days: number = 30, env?: string): Promise<RecoveryTracking[]> {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get latest snapshot date
    const latestDateResult = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestDateResult?.maxDate) {
      return [];
    }

    const latestDate = new Date(latestDateResult.maxDate);

    // Get all unique systems from latest snapshot
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('DATE(snapshot.importDate) = DATE(:latestDate)', { latestDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const systems = await queryBuilder.getRawMany();

    // Analyze each system
    const trackings: RecoveryTracking[] = [];
    for (const system of systems) {
      const metric = await this.analyzeSystemStability(system.shortname, days);
      if (metric && metric.recoveryStatus !== 'NOT_APPLICABLE') {
        const recoveryAnalysis = this.determineRecoveryStatus(
          metric.currentHealthStatus,
          metric.previousHealthStatus,
          metric.recoveryDays,
        );

        trackings.push({
          shortname: system.shortname,
          status: metric.recoveryStatus,
          recoveryStartDate: metric.lastHealthChange,
          daysSinceRecoveryStart: metric.recoveryDays,
          currentHealth: metric.currentHealthStatus,
          previousHealth: metric.previousHealthStatus,
          isStuck: recoveryAnalysis.isStuck,
          expectedRecoveryTime: this.NORMAL_RECOVERY_DAYS,
          explanation: recoveryAnalysis.explanation,
        });
      }
    }

    return trackings;
  }

  /**
   * Get empty overview
   */
  private getEmptyOverview(): StabilityOverview {
    return {
      totalSystems: 0,
      stableHealthy: 0,
      stableUnhealthy: 0,
      recovering: 0,
      degrading: 0,
      flapping: 0,
      actionableCount: 0,
      expectedBehaviorCount: 0,
      averageStabilityScore: 0,
    };
  }
}
