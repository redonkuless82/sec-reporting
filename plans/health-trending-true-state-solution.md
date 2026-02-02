# Health Trending "True State" Solution - Revised Analysis

## Executive Summary

After clarification, the current logic is **working as designed** - it tracks which tools checked in **on that specific day**. The weekend drops are **real data** showing that tools don't check in on weekends.

**However**, you want to see **"true state"** health - whether systems are fundamentally healthy, not just whether they checked in today. This requires a **different approach** than just changing thresholds.

---

## Current Behavior (Working as Designed)

### What the System Does Now

```typescript
// Lines 97-101 in import.service.ts
const r7FoundActual = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;
```

**Meaning:**
- `r7FoundRaw = TRUE` → Tool IS installed on the system (from platform)
- `r7LagDays = 0 or -1` → Tool checked in TODAY
- `r7FoundActual = 1` → Tool is installed AND checked in today

**This tracks:** "Did this tool report in on this specific day?"

### Weekend Behavior

**Friday:**
- R7 installed: TRUE
- R7 lag days: 0 (checked in today)
- R7 found actual: 1 ✅
- **Health: 100%** (tool checked in)

**Saturday:**
- R7 installed: TRUE (still installed)
- R7 lag days: 1 (last checked in yesterday)
- R7 found actual: 0 ❌ (didn't check in today)
- **Health: 0%** (tool didn't check in)

**This is accurate for "daily check-in tracking" but NOT for "true state health"**

---

## The Real Problem

You have **TWO different questions** but only **ONE metric**:

### Question 1: "Did tools check in today?" (Current Metric)
- **Purpose:** Daily operational monitoring
- **Answer:** Weekend drops are correct - tools don't check in on weekends
- **Use case:** "Which systems reported today?"

### Question 2: "Are systems fundamentally healthy?" (What You Want)
- **Purpose:** Strategic health assessment
- **Answer:** Weekend drops are misleading - systems are still healthy
- **Use case:** "What's the true state of my environment?"

**The dashboard currently only answers Question 1, but you need Question 2.**

---

## Root Cause: Conflating Two Concepts

The issue isn't a bug - it's a **conceptual mismatch**:

1. **Tool Installation** (persistent) - Is the tool deployed?
2. **Tool Check-in** (transient) - Did it report today?
3. **System Health** (persistent) - Is the system fundamentally healthy?

**Current logic:** Health = Installation AND Check-in (transient)  
**What you want:** Health = Installation AND Recent Check-in (persistent with grace period)

---

## Solution: Dual-Metric Approach

### Option A: Add "Recent Check-in" Threshold (Recommended)

**Concept:** Separate "found today" from "found recently"

```typescript
// Current: Strict daily check-in
const r7FoundToday = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;

// New: Recent check-in (within grace period)
const HEALTH_GRACE_PERIOD_DAYS = 3; // Covers weekends
const r7FoundRecently = r7FoundRaw && (r7LagDays !== null && r7LagDays <= HEALTH_GRACE_PERIOD_DAYS) ? 1 : 0;
```

**Store both in database:**
- `r7Found` → Checked in today (current behavior)
- `r7FoundRecent` → Checked in within 3 days (new field)

**Use for different purposes:**
- **Daily operations:** Use `r7Found` (strict)
- **Health trending:** Use `r7FoundRecent` (grace period)
- **Alerting:** Use `r7Found` (immediate)

---

### Option B: Modify Health Calculation Only (Simpler)

**Keep import logic unchanged**, but modify health trending calculation:

**File:** [`backend/src/modules/systems/systems.service.ts`](backend/src/modules/systems/systems.service.ts:91)

**Current health score calculation (line 91):**
```typescript
private calculateHealthScore(snapshot: DailySnapshot, referenceDate: Date): number {
  if (!this.isSystemActive(snapshot, referenceDate)) {
    return 0;
  }

  // Count health tools (R7, AM, DF)
  const healthTools = [
    snapshot.r7Found,  // ← Uses strict "found today" value
    snapshot.amFound,
    snapshot.dfFound,
  ].filter(Boolean).length;

  return healthTools / 3;
}
```

**New "true state" health score:**
```typescript
private calculateHealthScore(snapshot: DailySnapshot, referenceDate: Date): number {
  if (!this.isSystemActive(snapshot, referenceDate)) {
    return 0;
  }

  // Define grace period for "true state" health
  const HEALTH_GRACE_PERIOD_DAYS = 3;

  // Count health tools using "found recently" logic
  const healthTools = [
    snapshot.r7Found || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= HEALTH_GRACE_PERIOD_DAYS),
    snapshot.amFound || (snapshot.amLagDays !== null && snapshot.amLagDays <= HEALTH_GRACE_PERIOD_DAYS),
    snapshot.dfFound || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= HEALTH_GRACE_PERIOD_DAYS),
  ].filter(Boolean).length;

  return healthTools / 3;
}
```

**Logic:**
- If tool checked in today (`r7Found = 1`): Count it ✅
- If tool didn't check in today BUT lag <= 3 days: Still count it ✅
- If tool lag > 3 days: Don't count it ❌

**This provides "true state" without changing import logic.**

---

### Option C: Create Separate "True State" Endpoint

**Keep current endpoint for daily tracking**, add new endpoint for strategic view:

```typescript
// Current: Daily check-in tracking
@Get('health-trending')
async getHealthTrending() {
  // Uses strict r7Found, amFound, dfFound
}

// New: True state tracking
@Get('health-trending/true-state')
async getHealthTrendingTrueState() {
  // Uses grace period logic
}
```

**Benefits:**
- Preserves existing behavior
- Adds new capability
- Users can choose which view they need

---

## Recommended Implementation: Option B

**Why Option B is best:**
1. **No schema changes** - Uses existing lag day fields
2. **Preserves import logic** - Daily snapshots remain accurate
3. **Simple implementation** - One function change
4. **Backward compatible** - Doesn't break existing functionality
5. **Solves the problem** - Provides "true state" you're looking for

### Implementation Steps

#### Step 1: Update Health Score Calculation

**File:** [`backend/src/modules/systems/systems.service.ts`](backend/src/modules/systems/systems.service.ts:82)

**Add constant after line 10:**
```typescript
export class SystemsService {
  private readonly INTUNE_INACTIVE_DAYS = 15;
  private readonly HEALTH_GRACE_PERIOD_DAYS = 3; // For "true state" health calculation
```

**Update `calculateHealthScore()` function (lines 91-106):**
```typescript
/**
 * Calculate fractional health score for a system
 * Returns a score between 0 and 1 based on tool coverage
 * Uses grace period to provide "true state" health vs daily check-in
 * - 3/3 tools = 1.0 (100%)
 * - 2/3 tools = 0.667 (66.7%)
 * - 1/3 tools = 0.333 (33.3%)
 * - 0/3 tools = 0.0 (0%)
 * - Inactive = 0.0 (excluded from calculations)
 */
private calculateHealthScore(snapshot: DailySnapshot, referenceDate: Date): number {
  // First check if system is active in Intune
  if (!this.isSystemActive(snapshot, referenceDate)) {
    return 0; // Inactive systems don't contribute to health score
  }

  // Count health tools using "true state" logic:
  // Tool counts if it's either:
  // 1. Found today (r7Found = 1), OR
  // 2. Found in platform AND checked in within grace period (lag <= 3 days)
  const healthTools = [
    snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
  ].filter(Boolean).length;

  // Return fractional score
  return healthTools / 3;
}
```

#### Step 2: Update `calculateSystemHealth()` Function

**File:** [`backend/src/modules/systems/systems.service.ts`](backend/src/modules/systems/systems.service.ts:60)

**Update function (lines 60-80):**
```typescript
/**
 * Calculate health status for a system
 * Health is based on: Rapid7, Automox, and Defender (VMware excluded)
 * Uses grace period to provide "true state" health
 *
 * Returns:
 * - 'fully': All 3 tools present (checked in within grace period)
 * - 'partially': 1-2 tools present
 * - 'unhealthy': 0 tools present (but system is active)
 * - 'inactive': Not active (no Intune and no health tools)
 */
private calculateSystemHealth(snapshot: DailySnapshot, referenceDate: Date): 'fully' | 'partially' | 'unhealthy' | 'inactive' {
  // First check if system is active (Intune OR health tools present)
  if (!this.isSystemActive(snapshot, referenceDate)) {
    return 'inactive';
  }

  // Count health tools using "true state" logic (with grace period)
  const healthTools = [
    snapshot.r7Found === 1 || (snapshot.r7LagDays !== null && snapshot.r7LagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    snapshot.amFound === 1 || (snapshot.amLagDays !== null && snapshot.amLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
    snapshot.dfFound === 1 || (snapshot.dfLagDays !== null && snapshot.dfLagDays <= this.HEALTH_GRACE_PERIOD_DAYS),
  ].filter(Boolean).length;

  if (healthTools === 3) {
    return 'fully'; // Fully healthy: All 3 tools
  } else if (healthTools >= 1) {
    return 'partially'; // Partially healthy: 1-2 tools
  } else {
    return 'unhealthy'; // Unhealthy: In Intune but no tools
  }
}
```

---

## What This Achieves

### Before (Current Behavior)
**Friday:**
- R7: found=1, lag=0 → Counts ✅
- AM: found=1, lag=0 → Counts ✅
- DF: found=1, lag=0 → Counts ✅
- **Health: 100%** (3/3 tools)

**Saturday:**
- R7: found=0, lag=1 → Doesn't count ❌
- AM: found=0, lag=1 → Doesn't count ❌
- DF: found=0, lag=1 → Doesn't count ❌
- **Health: 0%** (0/3 tools) ← **Problem!**

### After (True State Behavior)
**Friday:**
- R7: found=1 OR lag=0 → Counts ✅
- AM: found=1 OR lag=0 → Counts ✅
- DF: found=1 OR lag=0 → Counts ✅
- **Health: 100%** (3/3 tools)

**Saturday:**
- R7: found=0 BUT lag=1 (≤3) → Still counts ✅
- AM: found=0 BUT lag=1 (≤3) → Still counts ✅
- DF: found=0 BUT lag=1 (≤3) → Still counts ✅
- **Health: 100%** (3/3 tools) ← **Fixed!**

**Sunday:**
- R7: found=0 BUT lag=2 (≤3) → Still counts ✅
- AM: found=0 BUT lag=2 (≤3) → Still counts ✅
- DF: found=0 BUT lag=2 (≤3) → Still counts ✅
- **Health: 100%** (3/3 tools) ← **Stable!**

**Wednesday (tool actually stops reporting):**
- R7: found=0 AND lag=5 (>3) → Doesn't count ❌
- AM: found=1 OR lag=0 → Counts ✅
- DF: found=1 OR lag=0 → Counts ✅
- **Health: 66.7%** (2/3 tools) ← **Real issue detected!**

---

## Key Differences from Previous Analysis

### What I Got Wrong Before
- I thought `FoundRaw` was being overridden incorrectly
- I suggested changing the import logic
- I focused on the wrong part of the code

### What's Actually Happening
- Import logic is correct - it tracks daily check-ins
- The issue is in the **health calculation**, not import
- We need to add grace period logic to health scoring, not import

### Why This Solution is Better
- **Preserves data accuracy** - Daily snapshots remain precise
- **No schema changes** - Uses existing lag day fields
- **Minimal code changes** - Only 2 functions updated
- **Maintains audit trail** - Can still see daily check-in patterns
- **Provides true state** - Health reflects persistent status

---

## Testing Strategy

### 1. Verify Weekend Stability

**Query to test:**
```sql
SELECT 
  DATE(importDate) as date,
  DAYNAME(importDate) as day,
  COUNT(*) as total_systems,
  -- Old logic (strict)
  SUM(CASE WHEN r7Found = 1 THEN 1 ELSE 0 END) as r7_strict,
  -- New logic (grace period)
  SUM(CASE WHEN r7Found = 1 OR r7LagDays <= 3 THEN 1 ELSE 0 END) as r7_grace,
  -- Difference
  SUM(CASE WHEN r7Found = 1 OR r7LagDays <= 3 THEN 1 ELSE 0 END) - 
  SUM(CASE WHEN r7Found = 1 THEN 1 ELSE 0 END) as systems_recovered
FROM daily_snapshots
WHERE importDate BETWEEN '2026-01-17' AND '2026-01-20'
  AND possibleFake = 0
  AND (itLagDays IS NULL OR itLagDays <= 15)
GROUP BY DATE(importDate)
ORDER BY date;
```

**Expected results:**
- Friday: systems_recovered = 0 (all checked in)
- Saturday: systems_recovered = ~1500-2000 (weekend systems)
- Sunday: systems_recovered = ~1500-2000 (weekend systems)
- Monday: systems_recovered = 0 (all checked in again)

### 2. Verify Real Issues Still Detected

**Test case:** System that truly stops reporting

**Scenario:**
- Day 1-5: Tool checks in (lag=0) → Healthy ✅
- Day 6: Tool stops checking in (lag=1) → Still healthy (grace period) ✅
- Day 7: lag=2 → Still healthy (grace period) ✅
- Day 8: lag=3 → Still healthy (at threshold) ✅
- Day 9: lag=4 → NOW unhealthy (beyond grace period) ❌

**This ensures real issues are detected within 4 days.**

---

## Configuration Recommendations

### Grace Period Selection

| Grace Period | Use Case | Pros | Cons |
|--------------|----------|------|------|
| **1 day** | Strict monitoring | Fast detection | Weekend volatility |
| **2 days** | Balanced | Covers Sat-Sun | May miss Friday issues |
| **3 days** | Recommended | Covers weekend + buffer | 4-day detection delay |
| **7 days** | Relaxed | Very stable | Masks real issues |

**Recommendation:** Start with 3 days, can be made configurable later.

---

## Documentation Updates

### Update Health Scoring Methodology

**File:** [`documentation/HEALTH-SCORING-METHODOLOGY.md`](documentation/HEALTH-SCORING-METHODOLOGY.md)

**Add section:**

```markdown
## True State vs. Daily Check-in

The health trending dashboard uses a **grace period approach** to provide "true state" health:

### Daily Snapshots (Preserved)
- `r7Found`, `amFound`, `dfFound` = Tool checked in **on that specific day**
- `r7LagDays`, `amLagDays`, `dfLagDays` = Days since last check-in
- **Purpose:** Accurate daily operational tracking

### Health Calculations (Grace Period)
- Tool counts as "healthy" if:
  1. Checked in today (`found = 1`), OR
  2. Checked in within last 3 days (`lagDays <= 3`)
- **Purpose:** Strategic "true state" health assessment

### Why This Matters

**Without grace period (old):**
- Friday: 100% healthy (all tools checked in)
- Saturday: 0% healthy (no tools checked in today)
- Reality: Systems are still healthy, just not checking in on weekends

**With grace period (new):**
- Friday: 100% healthy (all tools checked in)
- Saturday: 100% healthy (tools checked in within 3 days)
- Reality: Accurate representation of system health state

### Detection Timeline

- **Day 0:** Tool checks in → Healthy ✅
- **Day 1-3:** Tool doesn't check in → Still healthy (grace period) ✅
- **Day 4+:** Tool still not checking in → Unhealthy (real issue) ❌

This provides stable weekend metrics while still detecting real issues within 4 days.
```

---

## Success Metrics

### Quantitative
- [ ] Weekend health rate variance < 5% (currently 20%)
- [ ] Weekend health rate matches Friday ±3%
- [ ] Real issues still detected within 4 days
- [ ] No false positives on weekends

### Qualitative
- [ ] User reports dashboard shows "true state"
- [ ] Confidence in trending analysis restored
- [ ] Weekend metrics are stable and predictable
- [ ] Real health changes still visible

---

## Conclusion

The current import logic is **correct** - it accurately tracks daily check-ins. The issue is that **health calculations need a grace period** to show "true state" rather than "checked in today."

**Solution:** Modify health calculation functions to use 3-day grace period, providing stable weekend metrics while maintaining accurate daily snapshots and detecting real issues within 4 days.

This gives you the "true state" health reporting you need without losing the precision of daily operational tracking.

---

**Document Version:** 2.0 (Revised)  
**Date:** February 2, 2026  
**Status:** Ready for Implementation  
**Estimated Effort:** 1-2 hours
