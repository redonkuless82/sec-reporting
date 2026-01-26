import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import SystemDetails from '../components/SystemDetails';
import ToolCalendars from '../components/ToolCalendars';
import CsvImport from '../components/CsvImport';
import HealthDashboard from '../components/HealthDashboard';
import type { System, MissingSystem } from '../types';

export default function Home() {
  const [selectedSystem, setSelectedSystem] = useState<System | null>(null);
  const [systems, setSystems] = useState<System[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [envFilter, setEnvFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [environments, setEnvironments] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSystems, setTotalSystems] = useState(0);
  const [newSystemsToday, setNewSystemsToday] = useState<System[]>([]);
  const [missingSystems, setMissingSystems] = useState<MissingSystem[]>([]);
  const [loadingNewSystems, setLoadingNewSystems] = useState(true);
  const [loadingMissingSystems, setLoadingMissingSystems] = useState(true);
  const itemsPerPage = 20;

  useEffect(() => {
    loadSystems();
  }, [currentPage, searchTerm, envFilter]);

  useEffect(() => {
    loadEnvironments();
    loadNewSystemsToday();
    loadMissingSystems();
  }, []);

  const loadEnvironments = async () => {
    try {
      // Load all unique environments (we'll get them from the first page)
      const response = await systemsApi.getSystems('', 1, 100);
      const uniqueEnvs = Array.from(new Set(
        (response.data || [])
          .map(s => s.env)
          .filter((env): env is string => env !== null && env !== undefined)
      )).sort();
      setEnvironments(uniqueEnvs);
    } catch (error) {
      console.error('Error loading environments:', error);
    }
  };

  const loadSystems = async () => {
    setLoading(true);
    try {
      // Build search query - combine search term and env filter
      let searchQuery = searchTerm;
      
      // Note: Backend doesn't support env filtering in search yet
      // For now, we'll do client-side env filtering if needed
      const response = await systemsApi.getSystems(searchQuery, currentPage, itemsPerPage);
      
      let filteredData = response.data || [];
      
      // Apply environment filter client-side if needed
      if (envFilter !== 'all') {
        filteredData = filteredData.filter(s => s.env === envFilter);
      }
      
      setSystems(filteredData);
      setTotalPages(response.totalPages || 1);
      setTotalSystems(response.total || 0);
    } catch (error) {
      console.error('Error loading systems:', error);
      setSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadNewSystemsToday = async () => {
    setLoadingNewSystems(true);
    try {
      const response = await systemsApi.getNewSystemsToday();
      setNewSystemsToday(response.systems);
    } catch (error) {
      console.error('Error loading new systems:', error);
      setNewSystemsToday([]);
    } finally {
      setLoadingNewSystems(false);
    }
  };

  const loadMissingSystems = async () => {
    setLoadingMissingSystems(true);
    try {
      const response = await systemsApi.getMissingSystems(7);
      setMissingSystems(response.systems);
    } catch (error) {
      console.error('Error loading missing systems:', error);
      setMissingSystems([]);
    } finally {
      setLoadingMissingSystems(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when search changes
  };

  const handleEnvFilterChange = (env: string) => {
    setEnvFilter(env);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev: number) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev: number) => Math.min(totalPages, prev + 1));
  };

  return (
    <div className="home-page">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>Tooling Health Dashboard</h1>
            <p className="subtitle">Monitor ~{totalSystems} systems across monitoring tools</p>
          </div>
          <CsvImport />
        </div>
      </header>

      <main className="main-layout">
        {/* Left Sidebar - Systems List */}
        <aside className="systems-sidebar">
          <div className="sidebar-header">
            <h2>Systems</h2>
            <span className="system-count">{systems.length}</span>
          </div>

          <div className="sidebar-filters">
            <input
              type="text"
              className="sidebar-search"
              placeholder="Search systems..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />

            <div className="env-filters">
              <button
                className={envFilter === 'all' ? 'env-btn active' : 'env-btn'}
                onClick={() => handleEnvFilterChange('all')}
              >
                All
              </button>
              {environments.map(env => (
                <button
                  key={env}
                  className={envFilter === env ? 'env-btn active' : 'env-btn'}
                  onClick={() => handleEnvFilterChange(env)}
                >
                  {env}
                </button>
              ))}
            </div>
          </div>

          <div className="systems-list">
            {loading ? (
              <div className="list-loading">Loading...</div>
            ) : systems.length === 0 ? (
              <div className="no-systems">No systems found</div>
            ) : (
              systems.map((system) => (
                <div
                  key={system.id}
                  className={`system-list-item ${selectedSystem?.id === system.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSystem(system)}
                >
                  <div className="system-list-shortname">{system.shortname}</div>
                  {system.env && (
                    <span className={`env-tag env-${system.env}`}>{system.env}</span>
                  )}
                </div>
              ))
            )}
          </div>

          {!loading && totalPages > 1 && (
            <div className="sidebar-pagination">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className="pagination-btn"
                title="Previous page"
              >
                ← Prev
              </button>
              <span className="pagination-info">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="pagination-btn"
                title="Next page"
              >
                Next →
              </button>
            </div>
          )}
        </aside>

        {/* Right Content - System Details */}
        <section className="main-panel">
          {selectedSystem ? (
            <>
              <div className="panel-header">
                <div>
                  <h2>{selectedSystem.shortname}</h2>
                  {selectedSystem.fullname && (
                    <p className="system-subtitle">{selectedSystem.fullname}</p>
                  )}
                </div>
              </div>

              <SystemDetails system={selectedSystem} />
              <ToolCalendars system={selectedSystem} />
            </>
          ) : (
            <div className="welcome-panel">
              <h2>Welcome to the Tooling Health Tracker</h2>
              <p>Select a system from the list to view its health history and tool reporting status</p>
              
              {/* Global Health Dashboard */}
              <HealthDashboard days={30} />
              
              <div className="dashboard-sections">
                {/* New Systems Today Section */}
                <div className="dashboard-section">
                  <div className="section-header">
                    <h3>🆕 New Systems Today</h3>
                    <span className="badge">{newSystemsToday.length}</span>
                  </div>
                  {loadingNewSystems ? (
                    <div className="section-loading">Loading...</div>
                  ) : newSystemsToday.length === 0 ? (
                    <div className="section-empty">No new systems added today</div>
                  ) : (
                    <div className="systems-grid">
                      {newSystemsToday.map((system) => (
                        <div
                          key={system.id}
                          className="system-card clickable"
                          onClick={() => setSelectedSystem(system)}
                        >
                          <div className="system-card-name">{system.shortname}</div>
                          {system.env && (
                            <span className={`env-tag env-${system.env}`}>{system.env}</span>
                          )}
                          {system.fullname && (
                            <div className="system-card-fullname">{system.fullname}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Missing Systems Section */}
                <div className="dashboard-section">
                  <div className="section-header">
                    <h3>⚠️ Missing Systems (Not in Today's Report)</h3>
                    <span className="badge warning">{missingSystems.length}</span>
                  </div>
                  {loadingMissingSystems ? (
                    <div className="section-loading">Loading...</div>
                  ) : missingSystems.length === 0 ? (
                    <div className="section-empty">All systems are reporting regularly</div>
                  ) : (
                    <div className="systems-grid">
                      {missingSystems.slice(0, 10).map((system) => (
                        <div
                          key={system.id}
                          className="system-card clickable missing"
                          onClick={() => setSelectedSystem(system)}
                        >
                          <div className="system-card-name">{system.shortname}</div>
                          {system.env && (
                            <span className={`env-tag env-${system.env}`}>{system.env}</span>
                          )}
                          {system.daysSinceLastSeen !== null && (
                            <div className="system-card-meta">
                              Last seen: {system.daysSinceLastSeen} days ago
                            </div>
                          )}
                          {system.daysSinceLastSeen === null && (
                            <div className="system-card-meta">Never seen</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {missingSystems.length > 10 && (
                    <div className="section-footer">
                      Showing 10 of {missingSystems.length} missing systems
                    </div>
                  )}
                </div>

                {/* Info Cards */}
                <div className="info-cards">
                  <div className="info-card">
                    <h3>📊 Track Health</h3>
                    <p>Monitor which systems are reporting to security tools</p>
                  </div>
                  <div className="info-card">
                    <h3>📅 Historical View</h3>
                    <p>View daily snapshots across monitoring tools</p>
                  </div>
                  <div className="info-card">
                    <h3>🔍 Identify Gaps</h3>
                    <p>Quickly identify gaps in tooling coverage</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
