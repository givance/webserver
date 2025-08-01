CREATE TABLE "staff_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"scope" text,
	"token_type" varchar(50),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"last_sync_at" timestamp with time zone,
	"sync_status" varchar(20) DEFAULT 'idle',
	"sync_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_provider_unique" UNIQUE("staff_id","provider")
);
--> statement-breakpoint
ALTER TABLE "staff_integrations" ADD CONSTRAINT "staff_integrations_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;