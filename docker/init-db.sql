-- Database initialization script for Docker
-- This script creates the database schema automatically when the container starts

-- Use the database created by MYSQL_DATABASE environment variable
USE compliance_tracker;

-- Create systems table
CREATE TABLE IF NOT EXISTS `systems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shortname` varchar(255) NOT NULL,
  `fullname` varchar(500) DEFAULT NULL,
  `env` varchar(50) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_shortname` (`shortname`),
  KEY `IDX_systems_shortname` (`shortname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create daily_snapshots table
CREATE TABLE IF NOT EXISTS `daily_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `shortname` varchar(255) NOT NULL,
  `importDate` date NOT NULL,
  `fullname` varchar(500) DEFAULT NULL,
  `env` varchar(50) DEFAULT NULL,
  `serverOS` varchar(255) DEFAULT NULL,
  `osName` varchar(255) DEFAULT NULL,
  `osFamily` varchar(255) DEFAULT NULL,
  `osBuildNumber` varchar(100) DEFAULT NULL,
  `supportedOS` tinyint NOT NULL DEFAULT '0',
  `ipPriv` varchar(45) DEFAULT NULL,
  `ipPub` varchar(45) DEFAULT NULL,
  `userEmail` varchar(255) DEFAULT NULL,
  `possibleFake` tinyint NOT NULL DEFAULT '0',
  `r7Found` tinyint NOT NULL DEFAULT '0',
  `amFound` tinyint NOT NULL DEFAULT '0',
  `dfFound` tinyint NOT NULL DEFAULT '0',
  `itFound` tinyint NOT NULL DEFAULT '0',
  `vmFound` tinyint NOT NULL DEFAULT '0',
  `seenRecently` tinyint NOT NULL DEFAULT '0',
  `recentR7Scan` tinyint NOT NULL DEFAULT '0',
  `recentAMScan` tinyint NOT NULL DEFAULT '0',
  `recentDFScan` tinyint NOT NULL DEFAULT '0',
  `recentITScan` tinyint NOT NULL DEFAULT '0',
  `r7LagDays` int DEFAULT NULL,
  `amLagDays` int DEFAULT NULL,
  `itLagDays` int DEFAULT NULL,
  `dfLagDays` int DEFAULT NULL,
  `numCriticals` int NOT NULL DEFAULT '0',
  `amLastUser` varchar(255) DEFAULT NULL,
  `needsAMReboot` tinyint NOT NULL DEFAULT '0',
  `needsAMAttention` tinyint NOT NULL DEFAULT '0',
  `vmPowerState` varchar(50) DEFAULT NULL,
  `dfID` varchar(255) DEFAULT NULL,
  `itID` varchar(255) DEFAULT NULL,
  `scriptResult` varchar(255) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_daily_snapshots_shortname_importDate` (`shortname`, `importDate`),
  KEY `IDX_daily_snapshots_importDate` (`importDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
