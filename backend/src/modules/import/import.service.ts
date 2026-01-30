import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
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
      this.logger.log(`Import date extracted from filename: ${importDate.toISOString().split('T')[0]}`);

      let imported = 0;
      let errors = 0;

      for (const record of records) {
        try {
          await this.processRecord(record, importDate);
          imported++;
        } catch (error) {
          this.logger.error(`Error processing record: ${error.message}`, error.stack);
          errors++;
        }
      }

      this.logger.log(`Import completed. Imported: ${imported}, Errors: ${errors}`);
      return { imported, errors };
    } catch (error) {
      this.logger.error(`Failed to import CSV: ${error.message}`, error.stack);
      throw error;
    }
  }

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

    // Create daily snapshot
    const snapshot = this.snapshotRepository.create({
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
        itFoundActual
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

    await this.snapshotRepository.save(snapshot);
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
