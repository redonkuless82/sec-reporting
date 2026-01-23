import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class SystemsService {
  constructor(
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

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

    // Transform data for calendar heatmap
    const calendarData = snapshots.map((snapshot) => ({
      date: snapshot.importDate,
      tools: {
        r7: snapshot.r7Found,
        am: snapshot.amFound,
        df: snapshot.dfFound,
        it: snapshot.itFound,
        vm: snapshot.vmFound,
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
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find systems that appeared in snapshots for the first time today
    // Get all shortnames that have snapshots today
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

    // For each system, check if it had any snapshots before today
    const newSystems = [];
    for (const shortname of shortnamesWithSnapshotsToday) {
      const previousSnapshot = await this.snapshotRepository
        .createQueryBuilder('snapshot')
        .where('snapshot.shortname = :shortname', { shortname })
        .andWhere('snapshot.importDate < :today', { today })
        .limit(1)
        .getOne();

      // If no previous snapshot exists, this is a new system
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

  async getComplianceTrending(days: number = 30, env?: string) {
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
          complianceImprovement: 0,
          newSystemsDiscovered: 0,
          systemsLostCompliance: 0,
          systemsGainedCompliance: 0,
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
    
    // Track system compliance status over time
    const systemComplianceHistory = new Map<string, { firstSeen: string; compliance: Map<string, boolean> }>();

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

      // Calculate compliance metrics for this day using unique systems only
      let fullyCompliant = 0; // All 5 tools found
      let partiallyCompliant = 0; // 3-4 tools found
      let nonCompliant = 0; // 0-2 tools found
      let newSystems = 0;
      let existingSystems = 0;

      const toolCompliance = {
        r7: 0,
        am: 0,
        df: 0,
        it: 0,
        vm: 0,
      };

      latestSnapshotPerSystem.forEach((snapshot) => {
        const shortname = snapshot.shortname;
        const toolsFound = [
          snapshot.r7Found,
          snapshot.amFound,
          snapshot.dfFound,
          snapshot.itFound,
          snapshot.vmFound,
        ].filter(Boolean).length;

        // Track tool-specific compliance
        if (snapshot.r7Found) toolCompliance.r7++;
        if (snapshot.amFound) toolCompliance.am++;
        if (snapshot.dfFound) toolCompliance.df++;
        if (snapshot.itFound) toolCompliance.it++;
        if (snapshot.vmFound) toolCompliance.vm++;

        // Categorize compliance level
        if (toolsFound === 5) {
          fullyCompliant++;
        } else if (toolsFound >= 3) {
          partiallyCompliant++;
        } else {
          nonCompliant++;
        }

        // Track if this is a new system
        if (!systemComplianceHistory.has(shortname)) {
          newSystems++;
          systemComplianceHistory.set(shortname, {
            firstSeen: date,
            compliance: new Map([
              ['r7', snapshot.r7Found === 1],
              ['am', snapshot.amFound === 1],
              ['df', snapshot.dfFound === 1],
              ['it', snapshot.itFound === 1],
              ['vm', snapshot.vmFound === 1],
            ]),
          });
        } else {
          existingSystems++;
          // Update compliance status
          const history = systemComplianceHistory.get(shortname)!;
          history.compliance.set('r7', snapshot.r7Found === 1);
          history.compliance.set('am', snapshot.amFound === 1);
          history.compliance.set('df', snapshot.dfFound === 1);
          history.compliance.set('it', snapshot.itFound === 1);
          history.compliance.set('vm', snapshot.vmFound === 1);
        }
      });

      const totalSystems = latestSnapshotPerSystem.size;
      const complianceRate = totalSystems > 0
        ? ((fullyCompliant + partiallyCompliant) / totalSystems) * 100
        : 0;

      trendData.push({
        date,
        totalSystems,
        fullyCompliant,
        partiallyCompliant,
        nonCompliant,
        newSystems,
        existingSystems,
        complianceRate: Math.round(complianceRate * 100) / 100,
        toolCompliance,
      });
    }

    // Calculate summary metrics
    const firstDay = trendData[0];
    const lastDay = trendData[trendData.length - 1];
    
    // Calculate systems that gained or lost compliance
    let systemsGainedCompliance = 0;
    let systemsLostCompliance = 0;

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
      
      const firstDayCompliance = new Map<string, number>();
      firstDayLatest.forEach((s) => {
        const toolsFound = [s.r7Found, s.amFound, s.dfFound, s.itFound, s.vmFound].filter(Boolean).length;
        firstDayCompliance.set(s.shortname, toolsFound);
      });

      lastDayLatest.forEach((s) => {
        const toolsFound = [s.r7Found, s.amFound, s.dfFound, s.itFound, s.vmFound].filter(Boolean).length;
        const previousToolsFound = firstDayCompliance.get(s.shortname);
        
        if (previousToolsFound !== undefined) {
          if (toolsFound > previousToolsFound) {
            systemsGainedCompliance++;
          } else if (toolsFound < previousToolsFound) {
            systemsLostCompliance++;
          }
        }
      });
    }

    const summary = {
      totalSystemsNow: lastDay.totalSystems,
      totalSystemsStart: firstDay.totalSystems,
      complianceImprovement: Math.round((lastDay.complianceRate - firstDay.complianceRate) * 100) / 100,
      newSystemsDiscovered: lastDay.totalSystems - firstDay.totalSystems,
      systemsLostCompliance,
      systemsGainedCompliance,
    };

    return {
      dateRange: { startDate, endDate, days },
      trendData,
      summary,
    };
  }

  async getSystemsByComplianceCategory(date: string, category: 'fully' | 'partially' | 'non' | 'new', env?: string) {
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
      // Filter by compliance category
      filteredSnapshots = Array.from(latestSnapshotPerSystem.values()).filter((snapshot) => {
        const toolsFound = [
          snapshot.r7Found,
          snapshot.amFound,
          snapshot.dfFound,
          snapshot.itFound,
          snapshot.vmFound,
        ].filter(Boolean).length;

        if (category === 'fully') {
          return toolsFound === 5;
        } else if (category === 'partially') {
          return toolsFound >= 3 && toolsFound <= 4;
        } else if (category === 'non') {
          return toolsFound <= 2;
        }
        return false;
      });
    }

    // Transform snapshots to include system details and tool compliance
    const systemsWithDetails = filteredSnapshots.map((snapshot) => {
      const toolsReporting = [];
      if (snapshot.r7Found) toolsReporting.push('Rapid7');
      if (snapshot.amFound) toolsReporting.push('Automox');
      if (snapshot.dfFound) toolsReporting.push('Defender');
      if (snapshot.itFound) toolsReporting.push('Intune');
      if (snapshot.vmFound) toolsReporting.push('VMware');

      const toolsFound = toolsReporting.length;
      let complianceLevel = 'Non-Compliant';
      if (toolsFound === 5) {
        complianceLevel = 'Fully Compliant';
      } else if (toolsFound >= 3) {
        complianceLevel = 'Partially Compliant';
      }

      return {
        shortname: snapshot.shortname,
        fullname: snapshot.fullname,
        env: snapshot.env,
        toolsReporting,
        toolsFound,
        complianceLevel,
        toolStatus: {
          r7: snapshot.r7Found,
          am: snapshot.amFound,
          df: snapshot.dfFound,
          it: snapshot.itFound,
          vm: snapshot.vmFound,
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
