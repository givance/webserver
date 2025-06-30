ALTER TABLE "email_generation_sessions" DROP CONSTRAINT "email_generation_sessions_selected_staff_id_staff_id_fk";
--> statement-breakpoint
ALTER TABLE "email_generation_sessions" DROP COLUMN "signature_type";--> statement-breakpoint
ALTER TABLE "email_generation_sessions" DROP COLUMN "custom_signature";--> statement-breakpoint
ALTER TABLE "email_generation_sessions" DROP COLUMN "selected_staff_id";