ALTER TABLE "email_schedule_config" ADD COLUMN "allowed_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_schedule_config" ADD COLUMN "allowed_start_time" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_schedule_config" ADD COLUMN "allowed_end_time" text DEFAULT '17:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_schedule_config" ADD COLUMN "allowed_timezone" text DEFAULT 'America/New_York' NOT NULL;