# Data Type Handling for CSV Import

## Overview

This document explains how data from CSV files is converted and stored in the MariaDB database for the compliance tracker application.

---

## Boolean Fields (CSV "true"/"false" → Database tinyint)

### CSV Format
All boolean fields in the CSV file are represented as text strings:
- `"true"` (case-insensitive)
- `"false"` (case-insensitive)

### Database Storage
MariaDB stores these as `tinyint` (1-byte integer):
- `1` = true
- `0` = false

### Conversion Logic
The [`parseBoolean()`](../src/modules/import/import.service.ts:133) method in the import service handles conversion:

```typescript
private parseBoolean(value: any): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value ? 1 : 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return (lower === 'true' || lower === '1' || lower === 'yes') ? 1 : 0;
  }
  return 0;
}
```

**Supported input values that convert to `1` (true):**
- `"true"` (any case)
- `"TRUE"`
- `"True"`
- `"1"`
- `"yes"` (any case)
- Boolean `true`
- Number `1`

**All other values convert to `0` (false):**
- `"false"` (any case)
- `"0"`
- `"no"`
- Empty string
- `null`
- `undefined`
- Boolean `false`
- Number `0`

### Boolean Fields List

The following fields use this conversion:

**Operating System:**
- `supportedOS` - Is the OS version supported?

**Validation:**
- `possibleFake` - Is this possibly a fake/test system?

**Tool Detection (Found):**
- `r7Found` - Found in Rapid7
- `amFound` - Found in Asset Management
- `dfFound` - Found in Data Feed
- `itFound` - Found in IT system
- `vmFound` - Found in VM system

**Recency Indicators:**
- `seenRecently` - System seen recently
- `recentR7Scan` - Recent Rapid7 scan
- `recentAMScan` - Recent Asset Management scan
- `recentDFScan` - Recent Data Feed scan
- `recentITScan` - Recent IT scan

**Maintenance Flags:**
- `needsAMReboot` - Needs reboot per Asset Management
- `needsAMAttention` - Needs attention per Asset Management

---

## Integer Fields

### CSV Format
Integer values appear as numeric strings in the CSV:
- `"30"`, `"5"`, `"120"`, etc.
- Empty string or missing values for NULL

### Database Storage
MariaDB stores these as `int` (4-byte signed integer)

### Conversion Logic
The [`parseNumber()`](../src/modules/import/import.service.ts:142) method handles conversion:

```typescript
private parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}
```

### Integer Fields List

**Lag Metrics (Days Since Last Check-in):**
- `r7LagDays` - Days since last Rapid7 scan (nullable)
- `amLagDays` - Days since last Asset Management scan (nullable)
- `itLagDays` - Days since last IT scan (nullable)
- `dfLagDays` - Days since last Data Feed scan (nullable)

**Security Metrics:**
- `numCriticals` - Number of critical vulnerabilities (default: 0, not nullable)

---

## Date Fields

### CSV Format
The import date is extracted from the filename pattern: `AllDevices-YYYYMMDD_*.csv`

Example: `AllDevices-20260122_export.csv` → `2026-01-22`

### Database Storage
MariaDB stores as `date` type (YYYY-MM-DD format)

### Conversion Logic
The [`extractDateFromFilename()`](../src/modules/import/import.service.ts:148) method extracts the date:

```typescript
private extractDateFromFilename(filePath: string): Date {
  const filename = filePath.split('/').pop() || filePath.split('\\').pop() || '';
  const dateMatch = filename.match(/AllDevices-(\d{8})/i);
  
  if (dateMatch && dateMatch[1]) {
    const dateStr = dateMatch[1]; // YYYYMMDD
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(6, 8), 10);
    
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  
  // Fallback to current date if pattern doesn't match
  const fallbackDate = new Date();
  fallbackDate.setHours(0, 0, 0, 0);
  return fallbackDate;
}
```

**Date Field:**
- `importDate` - Date of the snapshot/import

---

## String Fields

### CSV Format
Text values as-is from CSV

### Database Storage
MariaDB stores as `varchar` with specified length limits

### Conversion Logic
Direct assignment with NULL handling:
```typescript
fieldName: record.fieldName || null
```

### String Fields with Length Limits

| Field | Type | Max Length | Description |
|-------|------|------------|-------------|
| `shortname` | varchar | 255 | System identifier (required, unique) |
| `fullname` | varchar | 500 | Full system name |
| `env` | varchar | 50 | Environment (prod, dev, staging, etc.) |
| `serverOS` | varchar | 255 | Full operating system string |
| `osName` | varchar | 255 | Operating system name |
| `osFamily` | varchar | 255 | OS family (Windows, Linux, etc.) |
| `osBuildNumber` | varchar | 100 | OS build/version number |
| `ipPriv` | varchar | 45 | Private IP (supports IPv4 and IPv6) |
| `ipPub` | varchar | 45 | Public IP (supports IPv4 and IPv6) |
| `userEmail` | varchar | 255 | Associated user email |
| `amLastUser` | varchar | 255 | Last user from Asset Management |
| `vmPowerState` | varchar | 50 | VM power state (running, stopped, etc.) |
| `dfID` | varchar | 255 | Data Feed system ID |
| `itID` | varchar | 255 | IT system ID |
| `scriptResult` | varchar | 255 | Result from automated script |

---

## Entity Type Definitions

### TypeScript Entity Types

In [`daily-snapshot.entity.ts`](../src/database/entities/daily-snapshot.entity.ts):

**Boolean fields are defined as `number` type:**
```typescript
@Column({ type: 'tinyint', width: 1, default: 0 })
supportedOS: number;  // 0 or 1
```

**Integer fields:**
```typescript
@Column({ type: 'int', nullable: true })
r7LagDays: number;  // Can be null or positive integer
```

**String fields:**
```typescript
@Column({ type: 'varchar', length: 255, nullable: true })
shortname: string;
```

**Date fields:**
```typescript
@Column({ type: 'date' })
importDate: Date;
```

---

## MariaDB Specifics

### TINYINT vs BOOLEAN
- MariaDB/MySQL `BOOLEAN` is an alias for `TINYINT(1)`
- We explicitly use `TINYINT` for clarity and consistency
- Valid range: -128 to 127 (signed) or 0 to 255 (unsigned)
- For boolean flags, we use: 0 (false) or 1 (true)

### Character Set
- Database uses `utf8mb4` character set
- Collation: `utf8mb4_unicode_ci`
- Supports full Unicode including emojis and special characters

### NULL Handling
- Required fields (NOT NULL): `shortname`, `importDate`, all boolean fields, `numCriticals`
- Optional fields (NULL allowed): Most string fields, lag day metrics, IDs

---

## Import Process Flow

1. **File Upload** → CSV file uploaded to server
2. **Parse CSV** → CSV parsed with headers as column names
3. **Extract Date** → Import date extracted from filename
4. **Process Records** → Each row processed:
   - **System Upsert** → Create/update system record by shortname
   - **Data Conversion** → Apply type conversions:
     - Strings: `"true"/"false"` → Numbers: `1/0`
     - Strings: `"30"` → Numbers: `30`
     - Empty/null → `null` (for nullable fields)
   - **Snapshot Create** → Create daily snapshot record
5. **Save to Database** → Persist to MariaDB

---

## Validation & Error Handling

### Required Field Validation
- `shortname` must be present and non-empty
- Throws error if missing: `"Missing shortname in record"`

### Type Conversion Errors
- Invalid numbers → `null` (for nullable fields) or `0` (for non-nullable)
- Invalid booleans → `0` (false)
- No errors thrown for type conversion failures

### String Length Validation
- Database enforces maximum lengths
- Truncation may occur if values exceed limits
- Consider pre-validation in import service if needed

---

## Testing Recommendations

### Test Cases for Boolean Conversion
```
Input: "true" → Output: 1
Input: "TRUE" → Output: 1
Input: "True" → Output: 1
Input: "false" → Output: 0
Input: "FALSE" → Output: 0
Input: "" → Output: 0
Input: null → Output: 0
Input: "1" → Output: 1
Input: "0" → Output: 0
Input: "yes" → Output: 1
Input: "no" → Output: 0
```

### Test Cases for Integer Conversion
```
Input: "30" → Output: 30
Input: "0" → Output: 0
Input: "" → Output: null
Input: null → Output: null
Input: "abc" → Output: null
Input: "12.5" → Output: 12 (truncated)
```

### Test Cases for Date Extraction
```
Filename: "AllDevices-20260122_export.csv" → Date: 2026-01-22
Filename: "AllDevices-20251231_data.csv" → Date: 2025-12-31
Filename: "invalid.csv" → Date: Current date (fallback)
```

---

## Common Issues & Solutions

### Issue: Boolean values not converting correctly
**Symptom:** All boolean fields showing as 0 in database
**Solution:** Check CSV column names match exactly (case-sensitive)

### Issue: Lag days showing as 0 instead of NULL
**Symptom:** Missing lag data stored as 0
**Solution:** Ensure CSV has empty cells (not "0") for missing data

### Issue: String truncation
**Symptom:** Long values cut off
**Solution:** Check field length limits and adjust if needed

### Issue: Date extraction fails
**Symptom:** All records get current date
**Solution:** Verify filename matches pattern `AllDevices-YYYYMMDD_*.csv`

---

## Future Enhancements

1. **Pre-import Validation:**
   - Validate string lengths before insert
   - Validate email format
   - Validate IP address format

2. **Enhanced Error Reporting:**
   - Track which fields failed conversion
   - Report row numbers with errors
   - Generate import summary report

3. **Data Quality Checks:**
   - Flag suspicious boolean patterns
   - Detect outlier lag day values
   - Identify potential duplicate records

4. **Performance Optimization:**
   - Batch inserts for large files
   - Transaction management
   - Progress tracking for large imports
