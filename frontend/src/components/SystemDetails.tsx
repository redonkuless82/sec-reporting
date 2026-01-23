import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import type { System, CalendarDataPoint } from '../types';

interface SystemDetailsProps {
  system: System;
}

export default function SystemDetails({ system }: SystemDetailsProps) {
  const [latestData, setLatestData] = useState<CalendarDataPoint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLatestData();
  }, [system.shortname]);

  const loadLatestData = async () => {
    setLoading(true);
    try {
      const response = await systemsApi.getCalendarData(system.shortname);
      // Get the most recent data point
      if (response.data && response.data.length > 0) {
        const sorted = [...response.data].sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setLatestData(sorted[0]);
      }
    } catch (error) {
      console.error('Error loading system details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="system-details loading">Loading system details...</div>;
  }

  if (!latestData) {
    return <div className="system-details">No recent data available for this system</div>;
  }

  const tools = [
    { key: 'r7', name: 'Rapid7', found: latestData.tools.r7, lag: latestData.lagDays.r7 },
    { key: 'am', name: 'Automox', found: latestData.tools.am, lag: latestData.lagDays.am },
    { key: 'df', name: 'Defender', found: latestData.tools.df, lag: latestData.lagDays.df },
    { key: 'it', name: 'Intune', found: latestData.tools.it, lag: latestData.lagDays.it },
    { key: 'vm', name: 'VM Inventory', found: latestData.tools.vm, lag: null },
  ];

  // Calculate actual non-compliant count from the tools
  const nonCompliantCount = tools.filter(tool => !tool.found).length;

  return (
    <div className="system-details">
      <h3>Current Tool Reporting Status</h3>
      <div className="tool-status-grid">
        {tools.map((tool) => (
          <div key={tool.key} className={`tool-status-card ${tool.found ? 'found' : 'not-found'}`}>
            <div className="tool-name">{tool.name}</div>
            <div className="tool-status">
              {tool.found ? (
                <>
                  <span className="status-icon">✓</span>
                  <span className="status-text">Reporting</span>
                </>
              ) : (
                <>
                  <span className="status-icon">✗</span>
                  <span className="status-text">Not Found</span>
                </>
              )}
            </div>
            {tool.lag !== null && tool.lag !== undefined && (
              <div className="lag-info">
                {tool.lag === 0 ? 'Up to date' : `${tool.lag} days lag`}
              </div>
            )}
          </div>
        ))}
      </div>

      {nonCompliantCount > 0 && (
        <div className="criticals-alert">
          <span className="alert-icon">⚠️</span>
          <strong>{nonCompliantCount} Total non-compliant for this system</strong>
          <div className="compliance-details">
            {!latestData.tools.r7 && <span className="missing-tool">• Rapid7</span>}
            {!latestData.tools.am && <span className="missing-tool">• Automox</span>}
            {!latestData.tools.df && <span className="missing-tool">• Defender</span>}
            {!latestData.tools.it && <span className="missing-tool">• Intune</span>}
            {!latestData.tools.vm && <span className="missing-tool">• VM Inventory</span>}
          </div>
        </div>
      )}

      {latestData.seenRecently ? (
        <div className="seen-status seen-recently">
          <span>✓</span> Seen recently in monitoring tools
        </div>
      ) : (
        <div className="seen-status not-seen">
          <span>⚠</span> Not seen recently - may need attention
        </div>
      )}
    </div>
  );
}
