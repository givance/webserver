CREATE TABLE "person_research" (
	"id" serial PRIMARY KEY NOT NULL,
	"donor_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"research_topic" text NOT NULL,
	"answer" text NOT NULL,
	"total_loops" integer NOT NULL,
	"total_sources" integer NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"research_timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_research_citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"research_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"snippet" text NOT NULL,
	"relevance" text NOT NULL,
	"word_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_research_crawled_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"word_count" integer NOT NULL,
	"crawl_success" boolean NOT NULL,
	"error_message" text,
	"timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_research_search_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"research_id" integer NOT NULL,
	"query" text NOT NULL,
	"summary" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_research_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_result_id" integer NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"snippet" text NOT NULL,
	"display_link" text NOT NULL,
	"formatted_url" text NOT NULL,
	"html_title" text,
	"html_snippet" text,
	"html_formatted_url" text,
	"pagemap" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_research" ADD CONSTRAINT "person_research_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research" ADD CONSTRAINT "person_research_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research" ADD CONSTRAINT "person_research_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research_citations" ADD CONSTRAINT "person_research_citations_research_id_person_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."person_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research_crawled_content" ADD CONSTRAINT "person_research_crawled_content_source_id_person_research_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."person_research_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research_search_results" ADD CONSTRAINT "person_research_search_results_research_id_person_research_id_fk" FOREIGN KEY ("research_id") REFERENCES "public"."person_research"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_research_sources" ADD CONSTRAINT "person_research_sources_search_result_id_person_research_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."person_research_search_results"("id") ON DELETE cascade ON UPDATE no action;