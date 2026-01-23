# K3s Deployment Guide for AWS Environment

This guide walks you through deploying the Compliance Tracking Dashboard to your K3s cluster in AWS.

## Prerequisites

✅ K3s cluster running
✅ `kubectl` configured to access your cluster
✅ Docker images built (or will build during deployment)
✅ Port 8010 forwarded for frontend access

## Architecture in K3s

```
Internet (Port 8010)
    ↓
Frontend Service (NodePort 30010 → 8010)
    ↓
Frontend Pods (Nginx)
    ↓ (Internal API calls to /api/*)
Backend Service (ClusterIP on port 3000)
    ↓
Backend Pods (NestJS)
    ↓
MariaDB Service (ClusterIP on port 3306)
    ↓
MariaDB StatefulSet (Persistent Storage)
```

**Key Points:**
- Frontend is exposed via NodePort on port 8010 (you've already port-forwarded this)
- Backend is **NOT** exposed externally - only accessible within the cluster
- Frontend nginx proxies `/api/*` requests to the backend service internally
- Database is only accessible within the cluster

## Step-by-Step Deployment

### Step 1: Build Docker Images

Since you're in AWS, you'll need to build and make images available to K3s:

```bash
# Build backend image
cd backend
docker build -t compliance-tracker-backend:latest .

# Build frontend image
cd ../frontend
docker build -t compliance-tracker-frontend:latest .

# If using K3s on the same machine, images are already available
# If using remote K3s, you need to either:
# 1. Push to a registry (Docker Hub, ECR, etc.)
# 2. Save/load images manually
# 3. Use K3s import feature
```

#### Option A: Import images to K3s (if K3s is on same machine)
```bash
# K3s uses containerd, images should be available automatically
# Verify with:
sudo k3s crictl images | grep compliance-tracker
```

#### Option B: Use a registry (recommended for AWS)
```bash
# Tag for your registry
docker tag compliance-tracker-backend:latest your-registry/compliance-tracker-backend:latest
docker tag compliance-tracker-frontend:latest your-registry/compliance-tracker-frontend:latest

# Push to registry
docker push your-registry/compliance-tracker-backend:latest
docker push your-registry/compliance-tracker-frontend:latest

# Update k8s/*.yaml files to use your registry images
```

### Step 2: Update Configuration

Edit [`k8s/configmap.yaml`](k8s/configmap.yaml:1) to set your passwords:

```bash
# Generate secure passwords
DB_PASSWORD=$(openssl rand -base64 32)
ROOT_PASSWORD=$(openssl rand -base64 32)

# Update the secret
kubectl create secret generic compliance-tracker-secret \
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \
  --from-literal=MYSQL_ROOT_PASSWORD="$ROOT_PASSWORD" \
  --namespace=compliance-tracker \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3: Deploy to K3s

```bash
# Apply manifests in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/database-statefulset.yaml

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=mariadb -n compliance-tracker --timeout=300s

# Deploy backend
kubectl apply -f k8s/backend-deployment.yaml

# Wait for backend to be ready
kubectl wait --for=condition=ready pod -l app=backend -n compliance-tracker --timeout=300s

# Deploy frontend
kubectl apply -f k8s/frontend-deployment.yaml
```

### Step 4: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n compliance-tracker

# Expected output:
# NAME                        READY   STATUS    RESTARTS   AGE
# mariadb-0                   1/1     Running   0          2m
# backend-xxxxxxxxxx-xxxxx    1/1     Running   0          1m
# backend-xxxxxxxxxx-xxxxx    1/1     Running   0          1m
# frontend-xxxxxxxxxx-xxxxx   1/1     Running   0          30s
# frontend-xxxxxxxxxx-xxxxx   1/1     Running   0          30s

# Check services
kubectl get svc -n compliance-tracker

# Expected output:
# NAME               TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
# mariadb-service    ClusterIP   None            <none>        3306/TCP         2m
# backend-service    ClusterIP   10.43.xxx.xxx   <none>        3000/TCP         1m
# frontend-service   NodePort    10.43.xxx.xxx   <none>        8010:30010/TCP   30s
```

### Step 5: Load Seed Data

```bash
# Copy seed data to MariaDB pod
kubectl cp backend/database/seed-data.sql compliance-tracker/mariadb-0:/tmp/seed-data.sql

# Get the database password
DB_PASSWORD=$(kubectl get secret compliance-tracker-secret -n compliance-tracker -o jsonpath='{.data.DB_PASSWORD}' | base64 -d)

# Load the seed data
kubectl exec -it mariadb-0 -n compliance-tracker -- mysql -u root -p${DB_PASSWORD} compliance_tracker < /tmp/seed-data.sql

# Or interactively:
kubectl exec -it mariadb-0 -n compliance-tracker -- bash
# Then inside the pod:
mysql -u root -p compliance_tracker < /tmp/seed-data.sql
```

### Step 6: Access the Application

Your frontend is now accessible at:
```
http://<your-aws-instance-ip>:8010
```

Since you've already port-forwarded 8010, you should be able to access it immediately!

## Verifying Everything Works

### 1. Check Frontend Access
```bash
curl http://localhost:8010
# Should return HTML
```

### 2. Check Backend Health (from within cluster)
```bash
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n compliance-tracker -- \
  curl http://backend-service:3000/health

# Expected: {"status":"ok","timestamp":"..."}
```

### 3. Check API from Frontend
```bash
# The frontend should be able to call the backend
# Open browser to http://<your-ip>:8010
# Open browser console (F12)
# Try searching for a system - you should see API calls to /api/systems
```

### 4. Verify Database Connection
```bash
kubectl exec -it mariadb-0 -n compliance-tracker -- mysql -u root -p -e "USE compliance_tracker; SELECT COUNT(*) FROM systems;"
# Should show 22 systems
```

## Troubleshooting

### Frontend can't reach backend

**Check nginx proxy configuration:**
```bash
kubectl exec -it <frontend-pod-name> -n compliance-tracker -- cat /etc/nginx/conf.d/default.conf
```

**Check backend service DNS:**
```bash
kubectl run -it --rm debug --image=busybox --restart=Never -n compliance-tracker -- \
  nslookup backend-service
```

### Backend can't connect to database

**Check backend logs:**
```bash
kubectl logs -f deployment/backend -n compliance-tracker
```

**Check database service:**
```bash
kubectl get svc mariadb-service -n compliance-tracker
```

### Pods not starting

**Check pod status:**
```bash
kubectl describe pod <pod-name> -n compliance-tracker
```

**Common issues:**
- Image pull errors: Images not available to K3s
- CrashLoopBackOff: Check logs with `kubectl logs`
- Pending: Check PVC status with `kubectl get pvc -n compliance-tracker`

### Port 8010 not accessible

**Verify NodePort service:**
```bash
kubectl get svc frontend-service -n compliance-tracker -o yaml
```

**Check if port is actually forwarded:**
```bash
# On your AWS instance
sudo netstat -tlnp | grep 8010
```

**Verify K3s is listening:**
```bash
sudo netstat -tlnp | grep 30010
```

## Updating the Application

### Update Backend
```bash
# Build new image
cd backend
docker build -t compliance-tracker-backend:latest .

# Restart deployment
kubectl rollout restart deployment/backend -n compliance-tracker
```

### Update Frontend
```bash
# Build new image
cd frontend
docker build -t compliance-tracker-frontend:latest .

# Restart deployment
kubectl rollout restart deployment/frontend -n compliance-tracker
```

### Update Configuration
```bash
# Edit configmap
kubectl edit configmap compliance-tracker-config -n compliance-tracker

# Restart pods to pick up changes
kubectl rollout restart deployment/backend -n compliance-tracker
kubectl rollout restart deployment/frontend -n compliance-tracker
```

## Scaling

### Scale Backend
```bash
kubectl scale deployment/backend --replicas=3 -n compliance-tracker
```

### Scale Frontend
```bash
kubectl scale deployment/frontend --replicas=3 -n compliance-tracker
```

## Cleanup

To remove everything:
```bash
kubectl delete namespace compliance-tracker
```

To keep data but remove pods:
```bash
kubectl delete deployment backend frontend -n compliance-tracker
kubectl delete statefulset mariadb -n compliance-tracker
# PVC will remain, data is preserved
```

## Next Steps

1. ✅ Access frontend at `http://<your-ip>:8010`
2. ✅ Search for systems (try "web-prod-01", "db-prod-01")
3. ✅ View calendar heatmaps
4. ✅ Filter by different tools
5. ✅ Import your own CSV data via the API

## Security Recommendations for Production

1. **Change default passwords** in configmap/secret
2. **Use TLS/HTTPS** with cert-manager
3. **Add authentication** to the API
4. **Use ingress** instead of NodePort
5. **Enable network policies** to restrict pod communication
6. **Regular backups** of the database PVC
7. **Resource limits** on all pods (already configured)
8. **Use secrets management** (AWS Secrets Manager, Vault)

Enjoy your Compliance Tracking Dashboard! 🎉
