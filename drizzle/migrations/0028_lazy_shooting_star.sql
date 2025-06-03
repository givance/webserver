ALTER TABLE "donors" ADD COLUMN "his_last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "her_last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "display_name" varchar(500);--> statement-breakpoint
ALTER TABLE "donors" DROP COLUMN "shared_last_name";