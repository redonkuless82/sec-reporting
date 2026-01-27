import { useEnvironment } from '../contexts/EnvironmentContext';
import './NavigationBar.css';

interface NavigationBarProps {
  currentView: 'systems' | 'health' | 'analytics';
  onViewChange: (view: 'systems' | 'health' | 'analytics') => void;
}

export default function NavigationBar({ currentView, onViewChange }: NavigationBarProps) {
  const { selectedEnvironment, setSelectedEnvironment, environments, environmentsLoading } = useEnvironment();

  return (
    <nav className="navigation-bar">
      <div className="nav-content">
        <div className="nav-left">
          <div className="nav-brand">
            <span className="nav-icon">🏥</span>
            <span className="nav-title">Tooling Health Dashboard</span>
          </div>
          
          <div className="nav-links">
            <button
              className={`nav-link ${currentView === 'systems' ? 'active' : ''}`}
              onClick={() => onViewChange('systems')}
              title="View systems list"
            >
              <span className="nav-link-icon">📋</span>
              <span className="nav-link-text">Systems</span>
            </button>
            <button
              className={`nav-link ${currentView === 'health' ? 'active' : ''}`}
              onClick={() => onViewChange('health')}
              title="View health trending dashboard"
            >
              <span className="nav-link-icon">📊</span>
              <span className="nav-link-text">Health Trending</span>
            </button>
            <button
              className={`nav-link ${currentView === 'analytics' ? 'active' : ''}`}
              onClick={() => onViewChange('analytics')}
              title="View analytics intelligence"
            >
              <span className="nav-link-icon">🔍</span>
              <span className="nav-link-text">Analytics Intelligence</span>
            </button>
          </div>
        </div>

        <div className="nav-right">
          <div className="nav-environment-selector">
            <label htmlFor="nav-env-select" className="env-label">
              <span className="env-icon">🌍</span>
              Environment:
            </label>
            <select
              id="nav-env-select"
              value={selectedEnvironment}
              onChange={(e) => setSelectedEnvironment(e.target.value)}
              className="nav-env-select"
              disabled={environmentsLoading}
              title="Select environment to filter all views"
            >
              <option value="">All Environments</option>
              {environmentsLoading ? (
                <option disabled>Loading...</option>
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
            {selectedEnvironment && (
              <span className="env-indicator" title={`Filtering by: ${selectedEnvironment}`}>
                ✓
              </span>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
