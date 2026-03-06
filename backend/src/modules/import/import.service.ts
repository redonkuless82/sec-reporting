import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private static readonly CHUNK_SIZE = 500;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}

  async importCsvFile(filePath: string, originalFilename?: string): Promise<{ imported: number; errors: number }> {
    this.logger.log(`Starting CSV import from: ${filePath}`);

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      // Extract date from filename: AllDevices-YYYYMMDD_*.csv
      // Use original filename if provided, otherwise use the file path
      const filenameToUse = originalFilename || filePath;
      const importDate = this.extractDateFromFilename(filenameToUse);
      this.logger.log(`Import date extracted from filename: ${importDate.toISOString().split('T')[0]}, Records: ${records.length}`);

      let imported = 0;
      let errors = 0;

      // Step 1: Build all snapshot entities and collect unique systems
      const snapshotEntities: DailySnapshot[] = [];
      const systemsMap = new Map<string, { shortname: string; fullname: string | null; env: string | null }>();

      for (const record of records) {
        try {
          const shortname = record.shortname?.trim();
          if (!shortname) {
            errors++;
            continue;
          }

          // Collect unique system info (last occurrence wins for fullname/env)
          systemsMap.set(shortname, {
            shortname,
            fullname: record.fullname || null,
            env: record.env || null,
          });

          // Build snapshot entity without saving
          const snapshot = this.buildSnapshotEntity(record, importDate);
          snapshotEntities.push(snapshot);
        } catch (error) {
          this.logger.error(`Error building record: ${error.message}`);
          errors++;
        }
      }

      this.logger.log(`Parsed ${snapshotEntities.length} snapshots, ${systemsMap.size} unique systems`);

      // Step 2: Batch upsert systems
      const uniqueShortnames = Array.from(systemsMap.keys());

      // Fetch existing systems in bulk
      const existingSystems = new Map<string, System>();
      for (const chunk of this.chunkArray(uniqueShortnames, ImportService.CHUNK_SIZE)) {
        const found = await this.systemRepository
          .createQueryBuilder('system')
          .where('system.shortname IN (:...shortnames)', { shortnames: chunk })
          .getMany();
        found.forEach(s => existingSystems.set(s.shortname, s));
      }

      // Prepare systems to save (new + updated)
      const systemsToSave: System[] = [];
      for (const [shortname, info] of systemsMap.entries()) {
        const existing = existingSystems.get(shortname);
        if (existing) {
          existing.fullname = info.fullname;
          existing.env = info.env;
          systemsToSave.push(existing);
        } else {
          const newSystem = this.systemRepository.create({
            shortname: info.shortname,
            fullname: info.fullname,
            env: info.env,
          });
          systemsToSave.push(newSystem);
        }
      }

      // Save systems in chunks
      for (const chunk of this.chunkArray(systemsToSave, ImportService.CHUNK_SIZE)) {
        await this.systemRepository.save(chunk);
      }
      this.logger.log(`Systems upserted: ${systemsToSave.length}`);

      // Step 3: Batch insert snapshots
      for (const chunk of this.chunkArray(snapshotEntities, ImportService.CHUNK_SIZE)) {
        try {
          await this.snapshotRepository.save(chunk);
          imported += chunk.length;
        } catch (error) {
          this.logger.error(`Error saving snapshot chunk: ${error.message}`);
          // Fall back to individual saves for this chunk so we don't lose the entire batch
          for (const snapshot of chunk) {
            try {
              await this.snapshotRepository.save(snapshot);
              imported++;
            } catch (innerError) {
              this.logger.error(`Error saving individual snapshot: ${innerError.message}`);
              errors++;
            }
          }
        }
      }

      this.logger.log(`Import completed. Imported: ${imported}, Errors: ${errors}`);

      // Invalidate all cached data after successful import
      try {
        await this.cacheManager.clear();
        this.logger.log('Cache invalidated after successful import');
      } catch (e) {
        this.logger.warn(`Cache invalidation failed: ${e.message}`);
      }

      return { imported, errors };
    } catch (error) {
      this.logger.error(`Failed to import CSV: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Process a single CSV record — kept for backward compatibility and single-record use cases.
   */
  private async processRecord(record: any, importDate: Date): Promise<void> {
    const shortname = record.shortname?.trim();

    if (!shortname) {
      throw new Error('Missing shortname in record');
    }

    // Upsert system record - find or create
    let system = await this.systemRepository.findOne({ where: { shortname } });

    if (!system) {
      // Create new system
      system = this.systemRepository.create({
        shortname,
        fullname: record.fullname || null,
        env: record.env || null,
      });
      await this.systemRepository.save(system);
    } else {
      // Update existing system
      system.fullname = record.fullname || null;
      system.env = record.env || null;
      await this.systemRepository.save(system);
    }

    // Build and save snapshot
    const snapshot = this.buildSnapshotEntity(record, importDate);
    await this.snapshotRepository.save(snapshot);
  }

  /**
   * Build a DailySnapshot entity from a CSV record without persisting it.
   * Contains all parsing logic for field mapping, boolean conversion, lag day
   * calculations, and compliance scoring.
   */
  private buildSnapshotEntity(record: any, importDate: Date): DailySnapshot {
    const shortname = record.shortname?.trim();

    // Parse lag days for all tools to determine if they should be marked as "found"
    // A tool is only "found" (reporting) if lag days is 0 or -1 (seen today)
    // -1 indicates timezone issue but was seen today
    // Any other value means it hasn't checked in today
    const r7LagDays = this.parseNumber(record.r7LagDays);
    const amLagDays = this.parseNumber(record.amLagDays);
    const dfLagDays = this.parseNumber(record.dfLagDays);
    const itLagDays = this.parseNumber(record.itLagDays);

    const r7FoundRaw = this.parseBoolean(record.r7Found);
    const amFoundRaw = this.parseBoolean(record.amFound);
    const dfFoundRaw = this.parseBoolean(record.dfFound);
    const itFoundRaw = this.parseBoolean(record.itFound);

    // Calculate actual "found" status based on lag days
    const r7FoundActual = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;
    const amFoundActual = amFoundRaw && (amLagDays === 0 || amLagDays === -1) ? 1 : 0;
    const dfFoundActual = dfFoundRaw && (dfLagDays === 0 || dfLagDays === -1) ? 1 : 0;
    const itFoundActual = itFoundRaw && (itLagDays === 0 || itLagDays === -1) ? 1 : 0;

    // Create daily snapshot entity (not persisted)
    return this.snapshotRepository.create({
      shortname,
      importDate,
      fullname: record.fullname || null,
      env: record.env || null,

      // Operating System Details
      serverOS: record.serverOS || null,
      osName: record.osName || null,
      osFamily: record.osFamily || null,
      osBuildNumber: record.osBuildNumber || null,
      supportedOS: this.parseBoolean(record.supportedOS),

      // Network Information
      ipPriv: record.ip_priv || null,
      ipPub: record.ip_pub || null,

      // User & Validation
      userEmail: record.userEmail || null,
      possibleFake: this.parseBoolean(record.possibleFake),

      // Tool Reporting Status (Found) - Use calculated values based on lag days
      r7Found: r7FoundActual,
      amFound: amFoundActual,
      dfFound: dfFoundActual,
      itFound: itFoundActual,
      vmFound: this.parseBoolean(record.vmFound),

      // Recency Indicators
      seenRecently: this.parseBoolean(record.seenRecently),
      recentR7Scan: this.parseBoolean(record.recentR7Scan),
      recentAMScan: this.parseBoolean(record.recentAMScan),
      recentDFScan: this.parseBoolean(record.recentDFScan),
      recentITScan: this.parseBoolean(record.recentITScan),

      // Lag Metrics - Store the actual lag days values
      r7LagDays: r7LagDays,
      amLagDays: amLagDays,
      itLagDays: itLagDays,
      dfLagDays: dfLagDays,

      // Compliance - Calculate number of tools where system is NOT found
      numCriticals: this.calculateNonCompliantTools(
        r7FoundActual,
        amFoundActual,
        dfFoundActual,
        itFoundActual,
      ),
      amLastUser: record.amLastUser || null,
      needsAMReboot: this.parseBoolean(record.needsAMReboot),
      needsAMAttention: this.parseBoolean(record.needsAMAttention),

      // VM & Tool IDs
      vmPowerState: record.vmPowerState || null,
      dfID: record.dfID || null,
      itID: record.itID || null,

      // Script Metadata
      scriptResult: record.scriptResult || null,
    });
  }

  /**
   * Split an array into chunks of the specified size.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private parseBoolean(value: any): number {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value ? 1 : 0;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      return (lower === 'true' || lower === '1' || lower === 'yes') ? 1 : 0;
    }
    return 0;
  }

  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  private calculateNonCompliantTools(r7Found: number, amFound: number, dfFound: number, itFound: number): number {
    // Count how many tools the system is NOT found in (non-compliant)
    let nonCompliantCount = 0;
    if (!r7Found) nonCompliantCount++;
    if (!amFound) nonCompliantCount++;
    if (!dfFound) nonCompliantCount++;
    if (!itFound) nonCompliantCount++;
    return nonCompliantCount;
  }

  private extractDateFromFilename(filePath: string): Date {
    // Extract filename from path
    const filename = filePath.split('/').pop() || filePath.split('\\').pop() || '';

    // Pattern: AllDevices-YYYYMMDD_*.csv
    const dateMatch = filename.match(/AllDevices-(\d{8})/i);

    if (dateMatch && dateMatch[1]) {
      const dateStr = dateMatch[1]; // YYYYMMDD
      const year = parseInt(dateStr.substring(0, 4), 10);
      const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
      const day = parseInt(dateStr.substring(6, 8), 10);

      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);

      this.logger.log(`Extracted date from filename: ${year}-${month + 1}-${day}`);
      return date;
    }

    // Fallback to current date if pattern doesn't match
    this.logger.warn(`Could not extract date from filename: ${filename}, using current date`);
    const fallbackDate = new Date();
    fallbackDate.setHours(0, 0, 0, 0);
    return fallbackDate;
  }
}
