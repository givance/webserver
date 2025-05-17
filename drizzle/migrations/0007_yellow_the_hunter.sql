UPDATE "organizations" SET "memory" = '{}'::text[] WHERE "memory" IS NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "memory" SET DEFAULT '{}'::text[];
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "memory" SET NOT NULL;