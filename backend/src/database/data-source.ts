import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { System } from './entities/system.entity';
import { DailySnapshot } from './entities/daily-snapshot.entity';

config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'compliance_tracker',
  entities: [System, DailySnapshot],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
});
