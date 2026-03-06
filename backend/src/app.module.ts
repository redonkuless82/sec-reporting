import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import databaseConfig from './config/database.config';
import { ImportModule } from './modules/import/import.module';
import { SystemsModule } from './modules/systems/systems.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { System } from './database/entities/system.entity';
import { DailySnapshot } from './database/entities/daily-snapshot.entity';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 900000, // 15 minutes default TTL in milliseconds
      max: 200, // max items in cache
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [System, DailySnapshot],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
      }),
      inject: [ConfigService],
    }),
    ImportModule,
    SystemsModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
