# Health Trending Fix - Implementation Guide

## Quick Reference

**Problem:** 20% health rate drops every weekend due to lag day threshold being too strict  
**Root Cause:** Tools marked as "not found" when lag days > 0, even though system is healthy  
**Solution:** Extend lag day threshold from 0 to 3 days for "found" status  
**Impact:** Stabilizes weekend metrics, provides accurate "true state" reporting  

---

## Implementation Steps

### Step 1: Update Import Service Logic

**File:** [`backend/src/modules/import/import.service.ts`](backend/src/modules/import/import.service.ts:97)

**Current Code (Lines 97-101):**
```typescript
// Calculate actual "found" status based on lag days
const r7FoundActual = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays === 0 || amLagDays === -1) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays === 0 || dfLagDays === -1) ? 1 : 0;
const itFoundActual = itFoundRaw && (itLagDays === 0 || itLagDays === -1) ? 1 : 0;
```

**New Code:**
```typescript
// Calculate actual "found" status based on lag days
// Allow 3-day threshold to handle weekends and provide "true state"
const TOOL_FOUND_THRESHOLD_DAYS = 3;

const r7FoundActual = r7FoundRaw && (r7LagDays !== null && r7LagDays <= TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays !== null && amLagDays <= TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays !== null && dfLagDays <= TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const itFoundActual = itFoundRaw && (itLagDays !== null && itLagDays <= TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
```

**Changes:**
1. Add constant `TOOL_FOUND_THRESHOLD_DAYS = 3`
2. Change condition from `=== 0 || === -1` to `<= 3`
3. Add null check for safety

---

### Step 2: Add Configuration Constant (Optional but Recommended)

**File:** [`backend/src/modules/import/import.service.ts`](backend/src/modules/import/import.service.ts:11)

**Add after line 11:**
```typescript
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  
  // Tool reporting threshold - tools are considered "found" if seen within this many days
  // This handles weekends and provides "true state" vs real-time reporting
  private readonly TOOL_FOUND_THRESHOLD_DAYS = 3;

  constructor(
    @InjectRepository(System)
    private systemRepository: Repository<System>,
    @InjectRepository(DailySnapshot)
    private snapshotRepository: Repository<DailySnapshot>,
  ) {}
```

**Then update lines 97-101 to use the class constant:**
```typescript
const r7FoundActual = r7FoundRaw && (r7LagDays !== null && r7LagDays <= this.TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays !== null && amLagDays <= this.TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays !== null && dfLagDays <= this.TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
const itFoundActual = itFoundRaw && (itLagDays !== null && itLagDays <= this.TOOL_FOUND_THRESHOLD_DAYS) ? 1 : 0;
```

---

### Step 3: Update Comments for Clarity

**File:** [`backend/src/modules/import/import.service.ts`](backend/src/modules/import/import.service.ts:83)

**Update comment at line 83-86:**
```typescript
// Parse lag days for all tools to determine if they should be marked as "found"
// A tool is "found" (reporting) if lag days <= 3 days (seen recently)
// This threshold handles weekends and provides "true state" health status
// rather than strict real-time reporting which causes weekend volatility
```

---

## Testing Plan

### 1. Unit Tests

Create test file: `backend/src/modules/import/import.service.spec.ts`

```typescript
describe('ImportService - Tool Found Logic', () => {
  it('should mark tool as found when lag days is 0', () => {
    // Test lag = 0 (seen today)
  });

  it('should mark tool as found when lag days is 1', () => {
    // Test lag = 1 (seen yesterday)
  });

  it('should mark tool as found when lag days is 3', () => {
    // Test lag = 3 (at threshold)
  });

  it('should mark tool as NOT found when lag days is 4', () => {
    // Test lag = 4 (beyond threshold)
  });

  it('should mark tool as NOT found when lag days is null', () => {
    // Test null lag days
  });

  it('should handle weekend scenario correctly', () => {
    // Friday: lag=0 → found=1
    // Saturday: lag=1 → found=1 (should still be found)
    // Sunday: lag=2 → found=1 (should still be found)
    // Monday: lag=3 → found=1 (should still be found)
  });
});
```

### 2. Integration Tests

**Test with historical data:**
```sql
-- Query to test weekend data
SELECT 
  DATE(importDate) as date,
  COUNT(*) as total_systems,
  SUM(CASE WHEN r7LagDays <= 3 THEN 1 ELSE 0 END) as r7_found_new_logic,
  SUM(CASE WHEN r7LagDays = 0 OR r7LagDays = -1 THEN 1 ELSE 0 END) as r7_found_old_logic,
  SUM(CASE WHEN amLagDays <= 3 THEN 1 ELSE 0 END) as am_found_new_logic,
  SUM(CASE WHEN dfLagDays <= 3 THEN 1 ELSE 0 END) as df_found_new_logic
FROM daily_snapshots
WHERE importDate BETWEEN '2026-01-17' AND '2026-01-20'
  AND possibleFake = 0
GROUP BY DATE(importDate)
ORDER BY date;
```

**Expected results:**
- Weekend counts should be similar to Friday counts
- No dramatic drops in "found" counts

### 3. Dashboard Validation

**Before fix:**
- Weekend health rate: ~65-70%
- Dramatic blue line drops
- Yellow area expansion

**After fix:**
- Weekend health rate: ~85-87% (stable)
- Blue line remains steady
- Minimal area changes

---

## Rollback Plan

If issues arise, revert to original logic:

```typescript
// ROLLBACK: Original strict logic
const r7FoundActual = r7FoundRaw && (r7LagDays === 0 || r7LagDays === -1) ? 1 : 0;
const amFoundActual = amFoundRaw && (amLagDays === 0 || amLagDays === -1) ? 1 : 0;
const dfFoundActual = dfFoundRaw && (dfLagDays === 0 || dfLagDays === -1) ? 1 : 0;
const itFoundActual = itFoundRaw && (itLagDays === 0 || itLagDays === -1) ? 1 : 0;
```

---

## Deployment Steps

### 1. Pre-Deployment
- [ ] Review code changes
- [ ] Run unit tests
- [ ] Test with historical weekend data
- [ ] Backup database
- [ ] Document current weekend metrics

### 2. Deployment
- [ ] Deploy to staging environment
- [ ] Import weekend test data
- [ ] Verify health trending endpoint
- [ ] Check dashboard visualization
- [ ] Compare before/after metrics

### 3. Post-Deployment
- [ ] Monitor weekend metrics (next weekend)
- [ ] Verify no false negatives (real issues still detected)
- [ ] Collect user feedback
- [ ] Document actual impact

### 4. Validation
- [ ] Weekend health rate variance < 5%
- [ ] No user reports of "numbers seem off"
- [ ] Week-over-week comparisons stable
- [ ] Real health changes still visible

---

## Alternative Threshold Values

If 3 days doesn't work, consider these alternatives:

| Threshold | Use Case | Pros | Cons |
|-----------|----------|------|------|
| **1 day** | Strict monitoring | Catches issues fast | Weekend volatility remains |
| **2 days** | Balanced | Covers Sat-Sun | May miss Friday issues |
| **3 days** | Recommended | Covers weekend + buffer | 3-day delay in detection |
| **7 days** | Relaxed | Very stable | Masks real issues |

**Recommendation:** Start with 3 days, adjust based on feedback

---

## Monitoring Queries

### Query 1: Weekend Health Rate Comparison
```sql
SELECT 
  DATE(importDate) as date,
  DAYNAME(importDate) as day_of_week,
  COUNT(*) as total_systems,
  SUM(CASE WHEN r7Found = 1 OR amFound = 1 OR dfFound = 1 THEN 1 ELSE 0 END) as systems_with_tools,
  ROUND(SUM(CASE WHEN r7Found = 1 OR amFound = 1 OR dfFound = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as health_rate
FROM daily_snapshots
WHERE importDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND possibleFake = 0
  AND (itLagDays IS NULL OR itLagDays <= 15)
GROUP BY DATE(importDate)
ORDER BY date;
```

### Query 2: Lag Days Distribution by Day of Week
```sql
SELECT 
  DAYNAME(importDate) as day_of_week,
  AVG(r7LagDays) as avg_r7_lag,
  AVG(amLagDays) as avg_am_lag,
  AVG(dfLagDays) as avg_df_lag,
  MAX(r7LagDays) as max_r7_lag,
  MAX(amLagDays) as max_am_lag,
  MAX(dfLagDays) as max_df_lag
FROM daily_snapshots
WHERE importDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  AND possibleFake = 0
GROUP BY DAYNAME(importDate)
ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday');
```

### Query 3: Systems Affected by Threshold Change
```sql
-- Systems that would change status with new threshold
SELECT 
  shortname,
  importDate,
  r7LagDays,
  amLagDays,
  dfLagDays,
  CASE WHEN (r7LagDays = 0 OR r7LagDays = -1) THEN 1 ELSE 0 END as r7_old_logic,
  CASE WHEN r7LagDays <= 3 THEN 1 ELSE 0 END as r7_new_logic
FROM daily_snapshots
WHERE importDate = '2026-01-18'  -- Saturday
  AND possibleFake = 0
  AND (
    (r7LagDays > 0 AND r7LagDays <= 3) OR
    (amLagDays > 0 AND amLagDays <= 3) OR
    (dfLagDays > 0 AND dfLagDays <= 3)
  )
LIMIT 100;
```

---

## Documentation Updates

### 1. Update Health Scoring Methodology

**File:** [`documentation/HEALTH-SCORING-METHODOLOGY.md`](documentation/HEALTH-SCORING-METHODOLOGY.md:85)

**Add section after line 85:**

```markdown
## Tool Reporting Threshold

### Found vs. Recently Seen

A tool is considered "found" (reporting) if it has been seen within the last **3 days**. This threshold:

- **Handles weekends:** Systems that check in Friday remain "healthy" through the weekend
- **Provides "true state":** Shows persistent health status, not just real-time reporting
- **Reduces volatility:** Eliminates artificial weekend health drops
- **Maintains accuracy:** Still detects real issues within a reasonable timeframe

### Lag Days Interpretation

| Lag Days | Status | Meaning |
|----------|--------|---------|
| 0 | Fresh | Checked in today |
| 1 | Recent | Checked in yesterday |
| 2 | Recent | Checked in 2 days ago |
| 3 | Recent | Checked in 3 days ago (threshold) |
| 4-7 | Stale | Not seen recently (warning) |
| 8-14 | Very Stale | Significant gap (alert) |
| 15+ | Inactive | System considered inactive |

### Weekend Behavior

**Before Fix:**
- Friday: System healthy (lag=0)
- Saturday: System unhealthy (lag=1, marked as "not found")
- Sunday: System unhealthy (lag=2, marked as "not found")

**After Fix:**
- Friday: System healthy (lag=0, within threshold)
- Saturday: System healthy (lag=1, within threshold)
- Sunday: System healthy (lag=2, within threshold)

This provides accurate "true state" reporting across weekends.
```

### 2. Update README

**File:** `README.md`

**Add to Health Trending section:**

```markdown
#### Weekend Data Handling

The health trending dashboard uses a **3-day threshold** for tool reporting to provide stable metrics across weekends:

- Tools are considered "found" if seen within the last 3 days
- This prevents artificial health drops on weekends when systems may not check in
- Provides "true state" health status rather than strict real-time reporting
- Real issues are still detected within a reasonable timeframe
```

---

## Success Criteria

### Quantitative Metrics
- [ ] Weekend health rate variance < 5% (currently 20%)
- [ ] Weekend-to-Monday delta < 3%
- [ ] No false "systems lost health" alerts on weekends
- [ ] Week-over-week comparisons show smooth trends

### Qualitative Metrics
- [ ] User reports dashboard shows "true state"
- [ ] No complaints about weekend volatility
- [ ] Confidence in trending analysis restored
- [ ] Real issues still detected promptly

---

## Future Enhancements

### Phase 2: Add Staleness Indicators

**Dashboard changes:**
1. Display lag days next to health status
2. Color-code based on freshness:
   - 🟢 Green: lag 0-1 (fresh)
   - 🟡 Yellow: lag 2-3 (recent)
   - 🟠 Orange: lag 4-7 (stale)
   - 🔴 Red: lag 8+ (very stale)

### Phase 3: Separate Alerting Logic

**Create two thresholds:**
1. **Health Status:** 3-day threshold (persistent state)
2. **Alerting:** 1-day threshold (real-time issues)

This allows stable dashboard metrics while maintaining responsive alerting.

### Phase 4: Last Known Good State

**Implement persistent health tracking:**
1. Store last confirmed health state
2. Display both current and last known state
3. Show state change history
4. Enable "health state timeline" view

---

## Contact & Support

**Questions about this fix:**
- Review the root cause analysis: [`health-trending-weekend-issue-analysis.md`](plans/health-trending-weekend-issue-analysis.md)
- Check the health scoring methodology: [`HEALTH-SCORING-METHODOLOGY.md`](documentation/HEALTH-SCORING-METHODOLOGY.md)
- Contact the development team for implementation support

---

**Document Version:** 1.0  
**Date:** February 2, 2026  
**Status:** Ready for Implementation  
**Estimated Effort:** 2-4 hours (including testing)
