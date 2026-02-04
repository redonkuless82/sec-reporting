import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import { useEnvironment } from '../contexts/EnvironmentContext';
import type { HealthTrendingResponse, HealthTrendDataPoint } from '../types';
import HealthDrillDownModal from './HealthDrillDownModal';
import FiveDayActiveDrillDownModal from './FiveDayActiveDrillDownModal';
import InfoTooltip from './InfoTooltip';
import './ComplianceDashboard.css';

interface HealthDashboardProps {
  days?: number;
}

export default function HealthDashboard({ days = 30 }: HealthDashboardProps) {
  const [data, setData] = useState<HealthTrendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(days);
  const [hoveredPoint, setHoveredPoint] = useState<HealthTrendDataPoint | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new'>('fully');
  const [modalCategoryLabel, setModalCategoryLabel] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [fiveDayModalOpen, setFiveDayModalOpen] = useState(false);

  // Use global environment context
  const { selectedEnvironment } = useEnvironment();

  useEffect(() => {
    loadData();
  }, [selectedPeriod, selectedEnvironment]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemsApi.getHealthTrending(
        selectedPeriod,
        selectedEnvironment || undefined
      );
      setData(response);
    } catch (err) {
      console.error('Error loading health trending data:', err);
      setError('Failed to load health trending data');
    } finally {
      setLoading(false);
    }
  };

  const handleMouseMove = (point: HealthTrendDataPoint, event: React.MouseEvent) => {
    setHoveredPoint(point);
    setHoveredPosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoveredPosition(null);
  };

  const handleCategoryClick = (
    category: 'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new',
    label: string,
    date: string
  ) => {
    setModalCategory(category);
    setModalCategoryLabel(label);
    setModalDate(date);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
  };

  const handleFiveDayDrillDown = () => {
    console.log('5-Day drill-down clicked!');
    setFiveDayModalOpen(true);
  };

  const handleCloseFiveDayModal = () => {
    setFiveDayModalOpen(false);
  };

  const handleExportHealthy = () => {
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${apiUrl}/systems/export/healthy-systems${selectedEnvironment ? `?env=${selectedEnvironment}` : ''}`;
    window.open(url, '_blank');
  };

  const handleExportUnhealthy = () => {
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${apiUrl}/systems/export/unhealthy-systems${selectedEnvironment ? `?env=${selectedEnvironment}` : ''}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="compliance-dashboard loading">
        <div className="loading-spinner">Loading health data...</div>
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

  const { trendData, summary } = data;

  // Calculate chart dimensions and scales
  const chartWidth = 800;
  const chartHeight = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const maxSystems = Math.max(...trendData.map(d => d.totalSystems), 1);
  const maxHealth = 100;

  // Create scales
  const xScale = (index: number) => (index / (trendData.length - 1 || 1)) * innerWidth;
  const yScaleSystems = (value: number) => innerHeight - (value / maxSystems) * innerHeight;
  const yScaleHealth = (value: number) => innerHeight - (value / maxHealth) * innerHeight;

  // Generate path for health rate line
  const healthPath = trendData
    .map((d, i) => {
      const x = xScale(i);
      const y = yScaleHealth(d.healthRate);
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');

  // Generate stacked area paths
  const generateStackedPath = (
    dataKey: 'fullyHealthy' | 'partiallyHealthy' | 'unhealthy' | 'inactive',
    baseKey?: 'fullyHealthy' | 'partiallyHealthy' | 'unhealthy'
  ) => {
    const forwardPath = trendData
      .map((d, i) => {
        const x = xScale(i);
        let baseValue = 0;
        if (baseKey === 'fullyHealthy') {
          baseValue = d.fullyHealthy;
        } else if (baseKey === 'partiallyHealthy') {
          baseValue = d.fullyHealthy + d.partiallyHealthy;
        } else if (baseKey === 'unhealthy') {
          baseValue = d.fullyHealthy + d.partiallyHealthy + d.unhealthy;
        }
        const y = yScaleSystems(baseValue + d[dataKey]);
        return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
      })
      .join(' ');

    const backwardPath = trendData
      .slice()
      .reverse()
      .map((d, i) => {
        const index = trendData.length - 1 - i;
        const x = xScale(index);
        let baseValue = 0;
        if (baseKey === 'fullyHealthy') {
          baseValue = d.fullyHealthy;
        } else if (baseKey === 'partiallyHealthy') {
          baseValue = d.fullyHealthy + d.partiallyHealthy;
        } else if (baseKey === 'unhealthy') {
          baseValue = d.fullyHealthy + d.partiallyHealthy + d.unhealthy;
        }
        const y = yScaleSystems(baseValue);
        return `L ${x},${y}`;
      })
      .join(' ');

    return `${forwardPath} ${backwardPath} Z`;
  };

  return (
    <div className="compliance-dashboard">
      <div className="dashboard-header">
        <div className="header-left">
          <h2>📊 Global Health Trending</h2>
          <p className="subtitle">
            Track tooling health progress across all systems
            {selectedEnvironment && (
              <span className="env-filter-indicator"> • Filtered by: {selectedEnvironment}</span>
            )}
          </p>
        </div>
        <div className="header-controls">
          <div className="export-buttons">
            <button
              className="export-button healthy"
              onClick={handleExportHealthy}
              title="Export healthy systems as CSV"
            >
              📥 Export Healthy
            </button>
            <button
              className="export-button unhealthy"
              onClick={handleExportUnhealthy}
              title="Export unhealthy systems as CSV"
            >
              📥 Export Unhealthy
            </button>
          </div>
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
            <button
              className={selectedPeriod === 90 ? 'active' : ''}
              onClick={() => setSelectedPeriod(90)}
            >
              90 Days
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">📈</div>
          <div className="card-content">
            <div className="card-label">
              Total Systems
              <InfoTooltip
                title="Total Systems Count"
                content={
                  <div>
                    <strong>What this shows:</strong> The current total number of systems in the environment.
                    <br /><br />
                    <strong>Data Source:</strong> Aggregated from all tool imports (Intune, Rapid7, Automox, Defender).
                    <br /><br />
                    <strong>Filtering:</strong>
                    <ul>
                      <li>Excludes fake/test systems (names containing 'fake', 'test', 'demo')</li>
                      <li>Includes all systems regardless of health status</li>
                      {selectedEnvironment && <li>Filtered by environment: <strong>{selectedEnvironment}</strong></li>}
                    </ul>
                    <strong>Comparisons:</strong> Shows day-over-day and week-over-week changes to track system inventory growth or reduction.
                  </div>
                }
                position="right"
                maxWidth={350}
              />
            </div>
            <div className="card-value">{summary.totalSystemsNow}</div>
            {summary.dayOverDay && (
              <div className={`card-comparison ${summary.dayOverDay.systemsChange >= 0 ? 'positive' : 'negative'}`}>
                {summary.dayOverDay.systemsChange >= 0 ? '↑' : '↓'} {Math.abs(summary.dayOverDay.systemsChange)} vs yesterday
              </div>
            )}
            {summary.weekOverWeek && (
              <div className={`card-comparison ${summary.weekOverWeek.systemsChange >= 0 ? 'positive' : 'negative'}`}>
                {summary.weekOverWeek.systemsChange >= 0 ? '↑' : '↓'} {Math.abs(summary.weekOverWeek.systemsChange)} vs last week
              </div>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">✅</div>
          <div className="card-content">
            <div className="card-label">
              Health Rate
              <InfoTooltip
                title="Health Rate Calculation"
                content={
                  <div>
                    <strong>What this shows:</strong> The overall health percentage of active systems based on tool coverage.
                    <br /><br />
                    <strong>Calculation Method:</strong> Uses fractional scoring:
                    <ul>
                      <li><strong>3/3 tools</strong> = 100% (1.0 point)</li>
                      <li><strong>2/3 tools</strong> = 66.7% (0.67 points)</li>
                      <li><strong>1/3 tools</strong> = 33.3% (0.33 points)</li>
                      <li><strong>0/3 tools</strong> = 0% (0 points)</li>
                    </ul>
                    <strong>Formula:</strong> <code>Total Points / Active Systems × 100</code>
                    <br /><br />
                    <strong>Active Systems:</strong> Only includes systems seen in Intune within the last 15 days.
                    <br /><br />
                    <strong>Tools Counted:</strong> Rapid7, Automox, and Defender.
                    <br /><br />
                    <em>Inactive systems (15+ days) are excluded from health rate calculations.</em>
                  </div>
                }
                position="right"
                maxWidth={380}
              />
            </div>
            <div className={`card-value ${summary.healthImprovement >= 0 ? 'positive' : 'negative'}`}>
              {trendData[trendData.length - 1]?.healthRate.toFixed(1)}%
            </div>
            {summary.dayOverDay && (
              <div className={`card-comparison ${summary.dayOverDay.healthRateChange >= 0 ? 'positive' : 'negative'}`}>
                {summary.dayOverDay.healthRateChange >= 0 ? '↑' : '↓'} {Math.abs(summary.dayOverDay.healthRateChange).toFixed(1)}% vs yesterday
              </div>
            )}
            {summary.weekOverWeek && (
              <div className={`card-comparison ${summary.weekOverWeek.healthRateChange >= 0 ? 'positive' : 'negative'}`}>
                {summary.weekOverWeek.healthRateChange >= 0 ? '↑' : '↓'} {Math.abs(summary.weekOverWeek.healthRateChange).toFixed(1)}% vs last week
              </div>
            )}
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">🎯</div>
          <div className="card-content">
            <div className="card-label">
              Systems Gained Health
              <InfoTooltip
                title="Systems Gained Health"
                content={
                  <div>
                    <strong>What this shows:</strong> Number of systems that improved their health status during the selected period.
                    <br /><br />
                    <strong>How it's calculated:</strong>
                    <ul>
                      <li>Compares the first day vs. last day of the period</li>
                      <li>Counts systems with <strong>increased tool coverage</strong></li>
                      <li>Examples: 0→1 tool, 1→2 tools, 2→3 tools</li>
                    </ul>
                    <strong>Excludes:</strong>
                    <ul>
                      <li>New systems discovered during the period</li>
                      <li>Systems that became inactive</li>
                      <li>Fake/test systems</li>
                    </ul>
                    <strong>Period:</strong> Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    <br /><br />
                    <em>This metric tracks remediation success and tool deployment progress.</em>
                  </div>
                }
                position="right"
                maxWidth={380}
              />
            </div>
            <div className="card-value positive">{summary.systemsGainedHealth}</div>
            <div className="card-description">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <div className="card-label">
              Systems Lost Health
              <InfoTooltip
                title="Systems Lost Health"
                content={
                  <div>
                    <strong>What this shows:</strong> Number of systems that degraded in health status during the selected period.
                    <br /><br />
                    <strong>How it's calculated:</strong>
                    <ul>
                      <li>Compares the first day vs. last day of the period</li>
                      <li>Counts systems with <strong>decreased tool coverage</strong></li>
                      <li>Examples: 3→2 tools, 2→1 tool, 1→0 tools</li>
                    </ul>
                    <strong>Common Causes:</strong>
                    <ul>
                      <li>Agent uninstalled or stopped reporting</li>
                      <li>System removed from tool management</li>
                      <li>Network connectivity issues</li>
                      <li>System reimaged without tool reinstallation</li>
                    </ul>
                    <strong>Period:</strong> Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    <br /><br />
                    <em>⚠️ These systems require immediate investigation.</em>
                  </div>
                }
                position="right"
                maxWidth={380}
              />
            </div>
            <div className="card-value negative">{summary.systemsLostHealth}</div>
            <div className="card-description">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-title">Health Status Legend:</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color fully-compliant"></div>
            <span className="legend-label">Fully Healthy</span>
            <span className="legend-description">(Active in Intune + All 3 tools: Rapid7, Automox, Defender)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color partially-compliant"></div>
            <span className="legend-label">Partially Healthy</span>
            <span className="legend-description">(Active in Intune + 1-2 tools reporting)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color non-compliant"></div>
            <span className="legend-label">Unhealthy</span>
            <span className="legend-description">(Active in Intune but no tools reporting)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color inactive-systems"></div>
            <span className="legend-label">Inactive</span>
            <span className="legend-description">(Not seen in Intune for 15+ days)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color new-systems"></div>
            <span className="legend-label">New Systems</span>
            <span className="legend-description">(Newly discovered, may not have tooling yet)</span>
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div className="chart-container">
        <div className="chart-header-with-tooltip">
          <h3>📊 Health Trending Over Time</h3>
          <InfoTooltip
            title="Health Trending Graph Explanation"
            content={
              <div>
                <strong>What this graph shows:</strong>
                <br />
                This stacked area chart visualizes system health distribution over time, with a blue line overlay showing the overall health rate percentage.
                <br /><br />
                <strong>Graph Components:</strong>
                <ul>
                  <li><strong style={{color: '#4CAF50'}}>Green Area:</strong> Fully Healthy systems (all 3 tools reporting)</li>
                  <li><strong style={{color: '#FFC107'}}>Yellow Area:</strong> Partially Healthy systems (1-2 tools reporting)</li>
                  <li><strong style={{color: '#F44336'}}>Red Area:</strong> Unhealthy systems (0 tools reporting, but active in Intune)</li>
                  <li><strong style={{color: '#9E9E9E'}}>Gray Area:</strong> Inactive systems (not in Intune for 15+ days)</li>
                  <li><strong style={{color: '#2196F3'}}>Blue Line:</strong> Overall health rate percentage</li>
                </ul>
                <strong>Data Points:</strong> Each point represents a daily snapshot. Hover over points to see detailed breakdowns.
                <br /><br />
                <strong>Y-Axis:</strong> Number of systems (left) and health percentage (right, implied by blue line scale 0-100%).
                <br /><br />
                <strong>X-Axis:</strong> Date range based on selected period (7, 14, 30, 60, or 90 days).
                <br /><br />
                <em>The stacked areas show the total system count composition at each point in time.</em>
              </div>
            }
            position="bottom"
            maxWidth={450}
          />
        </div>
        <svg width={chartWidth} height={chartHeight} className="compliance-chart">
          <g transform={`translate(${padding.left},${padding.top})`}>
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((tick) => (
              <g key={tick}>
                <line
                  x1={0}
                  y1={yScaleSystems((tick / 100) * maxSystems)}
                  x2={innerWidth}
                  y2={yScaleSystems((tick / 100) * maxSystems)}
                  stroke="#e0e0e0"
                  strokeDasharray="2,2"
                />
                <text
                  x={-10}
                  y={yScaleSystems((tick / 100) * maxSystems)}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize="10"
                  fill="#666"
                >
                  {Math.round((tick / 100) * maxSystems)}
                </text>
              </g>
            ))}

            {/* Stacked areas */}
            <path
              d={generateStackedPath('fullyHealthy')}
              fill="rgba(76, 175, 80, 0.6)"
              className="area-fully-compliant"
            />
            <path
              d={generateStackedPath('partiallyHealthy', 'fullyHealthy')}
              fill="rgba(255, 193, 7, 0.6)"
              className="area-partially-compliant"
            />
            <path
              d={generateStackedPath('unhealthy', 'partiallyHealthy')}
              fill="rgba(244, 67, 54, 0.6)"
              className="area-non-compliant"
            />
            <path
              d={generateStackedPath('inactive', 'unhealthy')}
              fill="rgba(158, 158, 158, 0.6)"
              className="area-inactive-systems"
            />

            {/* Health rate line */}
            <path
              d={healthPath}
              fill="none"
              stroke="#2196F3"
              strokeWidth="3"
              className="compliance-line"
            />

            {/* Data points */}
            {trendData.map((point, i) => (
              <circle
                key={i}
                cx={xScale(i)}
                cy={yScaleHealth(point.healthRate)}
                r="4"
                fill="#2196F3"
                stroke="white"
                strokeWidth="2"
                className="data-point"
                onMouseMove={(e) => handleMouseMove(point, e)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: 'pointer' }}
              />
            ))}

            {/* X-axis labels */}
            {trendData.map((point, i) => {
              // Show every nth label to avoid crowding
              const showLabel = trendData.length <= 14 || i % Math.ceil(trendData.length / 10) === 0;
              if (!showLabel) return null;
              
              return (
                <text
                  key={i}
                  x={xScale(i)}
                  y={innerHeight + 20}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#666"
                >
                  {new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              );
            })}

            {/* Y-axis label */}
            <text
              x={-innerHeight / 2}
              y={-45}
              textAnchor="middle"
              fontSize="12"
              fill="#666"
              transform={`rotate(-90, -${innerHeight / 2}, -45)`}
            >
              Number of Systems
            </text>
          </g>
        </svg>

        {/* Tooltip */}
        {hoveredPoint && hoveredPosition && (
          <div
            className="chart-tooltip"
            style={{
              left: hoveredPosition.x + 10,
              top: hoveredPosition.y - 10,
            }}
          >
            <div className="tooltip-header">
              <strong>{new Date(hoveredPoint.date).toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              })}</strong>
            </div>
            <div className="tooltip-content">
              <div className="tooltip-section">
                <div className="tooltip-label">Total Systems:</div>
                <div className="tooltip-value">{hoveredPoint.totalSystems}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">Health Rate:</div>
                <div className="tooltip-value">{hoveredPoint.healthRate.toFixed(1)}%</div>
              </div>
              <div className="tooltip-divider"></div>
              <div className="tooltip-section">
                <div className="tooltip-label fully-compliant">✅ Fully Healthy:</div>
                <div className="tooltip-value">{hoveredPoint.fullyHealthy}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label partially-compliant">⚠️ Partially Healthy:</div>
                <div className="tooltip-value">{hoveredPoint.partiallyHealthy}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label non-compliant">❌ Unhealthy:</div>
                <div className="tooltip-value">{hoveredPoint.unhealthy}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label inactive-systems">⏸️ Inactive:</div>
                <div className="tooltip-value">{hoveredPoint.inactive}</div>
              </div>
              {hoveredPoint.newSystems > 0 && (
                <>
                  <div className="tooltip-divider"></div>
                  <div className="tooltip-section">
                    <div className="tooltip-label new-systems">🆕 New Systems:</div>
                    <div className="tooltip-value">{hoveredPoint.newSystems}</div>
                  </div>
                  <div className="tooltip-note">
                    New systems may not have all tooling configured yet
                  </div>
                </>
              )}
              {hoveredPoint.toolHealth && (
                <>
                  <div className="tooltip-divider"></div>
                  <div className="tooltip-section-title">Tool-Specific Reporting:</div>
                  <div className="tooltip-section">
                    <div className="tooltip-label">Rapid7:</div>
                    <div className="tooltip-value">{hoveredPoint.toolHealth.r7}</div>
                  </div>
                  <div className="tooltip-section">
                    <div className="tooltip-label">Automox:</div>
                    <div className="tooltip-value">{hoveredPoint.toolHealth.am}</div>
                  </div>
                  <div className="tooltip-section">
                    <div className="tooltip-label">Defender:</div>
                    <div className="tooltip-value">{hoveredPoint.toolHealth.df}</div>
                  </div>
                  <div className="tooltip-section">
                    <div className="tooltip-label">Intune:</div>
                    <div className="tooltip-value">{hoveredPoint.toolHealth.it}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Current Day Details */}
      {trendData.length > 0 && (
        <div className="current-day-details">
          <h3>📅 Today's Health Snapshot</h3>
          <div className="current-day-grid">
            <div className="current-day-card">
              <div className="current-day-label">Date</div>
              <div className="current-day-value">
                {new Date(trendData[trendData.length - 1].date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
            </div>
            
            <div className="current-day-card">
              <div className="current-day-label">Total Systems</div>
              <div className="current-day-value">{trendData[trendData.length - 1].totalSystems}</div>
            </div>
            
            <div className="current-day-card">
              <div className="current-day-label">Health Rate</div>
              <div className="current-day-value">{trendData[trendData.length - 1].healthRate.toFixed(1)}%</div>
            </div>
            
            <div
              className="current-day-card fully-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'fully',
                '✅ Fully Healthy Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'fully',
                    '✅ Fully Healthy Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">✅ Fully Healthy</div>
              <div className="current-day-value">{trendData[trendData.length - 1].fullyHealthy}</div>
              <div className="current-day-description">All 3 tools reporting</div>
            </div>
            
            <div
              className="current-day-card partially-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'partially',
                '⚠️ Partially Healthy Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'partially',
                    '⚠️ Partially Healthy Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">⚠️ Partially Healthy</div>
              <div className="current-day-value">{trendData[trendData.length - 1].partiallyHealthy}</div>
              <div className="current-day-description">1-2 tools reporting</div>
            </div>
            
            <div
              className="current-day-card non-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'unhealthy',
                '❌ Unhealthy Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'unhealthy',
                    '❌ Unhealthy Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">❌ Unhealthy</div>
              <div className="current-day-value">{trendData[trendData.length - 1].unhealthy}</div>
              <div className="current-day-description">No tools reporting</div>
            </div>

            <div
              className="current-day-card inactive-systems-card clickable"
              onClick={() => handleCategoryClick(
                'inactive',
                '⏸️ Inactive Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'inactive',
                    '⏸️ Inactive Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">⏸️ Inactive</div>
              <div className="current-day-value">{trendData[trendData.length - 1].inactive}</div>
              <div className="current-day-description">Not in Intune 15+ days</div>
            </div>
            
            {trendData[trendData.length - 1].newSystems > 0 && (
              <div
                className="current-day-card new-systems-card clickable"
                onClick={() => handleCategoryClick(
                  'new',
                  '🆕 New Systems',
                  trendData[trendData.length - 1].date
                )}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleCategoryClick(
                      'new',
                      '🆕 New Systems',
                      trendData[trendData.length - 1].date
                    );
                  }
                }}
              >
                <div className="current-day-label">🆕 New Systems</div>
                <div className="current-day-value">{trendData[trendData.length - 1].newSystems}</div>
                <div className="current-day-description">Discovered today</div>
              </div>
            )}
          </div>
          
          {trendData[trendData.length - 1].toolHealth && (
            <div className="tool-compliance-breakdown">
              <h4>Tool-Specific Reporting</h4>
              <div className="tool-compliance-grid">
                <div className="tool-compliance-item">
                  <span className="tool-name">Rapid7:</span>
                  <span className="tool-count">{trendData[trendData.length - 1].toolHealth.r7} systems</span>
                </div>
                <div className="tool-compliance-item">
                  <span className="tool-name">Automox:</span>
                  <span className="tool-count">{trendData[trendData.length - 1].toolHealth.am} systems</span>
                </div>
                <div className="tool-compliance-item">
                  <span className="tool-name">Defender:</span>
                  <span className="tool-count">{trendData[trendData.length - 1].toolHealth.df} systems</span>
                </div>
                <div className="tool-compliance-item">
                  <span className="tool-name">Intune:</span>
                  <span className="tool-count">{trendData[trendData.length - 1].toolHealth.it} systems</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tool Trending Section */}
      {summary.toolTrends && (
        <div className="tool-trending-section">
          <div className="section-header-with-tooltip">
            <h3>🔧 Tool Adoption Trends</h3>
            <InfoTooltip
              title="Tool Adoption Trends Explanation"
              content={
                <div>
                  <strong>What this shows:</strong> Individual tool adoption progress over the selected time period.
                  <br /><br />
                  <strong>How it's calculated:</strong>
                  <ul>
                    <li>Compares the <strong>first day</strong> vs. <strong>last day</strong> of the period</li>
                    <li>Shows absolute change (number of systems) and percentage change</li>
                    <li>Trend indicators: ↑ (up), ↓ (down), → (stable)</li>
                  </ul>
                  <strong>What counts as "reporting":</strong>
                  <ul>
                    <li><strong>Rapid7:</strong> System has a record in Rapid7 imports</li>
                    <li><strong>Automox:</strong> System has a record in Automox imports</li>
                    <li><strong>Defender:</strong> System has a record in Defender imports</li>
                    <li><strong>Intune:</strong> System seen in Intune within last 15 days</li>
                  </ul>
                  <strong>Use Case:</strong> Track individual tool deployment success and identify which tools need attention.
                  <br /><br />
                  <em>A system can report to multiple tools simultaneously.</em>
                </div>
              }
              position="bottom"
              maxWidth={420}
            />
          </div>
          <div className="tool-trends-grid">
            <div className="tool-trend-card">
              <div className="tool-trend-header">
                <span className="tool-name">Rapid7</span>
                <span className={`trend-indicator ${summary.toolTrends.r7.trend}`}>
                  {summary.toolTrends.r7.trend === 'up' && '↑'}
                  {summary.toolTrends.r7.trend === 'down' && '↓'}
                  {summary.toolTrends.r7.trend === 'stable' && '→'}
                </span>
              </div>
              <div className="tool-trend-value">{summary.toolTrends.r7.current} systems</div>
              <div className={`tool-trend-change ${summary.toolTrends.r7.change >= 0 ? 'positive' : 'negative'}`}>
                {summary.toolTrends.r7.change >= 0 ? '+' : ''}{summary.toolTrends.r7.change} ({summary.toolTrends.r7.changePercent >= 0 ? '+' : ''}{summary.toolTrends.r7.changePercent.toFixed(1)}%)
              </div>
              <div className="tool-trend-label">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>

            <div className="tool-trend-card">
              <div className="tool-trend-header">
                <span className="tool-name">Automox</span>
                <span className={`trend-indicator ${summary.toolTrends.am.trend}`}>
                  {summary.toolTrends.am.trend === 'up' && '↑'}
                  {summary.toolTrends.am.trend === 'down' && '↓'}
                  {summary.toolTrends.am.trend === 'stable' && '→'}
                </span>
              </div>
              <div className="tool-trend-value">{summary.toolTrends.am.current} systems</div>
              <div className={`tool-trend-change ${summary.toolTrends.am.change >= 0 ? 'positive' : 'negative'}`}>
                {summary.toolTrends.am.change >= 0 ? '+' : ''}{summary.toolTrends.am.change} ({summary.toolTrends.am.changePercent >= 0 ? '+' : ''}{summary.toolTrends.am.changePercent.toFixed(1)}%)
              </div>
              <div className="tool-trend-label">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>

            <div className="tool-trend-card">
              <div className="tool-trend-header">
                <span className="tool-name">Defender</span>
                <span className={`trend-indicator ${summary.toolTrends.df.trend}`}>
                  {summary.toolTrends.df.trend === 'up' && '↑'}
                  {summary.toolTrends.df.trend === 'down' && '↓'}
                  {summary.toolTrends.df.trend === 'stable' && '→'}
                </span>
              </div>
              <div className="tool-trend-value">{summary.toolTrends.df.current} systems</div>
              <div className={`tool-trend-change ${summary.toolTrends.df.change >= 0 ? 'positive' : 'negative'}`}>
                {summary.toolTrends.df.change >= 0 ? '+' : ''}{summary.toolTrends.df.change} ({summary.toolTrends.df.changePercent >= 0 ? '+' : ''}{summary.toolTrends.df.changePercent.toFixed(1)}%)
              </div>
              <div className="tool-trend-label">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>

            <div className="tool-trend-card">
              <div className="tool-trend-header">
                <span className="tool-name">Intune</span>
                <span className={`trend-indicator ${summary.toolTrends.it.trend}`}>
                  {summary.toolTrends.it.trend === 'up' && '↑'}
                  {summary.toolTrends.it.trend === 'down' && '↓'}
                  {summary.toolTrends.it.trend === 'stable' && '→'}
                </span>
              </div>
              <div className="tool-trend-value">{summary.toolTrends.it.current} systems</div>
              <div className={`tool-trend-change ${summary.toolTrends.it.change >= 0 ? 'positive' : 'negative'}`}>
                {summary.toolTrends.it.change >= 0 ? '+' : ''}{summary.toolTrends.it.change} ({summary.toolTrends.it.changePercent >= 0 ? '+' : ''}{summary.toolTrends.it.changePercent.toFixed(1)}%)
              </div>
              <div className="tool-trend-label">Since {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
        </div>
      )}

      {/* 5-Day Consecutive Active Systems Section */}
      {summary.fiveDayActive && summary.fiveDayActive.metrics.totalSystems > 0 && (
        <div className="five-day-active-section">
          <div className="section-header-with-tooltip">
            <h3>🔥 5-Day Consecutive Active Systems</h3>
            <InfoTooltip
              title="5-Day Consecutive Active Systems"
              content={
                <div>
                  <strong>What this shows:</strong> A focused view of systems that have been consistently active for 5 consecutive days.
                  <br /><br />
                  <strong>Qualification Criteria:</strong>
                  <ul>
                    <li>System must be <strong>active in Intune</strong> (within 15 days) for each of the last 5 days</li>
                    <li>No gaps in activity allowed - must be consecutive</li>
                    <li>Excludes fake/test systems</li>
                  </ul>
                  <strong>Why this matters:</strong>
                  <ul>
                    <li>Identifies <strong>stable, reliable systems</strong> that are consistently online</li>
                    <li>These systems should have the <strong>highest tool coverage</strong></li>
                    <li>Helps identify which consistently-online systems still lack tooling</li>
                    <li>Useful for targeting remediation efforts on stable infrastructure</li>
                  </ul>
                  <strong>Health Metrics:</strong> Shows the same health categories (Fully/Partially/Unhealthy) but only for this stable subset.
                  <br /><br />
                  <em>Click any card to see the detailed drill-down of these systems.</em>
                </div>
              }
              position="bottom"
              maxWidth={450}
            />
          </div>
          <p className="section-description">
            Systems that have been continuously active (in Intune within 15 days) for the last 5 days straight
          </p>
          
          <div className="five-day-summary-cards">
            <div
              className="summary-card clickable"
              onClick={handleFiveDayDrillDown}
              style={{ cursor: 'pointer' }}
              title="Click to see detailed drill-down"
            >
              <div className="card-icon">📊</div>
              <div className="card-content">
                <div className="card-label">Total 5-Day Active</div>
                <div className="card-value">{summary.fiveDayActive.metrics.totalSystems}</div>
                <div className="card-description">Consistently online systems</div>
              </div>
            </div>

            <div
              className="summary-card clickable"
              onClick={handleFiveDayDrillDown}
              style={{ cursor: 'pointer' }}
              title="Click to see detailed drill-down"
            >
              <div className="card-icon">💚</div>
              <div className="card-content">
                <div className="card-label">Health Rate</div>
                <div className="card-value">{summary.fiveDayActive.metrics.healthRate.toFixed(1)}%</div>
                <div className="card-description">For 5-day active systems</div>
              </div>
            </div>

            <div
              className="summary-card clickable"
              onClick={handleFiveDayDrillDown}
              style={{ cursor: 'pointer' }}
              title="Click to see detailed drill-down"
            >
              <div className="card-icon">✅</div>
              <div className="card-content">
                <div className="card-label">Fully Healthy</div>
                <div className="card-value">{summary.fiveDayActive.metrics.fullyHealthy}</div>
                <div className="card-description">All 3 tools reporting</div>
              </div>
            </div>

            <div
              className="summary-card clickable"
              onClick={handleFiveDayDrillDown}
              style={{ cursor: 'pointer' }}
              title="Click to see detailed drill-down"
            >
              <div className="card-icon">⚠️</div>
              <div className="card-content">
                <div className="card-label">Partially Healthy</div>
                <div className="card-value">{summary.fiveDayActive.metrics.partiallyHealthy}</div>
                <div className="card-description">1-2 tools reporting</div>
              </div>
            </div>

            <div
              className="summary-card clickable"
              onClick={handleFiveDayDrillDown}
              style={{ cursor: 'pointer' }}
              title="Click to see detailed drill-down"
            >
              <div className="card-icon">❌</div>
              <div className="card-content">
                <div className="card-label">Unhealthy</div>
                <div className="card-value">{summary.fiveDayActive.metrics.unhealthy}</div>
                <div className="card-description">No tools reporting</div>
              </div>
            </div>
          </div>

          {/* Tool Health for 5-Day Active Systems */}
          <div className="five-day-tool-health">
            <h4>Tool Coverage for 5-Day Active Systems</h4>
            <div className="tool-compliance-grid">
              <div className="tool-compliance-item">
                <span className="tool-name">Rapid7:</span>
                <span className="tool-count">{summary.fiveDayActive.metrics.toolHealth.r7} systems</span>
                <span className="tool-percentage">
                  ({summary.fiveDayActive.metrics.totalSystems > 0
                    ? ((summary.fiveDayActive.metrics.toolHealth.r7 / summary.fiveDayActive.metrics.totalSystems) * 100).toFixed(1)
                    : 0}%)
                </span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Automox:</span>
                <span className="tool-count">{summary.fiveDayActive.metrics.toolHealth.am} systems</span>
                <span className="tool-percentage">
                  ({summary.fiveDayActive.metrics.totalSystems > 0
                    ? ((summary.fiveDayActive.metrics.toolHealth.am / summary.fiveDayActive.metrics.totalSystems) * 100).toFixed(1)
                    : 0}%)
                </span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Defender:</span>
                <span className="tool-count">{summary.fiveDayActive.metrics.toolHealth.df} systems</span>
                <span className="tool-percentage">
                  ({summary.fiveDayActive.metrics.totalSystems > 0
                    ? ((summary.fiveDayActive.metrics.toolHealth.df / summary.fiveDayActive.metrics.totalSystems) * 100).toFixed(1)
                    : 0}%)
                </span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Intune:</span>
                <span className="tool-count">{summary.fiveDayActive.metrics.toolHealth.it} systems</span>
                <span className="tool-percentage">
                  ({summary.fiveDayActive.metrics.totalSystems > 0
                    ? ((summary.fiveDayActive.metrics.toolHealth.it / summary.fiveDayActive.metrics.totalSystems) * 100).toFixed(1)
                    : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* Health Improvement Trends for 5-Day Active Systems */}
          {summary.fiveDayActive.healthImprovement && (
            <div className="five-day-improvement">
              <h4>Health Improvement Trends (5-Day Active Systems)</h4>
              <div className="improvement-grid">
                <div className="improvement-card positive">
                  <div className="improvement-icon">📈</div>
                  <div className="improvement-content">
                    <div className="improvement-label">Systems Improved</div>
                    <div className="improvement-value">{summary.fiveDayActive.healthImprovement.systemsImproved}</div>
                    <div className="improvement-description">
                      Gained tooling health over 5 days
                    </div>
                  </div>
                </div>

                <div className="improvement-card negative">
                  <div className="improvement-icon">📉</div>
                  <div className="improvement-content">
                    <div className="improvement-label">Systems Degraded</div>
                    <div className="improvement-value">{summary.fiveDayActive.healthImprovement.systemsDegraded}</div>
                    <div className="improvement-description">
                      Lost tooling health over 5 days
                    </div>
                  </div>
                </div>

                <div className="improvement-card neutral">
                  <div className="improvement-icon">➡️</div>
                  <div className="improvement-content">
                    <div className="improvement-label">Systems Stable</div>
                    <div className="improvement-value">{summary.fiveDayActive.healthImprovement.systemsStable}</div>
                    <div className="improvement-description">
                      No change in tooling health
                    </div>
                  </div>
                </div>

                <div className="improvement-card highlight">
                  <div className="improvement-icon">⭐</div>
                  <div className="improvement-content">
                    <div className="improvement-label">Average Improvement</div>
                    <div className={`improvement-value ${summary.fiveDayActive.healthImprovement.averageImprovement >= 0 ? 'positive' : 'negative'}`}>
                      {summary.fiveDayActive.healthImprovement.averageImprovement >= 0 ? '+' : ''}
                      {(summary.fiveDayActive.healthImprovement.averageImprovement * 100).toFixed(2)}%
                    </div>
                    <div className="improvement-description">
                      Average health score change
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insights Section */}
      <div className="insights-section">
        <h3>📋 Key Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">🔍</div>
            <div className="insight-content">
              <div className="insight-title">Health Scoring</div>
              <div className="insight-text">
                Health rate uses <strong>fractional scoring</strong>:
                <br />
                • 3/3 tools = 100% (1.0 point)
                <br />
                • 2/3 tools = 66.7% (0.67 points)
                <br />
                • 1/3 tools = 33.3% (0.33 points)
                <br />
                • 0/3 tools = 0% (0 points)
                <br />
                <em>Overall rate = Total points / Active systems</em>
              </div>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">📊</div>
            <div className="insight-content">
              <div className="insight-title">Understanding the Data</div>
              <div className="insight-text">
                <strong>Fully Healthy:</strong> Active in Intune (last 15 days) + all 3 tools (Rapid7, Automox, Defender).
                <br />
                <strong>Partially Healthy:</strong> Active in Intune + 1-2 tools reporting.
                <br />
                <strong>Unhealthy:</strong> Active in Intune but no tools reporting - needs immediate attention.
                <br />
                <strong>Inactive:</strong> Not seen in Intune for 15+ days.
              </div>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">🎯</div>
            <div className="insight-content">
              <div className="insight-title">Progress Tracking</div>
              <div className="insight-text">
                The dashboard distinguishes between:
                <br />
                • <strong>New systems</strong> being discovered (may not have tooling yet)
                <br />
                • <strong>Existing systems</strong> gaining health (remediation success)
                <br />
                • <strong>Existing systems</strong> losing health (need investigation)
                <br />
                <em>Fake/test systems are excluded from all calculations.</em>
              </div>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">💡</div>
            <div className="insight-content">
              <div className="insight-title">Action Items</div>
              <div className="insight-text">
                {summary.systemsLostHealth > 0 && (
                  <div className="action-item warning">
                    ⚠️ {summary.systemsLostHealth} system(s) lost health - investigate immediately
                  </div>
                )}
                {summary.systemsGainedHealth > 0 && (
                  <div className="action-item success">
                    ✅ {summary.systemsGainedHealth} system(s) gained health - great progress!
                  </div>
                )}
                {summary.newSystemsDiscovered > 0 && (
                  <div className="action-item info">
                    🆕 {summary.newSystemsDiscovered} new system(s) discovered - ensure tooling is deployed
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drill-Down Modal */}
      <HealthDrillDownModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        date={modalDate}
        category={modalCategory}
        categoryLabel={modalCategoryLabel}
        environment={selectedEnvironment || undefined}
      />

      {/* 5-Day Active Drill-Down Modal */}
      <FiveDayActiveDrillDownModal
        isOpen={fiveDayModalOpen}
        onClose={handleCloseFiveDayModal}
        date={trendData.length > 0 ? trendData[trendData.length - 1].date : ''}
        environment={selectedEnvironment || undefined}
      />
    </div>
  );
}