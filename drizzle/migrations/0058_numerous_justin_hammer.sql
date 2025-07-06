-- Drop the global unique constraint on staff email if it exists
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_email_unique";
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_email_key";  -- PostgreSQL default naming
--> statement-breakpoint
-- Drop existing constraint if it exists (in case of re-run)
ALTER TABLE "staff" DROP CONSTRAINT IF EXISTS "staff_email_organization_unique";
--> statement-breakpoint
-- Add compound unique constraint on email and organization_id
ALTER TABLE "staff" ADD CONSTRAINT "staff_email_organization_unique" UNIQUE("email","organization_id");