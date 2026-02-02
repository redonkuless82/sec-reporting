import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import './AnalyticsDetailPage.css';

interface SystemWithDetails {
  shortname: string;
  env: string | null;
  stabilityScore: number;
  classification: string;
  currentHealthStatus: string;
  recoveryStatus: string;
  recoveryDays: number | null;
  isActionable: boolean;
  actionReason: string | null;
  // Current tool status
  r7Found: boolean;
  amFound: boolean;
  dfFound: boolean;
  itFound: boolean;
}

interface Tooltip {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

export default function AnalyticsDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const classification = searchParams.get('classification') as 'STABLE_HEALTHY' | 'STABLE_UNHEALTHY' | 'RECOVERING' | 'DEGRADING' | 'FLAPPING' | null;
  const label = searchParams.get('label') || 'System Details';
  const days = parseInt(searchParams.get('days') || '30');
  const environment = searchParams.get('env') || undefined;
  
  const [allSystems, setAllSystems] = useState<SystemWithDetails[]>([]);
  const [displayedSystems, setDisplayedSystems] = useState<SystemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [tooltip, setTooltip] = useState<Tooltip>({ visible: false, content: '', x: 0, y: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const systemsPerPage = 100;

  useEffect(() => {
    if (classification) {
      loadSystems();
    }
  }, [classification, days, environment]);

  // Memoize filtered systems to avoid recalculation
  const [filteredCount, setFilteredCount] = useState(0);

  useEffect(() => {
    // Filter and paginate systems
    let filtered = allSystems.filter(system =>
      system.shortname.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(system => {
        if (statusFilter === 'active') {
          return system.currentHealthStatus !== 'INACTIVE';
        } else if (statusFilter === 'inactive') {
          return system.currentHealthStatus === 'INACTIVE';
        }
        return true;
      });
    }
    
    // Update filtered count for pagination
    setFilteredCount(filtered.length);
    
    const startIndex = (currentPage - 1) * systemsPerPage;
    const endIndex = startIndex + systemsPerPage;
    setDisplayedSystems(filtered.slice(startIndex, endIndex));
  }, [allSystems, currentPage, searchTerm, statusFilter]);

  const loadSystems = async () => {
    if (!classification) return;

    setLoading(true);
    setError(null);
    try {
      const response = await analyticsApi.getSystemClassification(days, environment);
      
      // Filter systems by classification
      const filteredSystems = response.systems.filter(
        (system: any) => system.classification === classification
      );
      
      // Map systems with current tool status from backend
      const systemsWithDetails = filteredSystems.map((system: any) => ({
        shortname: system.shortname,
        env: system.env,
        stabilityScore: system.stabilityScore,
        classification: system.classification,
        currentHealthStatus: system.currentHealthStatus,
        recoveryStatus: system.recoveryStatus,
        recoveryDays: system.recoveryDays,
        isActionable: system.isActionable,
        actionReason: system.actionReason,
        // Current tool status from backend
        r7Found: system.r7Found || false,
        amFound: system.amFound || false,
        dfFound: system.dfFound || false,
        itFound: system.itFound || false,
      }));
      
      setAllSystems(systemsWithDetails);
      setCurrentPage(1); // Reset to first page
    } catch (err) {
      console.error('Error loading systems:', err);
      setError('Failed to load systems');
      setAllSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSystemClick = (shortname: string) => {
    // Navigate to home page with system parameter
    navigate(`/?system=${encodeURIComponent(shortname)}`);
  };

  const getToolStatus = (system: SystemWithDetails) => {
    return {
      r7: system.r7Found,
      am: system.amFound,
      df: system.dfFound,
      it: system.itFound,
    };
  };

  const showTooltip = (content: string, event: React.MouseEvent) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setTooltip({
      visible: true,
      content,
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
    });
  };

  const hideTooltip = () => {
    setTooltip({ visible: false, content: '', x: 0, y: 0 });
  };

  const getStatusTooltip = (status: string) => {
    switch (status) {
      case 'FULLY_HEALTHY':
        return 'All 3 security tools (R7, Automox, Defender) are reporting. Health Score: 100%';
      case 'PARTIALLY_HEALTHY':
        return 'Only 1-2 security tools are reporting. Health Score: 33%-67%';
      case 'UNHEALTHY':
        return 'No security tools are reporting but system is active in Intune. Health Score: 0%';
      case 'INACTIVE':
        return 'System has not checked into Intune for 15+ days or is not in Intune. Excluded from health calculations.';
      default:
        return status;
    }
  };

  const getStabilityScoreTooltip = (score: number) => {
    if (score >= 90) {
      return `Stability Score: ${score}/100 - Excellent. System has been consistently healthy with minimal fluctuations.`;
    } else if (score >= 70) {
      return `Stability Score: ${score}/100 - Good. System is mostly stable with some minor variations.`;
    } else if (score >= 50) {
      return `Stability Score: ${score}/100 - Fair. System shows moderate instability or recent changes.`;
    } else {
      return `Stability Score: ${score}/100 - Poor. System has significant instability or chronic issues.`;
    }
  };

  const getClassificationColor = () => {
    switch (classification) {
      case 'STABLE_HEALTHY':
        return 'var(--accent-success, #3fb950)';
      case 'FLAPPING':
        return 'var(--accent-primary, #58a6ff)';
      case 'RECOVERING':
        return 'var(--accent-warning, #f5a623)';
      case 'DEGRADING':
        return '#ff6b35';
      case 'STABLE_UNHEALTHY':
        return 'var(--accent-danger, #f85149)';
      default:
        return 'var(--text-primary, #f0f6fc)';
    }
  };

  const getClassificationDescription = () => {
    switch (classification) {
      case 'STABLE_HEALTHY':
        return 'Systems that are consistently healthy with all tools reporting';
      case 'FLAPPING':
        return 'Systems with frequent status changes - likely normal offline/online cycles';
      case 'RECOVERING':
        return 'Systems that recently improved and are stabilizing';
      case 'DEGRADING':
        return 'Systems that recently declined and are worsening - shows what was healthy and what stopped reporting';
      case 'STABLE_UNHEALTHY':
        return 'Systems that are consistently unhealthy - require immediate attention';
      default:
        return '';
    }
  };

  const totalPages = Math.ceil(filteredCount / systemsPerPage);

  return (
    <div className="analytics-detail-page">
      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="custom-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 10000,
          }}
        >
          {tooltip.content}
        </div>
      )}

      <div className="detail-page-header" style={{ borderLeftColor: getClassificationColor() }}>
        <div className="header-content">
          <button className="back-button" onClick={() => navigate(-1)}>
            ← Back to Analytics
          </button>
          <div className="header-info">
            <h1>{label}</h1>
            <p className="page-subtitle">{getClassificationDescription()}</p>
            <p className="page-meta">
              Analyzing {days} days{environment && ` • Environment: ${environment}`}
            </p>
          </div>
        </div>
      </div>

      <div className="detail-page-content">
        {loading ? (
          <div className="page-loading">
            <div className="loading-spinner">Loading systems...</div>
          </div>
        ) : error ? (
          <div className="page-error">{error}</div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="summary-stats">
              <div className="stat-card">
                <div className="stat-label">Total Systems</div>
                <div className="stat-value">{allSystems.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Actionable</div>
                <div className="stat-value warning">
                  {allSystems.filter(s => s.isActionable).length}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">In Recovery</div>
                <div className="stat-value info">
                  {allSystems.filter(s => s.recoveryStatus && s.recoveryStatus !== 'NOT_APPLICABLE').length}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Stability</div>
                <div className="stat-value">
                  {allSystems.length > 0 
                    ? Math.round(allSystems.reduce((sum, s) => sum + s.stabilityScore, 0) / allSystems.length)
                    : 0}
                </div>
              </div>
            </div>

            {/* Info Banner for Degrading Systems */}
            {classification === 'DEGRADING' && (
              <div className="info-banner degrading-info">
                <div className="banner-icon">📉</div>
                <div className="banner-content">
                  <h4>Understanding Degrading Systems</h4>
                  <p>
                    These systems were previously healthy but have recently declined. The table below shows:
                  </p>
                  <ul>
                    <li><strong>Historical Status:</strong> Whether the system was healthy in the past</li>
                    <li><strong>What Changed:</strong> Which tools stopped reporting and when</li>
                    <li><strong>Time Not Reporting:</strong> How many days each tool has been missing</li>
                  </ul>
                  <p className="banner-tip">
                    💡 <strong>Tip:</strong> Hover over status badges and scores for detailed explanations
                  </p>
                </div>
              </div>
            )}

            {/* Search and Pagination Controls */}
            <div className="controls-bar">
              <input
                type="text"
                className="search-input"
                placeholder="Search systems..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
              <div className="status-filter">
                <label htmlFor="status-filter">Status:</label>
                <select
                  id="status-filter"
                  className="status-filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Systems</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>
              <div className="pagination-info">
                Showing {((currentPage - 1) * systemsPerPage) + 1}-{Math.min(currentPage * systemsPerPage, filteredCount)} of {filteredCount} systems
              </div>
            </div>

            {/* Systems Table */}
            {filteredCount === 0 ? (
              <div className="no-systems-found">No systems match your search</div>
            ) : (
              <div className="systems-table-container">
                <table className="systems-table">
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Environment</th>
                      <th>
                        Current Status
                        <span 
                          className="info-icon"
                          onMouseEnter={(e) => showTooltip('Current health status based on security tool reporting', e)}
                          onMouseLeave={hideTooltip}
                        >
                          ℹ️
                        </span>
                      </th>
                      <th>Tool Status (Current)</th>
                      <th>Recovery</th>
                      <th>Action Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSystems.map((system, index) => {
                      const toolStatus = getToolStatus(system);
                      
                      return (
                        <tr key={index}>
                          <td>
                            <span
                              className="system-name clickable"
                              onClick={() => handleSystemClick(system.shortname)}
                              role="button"
                              tabIndex={0}
                              title="Click to view system details"
                            >
                              {system.shortname}
                            </span>
                          </td>
                          <td>
                            {system.env ? (
                              <span className={`env-tag env-${system.env}`}>{system.env}</span>
                            ) : (
                              <span className="env-tag-empty">-</span>
                            )}
                          </td>
                          <td>
                            <div className="status-cell">
                              <span 
                                className={`health-status status-${system.currentHealthStatus}`}
                                onMouseEnter={(e) => showTooltip(getStatusTooltip(system.currentHealthStatus), e)}
                                onMouseLeave={hideTooltip}
                              >
                                {system.currentHealthStatus}
                              </span>
                              <div 
                                className="stability-score"
                                onMouseEnter={(e) => showTooltip(getStabilityScoreTooltip(system.stabilityScore), e)}
                                onMouseLeave={hideTooltip}
                              >
                                Score: {system.stabilityScore}/100
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="tool-status-grid">
                              <div 
                                className={`tool-badge ${toolStatus.r7 ? 'found' : 'missing'}`}
                                onMouseEnter={(e) => showTooltip(
                                  toolStatus.r7 
                                    ? 'Rapid7 is currently reporting' 
                                    : 'Rapid7 is NOT reporting - vulnerability scanning may be offline',
                                  e
                                )}
                                onMouseLeave={hideTooltip}
                              >
                                {toolStatus.r7 ? '✅' : '❌'} R7
                              </div>
                              <div 
                                className={`tool-badge ${toolStatus.am ? 'found' : 'missing'}`}
                                onMouseEnter={(e) => showTooltip(
                                  toolStatus.am 
                                    ? 'Automox is currently reporting' 
                                    : 'Automox is NOT reporting - patch management may be offline',
                                  e
                                )}
                                onMouseLeave={hideTooltip}
                              >
                                {toolStatus.am ? '✅' : '❌'} Automox
                              </div>
                              <div 
                                className={`tool-badge ${toolStatus.df ? 'found' : 'missing'}`}
                                onMouseEnter={(e) => showTooltip(
                                  toolStatus.df 
                                    ? 'Defender is currently reporting' 
                                    : 'Defender is NOT reporting - endpoint protection may be offline',
                                  e
                                )}
                                onMouseLeave={hideTooltip}
                              >
                                {toolStatus.df ? '✅' : '❌'} Defender
                              </div>
                              <div 
                                className={`tool-badge ${toolStatus.it ? 'found' : 'missing'}`}
                                onMouseEnter={(e) => showTooltip(
                                  toolStatus.it 
                                    ? 'Intune is currently reporting' 
                                    : 'Intune is NOT reporting - system may be offline',
                                  e
                                )}
                                onMouseLeave={hideTooltip}
                              >
                                {toolStatus.it ? '✅' : '❌'} Intune
                              </div>
                            </div>
                          </td>
                          <td>
                            {system.recoveryStatus && system.recoveryStatus !== 'NOT_APPLICABLE' ? (
                              <div className="recovery-cell">
                                <span 
                                  className={`recovery-badge status-${system.recoveryStatus.toLowerCase()}`}
                                  onMouseEnter={(e) => showTooltip(
                                    system.recoveryStatus === 'NORMAL_RECOVERY' 
                                      ? 'System is recovering within expected timeframe (< 2 days)' 
                                      : 'System recovery is taking longer than expected (> 3 days) - may need intervention',
                                    e
                                  )}
                                  onMouseLeave={hideTooltip}
                                >
                                  {system.recoveryStatus.replace(/_/g, ' ')}
                                </span>
                                {system.recoveryDays !== null && (
                                  <div className="recovery-days-text">
                                    {system.recoveryDays} days
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="no-data">-</span>
                            )}
                          </td>
                          <td>
                            {system.isActionable && system.actionReason ? (
                              <div className="action-cell">
                                <span className="action-icon">⚠️</span>
                                <span className="action-text">{system.actionReason}</span>
                              </div>
                            ) : (
                              <span className="no-action">✓ No action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  « First
                </button>
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  ‹ Previous
                </button>
                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next ›
                </button>
                <button
                  className="page-btn"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last »
                </button>
              </div>
            )}

            {/* Action Summary */}
            {allSystems.some(s => s.isActionable) && (
              <div className="action-summary">
                <h3>⚠️ Action Required Summary</h3>
                <p>
                  <strong>{allSystems.filter(s => s.isActionable).length}</strong> out of <strong>{allSystems.length}</strong> systems 
                  in this category require immediate attention.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
