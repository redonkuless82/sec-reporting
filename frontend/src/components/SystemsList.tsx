import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { System } from '../types';

interface SystemsListProps {
  onSystemSelect: (system: System) => void;
  onClose: () => void;
}

export default function SystemsList({ onSystemSelect, onClose }: SystemsListProps) {
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<string>('all');
  const [environments, setEnvironments] = useState<string[]>([]);

  useEffect(() => {
    loadSystems();
  }, [page]);

  const loadSystems = async () => {
    setLoading(true);
    try {
      const response = await systemsApi.getSystems('', page, 20);
      setSystems(response.data || []);
      setTotalPages(response.totalPages || 1);
      
      // Extract unique environments from all systems
      const uniqueEnvs = Array.from(new Set(
        (response.data || [])
          .map(s => s.env)
          .filter((env): env is string => env !== null && env !== undefined)
      )).sort();
      setEnvironments(uniqueEnvs);
    } catch (error) {
      console.error('Error loading systems:', error);
      setSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSystems = (systems || []).filter(system => {
    if (filter === 'all') return true;
    return system.env === filter;
  });

  const handleSelect = (system: System) => {
    onSystemSelect(system);
    onClose();
  };

  return (
    <div className="systems-list-overlay">
      <div className="systems-list-modal">
        <div className="modal-header">
          <h2>All Systems ({systems?.length || 0})</h2>
          <button onClick={onClose} className="close-button">✕</button>
        </div>

        <div className="modal-filters">
          <button
            className={filter === 'all' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {environments.map(env => (
            <button
              key={env}
              className={filter === env ? 'filter-btn active' : 'filter-btn'}
              onClick={() => setFilter(env)}
            >
              {env.charAt(0).toUpperCase() + env.slice(1)}
            </button>
          ))}
        </div>

        <div className="systems-grid">
          {loading ? (
            <div className="loading">Loading systems...</div>
          ) : (
            filteredSystems.map((system) => (
              <div
                key={system.id}
                className="system-card"
                onClick={() => handleSelect(system)}
              >
                <div className="system-shortname">{system.shortname}</div>
                {system.fullname && (
                  <div className="system-fullname">{system.fullname}</div>
                )}
                {system.env && (
                  <span className={`env-badge env-${system.env}`}>
                    {system.env}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="page-btn"
              title="Previous page"
            >
              ← Previous
            </button>
            <span className="page-info">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="page-btn"
              title="Next page"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
