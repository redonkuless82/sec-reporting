import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get()
  getInfo() {
    return {
      name: 'Compliance Tracking Dashboard API',
      version: '1.0.0',
      description: 'API for tracking system compliance across monitoring tools',
    };
  }
}
