CREATE TABLE "email_generation_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"instruction" text NOT NULL,
	"refined_instruction" text,
	"chat_history" jsonb NOT NULL,
	"selected_donor_ids" jsonb NOT NULL,
	"preview_donor_ids" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"trigger_job_id" text,
	"total_donors" integer NOT NULL,
	"completed_donors" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "generated_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"donor_id" integer NOT NULL,
	"subject" text NOT NULL,
	"structured_content" jsonb NOT NULL,
	"reference_contexts" jsonb NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_generation_sessions" ADD CONSTRAINT "email_generation_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_generation_sessions" ADD CONSTRAINT "email_generation_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_session_id_email_generation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."email_generation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD CONSTRAINT "generated_emails_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;