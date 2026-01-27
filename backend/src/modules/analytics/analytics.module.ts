import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StabilityScoringService } from './services/stability-scoring.service';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([System, DailySnapshot]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    StabilityScoringService,
  ],
  exports: [AnalyticsService, StabilityScoringService],
})
export class AnalyticsModule {}
