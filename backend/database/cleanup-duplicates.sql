-- Cleanup duplicate systems and enforce unique constraint
-- This script removes duplicate system entries, keeping only the oldest one

USE compliance_tracker;

-- First, let's see what we're dealing with
SELECT shortname, COUNT(*) as count, GROUP_CONCAT(id ORDER BY id) as ids
FROM systems
GROUP BY shortname
HAVING COUNT(*) > 1;

-- Delete duplicates, keeping the one with the lowest ID (oldest)
DELETE s1 FROM systems s1
INNER JOIN systems s2 
WHERE s1.id > s2.id 
AND s1.shortname = s2.shortname;

-- Verify the unique constraint exists
SHOW INDEX FROM systems WHERE Key_name = 'IDX_shortname' OR Column_name = 'shortname';

-- If needed, add unique constraint (this should already exist from the entity definition)
-- ALTER TABLE systems ADD UNIQUE INDEX `UQ_shortname` (`shortname`);

-- Verify cleanup
SELECT shortname, COUNT(*) as count
FROM systems
GROUP BY shortname
HAVING COUNT(*) > 1;

-- Show final count
SELECT COUNT(*) as total_systems FROM systems;
