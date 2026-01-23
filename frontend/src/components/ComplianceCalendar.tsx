import { useState, useEffect } from 'react';
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { systemsApi } from '../services/api';
import type { System, CalendarDataPoint } from '../types';

interface ComplianceCalendarProps {
  system: System;
}

interface HeatmapValue {
  date: Date;
  count: number;
  data?: CalendarDataPoint;
}

export default function ComplianceCalendar({ system }: ComplianceCalendarProps) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [calendarData, setCalendarData] = useState<CalendarDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<'all' | 'r7' | 'am' | 'df' | 'it' | 'vm'>('all');

  useEffect(() => {
    loadCalendarData();
  }, [system.shortname, year, month]);

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      const response = await systemsApi.getCalendarData(system.shortname, year, month);
      setCalendarData(response.data);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapValues = (): HeatmapValue[] => {
    const start = startOfMonth(new Date(year, month));
    const end = endOfMonth(new Date(year, month));
    const days = eachDayOfInterval({ start, end });

    return days.map((date) => {
      const dataPoint = calendarData.find(
        (d) => format(new Date(d.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
      );

      let count = 0;
      if (dataPoint) {
        if (selectedTool === 'all') {
          // Count how many tools found the system
          count = Object.values(dataPoint.tools).filter(Boolean).length;
        } else {
          // Check specific tool
          count = dataPoint.tools[selectedTool] ? 5 : 0;
        }
      }

      return {
        date,
        count,
        data: dataPoint,
      };
    });
  };

  const getTooltipContent = (value: HeatmapValue | undefined) => {
    if (!value || !value.data) return 'No data';

    const data = value.data;
    const dateStr = format(value.date, 'MMM dd, yyyy');

    const toolStatus = [
      `R7: ${data.tools.r7 ? '✓' : '✗'}`,
      `AM: ${data.tools.am ? '✓' : '✗'}`,
      `DF: ${data.tools.df ? '✓' : '✗'}`,
      `IT: ${data.tools.it ? '✓' : '✗'}`,
      `VM: ${data.tools.vm ? '✓' : '✗'}`,
    ].join(' | ');

    const complianceStatus = data.criticals === 0
      ? 'Fully Compliant'
      : `Non-Compliant in ${data.criticals} tool${data.criticals > 1 ? 's' : ''}`;

    return `${dateStr}\n${toolStatus}\n${complianceStatus}`;
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
    <div className="compliance-calendar">
      <div className="calendar-header">
        <h2>Compliance Calendar: {system.shortname}</h2>
        {system.fullname && <p className="system-fullname">{system.fullname}</p>}
      </div>

      <div className="calendar-controls">
        <div className="month-navigation">
          <button onClick={handlePreviousMonth} className="nav-button">← Previous</button>
          <span className="current-month">{monthNames[month]} {year}</span>
          <button onClick={handleNextMonth} className="nav-button">Next →</button>
        </div>

        <div className="tool-filter">
          <label>Filter by tool: </label>
          <select value={selectedTool} onChange={(e) => setSelectedTool(e.target.value as any)}>
            <option value="all">All Tools</option>
            <option value="r7">Rapid7</option>
            <option value="am">Asset Management</option>
            <option value="df">Data Feed</option>
            <option value="it">IT Tool</option>
            <option value="vm">VM Inventory</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="calendar-loading">Loading calendar data...</div>
      ) : (
        <div className="calendar-heatmap-container">
          <CalendarHeatmap
            startDate={startOfMonth(new Date(year, month))}
            endDate={endOfMonth(new Date(year, month))}
            values={getHeatmapValues()}
            classForValue={(value) => {
              if (!value || value.count === 0) {
                return 'color-empty';
              }
              if (value.count <= 1) return 'color-scale-1';
              if (value.count <= 2) return 'color-scale-2';
              if (value.count <= 3) return 'color-scale-3';
              if (value.count <= 4) return 'color-scale-4';
              return 'color-scale-5';
            }}
            titleForValue={(value) => getTooltipContent(value as HeatmapValue | undefined)}
            showWeekdayLabels={true}
          />

          <div className="calendar-legend">
            <span>Less</span>
            <div className="legend-scale">
              <div className="legend-box color-empty"></div>
              <div className="legend-box color-scale-1"></div>
              <div className="legend-box color-scale-2"></div>
              <div className="legend-box color-scale-3"></div>
              <div className="legend-box color-scale-4"></div>
              <div className="legend-box color-scale-5"></div>
            </div>
            <span>More</span>
          </div>
        </div>
      )}
    </div>
  );
}
