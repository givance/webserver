CREATE TABLE "donor_list_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"donor_id" integer NOT NULL,
	"added_by" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "donor_list_members_donor_list_unique" UNIQUE("list_id","donor_id")
);
--> statement-breakpoint
CREATE TABLE "donor_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "donor_lists_name_organization_unique" UNIQUE("name","organization_id")
);
--> statement-breakpoint
ALTER TABLE "donor_list_members" ADD CONSTRAINT "donor_list_members_list_id_donor_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."donor_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_list_members" ADD CONSTRAINT "donor_list_members_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_list_members" ADD CONSTRAINT "donor_list_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_lists" ADD CONSTRAINT "donor_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donor_lists" ADD CONSTRAINT "donor_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;