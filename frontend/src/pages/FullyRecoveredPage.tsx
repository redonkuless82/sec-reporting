import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/api';
import './AnalyticsDetailPage.css';

interface RecoveredSystem {
  shortname: string;
  status: string;
  recoveryStartDate: Date | null;
  daysSinceRecoveryStart: number | null;
  currentHealth: string;
  previousHealth: string | null;
  explanation: string;
  toolsRecovered?: {
    r7: boolean;
    automox: boolean;
    defender: boolean;
    intune: boolean;
  };
}

export default function FullyRecoveredPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const days = parseInt(searchParams.get('days') || '30');
  const environment = searchParams.get('env') || undefined;
  
  const [systems, setSystems] = useState<RecoveredSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSystems();
  }, [days, environment]);

  const loadSystems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await analyticsApi.getRecoveryStatus(days, environment);
      setSystems(response.fullyRecoveredSystems || []);
    } catch (err) {
      console.error('Error loading fully recovered systems:', err);
      setError('Failed to load systems');
      setSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSystemClick = (shortname: string) => {
    navigate(`/?system=${encodeURIComponent(shortname)}`);
  };

  return (
    <div className="analytics-detail-page">
      <div className="detail-page-header" style={{ borderLeftColor: 'var(--accent-success, #3fb950)' }}>
        <div className="header-content">
          <button className="back-button" onClick={() => navigate(-1)}>
            ← Back to Analytics
          </button>
          <div className="header-info">
            <h1>✅ Fully Recovered Systems</h1>
            <p className="page-subtitle">
              Systems that successfully recovered to fully healthy state within the reporting period
            </p>
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
            <div className="summary-stats">
              <div className="stat-card">
                <div className="stat-label">Total Recovered</div>
                <div className="stat-value success">{systems.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Recovery Time</div>
                <div className="stat-value">
                  {systems.length > 0
                    ? Math.round(
                        systems.reduce((sum, s) => sum + (s.daysSinceRecoveryStart || 0), 0) / systems.length
                      )
                    : 0}{' '}
                  days
                </div>
              </div>
            </div>

            {systems.length === 0 ? (
              <div className="no-systems-found">
                No systems fully recovered within the last {days} days
              </div>
            ) : (
              <div className="systems-table-container">
                <table className="systems-table">
                  <thead>
                    <tr>
                      <th>System</th>
                      <th>Recovery Time</th>
                      <th>Previous State</th>
                      <th>Tools Recovered</th>
                      <th>Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((system, index) => (
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
                          <div className="recovery-days-text">
                            {system.daysSinceRecoveryStart || 0} days
                          </div>
                        </td>
                        <td>
                          <span className={`health-status status-${system.previousHealth}`}>
                            {system.previousHealth?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </td>
                        <td>
                          {system.toolsRecovered && (
                            <div className="tools-recovered-badges">
                              {system.toolsRecovered.r7 && (
                                <span className="tool-recovered-badge">✅ R7</span>
                              )}
                              {system.toolsRecovered.automox && (
                                <span className="tool-recovered-badge">✅ Automox</span>
                              )}
                              {system.toolsRecovered.defender && (
                                <span className="tool-recovered-badge">✅ Defender</span>
                              )}
                              {system.toolsRecovered.intune && (
                                <span className="tool-recovered-badge">✅ Intune</span>
                              )}
                              {!system.toolsRecovered.r7 &&
                                !system.toolsRecovered.automox &&
                                !system.toolsRecovered.defender &&
                                !system.toolsRecovered.intune && (
                                  <span className="no-tools-recovered">No new tools</span>
                                )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="explanation-text">{system.explanation}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
