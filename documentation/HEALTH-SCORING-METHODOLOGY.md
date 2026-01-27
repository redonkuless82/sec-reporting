# Health Scoring Methodology

## Overview

This document explains the health scoring system used in the dashboard to calculate and display system health metrics.

## Fractional Health Scoring

### Calculation Method

The health rate uses **fractional scoring** based on the number of security tools reporting for each system:

```
Health Score = (Number of Tools Reporting / 3) × 100%
```

### Scoring Breakdown

| Tools Reporting | Fraction | Score | Health Points | Status |
|----------------|----------|-------|---------------|---------|
| 3/3 (R7 + AM + DF) | 3/3 | 100% | 1.0 | Fully Healthy |
| 2/3 | 2/3 | 66.7% | 0.67 | Partially Healthy |
| 1/3 | 1/3 | 33.3% | 0.33 | Partially Healthy |
| 0/3 | 0/3 | 0% | 0.0 | Unhealthy |

### Overall Health Rate Formula

```
Overall Health Rate = (Total Health Points / Total Active Systems) × 100%
```

**Example:**
- 5149 systems @ 100% (3/3 tools) = 5149 points
- 1946 systems @ 66.7% (2/3 tools) = 1298.82 points
- 523 systems @ 33.3% (1/3 tools) = 174.26 points
- 89 systems @ 0% (0/3 tools) = 0 points

**Total:** 6622.08 points / 7707 active systems = **85.9% health rate**

## Health Tools

The following three tools are used to calculate health scores:

1. **Rapid7 (R7)** - Vulnerability scanning
2. **Automox (AM)** - Patch management
3. **Defender (DF)** - Endpoint protection

**Note:** VMware and Intune are tracked but **not included** in health calculations.

## System Status Categories

### Fully Healthy
- **Criteria:** Active in Intune (last 15 days) + all 3 tools reporting
- **Health Score:** 100% (1.0 point)
- **Color:** Green
- **Icon:** ✅

### Partially Healthy
- **Criteria:** Active in Intune (last 15 days) + 1-2 tools reporting
- **Health Score:** 33.3% or 66.7% (0.33 or 0.67 points)
- **Color:** Yellow/Orange
- **Icon:** ⚠️

### Unhealthy
- **Criteria:** Active in Intune (last 15 days) but no tools reporting
- **Health Score:** 0% (0 points)
- **Color:** Red
- **Icon:** ❌
- **Action Required:** Immediate investigation needed

### Inactive
- **Criteria:** Not seen in Intune for 15+ days OR not in Intune at all
- **Health Score:** Excluded from calculations
- **Color:** Gray
- **Icon:** ⏸️
- **Note:** These systems are counted separately and do not affect health rate

### New Systems
- **Criteria:** First appearance in the system
- **Health Score:** Varies (may not have tooling yet)
- **Color:** Blue
- **Icon:** 🆕
- **Note:** Tracked separately as they may not have full tooling deployed

## Active System Definition

A system is considered "active" if it meets ALL of the following criteria:

1. `possibleFake = false` OR `possibleFake IS NULL`
2. `itFound = true` (present in Intune)
3. `itLagDays <= 15` (checked into Intune within last 15 days)

## Data Filtering Rules

### Systems Excluded from Health Calculations

1. **Fake/Test Systems** - `possibleFake = true`
   - These systems skew reporting and are completely excluded
   
2. **Inactive Systems** - `itLagDays > 15` OR `itFound = false`
   - Counted separately as "Inactive" but not included in health rate

3. **Systems without Intune presence** - `itFound = false`
   - Cannot be considered active without Intune reporting

## Comparison Metrics

### Day-over-Day Comparison
Compares yesterday's metrics to today's metrics:
- Health rate change
- System count change
- Category changes (fully/partially/unhealthy/inactive)

**Display:** "↑ +2.3% vs yesterday" or "↓ -1.5% vs yesterday"

### Week-over-Week Comparison
Compares metrics from 7 days ago to today's metrics:
- Health rate change
- System count change
- Category changes

**Display:** "↑ +5.1% vs last week" or "↓ -2.3% vs last week"

### Period Comparison
Compares first day to last day of selected period:
- Systems gained health
- Systems lost health
- New systems discovered

**Display:** "Since Jan 1" or "Since start of period"

## Tool-Specific Trending

Each tool (R7, AM, DF, IT) has individual trending metrics:

- **Current:** Number of systems currently reporting
- **Change:** Difference from start of period
- **Change Percent:** Percentage change from start
- **Trend:** Direction indicator (↑ up, ↓ down, → stable)

## Intune Check-in Tracking

### itLagDays Field
- **Definition:** Number of days since system last checked into Intune
- **Usage:** Determines if system is active (≤15 days) or inactive (>15 days)
- **Display:** Shows on Systems List page for transparency

### Examples
- `itLagDays = 0` - Checked in today (active)
- `itLagDays = 7` - Checked in 7 days ago (active)
- `itLagDays = 15` - Checked in 15 days ago (active, at threshold)
- `itLagDays = 16` - Checked in 16 days ago (inactive)
- `itLagDays = null` - No Intune data available (inactive)

## Visual Indicators

### Trend Arrows
- **↑ Green** - Positive change (improvement)
- **↓ Red** - Negative change (degradation)
- **→ Gray** - No change (stable)

### Color Coding
- **Green (#4caf50)** - Healthy, positive, improving
- **Yellow (#ffc107)** - Partially healthy, warning
- **Red (#f44336)** - Unhealthy, negative, declining
- **Gray (#9e9e9e)** - Inactive, neutral, stable
- **Blue (#2196f3)** - New, informational

## Dashboard Sections

### Summary Cards
Display key metrics with day-over-day and week-over-week comparisons:
1. Total Systems
2. Health Rate
3. Systems Gained Health
4. Systems Lost Health

### Tool Adoption Trends
Shows individual tool reporting trends:
- Current system count
- Change from start of period
- Percentage change
- Trend direction

### Insights Section
Provides context and explanations:
- Health scoring methodology
- System status definitions
- Progress tracking
- Action items

## API Response Structure

```typescript
{
  dateRange: {
    startDate: string,
    endDate: string,
    days: number
  },
  trendData: [
    {
      date: string,
      totalSystems: number,
      activeSystems: number,
      fullyHealthy: number,
      partiallyHealthy: number,
      unhealthy: number,
      inactive: number,
      healthRate: number,
      toolHealth: {
        r7: number,
        am: number,
        df: number,
        it: number
      }
    }
  ],
  summary: {
    totalSystemsNow: number,
    totalSystemsStart: number,
    healthImprovement: number,
    newSystemsDiscovered: number,
    systemsLostHealth: number,
    systemsGainedHealth: number,
    dayOverDay: {
      healthRateChange: number,
      systemsChange: number,
      fullyHealthyChange: number,
      partiallyHealthyChange: number,
      unhealthyChange: number,
      inactiveChange: number
    },
    weekOverWeek: {
      healthRateChange: number,
      systemsChange: number,
      fullyHealthyChange: number,
      partiallyHealthyChange: number,
      unhealthyChange: number,
      inactiveChange: number
    },
    toolTrends: {
      r7: { current, change, changePercent, trend },
      am: { current, change, changePercent, trend },
      df: { current, change, changePercent, trend },
      it: { current, change, changePercent, trend }
    }
  }
}
```

## Migration Notes

### Changes from Previous Version

1. **Health Rate Calculation**
   - **Old:** Binary (healthy/unhealthy) - treated partially healthy as 100% healthy
   - **New:** Fractional scoring - partially healthy contributes proportionally
   - **Impact:** Health rate will be more accurate but may appear lower

2. **Fake System Filtering**
   - **Old:** Included all systems
   - **New:** Excludes `possibleFake = true` systems
   - **Impact:** System counts may decrease, health rate may change

3. **Comparison Metrics**
   - **Old:** Only period comparison (first to last day)
   - **New:** Day-over-day, week-over-week, and period comparisons
   - **Impact:** More granular trending visibility

4. **Tool Trending**
   - **Old:** Not available
   - **New:** Individual tool adoption trends
   - **Impact:** Better visibility into specific tool deployment

## Best Practices

### Interpreting Health Rate

- **90-100%:** Excellent - Most systems have full tooling
- **75-89%:** Good - Majority have good coverage, some gaps
- **60-74%:** Fair - Significant gaps in tool coverage
- **Below 60%:** Poor - Major tooling deployment issues

### Action Thresholds

- **Systems Lost Health > 10:** Investigate immediately
- **Health Rate drops > 5% day-over-day:** Urgent attention needed
- **Tool trend declining:** Review deployment processes
- **Inactive systems increasing:** Check Intune connectivity

### Monitoring Recommendations

1. Check dashboard daily for day-over-day changes
2. Review week-over-week trends weekly
3. Investigate any systems that lost health
4. Ensure new systems get tooling within 7 days
5. Monitor tool-specific trends for deployment issues

## Troubleshooting

### Health Rate Seems Low
- Check if fake systems are properly marked
- Verify Intune connectivity (itLagDays)
- Review partially healthy systems for missing tools
- Check tool deployment processes

### Comparison Metrics Not Showing
- Requires at least 2 days of data for day-over-day
- Requires at least 8 days of data for week-over-week
- Ensure daily CSV imports are running

### Tool Trends Not Updating
- Verify CSV imports include tool status fields
- Check that possibleFake filtering is working
- Ensure database has historical data

## Support

For questions or issues with health scoring:
1. Review this documentation
2. Check the dashboard insights section
3. Verify data in the database
4. Contact the development team

---

**Last Updated:** January 27, 2026
**Version:** 2.0
**Author:** System Development Team
