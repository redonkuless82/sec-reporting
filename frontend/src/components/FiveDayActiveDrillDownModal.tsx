import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { FiveDayActiveDrillDownResponse, FiveDayActiveSystemDetail } from '../types';
import './ComplianceDashboard.css';

interface FiveDayActiveDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  environment?: string;
}

export default function FiveDayActiveDrillDownModal({
  isOpen,
  onClose,
  date,
  environment,
}: FiveDayActiveDrillDownModalProps) {
  const [data, setData] = useState<FiveDayActiveDrillDownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'degraded' | 'improved' | 'stable'>('all');
  const [filterHealthStatus, setFilterHealthStatus] = useState<'all' | 'fully' | 'partially' | 'unhealthy'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen && date) {
      loadData();
    }
  }, [isOpen, date, environment]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemsApi.getFiveDayActiveDrillDown(date, environment);
      setData(response);
    } catch (err) {
      console.error('Error loading 5-day active drill-down:', err);
      setError('Failed to load drill-down data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getHealthStatusLabel = (status: string) => {
    switch (status) {
      case 'fully': return '✅ Fully Healthy';
      case 'partially': return '⚠️ Partially Healthy';
      case 'unhealthy': return '❌ Unhealthy';
      case 'inactive': return '⏸️ Inactive';
      default: return status;
    }
  };

  const getHealthChangeIcon = (change: string) => {
    switch (change) {
      case 'improved': return '📈';
      case 'degraded': return '📉';
      case 'stable': return '➡️';
      default: return '';
    }
  };

  const getHealthChangeClass = (change: string) => {
    switch (change) {
      case 'improved': return 'positive';
      case 'degraded': return 'negative';
      case 'stable': return 'neutral';
      default: return '';
    }
  };

  const filteredSystems = data?.systems.filter((system) => {
    // Filter by health change
    if (filterStatus !== 'all' && system.healthChange !== filterStatus) {
      return false;
    }

    // Filter by current health status
    if (filterHealthStatus !== 'all' && system.currentHealthStatus !== filterHealthStatus) {
      return false;
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        system.shortname.toLowerCase().includes(term) ||
        system.fullname?.toLowerCase().includes(term) ||
        system.env?.toLowerCase().includes(term)
      );
    }

    return true;
  }) || [];

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content large-modal">
        <div className="modal-header">
          <h2>🔥 5-Day Consecutive Active Systems - Detailed Analysis</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading && (
          <div className="modal-body">
            <div className="loading-spinner">Loading drill-down data...</div>
          </div>
        )}

        {error && (
          <div className="modal-body">
            <div className="error-message">{error}</div>
          </div>
        )}

        {!loading && !error && data && (
          <div className="modal-body">
            {/* Summary Section */}
            <div className="drill-down-summary">
              <div className="summary-header">
                <h3>📊 Summary</h3>
                <p className="date-range">
                  {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' → '}
                  {new Date(data.dateRange.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {environment && <span className="env-badge"> • {environment}</span>}
                </p>
              </div>

              <div className="summary-grid">
                <div className="summary-stat">
                  <div className="stat-label">Total Systems</div>
                  <div className="stat-value">{data.summary.totalSystems}</div>
                </div>
                <div className="summary-stat positive">
                  <div className="stat-label">📈 Improved</div>
                  <div className="stat-value">{data.summary.systemsImproved}</div>
                </div>
                <div className="summary-stat negative">
                  <div className="stat-label">📉 Degraded</div>
                  <div className="stat-value">{data.summary.systemsDegraded}</div>
                </div>
                <div className="summary-stat neutral">
                  <div className="stat-label">➡️ Stable</div>
                  <div className="stat-value">{data.summary.systemsStable}</div>
                </div>
              </div>

              {/* Current Health Status Breakdown */}
              <div className="health-breakdown">
                <h4>Current Health Status</h4>
                <div className="breakdown-grid">
                  <div className="breakdown-item fully-compliant">
                    <span className="breakdown-label">✅ Fully Healthy:</span>
                    <span className="breakdown-value">{data.summary.healthStatusBreakdown.fully}</span>
                  </div>
                  <div className="breakdown-item partially-compliant">
                    <span className="breakdown-label">⚠️ Partially Healthy:</span>
                    <span className="breakdown-value">{data.summary.healthStatusBreakdown.partially}</span>
                  </div>
                  <div className="breakdown-item non-compliant">
                    <span className="breakdown-label">❌ Unhealthy:</span>
                    <span className="breakdown-value">{data.summary.healthStatusBreakdown.unhealthy}</span>
                  </div>
                </div>
              </div>

              {/* Tool Degradation Analysis */}
              <div className="tool-degradation-analysis">
                <h4>🔧 Tool-Specific Changes (Over 5 Days)</h4>
                <div className="tool-degradation-grid">
                  {Object.entries(data.summary.toolDegradation).map(([tool, stats]) => (
                    <div key={tool} className="tool-degradation-card">
                      <div className="tool-name">{tool.toUpperCase()}</div>
                      <div className="tool-stats">
                        <div className="tool-stat negative">
                          <span className="stat-icon">📉</span>
                          <span className="stat-label">Lost:</span>
                          <span className="stat-value">{stats.lost}</span>
                        </div>
                        <div className="tool-stat positive">
                          <span className="stat-icon">📈</span>
                          <span className="stat-label">Gained:</span>
                          <span className="stat-value">{stats.gained}</span>
                        </div>
                        <div className="tool-stat neutral">
                          <span className="stat-icon">➡️</span>
                          <span className="stat-label">Stable:</span>
                          <span className="stat-value">{stats.stable}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="drill-down-filters">
              <div className="filter-group">
                <label>Health Change:</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                  <option value="all">All ({data.systems.length})</option>
                  <option value="degraded">📉 Degraded ({data.summary.systemsDegraded})</option>
                  <option value="stable">➡️ Stable ({data.summary.systemsStable})</option>
                  <option value="improved">📈 Improved ({data.summary.systemsImproved})</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Current Status:</label>
                <select value={filterHealthStatus} onChange={(e) => setFilterHealthStatus(e.target.value as any)}>
                  <option value="all">All</option>
                  <option value="fully">✅ Fully Healthy ({data.summary.healthStatusBreakdown.fully})</option>
                  <option value="partially">⚠️ Partially Healthy ({data.summary.healthStatusBreakdown.partially})</option>
                  <option value="unhealthy">❌ Unhealthy ({data.summary.healthStatusBreakdown.unhealthy})</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Search:</label>
                <input
                  type="text"
                  placeholder="Search by name or environment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Systems List */}
            <div className="systems-list-container">
              <div className="systems-count">
                Showing {filteredSystems.length} of {data.systems.length} systems
              </div>

              <div className="systems-table">
                <table>
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Environment</th>
                      <th>Current Status</th>
                      <th>Health Change</th>
                      <th>Score Change</th>
                      <th>Current Tools</th>
                      <th>5-Day Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSystems.map((system) => (
                      <tr key={system.shortname} className={`health-change-${system.healthChange}`}>
                        <td>
                          <div className="system-name">
                            <strong>{system.shortname}</strong>
                            {system.fullname && <div className="system-fullname">{system.fullname}</div>}
                          </div>
                        </td>
                        <td>{system.env || 'N/A'}</td>
                        <td>
                          <span className={`health-badge ${system.currentHealthStatus}`}>
                            {getHealthStatusLabel(system.currentHealthStatus)}
                          </span>
                        </td>
                        <td>
                          <span className={`change-badge ${getHealthChangeClass(system.healthChange)}`}>
                            {getHealthChangeIcon(system.healthChange)} {system.healthChange}
                          </span>
                        </td>
                        <td>
                          <span className={system.healthScoreChange >= 0 ? 'positive' : 'negative'}>
                            {system.healthScoreChange >= 0 ? '+' : ''}{system.healthScoreChange.toFixed(2)}
                          </span>
                        </td>
                        <td>
                          <div className="tool-indicators">
                            <span className={`tool-badge ${system.currentToolStatus.r7 ? 'active' : 'inactive'}`} title="Rapid7">
                              R7
                            </span>
                            <span className={`tool-badge ${system.currentToolStatus.am ? 'active' : 'inactive'}`} title="Automox">
                              AM
                            </span>
                            <span className={`tool-badge ${system.currentToolStatus.df ? 'active' : 'inactive'}`} title="Defender">
                              DF
                            </span>
                            <span className={`tool-badge ${system.currentToolStatus.it ? 'active' : 'inactive'}`} title="Intune">
                              IT
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="daily-trend">
                            {system.dailyHealth.map((day, idx) => (
                              <div
                                key={idx}
                                className={`trend-dot ${day.healthStatus}`}
                                title={`${new Date(day.date).toLocaleDateString()}: ${getHealthStatusLabel(day.healthStatus)} (${day.healthScore.toFixed(2)})`}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredSystems.length === 0 && (
                  <div className="no-results">
                    No systems match the current filters.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
