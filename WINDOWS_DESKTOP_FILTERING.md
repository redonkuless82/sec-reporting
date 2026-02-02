# Windows Desktop/Laptop Filtering Implementation

## Overview
This document describes the comprehensive backend filtering implementation that ensures **ALL database queries** only include Windows desktop and laptop systems, excluding servers.

## Implementation Date
2026-02-02

## Filtering Criteria
**Every single database query** now filters data based on two key criteria:

1. **serverOS = False (0)**: Only includes desktop/laptop endpoints, excluding servers
2. **osFamily = 'Windows'**: Only includes Windows operating systems

## Modified Files

### 1. Systems Service (`backend/src/modules/systems/systems.service.ts`)
Added filtering to **ALL 24 query methods** including:

**Reporting Methods:**
- `getHealthTrending()` - Line ~428
- `getNewSystemsToday()` - Line ~279 (2 queries)
- `getMissingSystems()` - Line ~357 (2 queries)
- `getReappearedSystems()` - Line ~1314 (2 queries)
- `getSystemsByHealthCategory()` - Line ~1158 (2 queries)
- `getHealthySystemsForExport()` - Line ~1056
- `getUnhealthySystemsForExport()` - Line ~1113
- `isConsecutivelyActive()` - Line ~747
- `calculateConsecutiveActiveMetrics()` - Line ~786
- `calculateConsecutiveActiveHealthImprovement()` - Line ~886 (3 queries)

**System Detail Methods:**
- `getHistory()` - Line ~162
- `getCalendarData()` - Line ~193
- `getStats()` - Lines ~237, ~243
- `getEnvironments()` - Line ~1297

### 2. Analytics Service (`backend/src/modules/analytics/analytics.service.ts`)
Added filtering to **ALL 4 query methods**:

- `getSystemClassification()` - Lines ~65, ~82, ~112
- `getSystemInsights()` - Line ~259

### 3. Stability Scoring Service (`backend/src/modules/analytics/services/stability-scoring.service.ts`)
Added filtering to **ALL 10 query methods**:

- `analyzeSystemStability()` - Line ~287
- `getStabilityOverview()` - Lines ~438, ~448, ~466
- `getR7GapAnalysis()` - Lines ~664, ~670
- `getRecoveryTracking()` - Lines ~720, ~724, ~742

## Filter Implementation Pattern

All queries use the following consistent pattern:

```typescript
.andWhere('(snapshot.serverOS = 0 OR snapshot.serverOS IS NULL OR snapshot.serverOS = :false)', { false: 'False' })
.andWhere('snapshot.osFamily = :osFamily', { osFamily: 'Windows' })
```

### Why This Pattern?

1. **serverOS Check**: Handles multiple data formats:
   - `serverOS = 0` (numeric false)
   - `serverOS IS NULL` (missing data)
   - `serverOS = 'False'` (string false from CSV)

2. **osFamily Check**: Ensures only Windows systems are included

## Database Schema Reference

The filtering uses fields from the `daily_snapshots` table:

```typescript
@Column({ type: 'varchar', length: 255, nullable: true })
serverOS: string;

@Column({ type: 'varchar', length: 255, nullable: true })
osFamily: string;
```

## Impact

### Affected Endpoints
All reporting endpoints now automatically filter data:

- `/systems/health-trending`
- `/systems/new-today`
- `/systems/reappeared`
- `/systems/missing`
- `/systems/health-category`
- `/systems/export/healthy-systems`
- `/systems/export/unhealthy-systems`
- `/analytics/stability-overview`
- `/analytics/system-classification`
- `/analytics/r7-gap-analysis`
- `/analytics/recovery-status`
- `/analytics/system-insights/:shortname`

### Data Exclusions
The following systems are now excluded from all reports:

- Server operating systems (serverOS = True/1)
- Non-Windows systems (osFamily != 'Windows')
- Linux systems
- macOS systems
- Any other non-Windows operating systems

## Testing Recommendations

1. **Verify Filtering**: Check that server systems no longer appear in reports
2. **Verify Windows-Only**: Confirm only Windows systems are included
3. **Environment Filtering**: Ensure environment filtering still works correctly alongside OS filtering
4. **Export Functions**: Test CSV exports to verify filtered data
5. **Analytics**: Verify analytics calculations are based on filtered dataset

## Backward Compatibility

This change is **not backward compatible** with previous behavior. All historical queries will now be filtered to Windows desktops/laptops only. If you need to include servers or other OS types, you will need to:

1. Remove or modify the filtering conditions
2. Add optional query parameters to control filtering
3. Create separate endpoints for server/non-Windows reporting

## Future Enhancements

Consider adding:

1. **Configurable Filtering**: Allow filtering to be toggled via query parameters
2. **Multi-OS Support**: Add endpoints that support filtering by OS family
3. **Server Reporting**: Create dedicated endpoints for server monitoring if needed
4. **Filter Logging**: Add logging to track which filters are applied to queries

## Notes

- The filtering is applied at the database query level for optimal performance
- All queries maintain existing environment filtering capabilities
- The `possibleFake` filter is still applied alongside the new OS filters
- Grace period logic for health calculations remains unchanged
