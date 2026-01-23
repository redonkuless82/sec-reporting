# Database Seed Data

This directory contains SQL seed data for the Compliance Tracking Dashboard.

## Seed Data Overview

The [`seed-data.sql`](seed-data.sql:1) file contains:

- **22 unique systems** across production, development, and test environments
- **50+ daily snapshot records** showing various compliance states
- **Historical data** for 3 systems showing trends over 7 days

## Scenarios Included

The seed data demonstrates various real-world scenarios:

1. **Fully Compliant Systems** - All tools reporting (web-prod-01, api-prod-01, mon-prod-01)
2. **Partial Coverage** - Missing from some tools (web-prod-02, cache-prod-01)
3. **Critical Vulnerabilities** - Systems with security issues (db-prod-01, backup-prod-01, mail-prod-01, legacy-prod-01)
4. **Stale Data** - Systems not seen recently with high lag days (app-prod-01)
5. **Development/Test Systems** - Not monitored by all tools (web-dev-01, api-dev-01, web-test-01)
6. **Legacy Systems** - Unsupported OS (legacy-prod-01 with Windows Server 2012 R2)
7. **Systems Needing Attention** - Reboot or maintenance required (db-prod-01, backup-prod-01, mail-prod-01)
8. **Worker Nodes** - Different states for comparison (worker-prod-01 vs worker-prod-02)

## Historical Trends

Three systems have 7 days of historical data to demonstrate calendar visualization:

- **web-prod-01**: Consistently compliant over time
- **db-prod-01**: Increasing critical vulnerabilities (0 → 5 over 7 days)
- **cache-prod-01**: Gradually appearing in more tools (0 → 2 tools)

## Loading the Seed Data

### Prerequisites

1. Database must be created and schema must exist
2. Run migrations first to create tables

### Method 1: Direct MySQL Command

```bash
mysql -u root -p compliance_tracker < backend/database/seed-data.sql
```

### Method 2: Docker Compose

```bash
# Copy seed file into container
docker cp backend/database/seed-data.sql compliance-tracker-db:/tmp/

# Execute in container
docker exec -i compliance-tracker-db mysql -u root -p${DB_PASSWORD} compliance_tracker < /tmp/seed-data.sql
```

### Method 3: Kubernetes

```bash
# Copy to pod
kubectl cp backend/database/seed-data.sql compliance-tracker/mariadb-0:/tmp/

# Execute in pod
kubectl exec -it mariadb-0 -n compliance-tracker -- mysql -u root -p compliance_tracker < /tmp/seed-data.sql
```

### Method 4: After Application Start

```bash
# If using Docker Compose
docker-compose exec db mysql -u root -p${DB_PASSWORD} compliance_tracker < backend/database/seed-data.sql
```

## Verifying the Data

After loading, verify the data:

```sql
-- Check systems count
SELECT COUNT(*) FROM systems;
-- Expected: 22

-- Check snapshots count
SELECT COUNT(*) FROM daily_snapshots;
-- Expected: 50+

-- Check date range
SELECT MIN(importDate), MAX(importDate) FROM daily_snapshots;
-- Expected: 7-8 days of data

-- View systems by environment
SELECT env, COUNT(*) FROM systems GROUP BY env;
-- Expected: prod: 15, dev: 4, test: 3

-- Check compliance states
SELECT 
    shortname,
    r7Found, amFound, dfFound, itFound, vmFound,
    numCriticals
FROM daily_snapshots 
WHERE importDate = CURDATE()
ORDER BY numCriticals DESC, shortname;
```

## Data Characteristics

### System Distribution
- **Production**: 15 systems
- **Development**: 4 systems
- **Test**: 3 systems

### Tool Coverage Patterns
- **All 5 tools**: 10 systems
- **4 tools**: 5 systems
- **3 tools**: 4 systems
- **2 tools**: 3 systems

### Critical Vulnerabilities
- **0 criticals**: 14 systems
- **1-3 criticals**: 4 systems
- **4-5 criticals**: 2 systems
- **8 criticals**: 1 system (legacy)

### Operating Systems
- **Ubuntu 22.04 LTS**: 10 systems
- **Ubuntu 20.04 LTS**: 5 systems
- **Red Hat Enterprise Linux 8**: 1 system
- **Debian 11**: 1 system
- **Windows Server 2019**: 1 system
- **Windows Server 2012 R2**: 1 system (unsupported)
- **Various specialized**: 3 systems

## Customizing the Data

To modify the seed data:

1. Edit [`seed-data.sql`](seed-data.sql:1)
2. Adjust dates, tool coverage, or add new systems
3. Reload the data (drop tables first if needed)

```sql
-- Clear existing data
TRUNCATE TABLE daily_snapshots;
TRUNCATE TABLE systems;

-- Then reload seed-data.sql
```

## Notes

- All dates are relative to `CURDATE()` so data stays current
- IP addresses use RFC 5737 documentation ranges (203.0.113.0/24)
- Private IPs use RFC 1918 ranges (10.0.0.0/8)
- Email addresses use example.com domain
- Tool IDs follow consistent patterns (DF-xxxxx, IT-xxxxx)

## Troubleshooting

**Error: Table doesn't exist**
- Run migrations first to create schema

**Error: Duplicate entry**
- Data already loaded, truncate tables first

**Error: Access denied**
- Check database credentials in .env file

**No data visible in frontend**
- Verify backend can connect to database
- Check API endpoints return data
- Review browser console for errors
