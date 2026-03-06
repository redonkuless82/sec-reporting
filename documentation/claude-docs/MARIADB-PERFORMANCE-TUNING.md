# MariaDB Performance Tuning

## Overview

This document describes the MariaDB performance optimizations applied to the compliance tracker database. The configuration targets a **32GB RAM, 8-core Intel Xeon** production server handling **20,000+ row inserts per day** into the `daily_snapshots` table.

## Files Changed

| File | Purpose |
|------|---------|
| `docker/mariadb/custom.cnf` | Custom MariaDB server configuration |
| `docker-compose.yml` | Updated to mount config, add resource limits |

## What Was the Problem

The MariaDB 11 Docker container was running with **100% default settings**. MariaDB defaults are designed for minimal resource environments (~128MB buffer pool), which means:

- The InnoDB buffer pool was only **128MB** (default) — far too small for a database growing by 20k+ rows/day
- No I/O optimization for SSD storage
- No thread pool for concurrent connections
- No slow query logging for performance monitoring
- Default per-session buffers too small for wide table scans

## Configuration Breakdown

### Memory Allocation Summary (32GB Server)

| Component | Allocation | Notes |
|-----------|-----------|-------|
| InnoDB Buffer Pool | 12 GB | Primary data/index cache |
| InnoDB Log Buffer | 64 MB | Write-ahead log buffer |
| Per-session buffers (worst case) | ~2.4 GB | 200 connections × 12MB each |
| Temp tables | 128 MB | In-memory temp table limit |
| Performance Schema | ~400 MB | Runtime diagnostics |
| OS + other containers | ~17 GB | Backend, frontend, OS cache |
| **Total MariaDB max** | **~15 GB** | Within 16GB container limit |

### Key Settings Explained

#### InnoDB Buffer Pool (`innodb_buffer_pool_size = 12G`)
The single most impactful setting. Caches table data and indexes in memory, avoiding disk reads. Set to 12GB (~40% of total RAM) to leave room for the OS, backend, and frontend containers. If MariaDB is the dominant workload, this can be raised to 16-20GB.

Split into **8 instances** (`innodb_buffer_pool_instances = 8`) to reduce mutex contention on multi-core systems.

Buffer pool state is **dumped on shutdown and loaded on startup** for faster warm-up after restarts.

#### InnoDB Redo Log (`innodb_log_file_size = 2G`)
Controls the write-ahead log size. Larger logs reduce checkpoint frequency, which improves write throughput. At 20k rows/day with ~1-2KB per row, 2GB provides ample headroom for burst writes during imports.

#### I/O Settings
- `innodb_flush_method = O_DIRECT` — Bypasses OS file cache to prevent double-buffering (InnoDB has its own buffer pool)
- `innodb_io_capacity = 2000` / `innodb_io_capacity_max = 4000` — Tuned for SSD storage
- `innodb_read_io_threads = 8` / `innodb_write_io_threads = 8` — Parallel I/O threads matching core count

#### Thread Pool
- `thread_handling = pool-of-threads` — MariaDB's thread pool (superior to MySQL's one-thread-per-connection model)
- `thread_pool_size = 8` — Matches CPU core count

#### Slow Query Log
Enabled with a 1-second threshold and logging of queries not using indexes. Essential for ongoing performance monitoring.

```
slow_query_log = ON
long_query_time = 1
log_queries_not_using_indexes = ON
min_examined_row_limit = 1000
```

### Docker Resource Limits

The `db` service now has:
- **Memory limit**: 16GB (hard cap prevents OOM on the host)
- **Memory reservation**: 12GB (guaranteed minimum for the buffer pool)

## Deployment Instructions

### First-Time Deployment

```bash
# Stop the current stack
docker compose down

# Start with new configuration
docker compose up -d

# Verify the settings are applied
docker exec compliance-tracker-db mysqladmin -u root -p variables | grep -E "innodb_buffer_pool_size|innodb_log_file_size|thread_handling"
```

### Verifying Configuration

After startup, connect to MariaDB and verify key settings:

```sql
-- Check buffer pool size (should show ~12884901888 bytes = 12GB)
SHOW VARIABLES LIKE 'innodb_buffer_pool_size';

-- Check log file size (should show ~2147483648 bytes = 2GB)
SHOW VARIABLES LIKE 'innodb_log_file_size';

-- Check thread handling (should show 'pool-of-threads')
SHOW VARIABLES LIKE 'thread_handling';

-- Check all InnoDB settings
SHOW VARIABLES LIKE 'innodb%';

-- Check buffer pool utilization
SHOW STATUS LIKE 'Innodb_buffer_pool%';
```

### Monitoring Slow Queries

```bash
# View slow query log from the container
docker exec compliance-tracker-db tail -f /var/log/mysql/slow-query.log

# Or from the host via the named volume
docker volume inspect sec-report_mariadb_logs
```

## Tuning Adjustments

### If MariaDB is the Primary Workload (Other Containers Are Light)

Increase buffer pool to 16-20GB:
```
innodb_buffer_pool_size = 16G
innodb_buffer_pool_instances = 8
```
Update the Docker memory limit to 22G accordingly.

### If Using Spinning Disks Instead of SSD

Reduce I/O capacity:
```
innodb_io_capacity = 200
innodb_io_capacity_max = 800
```

### If You Can Tolerate 1 Second of Data Loss on Crash

For significantly better write performance during bulk imports:
```
innodb_flush_log_at_trx_commit = 2
```
This flushes the log to the OS buffer every commit but only syncs to disk once per second.

### If You Need Point-in-Time Recovery or Replication

Uncomment the binary logging section in `custom.cnf`:
```
log_bin = mysql-bin
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 256M
sync_binlog = 1
```

### If Memory Is Tight

Disable performance schema to reclaim ~400MB:
```
performance_schema = OFF
```

## Key Metrics to Monitor

After deployment, monitor these metrics to validate the tuning:

| Metric | Command | Target |
|--------|---------|--------|
| Buffer pool hit rate | `SHOW STATUS LIKE 'Innodb_buffer_pool_read_requests';` vs `'Innodb_buffer_pool_reads';` | >99% hit rate |
| Buffer pool usage | `SHOW STATUS LIKE 'Innodb_buffer_pool_pages_free';` | Should decrease over time as data grows |
| Slow queries | `SHOW STATUS LIKE 'Slow_queries';` | Should be minimal |
| Threads connected | `SHOW STATUS LIKE 'Threads_connected';` | Should stay well under 200 |
| Temp tables to disk | `SHOW STATUS LIKE 'Created_tmp_disk_tables';` | Should be low relative to `Created_tmp_tables` |

### Buffer Pool Hit Rate Calculation

```sql
SELECT
  (1 - (
    (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Innodb_buffer_pool_reads') /
    (SELECT VARIABLE_VALUE FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests')
  )) * 100 AS buffer_pool_hit_rate_pct;
```

A hit rate above 99% means the buffer pool is sized correctly. Below 95% suggests it needs to be larger.
