import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import type { CalendarDataPoint } from '../types';

interface MonthlyCalendarProps {
  year: number;
  month: number;
  data: CalendarDataPoint[];
  toolKey: 'r7' | 'am' | 'df' | 'it' | 'vm';
  toolName: string;
  color: string;
}

export default function MonthlyCalendar({ year, month, data, toolKey, toolName, color }: MonthlyCalendarProps) {
  const monthStart = startOfMonth(new Date(year, month));
  const monthEnd = endOfMonth(new Date(year, month));
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const getDataForDate = (date: Date) => {
    // Parse date string as local date to avoid timezone issues
    return data.find(d => {
      const dateStr = typeof d.date === 'string' ? d.date : format(d.date, 'yyyy-MM-dd');
      const [year, month, day] = dateStr.split('-').map(Number);
      const dataDate = new Date(year, month - 1, day);
      return format(dataDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
    });
  };
  
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === month;
  };
  
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Group days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  
  return (
    <div className="monthly-calendar">
      <h4 className="calendar-tool-title" style={{ color }}>{toolName}</h4>
      
      <div className="calendar-grid">
        {/* Week day headers */}
        <div className="calendar-header-row">
          {weekDays.map(day => (
            <div key={day} className="calendar-header-cell">{day}</div>
          ))}
        </div>
        
        {/* Calendar weeks */}
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="calendar-week-row">
            {week.map((date, dayIndex) => {
              const dayData = getDataForDate(date);
              const isReporting = dayData?.tools[toolKey] || false;
              const inMonth = isCurrentMonth(date);
              
              return (
                <div
                  key={dayIndex}
                  className={`calendar-day ${inMonth ? 'in-month' : 'out-month'} ${isReporting ? 'reporting' : 'not-reporting'}`}
                  style={{
                    backgroundColor: inMonth ? (isReporting ? color : `${color}20`) : 'transparent',
                    opacity: inMonth ? 1 : 0.3
                  }}
                  title={`${format(date, 'MMM dd, yyyy')}: ${isReporting ? 'Reporting' : 'Not Reporting'}`}
                >
                  <span className="day-number">{format(date, 'd')}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      
      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-box" style={{ backgroundColor: color }}></div>
          <span>Reporting</span>
        </div>
        <div className="legend-item">
          <div className="legend-box" style={{ backgroundColor: `${color}20`, border: `1px solid ${color}40` }}></div>
          <span>Not Reporting</span>
        </div>
      </div>
    </div>
  );
}
