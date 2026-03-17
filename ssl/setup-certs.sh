#!/bin/bash
# =============================================================================
# SSL Certificate Setup Script
# =============================================================================
#
# Interactive script that:
#   1. Asks for your domain name
#   2. Converts your .p7b certificate bundle to PEM format
#   3. Verifies the certificate matches the private key
#   4. Places certificates where Nginx expects them
#   5. Generates the Nginx SSL configuration
#   6. Updates the .env file with SERVER_NAME
#
# PREREQUISITES:
#   Place these files in the ssl/ directory before running:
#     - server.key   (your private key)
#     - server.p7b   (the PKCS#7 certificate bundle from your CA)
#     - server.csr   (optional, kept for reference)
#
# USAGE:
#   chmod +x ssl/setup-certs.sh
#   ./ssl/setup-certs.sh
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$SCRIPT_DIR"
CERTS_DIR="$SSL_DIR/certs"
NGINX_SSL_DIR="$PROJECT_DIR/frontend"
ENV_FILE="$PROJECT_DIR/.env"
ENV_EXAMPLE="$PROJECT_DIR/.env.example"

KEY_FILE="$SSL_DIR/server.key"
P7B_FILE="$SSL_DIR/server.p7b"

# --- Colors for output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${CYAN}=============================================${NC}"
    echo -e "${CYAN} $1${NC}"
    echo -e "${CYAN}=============================================${NC}"
    echo ""
}

print_ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
print_err()   { echo -e "  ${RED}[ERROR]${NC} $1"; }
print_warn()  { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
print_info()  { echo -e "  ${CYAN}[INFO]${NC} $1"; }

# =============================================================================
print_header "SSL Certificate Setup"
# =============================================================================

# --- Step 1: Ask for domain name ---
echo -e "${CYAN}Enter the fully qualified domain name for this deployment:${NC}"
echo -e "${CYAN}(e.g., app.example.com)${NC}"
echo ""
read -rp "Domain name: " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    print_err "Domain name cannot be empty."
    exit 1
fi

# Basic domain validation
if ! echo "$DOMAIN_NAME" | grep -qP '^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$'; then
    print_warn "\"${DOMAIN_NAME}\" doesn't look like a standard domain. Continuing anyway..."
fi

echo ""
print_ok "Domain: ${DOMAIN_NAME}"

# --- Step 2: Validate required files ---
print_header "Checking Certificate Files"

MISSING=0

if [ -f "$KEY_FILE" ]; then
    print_ok "Private key found: ssl/server.key"
else
    print_err "Private key not found: ssl/server.key"
    MISSING=1
fi

if [ -f "$P7B_FILE" ]; then
    print_ok "P7B bundle found: ssl/server.p7b"
else
    print_err "P7B certificate bundle not found: ssl/server.p7b"
    MISSING=1
fi

if [ -f "$SSL_DIR/server.csr" ]; then
    print_ok "CSR found: ssl/server.csr (kept for reference)"
else
    print_info "CSR not found (optional, not required)"
fi

if [ $MISSING -eq 1 ]; then
    echo ""
    print_err "Missing required files. Please place them in: ${SSL_DIR}/"
    echo "    - server.key  (private key)"
    echo "    - server.p7b  (PKCS#7 certificate bundle)"
    exit 1
fi

# --- Step 3: Convert P7B to PEM ---
print_header "Converting Certificates"

mkdir -p "$CERTS_DIR"

echo "  [1/5] Converting P7B to PEM format..."

# Auto-detect P7B format: try PEM first, then DER (binary)
if openssl pkcs7 -print_certs -in "$P7B_FILE" -out "$CERTS_DIR/all-certs.pem" 2>/dev/null; then
    print_ok "Extracted certificates (PEM format P7B)"
elif openssl pkcs7 -print_certs -inform DER -in "$P7B_FILE" -out "$CERTS_DIR/all-certs.pem" 2>/dev/null; then
    print_ok "Extracted certificates (DER/binary format P7B)"
else
    print_err "Failed to parse P7B file. It may be corrupted or in an unsupported format."
    echo ""
    echo "  Try manually converting with:"
    echo "    openssl pkcs7 -print_certs -in ssl/server.p7b -out ssl/certs/all-certs.pem"
    echo "    openssl pkcs7 -print_certs -inform DER -in ssl/server.p7b -out ssl/certs/all-certs.pem"
    exit 1
fi

echo "  [2/5] Extracting server certificate..."
awk '/-----BEGIN CERTIFICATE-----/{found++} found==1{print} /-----END CERTIFICATE-----/&&found==1{exit}' \
    "$CERTS_DIR/all-certs.pem" > "$CERTS_DIR/server.crt"
print_ok "ssl/certs/server.crt"

echo "  [3/5] Extracting CA certificate chain..."
awk '/-----BEGIN CERTIFICATE-----/{found++} found>1{print}' \
    "$CERTS_DIR/all-certs.pem" > "$CERTS_DIR/ca-bundle.crt"

if [ -s "$CERTS_DIR/ca-bundle.crt" ]; then
    print_ok "ssl/certs/ca-bundle.crt"
else
    print_warn "No intermediate/root CA certs found in P7B (single cert bundle)"
    print_info "If your CA provided a separate chain file, place it as ssl/certs/ca-bundle.crt"
fi

echo "  [4/5] Creating fullchain certificate..."
cat "$CERTS_DIR/server.crt" "$CERTS_DIR/ca-bundle.crt" > "$CERTS_DIR/fullchain.crt"
print_ok "ssl/certs/fullchain.crt"

echo "  [5/5] Setting up private key..."
cp "$KEY_FILE" "$CERTS_DIR/server.key"
chmod 600 "$CERTS_DIR/server.key"

# Check if the key is passphrase-protected and decrypt it
# Nginx in Docker cannot prompt for a passphrase, so the key must be unencrypted
if grep -q "ENCRYPTED" "$CERTS_DIR/server.key"; then
    print_warn "Private key is passphrase-protected — Nginx cannot use encrypted keys in Docker"
    echo ""
    echo -e "  ${CYAN}Enter the passphrase to decrypt the private key:${NC}"
    if openssl rsa -in "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.key.decrypted" 2>/dev/null; then
        mv "$CERTS_DIR/server.key.decrypted" "$CERTS_DIR/server.key"
        chmod 600 "$CERTS_DIR/server.key"
        print_ok "Private key decrypted successfully"
    else
        rm -f "$CERTS_DIR/server.key.decrypted"
        print_err "Failed to decrypt private key. Wrong passphrase?"
        echo ""
        echo "  You can manually decrypt it with:"
        echo "    openssl rsa -in ssl/server.key -out ssl/certs/server.key"
        exit 1
    fi
else
    print_ok "Private key is not encrypted (good)"
fi

print_ok "ssl/certs/server.key (permissions: 600)"

# Cleanup
rm -f "$CERTS_DIR/all-certs.pem"

# --- Step 4: Verify cert matches key ---
print_header "Verifying Certificate"

CERT_MD5=$(openssl x509 -noout -modulus -in "$CERTS_DIR/server.crt" 2>/dev/null | openssl md5)
KEY_MD5=$(openssl rsa -noout -modulus -in "$CERTS_DIR/server.key" 2>/dev/null | openssl md5)

if [ "$CERT_MD5" = "$KEY_MD5" ]; then
    print_ok "Certificate and private key MATCH"
else
    print_err "Certificate and private key DO NOT MATCH!"
    echo "        Cert modulus MD5: ${CERT_MD5}"
    echo "        Key modulus MD5:  ${KEY_MD5}"
    echo ""
    echo "        The .key file was not generated from the same CSR used to issue the certificate."
    exit 1
fi

echo ""
echo "  Certificate details:"
openssl x509 -noout -subject -issuer -dates -in "$CERTS_DIR/server.crt" | sed 's/^/    /'

# --- Step 5: Generate Nginx SSL configuration ---
print_header "Generating Nginx Configuration"

cat > "$NGINX_SSL_DIR/nginx.ssl.conf" <<NGINX_EOF
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    # Redirect all HTTP traffic to HTTPS
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name ${DOMAIN_NAME};
    root /usr/share/nginx/html;
    index index.html;

    # --- SSL Configuration ---
    ssl_certificate     /etc/nginx/ssl/fullchain.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    # Modern TLS settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # SSL session settings
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Increase client body size for large CSV uploads (50MB)
    client_max_body_size 50M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Increase timeouts for large file uploads
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # SPA routing - serve index.html for all routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX_EOF

print_ok "Generated frontend/nginx.ssl.conf for ${DOMAIN_NAME}"

# --- Step 6: Update .env file ---
print_header "Updating Environment Configuration"

# Create .env from example if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ENV_EXAMPLE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        print_info "Created .env from .env.example"
    else
        touch "$ENV_FILE"
        print_info "Created empty .env file"
    fi
fi

# Update or add SERVER_NAME
if grep -q "^SERVER_NAME=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^SERVER_NAME=.*|SERVER_NAME=${DOMAIN_NAME}|" "$ENV_FILE"
    print_ok "Updated SERVER_NAME in .env"
else
    echo "" >> "$ENV_FILE"
    echo "# Domain name for SSL" >> "$ENV_FILE"
    echo "SERVER_NAME=${DOMAIN_NAME}" >> "$ENV_FILE"
    print_ok "Added SERVER_NAME to .env"
fi

# Update FRONTEND_URL to use HTTPS
if grep -q "^FRONTEND_URL=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://${DOMAIN_NAME}|" "$ENV_FILE"
    print_ok "Updated FRONTEND_URL to https://${DOMAIN_NAME}"
else
    echo "FRONTEND_URL=https://${DOMAIN_NAME}" >> "$ENV_FILE"
    print_ok "Added FRONTEND_URL to .env"
fi

# =============================================================================
print_header "Setup Complete!"
# =============================================================================

echo "  Generated files:"
echo "    - ssl/certs/fullchain.crt    (certificate + CA chain)"
echo "    - ssl/certs/server.key       (private key)"
echo "    - frontend/nginx.ssl.conf    (Nginx HTTPS config for ${DOMAIN_NAME})"
echo "    - .env                       (updated with SERVER_NAME and FRONTEND_URL)"
echo ""
echo "  Next steps:"
echo "    1. Review the generated .env file"
echo "    2. Rebuild and restart containers:"
echo ""
echo -e "       ${CYAN}docker compose down${NC}"
echo -e "       ${CYAN}docker compose up -d --build${NC}"
echo ""
echo "    3. Verify HTTPS is working:"
echo ""
echo -e "       ${CYAN}curl -I https://${DOMAIN_NAME}${NC}"
echo ""
