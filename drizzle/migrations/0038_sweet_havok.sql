DO $$ BEGIN
 CREATE TYPE "public"."whatsapp_message_role" AS ENUM('user', 'assistant');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "whatsapp_chat_history_new" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_phone_number" varchar(20) NOT NULL,
	"message_id" varchar(255),
	"role" "whatsapp_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tool_results" jsonb,
	"tokens_used" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "whatsapp_chat_history" CASCADE;--> statement-breakpoint
ALTER TABLE "whatsapp_chat_history_new" ADD CONSTRAINT "whatsapp_chat_history_new_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;