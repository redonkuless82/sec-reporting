# Health Logic Refactoring Implementation Plan

## Overview
Refactor the application from "Compliance Tracking" to "Tooling Health Reporting" with updated business logic.

## Business Logic Changes

### Old Logic (Compliance)
- **Tools Considered**: Rapid7, Automox, Defender, Intune, VMware (5 tools)
- **Fully Compliant**: All 5 tools reporting
- **Partially Compliant**: 3-4 tools reporting
- **Non-Compliant**: 0-2 tools reporting
- **No time-based filtering**

### New Logic (Health)
- **Primary Discovery**: Intune (must be present)
- **Health Tools**: Rapid7, Automox, Defender (3 tools)
- **Excluded**: VMware (not relevant to tooling health)
- **Active System**: Seen in Intune within last 15 days
- **Health Categories**:
  - **Fully Healthy**: Intune (active) + R7 + AM + DF (all 3 tools)
  - **Partially Healthy**: Intune (active) + 1-2 tools
  - **Unhealthy**: Intune (active) but missing all 3 tools
  - **Inactive**: Not in Intune OR Intune lag > 15 days

## Implementation Checklist

### Phase 1: Backend Core Logic ✅ (Completed)
- [x] Add `INTUNE_INACTIVE_DAYS` constant (15 days)
- [x] Create `isSystemActive()` helper function
- [x] Create `calculateSystemHealth()` helper function

### Phase 2: Backend Service Methods (6 methods to update)

#### 2.1 Update `getComplianceTrending()` → `getHealthTrending()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 285-505)

**Changes Needed**:
1. Rename method to `getHealthTrending()`
2. Update health calculation logic:
   ```typescript
   // OLD: Count all 5 tools
   const toolsFound = [r7, am, df, it, vm].filter(Boolean).length;
   if (toolsFound === 5) fullyCompliant++;
   else if (toolsFound >= 3) partiallyCompliant++;
   else nonCompliant++;
   
   // NEW: Use helper function
   const healthStatus = this.calculateSystemHealth(snapshot, new Date(date));
   if (healthStatus === 'fully') fullyHealthy++;
   else if (healthStatus === 'partially') partiallyHealthy++;
   else if (healthStatus === 'unhealthy') unhealthy++;
   else if (healthStatus === 'inactive') inactive++;
   ```
3. Update variable names: `fullyCompliant` → `fullyHealthy`, etc.
4. Update return object property names
5. Update tool compliance tracking (remove VMware)
6. Filter out inactive systems from trending data

#### 2.2 Update `getSystemsByComplianceCategory()` → `getSystemsByHealthCategory()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 507-630)

**Changes Needed**:
1. Rename method to `getSystemsByHealthCategory()`
2. Update category parameter type: `'fully' | 'partially' | 'non' | 'new'` → `'fully' | 'partially' | 'unhealthy' | 'inactive' | 'new'`
3. Replace manual tool counting with `calculateSystemHealth()` helper
4. Update filtering logic for each category
5. Update return object property names

#### 2.3 Verify `getNewSystemsToday()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 151-210)

**Status**: Already updated to use latest import date ✅
**Action**: Verify it works correctly with new health logic

#### 2.4 Update `getMissingSystems()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 206-283)

**Changes Needed**:
1. Consider renaming to `getInactiveSystems()` for clarity
2. Update logic to use Intune-based activity check
3. Filter based on 15-day Intune threshold

#### 2.5 Update `getStats()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 130-149)

**Changes Needed**:
1. Update terminology in return object
2. Consider adding active vs inactive system counts

#### 2.6 Update `getCalendarData()`
**File**: `backend/src/modules/systems/systems.service.ts` (lines 79-128)

**Changes Needed**:
1. Update tool compliance display (remove VMware)
2. Update comments and variable names

### Phase 3: Backend API Endpoints

#### 3.1 Update Controller
**File**: `backend/src/modules/systems/systems.controller.ts`

**Changes Needed**:
1. Rename endpoint: `@Get('compliance-trending')` → `@Get('health-trending')`
2. Rename endpoint: `@Get('compliance-category')` → `@Get('health-category')`
3. Update method names to match service
4. Update JSDoc comments

### Phase 4: Frontend Components

#### 4.1 Rename Main Component
**Files to Update**:
- `frontend/src/components/ComplianceDashboard.tsx` → `HealthDashboard.tsx`
- `frontend/src/components/ComplianceDrillDownModal.tsx` → `HealthDrillDownModal.tsx`
- `frontend/src/components/ComplianceCalendar.tsx` → `HealthCalendar.tsx`

#### 4.2 Update API Calls
**File**: `frontend/src/services/api.ts` (if exists) or component files

**Changes Needed**:
1. Update endpoint URLs: `/systems/compliance-trending` → `/systems/health-trending`
2. Update endpoint URLs: `/systems/compliance-category` → `/systems/health-category`
3. Update response type interfaces

#### 4.3 Update UI Text Throughout Frontend
**Search and Replace**:
- "Compliance" → "Health"
- "Compliant" → "Healthy"
- "Non-Compliant" → "Unhealthy"
- "Fully Compliant" → "Fully Healthy"
- "Partially Compliant" → "Partially Healthy"

**Files to Check**:
- All component files in `frontend/src/components/`
- `frontend/src/App.tsx`
- Any type definition files

#### 4.4 Update Health Categories Display
**Changes Needed**:
1. Update category labels and colors
2. Add "Inactive" category display
3. Remove VMware from tool status displays
4. Update tooltips and help text

### Phase 5: Documentation Updates

#### 5.1 Update README.md
**File**: `README.md`

**Changes Needed**:
1. Update project title: "Compliance Tracking Dashboard" → "Tooling Health Dashboard"
2. Update overview section
3. Update key features section
4. Update health logic explanation:
   ```markdown
   ## Health Categories
   
   - **Fully Healthy**: System is active in Intune (last 15 days) and reports to all 3 tools (Rapid7, Automox, Defender)
   - **Partially Healthy**: System is active in Intune and reports to 1-2 tools
   - **Unhealthy**: System is active in Intune but not reporting to any tools
   - **Inactive**: System has not been seen in Intune for more than 15 days
   - **New Systems**: Systems discovered for the first time on the latest import date
   
   **Note**: VMware is not considered in health calculations as it's infrastructure-level, not tooling health.
   ```
5. Update API endpoints documentation
6. Update database schema description
7. Update troubleshooting section

#### 5.2 Update QUICK-START.md
**File**: `QUICK-START.md`

**Changes Needed**:
1. Update terminology throughout
2. Update feature descriptions
3. Update example queries

#### 5.3 Update GITHUB-DEPLOYMENT-READY.md
**File**: `GITHUB-DEPLOYMENT-READY.md`

**Changes Needed**:
1. Update project description
2. Update feature list
3. Update terminology

#### 5.4 Update Other Documentation Files
**Files to Check**:
- `DRILL_DOWN_IMPLEMENTATION.md`
- `ENVIRONMENT_FILTERING_IMPLEMENTATION.md`
- `ENVIRONMENT_SELECTOR_FIXES.md`
- `K3S-DEPLOYMENT.md`

### Phase 6: Testing

#### 6.1 Backend Testing
**Manual Tests**:
1. Test `/systems/health-trending` endpoint
   - Verify inactive systems are excluded
   - Verify health categories are correct
   - Verify VMware is not counted
2. Test `/systems/health-category` endpoint for each category
3. Test `/systems/new-today` endpoint
4. Verify Intune 15-day threshold works correctly

**Test Scenarios**:
- System with all 3 tools + active Intune = Fully Healthy
- System with 2 tools + active Intune = Partially Healthy
- System with 0 tools + active Intune = Unhealthy
- System with Intune lag > 15 days = Inactive
- System without Intune = Inactive

#### 6.2 Frontend Testing
**Manual Tests**:
1. Verify dashboard displays correctly
2. Verify health categories show correct counts
3. Verify drill-down modals work
4. Verify calendar heatmap displays correctly
5. Verify search functionality works
6. Verify environment filtering works

#### 6.3 Integration Testing
**Test Full Flow**:
1. Import CSV with various system states
2. Verify dashboard reflects correct health status
3. Verify trending shows correct data
4. Verify drill-down shows correct systems

### Phase 7: Deployment

#### 7.1 Database Considerations
**Note**: No database schema changes required. The logic changes are application-level only.

#### 7.2 Git Commit Strategy
**Recommended Commits**:
1. "Add health calculation helper functions"
2. "Refactor backend service methods to use health logic"
3. "Update API endpoints from compliance to health"
4. "Refactor frontend components for health terminology"
5. "Update all documentation for health terminology"
6. "Fix: Update new systems logic to use latest import date"

#### 7.3 Deployment Steps
```bash
# 1. Commit all changes
git add .
git commit -m "Major refactor: Change from compliance to health tracking with new business logic"

# 2. Push to GitHub
git push origin main

# 3. Deploy to servers
docker-compose down
docker-compose up -d --build

# 4. Verify deployment
curl http://localhost:3002/systems/health-trending
curl http://localhost:8010
```

## Risk Assessment

### High Risk
- **Breaking Changes**: API endpoint names changed (frontend must be updated simultaneously)
- **Business Logic**: Fundamental change in how systems are categorized

### Medium Risk
- **Data Interpretation**: Historical data will be reinterpreted with new logic
- **User Training**: Users need to understand new terminology and categories

### Low Risk
- **Database**: No schema changes required
- **Performance**: Helper functions may improve performance

## Rollback Plan

If issues arise:
1. Revert to previous commit: `git revert HEAD`
2. Rebuild containers: `docker-compose up -d --build`
3. Old API endpoints and logic will be restored

## Timeline Estimate

- **Phase 1**: ✅ Complete (30 minutes)
- **Phase 2**: 2-3 hours (6 service methods)
- **Phase 3**: 30 minutes (controller updates)
- **Phase 4**: 2-3 hours (frontend refactoring)
- **Phase 5**: 1-2 hours (documentation)
- **Phase 6**: 1-2 hours (testing)
- **Phase 7**: 30 minutes (deployment)

**Total**: 8-12 hours of development work

## Success Criteria

- [ ] All backend methods use new health logic
- [ ] All API endpoints renamed and functional
- [ ] Frontend displays correct health categories
- [ ] VMware excluded from all health calculations
- [ ] Inactive systems (Intune > 15 days) properly filtered
- [ ] All documentation updated
- [ ] All tests passing
- [ ] Application deployed and verified

## Notes

- Keep old code commented out initially for reference
- Test thoroughly before pushing to production
- Consider adding feature flag for gradual rollout
- Update any monitoring/alerting based on new terminology
