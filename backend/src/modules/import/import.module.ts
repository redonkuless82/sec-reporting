import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([System, DailySnapshot])],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
