ALTER TABLE "generated_emails" ADD COLUMN "is_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generated_emails" ADD COLUMN "sent_at" timestamp;