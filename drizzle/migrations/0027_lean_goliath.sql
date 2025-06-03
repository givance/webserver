ALTER TABLE "donors" ADD COLUMN "his_title" varchar(50);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "his_first_name" varchar(255);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "his_initial" varchar(10);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "her_title" varchar(50);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "her_first_name" varchar(255);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "her_initial" varchar(10);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "shared_last_name" varchar(255);--> statement-breakpoint
ALTER TABLE "donors" ADD COLUMN "is_couple" boolean DEFAULT false NOT NULL;