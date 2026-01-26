import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class SystemsService {
  // Intune inactivity threshold in days
  private readonly INTUNE_INACTIVE_DAYS = 15;

  constructor(
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

  /**
   * Check if a system is active based on Intune presence
   * A system is active if it has been seen in Intune within the last 15 days
   */
  private isSystemActive(snapshot: DailySnapshot, referenceDate: Date): boolean {
    if (!snapshot.itFound) {
      return false; // Not in Intune = inactive
    }

    // Check if Intune lag days is within threshold
    if (snapshot.itLagDays !== null && snapshot.itLagDays !== undefined) {
      return snapshot.itLagDays <= this.INTUNE_INACTIVE_DAYS;
    }

    // If no lag data, assume active if found in Intune
    return true;
  }

  /**
   * Calculate health status for a system
   * Health is based on: Rapid7, Automox, and Defender (VMware excluded)
   * System must be active in Intune (last 15 days) to be considered
   *
   * Returns:
   * - 'fully': All 3 tools (R7 + AM + DF) present
   * - 'partially': 1-2 tools present
   * - 'unhealthy': 0 tools present (but in Intune)
   * - 'inactive': Not in Intune or Intune lag > 15 days
   */
  private calculateSystemHealth(snapshot: DailySnapshot, referenceDate: Date): 'fully' | 'partially' | 'unhealthy' | 'inactive' {
    // First check if system is active in Intune
    if (!this.isSystemActive(snapshot, referenceDate)) {
      return 'inactive';
    }

    // Count health tools (R7, AM, DF - VMware excluded)
    const healthTools = [
      snapshot.r7Found,
      snapshot.amFound,
      snapshot.dfFound,
    ].filter(Boolean).length;

    if (healthTools === 3) {
      return 'fully'; // Fully healthy: All 3 tools
    } else if (healthTools >= 1) {
      return 'partially'; // Partially healthy: 1-2 tools
    } else {
      return 'unhealthy'; // Unhealthy: In Intune but no tools
    }
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

  async getNewSystemsToday() {
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
    const systemsWithSnapshotsToday = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :tomorrow', { tomorrow })
      .getRawMany();

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

  async getMissingSystems(daysThreshold: number = 7) {
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

    // Get all systems from the systems table
    const allSystems = await this.systemRepository.find();

    // Find systems that are in today's snapshot
    const systemsInToday = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('DATE(snapshot.importDate) = DATE(:today)', { today })
      .getRawMany();

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
      .andWhere('snapshot.importDate <= :endDate', { endDate });

    // Apply environment filter if provided
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const snapshots = await queryBuilder
      .orderBy('snapshot.importDate', 'ASC')
      .getMany();

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
      
      // Health rate based on active systems only
      const healthRate = activeSystems > 0
        ? ((fullyHealthy + partiallyHealthy) / activeSystems) * 100
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
    
    // Calculate systems that gained or lost health
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
        const healthStatus = this.calculateSystemHealth(s, firstDateRef);
        // Convert health status to numeric score for comparison
        let score = 0;
        if (healthStatus === 'fully') score = 3;
        else if (healthStatus === 'partially') score = 2;
        else if (healthStatus === 'unhealthy') score = 1;
        else if (healthStatus === 'inactive') score = 0;
        firstDayHealth.set(s.shortname, score);
      });

      const lastDateRef = new Date(dates[dates.length - 1]);
      lastDayLatest.forEach((s) => {
        const healthStatus = this.calculateSystemHealth(s, lastDateRef);
        let score = 0;
        if (healthStatus === 'fully') score = 3;
        else if (healthStatus === 'partially') score = 2;
        else if (healthStatus === 'unhealthy') score = 1;
        else if (healthStatus === 'inactive') score = 0;
        
        const previousScore = firstDayHealth.get(s.shortname);
        
        if (previousScore !== undefined) {
          if (score > previousScore) {
            systemsGainedHealth++;
          } else if (score < previousScore) {
            systemsLostHealth++;
          }
        }
      });
    }

    const summary = {
      totalSystemsNow: lastDay.totalSystems,
      totalSystemsStart: firstDay.totalSystems,
      healthImprovement: Math.round((lastDay.healthRate - firstDay.healthRate) * 100) / 100,
      newSystemsDiscovered: lastDay.totalSystems - firstDay.totalSystems,
      systemsLostHealth,
      systemsGainedHealth,
    };

    return {
      dateRange: { startDate, endDate, days },
      trendData,
      summary,
    };
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
      .andWhere('snapshot.importDate < :nextDay', { nextDay });

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
}
