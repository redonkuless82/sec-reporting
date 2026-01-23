# Quick Start Guide - Compliance Tracker

Get the Compliance Tracker up and running in minutes with Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

## Quick Setup (3 Steps)

### 1. Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url>
cd sec-report

# Copy environment file
cp .env.example .env

# (Optional) Edit .env to change database credentials
# Default credentials work fine for testing
```

### 2. Start the Application

```bash
# Start all services (database will be automatically initialized)
docker-compose up -d

# Wait for services to be ready (about 30 seconds)
docker-compose logs -f
```

Press `Ctrl+C` to exit logs once you see the backend is ready.

### 3. Access the Application

- **Frontend Dashboard**: http://localhost:8010
- **Backend API**: http://localhost:3002
- **Database**: localhost:3308

## Verify It's Working

```bash
# Check health endpoint
curl http://localhost:3002/health

# Check systems API
curl http://localhost:3002/systems

# Check frontend
curl http://localhost:8010
```

## What's Included

✅ **Automatic Database Setup**
- Database schema is created automatically on first run
- No manual SQL scripts needed

✅ **All Services Configured**
- MariaDB database with persistent storage
- NestJS backend API
- React frontend with Nginx

✅ **Ready for Data Import**
- Upload CSV files via the web interface
- Or use the API endpoints

## Port Configuration

The application uses the following ports:

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 8010 | Web interface |
| Backend | 3002 | API server (mapped from internal 3000) |
| Database | 3308 | MariaDB (mapped from internal 3306) |

## Import Your First CSV

Once running, you can import data:

### Via Web Interface
1. Navigate to http://localhost:8010
2. Use the CSV import feature
3. Upload your compliance data file

### Via API
```bash
curl -X POST http://localhost:3002/import/csv \
  -F "file=@/path/to/your-data.csv"
```

## Common Commands

```bash
# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Stop and remove all data (fresh start)
docker-compose down -v
```

## Troubleshooting

### Port Already in Use

If you get port conflicts, edit [`docker-compose.yml`](docker-compose.yml) and change the port mappings:

```yaml
ports:
  - "8011:80"  # Change 8010 to 8011 for frontend
  - "3003:3000"  # Change 3002 to 3003 for backend
  - "3309:3306"  # Change 3308 to 3309 for database
```

### Database Connection Issues

```bash
# Check database is healthy
docker-compose ps

# View database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

### Frontend Can't Connect to Backend

Check the backend is running:
```bash
curl http://localhost:3002/health
```

If it returns `{"status":"ok"}`, the backend is working.

### Clean Slate

To start completely fresh:
```bash
# Remove all containers and volumes
docker-compose down -v

# Remove images (optional)
docker-compose down --rmi all

# Start again
docker-compose up -d
```

## Environment Variables

The root [`.env`](.env.example) file controls Docker Compose settings:

```env
# Database Configuration
DB_USER=compliance
DB_PASSWORD=secure-password-change-me
DB_NAME=compliance_tracker

# Application Configuration
NODE_ENV=production
FRONTEND_URL=http://localhost:8010
```

**Note:** For local development (without Docker), see the main [README.md](README.md) for backend and frontend `.env` configuration.

## Next Steps

1. ✅ Application is running at http://localhost:8010
2. 📊 Import your compliance CSV data
3. 🔍 Search for systems and view compliance status
4. 📅 Explore calendar heatmaps for historical data
5. 📈 Monitor compliance trends over time

## Need Help?

- See the full [README.md](README.md) for detailed documentation
- Check [K3S-DEPLOYMENT.md](K3S-DEPLOYMENT.md) for Kubernetes deployment
- Review API endpoints in the [README.md](README.md#-api-endpoints) section

---

**Built with:** NestJS • React • TypeScript • MariaDB • Docker
