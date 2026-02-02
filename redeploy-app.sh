#!/bin/bash

# Redeploy Frontend and Backend Only (Keep Database)
# This script stops, rebuilds, and restarts only the frontend and backend containers
# The database container and its data volume remain untouched

set -e

echo "🔄 Redeploying Frontend and Backend (Database will remain running)..."
echo ""

# Pull latest code (if needed)
echo "📥 Pulling latest code from git..."
git pull

# Stop only frontend and backend containers
echo "⏹️  Stopping frontend and backend containers..."
docker-compose stop frontend backend

# Remove only frontend and backend containers
echo "🗑️  Removing old frontend and backend containers..."
docker-compose rm -f frontend backend

# Rebuild frontend and backend images
echo "🔨 Rebuilding frontend and backend images..."
docker-compose build --no-cache frontend backend

# Start frontend and backend (database is already running)
echo "🚀 Starting frontend and backend containers..."
docker-compose up -d frontend backend

# Wait a moment for services to start
echo "⏳ Waiting for services to start..."
sleep 5

# Show status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Container Status:"
docker-compose ps

echo ""
echo "📋 Recent logs:"
docker-compose logs --tail=20 frontend backend

echo ""
echo "🔍 To view live logs, run:"
echo "   docker-compose logs -f frontend backend"
echo ""
echo "🌐 Application should be available at:"
echo "   Frontend: http://localhost:8010"
echo "   Backend:  http://localhost:3002"
