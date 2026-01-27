import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { analyticsApi, systemsApi } from '../services/api';
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
  healthHistory: {
    date: Date;
    healthStatus: string;
    r7Found: boolean;
    amFound: boolean;
    dfFound: boolean;
    itFound: boolean;
  }[];
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
  const systemsPerPage = 100;

  useEffect(() => {
    if (classification) {
      loadSystems();
    }
  }, [classification, days, environment]);

  useEffect(() => {
    // Filter and paginate systems
    const filtered = allSystems.filter(system =>
      system.shortname.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    const startIndex = (currentPage - 1) * systemsPerPage;
    const endIndex = startIndex + systemsPerPage;
    setDisplayedSystems(filtered.slice(startIndex, endIndex));
  }, [allSystems, currentPage, searchTerm]);

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
      
      // Fetch detailed insights for each system to get tool status
      const systemsWithDetails = await Promise.all(
        filteredSystems.map(async (system: any) => {
          try {
            const insights = await analyticsApi.getSystemInsights(system.shortname, days);
            return {
              shortname: system.shortname,
              env: system.env,
              stabilityScore: system.stabilityScore,
              classification: system.classification,
              currentHealthStatus: system.currentHealthStatus,
              recoveryStatus: system.recoveryStatus,
              recoveryDays: system.recoveryDays,
              isActionable: system.isActionable,
              actionReason: system.actionReason,
              healthHistory: insights.healthHistory || [],
            };
          } catch (err) {
            console.error(`Error loading insights for ${system.shortname}:`, err);
            return {
              shortname: system.shortname,
              env: system.env,
              stabilityScore: system.stabilityScore,
              classification: system.classification,
              currentHealthStatus: system.currentHealthStatus,
              recoveryStatus: system.recoveryStatus,
              recoveryDays: system.recoveryDays,
              isActionable: system.isActionable,
              actionReason: system.actionReason,
              healthHistory: [],
            };
          }
        })
      );
      
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

  const handleSystemClick = async (shortname: string) => {
    try {
      const system = await systemsApi.getSystem(shortname);
      // Navigate to system details (you'll need to implement this route)
      console.log('Navigate to system:', system);
    } catch (error) {
      console.error('Error loading system:', error);
    }
  };

  const getToolStatus = (system: SystemWithDetails) => {
    const latestHealth = system.healthHistory && system.healthHistory.length > 0
      ? system.healthHistory[system.healthHistory.length - 1]
      : null;

    if (!latestHealth) {
      return { r7: false, am: false, df: false, it: false };
    }

    return {
      r7: latestHealth.r7Found,
      am: latestHealth.amFound,
      df: latestHealth.dfFound,
      it: latestHealth.itFound,
    };
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
        return 'Systems that recently declined and are worsening';
      case 'STABLE_UNHEALTHY':
        return 'Systems that are consistently unhealthy - require immediate attention';
      default:
        return '';
    }
  };

  const filteredSystems = allSystems.filter(system =>
    system.shortname.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredSystems.length / systemsPerPage);

  return (
    <div className="analytics-detail-page">
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
              <div className="pagination-info">
                Showing {((currentPage - 1) * systemsPerPage) + 1}-{Math.min(currentPage * systemsPerPage, filteredSystems.length)} of {filteredSystems.length} systems
              </div>
            </div>

            {/* Systems Table */}
            {filteredSystems.length === 0 ? (
              <div className="no-systems-found">No systems match your search</div>
            ) : (
              <div className="systems-table-container">
                <table className="systems-table">
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Environment</th>
                      <th>Status</th>
                      <th>Tool Status</th>
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
                              <span className={`health-status status-${system.currentHealthStatus}`}>
                                {system.currentHealthStatus}
                              </span>
                              <div className="stability-score">
                                Score: {system.stabilityScore}/100
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="tool-status-grid">
                              <div className={`tool-badge ${toolStatus.r7 ? 'found' : 'missing'}`}>
                                {toolStatus.r7 ? '✅' : '❌'} R7
                              </div>
                              <div className={`tool-badge ${toolStatus.am ? 'found' : 'missing'}`}>
                                {toolStatus.am ? '✅' : '❌'} Automox
                              </div>
                              <div className={`tool-badge ${toolStatus.df ? 'found' : 'missing'}`}>
                                {toolStatus.df ? '✅' : '❌'} Defender
                              </div>
                              <div className={`tool-badge ${toolStatus.it ? 'found' : 'missing'}`}>
                                {toolStatus.it ? '✅' : '❌'} Intune
                              </div>
                            </div>
                          </td>
                          <td>
                            {system.recoveryStatus && system.recoveryStatus !== 'NOT_APPLICABLE' ? (
                              <div className="recovery-cell">
                                <span className={`recovery-badge status-${system.recoveryStatus.toLowerCase()}`}>
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
