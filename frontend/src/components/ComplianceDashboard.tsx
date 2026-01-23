import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { ComplianceTrendingResponse, ComplianceTrendDataPoint } from '../types';
import ComplianceDrillDownModal from './ComplianceDrillDownModal';
import './ComplianceDashboard.css';

interface ComplianceDashboardProps {
  days?: number;
}

export default function ComplianceDashboard({ days = 30 }: ComplianceDashboardProps) {
  const [data, setData] = useState<ComplianceTrendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(days);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('');
  const [environments, setEnvironments] = useState<string[]>([]);
  const [environmentsLoading, setEnvironmentsLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<ComplianceTrendDataPoint | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<'fully' | 'partially' | 'non' | 'new'>('fully');
  const [modalCategoryLabel, setModalCategoryLabel] = useState('');
  const [modalDate, setModalDate] = useState('');

  useEffect(() => {
    loadEnvironments();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedPeriod, selectedEnvironment]);

  const loadEnvironments = async () => {
    setEnvironmentsLoading(true);
    try {
      const response = await systemsApi.getEnvironments();
      setEnvironments(response.environments);
    } catch (err) {
      console.error('Error loading environments:', err);
      // If loading fails, continue with empty list
      setEnvironments([]);
    } finally {
      setEnvironmentsLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemsApi.getComplianceTrending(
        selectedPeriod,
        selectedEnvironment || undefined
      );
      setData(response);
    } catch (err) {
      console.error('Error loading compliance trending data:', err);
      setError('Failed to load compliance trending data');
    } finally {
      setLoading(false);
    }
  };

  const handleMouseMove = (point: ComplianceTrendDataPoint, event: React.MouseEvent) => {
    setHoveredPoint(point);
    setHoveredPosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoveredPosition(null);
  };

  const handleCategoryClick = (
    category: 'fully' | 'partially' | 'non' | 'new',
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

  if (loading) {
    return (
      <div className="compliance-dashboard loading">
        <div className="loading-spinner">Loading compliance data...</div>
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
  const maxCompliance = 100;

  // Create scales
  const xScale = (index: number) => (index / (trendData.length - 1 || 1)) * innerWidth;
  const yScaleSystems = (value: number) => innerHeight - (value / maxSystems) * innerHeight;
  const yScaleCompliance = (value: number) => innerHeight - (value / maxCompliance) * innerHeight;

  // Generate path for compliance rate line
  const compliancePath = trendData
    .map((d, i) => {
      const x = xScale(i);
      const y = yScaleCompliance(d.complianceRate);
      return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');

  // Generate stacked area paths
  const generateStackedPath = (
    dataKey: 'fullyCompliant' | 'partiallyCompliant' | 'nonCompliant',
    baseKey?: 'fullyCompliant' | 'partiallyCompliant'
  ) => {
    const forwardPath = trendData
      .map((d, i) => {
        const x = xScale(i);
        let baseValue = 0;
        if (baseKey === 'fullyCompliant') {
          baseValue = d.fullyCompliant;
        } else if (baseKey === 'partiallyCompliant') {
          baseValue = d.fullyCompliant + d.partiallyCompliant;
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
        if (baseKey === 'fullyCompliant') {
          baseValue = d.fullyCompliant;
        } else if (baseKey === 'partiallyCompliant') {
          baseValue = d.fullyCompliant + d.partiallyCompliant;
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
          <h2>📊 Global Compliance Trending</h2>
          <p className="subtitle">Track compliance progress across all systems</p>
        </div>
        <div className="header-controls">
          <div className="environment-selector">
            <label htmlFor="env-select">Environment:</label>
            <select
              id="env-select"
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="env-select"
              disabled={environmentsLoading}
            >
              <option value="">All Environments</option>
              {environmentsLoading ? (
                <option disabled>Loading environments...</option>
              ) : environments.length === 0 ? (
                <option disabled>No environments found</option>
              ) : (
                environments.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))
              )}
            </select>
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
            <div className="card-label">Total Systems</div>
            <div className="card-value">{summary.totalSystemsNow}</div>
            <div className={`card-change ${summary.newSystemsDiscovered >= 0 ? 'positive' : 'negative'}`}>
              {summary.newSystemsDiscovered >= 0 ? '+' : ''}{summary.newSystemsDiscovered} from start
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">✅</div>
          <div className="card-content">
            <div className="card-label">Compliance Improvement</div>
            <div className={`card-value ${summary.complianceImprovement >= 0 ? 'positive' : 'negative'}`}>
              {summary.complianceImprovement >= 0 ? '+' : ''}{summary.complianceImprovement.toFixed(1)}%
            </div>
            <div className="card-description">
              {summary.complianceImprovement >= 0 ? 'Improving' : 'Declining'}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">🎯</div>
          <div className="card-content">
            <div className="card-label">Systems Gained Compliance</div>
            <div className="card-value positive">{summary.systemsGainedCompliance}</div>
            <div className="card-description">Remediated systems</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <div className="card-label">Systems Lost Compliance</div>
            <div className="card-value negative">{summary.systemsLostCompliance}</div>
            <div className="card-description">Need attention</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="chart-legend">
        <div className="legend-title">Compliance Status Legend:</div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color fully-compliant"></div>
            <span className="legend-label">Fully Compliant</span>
            <span className="legend-description">(All 5 tools: Rapid7, Automox, Defender, Intune, VMware)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color partially-compliant"></div>
            <span className="legend-label">Partially Compliant</span>
            <span className="legend-description">(3-4 tools reporting)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color non-compliant"></div>
            <span className="legend-label">Non-Compliant</span>
            <span className="legend-description">(0-2 tools reporting)</span>
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
              d={generateStackedPath('fullyCompliant')}
              fill="rgba(76, 175, 80, 0.6)"
              className="area-fully-compliant"
            />
            <path
              d={generateStackedPath('partiallyCompliant', 'fullyCompliant')}
              fill="rgba(255, 193, 7, 0.6)"
              className="area-partially-compliant"
            />
            <path
              d={generateStackedPath('nonCompliant', 'partiallyCompliant')}
              fill="rgba(244, 67, 54, 0.6)"
              className="area-non-compliant"
            />

            {/* Compliance rate line */}
            <path
              d={compliancePath}
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
                cy={yScaleCompliance(point.complianceRate)}
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
                <div className="tooltip-label">Compliance Rate:</div>
                <div className="tooltip-value">{hoveredPoint.complianceRate.toFixed(1)}%</div>
              </div>
              <div className="tooltip-divider"></div>
              <div className="tooltip-section">
                <div className="tooltip-label fully-compliant">✅ Fully Compliant:</div>
                <div className="tooltip-value">{hoveredPoint.fullyCompliant}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label partially-compliant">⚠️ Partially Compliant:</div>
                <div className="tooltip-value">{hoveredPoint.partiallyCompliant}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label non-compliant">❌ Non-Compliant:</div>
                <div className="tooltip-value">{hoveredPoint.nonCompliant}</div>
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
              <div className="tooltip-divider"></div>
              <div className="tooltip-section-title">Tool-Specific Compliance:</div>
              <div className="tooltip-section">
                <div className="tooltip-label">Rapid7:</div>
                <div className="tooltip-value">{hoveredPoint.toolCompliance.r7}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">Automox:</div>
                <div className="tooltip-value">{hoveredPoint.toolCompliance.am}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">Defender:</div>
                <div className="tooltip-value">{hoveredPoint.toolCompliance.df}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">Intune:</div>
                <div className="tooltip-value">{hoveredPoint.toolCompliance.it}</div>
              </div>
              <div className="tooltip-section">
                <div className="tooltip-label">VMware:</div>
                <div className="tooltip-value">{hoveredPoint.toolCompliance.vm}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current Day Details */}
      {trendData.length > 0 && (
        <div className="current-day-details">
          <h3>📅 Today's Compliance Snapshot</h3>
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
              <div className="current-day-label">Compliance Rate</div>
              <div className="current-day-value">{trendData[trendData.length - 1].complianceRate.toFixed(1)}%</div>
            </div>
            
            <div
              className="current-day-card fully-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'fully',
                '✅ Fully Compliant Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'fully',
                    '✅ Fully Compliant Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">✅ Fully Compliant</div>
              <div className="current-day-value">{trendData[trendData.length - 1].fullyCompliant}</div>
              <div className="current-day-description">All 5 tools reporting</div>
            </div>
            
            <div
              className="current-day-card partially-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'partially',
                '⚠️ Partially Compliant Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'partially',
                    '⚠️ Partially Compliant Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">⚠️ Partially Compliant</div>
              <div className="current-day-value">{trendData[trendData.length - 1].partiallyCompliant}</div>
              <div className="current-day-description">3-4 tools reporting</div>
            </div>
            
            <div
              className="current-day-card non-compliant-card clickable"
              onClick={() => handleCategoryClick(
                'non',
                '❌ Non-Compliant Systems',
                trendData[trendData.length - 1].date
              )}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCategoryClick(
                    'non',
                    '❌ Non-Compliant Systems',
                    trendData[trendData.length - 1].date
                  );
                }
              }}
            >
              <div className="current-day-label">❌ Non-Compliant</div>
              <div className="current-day-value">{trendData[trendData.length - 1].nonCompliant}</div>
              <div className="current-day-description">0-2 tools reporting</div>
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
          
          <div className="tool-compliance-breakdown">
            <h4>Tool-Specific Compliance</h4>
            <div className="tool-compliance-grid">
              <div className="tool-compliance-item">
                <span className="tool-name">Rapid7:</span>
                <span className="tool-count">{trendData[trendData.length - 1].toolCompliance.r7} systems</span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Automox:</span>
                <span className="tool-count">{trendData[trendData.length - 1].toolCompliance.am} systems</span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Defender:</span>
                <span className="tool-count">{trendData[trendData.length - 1].toolCompliance.df} systems</span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">Intune:</span>
                <span className="tool-count">{trendData[trendData.length - 1].toolCompliance.it} systems</span>
              </div>
              <div className="tool-compliance-item">
                <span className="tool-name">VMware:</span>
                <span className="tool-count">{trendData[trendData.length - 1].toolCompliance.vm} systems</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Insights Section */}
      <div className="insights-section">
        <h3>📋 Key Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">🔍</div>
            <div className="insight-content">
              <div className="insight-title">What This Shows</div>
              <div className="insight-text">
                This dashboard tracks compliance across all systems over time. The stacked area chart shows 
                the distribution of systems by compliance level, while the blue line shows the overall 
                compliance rate percentage.
              </div>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">📊</div>
            <div className="insight-content">
              <div className="insight-title">Understanding the Data</div>
              <div className="insight-text">
                <strong>Fully Compliant:</strong> Systems reporting to all 5 tools (Rapid7, Automox, Defender, Intune, VMware).
                <br />
                <strong>Partially Compliant:</strong> Systems reporting to 3-4 tools.
                <br />
                <strong>Non-Compliant:</strong> Systems reporting to 0-2 tools - these need immediate attention.
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
                • <strong>Existing systems</strong> gaining compliance (remediation success)
                <br />
                • <strong>Existing systems</strong> losing compliance (need investigation)
              </div>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">💡</div>
            <div className="insight-content">
              <div className="insight-title">Action Items</div>
              <div className="insight-text">
                {summary.systemsLostCompliance > 0 && (
                  <div className="action-item warning">
                    ⚠️ {summary.systemsLostCompliance} system(s) lost compliance - investigate immediately
                  </div>
                )}
                {summary.systemsGainedCompliance > 0 && (
                  <div className="action-item success">
                    ✅ {summary.systemsGainedCompliance} system(s) gained compliance - great progress!
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
      <ComplianceDrillDownModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        date={modalDate}
        category={modalCategory}
        categoryLabel={modalCategoryLabel}
        environment={selectedEnvironment || undefined}
      />
    </div>
  );
}
