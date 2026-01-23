# Database Field Data Template

This template documents the expected data format and examples for each field in the database tables. Fill in the "Example Data" column with actual data from your imports to ensure proper data handling.

---

## Systems Table

The `systems` table stores unique system records.

| Field Name | Data Type | Constraints | Description | Example Data |
|------------|-----------|-------------|-------------|--------------|
| `id` | int | AUTO_INCREMENT, PRIMARY KEY | Auto-generated unique identifier | (auto-generated) |
| `shortname` | varchar(255) | NOT NULL, UNIQUE | Short system identifier/hostname | |
| `fullname` | varchar(500) | NULL | Full descriptive name of the system | |
| `env` | varchar(50) | NULL | Environment (e.g., prod, dev, staging) | |
| `createdAt` | datetime(6) | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp | (auto-generated) |
| `updatedAt` | datetime(6) | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE | Record update timestamp | (auto-generated) |

### Notes for Systems Table:
- `shortname` must be unique across all systems
- `shortname` is used as the primary identifier for linking to daily snapshots
- Fill in examples of actual shortnames, fullnames, and environment values you'll be importing

---

## Daily Snapshots Table

The `daily_snapshots` table stores daily compliance and security scan data for each system.

| Field Name | Data Type | Constraints | Description | Example Data |
|------------|-----------|-------------|-------------|--------------|
| `id` | int | AUTO_INCREMENT, PRIMARY KEY | Auto-generated unique identifier | (auto-generated) |
| `shortname` | varchar(255) | NOT NULL | System identifier (links to systems table) | |
| `importDate` | date | NOT NULL | Date of the snapshot/import | |
| `fullname` | varchar(500) | NULL | Full system name | |
| `env` | varchar(50) | NULL | Environment designation | |
| `serverOS` | varchar(255) | NULL | Full operating system string | |
| `osName` | varchar(255) | NULL | Operating system name | |
| `osFamily` | varchar(255) | NULL | OS family (e.g., Windows, Linux) | |
| `osBuildNumber` | varchar(100) | NULL | OS build/version number | |
| `supportedOS` | tinyint | NOT NULL, DEFAULT 0 | Is OS supported? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `ipPriv` | varchar(45) | NULL | Private IP address (IPv4 or IPv6) | |
| `ipPub` | varchar(45) | NULL | Public IP address (IPv4 or IPv6) | |
| `userEmail` | varchar(255) | NULL | Associated user email address | |
| `possibleFake` | tinyint | NOT NULL, DEFAULT 0 | Possible fake/test system? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `r7Found` | tinyint | NOT NULL, DEFAULT 0 | Found in Rapid7? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `amFound` | tinyint | NOT NULL, DEFAULT 0 | Found in Asset Management? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `dfFound` | tinyint | NOT NULL, DEFAULT 0 | Found in Data Feed? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `itFound` | tinyint | NOT NULL, DEFAULT 0 | Found in IT system? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `vmFound` | tinyint | NOT NULL, DEFAULT 0 | Found in VM system? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `seenRecently` | tinyint | NOT NULL, DEFAULT 0 | Seen recently? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `recentR7Scan` | tinyint | NOT NULL, DEFAULT 0 | Recent Rapid7 scan? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `recentAMScan` | tinyint | NOT NULL, DEFAULT 0 | Recent Asset Management scan? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `recentDFScan` | tinyint | NOT NULL, DEFAULT 0 | Recent Data Feed scan? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `recentITScan` | tinyint | NOT NULL, DEFAULT 0 | Recent IT scan? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `r7LagDays` | int | NULL | Days since last Rapid7 scan (integer) | |
| `amLagDays` | int | NULL | Days since last Asset Management scan (integer) | |
| `itLagDays` | int | NULL | Days since last IT scan (integer) | |
| `dfLagDays` | int | NULL | Days since last Data Feed scan (integer) | |
| `numCriticals` | int | NOT NULL, DEFAULT 0 | Number of critical vulnerabilities | |
| `amLastUser` | varchar(255) | NULL | Last user from Asset Management | |
| `needsAMReboot` | tinyint | NOT NULL, DEFAULT 0 | Needs reboot per Asset Management? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `needsAMAttention` | tinyint | NOT NULL, DEFAULT 0 | Needs attention per Asset Management? (DB: 0=no, 1=yes / CSV: "true"/"false") | |
| `vmPowerState` | varchar(50) | NULL | VM power state (e.g., running, stopped) | |
| `dfID` | varchar(255) | NULL | Data Feed system ID | |
| `itID` | varchar(255) | NULL | IT system ID | |
| `scriptResult` | varchar(255) | NULL | Result from automated script | |
| `createdAt` | datetime(6) | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record creation timestamp | (auto-generated) |

### Notes for Daily Snapshots Table:
- `shortname` + `importDate` combination should identify unique daily records
- **Boolean fields in CSV:** All "Found", "recent", "needs", and "supportedOS" fields appear as "true"/"false" in the CSV
- **Boolean fields in database:** These must be converted to tinyint (0 or 1) during import
- **Lag days fields:** Integer values representing days since last check-in for each service (can be NULL if not applicable)
- IP addresses support both IPv4 and IPv6 formats
- Fill in actual examples from your import data sources

---

## Data Validation Checklist

Before importing, verify:

- [ ] `shortname` values are consistent across all data sources
- [ ] Date formats for `importDate` are consistent (YYYY-MM-DD)
- [ ] Boolean fields (tinyint) only contain 0 or 1
- [ ] IP addresses are valid IPv4 or IPv6 format
- [ ] Email addresses are valid format
- [ ] Integer fields (lag days, numCriticals) contain only numeric values
- [ ] VARCHAR fields don't exceed their maximum length
- [ ] NULL values are handled appropriately for optional fields

---

## Import Data Sources

Document your data sources and their field mappings:

### Source 1: [Name of Source]
**File Format:** (CSV, JSON, Excel, etc.)

**Field Mappings:**
- Source Field → Database Field
- (Add your mappings here)

### Source 2: [Name of Source]
**File Format:** (CSV, JSON, Excel, etc.)

**Field Mappings:**
- Source Field → Database Field
- (Add your mappings here)

### Source 3: [Name of Source]
**File Format:** (CSV, JSON, Excel, etc.)

**Field Mappings:**
- Source Field → Database Field
- (Add your mappings here)

---

## Common Data Issues to Watch For

1. **Shortname Inconsistencies:**
   - Different capitalization across sources
   - Extra whitespace or special characters
   - Different naming conventions (hostname vs FQDN)

2. **Date Format Variations:**
   - MM/DD/YYYY vs YYYY-MM-DD
   - Timestamps vs dates only
   - Different timezone representations

3. **Boolean Value Variations:**
   - "Yes/No" vs "True/False" vs "1/0"
   - Case sensitivity
   - Empty strings vs NULL

4. **IP Address Formats:**
   - Leading zeros in octets
   - IPv4 vs IPv6
   - CIDR notation included

5. **String Length Overflows:**
   - OS strings exceeding 255 characters
   - Full names exceeding 500 characters
   - Email addresses exceeding 255 characters

---

## Example Import Record

Fill this out with a complete example from your actual data:

```
Systems Table Entry:
- shortname: 
- fullname: 
- env: 

Daily Snapshots Entry:
- shortname: 
- importDate: 
- fullname: 
- env: 
- serverOS: 
- osName: 
- osFamily: 
- osBuildNumber: 
- supportedOS: 
- ipPriv: 
- ipPub: 
- userEmail: 
- possibleFake: 
- r7Found: 
- amFound: 
- dfFound: 
- itFound: 
- vmFound: 
- seenRecently: 
- recentR7Scan: 
- recentAMScan: 
- recentDFScan: 
- recentITScan: 
- r7LagDays: 
- amLagDays: 
- itLagDays: 
- dfLagDays: 
- numCriticals: 
- amLastUser: 
- needsAMReboot: 
- needsAMAttention: 
- vmPowerState: 
- dfID: 
- itID: 
- scriptResult: 
```

---

## Instructions for Use

1. **Fill in Example Data:** Add real examples from your import sources in the "Example Data" column of each table
2. **Document Data Sources:** List all your import data sources and how their fields map to database fields
3. **Complete Example Record:** Fill out the complete example at the bottom with actual data
4. **Identify Issues:** Note any data quality issues or transformations needed
5. **Share with Development:** Provide this completed template to ensure import logic handles all data correctly

This will help identify:
- Data type mismatches
- String length issues
- Format inconsistencies
- Missing required fields
- Boolean value variations
