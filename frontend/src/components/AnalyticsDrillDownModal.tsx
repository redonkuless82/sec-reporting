import { useState, useEffect } from 'react';
import { analyticsApi, systemsApi } from '../services/api';
import type { System } from '../types';
import './AnalyticsDrillDownModal.css';

interface AnalyticsDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  classification: 'STABLE_HEALTHY' | 'STABLE_UNHEALTHY' | 'RECOVERING' | 'DEGRADING' | 'FLAPPING' | null;
  classificationLabel: string;
  days: number;
  environment?: string;
  onSystemClick?: (system: System) => void;
}

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

export default function AnalyticsDrillDownModal({
  isOpen,
  onClose,
  classification,
  classificationLabel,
  days,
  environment,
  onSystemClick,
}: AnalyticsDrillDownModalProps) {
  const [systems, setSystems] = useState<SystemWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && classification) {
      loadSystems();
    }
  }, [isOpen, classification, days, environment]);

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
      
      setSystems(systemsWithDetails);
    } catch (err) {
      console.error('Error loading systems:', err);
      setError('Failed to load systems');
      setSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSystemClick = async (shortname: string) => {
    if (!onSystemClick) return;
    
    try {
      const system = await systemsApi.getSystem(shortname);
      onSystemClick(system);
      onClose(); // Close the modal after navigating to system
    } catch (error) {
      console.error('Error loading system:', error);
    }
  };

  const getToolStatus = (system: SystemWithDetails) => {
    // Get the most recent health history entry
    const latestHealth = system.healthHistory && system.healthHistory.length > 0
      ? system.healthHistory[system.healthHistory.length - 1]
      : null;

    if (!latestHealth) {
      return {
        r7: false,
        am: false,
        df: false,
        it: false,
      };
    }

    return {
      r7: latestHealth.r7Found,
      am: latestHealth.amFound,
      df: latestHealth.dfFound,
      it: latestHealth.itFound,
    };
  };

  if (!isOpen) return null;

  const getClassificationColor = () => {
    switch (classification) {
      case 'STABLE_HEALTHY':
        return 'var(--accent-success, #3fb950)';
      case 'FLAPPING':
        return 'var(--accent-primary, #58a6ff)';
      case 'RECOVERING':
        return 'var(--accent-warning, #d29922)';
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

  return (
    <div className="drill-down-overlay" onClick={onClose}>
      <div className="drill-down-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drill-down-header" style={{ borderLeftColor: getClassificationColor() }}>
          <div>
            <h2>{classificationLabel}</h2>
            <p className="modal-subtitle">{getClassificationDescription()}</p>
            <p className="modal-meta">
              Analyzing {days} days{environment && ` in ${environment}`}
            </p>
          </div>
          <button className="close-modal-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drill-down-content">
          {loading ? (
            <div className="modal-loading">Loading systems...</div>
          ) : error ? (
            <div className="modal-error">{error}</div>
          ) : systems.length === 0 ? (
            <div className="modal-empty">No systems found in this category</div>
          ) : (
            <>
              <div className="systems-count-header">
                <span className="count-badge">{systems.length}</span>
                <span className="count-label">systems in this category</span>
              </div>

              <div className="systems-table">
                <div className="table-header">
                  <div className="col-shortname">System</div>
                  <div className="col-env">Environment</div>
                  <div className="col-status">Current Status</div>
                  <div className="col-tools">Tool Status</div>
                  <div className="col-recovery">Recovery Info</div>
                  <div className="col-action">Action Reason</div>
                </div>

                <div className="table-body">
                  {systems.map((system, index) => {
                    const toolStatus = getToolStatus(system);
                    
                    return (
                      <div key={index} className="table-row">
                        <div className="col-shortname">
                          <span
                            className="system-name clickable"
                            onClick={() => handleSystemClick(system.shortname)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSystemClick(system.shortname);
                              }
                            }}
                            title="Click to view system details"
                          >
                            {system.shortname}
                          </span>
                        </div>
                        <div className="col-env">
                          {system.env ? (
                            <span className={`env-tag env-${system.env}`}>{system.env}</span>
                          ) : (
                            <span className="env-tag-empty">-</span>
                          )}
                        </div>
                        <div className="col-status">
                          <span className={`health-status status-${system.currentHealthStatus}`}>
                            {system.currentHealthStatus}
                          </span>
                          <div className="status-detail">
                            Stability: {system.stabilityScore}/100
                          </div>
                        </div>
                        <div className="col-tools">
                          <div className="tool-status-list">
                            <div className={`tool-item ${toolStatus.r7 ? 'tool-found' : 'tool-missing'}`}>
                              {toolStatus.r7 ? '✅' : '❌'} Rapid7
                            </div>
                            <div className={`tool-item ${toolStatus.am ? 'tool-found' : 'tool-missing'}`}>
                              {toolStatus.am ? '✅' : '❌'} Automox
                            </div>
                            <div className={`tool-item ${toolStatus.df ? 'tool-found' : 'tool-missing'}`}>
                              {toolStatus.df ? '✅' : '❌'} Defender
                            </div>
                            <div className={`tool-item ${toolStatus.it ? 'tool-found' : 'tool-missing'}`}>
                              {toolStatus.it ? '✅' : '❌'} Intune
                            </div>
                          </div>
                        </div>
                        <div className="col-recovery">
                          {system.recoveryStatus && system.recoveryStatus !== 'NOT_APPLICABLE' ? (
                            <div className="recovery-info">
                              <span className={`recovery-status status-${system.recoveryStatus.toLowerCase()}`}>
                                {system.recoveryStatus.replace(/_/g, ' ')}
                              </span>
                              {system.recoveryDays !== null && (
                                <div className="recovery-days">
                                  {system.recoveryDays} days in recovery
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="no-recovery">-</span>
                          )}
                        </div>
                        <div className="col-action">
                          {system.isActionable && system.actionReason ? (
                            <div className="action-reason">
                              <span className="action-icon">⚠️</span>
                              <span className="action-text">{system.actionReason}</span>
                            </div>
                          ) : (
                            <span className="no-action">✓ No action needed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {systems.some((s) => s.isActionable) && (
                <div className="actionable-systems-note">
                  <strong>⚠️ Action Required:</strong> {systems.filter((s) => s.isActionable).length} system(s) 
                  in this category need investigation
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
