# SSL Certificate Setup Guide

This guide covers how to configure HTTPS for the Compliance Tracker application using your issued SSL certificate files.

## Overview

The setup script (`ssl/setup-certs.sh`) is an interactive tool that:

1. Prompts for your domain name
2. Converts the `.p7b` certificate bundle to PEM format
3. Extracts the server certificate and CA chain
4. Verifies the certificate matches the private key
5. Generates the Nginx SSL configuration with your domain
6. Updates the `.env` file with `SERVER_NAME` and `FRONTEND_URL`
7. Places all files where Docker/Nginx expects them

**No domain names are stored in version control.** The Nginx SSL config is generated at deploy time and is git-ignored.

---

## Prerequisites

You need three files from your certificate authority:

| File | Description | Required |
|------|-------------|----------|
| `server.key` | Private key | **Yes** |
| `server.p7b` | PKCS#7 certificate bundle | **Yes** |
| `server.csr` | Certificate signing request | No (reference only) |

You also need `openssl` installed on the host machine (standard on Linux).

---

## Step-by-Step Setup

### 1. Place Certificate Files

Copy your certificate files into the `ssl/` directory:

```bash
cp /path/to/your-domain.key  ssl/server.key
cp /path/to/your-domain.p7b  ssl/server.p7b
cp /path/to/your-domain.csr  ssl/server.csr   # optional
```

### 2. Run the Setup Script

```bash
chmod +x ssl/setup-certs.sh
./ssl/setup-certs.sh
```

The script will:
- Ask for your fully qualified domain name
- Convert and verify certificates
- Generate `frontend/nginx.ssl.conf` with your domain
- Generate `ssl/certs/fullchain.crt` and `ssl/certs/server.key`
- Update `.env` with `SERVER_NAME` and `FRONTEND_URL`

### 3. Review the Generated Configuration

Check the `.env` file to confirm the values:

```bash
cat .env
```

You should see:
```
SERVER_NAME=your-domain.example.com
FRONTEND_URL=https://your-domain.example.com
```

### 4. Build and Deploy

```bash
docker compose down
docker compose up -d --build
```

### 5. Verify HTTPS

```bash
curl -I https://your-domain.example.com
```

You should see a `200 OK` response with the `Strict-Transport-Security` header.

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Host                                     │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  frontend container (Nginx)              │   │
│  │                                          │   │
│  │  :80  → 301 redirect to HTTPS           │   │
│  │  :443 → serves SPA + proxies /api/      │   │
│  │                                          │   │
│  │  SSL certs mounted at /etc/nginx/ssl/   │   │
│  │  Config: /etc/nginx/conf.d/default.conf │   │
│  └──────────────────────────────────────────┘   │
│           │                                      │
│           │ proxy_pass /api/ →                   │
│           ▼                                      │
│  ┌──────────────────────────────────────────┐   │
│  │  backend container (NestJS)  :3000       │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### File Flow

```
ssl/server.key  ──┐
ssl/server.p7b  ──┤  setup-certs.sh
                  │       │
                  ▼       ▼
         ssl/certs/server.key        (mounted into container)
         ssl/certs/fullchain.crt     (mounted into container)
         frontend/nginx.ssl.conf     (copied into container at build)
         .env                        (SERVER_NAME, FRONTEND_URL)
```

### Docker Entrypoint Logic

The frontend container uses `docker-entrypoint.sh` which:

1. Checks if SSL certs exist at `/etc/nginx/ssl/`
2. Checks if `nginx.ssl.conf` was copied into the image
3. If both exist → uses the SSL config
4. Otherwise → falls back to HTTP-only config

This means the same Docker image works for both HTTP and HTTPS deployments.

---

## File Locations

| File | Purpose | Git-tracked |
|------|---------|-------------|
| `ssl/setup-certs.sh` | Interactive setup script | ✅ Yes |
| `ssl/.gitignore` | Prevents committing cert files | ✅ Yes |
| `ssl/certs/.gitkeep` | Keeps directory in git | ✅ Yes |
| `ssl/server.key` | Your private key | ❌ No |
| `ssl/server.p7b` | Your P7B bundle | ❌ No |
| `ssl/certs/fullchain.crt` | Generated fullchain cert | ❌ No |
| `ssl/certs/server.key` | Generated key copy | ❌ No |
| `frontend/nginx.conf` | HTTP-only Nginx config | ✅ Yes |
| `frontend/nginx.ssl.conf` | Generated SSL Nginx config | ❌ No |
| `frontend/docker-entrypoint.sh` | Container entrypoint | ✅ Yes |

---

## SSL Configuration Details

The generated Nginx SSL configuration includes:

- **TLS 1.2 and 1.3** only (no legacy protocols)
- **Modern cipher suite** (ECDHE + AES-GCM / ChaCha20)
- **HSTS** with 2-year max-age, includeSubDomains, and preload
- **OCSP stapling** for faster certificate validation
- **HTTP → HTTPS redirect** (301 permanent)
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy

---

## Troubleshooting

### Certificate and key don't match

```
[ERROR] Certificate and private key DO NOT MATCH!
```

This means the `.key` file wasn't generated from the same CSR used to obtain the `.p7b`. Verify you have the correct key file.

### No intermediate certs in P7B

If the script warns about no intermediate certs, your CA may have provided the chain separately. Place it manually:

```bash
cat intermediate.crt root.crt > ssl/certs/ca-bundle.crt
cat ssl/certs/server.crt ssl/certs/ca-bundle.crt > ssl/certs/fullchain.crt
```

### Container falls back to HTTP

Check the container logs:

```bash
docker logs compliance-tracker-frontend
```

If you see `No SSL setup found — using HTTP-only configuration`, verify:
1. `ssl/certs/fullchain.crt` and `ssl/certs/server.key` exist
2. `frontend/nginx.ssl.conf` exists
3. The container was rebuilt after running setup: `docker compose up -d --build`

### Testing locally

For local testing without a real domain, add to `/etc/hosts`:

```
127.0.0.1  your-domain.example.com
```

Then use `curl --resolve` or a browser to test.

---

## Re-running Setup

If you need to change the domain or replace certificates:

```bash
./ssl/setup-certs.sh
docker compose down
docker compose up -d --build
```

The script will overwrite all generated files.
