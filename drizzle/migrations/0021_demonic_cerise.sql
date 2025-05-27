ALTER TABLE "donors" DROP CONSTRAINT "donors_email_unique";--> statement-breakpoint
ALTER TABLE "donors" ADD CONSTRAINT "donors_email_organization_unique" UNIQUE("email","organization_id");