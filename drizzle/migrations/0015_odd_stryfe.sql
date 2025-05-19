ALTER TABLE "donors" ADD COLUMN "current_stage_id" text;--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "classification_reasoning" text;--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "predicted_actions" jsonb;