#!/bin/sh
# =============================================================================
# Docker entrypoint for the frontend container.
#
# Automatically selects the correct Nginx configuration:
#   - If SSL certs are mounted at /etc/nginx/ssl/ AND nginx.ssl.conf exists
#     -> Uses the SSL (HTTPS) configuration
#   - Otherwise
#     -> Uses the standard HTTP-only configuration
# =============================================================================

set -e

SSL_CERT="/etc/nginx/ssl/fullchain.crt"
SSL_KEY="/etc/nginx/ssl/server.key"
SSL_CONF="/etc/nginx/templates/nginx.ssl.conf"
HTTP_CONF="/etc/nginx/templates/nginx.conf"

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ] && [ -f "$SSL_CONF" ]; then
    echo "[entrypoint] SSL certificates and config detected — enabling HTTPS"
    cp "$SSL_CONF" /etc/nginx/conf.d/default.conf
else
    echo "[entrypoint] No SSL setup found — using HTTP-only configuration"
    cp "$HTTP_CONF" /etc/nginx/conf.d/default.conf
fi

echo "[entrypoint] Starting Nginx..."
exec nginx -g 'daemon off;'
