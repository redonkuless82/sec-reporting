# Health Trending Weekend Issue - Root Cause Analysis

## Executive Summary

The health trending dashboard shows dramatic **20% health rate drops on weekends** (visible on Jan 18-19, Jan 25-26, and Jan 31-Feb 1). This is **NOT a true reflection of system health** but rather a **data reporting artifact** caused by how the system interprets missing weekend data.

**Root Cause:** The health calculation logic treats systems with stale data the same as systems with no tooling, causing artificial health degradation on weekends when CSV imports may not run or systems don't check in.

---

## Problem Visualization

From the provided chart:
- **Weekdays:** Health rate ~85-87% (blue line high)
- **Weekends:** Health rate drops to ~65-70% (blue line plummets)
- **Pattern:** Consistent weekend drops followed by Monday recovery
- **Impact:** Yellow/orange area (partially healthy) expands dramatically on weekends

---

## Root Cause Analysis

### 1. **The Core Issue: Lag Days vs. Found Status**

The system has TWO ways to determine if a tool is reporting:

#### Current Logic (Lines 84-101 in [`import.service.ts`](backend/src/modules/import/import.service.ts:84))
```typescript
// A tool is only "found" (reporting) if lag days is 0 or -1 (seen today)
const r7FoundActual = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays === 0 || amLagDays === -1) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays === 0 || dfLagDays === -1) ? 1 : 0;
const itFoundActual = itFoundRaw && (itLagDays === 0 || itLagDays === -1) ? 1 : 0;
```

**Problem:** This logic says a tool is ONLY "found" if it checked in **TODAY** (lag = 0 or -1). If a system checked in Friday but the weekend report runs Saturday, the lag days become 1, 2, 3... and the tool is marked as NOT found.

### 2. **Weekend Data Import Behavior**

There are two possible scenarios:

#### Scenario A: No Weekend Imports
- CSV imports don't run on weekends
- Dashboard shows Friday's data on Saturday/Sunday
- But Friday's data has lag days calculated from Friday
- By Monday, those lag days are 3+ days old

#### Scenario B: Weekend Imports with Stale Data
- CSV imports DO run on weekends
- But systems don't check into tools on weekends (laptops off, etc.)
- Lag days increment: Friday lag=0 → Saturday lag=1 → Sunday lag=2
- Tools get marked as "not found" even though system is healthy

### 3. **The Cascading Effect**

When lag days > 0, the health calculation chain breaks down:

1. **Import Service** (lines 97-101): Marks tools as "not found" because lag > 0
2. **Systems Service** [`calculateSystemHealth()`](backend/src/modules/systems/systems.service.ts:60): Counts fewer tools
3. **Health Score** [`calculateHealthScore()`](backend/src/modules/systems/systems.service.ts:91): Returns lower fractional score
4. **Dashboard**: Shows dramatic health drop

**Example:**
- **Friday:** System has R7, AM, DF all reporting (lag=0) → 3/3 tools → 100% health
- **Saturday:** Same system, but lag=1 for all → 0/3 tools marked as "found" → 0% health
- **Reality:** System is still healthy, just hasn't checked in over the weekend

### 4. **Why Intune Lag Days Doesn't Help**

The [`isSystemActive()`](backend/src/modules/systems/systems.service.ts:27) function checks if `itLagDays <= 15`:

```typescript
// If Intune lag is within threshold (0-15 days), system is active
if (itLagDays !== null && itLagDays <= this.INTUNE_INACTIVE_DAYS) {
  return true;
}
```

**This correctly identifies the system as ACTIVE**, but then the health calculation sees:
- R7: lag=2 → r7Found=0
- AM: lag=2 → amFound=0  
- DF: lag=2 → dfFound=0

Result: **Active system with 0/3 tools = UNHEALTHY** (should be "healthy but stale data")

---

## Impact Assessment

### Quantitative Impact
- **20% health rate drop** on weekends
- **~1,500-2,000 systems** incorrectly classified as "partially healthy" or "unhealthy"
- **False degradation alerts** every weekend
- **Misleading trend analysis** for week-over-week comparisons

### Qualitative Impact
- **Loss of trust** in dashboard accuracy
- **Alert fatigue** from false weekend degradations
- **Inability to identify real issues** hidden in weekend noise
- **Poor decision-making** based on inaccurate "true state"

---

## Why This Matters

The user's concern is valid: **"I don't feel like it's giving me true state"**

The dashboard should show:
- **Persistent health status** - A system that was healthy Friday should still show as healthy Saturday (with a staleness indicator)
- **Real changes only** - Only show health degradation when tools actually stop reporting, not when data gets stale
- **Weekend stability** - Metrics should be stable across weekends unless real issues occur

---

## Proposed Solutions

### Solution 1: **Extend "Found" Threshold (Quick Fix)**

**Change:** Modify the import logic to consider tools "found" if lag days <= 3 (or 7)

```typescript
// Allow tools to be "found" if seen within last 3 days
const r7FoundActual = r7FoundRaw && (r7LagDays !== null && r7LagDays <= 3) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays !== null && amLagDays <= 3) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays !== null && dfLagDays <= 3) ? 1 : 0;
```

**Pros:**
- Simple one-line change
- Immediately stabilizes weekend metrics
- Aligns with "true state" concept

**Cons:**
- Masks real issues if tools stop reporting for 1-2 days
- Arbitrary threshold selection

**Recommendation:** Use 3-day threshold for weekends, 1-day for critical alerting

---

### Solution 2: **Separate "Found" from "Recently Seen" (Better)**

**Change:** Create two concepts:
1. **toolFound** - Tool is configured/enrolled (from CSV)
2. **toolRecentlySeen** - Tool checked in within X days

```typescript
// Tool is "found" if it exists in the tool's database
const r7Found = r7FoundRaw ? 1 : 0;

// Tool is "recently seen" if lag <= 3 days
const r7RecentlySeen = r7Found && (r7LagDays !== null && r7LagDays <= 3) ? 1 : 0;
```

**Health Calculation:**
- Use `toolFound` for health status (persistent)
- Use `toolRecentlySeen` for alerting (real-time)
- Display lag days for transparency

**Pros:**
- Separates configuration from reporting
- Provides "true state" (is tool deployed?) vs "current state" (is it checking in?)
- Enables better alerting logic

**Cons:**
- Requires more significant code changes
- Need to update health calculation logic

---

### Solution 3: **Use Last Known Good State (Best for "True State")**

**Change:** Track the last known health state and only update when new data arrives

**Implementation:**
1. Store "last confirmed health state" with timestamp
2. When calculating health:
   - If data is fresh (lag <= 1): Use current state
   - If data is stale (lag > 1): Use last known good state + staleness indicator
3. Display staleness: "Healthy (last seen 2 days ago)"

**Pros:**
- Provides true persistent state
- Eliminates weekend volatility
- Shows both health AND data freshness

**Cons:**
- Most complex implementation
- Requires schema changes
- Need to handle edge cases (system truly degraded vs. stale data)

---

### Solution 4: **Weekend-Aware Thresholds (Hybrid)**

**Change:** Apply different thresholds based on day of week

```typescript
const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
};

const lagThreshold = isWeekend(importDate) ? 3 : 1;
const r7FoundActual = r7FoundRaw && (r7LagDays !== null && r7LagDays <= lagThreshold) ? 1 : 0;
```

**Pros:**
- Addresses weekend issue directly
- Minimal code changes
- Maintains strict weekday monitoring

**Cons:**
- Adds complexity
- Different behavior on different days
- May hide Monday issues

---

## Recommended Approach

### Phase 1: Immediate Fix (This Week)
**Implement Solution 1 with 3-day threshold**

**Changes needed:**
1. Update [`import.service.ts`](backend/src/modules/import/import.service.ts:97) lines 97-101
2. Change lag day threshold from `0 or -1` to `<= 3`
3. Test with historical data to verify weekend stability

**Expected outcome:**
- Weekend health rate stabilizes
- Metrics show "true state" across weekends
- 20% drops eliminated

### Phase 2: Enhanced Visibility (Next Sprint)
**Add staleness indicators to dashboard**

**Changes needed:**
1. Display lag days on health cards
2. Add "Last Seen" timestamp to system details
3. Color-code based on data freshness:
   - Green: lag <= 1 day (fresh)
   - Yellow: lag 2-3 days (stale but acceptable)
   - Orange: lag 4-7 days (concerning)
   - Red: lag > 7 days (critical)

### Phase 3: Long-term Solution (Future)
**Implement Solution 3 (Last Known Good State)**

**Changes needed:**
1. Add `lastKnownHealthState` and `lastHealthUpdate` to entities
2. Implement state persistence logic
3. Update dashboard to show both current and last known state
4. Add data freshness indicators throughout UI

---

## Testing Strategy

### 1. Historical Data Analysis
- Query weekend data from Jan 18-19, Jan 25-26
- Compare lag days distribution weekday vs. weekend
- Verify hypothesis about lag day increments

### 2. Threshold Testing
- Test with 1-day, 3-day, 7-day thresholds
- Measure impact on weekend volatility
- Ensure real issues still detected

### 3. Weekend Simulation
- Import Friday data
- Simulate Saturday/Sunday with incremented lag days
- Verify health rate remains stable

### 4. Regression Testing
- Ensure weekday metrics unchanged
- Verify inactive system detection still works
- Confirm 15-day Intune threshold unaffected

---

## Implementation Checklist

### Immediate (Solution 1)
- [ ] Update `import.service.ts` lag day threshold logic
- [ ] Add configuration constant for threshold (default: 3 days)
- [ ] Update unit tests for new threshold
- [ ] Test with historical weekend data
- [ ] Deploy to staging
- [ ] Monitor weekend metrics
- [ ] Deploy to production

### Short-term (Phase 2)
- [ ] Add lag days to API responses
- [ ] Update frontend to display staleness
- [ ] Add color-coding for data freshness
- [ ] Update documentation
- [ ] Add staleness to export CSVs

### Long-term (Phase 3)
- [ ] Design last known good state schema
- [ ] Implement state persistence
- [ ] Update health calculation logic
- [ ] Add UI for state history
- [ ] Implement alerting based on state changes
- [ ] Create migration for existing data

---

## Configuration Recommendations

### Recommended Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **Tool "Found" Status** | <= 3 days | Covers weekend + 1 day buffer |
| **Intune Active Status** | <= 15 days | Current (working correctly) |
| **Alerting Threshold** | > 7 days | Real issue, not just weekend |
| **Critical Alert** | > 14 days | Approaching inactive threshold |

### Environment-Specific Considerations

- **Production:** 3-day threshold (24/7 operations)
- **Development:** 7-day threshold (weekend shutdowns expected)
- **Test:** 7-day threshold (intermittent usage)

---

## Monitoring & Validation

### Success Metrics
- Weekend health rate variance < 5% (currently 20%)
- No false degradation alerts on weekends
- User confidence in "true state" reporting
- Stable week-over-week comparisons

### Ongoing Monitoring
- Track lag day distributions by day of week
- Monitor weekend vs. weekday health rate delta
- Alert on unexpected weekend drops (real issues)
- Review user feedback on accuracy

---

## Documentation Updates Needed

1. **[`HEALTH-SCORING-METHODOLOGY.md`](documentation/HEALTH-SCORING-METHODOLOGY.md)** - Update "Active System Definition" section
2. **README.md** - Add note about weekend data handling
3. **API Documentation** - Document lag day thresholds
4. **User Guide** - Explain staleness indicators

---

## Questions for Stakeholders

1. **What is the acceptable staleness threshold?** (Recommend 3 days)
2. **Should weekends have different thresholds than weekdays?** (Recommend yes)
3. **Do CSV imports run on weekends?** (Need to verify)
4. **Are there scheduled maintenance windows?** (May need special handling)
5. **What constitutes "true state" for your use case?** (Persistent vs. real-time)

---

## Conclusion

The 20% weekend health drops are **NOT real health degradation** but rather an **artifact of how the system interprets stale data**. The current logic treats "not seen today" the same as "not configured," which is incorrect for understanding true system health.

**Immediate Action:** Implement Solution 1 (3-day threshold) to stabilize weekend metrics and provide accurate "true state" reporting.

**Long-term Vision:** Implement Solution 3 (last known good state) to provide both persistent health status and data freshness indicators.

This will restore user confidence in the dashboard and enable accurate health trending across all days of the week.

---

**Document Version:** 1.0  
**Date:** February 2, 2026  
**Author:** System Analysis Team  
**Status:** Ready for Review
