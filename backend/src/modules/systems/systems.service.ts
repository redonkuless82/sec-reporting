import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class SystemsService {
  // Intune inactivity threshold in days
  private readonly INTUNE_INACTIVE_DAYS = 15;
  
  // Health grace period - tools are considered healthy if seen within this many days
  // This provides "true state" health vs strict daily check-in tracking
  // Covers weekends and provides stable metrics while still detecting real issues
  private readonly HEALTH_GRACE_PERIOD_DAYS = 3;

  constructor(
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

  /**
   * Check if a system is active based on Intune lag days
   * A system is active if:
   * 1. Intune lag days is <= 15 days (seen in Intune within the threshold), OR
   * 2. It has ANY health tool reporting (for environments without Intune)
   *
   * This ensures we exclude systems that haven't shown up in Intune for more than 15 days
   */
  private isSystemActive(snapshot: DailySnapshot, referenceDate: Date): boolean {
    // Check if any health tools are present (R7, AM, DF)
    const hasAnyHealthTool = snapshot.r7Found || snapshot.amFound || snapshot.dfFound;
    
    // Check Intune lag - if lag is null or undefined, treat as not in Intune
    const itLagDays = snapshot.itLagDays ?? null;
    
    // If Intune lag is within threshold (0-15 days), system is active
    if (itLagDays !== null && itLagDays <= this.INTUNE_INACTIVE_DAYS) {
      return true;
    }
    
    // If Intune lag is > 15 days or not available, but health tools are present, consider active
    // This handles environments that don't use Intune
    if (hasAnyHealthTool) {
      return true;
    }
    
    // Intune lag > 15 days and no health tools = inactive
    return false;
  }

  /**
   * Calculate health status for a system
   * Health is based on: Rapid7, Automox, and Defender (VMware excluded)
   * System must be active (in Intune OR has health tools reporting) to be considered
   * Uses grace period to provide "true state" health vs strict daily check-in
   *
   * Returns:
   * - 'fully': All 3 tools (R7 + AM + DF) present (checked in within grace period)
   * - 'partially': 1-2 tools present
   * - 'unhealthy': 0 tools present (but system is active)
   * - 'inactive': Not active (no Intune and no health tools)
   */
  private calculateSystemHealth(snapshot: DailySnapshot, referenceDate: Date): 'fully' | 'partially' | 'unhealthy' | 'inactive' {
    // First check if system is active (Intune OR health tools present)
    if (!this.isSystemActive(snapshot, referenceDate)) {
      return 'inactive';
    }

    // Count health tools using "true state" logic with grace period
    // Tool counts if it either:
    // 1. Checked in today (found = 1), OR
    // 2. Checked in within grace period (lagDays <= HEALTH_GRACE_PERIOD_DAYS)
    const healthTools = [
      snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    ].filter(Boolean).length;

    if (healthTools === 3) {
      return 'fully'; // Fully healthy: All 3 tools
    } else if (healthTools >= 1) {
      return 'partially'; // Partially healthy: 1-2 tools
    } else {
      return 'unhealthy'; // Unhealthy: In Intune but no tools
    }
  }

  /**
   * Calculate fractional health score for a system
   * Returns a score between 0 and 1 based on tool coverage
   * Uses grace period to provide "true state" health vs strict daily check-in
   * - 3/3 tools = 1.0 (100%)
   * - 2/3 tools = 0.667 (66.7%)
   * - 1/3 tools = 0.333 (33.3%)
   * - 0/3 tools = 0.0 (0%)
   * - Inactive = 0.0 (excluded from calculations)
   */
  private calculateHealthScore(snapshot: DailySnapshot, referenceDate: Date): number {
    // First check if system is active in Intune
    if (!this.isSystemActive(snapshot, referenceDate)) {
      return 0; // Inactive systems don't contribute to health score
    }

    // Count health tools using "true state" logic with grace period
    // Tool counts if it either:
    // 1. Checked in today (found = 1), OR
    // 2. Checked in within grace period (lagDays <= HEALTH_GRACE_PERIOD_DAYS)
    const healthTools = [
      snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    ].filter(Boolean).length;

    // Return fractional score
    return healthTools / 3;
  }

  async findAll(search?: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const whereCondition = search
      ? [
          { shortname: Like(`%${search}%`) },
          { fullname: Like(`%${search}%`) },
        ]
      : {};

    const [systems, total] = await this.systemRepository.findAndCount({
      where: whereCondition,
      skip,
      take: limit,
      order: { shortname: 'ASC' },
    });

    return {
      data: systems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(shortname: string) {
    const system = await this.systemRepository.findOne({
      where: { shortname },
    });

    if (!system) {
      throw new NotFoundException(`System with shortname '${shortname}' not found`);
    }

    return system;
  }

  async getHistory(shortname: string, startDate?: Date, endDate?: Date) {
    const system = await this.findOne(shortname);

    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.shortname = :shortname', { shortname });

    if (startDate) {
      queryBuilder.andWhere('snapshot.importDate >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('snapshot.importDate <= :endDate', { endDate });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.importDate', 'DESC')
      .getMany();

    return {
      system,
      snapshots,
    };
  }

  async getCalendarData(shortname: string, year?: number, month?: number) {
    const system = await this.findOne(shortname);

    const currentYear = year || new Date().getFullYear();
    const currentMonth = month !== undefined ? month : new Date().getMonth();

    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);

    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.shortname = :shortname', { shortname })
      .andWhere('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .orderBy('snapshot.importDate', 'ASC')
      .getMany();

    // Transform data for calendar heatmap (VMware excluded from health tools)
    const calendarData = snapshots.map((snapshot) => ({
      date: snapshot.importDate,
      tools: {
        r7: snapshot.r7Found,
        am: snapshot.amFound,
        df: snapshot.dfFound,
        it: snapshot.itFound,
      },
      recentScans: {
        r7: snapshot.recentR7Scan,
        am: snapshot.recentAMScan,
        df: snapshot.recentDFScan,
        it: snapshot.recentITScan,
      },
      lagDays: {
        r7: snapshot.r7LagDays,
        am: snapshot.amLagDays,
        df: snapshot.dfLagDays,
        it: snapshot.itLagDays,
      },
      criticals: snapshot.numCriticals,
      seenRecently: snapshot.seenRecently,
    }));

    return {
      system,
      year: currentYear,
      month: currentMonth,
      data: calendarData,
    };
  }

  async getStats() {
    const totalSystems = await this.systemRepository.count();
    
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    const latestSnapshots = latestImportDate?.maxDate
      ? await this.snapshotRepository.count({
          where: { importDate: latestImportDate.maxDate },
        })
      : 0;

    return {
      totalSystems,
      latestImportDate: latestImportDate?.maxDate || null,
      latestSnapshotCount: latestSnapshots,
    };
  }

  async getNewSystemsToday(env?: string) {
    // Get the latest import date from the database (not current date)
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestImportDate?.maxDate) {
      return {
        count: 0,
        systems: [],
        date: null,
      };
    }

    // Use the latest import date as "today"
    const today = new Date(latestImportDate.maxDate);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find systems that appeared in snapshots for the first time on the latest import date
    // Get all shortnames that have snapshots on the latest import date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :tomorrow', { tomorrow });
    
    // Apply environment filter if provided
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }
    
    const systemsWithSnapshotsToday = await queryBuilder.getRawMany();

    if (systemsWithSnapshotsToday.length === 0) {
      return {
        count: 0,
        systems: [],
        date: today,
      };
    }

    const shortnamesWithSnapshotsToday = systemsWithSnapshotsToday.map(s => s.shortname);

    // For each system, check if it had any snapshots before the latest import date
    const newSystems = [];
    for (const shortname of shortnamesWithSnapshotsToday) {
      const previousSnapshot = await this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate < :today', { today })
        .limit(1)
        .getOne();

      // If no previous snapshot exists, this is a new system (first appearance)
      if (!previousSnapshot) {
        const system = await this.systemRepository.findOne({
          where: { shortname },
        });
        if (system) {
          newSystems.push(system);
        }
      }
    }

    return {
      count: newSystems.length,
      systems: newSystems,
      date: today,
    };
  }

  async getMissingSystems(daysThreshold: number = 7, env?: string) {
    // Get the latest import date (today's snapshot)
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestImportDate?.maxDate) {
      return {
        count: 0,
        systems: [],
        latestImportDate: null,
        daysThreshold,
      };
    }

    const today = new Date(latestImportDate.maxDate);
    today.setHours(0, 0, 0, 0);

    // Get all systems from the systems table (filtered by environment if provided)
    const systemsQueryBuilder = this.systemRepository.createQueryBuilder('system');
    if (env) {
      systemsQueryBuilder.where('system.env = :env', { env });
    }
    const allSystems = await systemsQueryBuilder.getMany();

    // Find systems that are in today's snapshot
    const todayQueryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('DATE(snapshot.importDate) = DATE(:today)', { today });
    
    if (env) {
      todayQueryBuilder.andWhere('snapshot.env = :env', { env });
    }
    
    const systemsInToday = await todayQueryBuilder.getRawMany();

    const todayShortnames = new Set(systemsInToday.map((s) => s.shortname));

    // Filter systems that are NOT in today's snapshot
    const missingSystems = allSystems.filter(
      (system) => !todayShortnames.has(system.shortname)
    );

    if (missingSystems.length === 0) {
      return {
        count: 0,
        systems: [],
        latestImportDate: latestImportDate.maxDate,
        daysThreshold,
      };
    }

    // Get the last seen date for each missing system
    const missingSystemsWithLastSeen = await Promise.all(
      missingSystems.map(async (system) => {
        const lastSnapshot = await this.snapshotRepository
          .createQueryBuilder('snapshot')
          .where('snapshot.shortname = :shortname', { shortname: system.shortname })
          .orderBy('snapshot.importDate', 'DESC')
          .limit(1)
          .getOne();

        return {
          ...system,
          lastSeenDate: lastSnapshot?.importDate || null,
          daysSinceLastSeen: lastSnapshot?.importDate
            ? Math.floor(
                (today.getTime() - new Date(lastSnapshot.importDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : null,
        };
      })
    );

    // Sort by shortname
    missingSystemsWithLastSeen.sort((a, b) => a.shortname.localeCompare(b.shortname));

    return {
      count: missingSystemsWithLastSeen.length,
      systems: missingSystemsWithLastSeen,
      latestImportDate: latestImportDate.maxDate,
      daysThreshold,
    };
  }

  async getHealthTrending(days: number = 30, env?: string) {
    // Get the date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get all snapshots in the date range, grouped by date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)'); // Exclude fake systems

    // Apply environment filter if provided
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.importDate', 'ASC')
      .getMany();

    console.log(`[HealthTrending] Environment: ${env || 'all'}, Snapshots found: ${snapshots.length}`);
    
    if (snapshots.length === 0) {
      return {
        dateRange: { startDate, endDate, days },
        trendData: [],
        summary: {
          totalSystemsNow: 0,
          totalSystemsStart: 0,
          healthImprovement: 0,
          newSystemsDiscovered: 0,
          systemsLostHealth: 0,
          systemsGainedHealth: 0,
        },
      };
    }

    // Group snapshots by date
    const snapshotsByDate = new Map<string, typeof snapshots>();
    snapshots.forEach((snapshot) => {
      // Handle both Date objects and string dates
      const date = snapshot.importDate instanceof Date
        ? snapshot.importDate
        : new Date(snapshot.importDate);
      const dateKey = date.toISOString().split('T')[0];
      if (!snapshotsByDate.has(dateKey)) {
        snapshotsByDate.set(dateKey, []);
      }
      snapshotsByDate.get(dateKey)!.push(snapshot);
    });

    console.log(`[HealthTrending] Grouped into ${snapshotsByDate.size} unique dates`);
    console.log(`[HealthTrending] Date keys:`, Array.from(snapshotsByDate.keys()));

    // Calculate daily metrics
    const trendData = [];
    const dates = Array.from(snapshotsByDate.keys()).sort();
    
    // Track system health status over time
    const systemHealthHistory = new Map<string, { firstSeen: string; health: Map<string, boolean> }>();

    for (const date of dates) {
      const daySnapshots = snapshotsByDate.get(date)!;
      
      // Group by shortname to get only the latest snapshot per system per day
      const latestSnapshotPerSystem = new Map<string, typeof daySnapshots[0]>();
      daySnapshots.forEach((snapshot) => {
        const existing = latestSnapshotPerSystem.get(snapshot.shortname);
        if (!existing || snapshot.id > existing.id) {
          latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
        }
      });

      // Calculate health metrics for this day using unique systems only
      let fullyHealthy = 0; // All 3 tools (R7 + AM + DF) + active Intune
      let partiallyHealthy = 0; // 1-2 tools + active Intune
      let unhealthy = 0; // 0 tools but active Intune
      let inactive = 0; // Not in Intune or Intune lag > 15 days
      let newSystems = 0;
      let existingSystems = 0;
      let totalHealthPoints = 0; // Sum of fractional health scores

      // Track tool-specific health (VMware excluded)
      const toolHealth = {
        r7: 0,
        am: 0,
        df: 0,
        it: 0,
      };

      const referenceDate = new Date(date);

      latestSnapshotPerSystem.forEach((snapshot) => {
        const shortname = snapshot.shortname;
        
        // Calculate health status using helper function
        const healthStatus = this.calculateSystemHealth(snapshot, referenceDate);
        
        // Calculate fractional health score
        const healthScore = this.calculateHealthScore(snapshot, referenceDate);
        
        // Categorize health level
        if (healthStatus === 'fully') {
          fullyHealthy++;
        } else if (healthStatus === 'partially') {
          partiallyHealthy++;
        } else if (healthStatus === 'unhealthy') {
          unhealthy++;
        } else if (healthStatus === 'inactive') {
          inactive++;
        }

        // Add to total health points (only for active systems)
        if (healthStatus !== 'inactive') {
          totalHealthPoints += healthScore;
        }

        // Track tool-specific health (only for active systems)
        if (healthStatus !== 'inactive') {
          if (snapshot.r7Found) toolHealth.r7++;
          if (snapshot.amFound) toolHealth.am++;
          if (snapshot.dfFound) toolHealth.df++;
          if (snapshot.itFound) toolHealth.it++;
        }

        // Track if this is a new system
        if (!systemHealthHistory.has(shortname)) {
          newSystems++;
          systemHealthHistory.set(shortname, {
            firstSeen: date,
            health: new Map([
              ['r7', snapshot.r7Found === 1],
              ['am', snapshot.amFound === 1],
              ['df', snapshot.dfFound === 1],
              ['it', snapshot.itFound === 1],
            ]),
          });
        } else {
          existingSystems++;
          // Update health status
          const history = systemHealthHistory.get(shortname)!;
          history.health.set('r7', snapshot.r7Found === 1);
          history.health.set('am', snapshot.amFound === 1);
          history.health.set('df', snapshot.dfFound === 1);
          history.health.set('it', snapshot.itFound === 1);
        }
      });

      // Total active systems (exclude inactive)
      const activeSystems = fullyHealthy + partiallyHealthy + unhealthy;
      const totalSystems = latestSnapshotPerSystem.size;
      
      // Health rate using fractional scoring: (total health points / active systems) * 100
      const healthRate = activeSystems > 0
        ? (totalHealthPoints / activeSystems) * 100
        : 0;

      trendData.push({
        date,
        totalSystems,
        activeSystems,
        fullyHealthy,
        partiallyHealthy,
        unhealthy,
        inactive,
        newSystems,
        existingSystems,
        healthRate: Math.round(healthRate * 100) / 100,
        toolHealth,
      });
    }

    // Calculate summary metrics
    const firstDay = trendData[0];
    const lastDay = trendData[trendData.length - 1];
    
    // Calculate systems that gained or lost health (comparing first to last day of period)
    let systemsGainedHealth = 0;
    let systemsLostHealth = 0;

    if (trendData.length >= 2) {
      const firstDaySnapshots = snapshotsByDate.get(dates[0])!;
      const lastDaySnapshots = snapshotsByDate.get(dates[dates.length - 1])!;
      
      // Get latest snapshot per system for first day
      const firstDayLatest = new Map<string, typeof firstDaySnapshots[0]>();
      firstDaySnapshots.forEach((s) => {
        const existing = firstDayLatest.get(s.shortname);
        if (!existing || s.id > existing.id) {
          firstDayLatest.set(s.shortname, s);
        }
      });

      // Get latest snapshot per system for last day
      const lastDayLatest = new Map<string, typeof lastDaySnapshots[0]>();
      lastDaySnapshots.forEach((s) => {
        const existing = lastDayLatest.get(s.shortname);
        if (!existing || s.id > existing.id) {
          lastDayLatest.set(s.shortname, s);
        }
      });
      
      const firstDayHealth = new Map<string, number>();
      const firstDateRef = new Date(dates[0]);
      firstDayLatest.forEach((s) => {
        const healthScore = this.calculateHealthScore(s, firstDateRef);
        firstDayHealth.set(s.shortname, healthScore);
      });

      const lastDateRef = new Date(dates[dates.length - 1]);
      lastDayLatest.forEach((s) => {
        const healthScore = this.calculateHealthScore(s, lastDateRef);
        const previousScore = firstDayHealth.get(s.shortname);
        
        if (previousScore !== undefined) {
          if (healthScore > previousScore) {
            systemsGainedHealth++;
          } else if (healthScore < previousScore) {
            systemsLostHealth++;
          }
        }
      });
    }

    // Calculate day-over-day comparison (yesterday vs today)
    let dayOverDay = null;
    if (trendData.length >= 2) {
      const yesterday = trendData[trendData.length - 2];
      const today = trendData[trendData.length - 1];
      
      dayOverDay = {
        healthRateChange: Math.round((today.healthRate - yesterday.healthRate) * 100) / 100,
        systemsChange: today.totalSystems - yesterday.totalSystems,
        fullyHealthyChange: today.fullyHealthy - yesterday.fullyHealthy,
        partiallyHealthyChange: today.partiallyHealthy - yesterday.partiallyHealthy,
        unhealthyChange: today.unhealthy - yesterday.unhealthy,
        inactiveChange: today.inactive - yesterday.inactive,
      };
    }

    // Calculate week-over-week comparison (7 days ago vs today)
    let weekOverWeek = null;
    if (trendData.length >= 8) {
      const weekAgo = trendData[trendData.length - 8];
      const today = trendData[trendData.length - 1];
      
      weekOverWeek = {
        healthRateChange: Math.round((today.healthRate - weekAgo.healthRate) * 100) / 100,
        systemsChange: today.totalSystems - weekAgo.totalSystems,
        fullyHealthyChange: today.fullyHealthy - weekAgo.fullyHealthy,
        partiallyHealthyChange: today.partiallyHealthy - weekAgo.partiallyHealthy,
        unhealthyChange: today.unhealthy - weekAgo.unhealthy,
        inactiveChange: today.inactive - weekAgo.inactive,
      };
    }

    // Calculate tool-specific trends
    const toolTrends = {
      r7: this.calculateToolTrend(trendData, 'r7'),
      am: this.calculateToolTrend(trendData, 'am'),
      df: this.calculateToolTrend(trendData, 'df'),
      it: this.calculateToolTrend(trendData, 'it'),
    };

    // Calculate metrics for systems online 5 days straight
    const lastDateStr = dates[dates.length - 1];
    const fiveDayActiveMetrics = await this.calculateConsecutiveActiveMetrics(
      lastDateStr,
      5,
      env
    );

    // Calculate health improvement for 5-day active systems
    const fiveDayHealthImprovement = await this.calculateConsecutiveActiveHealthImprovement(
      new Date(lastDateStr),
      5,
      env
    );

    const summary = {
      totalSystemsNow: lastDay.totalSystems,
      totalSystemsStart: firstDay.totalSystems,
      healthImprovement: Math.round((lastDay.healthRate - firstDay.healthRate) * 100) / 100,
      newSystemsDiscovered: lastDay.totalSystems - firstDay.totalSystems,
      systemsLostHealth,
      systemsGainedHealth,
      dayOverDay,
      weekOverWeek,
      toolTrends,
      fiveDayActive: {
        metrics: fiveDayActiveMetrics,
        healthImprovement: fiveDayHealthImprovement,
      },
    };

    return {
      dateRange: { startDate, endDate, days },
      trendData,
      summary,
    };
  }

  /**
   * Check if a system has been consecutively active for the specified number of days
   * Returns true if the system appears in snapshots for all consecutive days
   */
  private async isConsecutivelyActive(
    shortname: string,
    endDate: Date,
    consecutiveDays: number,
    env?: string
  ): Promise<boolean> {
    const dates = [];
    for (let i = 0; i < consecutiveDays; i++) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      dates.push(date);
    }

    // Check if system has snapshots for all consecutive days
    for (const date of dates) {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const queryBuilder = this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate >= :date', { date })
        .andWhere('snapshot.importDate < :nextDay', { nextDay })
        .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

      if (env) {
        queryBuilder.andWhere('snapshot.env = :env', { env });
      }

      const snapshot = await queryBuilder.getOne();
      
      // If no snapshot for this day, or system is inactive, return false
      if (!snapshot || !this.isSystemActive(snapshot, date)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate metrics for systems that have been online consecutively for specified days
   */
  private async calculateConsecutiveActiveMetrics(
    date: string,
    consecutiveDays: number,
    env?: string
  ) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all systems for this date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :targetDate', { targetDate })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder.getMany();

    // Get unique systems
    const latestSnapshotPerSystem = new Map<string, typeof snapshots[0]>();
    snapshots.forEach((snapshot) => {
      const existing = latestSnapshotPerSystem.get(snapshot.shortname);
      if (!existing || snapshot.id > existing.id) {
        latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
      }
    });

    // Filter to only systems that have been consecutively active
    const consecutiveActiveSystems = [];
    for (const [shortname, snapshot] of latestSnapshotPerSystem.entries()) {
      const isConsecutive = await this.isConsecutivelyActive(
        shortname,
        targetDate,
        consecutiveDays,
        env
      );
      if (isConsecutive) {
        consecutiveActiveSystems.push(snapshot);
      }
    }

    // Calculate health metrics for these systems
    let fullyHealthy = 0;
    let partiallyHealthy = 0;
    let unhealthy = 0;
    let totalHealthPoints = 0;

    const toolHealth = {
      r7: 0,
      am: 0,
      df: 0,
      it: 0,
    };

    consecutiveActiveSystems.forEach((snapshot) => {
      const healthStatus = this.calculateSystemHealth(snapshot, targetDate);
      const healthScore = this.calculateHealthScore(snapshot, targetDate);

      if (healthStatus === 'fully') {
        fullyHealthy++;
      } else if (healthStatus === 'partially') {
        partiallyHealthy++;
      } else if (healthStatus === 'unhealthy') {
        unhealthy++;
      }

      if (healthStatus !== 'inactive') {
        totalHealthPoints += healthScore;
        if (snapshot.r7Found) toolHealth.r7++;
        if (snapshot.amFound) toolHealth.am++;
        if (snapshot.dfFound) toolHealth.df++;
        if (snapshot.itFound) toolHealth.it++;
      }
    });

    const totalSystems = consecutiveActiveSystems.length;
    const healthRate = totalSystems > 0 ? (totalHealthPoints / totalSystems) * 100 : 0;

    return {
      totalSystems,
      fullyHealthy,
      partiallyHealthy,
      unhealthy,
      healthRate: Math.round(healthRate * 100) / 100,
      toolHealth,
    };
  }

  /**
   * Calculate health improvement for systems that have been consecutively active
   */
  private async calculateConsecutiveActiveHealthImprovement(
    endDate: Date,
    consecutiveDays: number,
    env?: string
  ) {
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (consecutiveDays - 1));
    startDate.setHours(0, 0, 0, 0);

    const endDateCopy = new Date(endDate);
    endDateCopy.setHours(0, 0, 0, 0);

    // Get systems that have been consecutively active
    const endNextDay = new Date(endDateCopy);
    endNextDay.setDate(endNextDay.getDate() + 1);

    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :endDate', { endDate: endDateCopy })
      .andWhere('snapshot.importDate < :endNextDay', { endNextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const endSnapshots = await queryBuilder.getMany();

    const latestSnapshotPerSystem = new Map<string, typeof endSnapshots[0]>();
    endSnapshots.forEach((snapshot) => {
      const existing = latestSnapshotPerSystem.get(snapshot.shortname);
      if (!existing || snapshot.id > existing.id) {
        latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
      }
    });

    // Filter to consecutively active systems
    const consecutiveActiveSystems = [];
    for (const [shortname] of latestSnapshotPerSystem.entries()) {
      const isConsecutive = await this.isConsecutivelyActive(
        shortname,
        endDateCopy,
        consecutiveDays,
        env
      );
      if (isConsecutive) {
        consecutiveActiveSystems.push(shortname);
      }
    }

    if (consecutiveActiveSystems.length === 0) {
      return {
        totalSystems: 0,
        systemsImproved: 0,
        systemsDegraded: 0,
        systemsStable: 0,
        averageImprovement: 0,
      };
    }

    // Compare health scores from start to end
    let systemsImproved = 0;
    let systemsDegraded = 0;
    let systemsStable = 0;
    let totalImprovement = 0;

    for (const shortname of consecutiveActiveSystems) {
      // Get start snapshot
      const startNextDay = new Date(startDate);
      startNextDay.setDate(startNextDay.getDate() + 1);

      const startQueryBuilder = this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate >= :startDate', { startDate })
        .andWhere('snapshot.importDate < :startNextDay', { startNextDay })
        .orderBy('snapshot.id', 'DESC');

      if (env) {
        startQueryBuilder.andWhere('snapshot.env = :env', { env });
      }

      const startSnapshot = await startQueryBuilder.getOne();

      // Get end snapshot
      const endQueryBuilder = this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate >= :endDate', { endDate: endDateCopy })
        .andWhere('snapshot.importDate < :endNextDay', { endNextDay })
        .orderBy('snapshot.id', 'DESC');

      if (env) {
        endQueryBuilder.andWhere('snapshot.env = :env', { env });
      }

      const endSnapshot = await endQueryBuilder.getOne();

      if (startSnapshot && endSnapshot) {
        const startScore = this.calculateHealthScore(startSnapshot, startDate);
        const endScore = this.calculateHealthScore(endSnapshot, endDateCopy);
        const improvement = endScore - startScore;

        totalImprovement += improvement;

        if (improvement > 0) {
          systemsImproved++;
        } else if (improvement < 0) {
          systemsDegraded++;
        } else {
          systemsStable++;
        }
      }
    }

    const averageImprovement = consecutiveActiveSystems.length > 0
      ? totalImprovement / consecutiveActiveSystems.length
      : 0;

    return {
      totalSystems: consecutiveActiveSystems.length,
      systemsImproved,
      systemsDegraded,
      systemsStable,
      averageImprovement: Math.round(averageImprovement * 10000) / 10000,
    };
  }

  /**
   * Calculate trend for a specific tool
   */
  private calculateToolTrend(trendData: any[], tool: 'r7' | 'am' | 'df' | 'it') {
    if (trendData.length === 0) {
      return { current: 0, change: 0, changePercent: 0, trend: 'stable' as const };
    }

    const lastDay = trendData[trendData.length - 1];
    const current = lastDay.toolHealth[tool];

    if (trendData.length < 2) {
      return { current, change: 0, changePercent: 0, trend: 'stable' as const };
    }

    const firstDay = trendData[0];
    const previous = firstDay.toolHealth[tool];
    const change = current - previous;
    
    // Fix percentage calculation - cap at reasonable values
    let changePercent = 0;
    if (previous > 0) {
      changePercent = Math.round((change / previous) * 10000) / 100;
      // Cap percentage at +/-100% for display purposes
      changePercent = Math.max(-100, Math.min(100, changePercent));
    } else if (change > 0) {
      // If previous was 0 and now we have systems, show as 100% increase
      changePercent = 100;
    }

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (change > 0) trend = 'up';
    else if (change < 0) trend = 'down';

    return { current, change, changePercent, trend };
  }

  /**
   * Get healthy systems (fully or partially healthy) for CSV export
   */
  async getHealthySystemsForExport(env?: string) {
    // Get the latest import date
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestImportDate?.maxDate) {
      return [];
    }

    const today = new Date(latestImportDate.maxDate);
    today.setHours(0, 0, 0, 0);

    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all snapshots for the latest date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.shortname', 'ASC')
      .getMany();

    // Get only the latest snapshot per system
    const latestSnapshotPerSystem = new Map<string, typeof snapshots[0]>();
    snapshots.forEach((snapshot) => {
      const existing = latestSnapshotPerSystem.get(snapshot.shortname);
      if (!existing || snapshot.id > existing.id) {
        latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
      }
    });

    // Filter to healthy systems (fully or partially healthy)
    const healthySystems = Array.from(latestSnapshotPerSystem.values())
      .filter((snapshot) => {
        const healthStatus = this.calculateSystemHealth(snapshot, today);
        return healthStatus === 'fully' || healthStatus === 'partially';
      })
      .map((snapshot) => ({
        shortname: snapshot.shortname,
      }));

    return healthySystems;
  }

  /**
   * Get unhealthy systems (unhealthy or inactive) for CSV export
   */
  async getUnhealthySystemsForExport(env?: string) {
    // Get the latest import date
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestImportDate?.maxDate) {
      return [];
    }

    const today = new Date(latestImportDate.maxDate);
    today.setHours(0, 0, 0, 0);

    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all snapshots for the latest date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.shortname', 'ASC')
      .getMany();

    // Get only the latest snapshot per system
    const latestSnapshotPerSystem = new Map<string, typeof snapshots[0]>();
    snapshots.forEach((snapshot) => {
      const existing = latestSnapshotPerSystem.get(snapshot.shortname);
      if (!existing || snapshot.id > existing.id) {
        latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
      }
    });

    // Filter to unhealthy systems (unhealthy or inactive)
    const unhealthySystems = Array.from(latestSnapshotPerSystem.values())
      .filter((snapshot) => {
        const healthStatus = this.calculateSystemHealth(snapshot, today);
        return healthStatus === 'unhealthy' || healthStatus === 'inactive';
      })
      .map((snapshot) => ({
        shortname: snapshot.shortname,
      }));

    return unhealthySystems;
  }

  async getSystemsByHealthCategory(date: string, category: 'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new', env?: string) {
    // Parse the date and set to start of day
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all snapshots for the target date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .where('snapshot.importDate >= :targetDate', { targetDate })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)'); // Exclude fake systems

    // Apply environment filter if provided
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.shortname', 'ASC')
      .getMany();

    if (snapshots.length === 0) {
      return {
        date: targetDate,
        category,
        count: 0,
        systems: [],
      };
    }

    // Get only the latest snapshot per system for this day
    const latestSnapshotPerSystem = new Map<string, typeof snapshots[0]>();
    snapshots.forEach((snapshot) => {
      const existing = latestSnapshotPerSystem.get(snapshot.shortname);
      if (!existing || snapshot.id > existing.id) {
        latestSnapshotPerSystem.set(snapshot.shortname, snapshot);
      }
    });

    // For "new" category, we need to check if systems appeared for the first time
    let filteredSnapshots: typeof snapshots = [];
    
    if (category === 'new') {
      // Check each system to see if it's new (no snapshots before this date)
      for (const [shortname, snapshot] of latestSnapshotPerSystem.entries()) {
        const previousSnapshot = await this.snapshotRepository
          .createQueryBuilder('snapshot')
          .where('snapshot.shortname = :shortname', { shortname })
          .andWhere('snapshot.importDate < :targetDate', { targetDate })
          .limit(1)
          .getOne();

        if (!previousSnapshot) {
          filteredSnapshots.push(snapshot);
        }
      }
    } else {
      // Filter by health category using helper function
      filteredSnapshots = Array.from(latestSnapshotPerSystem.values()).filter((snapshot) => {
        const healthStatus = this.calculateSystemHealth(snapshot, targetDate);
        return healthStatus === category;
      });
    }

    // Transform snapshots to include system details and tool health
    const systemsWithDetails = filteredSnapshots.map((snapshot) => {
      const healthStatus = this.calculateSystemHealth(snapshot, targetDate);
      
      // Build tools reporting list (VMware excluded from health)
      const toolsReporting = [];
      if (snapshot.r7Found) toolsReporting.push('Rapid7');
      if (snapshot.amFound) toolsReporting.push('Automox');
      if (snapshot.dfFound) toolsReporting.push('Defender');
      if (snapshot.itFound) toolsReporting.push('Intune');

      // Count health tools only (R7, AM, DF)
      const healthToolsCount = [
        snapshot.r7Found,
        snapshot.amFound,
        snapshot.dfFound,
      ].filter(Boolean).length;

      // Determine health level label
      let healthLevel = 'Inactive';
      if (healthStatus === 'fully') {
        healthLevel = 'Fully Healthy';
      } else if (healthStatus === 'partially') {
        healthLevel = 'Partially Healthy';
      } else if (healthStatus === 'unhealthy') {
        healthLevel = 'Unhealthy';
      }

      return {
        shortname: snapshot.shortname,
        fullname: snapshot.fullname,
        env: snapshot.env,
        toolsReporting,
        healthToolsCount,
        healthLevel,
        toolStatus: {
          r7: snapshot.r7Found,
          am: snapshot.amFound,
          df: snapshot.dfFound,
          it: snapshot.itFound,
        },
        lagDays: {
          r7: snapshot.r7LagDays,
          am: snapshot.amLagDays,
          df: snapshot.dfLagDays,
          it: snapshot.itLagDays,
        },
      };
    });

    // Sort by shortname
    systemsWithDetails.sort((a, b) => a.shortname.localeCompare(b.shortname));

    return {
      date: targetDate,
      category,
      count: systemsWithDetails.length,
      systems: systemsWithDetails,
    };
  }

  async getEnvironments() {
    // Get distinct environments from daily_snapshots table
    const environments = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.env', 'env')
      .where('snapshot.env IS NOT NULL')
      .andWhere('snapshot.env != :empty', { empty: '' })
      .orderBy('snapshot.env', 'ASC')
      .getRawMany();

    return {
      environments: environments.map(e => e.env).filter(Boolean),
    };
  }

  async getReappearedSystems(env?: string) {
    // Get the latest import date
    const latestImportDate = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .getRawOne();

    if (!latestImportDate?.maxDate) {
      return {
        count: 0,
        systems: [],
        date: null,
      };
    }

    const today = new Date(latestImportDate.maxDate);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all systems in today's snapshot
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :tomorrow', { tomorrow })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)');
    
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }
    
    const systemsToday = await queryBuilder.getRawMany();

    const reappearedSystems = [];

    // For each system in today's snapshot
    for (const sys of systemsToday) {
      const shortname = sys.shortname;

      // Get the most recent snapshot before today
      const previousSnapshot = await this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate < :today', { today })
        .orderBy('snapshot.importDate', 'DESC')
        .limit(1)
        .getOne();

      // If there was a previous snapshot
      if (previousSnapshot) {
        const daysSinceLastSeen = Math.floor(
          (today.getTime() - new Date(previousSnapshot.importDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        // If system was inactive (15+ days) and now reappeared
        if (daysSinceLastSeen > this.INTUNE_INACTIVE_DAYS) {
          const system = await this.systemRepository.findOne({ where: { shortname } });
          if (system) {
            reappearedSystems.push({
              ...system,
              daysSinceLastSeen,
              lastSeenDate: previousSnapshot.importDate,
            });
          }
        }
      }
    }

    return {
      count: reappearedSystems.length,
      systems: reappearedSystems,
      date: today,
    };
  }
}
