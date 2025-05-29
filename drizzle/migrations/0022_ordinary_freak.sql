CREATE TABLE "email_opens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_tracker_id" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"referer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" integer NOT NULL,
	"donor_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_tracker_id" text NOT NULL,
	"clicked_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"referer" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_trackers" (
	"id" text PRIMARY KEY NOT NULL,
	"email_tracker_id" text NOT NULL,
	"original_url" text NOT NULL,
	"link_text" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_opens" ADD CONSTRAINT "email_opens_email_tracker_id_email_trackers_id_fk" FOREIGN KEY ("email_tracker_id") REFERENCES "public"."email_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_trackers" ADD CONSTRAINT "email_trackers_email_id_generated_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."generated_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_trackers" ADD CONSTRAINT "email_trackers_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_trackers" ADD CONSTRAINT "email_trackers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_trackers" ADD CONSTRAINT "email_trackers_session_id_email_generation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."email_generation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_link_tracker_id_link_trackers_id_fk" FOREIGN KEY ("link_tracker_id") REFERENCES "public"."link_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_trackers" ADD CONSTRAINT "link_trackers_email_tracker_id_email_trackers_id_fk" FOREIGN KEY ("email_tracker_id") REFERENCES "public"."email_trackers"("id") ON DELETE cascade ON UPDATE no action;