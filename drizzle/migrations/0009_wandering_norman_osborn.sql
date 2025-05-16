ALTER TABLE "organizations" ALTER COLUMN "memory" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "memory" DROP NOT NULL;