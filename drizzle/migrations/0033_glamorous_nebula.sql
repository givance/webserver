CREATE TABLE "staff_gmail_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"token_type" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_gmail_tokens_staff_id_unique" UNIQUE("staff_id")
);
--> statement-breakpoint
ALTER TABLE "staff" DROP CONSTRAINT "staff_linked_gmail_token_id_gmail_oauth_tokens_id_fk";
--> statement-breakpoint
ALTER TABLE "staff_gmail_tokens" ADD CONSTRAINT "staff_gmail_tokens_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" DROP COLUMN "linked_gmail_token_id";