/**
 * System stability classification types
 */
export type StabilityClassification = 
  | 'STABLE_HEALTHY'      // Consistently healthy (90+ days or high stability score)
  | 'STABLE_UNHEALTHY'    // Consistently unhealthy (needs attention)
  | 'RECOVERING'          // Recently improved and stabilizing
  | 'DEGRADING'           // Recently declined and worsening
  | 'FLAPPING';           // Frequent status changes (likely temporary offline/online cycles)

/**
 * R7 gap classification types
 */
export type R7GapClassification =
  | 'EXPECTED_RECENT_OFFLINE'  // R7 missing, Intune lag < 15 days (system recently offline)
  | 'EXPECTED_INACTIVE'        // R7 missing, Intune lag > 15 days (system inactive)
  | 'INVESTIGATE_R7_ISSUE'     // R7 missing but other tools present (config issue)
  | 'EXPECTED_OFFLINE'         // R7 missing, system offline (normal)
  | 'R7_PRESENT';              // R7 is reporting

/**
 * Recovery status types
 */
export type RecoveryStatus =
  | 'NORMAL_RECOVERY'      // Recovering within expected timeframe (< 2 days)
  | 'STUCK_RECOVERY'       // Recovery taking longer than expected (> 3 days)
  | 'NOT_RECOVERING'       // No improvement detected
  | 'FULLY_RECOVERED'      // Successfully recovered to healthy state
  | 'NOT_APPLICABLE';      // System not in recovery state

/**
 * System stability metrics
 */
export interface SystemStabilityMetrics {
  shortname: string;
  env: string | null;                        // Environment
  stabilityScore: number;                    // 0-100, higher is more stable
  classification: StabilityClassification;
  healthChangeCount: number;                 // Number of health status changes
  consecutiveDaysStable: number;             // Current streak of same health status
  daysTracked: number;                       // Number of days analyzed
  currentHealthStatus: 'fully' | 'partially' | 'unhealthy' | 'inactive';
  previousHealthStatus: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null;
  lastHealthChange: Date | null;             // When health status last changed
  // Current tool reporting status
  r7Found: boolean;                          // Is R7 currently reporting
  amFound: boolean;                          // Is Automox currently reporting
  dfFound: boolean;                          // Is Defender currently reporting
  itFound: boolean;                          // Is Intune currently reporting
  r7GapClassification: R7GapClassification;
  r7GapReason: string;                       // Human-readable explanation
  recoveryStatus: RecoveryStatus;
  recoveryDays: number | null;               // Days since started recovering
  isActionable: boolean;                     // True if needs investigation
  actionReason: string | null;               // Why action is needed
}

/**
 * Stability overview summary
 */
export interface StabilityOverview {
  totalSystems: number;
  stableHealthy: number;
  stableUnhealthy: number;
  recovering: number;
  degrading: number;
  flapping: number;
  actionableCount: number;                   // Systems needing investigation
  expectedBehaviorCount: number;             // Systems with expected behavior (flapping, recovering)
  averageStabilityScore: number;
}

/**
 * System classification result
 */
export interface SystemClassificationResult {
  classification: StabilityClassification;
  isExpectedBehavior: boolean;
  needsInvestigation: boolean;
  reason: string;
}

/**
 * R7 gap analysis result
 */
export interface R7GapAnalysis {
  shortname: string;
  r7Found: boolean;
  intuneFound: boolean;
  intuneLagDays: number | null;
  otherToolsPresent: boolean;              // AM or DF present
  classification: R7GapClassification;
  isExpected: boolean;
  explanation: string;
}

/**
 * Recovery tracking result
 */
export interface RecoveryTracking {
  shortname: string;
  status: RecoveryStatus;
  recoveryStartDate: Date | null;
  daysSinceRecoveryStart: number | null;
  currentHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive';
  previousHealth: 'fully' | 'partially' | 'unhealthy' | 'inactive' | null;
  isStuck: boolean;
  expectedRecoveryTime: number;            // Expected days to recover
  explanation: string;
  // Tool recovery tracking
  toolsRecovered?: {
    r7: boolean;
    automox: boolean;
    defender: boolean;
    intune: boolean;
  };
}
