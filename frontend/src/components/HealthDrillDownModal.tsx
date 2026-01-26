import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { SystemHealthDetail } from '../types';
import './ComplianceDrillDownModal.css';

interface HealthDrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  category: 'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new';
  categoryLabel: string;
  environment?: string;
}

export default function HealthDrillDownModal({
  isOpen,
  onClose,
  date,
  category,
  categoryLabel,
  environment,
}: HealthDrillDownModalProps) {
  const [systems, setSystems] = useState<SystemHealthDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSystems();
    }
  }, [isOpen, date, category, environment]);

  const loadSystems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await systemsApi.getSystemsByHealthCategory(date, category, environment);
      setSystems(response.systems);
    } catch (err) {
      console.error('Error loading systems:', err);
      setError('Failed to load systems');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getToolIcon = (toolName: string, isReporting: boolean) => {
    const icons: Record<string, string> = {
      r7: '🔍',
      am: '🔧',
      df: '🛡️',
      it: '📱',
    };
    
    const toolKey = toolName.toLowerCase().substring(0, 2);
    const icon = icons[toolKey] || '•';
    
    return (
      <span
        className={`tool-icon ${isReporting ? 'reporting' : 'not-reporting'}`}
        title={`${toolName}: ${isReporting ? 'Reporting' : 'Not Reporting'}`}
      >
        {icon}
      </span>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-section">
            <h2>{categoryLabel}</h2>
            <p className="modal-subtitle">
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <button className="modal-close-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <div className="loading-spinner">Loading systems...</div>
            </div>
          )}

          {error && (
            <div className="modal-error">
              <div className="error-message">{error}</div>
            </div>
          )}

          {!loading && !error && systems.length === 0 && (
            <div className="modal-empty">
              <p>No systems found in this category.</p>
            </div>
          )}

          {!loading && !error && systems.length > 0 && (
            <>
              <div className="systems-count">
                <strong>{systems.length}</strong> system{systems.length !== 1 ? 's' : ''} found
              </div>
              
              <div className="systems-table-container">
                <table className="systems-table">
                  <thead>
                    <tr>
                      <th>Shortname</th>
                      <th>Full Name</th>
                      <th>Environment</th>
                      <th>Tools Reporting</th>
                      <th className="text-center">Tool Status</th>
                      <th>Health Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systems.map((system) => (
                      <tr key={system.shortname}>
                        <td className="system-shortname">
                          <strong>{system.shortname}</strong>
                        </td>
                        <td className="system-fullname">
                          {system.fullname || <span className="text-muted">—</span>}
                        </td>
                        <td className="system-env">
                          {system.env || <span className="text-muted">—</span>}
                        </td>
                        <td className="tools-reporting">
                          <div className="tools-list">
                            {system.toolsReporting.length > 0 ? (
                              system.toolsReporting.join(', ')
                            ) : (
                              <span className="text-muted">None</span>
                            )}
                          </div>
                          <div className="tools-count">
                            {system.toolsFound} of 3 tools
                          </div>
                        </td>
                        <td className="tool-status-icons">
                          <div className="tool-icons-grid">
                            {getToolIcon('Rapid7', system.toolStatus.r7)}
                            {getToolIcon('Automox', system.toolStatus.am)}
                            {getToolIcon('Defender', system.toolStatus.df)}
                            {getToolIcon('Intune', system.toolStatus.it)}
                          </div>
                        </td>
                        <td className="compliance-level">
                          <span className={`compliance-badge ${system.healthLevel.toLowerCase().replace(' ', '-')}`}>
                            {system.healthLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-button modal-button-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
