-- Convert donor notes from text to jsonb array
-- First, create a temporary column
ALTER TABLE donors ADD COLUMN notes_new JSONB DEFAULT '[]'::jsonb;

-- Migrate existing notes to the new format
-- If notes exist, create a single entry with the current timestamp and system user
UPDATE donors 
SET notes_new = 
  CASE 
    WHEN notes IS NOT NULL AND notes != '' THEN 
      jsonb_build_array(
        jsonb_build_object(
          'createdAt', to_char(COALESCE(updated_at, created_at, NOW()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'createdBy', 'system_migration',
          'content', notes
        )
      )
    ELSE '[]'::jsonb
  END;

-- Drop the old column and rename the new one
ALTER TABLE donors DROP COLUMN notes;
ALTER TABLE donors RENAME COLUMN notes_new TO notes;