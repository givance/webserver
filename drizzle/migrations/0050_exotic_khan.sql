CREATE TYPE "public"."email_example_category" AS ENUM('donor_outreach', 'thank_you', 'follow_up', 'general', 'fundraising', 'event_invitation', 'update');--> statement-breakpoint
CREATE TABLE "staff_email_examples" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"category" "email_example_category" DEFAULT 'general',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_email_examples" ADD CONSTRAINT "staff_email_examples_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_email_examples" ADD CONSTRAINT "staff_email_examples_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;