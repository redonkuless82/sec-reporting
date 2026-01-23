import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemsController } from './systems.controller';
import { SystemsService } from './systems.service';
import { System } from '../../database/entities/system.entity';
import { DailySnapshot } from '../../database/entities/daily-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([System, DailySnapshot])],
  controllers: [SystemsController],
  providers: [SystemsService],
  exports: [SystemsService],
})
export class SystemsModule {}
