import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
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
  async getNewSystemsToday(@Query('env') env?: string) {
    return this.systemsService.getNewSystemsToday(env);
  }

  @Get('reappeared')
  async getReappearedSystems(@Query('env') env?: string) {
    return this.systemsService.getReappearedSystems(env);
  }

  @Get('missing')
  async getMissingSystems(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ) {
    const daysThreshold = days ? parseInt(days, 10) : 7;
    return this.systemsService.getMissingSystems(daysThreshold, env);
  }

  @Get('health-trending')
  async getHealthTrending(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.systemsService.getHealthTrending(daysNum, env);
  }

  @Get('health-category')
  async getSystemsByHealthCategory(
    @Query('date') date: string,
    @Query('category') category: 'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new',
    @Query('env') env?: string,
  ) {
    if (!date || !category) {
      throw new Error('Date and category parameters are required');
    }
    return this.systemsService.getSystemsByHealthCategory(date, category, env);
  }

  @Get('five-day-active-drilldown')
  async getFiveDayActiveDrillDown(
    @Query('date') date: string,
    @Query('env') env?: string,
  ) {
    if (!date) {
      throw new Error('Date parameter is required');
    }
    return this.systemsService.getFiveDayActiveDrillDown(date, env);
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

  @Get('export/healthy-systems')
  async exportHealthySystems(
    @Query('env') env?: string,
    @Res() res?: Response,
  ) {
    const systems = await this.systemsService.getHealthySystemsForExport(env);
    
    // Generate CSV with header and each system on a new line
    const csv = ['Shortname', ...systems.map(s => s.shortname)].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="healthy-systems${env ? `-${env}` : ''}.csv"`);
    res.send(csv);
  }

  @Get('export/unhealthy-systems')
  async exportUnhealthySystems(
    @Query('env') env?: string,
    @Res() res?: Response,
  ) {
    const systems = await this.systemsService.getUnhealthySystemsForExport(env);
    
    // Generate CSV with header and each system on a new line
    const csv = ['Shortname', ...systems.map(s => s.shortname)].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="unhealthy-systems${env ? `-${env}` : ''}.csv"`);
    res.send(csv);
  }

  @Get('export/all-systems-tooling')
  async exportAllSystemsWithTooling(
    @Query('env') env?: string,
    @Res() res?: Response,
  ) {
    const systems = await this.systemsService.getAllSystemsWithToolingForExport(env);
    
    // Generate CSV with headers
    const headers = ['Shortname', 'Environment', 'Rapid7', 'Automox', 'Defender', 'Intune', 'Active', 'Health Status'];
    const rows = systems.map(s => [
      s.shortname,
      s.environment,
      s.rapid7 ? 'TRUE' : 'FALSE',
      s.automox ? 'TRUE' : 'FALSE',
      s.defender ? 'TRUE' : 'FALSE',
      s.intune ? 'TRUE' : 'FALSE',
      s.isActive ? 'TRUE' : 'FALSE',
      s.healthStatus.toUpperCase(),
    ].join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="all-systems-tooling${env ? `-${env}` : ''}.csv"`);
    res.send(csv);
  }
}
