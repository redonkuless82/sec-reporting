import { Controller, Get, Param, Query } from '@nestjs/common';
import { SystemsService } from './systems.service';

@Controller('systems')
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.systemsService.findAll(search, pageNum, limitNum);
  }

  @Get('stats')
  async getStats() {
    return this.systemsService.getStats();
  }

  @Get('environments')
  async getEnvironments() {
    return this.systemsService.getEnvironments();
  }

  @Get('new-today')
  async getNewSystemsToday() {
    return this.systemsService.getNewSystemsToday();
  }

  @Get('missing')
  async getMissingSystems(@Query('days') days?: string) {
    const daysThreshold = days ? parseInt(days, 10) : 7;
    return this.systemsService.getMissingSystems(daysThreshold);
  }

  @Get('compliance-trending')
  async getComplianceTrending(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.systemsService.getComplianceTrending(daysNum, env);
  }

  @Get('compliance-category')
  async getSystemsByComplianceCategory(
    @Query('date') date: string,
    @Query('category') category: 'fully' | 'partially' | 'non' | 'new',
    @Query('env') env?: string,
  ) {
    if (!date || !category) {
      throw new Error('Date and category parameters are required');
    }
    return this.systemsService.getSystemsByComplianceCategory(date, category, env);
  }

  @Get(':shortname')
  async findOne(@Param('shortname') shortname: string) {
    return this.systemsService.findOne(shortname);
  }

  @Get(':shortname/history')
  async getHistory(
    @Param('shortname') shortname: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.systemsService.getHistory(shortname, start, end);
  }

  @Get(':shortname/calendar')
  async getCalendarData(
    @Param('shortname') shortname: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const yearNum = year ? parseInt(year, 10) : undefined;
    const monthNum = month ? parseInt(month, 10) : undefined;
    return this.systemsService.getCalendarData(shortname, yearNum, monthNum);
  }
}
