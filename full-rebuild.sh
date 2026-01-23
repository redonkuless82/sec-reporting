#!/bin/bash

echo "🧹 Starting complete rebuild with cache clearing..."

# Stop all containers
echo "⏹️  Stopping all containers..."
docker-compose down

# Remove all Docker images for this project
echo "🗑️  Removing Docker images..."
docker rmi compliance-tracker-backend compliance-tracker-frontend 2>/dev/null || true

# Clear Docker build cache
echo "🗑️  Clearing Docker build cache..."
docker builder prune -af

# Clear backend node_modules and build artifacts
echo "🗑️  Clearing backend caches..."
rm -rf backend/node_modules
rm -rf backend/dist
rm -rf backend/.npm
rm -rf backend/.cache

# Clear frontend node_modules and build artifacts
echo "🗑️  Clearing frontend caches..."
rm -rf frontend/node_modules
rm -rf frontend/dist
rm -rf frontend/.vite
rm -rf frontend/.npm
rm -rf frontend/.cache

# Clear npm cache globally
echo "🗑️  Clearing npm cache..."
npm cache clean --force 2>/dev/null || true

# Rebuild and start containers
echo "🔨 Rebuilding containers from scratch..."
docker-compose build --no-cache --pull

echo "🚀 Starting containers..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Show logs
echo "📋 Showing logs..."
docker-compose logs --tail=50

echo "✅ Complete rebuild finished!"
echo "🌐 Frontend: http://localhost:8010"
echo "🔧 Backend: http://localhost:3002"
echo ""
echo "If you still see caching issues, clear your browser cache:"
echo "  - Chrome/Edge: Ctrl+Shift+Delete"
echo "  - Firefox: Ctrl+Shift+Delete"
echo "  - Or use Incognito/Private mode"
