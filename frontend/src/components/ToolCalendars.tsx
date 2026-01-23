import { useState, useEffect } from 'react';
import { systemsApi } from '../services/api';
import MonthlyCalendar from './MonthlyCalendar';
import type { System, CalendarDataPoint } from '../types';

interface ToolCalendarsProps {
  system: System;
}

const tools = [
  { key: 'r7' as const, name: 'Rapid7', color: '#3b82f6' },
  { key: 'am' as const, name: 'Automox', color: '#a855f7' },
  { key: 'df' as const, name: 'Defender', color: '#ec4899' },
  { key: 'it' as const, name: 'Intune', color: '#f59e0b' },
  { key: 'vm' as const, name: 'VM Inventory', color: '#10b981' },
];

export default function ToolCalendars({ system }: ToolCalendarsProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [calendarData, setCalendarData] = useState<CalendarDataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCalendarData();
  }, [system.shortname, year, month]);

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      const response = await systemsApi.getCalendarData(system.shortname, year, month);
      setCalendarData(response.data || []);
    } catch (error) {
      console.error('Error loading calendar data:', error);
      setCalendarData([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="tool-calendars">
      <div className="calendars-header">
        <h3>Tool Reporting History</h3>
        <div className="month-navigation">
          <button onClick={handlePreviousMonth} className="nav-button">← Prev</button>
          <span className="current-month">{monthNames[month]} {year}</span>
          <button onClick={handleNextMonth} className="nav-button">Next →</button>
        </div>
      </div>

      {loading ? (
        <div className="calendars-loading">Loading calendar data...</div>
      ) : (
        <div className="calendars-grid">
          {tools.map((tool) => (
            <MonthlyCalendar
              key={tool.key}
              year={year}
              month={month}
              data={calendarData}
              toolKey={tool.key}
              toolName={tool.name}
              color={tool.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
