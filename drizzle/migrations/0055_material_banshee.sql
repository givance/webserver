ALTER TABLE "email_generation_sessions" ADD COLUMN "signature_type" text;--> statement-breakpoint
ALTER TABLE "email_generation_sessions" ADD COLUMN "custom_signature" text;--> statement-breakpoint
ALTER TABLE "email_generation_sessions" ADD COLUMN "selected_staff_id" integer;--> statement-breakpoint
ALTER TABLE "email_generation_sessions" ADD CONSTRAINT "email_generation_sessions_selected_staff_id_staff_id_fk" FOREIGN KEY ("selected_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;