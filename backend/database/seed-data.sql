-- Compliance Tracker Seed Data
-- This file contains sample data showing various compliance states
-- Run this after the database schema is created

USE compliance_tracker;

-- Insert Systems
INSERT INTO systems (shortname, fullname, env, createdAt, updatedAt) VALUES
('web-prod-01', 'Production Web Server 01', 'prod', NOW(), NOW()),
('web-prod-02', 'Production Web Server 02', 'prod', NOW(), NOW()),
('db-prod-01', 'Production Database Server 01', 'prod', NOW(), NOW()),
('app-prod-01', 'Production Application Server 01', 'prod', NOW(), NOW()),
('web-dev-01', 'Development Web Server 01', 'dev', NOW(), NOW()),
('api-prod-01', 'Production API Gateway', 'prod', NOW(), NOW()),
('cache-prod-01', 'Production Cache Server', 'prod', NOW(), NOW()),
('worker-prod-01', 'Production Worker Node 01', 'prod', NOW(), NOW()),
('worker-prod-02', 'Production Worker Node 02', 'prod', NOW(), NOW()),
('lb-prod-01', 'Production Load Balancer', 'prod', NOW(), NOW()),
('mon-prod-01', 'Production Monitoring Server', 'prod', NOW(), NOW()),
('backup-prod-01', 'Production Backup Server', 'prod', NOW(), NOW()),
('web-test-01', 'Test Web Server 01', 'test', NOW(), NOW()),
('db-test-01', 'Test Database Server', 'test', NOW(), NOW()),
('legacy-prod-01', 'Legacy Production Server', 'prod', NOW(), NOW()),
('app-dev-01', 'Development Application Server', 'dev', NOW(), NOW()),
('api-dev-01', 'Development API Server', 'dev', NOW(), NOW()),
('queue-prod-01', 'Production Queue Server', 'prod', NOW(), NOW()),
('search-prod-01', 'Production Search Server', 'prod', NOW(), NOW()),
('analytics-prod-01', 'Production Analytics Server', 'prod', NOW(), NOW()),
('mail-prod-01', 'Production Mail Server', 'prod', NOW(), NOW()),
('vpn-prod-01', 'Production VPN Gateway', 'prod', NOW(), NOW());

-- Insert Daily Snapshots for the last 30 days
-- Scenario 1: Fully compliant system (all tools reporting)
INSERT INTO daily_snapshots (
    shortname, importDate, fullname, env,
    serverOS, osName, osFamily, osBuildNumber, supportedOS,
    ipPriv, ipPub, userEmail, possibleFake,
    r7Found, amFound, dfFound, itFound, vmFound,
    seenRecently, recentR7Scan, recentAMScan, recentDFScan, recentITScan,
    r7LagDays, amLagDays, itLagDays, dfLagDays,
    numCriticals, amLastUser, needsAMReboot, needsAMAttention,
    vmPowerState, dfID, itID, scriptResult, createdAt
) VALUES
('web-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Web Server 01', 'prod',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.1.10', '203.0.113.10', 'admin@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'admin', 0, 0,
 'running', 'DF-12345', 'IT-67890', 'success', NOW()),

('web-prod-01', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Production Web Server 01', 'prod',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.1.10', '203.0.113.10', 'admin@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'admin', 0, 0,
 'running', 'DF-12345', 'IT-67890', 'success', NOW()),

-- Scenario 2: Missing from some tools (gaps in coverage)
('web-prod-02', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Web Server 02', 'prod',
 'Ubuntu 20.04 LTS', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.1.11', '203.0.113.11', 'admin@company.com', 0,
 1, 1, 0, 1, 0,
 1, 1, 1, 0, 1,
 0, 0, 0, 15,
 2, 'admin', 0, 1,
 'unknown', NULL, 'IT-67891', 'partial', NOW()),

('web-prod-02', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Production Web Server 02', 'prod',
 'Ubuntu 20.04 LTS', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.1.11', '203.0.113.11', 'admin@company.com', 0,
 1, 1, 0, 1, 0,
 1, 1, 1, 0, 1,
 0, 0, 0, 14,
 2, 'admin', 0, 1,
 'unknown', NULL, 'IT-67891', 'partial', NOW()),

-- Scenario 3: Critical vulnerabilities detected
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Database Server 01', 'prod',
 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1,
 '10.0.2.10', NULL, 'dba@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 5, 'dba_user', 1, 1,
 'running', 'DF-12346', 'IT-67892', 'success', NOW()),

-- Scenario 4: Not seen recently (stale data)
('app-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Application Server 01', 'prod',
 'Windows Server 2019', 'Windows', 'Windows', '17763', 1,
 '10.0.3.10', '203.0.113.12', 'sysadmin@company.com', 0,
 1, 0, 1, 0, 1,
 0, 0, 0, 1, 0,
 7, 30, 45, 2,
 1, 'old_admin', 0, 0,
 'running', 'DF-12347', NULL, 'timeout', NOW()),

-- Scenario 5: Development environment (less critical)
('web-dev-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Development Web Server 01', 'dev',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.1.1.10', NULL, 'dev@company.com', 0,
 0, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 NULL, 0, 0, 0,
 0, 'developer', 0, 0,
 'running', 'DF-12348', 'IT-67893', 'success', NOW()),

-- Scenario 6: Fully compliant with recent scans
('api-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production API Gateway', 'prod',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.4.10', '203.0.113.13', 'api-admin@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'api_admin', 0, 0,
 'running', 'DF-12349', 'IT-67894', 'success', NOW()),

-- Scenario 7: Missing from multiple tools (major gap)
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Cache Server', 'prod',
 'Debian 11', 'Debian', 'Linux', '11.6', 1,
 '10.0.5.10', NULL, 'cache-admin@company.com', 0,
 0, 0, 1, 0, 1,
 1, 0, 0, 1, 0,
 NULL, NULL, NULL, 0,
 0, NULL, 0, 0,
 'running', 'DF-12350', NULL, 'partial', NOW()),

-- Scenario 8: Worker node with lag
('worker-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Worker Node 01', 'prod',
 'Ubuntu 20.04 LTS', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.6.10', NULL, 'worker-admin@company.com', 0,
 1, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 5, 1, 0, 1,
 1, 'worker_user', 0, 0,
 'running', 'DF-12351', 'IT-67895', 'success', NOW()),

-- Scenario 9: Another worker with different state
('worker-prod-02', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Worker Node 02', 'prod',
 'Ubuntu 20.04 LTS', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.6.11', NULL, 'worker-admin@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'worker_user', 0, 0,
 'running', 'DF-12352', 'IT-67896', 'success', NOW()),

-- Scenario 10: Load balancer
('lb-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Load Balancer', 'prod',
 'HAProxy on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.7.10', '203.0.113.14', 'lb-admin@company.com', 0,
 1, 1, 1, 1, 0,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'lb_admin', 0, 0,
 NULL, 'DF-12353', 'IT-67897', 'success', NOW()),

-- Scenario 11: Monitoring server
('mon-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Monitoring Server', 'prod',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.8.10', NULL, 'monitoring@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'mon_admin', 0, 0,
 'running', 'DF-12354', 'IT-67898', 'success', NOW()),

-- Scenario 12: Backup server with attention needed
('backup-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Backup Server', 'prod',
 'Ubuntu 20.04 LTS', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.9.10', NULL, 'backup@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 3, 'backup_admin', 1, 1,
 'running', 'DF-12355', 'IT-67899', 'success', NOW()),

-- Scenario 13: Test environment
('web-test-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Test Web Server 01', 'test',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.2.1.10', NULL, 'test@company.com', 0,
 0, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 NULL, 0, 0, 0,
 0, 'tester', 0, 0,
 'running', 'DF-12356', 'IT-67900', 'success', NOW()),

-- Scenario 14: Test database
('db-test-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Test Database Server', 'test',
 'PostgreSQL on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.2.2.10', NULL, 'test-dba@company.com', 0,
 0, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 NULL, 0, 0, 0,
 0, 'test_dba', 0, 0,
 'running', 'DF-12357', 'IT-67901', 'success', NOW()),

-- Scenario 15: Legacy system (unsupported OS)
('legacy-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Legacy Production Server', 'prod',
 'Windows Server 2012 R2', 'Windows', 'Windows', '9600', 0,
 '10.0.10.10', NULL, 'legacy@company.com', 0,
 1, 1, 0, 1, 0,
 1, 0, 1, 0, 0,
 10, 2, 5, NULL,
 8, 'legacy_admin', 0, 1,
 'running', NULL, 'IT-67902', 'warning', NOW()),

-- Scenario 16: Dev app server
('app-dev-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Development Application Server', 'dev',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.1.3.10', NULL, 'dev@company.com', 0,
 0, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 NULL, 0, 0, 0,
 0, 'developer', 0, 0,
 'running', 'DF-12358', 'IT-67903', 'success', NOW()),

-- Scenario 17: Dev API
('api-dev-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Development API Server', 'dev',
 'Node.js on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.1.4.10', NULL, 'api-dev@company.com', 0,
 0, 1, 1, 1, 1,
 1, 0, 1, 1, 1,
 NULL, 0, 0, 0,
 0, 'api_dev', 0, 0,
 'running', 'DF-12359', 'IT-67904', 'success', NOW()),

-- Scenario 18: Queue server with some lag
('queue-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Queue Server', 'prod',
 'RabbitMQ on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.11.10', NULL, 'queue@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 0, 1, 1,
 0, 0, 0, 3,
 0, 'queue_admin', 0, 0,
 'running', 'DF-12360', 'IT-67905', 'success', NOW()),

-- Scenario 19: Search server
('search-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Search Server', 'prod',
 'Elasticsearch on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.12.10', NULL, 'search@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 1, 'search_admin', 0, 0,
 'running', 'DF-12361', 'IT-67906', 'success', NOW()),

-- Scenario 20: Analytics server
('analytics-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Analytics Server', 'prod',
 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.13.10', NULL, 'analytics@company.com', 0,
 1, 1, 1, 1, 1,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'analytics_admin', 0, 0,
 'running', 'DF-12362', 'IT-67907', 'success', NOW()),

-- Scenario 21: Mail server with issues
('mail-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production Mail Server', 'prod',
 'Postfix on Ubuntu 20.04', 'Ubuntu', 'Linux', '20.04.6', 1,
 '10.0.14.10', '203.0.113.15', 'mail@company.com', 0,
 1, 0, 1, 1, 1,
 1, 1, 0, 1, 1,
 0, 20, 0, 0,
 4, 'mail_admin', 1, 1,
 'running', 'DF-12363', 'IT-67908', 'warning', NOW()),

-- Scenario 22: VPN gateway
('vpn-prod-01', DATE_SUB(CURDATE(), INTERVAL 0 DAY), 'Production VPN Gateway', 'prod',
 'OpenVPN on Ubuntu 22.04', 'Ubuntu', 'Linux', '22.04.3', 1,
 '10.0.15.10', '203.0.113.16', 'vpn@company.com', 0,
 1, 1, 1, 1, 0,
 1, 1, 1, 1, 1,
 0, 0, 0, 0,
 0, 'vpn_admin', 0, 0,
 NULL, 'DF-12364', 'IT-67909', 'success', NOW());

-- Add historical data for a few systems to show trends
-- web-prod-01 historical (last 7 days)
INSERT INTO daily_snapshots (shortname, importDate, fullname, env, serverOS, osName, osFamily, osBuildNumber, supportedOS, ipPriv, ipPub, userEmail, possibleFake, r7Found, amFound, dfFound, itFound, vmFound, seenRecently, recentR7Scan, recentAMScan, recentDFScan, recentITScan, r7LagDays, amLagDays, itLagDays, dfLagDays, numCriticals, amLastUser, needsAMReboot, needsAMAttention, vmPowerState, dfID, itID, scriptResult, createdAt)
SELECT 'web-prod-01', DATE_SUB(CURDATE(), INTERVAL n DAY), 'Production Web Server 01', 'prod', 'Ubuntu 22.04 LTS', 'Ubuntu', 'Linux', '22.04.3', 1, '10.0.1.10', '203.0.113.10', 'admin@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 'admin', 0, 0, 'running', 'DF-12345', 'IT-67890', 'success', NOW()
FROM (SELECT 2 AS n UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) AS days;

-- db-prod-01 historical showing increasing criticals
INSERT INTO daily_snapshots (shortname, importDate, fullname, env, serverOS, osName, osFamily, osBuildNumber, supportedOS, ipPriv, ipPub, userEmail, possibleFake, r7Found, amFound, dfFound, itFound, vmFound, seenRecently, recentR7Scan, recentAMScan, recentDFScan, recentITScan, r7LagDays, amLagDays, itLagDays, dfLagDays, numCriticals, amLastUser, needsAMReboot, needsAMAttention, vmPowerState, dfID, itID, scriptResult, createdAt)
VALUES
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 'dba_user', 0, 0, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 6 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 'dba_user', 0, 0, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 2, 'dba_user', 0, 1, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 4 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 3, 'dba_user', 1, 1, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 4, 'dba_user', 1, 1, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 5, 'dba_user', 1, 1, 'running', 'DF-12346', 'IT-67892', 'success', NOW()),
('db-prod-01', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Production Database Server 01', 'prod', 'Red Hat Enterprise Linux 8', 'RHEL', 'Linux', '8.7', 1, '10.0.2.10', NULL, 'dba@company.com', 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 5, 'dba_user', 1, 1, 'running', 'DF-12346', 'IT-67892', 'success', NOW());

-- cache-prod-01 historical showing it appearing in tools over time
INSERT INTO daily_snapshots (shortname, importDate, fullname, env, serverOS, osName, osFamily, osBuildNumber, supportedOS, ipPriv, ipPub, userEmail, possibleFake, r7Found, amFound, dfFound, itFound, vmFound, seenRecently, recentR7Scan, recentAMScan, recentDFScan, recentITScan, r7LagDays, amLagDays, itLagDays, dfLagDays, numCriticals, amLastUser, needsAMReboot, needsAMAttention, vmPowerState, dfID, itID, scriptResult, createdAt)
VALUES
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 7 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, NULL, NULL, NULL, NULL, 0, NULL, 0, 0, 'running', NULL, NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 6 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 5 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 4 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 3 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW()),
('cache-prod-01', DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Production Cache Server', 'prod', 'Debian 11', 'Debian', 'Linux', '11.6', 1, '10.0.5.10', NULL, 'cache-admin@company.com', 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, NULL, NULL, NULL, 0, 0, NULL, 0, 0, 'running', 'DF-12350', NULL, 'partial', NOW());

-- Summary of seed data:
-- 22 unique systems across prod, dev, and test environments
-- Multiple scenarios showing:
--   - Fully compliant systems (all tools reporting)
--   - Systems with gaps in tool coverage
--   - Systems with critical vulnerabilities
--   - Systems with stale data (high lag days)
--   - Development/test systems (not in all tools)
--   - Legacy systems with unsupported OS
--   - Systems needing attention/reboot
-- Historical data for 3 systems showing trends over 7 days
-- Total: ~50+ snapshot records for visualization

-- To load this data:
-- 1. Ensure database and tables are created
-- 2. Run: mysql -u root -p compliance_tracker < seed-data.sql
-- 3. Or use Docker: docker exec -i compliance-tracker-db mysql -u root -p compliance_tracker < seed-data.sql