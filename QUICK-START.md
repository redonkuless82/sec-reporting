# Quick Start Guide - Compliance Tracker

## Current Status

✅ **Docker Images Built:**
- `compliance-tracker-backend:latest`
- `compliance-tracker-frontend:latest`

✅ **Configuration Updated:**
- Frontend: Port **8010** (to avoid nginx conflict)
- Backend: Port **3001** (to avoid port 3000 conflict)
- Database: Port **3307** (to avoid MySQL conflict on 3306)

## Deploy When Ready

### Option 1: Docker Compose (Recommended for your setup)

```bash
cd /home/ubuntu/sec-report

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Load seed data (after containers are running)
sleep 30  # Wait for database to be ready
docker cp backend/database/seed-data.sql compliance-tracker-db:/tmp/
docker exec -i compliance-tracker-db mysql -u root -ppassword compliance_tracker < /tmp/seed-data.sql
```

### Access Points:
- **Frontend**: http://localhost:8010 or http://your-ip:8010
- **Backend API**: http://localhost:3001
- **Database**: localhost:3307

### Verify It's Working:

```bash
# Check health
curl http://localhost:3001/health

# Check systems API
curl http://localhost:3001/systems

# Check frontend
curl http://localhost:8010
```

## Troubleshooting

### If ports are still in use:

```bash
# Check what's using the ports
sudo lsof -i :8010
sudo lsof -i :3001
sudo lsof -i :3307

# Stop conflicting services or change ports in docker-compose.yml
```

### If containers won't start:

```bash
# View logs
docker-compose logs db
docker-compose logs backend
docker-compose logs frontend

# Restart specific service
docker-compose restart backend
```

### Clean slate:

```bash
# Remove everything and start over
docker-compose down -v
docker-compose up -d
```

## What You'll See

Once deployed and seed data is loaded:

1. **Search** for systems: "web-prod-01", "db-prod-01", "cache-prod-01"
2. **View calendar** showing daily compliance status
3. **Filter by tool** (R7, AM, DF, IT, VM)
4. **See different states**:
   - 🟢 Green: Fully compliant
   - 🔴 Red: Missing from tools
   - ⚪ Gray: No data

## Seed Data Includes:

- **22 systems** across prod/dev/test environments
- **50+ daily snapshots** with various compliance states
- **Historical trends** for 3 systems over 7 days
- **Diverse scenarios**: fully compliant, partial coverage, critical vulnerabilities, stale data, etc.

## Next Steps After Deployment:

1. Access frontend at http://your-ip:8010
2. Search for a system
3. View the calendar heatmap
4. Import your own CSV data via API

---

**Note**: Your existing nginx sites (cpuiit.com, tyrantshield.com) are separate and should not be affected by this deployment since we're using different ports (8010, 3001, 3307).
