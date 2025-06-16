CREATE TYPE "public"."staff_whatsapp_activity_type" AS ENUM('message_received', 'message_sent', 'permission_denied', 'db_query_executed', 'ai_response_generated', 'voice_transcribed', 'error_occurred');--> statement-breakpoint
CREATE TABLE "staff_whatsapp_activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"activity_type" "staff_whatsapp_activity_type" NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_whatsapp_phone_numbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_whatsapp_phone_numbers_phone_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_chat_history_new" ADD COLUMN "staff_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_whatsapp_activity_log" ADD CONSTRAINT "staff_whatsapp_activity_log_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_whatsapp_activity_log" ADD CONSTRAINT "staff_whatsapp_activity_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_whatsapp_phone_numbers" ADD CONSTRAINT "staff_whatsapp_phone_numbers_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_chat_history_new" ADD CONSTRAINT "whatsapp_chat_history_new_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;