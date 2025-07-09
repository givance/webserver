CREATE TYPE "public"."smart_email_session_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."smart_email_session_step" AS ENUM('analyzing', 'questioning', 'refining', 'complete');--> statement-breakpoint
CREATE TABLE "smart_email_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"message_index" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_email_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "smart_email_session_status" DEFAULT 'active' NOT NULL,
	"donor_ids" jsonb NOT NULL,
	"initial_instruction" text NOT NULL,
	"final_instruction" text,
	"current_step" "smart_email_session_step" DEFAULT 'analyzing' NOT NULL,
	"donor_analysis" jsonb,
	"org_analysis" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp DEFAULT now() + interval '24 hours' NOT NULL,
	CONSTRAINT "smart_email_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "smart_email_messages" ADD CONSTRAINT "smart_email_messages_session_id_smart_email_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."smart_email_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_email_sessions" ADD CONSTRAINT "smart_email_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_email_sessions" ADD CONSTRAINT "smart_email_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;