import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { System } from '../types';

interface SearchBarProps {
  onSystemSelect: (system: System) => void;
}

export default function SearchBar({ onSystemSelect }: SearchBarProps) {
  const [search, setSearch] = useState('');
  const [systems, setSystems] = useState<System[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (search.length >= 2) {
        searchSystems();
      } else {
        setSystems([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const searchSystems = async () => {
    setLoading(true);
    try {
      const response = await systemsApi.getSystems(search, 1, 20);
      setSystems(response.data);
      setShowResults(true);
    } catch (error) {
      console.error('Error searching systems:', error);
      setSystems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (system: System) => {
    onSystemSelect(system);
    setSearch(system.shortname);
    setShowResults(false);
  };

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search by system shortname or fullname..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => systems.length > 0 && setShowResults(true)}
        />
        {loading && <div className="search-loading">Searching...</div>}
      </div>

      {showResults && systems.length > 0 && (
        <div className="search-results">
          {systems.map((system) => (
            <div
              key={system.id}
              className="search-result-item"
              onClick={() => handleSelect(system)}
            >
              <div className="result-shortname">{system.shortname}</div>
              {system.fullname && (
                <div className="result-fullname">{system.fullname}</div>
              )}
              {system.env && <div className="result-env">{system.env}</div>}
            </div>
          ))}
        </div>
      )}

      {showResults && search.length >= 2 && systems.length === 0 && !loading && (
        <div className="search-results">
          <div className="no-results">No systems found</div>
        </div>
      )}
    </div>
  );
}
