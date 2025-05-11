CREATE TYPE "public"."communication_channel" AS ENUM('email', 'phone', 'text');--> statement-breakpoint
CREATE TABLE "communication_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"content" text NOT NULL,
	"datetime" timestamp DEFAULT now() NOT NULL,
	"from_staff_id" integer,
	"from_donor_id" integer,
	"to_staff_id" integer,
	"to_donor_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_thread_donors" (
	"thread_id" integer NOT NULL,
	"donor_id" integer NOT NULL,
	CONSTRAINT "communication_thread_donors_thread_id_donor_id_pk" PRIMARY KEY("thread_id","donor_id")
);
--> statement-breakpoint
CREATE TABLE "communication_thread_staff" (
	"thread_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	CONSTRAINT "communication_thread_staff_thread_id_staff_id_pk" PRIMARY KEY("thread_id","staff_id")
);
--> statement-breakpoint
CREATE TABLE "communication_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" serial PRIMARY KEY NOT NULL,
	"donor_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"address" text,
	"state" varchar(2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "donors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_real_person" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "communication_content" ADD CONSTRAINT "communication_content_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_content" ADD CONSTRAINT "communication_content_from_staff_id_staff_id_fk" FOREIGN KEY ("from_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_content" ADD CONSTRAINT "communication_content_from_donor_id_donors_id_fk" FOREIGN KEY ("from_donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_content" ADD CONSTRAINT "communication_content_to_staff_id_staff_id_fk" FOREIGN KEY ("to_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_content" ADD CONSTRAINT "communication_content_to_donor_id_donors_id_fk" FOREIGN KEY ("to_donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_thread_donors" ADD CONSTRAINT "communication_thread_donors_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_thread_donors" ADD CONSTRAINT "communication_thread_donors_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_thread_staff" ADD CONSTRAINT "communication_thread_staff_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_thread_staff" ADD CONSTRAINT "communication_thread_staff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;