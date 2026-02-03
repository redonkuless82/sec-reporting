import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi, systemsApi } from '../services/api';
import { useEnvironment } from '../contexts/EnvironmentContext';
import type { System } from '../types';
import './ComplianceDashboard.css';
import './AnalyticsDashboard.css';

interface AnalyticsDashboardProps {
  days?: number;
  onSystemClick?: (system: System) => void;
}

export default function AnalyticsDashboard({ days = 30, onSystemClick }: AnalyticsDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(days);
  const [selectedCombo, setSelectedCombo] = useState<{ missingTools: string[]; systems: string[] } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const navigate = useNavigate();

  // Use global environment context
  const { selectedEnvironment } = useEnvironment();

  useEffect(() => {
    loadData();
  }, [selectedPeriod, selectedEnvironment]);

  const handleClassificationClick = (
    classification: 'STABLE_HEALTHY' | 'STABLE_UNHEALTHY' | 'RECOVERING' | 'DEGRADING' | 'FLAPPING',
    label: string
  ) => {
    // Navigate to detail page with query parameters
    const params = new URLSearchParams({
      classification,
      label,
      days: selectedPeriod.toString(),
    });
    
    if (selectedEnvironment) {
      params.append('env', selectedEnvironment);
    }
    
    navigate(`/analytics/details?${params.toString()}`);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await analyticsApi.getSummary(
        selectedPeriod,
        selectedEnvironment || undefined
      );
      setData(response);
    } catch (err) {
      console.error('Error loading analytics data:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleSystemClick = async (shortname: string) => {
    if (!onSystemClick) return;
    
    try {
      const system = await systemsApi.getSystem(shortname);
      onSystemClick(system);
    } catch (error) {
      console.error('Error loading system:', error);
    }
  };

  const handleDownloadReport = () => {
    if (!data) return;

    const { overview, criticalInsights, r7GapSummary, recoverySummary, actionItems } = data;
    
    // Build report content
    let reportContent = `ANALYTICS INTELLIGENCE REPORT\n`;
    reportContent += `Generated: ${new Date().toLocaleString()}\n`;
    reportContent += `Period: ${selectedPeriod} days\n`;
    if (selectedEnvironment) reportContent += `Environment: ${selectedEnvironment}\n`;
    reportContent += `\n${'='.repeat(80)}\n\n`;

    // Overview Section
    reportContent += `OVERVIEW\n`;
    reportContent += `${'='.repeat(80)}\n`;
    reportContent += `Total Systems: ${overview.totalSystems}\n`;
    reportContent += `Stable Healthy: ${overview.stableHealthy} (${Math.round((overview.stableHealthy / overview.totalSystems) * 100)}%)\n`;
    reportContent += `Needs Investigation: ${overview.actionableCount} (${Math.round((overview.actionableCount / overview.totalSystems) * 100)}%)\n`;
    reportContent += `Expected Behavior: ${overview.expectedBehaviorCount} (${Math.round((overview.expectedBehaviorCount / overview.totalSystems) * 100)}%)\n`;
    reportContent += `Average Stability Score: ${overview.averageStabilityScore}/100\n\n`;

    // System Classification
    reportContent += `SYSTEM CLASSIFICATION\n`;
    reportContent += `${'='.repeat(80)}\n`;
    reportContent += `✅ Stable Healthy: ${overview.stableHealthy}\n`;
    reportContent += `🔄 Flapping: ${overview.flapping}\n`;
    reportContent += `⚠️  Recovering: ${overview.recovering}\n`;
    reportContent += `📉 Degrading: ${overview.degrading}\n`;
    reportContent += `🔴 Stable Unhealthy: ${overview.stableUnhealthy}\n\n`;

    // Critical Insights
    if (criticalInsights && criticalInsights.length > 0) {
      reportContent += `CRITICAL INSIGHTS\n`;
      reportContent += `${'='.repeat(80)}\n`;
      criticalInsights.forEach((insight: any, index: number) => {
        reportContent += `\n${index + 1}. ${insight.title} (${insight.count})\n`;
        reportContent += `   ${insight.message}\n`;
        if (insight.systems && insight.systems.length > 0) {
          reportContent += `   Systems: ${insight.systems.join(', ')}\n`;
        }
      });
      reportContent += `\n`;
    }

    // R7 Gap Analysis
    if (r7GapSummary) {
      reportContent += `RAPID7 GAP ANALYSIS\n`;
      reportContent += `${'='.repeat(80)}\n`;
      reportContent += `Expected Gaps: ${r7GapSummary.expectedGaps}\n`;
      reportContent += `  (Systems recently offline or inactive - R7 correctly removed)\n`;
      reportContent += `Investigate Gaps: ${r7GapSummary.investigateGaps}\n`;
      reportContent += `  (R7 missing but other tools present - possible configuration issue)\n`;
      reportContent += `Expected Percentage: ${r7GapSummary.percentageExpected}%\n`;
      reportContent += `  (Of all R7 gaps are expected behavior)\n\n`;
    }

    // Recovery Status
    if (recoverySummary) {
      reportContent += `RECOVERY TRACKING\n`;
      reportContent += `${'='.repeat(80)}\n`;
      reportContent += `Normal Recovery: ${recoverySummary.normalRecovery}\n`;
      reportContent += `  (Systems recovering within expected timeframe < 2 days)\n`;
      reportContent += `Stuck Recovery: ${recoverySummary.stuckRecovery}\n`;
      reportContent += `  (Systems taking longer than expected > 3 days - may need intervention)\n`;
      reportContent += `Fully Recovered: ${recoverySummary.fullyRecovered}\n`;
      reportContent += `  (Systems that added missing tools and became fully healthy)\n`;
      reportContent += `Average Recovery Time: ${recoverySummary.averageRecoveryTime} days\n\n`;
    }

    // Action Items
    if (actionItems && actionItems.length > 0) {
      reportContent += `ACTION ITEMS\n`;
      reportContent += `${'='.repeat(80)}\n`;
      actionItems.forEach((item: any, index: number) => {
        reportContent += `\n${index + 1}. [${item.priority.toUpperCase()}] ${item.category}\n`;
        reportContent += `   Systems: ${item.systemCount}\n`;
        reportContent += `   ${item.description}\n`;
        if (item.systems && item.systems.length > 0) {
          reportContent += `   Affected Systems: ${item.systems.join(', ')}\n`;
        }
      });
      reportContent += `\n`;
    }

    // Key Takeaways
    reportContent += `KEY TAKEAWAYS\n`;
    reportContent += `${'='.repeat(80)}\n`;
    reportContent += `\n🎯 Focus Your Efforts:\n`;
    reportContent += `   Only ${overview.actionableCount} out of ${overview.totalSystems} systems need investigation\n`;
    reportContent += `   (${Math.round((overview.actionableCount / overview.totalSystems) * 100)}%). The rest are showing expected behavior.\n`;
    reportContent += `\n✅ Expected Behavior:\n`;
    reportContent += `   ${overview.flapping} systems are flapping (normal offline/online cycles) and\n`;
    reportContent += `   ${overview.recovering} are recovering normally. No action needed.\n`;
    reportContent += `\n🔍 R7 Intelligence:\n`;
    reportContent += `   ${r7GapSummary.percentageExpected}% of R7 gaps are expected (systems offline/inactive).\n`;
    reportContent += `   Only ${r7GapSummary.investigateGaps} gaps need investigation.\n`;

    // Create and download the file
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `analytics-report-${selectedPeriod}days-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleComboClick = (combo: any) => {
    setSelectedCombo({
      missingTools: combo.missingTools,
      systems: combo.systems,
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedCombo(null);
  };

  const handleExportCsv = async () => {
    if (!selectedCombo) return;

    setExportingCsv(true);
    try {
      const blob = await analyticsApi.exportMissingToolSystems(
        selectedCombo.missingTools,
        selectedEnvironment || undefined
      );

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filename = `missing-${selectedCombo.missingTools.join('-').replace(/\s+/g, '')}-${new Date().toISOString().split('T')[0]}.csv`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setExportingCsv(false);
    }
  };

  if (loading) {
    return (
      <div className="compliance-dashboard loading">
        <div className="loading-spinner">Loading analytics...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="compliance-dashboard error">
        <div className="error-message">{error || 'No data available'}</div>
      </div>
    );
  }

  const { overview, criticalInsights, r7GapSummary, recoverySummary, toolingCombinations, actionItems } = data;

  return (
    <div className="compliance-dashboard analytics-dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h2>🔍 Analytics Intelligence</h2>
          <p className="subtitle">
            Actionable insights to distinguish real issues from expected behavior
            {selectedEnvironment && (
              <span className="env-filter-indicator"> • Filtered by: {selectedEnvironment}</span>
            )}
          </p>
        </div>
        <div className="header-controls">
          <button
            className="download-report-btn"
            onClick={handleDownloadReport}
            title="Download Analytics Report"
          >
            📥 Download Report
          </button>
          <div className="period-selector">
            <button
              className={selectedPeriod === 7 ? 'active' : ''}
              onClick={() => setSelectedPeriod(7)}
            >
              7 Days
            </button>
            <button
              className={selectedPeriod === 14 ? 'active' : ''}
              onClick={() => setSelectedPeriod(14)}
            >
              14 Days
            </button>
            <button
              className={selectedPeriod === 30 ? 'active' : ''}
              onClick={() => setSelectedPeriod(30)}
            >
              30 Days
            </button>
            <button
              className={selectedPeriod === 60 ? 'active' : ''}
              onClick={() => setSelectedPeriod(60)}
            >
              60 Days
            </button>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">📊</div>
          <div className="card-content">
            <div className="card-label">Total Systems</div>
            <div className="card-value">{overview.totalSystems}</div>
            <div className="card-description">Analyzed over {selectedPeriod} days</div>
          </div>
        </div>

        <div className="summary-card success">
          <div className="card-icon">✅</div>
          <div className="card-content">
            <div className="card-label">Stable Healthy</div>
            <div className="card-value">{overview.stableHealthy}</div>
            <div className="card-description">
              {overview.totalSystems > 0 
                ? `${Math.round((overview.stableHealthy / overview.totalSystems) * 100)}% of systems`
                : '0%'}
            </div>
          </div>
        </div>

        <div className="summary-card warning">
          <div className="card-icon">🔴</div>
          <div className="card-content">
            <div className="card-label">Needs Investigation</div>
            <div className="card-value">{overview.actionableCount}</div>
            <div className="card-description">
              {overview.totalSystems > 0
                ? `${Math.round((overview.actionableCount / overview.totalSystems) * 100)}% require action`
                : '0%'}
            </div>
          </div>
        </div>

        <div className="summary-card info">
          <div className="card-icon">🔄</div>
          <div className="card-content">
            <div className="card-label">Expected Behavior</div>
            <div className="card-value">{overview.expectedBehaviorCount}</div>
            <div className="card-description">
              {overview.totalSystems > 0
                ? `${Math.round((overview.expectedBehaviorCount / overview.totalSystems) * 100)}% normal patterns`
                : '0%'}
            </div>
          </div>
        </div>
      </div>

      {/* System Classification Breakdown */}
      <div className="analytics-section">
        <h3>📋 System Classification (Click to view systems)</h3>
        <div className="classification-grid">
          <div
            className="classification-card stable-healthy clickable"
            onClick={() => handleClassificationClick('STABLE_HEALTHY', '✅ Stable Healthy Systems')}
            role="button"
            tabIndex={0}
          >
            <div className="classification-header">
              <span className="classification-icon">✅</span>
              <span className="classification-title">Stable Healthy</span>
            </div>
            <div className="classification-count">{overview.stableHealthy}</div>
            <div className="classification-description">
              Consistently healthy systems - continue monitoring
            </div>
          </div>

          <div
            className="classification-card flapping clickable"
            onClick={() => handleClassificationClick('FLAPPING', '🔄 Flapping Systems')}
            role="button"
            tabIndex={0}
          >
            <div className="classification-header">
              <span className="classification-icon">🔄</span>
              <span className="classification-title">Flapping</span>
            </div>
            <div className="classification-count">{overview.flapping}</div>
            <div className="classification-description">
              Normal offline/online cycles - no action needed
            </div>
          </div>

          <div
            className="classification-card recovering clickable"
            onClick={() => handleClassificationClick('RECOVERING', '⚠️ Recovering Systems')}
            role="button"
            tabIndex={0}
          >
            <div className="classification-header">
              <span className="classification-icon">⚠️</span>
              <span className="classification-title">Recovering</span>
            </div>
            <div className="classification-count">{overview.recovering}</div>
            <div className="classification-description">
              Recently improved - monitor for completion
            </div>
          </div>

          <div
            className="classification-card fully-recovered clickable"
            onClick={() => navigate(`/analytics/fully-recovered?days=${selectedPeriod}${selectedEnvironment ? `&env=${selectedEnvironment}` : ''}`)}
            role="button"
            tabIndex={0}
            title="Click to view systems that added missing tools and became fully healthy"
          >
            <div className="classification-header">
              <span className="classification-icon">✅</span>
              <span className="classification-title">Fully Recovered</span>
            </div>
            <div className="classification-count">{recoverySummary?.fullyRecovered || 0}</div>
            <div className="classification-description">
              Added missing tools, now fully healthy
            </div>
          </div>

          <div
            className="classification-card degrading clickable"
            onClick={() => handleClassificationClick('DEGRADING', '📉 Degrading Systems')}
            role="button"
            tabIndex={0}
          >
            <div className="classification-header">
              <span className="classification-icon">📉</span>
              <span className="classification-title">Degrading</span>
              <span
                className="info-tooltip"
                title="Systems that were previously healthy but have recently declined. Shows historical status and which tools stopped reporting."
              >
                ℹ️
              </span>
            </div>
            <div className="classification-count">{overview.degrading}</div>
            <div className="classification-description">
              Recently declined - shows what was healthy and what stopped reporting
            </div>
          </div>

          <div
            className="classification-card stable-unhealthy clickable"
            onClick={() => handleClassificationClick('STABLE_UNHEALTHY', '🔴 Stable Unhealthy Systems')}
            role="button"
            tabIndex={0}
          >
            <div className="classification-header">
              <span className="classification-icon">🔴</span>
              <span className="classification-title">Stable Unhealthy</span>
            </div>
            <div className="classification-count">{overview.stableUnhealthy}</div>
            <div className="classification-description">
              Consistently unhealthy - immediate remediation needed
            </div>
          </div>

          <div className="classification-card stability-score">
            <div className="classification-header">
              <span className="classification-icon">📊</span>
              <span className="classification-title">Avg Stability Score</span>
            </div>
            <div className="classification-count">{overview.averageStabilityScore}</div>
            <div className="classification-description">
              Out of 100 (higher is more stable)
            </div>
          </div>
        </div>
      </div>

      {/* Critical Insights */}
      {criticalInsights && criticalInsights.length > 0 && (
        <div className="analytics-section">
          <h3>💡 Critical Insights</h3>
          <div className="insights-list">
            {criticalInsights.map((insight: any, index: number) => (
              <div
                key={index}
                className={`insight-card insight-${insight.type} ${insight.systems && insight.systems.length > 0 ? 'clickable' : ''}`}
                onClick={() => {
                  if (insight.systems && insight.systems.length > 0) {
                    // Determine classification based on insight title
                    let classification: 'STABLE_HEALTHY' | 'STABLE_UNHEALTHY' | 'RECOVERING' | 'DEGRADING' | 'FLAPPING' | null = null;
                    if (insight.title.includes('Requires Investigation')) {
                      classification = 'STABLE_UNHEALTHY';
                    } else if (insight.title.includes('Stuck Recovery')) {
                      classification = 'RECOVERING';
                    }
                    if (classification) {
                      handleClassificationClick(classification, `💡 ${insight.title}`);
                    }
                  }
                }}
                role={insight.systems && insight.systems.length > 0 ? 'button' : undefined}
                tabIndex={insight.systems && insight.systems.length > 0 ? 0 : undefined}
                style={{ cursor: insight.systems && insight.systems.length > 0 ? 'pointer' : 'default' }}
              >
                <div className="insight-header">
                  <span className="insight-icon">
                    {insight.type === 'warning' && '⚠️'}
                    {insight.type === 'info' && 'ℹ️'}
                    {insight.type === 'success' && '✅'}
                  </span>
                  <span className="insight-title">{insight.title}</span>
                  <span className="insight-count">{insight.count}</span>
                </div>
                <div className="insight-message">{insight.message}</div>
                {insight.systems && insight.systems.length > 0 && (
                  <div className="insight-systems">
                    <strong>Systems:</strong> {insight.systems.slice(0, 5).join(', ')}
                    {insight.systems.length > 5 && ` and ${insight.systems.length - 5} more...`}
                    <span className="click-hint"> • Click to view all</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* R7 Gap Analysis */}
      {r7GapSummary && (
        <div className="analytics-section">
          <h3>🔍 Rapid7 Gap Analysis</h3>
          <div className="r7-gap-summary">
            <div className="gap-stat">
              <div className="gap-label">Expected Gaps</div>
              <div className="gap-value success">{r7GapSummary.expectedGaps}</div>
              <div className="gap-description">
                Systems recently offline or inactive - R7 correctly removed
              </div>
            </div>
            <div className="gap-stat">
              <div className="gap-label">Investigate Gaps</div>
              <div className="gap-value warning">{r7GapSummary.investigateGaps}</div>
              <div className="gap-description">
                R7 missing but other tools (Automox/Defender) present - possible R7 agent issue
              </div>
            </div>
            <div className="gap-stat">
              <div className="gap-label">Expected Percentage</div>
              <div className="gap-value info">{r7GapSummary.percentageExpected}%</div>
              <div className="gap-description">
                Of all R7 gaps are expected behavior
              </div>
            </div>
          </div>
          <div className="gap-explanation">
            <strong>Understanding R7 Behavior:</strong> Rapid7 automatically removes systems that haven't checked in for 15+ days.
            This is expected for systems that are temporarily offline or inactive. "Investigate Gaps" only counts systems where R7 is missing
            but other tools (Automox/Defender) are still present, indicating a potential R7 agent issue rather than a system being offline.
          </div>
        </div>
      )}

      {/* Recovery Status */}
      {recoverySummary && (
        <div className="analytics-section">
          <h3>⏱️ Recovery Tracking</h3>
          <div className="recovery-summary">
            <div className="recovery-stat">
              <div className="recovery-label">Normal Recovery</div>
              <div className="recovery-value success">{recoverySummary.normalRecovery}</div>
              <div className="recovery-description">
                Systems recovering within expected timeframe (&lt; 2 days)
              </div>
            </div>
            <div
              className="recovery-stat clickable"
              onClick={() => handleClassificationClick('RECOVERING', '⚠️ Stuck Recovery Systems')}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
              title="Click to view all stuck recovery systems"
            >
              <div className="recovery-label">Stuck Recovery</div>
              <div className="recovery-value warning">{recoverySummary.stuckRecovery}</div>
              <div className="recovery-description">
                Systems taking longer than expected (&gt; 3 days) - may need intervention
              </div>
              <div className="click-to-view">Click to view details</div>
            </div>
            <div className="recovery-stat">
              <div className="recovery-label">Fully Recovered</div>
              <div className="recovery-value success">{recoverySummary.fullyRecovered}</div>
              <div className="recovery-description">
                Systems that added missing tools and became fully healthy
              </div>
            </div>
            <div className="recovery-stat">
              <div className="recovery-label">Avg Recovery Time</div>
              <div className="recovery-value info">{recoverySummary.averageRecoveryTime} days</div>
              <div className="recovery-description">
                Average time for systems to fully recover
              </div>
            </div>
          </div>
          
          {/* Recovery Details Note */}
          <div className="recovery-details-note">
            <strong>💡 Recovery Intelligence:</strong> The system tracks when systems start improving
            and monitors their progress. Normal recovery completes within 2 days, while stuck recovery
            indicates systems that may need manual intervention after 3+ days. Fully recovered systems
            have successfully returned to a healthy state.
          </div>
        </div>
      )}

      {/* Tooling Combination Analysis */}
      {toolingCombinations && toolingCombinations.combinations.length > 0 && (
        <div className="analytics-section">
          <h3>🔧 Tooling Health Analysis</h3>
          <div className="tooling-combinations-summary">
            <div className="combination-stat">
              <div className="combination-label">Total Unhealthy Systems</div>
              <div className="combination-value warning">{toolingCombinations.totalUnhealthySystems}</div>
              <div className="combination-description">
                Systems missing at least one security tool
              </div>
            </div>
            <div className="combination-stat">
              <div className="combination-label">Single Tool Missing</div>
              <div className="combination-value info">{toolingCombinations.insights.systemsMissingSingleTool}</div>
              <div className="combination-description">
                {toolingCombinations.totalUnhealthySystems > 0
                  ? `${Math.round((toolingCombinations.insights.systemsMissingSingleTool / toolingCombinations.totalUnhealthySystems) * 100)}% of unhealthy systems`
                  : '0%'}
              </div>
            </div>
            <div className="combination-stat">
              <div className="combination-label">Multiple Tools Missing</div>
              <div className="combination-value warning">{toolingCombinations.insights.systemsMissingMultipleTools}</div>
              <div className="combination-description">
                {toolingCombinations.totalUnhealthySystems > 0
                  ? `${Math.round((toolingCombinations.insights.systemsMissingMultipleTools / toolingCombinations.totalUnhealthySystems) * 100)}% of unhealthy systems`
                  : '0%'}
              </div>
            </div>
            <div className="combination-stat">
              <div className="combination-label">All Tools Missing</div>
              <div className="combination-value error">{toolingCombinations.insights.systemsMissingAllTools}</div>
              <div className="combination-description">
                Critical - requires immediate attention
              </div>
            </div>
          </div>

          <div className="tooling-combinations-insight">
            <strong>💡 Key Insight:</strong>
            {toolingCombinations.insights.mostCommonSingleMissing && (
              <span> The most common single missing tool is <strong>{toolingCombinations.insights.mostCommonSingleMissing}</strong> affecting <strong>{toolingCombinations.insights.mostCommonSingleMissingCount}</strong> systems.
              Fixing this would improve health for {Math.round((toolingCombinations.insights.mostCommonSingleMissingCount / toolingCombinations.totalUnhealthySystems) * 100)}% of unhealthy systems.</span>
            )}
          </div>

          <div className="combinations-breakdown">
            <h4>Missing Tool Combinations (Click to view systems)</h4>
            <div className="combinations-list">
              {toolingCombinations.combinations.slice(0, 10).map((combo: any, index: number) => (
                <div
                  key={index}
                  className="combination-card clickable"
                  onClick={() => handleComboClick(combo)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleComboClick(combo);
                    }
                  }}
                  title="Click to view affected systems and export CSV"
                >
                  <div className="combination-header">
                    <div className="combination-tools">
                      {combo.missingTools.map((tool: string, idx: number) => (
                        <span key={idx} className="tool-badge missing">
                          {tool}
                        </span>
                      ))}
                    </div>
                    <div className="combination-stats">
                      <span className="combo-count">{combo.systemCount} systems</span>
                      <span className="combo-percentage">{combo.percentage}%</span>
                    </div>
                  </div>
                  <div className="combination-impact">
                    <div className="impact-bar">
                      <div
                        className="impact-fill"
                        style={{ width: `${combo.percentage}%` }}
                      ></div>
                    </div>
                    <div className="impact-text">
                      Fixing these systems would improve overall tooling health by <strong>{combo.potentialHealthIncrease}%</strong>
                    </div>
                  </div>
                  <div className="combination-footer">
                    <span className="click-hint">👆 Click to view all {combo.systems.length} affected systems and export CSV</span>
                  </div>
                </div>
              ))}
            </div>
            {toolingCombinations.combinations.length > 10 && (
              <div className="combinations-note">
                Showing top 10 of {toolingCombinations.combinations.length} combinations
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Items */}
      {actionItems && actionItems.length > 0 && (
        <div className="analytics-section">
          <h3>🎯 Action Items</h3>
          <div className="action-items-list">
            {actionItems.map((item: any, index: number) => (
              <div key={index} className={`action-item action-priority-${item.priority}`}>
                <div className="action-header">
                  <span className={`priority-badge priority-${item.priority}`}>
                    {item.priority.toUpperCase()}
                  </span>
                  <span
                    className="action-category clickable"
                    onClick={() => {
                      // Determine classification based on action category
                      let classification: 'STABLE_HEALTHY' | 'STABLE_UNHEALTHY' | 'RECOVERING' | 'DEGRADING' | 'FLAPPING' | null = null;
                      if (item.category.includes('Chronic Issues')) {
                        classification = 'STABLE_UNHEALTHY';
                      } else if (item.category.includes('Stuck Recovery')) {
                        classification = 'RECOVERING';
                      } else if (item.category.includes('Degrading')) {
                        classification = 'DEGRADING';
                      }
                      if (classification) {
                        handleClassificationClick(classification, `🎯 ${item.category}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    title="Click to view all affected systems"
                  >
                    {item.category}
                  </span>
                  <span className="action-count">{item.systemCount} systems</span>
                </div>
                <div className="action-description">{item.description}</div>
                {item.systems && item.systems.length > 0 && (
                  <div className="action-systems">
                    <details>
                      <summary>View systems ({item.systems.length})</summary>
                      <div className="systems-list">
                        {item.systems.map((system: string, idx: number) => (
                          <span
                            key={idx}
                            className="system-tag clickable"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSystemClick(system);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSystemClick(system);
                              }
                            }}
                          >
                            {system}
                          </span>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Takeaways */}
      <div className="analytics-section key-takeaways">
        <h3>📌 Key Takeaways</h3>
        <div className="takeaways-grid">
          <div className="takeaway-card">
            <div className="takeaway-icon">🎯</div>
            <div className="takeaway-content">
              <div className="takeaway-title">Focus Your Efforts</div>
              <div className="takeaway-text">
                Only <strong>{overview.actionableCount}</strong> out of <strong>{overview.totalSystems}</strong> systems 
                need investigation ({Math.round((overview.actionableCount / overview.totalSystems) * 100)}%). 
                The rest are showing expected behavior.
              </div>
            </div>
          </div>

          <div className="takeaway-card">
            <div className="takeaway-icon">✅</div>
            <div className="takeaway-content">
              <div className="takeaway-title">Expected Behavior</div>
              <div className="takeaway-text">
                <strong>{overview.flapping}</strong> systems are flapping (normal offline/online cycles) and 
                <strong> {overview.recovering}</strong> are recovering normally. No action needed.
              </div>
            </div>
          </div>

          <div className="takeaway-card">
            <div className="takeaway-icon">🔍</div>
            <div className="takeaway-content">
              <div className="takeaway-title">R7 Intelligence</div>
              <div className="takeaway-text">
                <strong>{r7GapSummary.percentageExpected}%</strong> of R7 gaps are expected (systems offline/inactive). 
                Only <strong>{r7GapSummary.investigateGaps}</strong> gaps need investigation.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for viewing affected systems */}
      {showModal && selectedCombo && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Systems Missing: {selectedCombo.missingTools.join(' + ')}</h3>
              <button className="modal-close" onClick={handleCloseModal} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-stats">
                <div className="modal-stat">
                  <span className="modal-stat-label">Total Systems:</span>
                  <span className="modal-stat-value">{selectedCombo.systems.length}</span>
                </div>
                <div className="modal-stat">
                  <span className="modal-stat-label">Missing Tools:</span>
                  <span className="modal-stat-value">{selectedCombo.missingTools.join(', ')}</span>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="export-csv-btn"
                  onClick={handleExportCsv}
                  disabled={exportingCsv}
                >
                  {exportingCsv ? '⏳ Exporting...' : '📥 Export to CSV'}
                </button>
              </div>
              <div className="modal-systems-list">
                <h4>Affected Systems ({selectedCombo.systems.length})</h4>
                <div className="systems-grid-modal">
                  {selectedCombo.systems.map((system: string, idx: number) => (
                    <span
                      key={idx}
                      className="system-tag clickable"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSystemClick(system);
                        handleCloseModal();
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSystemClick(system);
                          handleCloseModal();
                        }
                      }}
                    >
                      {system}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
