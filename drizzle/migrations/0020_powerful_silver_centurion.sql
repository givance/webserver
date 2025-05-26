-- Add job_name column with default value first
ALTER TABLE "email_generation_sessions" ADD COLUMN "job_name" varchar(255) DEFAULT 'Untitled Communication Job';

-- Update existing records to have a meaningful job name
UPDATE "email_generation_sessions" 
SET "job_name" = 'Communication Job #' || id::text 
WHERE "job_name" IS NULL OR "job_name" = 'Untitled Communication Job';

-- Now make the column NOT NULL
ALTER TABLE "email_generation_sessions" ALTER COLUMN "job_name" SET NOT NULL;

-- Remove the default constraint since we want it to be required going forward
ALTER TABLE "email_generation_sessions" ALTER COLUMN "job_name" DROP DEFAULT;