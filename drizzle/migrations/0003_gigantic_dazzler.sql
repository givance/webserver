ALTER TABLE "donors" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "assigned_to_staff_id" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website_summary" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "writing_instructions" text;--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_assigned_to_staff_id_staff_id_fk" FOREIGN KEY ("assigned_to_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;