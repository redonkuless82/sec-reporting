-- Create tables for compliance tracker
USE compliance_tracker;

CREATE TABLE IF NOT EXISTS systems (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortname VARCHAR(255) UNIQUE NOT NULL,
    fullname VARCHAR(500),
    env VARCHAR(50),
    createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    INDEX idx_shortname (shortname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shortname VARCHAR(255) NOT NULL,
    importDate DATE NOT NULL,
    fullname VARCHAR(500),
    env VARCHAR(50),
    serverOS VARCHAR(255),
    osName VARCHAR(255),
    osFamily VARCHAR(255),
    osBuildNumber VARCHAR(100),
    supportedOS TINYINT(1) DEFAULT 0,
    ipPriv VARCHAR(45),
    ipPub VARCHAR(45),
    userEmail VARCHAR(255),
    possibleFake TINYINT(1) DEFAULT 0,
    r7Found TINYINT(1) DEFAULT 0,
    amFound TINYINT(1) DEFAULT 0,
    dfFound TINYINT(1) DEFAULT 0,
    itFound TINYINT(1) DEFAULT 0,
    vmFound TINYINT(1) DEFAULT 0,
    seenRecently TINYINT(1) DEFAULT 0,
    recentR7Scan TINYINT(1) DEFAULT 0,
    recentAMScan TINYINT(1) DEFAULT 0,
    recentDFScan TINYINT(1) DEFAULT 0,
    recentITScan TINYINT(1) DEFAULT 0,
    r7LagDays INT,
    amLagDays INT,
    itLagDays INT,
    dfLagDays INT,
    numCriticals INT DEFAULT 0,
    amLastUser VARCHAR(255),
    needsAMReboot TINYINT(1) DEFAULT 0,
    needsAMAttention TINYINT(1) DEFAULT 0,
    vmPowerState VARCHAR(50),
    dfID VARCHAR(255),
    itID VARCHAR(255),
    scriptResult VARCHAR(255),
    createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_shortname_importDate (shortname, importDate),
    INDEX idx_importDate (importDate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
