import { Controller, Get, Param, Query, Logger, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import {
  StabilityOverviewResponseDto,
  SystemClassificationResponseDto,
  R7GapAnalysisResponseDto,
  RecoveryStatusResponseDto,
  SystemInsightsResponseDto,
  AnalyticsSummaryResponseDto,
  ToolingCombinationAnalysisDto,
} from './dto/analytics-response.dto';

@Controller('analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics/summary
   * Get comprehensive analytics summary for dashboard
   */
  @Get('summary')
  async getAnalyticsSummary(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ): Promise<AnalyticsSummaryResponseDto> {
    const daysNum = days ? parseInt(days, 10) : 30;
    this.logger.log(`GET /analytics/summary - days: ${daysNum}, env: ${env || 'all'}`);
    return this.analyticsService.getAnalyticsSummary(daysNum, env);
  }

  /**
   * GET /api/analytics/stability-overview
   * Get stability overview metrics
   */
  @Get('stability-overview')
  async getStabilityOverview(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ): Promise<StabilityOverviewResponseDto> {
    const daysNum = days ? parseInt(days, 10) : 30;
    this.logger.log(`GET /analytics/stability-overview - days: ${daysNum}, env: ${env || 'all'}`);
    return this.analyticsService.getStabilityOverview(daysNum, env);
  }

  /**
   * GET /api/analytics/system-classification
   * Get detailed system classification with stability metrics
   */
  @Get('system-classification')
  async getSystemClassification(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ): Promise<SystemClassificationResponseDto> {
    const daysNum = days ? parseInt(days, 10) : 30;
    this.logger.log(`GET /analytics/system-classification - days: ${daysNum}, env: ${env || 'all'}`);
    return this.analyticsService.getSystemClassification(daysNum, env);
  }

  /**
   * GET /api/analytics/r7-gap-analysis
   * Get R7 gap analysis (expected vs problematic gaps)
   */
  @Get('r7-gap-analysis')
  async getR7GapAnalysis(
    @Query('env') env?: string,
  ): Promise<R7GapAnalysisResponseDto> {
    this.logger.log(`GET /analytics/r7-gap-analysis - env: ${env || 'all'}`);
    return this.analyticsService.getR7GapAnalysis(env);
  }

  /**
   * GET /api/analytics/recovery-status
   * Get recovery tracking status
   */
  @Get('recovery-status')
  async getRecoveryStatus(
    @Query('days') days?: string,
    @Query('env') env?: string,
  ): Promise<RecoveryStatusResponseDto> {
    const daysNum = days ? parseInt(days, 10) : 30;
    this.logger.log(`GET /analytics/recovery-status - days: ${daysNum}, env: ${env || 'all'}`);
    return this.analyticsService.getRecoveryStatus(daysNum, env);
  }

  /**
   * GET /api/analytics/tooling-combinations
   * Get tooling combination analysis
   */
  @Get('tooling-combinations')
  async getToolingCombinations(
    @Query('env') env?: string,
  ): Promise<ToolingCombinationAnalysisDto> {
    this.logger.log(`GET /analytics/tooling-combinations - env: ${env || 'all'}`);
    return this.analyticsService.getToolingCombinationAnalysis(env);
  }

  /**
   * GET /api/analytics/system-insights/:shortname
   * Get detailed insights for a specific system
   */
  @Get('system-insights/:shortname')
  async getSystemInsights(
    @Param('shortname') shortname: string,
    @Query('days') days?: string,
  ): Promise<SystemInsightsResponseDto | null> {
    const daysNum = days ? parseInt(days, 10) : 30;
    this.logger.log(`GET /analytics/system-insights/${shortname} - days: ${daysNum}`);
    return this.analyticsService.getSystemInsights(shortname, daysNum);
  }

  /**
   * GET /api/analytics/missing-tool-systems/export
   * Export systems missing specific tools as CSV
   */
  @Get('missing-tool-systems/export')
  async exportMissingToolSystems(
    @Query('tools') tools: string,
    @Query('env') env: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`GET /analytics/missing-tool-systems/export - tools: ${tools}, env: ${env || 'all'}`);
    
    if (!tools) {
      res.status(HttpStatus.BAD_REQUEST).json({
        message: 'Missing required parameter: tools'
      });
      return;
    }

    try {
      const missingTools = tools.split(',').map(t => t.trim());
      const csv = await this.analyticsService.exportMissingToolSystemsCSV(missingTools, env);
      
      // Set headers for CSV download
      const filename = `missing-tools-${missingTools.join('-').replace(/\s+/g, '')}-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(HttpStatus.OK).send(csv);
    } catch (error) {
      this.logger.error(`Error exporting missing tool systems: ${error.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Failed to export systems'
      });
    }
  }
}
