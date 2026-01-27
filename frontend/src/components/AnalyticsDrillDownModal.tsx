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

export default function AnalyticsDrillDownModal({
  isOpen,
  onClose,
  classification,
  classificationLabel,
  days,
  environment,
  onSystemClick,
}: AnalyticsDrillDownModalProps) {
  const [systems, setSystems] = useState<any[]>([]);
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
      
      setSystems(filteredSystems);
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
                  <div className="col-stability">Stability Score</div>
                  <div className="col-changes">Health Changes</div>
                  <div className="col-stable-days">Stable Days</div>
                  <div className="col-status">Current Status</div>
                  <div className="col-action">Action Needed</div>
                </div>

                <div className="table-body">
                  {systems.map((system: any, index: number) => (
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
                      <div className="col-stability">
                        <span className={`stability-score score-${Math.floor(system.stabilityScore / 20)}`}>
                          {system.stabilityScore}
                        </span>
                      </div>
                      <div className="col-changes">
                        <span className="changes-count">{system.healthChangeCount}</span>
                        <span className="changes-label">in {system.daysTracked} days</span>
                      </div>
                      <div className="col-stable-days">
                        <span className="stable-days">{system.consecutiveDaysStable}</span>
                        <span className="days-label">days</span>
                      </div>
                      <div className="col-status">
                        <span className={`health-status status-${system.currentHealthStatus}`}>
                          {system.currentHealthStatus}
                        </span>
                      </div>
                      <div className="col-action">
                        {system.isActionable ? (
                          <span className="action-required">⚠️ Yes</span>
                        ) : (
                          <span className="action-not-required">✓ No</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {systems.some((s: any) => s.isActionable) && (
                <div className="actionable-systems-note">
                  <strong>⚠️ Action Required:</strong> {systems.filter((s: any) => s.isActionable).length} system(s) 
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
