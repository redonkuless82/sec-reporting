#!/bin/bash

echo "Stopping all compliance-tracker containers..."
docker stop compliance-tracker-frontend compliance-tracker-backend compliance-tracker-db 2>/dev/null || true

echo "Removing all compliance-tracker containers..."
docker rm compliance-tracker-frontend compliance-tracker-backend compliance-tracker-db 2>/dev/null || true

echo "Removing old images..."
docker rmi sec-report_frontend sec-report_backend 2>/dev/null || true

echo "Rebuilding containers..."
docker-compose build --no-cache

echo "Starting containers..."
docker-compose up -d

echo "Done! Check status with: docker-compose ps"
