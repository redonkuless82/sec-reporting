# Compliance Tracking Dashboard

A full-stack application for monitoring ~23,000 systems across your network for compliance purposes. Track which systems are reporting to various security and monitoring tools, identify gaps in tooling coverage, and visualize historical compliance data.

## 📋 Overview

This dashboard helps identify gaps in tooling coverage for compliance requirements by:
- Importing daily CSV snapshots of system reporting status
- Tracking which systems report to which tools (Rapid7, Asset Management, Data Feed, IT tools, VM inventory)
- Visualizing historical data with calendar heatmaps
- Providing search and filtering capabilities

## 🏗️ Architecture

### Technology Stack

**Backend:**
- NestJS (Node.js framework)
- TypeORM for database management
- MariaDB for data storage
- CSV parsing for data ingestion

**Frontend:**
- React with TypeScript
- Vite for build tooling
- React Router for navigation
- React Calendar Heatmap for visualization
- Axios for API communication

**Deployment:**
- Docker & Docker Compose for containerization
- Kubernetes/K3s manifests for production deployment
- Nginx for frontend serving

## 📊 Data Schema

The daily CSV import contains the following fields for each system:

### System Identification
- `shortname` - Primary identifier
- `fullname` - Full system name
- `env` - Environment (prod, dev, test, etc.)

### Operating System Details
- `serverOS`, `osName`, `osFamily`, `osBuildNumber`
- `supportedOS` - Whether OS is supported

### Network Information
- `ip_priv` - Private IP address
- `ip_pub` - Public IP address

### Tool Reporting Status
- `r7Found`, `amFound`, `dfFound`, `itFound`, `vmFound` - Found in each tool
- `recentR7Scan`, `recentAMScan`, `recentDFScan`, `recentITScan` - Recent scans

### Lag Metrics
- `r7LagDays`, `amLagDays`, `itLagDays`, `dfLagDays` - Days since last report

### Security & Maintenance
- `numCriticals` - Number of critical vulnerabilities
- `needsAMReboot`, `needsAMAttention` - Maintenance flags

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- K3s/Kubernetes cluster (for production deployment)

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

### Docker Compose Deployment

```bash
# Copy and configure environment variables
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

The application will be available at:
- Frontend: http://localhost
- Backend API: http://localhost:3000
- Database: localhost:3306

### Kubernetes/K3s Deployment

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

# View logs
kubectl logs -f deployment/backend -n compliance-tracker
kubectl logs -f deployment/frontend -n compliance-tracker
```

**Important:** Before deploying, update the secrets in `k8s/configmap.yaml`:
```bash
# Edit the secret with your passwords
kubectl edit secret compliance-tracker-secret -n compliance-tracker
```

The application will be available at:
- Frontend: http://<node-ip>:8010 (NodePort 30010)
- Backend API: http://<backend-service>:3000 (ClusterIP)

## 📡 API Endpoints

### Health Check
- `GET /health` - Application health status

### Systems
- `GET /systems` - List all systems (with pagination and search)
  - Query params: `search`, `page`, `limit`
- `GET /systems/stats` - Get system statistics
- `GET /systems/:shortname` - Get specific system details
- `GET /systems/:shortname/history` - Get historical data for a system
- `GET /systems/:shortname/calendar` - Get calendar heatmap data
  - Query params: `year`, `month`

### Import
- `POST /import/csv` - Upload and import CSV file (multipart/form-data)
- `POST /import/csv-path` - Import CSV from file path
  - Body: `{ "filePath": "/path/to/file.csv" }`

## 🗄️ Database Schema

### Tables

**systems**
- Stores unique system records
- Indexed on `shortname`

**daily_snapshots**
- Stores daily CSV import data
- Indexed on `shortname` and `importDate`
- Contains all CSV fields for historical tracking

## 📝 CSV Import Process

1. Daily automated script generates CSV with ~23k system records
2. CSV is uploaded via API or placed in accessible location
3. Backend parses CSV and validates data
4. System records are upserted in `systems` table
5. Daily snapshot is created in `daily_snapshots` table
6. Data is available immediately for querying

### Manual CSV Import

```bash
# Via API (file upload)
curl -X POST http://localhost:3000/import/csv \
  -F "file=@/path/to/compliance-data.csv"

# Via API (file path)
curl -X POST http://localhost:3000/import/csv-path \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/app/uploads/compliance-data.csv"}'
```

## 🎨 Frontend Features

### Search
- Real-time search by system shortname or fullname
- Debounced API calls for performance
- Dropdown results with system details

### Calendar Heatmap
- Visual representation of daily reporting status
- Color-coded by number of tools reporting
- Filter by specific tool (R7, AM, DF, IT, VM)
- Month navigation
- Hover tooltips with detailed information

### Color Coding
- **Gray**: No data for that day
- **Red shades**: System not found in tools (darker = fewer tools)
- **Green**: System found in all selected tools

## 🔧 Configuration

### Environment Variables

**Backend (.env)**
```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=compliance
DB_PASSWORD=your-password
DB_NAME=compliance_tracker
FRONTEND_URL=http://localhost:5173
```

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:3000
```

### Docker Compose Environment
Create a `.env` file in the project root:
```env
DB_USER=compliance
DB_PASSWORD=secure-password
DB_NAME=compliance_tracker
NODE_ENV=production
FRONTEND_URL=http://localhost
```

## 🔒 Security Considerations

1. **Change default passwords** in production
2. **Use secrets management** for Kubernetes deployments
3. **Enable HTTPS** with proper certificates
4. **Restrict API access** with authentication if needed
5. **Validate CSV data** before import
6. **Regular database backups**

## 📈 Performance Considerations

- Database indexes on `shortname` and `importDate`
- Pagination for large result sets
- Connection pooling for database
- Debounced search queries
- Stateless application design for horizontal scaling

## 🐛 Troubleshooting

### Backend won't start
- Check database connection settings
- Ensure MariaDB is running and accessible
- Verify environment variables are set correctly

### Frontend can't connect to backend
- Check CORS settings in backend
- Verify API URL in frontend .env
- Check network connectivity between containers

### CSV import fails
- Verify CSV format matches expected schema
- Check file permissions
- Review backend logs for specific errors

### Database connection issues in K8s
- Ensure StatefulSet is running: `kubectl get statefulset -n compliance-tracker`
- Check service DNS: `kubectl get svc -n compliance-tracker`
- Verify secrets are correctly configured

## 📚 Additional Documentation

- [NestJS Documentation](https://docs.nestjs.com/)
- [React Documentation](https://react.dev/)
- [TypeORM Documentation](https://typeorm.io/)
- [K3s Documentation](https://docs.k3s.io/)

## 🤝 Contributing

1. Follow existing code structure and patterns
2. Write meaningful commit messages
3. Test changes locally before deploying
4. Update documentation as needed

## 📄 License

MIT

## 👥 Support

For issues or questions, please contact your system administrator or create an issue in the project repository.
