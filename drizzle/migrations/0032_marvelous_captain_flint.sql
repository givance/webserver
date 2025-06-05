ALTER TABLE "staff" ADD COLUMN "signature" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "linked_gmail_token_id" integer;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_linked_gmail_token_id_gmail_oauth_tokens_id_fk" FOREIGN KEY ("linked_gmail_token_id") REFERENCES "public"."gmail_oauth_tokens"("id") ON DELETE set null ON UPDATE no action;