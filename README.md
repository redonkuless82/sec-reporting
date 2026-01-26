# Tooling Health Dashboard

A full-stack application for monitoring the health of systems across your network based on security tooling coverage. Track which systems are reporting to essential security tools (Rapid7, Automox, Defender) with Intune as the primary discovery mechanism, identify gaps in tooling coverage, and visualize historical health data with interactive dashboards.

## 📋 Overview

This dashboard helps identify gaps in security tooling coverage by:
- Importing daily CSV snapshots of system reporting status
- Tracking which systems report to which tools across multiple environments
- Using Intune as the primary discovery mechanism with 15-day activity threshold
- Visualizing health trends over time with interactive charts
- Providing drill-down capabilities to investigate specific health categories
- Filtering data by environment (dev, test, stage, prod)
- Displaying historical data with calendar heatmaps per system

## 🏥 Health Categories

The system categorizes each system based on its tooling health status:

- **✅ Fully Healthy**: System is active in Intune (seen within last 15 days) and reports to all 3 security tools (Rapid7, Automox, Defender)
- **⚠️ Partially Healthy**: System is active in Intune and reports to 1-2 security tools
- **❌ Unhealthy**: System is active in Intune but not reporting to any security tools
- **💤 Inactive**: System has not been seen in Intune for more than 15 days, or is not in Intune at all
- **🆕 New Systems**: Systems discovered for the first time on the latest import date

**Important Notes:**
- **Intune is the primary discovery mechanism**: A system must be present in Intune to be considered for health evaluation
- **15-day activity threshold**: Systems not seen in Intune within 15 days are marked as inactive
- **VMware is excluded**: VMware is infrastructure-level and not considered in tooling health calculations
- **Only 3 tools matter for health**: Rapid7, Automox, and Defender are the security tools evaluated

## ✨ Key Features

### 📊 Health Dashboard
- **Real-time Health Metrics**: View today's health snapshot with counts for:
  - ✅ Fully Healthy (Intune active + all 3 tools)
  - ⚠️ Partially Healthy (Intune active + 1-2 tools)
  - ❌ Unhealthy (Intune active + 0 tools)
  - 💤 Inactive (Intune > 15 days or not in Intune)
  - 🆕 New Systems (first appearance)
- **Trending Analysis**: 30-day health trend visualization
- **Environment Filtering**: Filter all data by environment (dev, test, stage, prod, or all)
- **Dynamic Environment Loading**: Environments are loaded from actual database data

### 🔍 Drill-Down Capabilities
- **Interactive Category Cards**: Click any health category to view detailed system lists
- **System Details Modal**: Shows:
  - System shortname and full name
  - Environment
  - Individual tool status (Rapid7, Automox, Defender, Intune)
  - Visual tool status indicators
  - Color-coded health badges
  - Intune activity status
- **Keyboard Accessible**: Full keyboard navigation support (Tab, Enter, Space, ESC)

### 📅 Calendar Heatmaps
- **Per-System Historical View**: Visual representation of daily reporting status
- **Color-Coded Status**: 
  - Gray: No data for that day
  - Red shades: System not found in tools (darker = fewer tools)
  - Green: System found in all selected tools
- **Tool Filtering**: Filter by specific tool (R7, AM, DF, IT, VM)
- **Month Navigation**: Browse historical data month by month
- **Hover Tooltips**: Detailed information on hover

### 🔎 Search & Discovery
- **Real-time Search**: Search by system shortname or fullname
- **Debounced API Calls**: Optimized for performance
- **Dropdown Results**: Quick access to system details

### 📥 CSV Import
- **File Upload**: Upload CSV files via web interface
- **Path Import**: Import from server file path
- **Automatic Date Extraction**: Extracts import date from filename
- **Bulk Processing**: Handles large datasets efficiently

## 🏗️ Architecture

### Technology Stack

**Backend:**
- **NestJS** - Node.js framework with TypeScript
- **TypeORM** - Database ORM with entity management
- **MariaDB** - Relational database for data storage
- **csv-parse** - CSV parsing for data ingestion
- **Multer** - File upload handling

**Frontend:**
- **React 18** - UI library with hooks
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling and dev server
- **React Router** - Client-side routing
- **React Calendar Heatmap** - Historical data visualization
- **Axios** - HTTP client for API communication
- **date-fns** - Date manipulation utilities

**Deployment:**
- **Docker & Docker Compose** - Containerization
- **Kubernetes/K3s** - Production orchestration
- **Nginx** - Frontend serving and reverse proxy

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Dashboard   │  │    Search    │  │   Calendar   │      │
│  │  Components  │  │     Bar      │  │   Heatmap    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (NestJS)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Systems    │  │    Import    │  │    Health    │      │
│  │   Module     │  │    Module    │  │    Check     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            │ TypeORM
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      MariaDB Database                        │
│  ┌──────────────┐           ┌──────────────┐               │
│  │   systems    │───────────│daily_snapshots│              │
│  │   table      │  1:many   │    table      │              │
│  └──────────────┘           └──────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## 🗄️ Database Schema

### Tables

#### `systems`
Stores unique system records with basic identification.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK) | Auto-increment primary key |
| `shortname` | varchar(255) | Unique system identifier (indexed) |
| `fullname` | varchar(500) | Full system name |
| `env` | varchar(50) | Environment (dev, test, stage, prod) |
| `createdAt` | timestamp | Record creation timestamp |
| `updatedAt` | timestamp | Record update timestamp |

#### `daily_snapshots`
Stores daily CSV import data with comprehensive system information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | int (PK) | Auto-increment primary key |
| `shortname` | varchar(255) | System identifier (indexed) |
| `importDate` | date | Date of snapshot (indexed) |
| `fullname` | varchar(500) | Full system name |
| `env` | varchar(50) | Environment |
| **Operating System** | | |
| `serverOS` | varchar(255) | Server OS type |
| `osName` | varchar(255) | OS name |
| `osFamily` | varchar(255) | OS family |
| `osBuildNumber` | varchar(100) | OS build number |
| `supportedOS` | tinyint | Whether OS is supported |
| **Network** | | |
| `ipPriv` | varchar(45) | Private IP address |
| `ipPub` | varchar(45) | Public IP address |
| **Tool Status (Found)** | | |
| `r7Found` | tinyint | Found in Rapid7 |
| `amFound` | tinyint | Found in Automox |
| `dfFound` | tinyint | Found in Defender |
| `itFound` | tinyint | Found in Intune |
| `vmFound` | tinyint | Found in VMware |
| **Recency** | | |
| `seenRecently` | tinyint | System seen recently |
| `recentR7Scan` | tinyint | Recent Rapid7 scan |
| `recentAMScan` | tinyint | Recent Automox scan |
| `recentDFScan` | tinyint | Recent Defender scan |
| `recentITScan` | tinyint | Recent Intune scan |
| **Lag Metrics** | | |
| `r7LagDays` | int | Days since last Rapid7 report |
| `amLagDays` | int | Days since last Automox report |
| `itLagDays` | int | Days since last Intune report |
| `dfLagDays` | int | Days since last Defender report |
| **Security & Maintenance** | | |
| `numCriticals` | int | Number of critical vulnerabilities |
| `needsAMReboot` | tinyint | Needs Automox reboot |
| `needsAMAttention` | tinyint | Needs Automox attention |
| `amLastUser` | varchar(255) | Last Automox user |
| **VM & Tool IDs** | | |
| `vmPowerState` | varchar(50) | VM power state |
| `dfID` | varchar(255) | Defender ID |
| `itID` | varchar(255) | Intune ID |
| **Metadata** | | |
| `userEmail` | varchar(255) | User email |
| `possibleFake` | tinyint | Possible fake system flag |
| `scriptResult` | varchar(255) | Script execution result |
| `createdAt` | timestamp | Record creation timestamp |

**Indexes:**
- Composite index on `(shortname, importDate)` for efficient queries
- Index on `importDate` for date-based filtering

## 📡 API Endpoints

### Health Check
- **`GET /health`** - Application health status

### Systems

#### List Systems
- **`GET /systems`** - List all systems with pagination and search
  - Query params: 
    - `search` (optional): Search term for shortname/fullname
    - `page` (optional): Page number (default: 1)
    - `limit` (optional): Items per page (default: 50)

#### System Statistics
- **`GET /systems/stats`** - Get overall system statistics

#### Environments
- **`GET /systems/environments`** - Get list of unique environments from database
  - Returns: `{ environments: ["dev", "prod", "stage", "test"] }`

#### New Systems
- **`GET /systems/new-today`** - Get systems discovered today

#### Inactive Systems
- **`GET /systems/missing`** - Get inactive systems (not seen in Intune for > 15 days)
  - Query params: `days` (optional): Days threshold (default: 15)

#### Health Trending
- **`GET /systems/health-trending`** - Get health trend data over time
  - Query params:
    - `days` (optional): Number of days (default: 30)
    - `env` (optional): Environment filter (dev, test, stage, prod)
  - Returns: Daily counts of fully healthy, partially healthy, unhealthy, and inactive systems

#### Health Category Drill-Down
- **`GET /systems/health-category`** - Get systems by health category
  - Query params:
    - `date` (required): Date in ISO format
    - `category` (required): Category type (`fully` | `partially` | `unhealthy` | `inactive` | `new`)
    - `env` (optional): Environment filter
  - Returns: List of systems matching the specified health category

#### System Details
- **`GET /systems/:shortname`** - Get specific system details

#### System History
- **`GET /systems/:shortname/history`** - Get historical data for a system
  - Query params:
    - `startDate` (optional): Start date
    - `endDate` (optional): End date

#### System Calendar
- **`GET /systems/:shortname/calendar`** - Get calendar heatmap data
  - Query params:
    - `year` (optional): Year
    - `month` (optional): Month

### Import

#### Upload CSV
- **`POST /import/csv`** - Upload and import CSV file
  - Content-Type: `multipart/form-data`
  - Body: `file` (CSV file)
  - Automatically extracts date from filename

#### Import from Path
- **`POST /import/csv-path`** - Import CSV from server file path
  - Content-Type: `application/json`
  - Body: `{ "filePath": "/path/to/file.csv" }`

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+** (for local development)
- **Docker & Docker Compose** (for containerized deployment)
- **K3s/Kubernetes cluster** (for production deployment)

### Local Development

#### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run start:dev
```

#### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your API URL
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

### Docker Compose Deployment

```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your database credentials (optional - defaults are provided)

# Start all services (database will be automatically initialized)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Note:** The database schema is automatically created when the container starts for the first time using the initialization script at [`docker/init-db.sql`](docker/init-db.sql).

The application will be available at:
- Frontend: http://localhost:8010
- Backend API: http://localhost:3002
- Database: localhost:3308

### Kubernetes/K3s Deployment

See [`K3S-DEPLOYMENT.md`](K3S-DEPLOYMENT.md) for detailed deployment instructions.

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/database-statefulset.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

# Check deployment status
kubectl get pods -n compliance-tracker
kubectl get services -n compliance-tracker
```

**Important:** Update secrets in [`k8s/configmap.yaml`](k8s/configmap.yaml) before deploying.

The application will be available at:
- Frontend: http://\<node-ip\>:8010 (NodePort 30010)
- Backend API: http://\<backend-service\>:3000 (ClusterIP - internal only)

## 🔧 Configuration

### Environment Variables

#### Docker Compose ([`.env`](.env.example))
For Docker Compose deployment, create a `.env` file in the project root:
```env
# Database Configuration
DB_USER=compliance
DB_PASSWORD=secure-password-change-me
DB_NAME=compliance_tracker

# Application Configuration
NODE_ENV=production
FRONTEND_URL=http://localhost:8010
```

#### Backend ([`backend/.env`](backend/.env.example))
For local development:
```env
# Application Configuration
NODE_ENV=development
PORT=3000

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=compliance_tracker
```

#### Frontend ([`frontend/.env`](frontend/.env.example))
For local development:
```env
# API Configuration
VITE_API_URL=http://localhost:3000
```

**Note:** For Docker Compose, you only need to configure the root `.env` file. The backend and frontend containers will use the appropriate settings automatically.

## 📝 CSV Import Process

### CSV Format

The daily CSV import should contain the following fields:

- **System Identification**: `shortname`, `fullname`, `env`
- **Operating System**: `serverOS`, `osName`, `osFamily`, `osBuildNumber`, `supportedOS`
- **Network**: `ip_priv`, `ip_pub`
- **Tool Status**: `r7Found`, `amFound`, `dfFound`, `itFound`, `vmFound`
- **Recency**: `seenRecently`, `recentR7Scan`, `recentAMScan`, `recentDFScan`, `recentITScan`
- **Lag Metrics**: `r7LagDays`, `amLagDays`, `itLagDays`, `dfLagDays`
- **Security**: `numCriticals`, `needsAMReboot`, `needsAMAttention`
- **Additional**: `userEmail`, `possibleFake`, `vmPowerState`, `dfID`, `itID`, `scriptResult`, `amLastUser`

### Import Methods

#### Via API (File Upload)
```bash
curl -X POST http://localhost:3000/import/csv \
  -F "file=@/path/to/compliance-data.csv"
```

#### Via API (File Path)
```bash
curl -X POST http://localhost:3000/import/csv-path \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/app/uploads/compliance-data.csv"}'
```

### Import Process

1. CSV file is uploaded or path is provided
2. Backend parses CSV and validates data
3. System records are upserted in `systems` table
4. Daily snapshot is created in `daily_snapshots` table
5. Import date is extracted from filename or current date is used
6. Data is immediately available for querying

## 🎨 Frontend Components

### Main Components

- **[`HealthDashboard`](frontend/src/components/HealthDashboard.tsx)** - Main dashboard with health metrics and trending
- **[`HealthDrillDownModal`](frontend/src/components/HealthDrillDownModal.tsx)** - Modal for detailed system lists by health category
- **[`SearchBar`](frontend/src/components/SearchBar.tsx)** - Real-time system search
- **[`HealthCalendar`](frontend/src/components/HealthCalendar.tsx)** - Calendar heatmap visualization
- **[`SystemDetails`](frontend/src/components/SystemDetails.tsx)** - Individual system detail view
- **[`CsvImport`](frontend/src/components/CsvImport.tsx)** - CSV file upload interface

### Styling

- Dark theme with modern UI
- Responsive design for mobile and desktop
- Custom scrollbar styling
- Smooth animations and transitions
- Accessible color contrast ratios

## 🔒 Security Considerations

1. **Change default passwords** in production environments
2. **Use secrets management** for Kubernetes deployments (AWS Secrets Manager, Vault)
3. **Enable HTTPS** with proper SSL/TLS certificates
4. **Implement authentication** for API access if needed
5. **Validate CSV data** before import to prevent injection attacks
6. **Regular database backups** with automated backup schedules
7. **Network policies** to restrict pod-to-pod communication in K8s
8. **Resource limits** on all containers to prevent resource exhaustion

## 📈 Performance Considerations

- **Database Indexes**: Optimized indexes on `shortname` and `importDate`
- **Pagination**: Large result sets are paginated
- **Connection Pooling**: Database connection pooling enabled
- **Debounced Search**: Search queries are debounced to reduce API calls
- **Stateless Design**: Application is stateless for horizontal scaling
- **Efficient Queries**: TypeORM query builder for optimized SQL
- **Caching**: Consider adding Redis for frequently accessed data

## 🐛 Troubleshooting

### Backend won't start
- Check database connection settings in `.env`
- Ensure MariaDB is running and accessible
- Verify environment variables are set correctly
- Check logs: `docker-compose logs backend` or `kubectl logs -f deployment/backend -n compliance-tracker`

### Frontend can't connect to backend
- Check CORS settings in backend ([`main.ts`](backend/src/main.ts))
- Verify API URL in frontend `.env`
- Check network connectivity between containers
- Verify backend is healthy: `curl http://localhost:3000/health`

### CSV import fails
- Verify CSV format matches expected schema
- Check file permissions on upload directory
- Review backend logs for specific errors
- Ensure CSV encoding is UTF-8

### Database connection issues in K8s
- Ensure StatefulSet is running: `kubectl get statefulset -n compliance-tracker`
- Check service DNS: `kubectl get svc -n compliance-tracker`
- Verify secrets are correctly configured
- Check database logs: `kubectl logs mariadb-0 -n compliance-tracker`

### Environment selector not showing environments
- Verify data exists in `daily_snapshots` table
- Check backend API: `curl http://localhost:3000/systems/environments`
- Ensure frontend can reach backend API

## 📚 Additional Documentation

- [Drill-Down Implementation](DRILL_DOWN_IMPLEMENTATION.md) - Details on health category drill-down feature
- [Environment Filtering](ENVIRONMENT_FILTERING_IMPLEMENTATION.md) - Environment filtering implementation
- [Environment Selector Fixes](ENVIRONMENT_SELECTOR_FIXES.md) - Dynamic environment loading
- [K3s Deployment Guide](K3S-DEPLOYMENT.md) - Comprehensive K3s deployment instructions
- [Health Refactoring Plan](HEALTH-REFACTORING-PLAN.md) - Complete refactoring plan from compliance to health
- [NestJS Documentation](https://docs.nestjs.com/)
- [React Documentation](https://react.dev/)
- [TypeORM Documentation](https://typeorm.io/)
- [K3s Documentation](https://docs.k3s.io/)

## 🤝 Contributing

1. Follow existing code structure and patterns
2. Write meaningful commit messages
3. Test changes locally before deploying
4. Update documentation as needed
5. Use TypeScript for type safety
6. Follow ESLint and Prettier configurations

## 📄 License

MIT

## 👥 Support

For issues or questions, please create an issue in the project repository or contact your system administrator.

---

**Built with:** NestJS • React • TypeScript • MariaDB • Docker • Kubernetes
