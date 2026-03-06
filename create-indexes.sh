#!/bin/bash
# create-indexes.sh - Create performance indexes for daily_snapshots table
# Uses database credentials from .env file
#
# Usage:
#   ./create-indexes.sh          # Connect via Docker exec (default)
#   ./create-indexes.sh --host   # Connect via host using exposed port 3308
#
# The script supports two connection modes:
#   1. Docker exec (default): runs mysql inside the compliance-tracker-db container
#   2. Host mode (--host): connects via localhost:3308 using the mysql CLI on the host

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables from .env if it exists
if [ -f "${SCRIPT_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -v '^\s*#' "${SCRIPT_DIR}/.env" | grep -v '^\s*$')
  set +a
  echo "📄 Loaded credentials from .env"
else
  echo "⚠️  No .env file found — using default credentials"
fi

DB_USER="${DB_USER:-compliance}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-compliance_tracker}"

# Docker settings (match docker-compose.yml)
CONTAINER_NAME="compliance-tracker-db"
HOST_PORT="3308"

# Parse arguments
USE_HOST=false
for arg in "$@"; do
  case "$arg" in
    --host) USE_HOST=true ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--host]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

# Execute a SQL statement and return the output.
# Suppresses the mysql password warning on stderr.
run_sql() {
  local sql="$1"

  if [ "$USE_HOST" = true ]; then
    mysql -h 127.0.0.1 -P "${HOST_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "${sql}" 2>/dev/null
  else
    docker exec "${CONTAINER_NAME}" \
      mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "${sql}" 2>/dev/null
  fi
}

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

echo ""
echo "============================================="
echo "  daily_snapshots — Performance Index Setup"
echo "============================================="
echo ""
echo "Database : ${DB_NAME}"
echo "User     : ${DB_USER}"

if [ "$USE_HOST" = true ]; then
  echo "Mode     : Host connection (127.0.0.1:${HOST_PORT})"
else
  echo "Mode     : Docker exec (${CONTAINER_NAME})"
fi

echo ""

# Verify connectivity
echo -n "🔌 Testing database connection... "
if run_sql "SELECT 1;" > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAILED"
  echo ""
  echo "Could not connect to the database."
  if [ "$USE_HOST" = true ]; then
    echo "  • Is MariaDB running and exposed on port ${HOST_PORT}?"
    echo "  • Try: docker-compose ps"
  else
    echo "  • Is the container '${CONTAINER_NAME}' running?"
    echo "  • Try: docker-compose up -d db"
  fi
  echo "  • Are the credentials in .env correct?"
  exit 1
fi

# Verify the table exists
echo -n "📋 Verifying daily_snapshots table exists... "
TABLE_CHECK=$(run_sql "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='daily_snapshots';" 2>/dev/null | tail -1 | tr -d '[:space:]')
if [ "$TABLE_CHECK" = "0" ] || [ -z "$TABLE_CHECK" ]; then
  echo "NOT FOUND"
  echo ""
  echo "The daily_snapshots table does not exist in ${DB_NAME}."
  echo "Please run the application first so the schema is created."
  exit 1
fi
echo "OK"
echo ""

# ---------------------------------------------------------------------------
# Index creation
# ---------------------------------------------------------------------------

# Check whether an index already exists on daily_snapshots.
# Returns 0 (true) if the index exists, 1 (false) otherwise.
index_exists() {
  local index_name="$1"
  local count
  count=$(run_sql "SELECT COUNT(1) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_snapshots' AND INDEX_NAME = '${index_name}';" 2>/dev/null | tail -1 | tr -d '[:space:]')
  [ "$count" != "0" ] && [ -n "$count" ]
}

# Create an index if it does not already exist.
create_index() {
  local index_name="$1"
  local index_sql="$2"

  echo -n "  ${index_name} ... "

  if index_exists "${index_name}"; then
    echo "⏭️  Already exists (skipped)"
    return 0
  fi

  if run_sql "${index_sql}" > /dev/null 2>&1; then
    echo "✅ Created"
  else
    echo "❌ Failed"
    return 1
  fi
}

echo "Creating performance indexes on daily_snapshots..."
echo ""

ERRORS=0

create_index "idx_ds_importDate_osFamily_serverOS" \
  "CREATE INDEX idx_ds_importDate_osFamily_serverOS ON daily_snapshots (importDate, osFamily, serverOS);" \
  || ((ERRORS++))

create_index "idx_ds_env_importDate" \
  "CREATE INDEX idx_ds_env_importDate ON daily_snapshots (env, importDate);" \
  || ((ERRORS++))

create_index "idx_ds_importDate_env_osFamily_serverOS_possibleFake" \
  "CREATE INDEX idx_ds_importDate_env_osFamily_serverOS_possibleFake ON daily_snapshots (importDate, env, osFamily, serverOS, possibleFake);" \
  || ((ERRORS++))

create_index "idx_ds_shortname_importDate_osFamily_serverOS" \
  "CREATE INDEX idx_ds_shortname_importDate_osFamily_serverOS ON daily_snapshots (shortname, importDate, osFamily, serverOS);" \
  || ((ERRORS++))

echo ""

# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

echo "📊 Current indexes on daily_snapshots:"
echo ""
run_sql "SHOW INDEX FROM daily_snapshots;" 2>/dev/null || echo "  (could not retrieve index list)"

echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ Index creation complete — all indexes are in place."
else
  echo "⚠️  Index creation finished with ${ERRORS} error(s). Review the output above."
  exit 1
fi
