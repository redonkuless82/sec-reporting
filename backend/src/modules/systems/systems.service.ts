import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class SystemsService {
  private readonly logger = new Logger(SystemsService.name);

  // Intune inactivity threshold in days
  private readonly INTUNE_INACTIVE_DAYS = 15;
  
  // Health grace period - tools are considered healthy if seen within this many days
  // This provides "true state" health vs strict daily check-in tracking
  // Covers weekends and provides stable metrics while still detecting real issues
  private readonly HEALTH_GRACE_PERIOD_DAYS = 3;

  // In-memory cache for latest import date to avoid redundant MAX queries within short windows
  private cachedLatestImportDate: { date: Date | null; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  /**
   * Columns needed for health calculations in bulk queries.
   * Excludes heavy/unused columns like osBuildNumber, osName, ipPriv, ipPub, userEmail,
   * numCriticals, amLastUser, needsAMReboot, needsAMAttention, vmPowerState, dfID, itID,
   * scriptResult, createdAt, supportedOS.
   */
  private readonly HEALTH_CALC_SELECT = [
    'snapshot.id',
    'snapshot.shortname',
    'snapshot.importDate',
    'snapshot.env',
    'snapshot.fullname',
    'snapshot.r7Found',
    'snapshot.amFound',
    'snapshot.dfFound',
    'snapshot.itFound',
    'snapshot.vmFound',
    'snapshot.r7LagDays',
    'snapshot.amLagDays',
    'snapshot.dfLagDays',
    'snapshot.itLagDays',
    'snapshot.possibleFake',
    'snapshot.serverOS',
    'snapshot.osFamily',
    'snapshot.seenRecently',
    'snapshot.recentR7Scan',
    'snapshot.recentAMScan',
    'snapshot.recentDFScan',
    'snapshot.recentITScan',
  ];

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

  /**
   * Helper method for cached queries with graceful error handling.
   * If cache read/write fails, the method still returns fresh data.
   */
  private async getCachedOrFetch<T>(
    cacheKey: string,
    ttlMs: number,
    fetchFn: () => Promise<T>,
  ): Promise<T> {
    try {
      const cached = await this.cacheManager.get<T>(cacheKey);
      if (cached !== undefined && cached !== null) {
        this.logger.debug(`Cache hit: ${cacheKey}`);
        return cached;
      }
    } catch (e) {
      this.logger.warn(`Cache read failed for key ${cacheKey}: ${e.message}`);
    }

    const result = await fetchFn();

    try {
      await this.cacheManager.set(cacheKey, result, ttlMs);
      this.logger.debug(`Cache set: ${cacheKey} (TTL: ${ttlMs}ms)`);
    } catch (e) {
      this.logger.warn(`Cache write failed for key ${cacheKey}: ${e.message}`);
    }

    return result;
  }

  /**
   * Get the latest import date with short-lived in-memory cache.
   * Eliminates redundant MAX(importDate) queries when multiple methods
   * are called within the same request cycle.
   */
  async getLatestImportDate(): Promise<Date | null> {
    const now = Date.now();
    if (this.cachedLatestImportDate && (now - this.cachedLatestImportDate.timestamp) < this.CACHE_TTL_MS) {
      return this.cachedLatestImportDate.date;
    }

    const result = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('MAX(snapshot.importDate)', 'maxDate')
      .where('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' })
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' })
      .getRawOne();

    const date = result?.maxDate ? new Date(result.maxDate) : null;
    this.cachedLatestImportDate = { date, timestamp: now };
    return date;
  }

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

  async findAll(search?: string, page: number = 1, limit: number = 50, env?: string) {
    const skip = (page - 1) * limit;

    const queryBuilder = this.systemRepository.createQueryBuilder('system');

    if (search) {
      queryBuilder.where(
        '(system.shortname LIKE :search OR system.fullname LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (env) {
      if (search) {
        queryBuilder.andWhere('system.env = :env', { env });
      } else {
        queryBuilder.where('system.env = :env', { env });
      }
    }

    const [systems, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('system.shortname', 'ASC')
      .getManyAndCount();

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
      .where('snapshot.shortname = :shortname', { shortname })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems

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
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
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
    return this.getCachedOrFetch('system-stats', 900000, async () => {
      const totalSystems = await this.systemRepository.count();
      
      const latestDate = await this.getLatestImportDate();

      const latestSnapshots = latestDate
        ? await this.snapshotRepository
            .createQueryBuilder('snapshot')
            .where('snapshot.importDate = :importDate', { importDate: latestDate })
            .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
            .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
            .getCount()
        : 0;

      return {
        totalSystems,
        latestImportDate: latestDate,
        latestSnapshotCount: latestSnapshots,
      };
    });
  }

  async getNewSystemsToday(env?: string) {
    const cacheKey = `new-systems:${env || 'all'}`;
    return this.getCachedOrFetch(cacheKey, 900000, () => this.fetchNewSystemsToday(env));
  }

  private async fetchNewSystemsToday(env?: string) {
    // Get the latest import date from the database (not current date)
    const latestDate = await this.getLatestImportDate();

    if (!latestDate) {
      return {
        count: 0,
        systems: [],
        date: null,
      };
    }

    // Use the latest import date as "today"
    const today = new Date(latestDate);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find systems that appeared in snapshots for the first time on the latest import date
    // Get all shortnames that have snapshots on the latest import date
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :tomorrow', { tomorrow })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems
    
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

    const todayShortnames = systemsWithSnapshotsToday.map(s => s.shortname);

    if (todayShortnames.length === 0) {
      return { count: 0, systems: [], date: today };
    }

    // Bulk query: find which of today's systems have ANY previous snapshot before today
    // This replaces the N+1 loop that queried each system individually
    const systemsWithPreviousSnapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.shortname IN (:...shortnames)', { shortnames: todayShortnames })
      .andWhere('snapshot.importDate < :today', { today })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .getRawMany();

    const existingShortnames = new Set(systemsWithPreviousSnapshots.map(s => s.shortname));

    // New systems are those NOT in the existing set (no previous snapshots)
    const newShortnames = todayShortnames.filter(sn => !existingShortnames.has(sn));

    if (newShortnames.length === 0) {
      return { count: 0, systems: [], date: today };
    }

    // Bulk fetch system records for all new systems at once
    const newSystems = await this.systemRepository
      .createQueryBuilder('system')
      .where('system.shortname IN (:...shortnames)', { shortnames: newShortnames })
      .getMany();

    return {
      count: newSystems.length,
      systems: newSystems,
      date: today,
    };
  }

  async getMissingSystems(daysThreshold: number = 7, env?: string) {
    const cacheKey = `missing-systems:${daysThreshold}:${env || 'all'}`;
    return this.getCachedOrFetch(cacheKey, 900000, () => this.fetchMissingSystems(daysThreshold, env));
  }

  private async fetchMissingSystems(daysThreshold: number = 7, env?: string) {
    // Get the latest import date (today's snapshot)
    const latestDate = await this.getLatestImportDate();

    if (!latestDate) {
      return {
        count: 0,
        systems: [],
        latestImportDate: null,
        daysThreshold,
      };
    }

    const today = new Date(latestDate);
    today.setHours(0, 0, 0, 0);

    // Calculate start and end of day for range query (avoids DATE() function preventing index usage)
    const todayStartOfDay = new Date(today);
    todayStartOfDay.setHours(0, 0, 0, 0);
    const todayEndOfDay = new Date(today);
    todayEndOfDay.setHours(23, 59, 59, 999);

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
      .where('snapshot.importDate >= :todayStartOfDay', { todayStartOfDay })
      .andWhere('snapshot.importDate <= :todayEndOfDay', { todayEndOfDay })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems
    
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
        latestImportDate: latestDate,
        daysThreshold,
      };
    }

    // Bulk query: get the last seen date for ALL missing systems at once
    // This replaces the N+1 loop that queried each system individually
    const missingShortnames = missingSystems.map(s => s.shortname);

    const lastSeenResults = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.shortname', 'shortname')
      .addSelect('MAX(snapshot.importDate)', 'lastSeenDate')
      .where('snapshot.shortname IN (:...shortnames)', { shortnames: missingShortnames })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .groupBy('snapshot.shortname')
      .getRawMany();

    const lastSeenMap = new Map(lastSeenResults.map(r => [r.shortname, r.lastSeenDate]));

    const missingSystemsWithLastSeen = missingSystems.map(system => {
      const lastSeenDate = lastSeenMap.get(system.shortname) || null;
      return {
        ...system,
        lastSeenDate,
        daysSinceLastSeen: lastSeenDate
          ? Math.floor(
              (today.getTime() - new Date(lastSeenDate).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null,
      };
    });

    // Sort by shortname
    missingSystemsWithLastSeen.sort((a, b) => a.shortname.localeCompare(b.shortname));

    return {
      count: missingSystemsWithLastSeen.length,
      systems: missingSystemsWithLastSeen,
      latestImportDate: latestDate,
      daysThreshold,
    };
  }

  async getHealthTrending(days: number = 30, env?: string) {
    const cacheKey = `health-trending:${days}:${env || 'all'}`;
    return this.getCachedOrFetch(cacheKey, 900000, () => this.fetchHealthTrending(days, env));
  }

  private async fetchHealthTrending(days: number = 30, env?: string) {
    // Get the date range
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get all snapshots in the date range, grouped by date
    // Only select columns needed for health calculations to reduce data transfer (~70% reduction)
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate >= :startDate', { startDate })
      .andWhere('snapshot.importDate <= :endDate', { endDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)') // Exclude fake systems
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems

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
   * Bulk-fetch all snapshots in a consecutive-day window and determine which systems
   * were consecutively active for all days. Returns a Map of shortname -> Map<dateKey, latestSnapshot>.
   * Only systems that have an active snapshot on EVERY expected date are included.
   *
   * This replaces the per-system isConsecutivelyActive() N+1 pattern.
   * One query fetches all data; filtering happens in memory.
   */
  private async fetchWindowSnapshotsAndFilterConsecutiveActive(
    targetDate: Date,
    consecutiveDays: number,
    env?: string,
  ): Promise<{
    consecutiveSystemDateMaps: Map<string, Map<string, DailySnapshot>>;
    expectedDates: string[];
  }> {
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - (consecutiveDays - 1));
    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(targetDate);
    windowEnd.setHours(23, 59, 59, 999);

    // Fetch ALL snapshots in the consecutive-day window in ONE query
    // Only select columns needed for health calculations to reduce data transfer
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate >= :windowStart', { windowStart })
      .andWhere('snapshot.importDate <= :windowEnd', { windowEnd })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' })
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' });

    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }

    const allSnapshots = await queryBuilder.getMany();

    // Group snapshots by shortname and by date, keeping only the latest per system per day
    const snapshotsBySystem = new Map<string, Map<string, DailySnapshot>>();
    for (const snapshot of allSnapshots) {
      if (!snapshotsBySystem.has(snapshot.shortname)) {
        snapshotsBySystem.set(snapshot.shortname, new Map());
      }
      const dateKey = snapshot.importDate instanceof Date
        ? snapshot.importDate.toISOString().split('T')[0]
        : new Date(snapshot.importDate).toISOString().split('T')[0];

      const systemDates = snapshotsBySystem.get(snapshot.shortname)!;
      const existing = systemDates.get(dateKey);
      if (!existing || snapshot.id > existing.id) {
        systemDates.set(dateKey, snapshot);
      }
    }

    // Build the list of expected date keys
    const expectedDates: string[] = [];
    for (let i = 0; i < consecutiveDays; i++) {
      const d = new Date(targetDate);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      expectedDates.push(d.toISOString().split('T')[0]);
    }

    // Filter to systems that have an active snapshot for EVERY expected date
    const consecutiveSystemDateMaps = new Map<string, Map<string, DailySnapshot>>();

    for (const [shortname, dateMap] of snapshotsBySystem.entries()) {
      let isConsecutive = true;
      for (const expectedDate of expectedDates) {
        const snapshot = dateMap.get(expectedDate);
        if (!snapshot || !this.isSystemActive(snapshot, new Date(expectedDate))) {
          isConsecutive = false;
          break;
        }
      }
      if (isConsecutive) {
        consecutiveSystemDateMaps.set(shortname, dateMap);
      }
    }

    return { consecutiveSystemDateMaps, expectedDates };
  }

  /**
   * Calculate metrics for systems that have been online consecutively for specified days.
   * Uses bulk-fetch approach: ONE query for the entire window, then in-memory filtering.
   * Eliminates the N+1 pattern of calling isConsecutivelyActive() per system.
   */
  private async calculateConsecutiveActiveMetrics(
    date: string,
    consecutiveDays: number,
    env?: string
  ) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Bulk-fetch all snapshots in the window and filter to consecutively active systems
    const { consecutiveSystemDateMaps } =
      await this.fetchWindowSnapshotsAndFilterConsecutiveActive(targetDate, consecutiveDays, env);

    // For each consecutively active system, use the target date's snapshot for metrics
    const targetDateKey = targetDate.toISOString().split('T')[0];
    const consecutiveActiveSystems: DailySnapshot[] = [];

    for (const [, dateMap] of consecutiveSystemDateMaps.entries()) {
      const targetSnapshot = dateMap.get(targetDateKey);
      if (targetSnapshot) {
        consecutiveActiveSystems.push(targetSnapshot);
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
   * Calculate health improvement for systems that have been consecutively active.
   * Uses bulk-fetch approach: ONE query for the entire window, then in-memory comparison.
   * Start and end snapshots are extracted from the already-fetched data — no per-system queries.
   */
  private async calculateConsecutiveActiveHealthImprovement(
    endDate: Date,
    consecutiveDays: number,
    env?: string
  ) {
    const endDateCopy = new Date(endDate);
    endDateCopy.setHours(0, 0, 0, 0);

    const startDate = new Date(endDateCopy);
    startDate.setDate(startDate.getDate() - (consecutiveDays - 1));
    startDate.setHours(0, 0, 0, 0);

    // Bulk-fetch all snapshots in the window and filter to consecutively active systems
    const { consecutiveSystemDateMaps } =
      await this.fetchWindowSnapshotsAndFilterConsecutiveActive(endDateCopy, consecutiveDays, env);

    if (consecutiveSystemDateMaps.size === 0) {
      return {
        totalSystems: 0,
        systemsImproved: 0,
        systemsDegraded: 0,
        systemsStable: 0,
        averageImprovement: 0,
      };
    }

    const startDateKey = startDate.toISOString().split('T')[0];
    const endDateKey = endDateCopy.toISOString().split('T')[0];

    // Compare health scores from start to end using already-fetched data
    let systemsImproved = 0;
    let systemsDegraded = 0;
    let systemsStable = 0;
    let totalImprovement = 0;
    let comparedCount = 0;

    for (const [, dateMap] of consecutiveSystemDateMaps.entries()) {
      const startSnapshot = dateMap.get(startDateKey);
      const endSnapshot = dateMap.get(endDateKey);

      if (startSnapshot && endSnapshot) {
        const startScore = this.calculateHealthScore(startSnapshot, startDate);
        const endScore = this.calculateHealthScore(endSnapshot, endDateCopy);
        const improvement = endScore - startScore;

        totalImprovement += improvement;
        comparedCount++;

        if (improvement > 0) {
          systemsImproved++;
        } else if (improvement < 0) {
          systemsDegraded++;
        } else {
          systemsStable++;
        }
      }
    }

    const averageImprovement = comparedCount > 0
      ? totalImprovement / comparedCount
      : 0;

    return {
      totalSystems: consecutiveSystemDateMaps.size,
      systemsImproved,
      systemsDegraded,
      systemsStable,
      averageImprovement: Math.round(averageImprovement * 10000) / 10000,
    };
  }

  /**
   * Get detailed drill-down data for 5-day consecutive active systems.
   * Uses bulk-fetch approach: ONE query for the entire 5-day window.
   * All history data is extracted from the already-fetched snapshots — no per-system queries.
   */
  async getFiveDayActiveDrillDown(date: string, env?: string) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const startDate = new Date(targetDate);
    startDate.setDate(startDate.getDate() - 4); // 5 days total including target date
    startDate.setHours(0, 0, 0, 0);

    // Bulk-fetch all snapshots in the 5-day window and filter to consecutively active systems
    const { consecutiveSystemDateMaps, expectedDates } =
      await this.fetchWindowSnapshotsAndFilterConsecutiveActive(targetDate, 5, env);

    const targetDateKey = targetDate.toISOString().split('T')[0];

    // Sort expected dates chronologically (they are stored newest-first)
    const sortedDates = [...expectedDates].sort();

    // Build per-system history from already-fetched data (no additional queries)
    const systemsWithHistory: Array<{
      shortname: string;
      fullname: string;
      env: string;
      currentHealthStatus: string;
      currentHealthScore: number;
      healthChange: string;
      healthScoreChange: number;
      currentToolStatus: { r7: boolean; am: boolean; df: boolean; it: boolean };
      dailyHealth: Array<{
        date: string;
        healthStatus: string;
        healthScore: number;
        toolStatus: { r7: boolean; am: boolean; df: boolean; it: boolean };
      }>;
    }> = [];

    const toolDegradationStats = {
      r7: { lost: 0, gained: 0, stable: 0 },
      am: { lost: 0, gained: 0, stable: 0 },
      df: { lost: 0, gained: 0, stable: 0 },
      it: { lost: 0, gained: 0, stable: 0 },
    };

    for (const [shortname, dateMap] of consecutiveSystemDateMaps.entries()) {
      const targetSnapshot = dateMap.get(targetDateKey);
      if (!targetSnapshot) continue;

      // Build daily health data from the already-fetched dateMap
      const dailyHealth: Array<{
        date: string;
        healthStatus: string;
        healthScore: number;
        toolStatus: { r7: boolean; am: boolean; df: boolean; it: boolean };
      }> = [];

      for (const dateKey of sortedDates) {
        const snap = dateMap.get(dateKey);
        if (!snap) continue;

        const refDate = new Date(dateKey);
        const healthStatus = this.calculateSystemHealth(snap, refDate);
        const healthScore = this.calculateHealthScore(snap, refDate);

        dailyHealth.push({
          date: dateKey,
          healthStatus,
          healthScore,
          toolStatus: {
            r7: snap.r7Found === 1,
            am: snap.amFound === 1,
            df: snap.dfFound === 1,
            it: snap.itFound === 1,
          },
        });
      }

      // Calculate health change (first day vs last day)
      let healthChange = 'stable';
      let healthScoreChange = 0;
      if (dailyHealth.length >= 2) {
        const firstDay = dailyHealth[0];
        const lastDay = dailyHealth[dailyHealth.length - 1];
        healthScoreChange = lastDay.healthScore - firstDay.healthScore;

        if (healthScoreChange > 0) {
          healthChange = 'improved';
        } else if (healthScoreChange < 0) {
          healthChange = 'degraded';
        }

        // Track tool-specific changes
        const tools = ['r7', 'am', 'df', 'it'] as const;
        tools.forEach((tool) => {
          const firstStatus = firstDay.toolStatus[tool];
          const lastStatus = lastDay.toolStatus[tool];

          if (firstStatus && !lastStatus) {
            toolDegradationStats[tool].lost++;
          } else if (!firstStatus && lastStatus) {
            toolDegradationStats[tool].gained++;
          } else {
            toolDegradationStats[tool].stable++;
          }
        });
      }

      // Get current health status from target date snapshot
      const currentHealthStatus = this.calculateSystemHealth(targetSnapshot, targetDate);
      const currentHealthScore = this.calculateHealthScore(targetSnapshot, targetDate);

      systemsWithHistory.push({
        shortname,
        fullname: targetSnapshot.fullname,
        env: targetSnapshot.env,
        currentHealthStatus,
        currentHealthScore,
        healthChange,
        healthScoreChange: Math.round(healthScoreChange * 100) / 100,
        currentToolStatus: {
          r7: targetSnapshot.r7Found === 1,
          am: targetSnapshot.amFound === 1,
          df: targetSnapshot.dfFound === 1,
          it: targetSnapshot.itFound === 1,
        },
        dailyHealth,
      });
    }

    // Sort systems by health change (degraded first, then stable, then improved)
    systemsWithHistory.sort((a, b) => {
      if (a.healthChange === 'degraded' && b.healthChange !== 'degraded') return -1;
      if (a.healthChange !== 'degraded' && b.healthChange === 'degraded') return 1;
      if (a.healthChange === 'stable' && b.healthChange === 'improved') return -1;
      if (a.healthChange === 'improved' && b.healthChange === 'stable') return 1;
      return b.healthScoreChange - a.healthScoreChange;
    });

    // Calculate summary statistics
    const summary = {
      totalSystems: systemsWithHistory.length,
      systemsImproved: systemsWithHistory.filter(s => s.healthChange === 'improved').length,
      systemsDegraded: systemsWithHistory.filter(s => s.healthChange === 'degraded').length,
      systemsStable: systemsWithHistory.filter(s => s.healthChange === 'stable').length,
      healthStatusBreakdown: {
        fully: systemsWithHistory.filter(s => s.currentHealthStatus === 'fully').length,
        partially: systemsWithHistory.filter(s => s.currentHealthStatus === 'partially').length,
        unhealthy: systemsWithHistory.filter(s => s.currentHealthStatus === 'unhealthy').length,
      },
      toolDegradation: toolDegradationStats,
    };

    return {
      dateRange: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: targetDate.toISOString().split('T')[0],
        days: 5,
      },
      summary,
      systems: systemsWithHistory,
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
    const latestDate = await this.getLatestImportDate();

    if (!latestDate) {
      return [];
    }

    const today = new Date(latestDate);
    today.setHours(0, 0, 0, 0);

    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all snapshots for the latest date - only select columns needed for health calculations
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems

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
    const latestDate = await this.getLatestImportDate();

    if (!latestDate) {
      return [];
    }

    const today = new Date(latestDate);
    today.setHours(0, 0, 0, 0);

    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all snapshots for the latest date - only select columns needed for health calculations
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems

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

    // Get all snapshots for the target date - only select columns needed for health calculations
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate >= :targetDate', { targetDate })
      .andWhere('snapshot.importDate < :nextDay', { nextDay })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)') // Exclude fake systems
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems

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
      // Bulk check which systems have ANY previous snapshot before this date
      // This replaces the N+1 loop that queried each system individually
      const allShortnames = Array.from(latestSnapshotPerSystem.keys());

      if (allShortnames.length > 0) {
        const systemsWithPrevious = await this.snapshotRepository
          .createQueryBuilder('snapshot')
          .select('DISTINCT snapshot.shortname', 'shortname')
          .where('snapshot.shortname IN (:...shortnames)', { shortnames: allShortnames })
          .andWhere('snapshot.importDate < :targetDate', { targetDate })
          .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
          .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
          .getRawMany();

        const existingSet = new Set(systemsWithPrevious.map(s => s.shortname));

        filteredSnapshots = Array.from(latestSnapshotPerSystem.values())
          .filter(snapshot => !existingSet.has(snapshot.shortname));
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
    return this.getCachedOrFetch('environments', 3600000, async () => {
      // Get distinct environments from daily_snapshots table
      const environments = await this.snapshotRepository
        .createQueryBuilder('snapshot')
        .select('DISTINCT snapshot.env', 'env')
        .where('snapshot.env IS NOT NULL')
        .andWhere('snapshot.env != :empty', { empty: '' })
        .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
        .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
        .orderBy('snapshot.env', 'ASC')
        .getRawMany();

      return {
        environments: environments.map(e => e.env).filter(Boolean),
      };
    });
  }

  async getReappearedSystems(env?: string) {
    const cacheKey = `reappeared-systems:${env || 'all'}`;
    return this.getCachedOrFetch(cacheKey, 900000, () => this.fetchReappearedSystems(env));
  }

  private async fetchReappearedSystems(env?: string) {
    // Get the latest import date
    const latestDate = await this.getLatestImportDate();

    if (!latestDate) {
      return {
        count: 0,
        systems: [],
        date: null,
      };
    }

    const today = new Date(latestDate);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all systems in today's snapshot
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('DISTINCT snapshot.shortname', 'shortname')
      .where('snapshot.importDate >= :today', { today })
      .andWhere('snapshot.importDate < :tomorrow', { tomorrow })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)')
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }); // Only Windows systems
    
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }
    
    const systemsToday = await queryBuilder.getRawMany();

    const todayShortnames = systemsToday.map(s => s.shortname);

    if (todayShortnames.length === 0) {
      return { count: 0, systems: [], date: today };
    }

    // Bulk query: get the most recent snapshot date BEFORE today for all today's systems
    // This replaces the N+1 loop that queried each system individually
    const previousSnapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select('snapshot.shortname', 'shortname')
      .addSelect('MAX(snapshot.importDate)', 'lastSeenDate')
      .where('snapshot.shortname IN (:...shortnames)', { shortnames: todayShortnames })
      .andWhere('snapshot.importDate < :today', { today })
      .andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' }) // Only desktops/laptops
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .groupBy('snapshot.shortname')
      .getRawMany();

    const lastSeenMap = new Map(previousSnapshots.map(r => [r.shortname, new Date(r.lastSeenDate)]));

    // Filter to systems that were inactive (15+ days since last seen) and now reappeared
    const reappearedCandidates: { shortname: string; daysSinceLastSeen: number; lastSeenDate: Date }[] = [];
    for (const sys of systemsToday) {
      const lastSeen = lastSeenMap.get(sys.shortname);
      if (lastSeen) {
        const daysSinceLastSeen = Math.floor(
          (today.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLastSeen > this.INTUNE_INACTIVE_DAYS) {
          reappearedCandidates.push({
            shortname: sys.shortname,
            daysSinceLastSeen,
            lastSeenDate: lastSeen,
          });
        }
      }
    }

    if (reappearedCandidates.length === 0) {
      return { count: 0, systems: [], date: today };
    }

    // Bulk fetch system records for all reappeared systems at once
    const systemRecords = await this.systemRepository
      .createQueryBuilder('system')
      .where('system.shortname IN (:...shortnames)', { shortnames: reappearedCandidates.map(r => r.shortname) })
      .getMany();

    const systemMap = new Map(systemRecords.map(s => [s.shortname, s]));

    const reappearedSystems = reappearedCandidates
      .filter(r => systemMap.has(r.shortname))
      .map(r => ({
        ...systemMap.get(r.shortname)!,
        daysSinceLastSeen: r.daysSinceLastSeen,
        lastSeenDate: r.lastSeenDate,
      }));

    return {
      count: reappearedSystems.length,
      systems: reappearedSystems,
      date: today,
    };
  }

  /**
   * Get all systems with their tooling status for export
   * Returns systems with shortname, environment, and boolean flags for each tool
   * Applies same filters as dashboard: excludes fake systems, servers, and non-Windows
   * Uses the most recent import date to match dashboard display
   */
  async getAllSystemsWithToolingForExport(env?: string) {
    // Find the most recent import date using cached helper
    const latestDate = await this.getLatestImportDate();
    
    if (!latestDate) {
      return [];
    }

    // Get all systems from the most recent import date - exclude servers explicitly
    // Only select columns needed for health/tooling calculations
    const queryBuilder = this.snapshotRepository
      .createQueryBuilder('snapshot')
      .select(this.HEALTH_CALC_SELECT)
      .where('snapshot.importDate = :importDate', { importDate: latestDate })
      .andWhere('(snapshot.possibleFake = 0 OR snapshot.possibleFake IS NULL)') // Exclude fake systems
      .andWhere('(snapshot.serverOS IS NULL OR snapshot.serverOS != :true)', { true: 'TRUE' }) // Exclude servers (serverOS = 'TRUE')
      .andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' }) // Only Windows systems
      .orderBy('snapshot.shortname', 'ASC');
    
    if (env) {
      queryBuilder.andWhere('snapshot.env = :env', { env });
    }
    
    const snapshots = await queryBuilder.getMany();

    // Use the import date as reference for health calculations
    const referenceDate = latestDate instanceof Date
      ? latestDate
      : new Date(latestDate);

    // Map to export format with tooling status
    return snapshots.map(snapshot => ({
      shortname: snapshot.shortname,
      environment: snapshot.env || 'Unknown',
      rapid7: snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      automox: snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      defender: snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
      intune: snapshot.itLagDays !== null && snapshot.itLagDays <= this.INTUNE_INACTIVE_DAYS,
      isActive: this.isSystemActive(snapshot, referenceDate),
      healthStatus: this.calculateSystemHealth(snapshot, referenceDate),
    }));
  }
}
