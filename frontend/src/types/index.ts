export interface System {
  id: number;
  shortname: string;
  fullname: string | null;
  env: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailySnapshot {
  id: number;
  shortname: string;
  importDate: string;
  fullname: string | null;
  env: string | null;
  
  // Operating System Details
  serverOS: string | null;
  osName: string | null;
  osFamily: string | null;
  osBuildNumber: string | null;
  supportedOS: boolean;
  
  // Network Information
  ipPriv: string | null;
  ipPub: string | null;
  
  // User & Validation
  userEmail: string | null;
  possibleFake: boolean;
  
  // Tool Reporting Status
  r7Found: boolean;
  amFound: boolean;
  dfFound: boolean;
  itFound: boolean;
  vmFound: boolean;
  
  // Recency Indicators
  seenRecently: boolean;
  recentR7Scan: boolean;
  recentAMScan: boolean;
  recentDFScan: boolean;
  recentITScan: boolean;
  
  // Lag Metrics
  r7LagDays: number | null;
  amLagDays: number | null;
  itLagDays: number | null;
  dfLagDays: number | null;
  
  // Compliance - number of tools where system is NOT found (non-compliant)
  numCriticals: number;
  amLastUser: string | null;
  needsAMReboot: boolean;
  needsAMAttention: boolean;
  
  // VM & Tool IDs
  vmPowerState: string | null;
  dfID: string | null;
  itID: string | null;
  
  // Script Metadata
  scriptResult: string | null;
  
  createdAt: string;
}

export interface CalendarDataPoint {
  date: Date | string;
  tools: {
    r7: boolean;
    am: boolean;
    df: boolean;
    it: boolean;
    vm: boolean;
  };
  recentScans: {
    r7: boolean;
    am: boolean;
    df: boolean;
    it: boolean;
  };
  lagDays: {
    r7: number | null;
    am: number | null;
    df: number | null;
    it: number | null;
  };
  criticals: number;
  seenRecently: boolean;
}

export interface SystemsResponse {
  data: System[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CalendarResponse {
  system: System;
  year: number;
  month: number;
  data: CalendarDataPoint[];
}

export interface StatsResponse {
  totalSystems: number;
  latestImportDate: string | null;
  latestSnapshotCount: number;
}

export interface MissingSystem extends System {
  lastSeenDate: string | null;
  daysSinceLastSeen: number | null;
}

export interface NewSystemsResponse {
  count: number;
  systems: System[];
  date: string;
}

export interface MissingSystemsResponse {
  count: number;
  systems: MissingSystem[];
  latestImportDate: string | null;
  daysThreshold: number;
}

export interface HealthTrendDataPoint {
  date: string;
  totalSystems: number;
  activeSystems: number;
  fullyHealthy: number;
  partiallyHealthy: number;
  unhealthy: number;
  inactive: number;
  newSystems: number;
  existingSystems: number;
  healthRate: number;
  toolHealth: {
    r7: number;
    am: number;
    df: number;
    it: number;
  };
}

export interface ComparisonMetrics {
  healthRateChange: number;
  systemsChange: number;
  fullyHealthyChange: number;
  partiallyHealthyChange: number;
  unhealthyChange: number;
  inactiveChange: number;
}

export interface ToolTrend {
  current: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

export interface HealthTrendingSummary {
  totalSystemsNow: number;
  totalSystemsStart: number;
  healthImprovement: number;
  newSystemsDiscovered: number;
  systemsLostHealth: number;
  systemsGainedHealth: number;
  dayOverDay: ComparisonMetrics | null;
  weekOverWeek: ComparisonMetrics | null;
  toolTrends: {
    r7: ToolTrend;
    am: ToolTrend;
    df: ToolTrend;
    it: ToolTrend;
  };
}

export interface HealthTrendingResponse {
  dateRange: {
    startDate: string;
    endDate: string;
    days: number;
  };
  trendData: HealthTrendDataPoint[];
  summary: HealthTrendingSummary;
}

export interface SystemHealthDetail {
  shortname: string;
  fullname: string | null;
  env: string | null;
  toolsReporting: string[];
  toolsFound: number;
  healthLevel: string;
  toolStatus: {
    r7: boolean;
    am: boolean;
    df: boolean;
    it: boolean;
  };
  isActive: boolean;
}

export interface HealthCategoryResponse {
  date: string;
  category: 'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new';
  count: number;
  systems: SystemHealthDetail[];
}
