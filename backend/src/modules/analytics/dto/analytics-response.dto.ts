import {
  StabilityClassification,
  R7GapClassification,
  RecoveryStatus,
  SystemStabilityMetrics,
  StabilityOverview,
  R7GapAnalysis,
  RecoveryTracking,
} from '../interfaces/stability-classification.interface';

/**
 * Response DTO for stability overview
 */
export class StabilityOverviewResponseDto {
  totalSystems: number;
  stableHealthy: number;
  stableUnhealthy: number;
  recovering: number;
  degrading: number;
  flapping: number;
  actionableCount: number;
  expectedBehaviorCount: number;
  averageStabilityScore: number;
  dateRange: {
    startDate: Date;
    endDate: Date;
    days: number;
  };
}

/**
 * Response DTO for system classification
 */
export class SystemClassificationResponseDto {
  systems: SystemStabilityMetrics[];
  overview: StabilityOverview;
  actionableSystems: SystemStabilityMetrics[];
  expectedBehaviorSystems: SystemStabilityMetrics[];
}

/**
 * Response DTO for R7 gap analysis
 */
export class R7GapAnalysisResponseDto {
  totalSystems: number;
  r7Present: number;
  expectedGaps: number;
  investigateGaps: number;
  gapBreakdown: {
    expectedRecentOffline: number;
    expectedInactive: number;
    expectedOffline: number;
    investigateR7Issue: number;
  };
  systemsToInvestigate: R7GapAnalysis[];
  expectedGapSystems: R7GapAnalysis[];
}

/**
 * Response DTO for recovery status
 */
export class RecoveryStatusResponseDto {
  totalRecovering: number;
  normalRecovery: number;
  stuckRecovery: number;
  fullyRecovered: number;
  averageRecoveryTime: number;
  recoveringSystems: RecoveryTracking[];
  stuckSystems: RecoveryTracking[];
}

/**
 * Response DTO for system insights (detailed view)
 */
export class SystemInsightsResponseDto {
  shortname: string;
  fullname: string | null;
  env: string | null;
  
  // Stability metrics
  stabilityScore: number;
  classification: StabilityClassification;
  healthChangeCount: number;
  consecutiveDaysStable: number;
  daysTracked: number;
  
  // Current status
  currentHealthStatus: 'fully' | 'partially' | 'unhealthy' | 'inactive';
  previousHealthStatus: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null;
  lastHealthChange: Date | null;
  
  // R7 analysis
  r7GapClassification: R7GapClassification;
  r7GapReason: string;
  
  // Recovery tracking
  recoveryStatus: RecoveryStatus;
  recoveryDays: number | null;
  
  // Action items
  isActionable: boolean;
  actionReason: string | null;
  recommendations: string[];
  
  // Historical context
  healthHistory: {
    date: Date;
    healthStatus: 'fully' | 'partially' | 'unhealthy' | 'inactive';
    r7Found: boolean;
    amFound: boolean;
    dfFound: boolean;
    itFound: boolean;
    itLagDays: number | null;
  }[];
}

/**
 * Response DTO for tooling combination analysis
 */
export class ToolingCombinationAnalysisDto {
  totalUnhealthySystems: number;
  
  combinations: {
    missingTools: string[];
    systemCount: number;
    percentage: number;
    potentialHealthIncrease: number;
    systems: string[];
  }[];
  
  insights: {
    mostCommonSingleMissing: string | null;
    mostCommonSingleMissingCount: number;
    systemsMissingAllTools: number;
    systemsMissingMultipleTools: number;
    systemsMissingSingleTool: number;
  };
}

/**
 * Response DTO for analytics summary (dashboard overview)
 */
export class AnalyticsSummaryResponseDto {
  overview: StabilityOverview;
  
  criticalInsights: {
    type: 'warning' | 'info' | 'success';
    title: string;
    message: string;
    count: number;
    systems?: string[];
  }[];
  
  r7GapSummary: {
    expectedGaps: number;
    investigateGaps: number;
    percentageExpected: number;
  };
  
  recoverySummary: {
    normalRecovery: number;
    stuckRecovery: number;
    averageRecoveryTime: number;
  };
  
  toolingCombinations?: ToolingCombinationAnalysisDto;
  
  actionItems: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    systemCount: number;
    systems: string[];
  }[];
}
