CREATE TABLE "email_schedule_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"daily_limit" integer DEFAULT 150 NOT NULL,
	"max_daily_limit" integer DEFAULT 500 NOT NULL,
	"min_gap_minutes" integer DEFAULT 1 NOT NULL,
	"max_gap_minutes" integer DEFAULT 3 NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_schedule_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "email_send_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"trigger_job_id" text,
	"scheduled_time" timestamp NOT NULL,
	"actual_send_time" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_emails" ADD COLUMN "send_job_id" integer;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD COLUMN "scheduled_send_time" timestamp;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD COLUMN "send_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "email_schedule_config" ADD CONSTRAINT "email_schedule_config_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_jobs" ADD CONSTRAINT "email_send_jobs_email_id_generated_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."generated_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_jobs" ADD CONSTRAINT "email_send_jobs_session_id_email_generation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."email_generation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_jobs" ADD CONSTRAINT "email_send_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;