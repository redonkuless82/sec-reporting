import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { System } from './system.entity';

@Entity('daily_snapshots')
@Index(['shortname', 'importDate'])
@Index(['importDate'])
export class DailySnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  shortname: string;

  @Column({ type: 'date' })
  importDate: Date;

  // System Identification
  @Column({ type: 'varchar', length: 500, nullable: true })
  fullname: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  env: string;

  // Operating System Details
  @Column({ type: 'varchar', length: 255, nullable: true })
  serverOS: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  osName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  osFamily: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  osBuildNumber: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  supportedOS: number;

  // Network Information
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipPriv: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipPub: string;

  // User & Validation
  @Column({ type: 'varchar', length: 255, nullable: true })
  userEmail: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  possibleFake: number;

  // Tool Reporting Status (Found)
  @Column({ type: 'tinyint', width: 1, default: 0 })
  r7Found: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  amFound: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  dfFound: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  itFound: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  vmFound: number;

  // Recency Indicators
  @Column({ type: 'tinyint', width: 1, default: 0 })
  seenRecently: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  recentR7Scan: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  recentAMScan: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  recentDFScan: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  recentITScan: number;

  // Lag Metrics (Days Since Last Report)
  @Column({ type: 'int', nullable: true })
  r7LagDays: number;

  @Column({ type: 'int', nullable: true })
  amLagDays: number;

  @Column({ type: 'int', nullable: true })
  itLagDays: number;

  @Column({ type: 'int', nullable: true })
  dfLagDays: number;

  // Compliance - Count of tools where system is NOT found (non-compliant)
  @Column({ type: 'int', default: 0 })
  numCriticals: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  amLastUser: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  needsAMReboot: number;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  needsAMAttention: number;

  // VM & Tool IDs
  @Column({ type: 'varchar', length: 50, nullable: true })
  vmPowerState: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dfID: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  itID: string;

  // Script Metadata
  @Column({ type: 'varchar', length: 255, nullable: true })
  scriptResult: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => System, { nullable: true })
  @JoinColumn({ name: 'shortname', referencedColumnName: 'shortname' })
  system: System;
}
