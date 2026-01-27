# Environment Filtering Fix for Home Page Sections

## Issue
When selecting an environment filter in the sidebar, the "New Systems", "Reappeared Systems", and "Missing Systems" sections on the Home page were showing data from ALL environments instead of filtering by the selected environment.

## Root Cause
The backend methods (`getNewSystemsToday`, `getReappearedSystems`, `getMissingSystems`) did not support environment filtering, and the frontend was not passing the environment parameter to these API calls.

## Changes Made

### Backend Changes

#### 1. Updated Service Methods
**File:** [`backend/src/modules/systems/systems.service.ts`](backend/src/modules/systems/systems.service.ts)

- **`getNewSystemsToday(env?: string)`** (line 230): Added environment parameter and filtering
- **`getMissingSystems(daysThreshold: number, env?: string)`** (line 299): Added environment parameter and filtering  
- **`getReappearedSystems(env?: string)`** (line 851): Added environment parameter and filtering

#### 2. Updated Controller Endpoints
**File:** [`backend/src/modules/systems/systems.controller.ts`](backend/src/modules/systems/systems.controller.ts)

- **`GET /systems/new-today?env=xxx`** (line 29): Now accepts `env` query parameter
- **`GET /systems/reappeared?env=xxx`** (line 35): Now accepts `env` query parameter
- **`GET /systems/missing?days=7&env=xxx`** (line 39): Now accepts `env` query parameter

### Frontend Changes Needed

**File:** `frontend/src/pages/Home.tsx`

The Home page needs to be updated to pass the `envFilter` state to the API calls. Currently at lines 36-38:

```typescript
loadEnvironments();
loadNewSystemsToday();
loadReappearedSystems();
loadMissingSystems();
```

These should be updated to:

```typescript
useEffect(() => {
  loadNewSystemsToday();
  loadReappearedSystems();
  loadMissingSystems();
}, [envFilter]); // Add envFilter as dependency
```

And the API calls should pass the environment:

```typescript
const loadNewSystemsToday = async () => {
  setLoadingNewSystems(true);
  try {
    const env = envFilter === 'all' ? undefined : envFilter;
    const response = await systemsApi.getNewSystemsToday(env);
    setNewSystemsToday(response.systems || []);
    // ...
  }
};
```

Similar changes needed for `loadReappearedSystems()` and `loadMissingSystems()`.

### API Client Updates Needed

**File:** `frontend/src/services/api.ts`

The API client methods need to accept and pass the environment parameter:

```typescript
export const systemsApi = {
  getNewSystemsToday: async (env?: string) => {
    const params = new URLSearchParams();
    if (env) params.append('env', env);
    const response = await api.get(`/systems/new-today?${params.toString()}`);
    return response.data;
  },
  
  getReappearedSystems: async (env?: string) => {
    const params = new URLSearchParams();
    if (env) params.append('env', env);
    const response = await api.get(`/systems/reappeared?${params.toString()}`);
    return response.data;
  },
  
  getMissingSystems: async (days: number = 7, env?: string) => {
    const params = new URLSearchParams();
    params.append('days', days.toString());
    if (env) params.append('env', env);
    const response = await api.get(`/systems/missing?${params.toString()}`);
    return response.data;
  },
};
```

## Testing

After implementing the frontend changes:

1. Navigate to the Home page
2. Select a specific environment from the sidebar filter
3. Verify that:
   - "New Systems" section shows only systems from that environment
   - "Reappeared Systems" section shows only systems from that environment
   - "Missing Systems" section shows only systems from that environment
4. Select "All" to verify all systems are shown again

## Additional Notes

- The Health Dashboard's environment selector is independent and works correctly
- The sidebar environment filter in Home.tsx only affects the systems list, not the dashboard sections (by design)
- If you want the sidebar filter to also affect the Health Dashboard, you would need to pass the `envFilter` prop to the `<HealthDashboard>` component

## Debugging Logs Added

Added console logging to [`systems.service.ts`](backend/src/modules/systems/systems.service.ts:405-434) for the `getHealthTrending` method to help diagnose data issues:

```typescript
console.log(`[HealthTrending] Environment: ${env || 'all'}, Snapshots found: ${snapshots.length}`);
console.log(`[HealthTrending] Grouped into ${snapshotsByDate.size} unique dates`);
console.log(`[HealthTrending] Date keys:`, Array.from(snapshotsByDate.keys()));
```

Check your backend console for these logs when selecting an environment to see if data is being retrieved and grouped correctly.
