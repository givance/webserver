-- Convert donors notes column from text to jsonb
-- First, ensure any existing text data is valid JSON or convert to empty array
ALTER TABLE "donors" 
ALTER COLUMN "notes" 
TYPE jsonb 
USING COALESCE(
  CASE 
    WHEN notes IS NULL OR notes = '' THEN '[]'::jsonb
    WHEN notes::text LIKE '[%' OR notes::text LIKE '{%' THEN notes::jsonb
    ELSE json_build_array(json_build_object('createdAt', NOW()::text, 'createdBy', 'system', 'content', notes))::jsonb
  END,
  '[]'::jsonb
);