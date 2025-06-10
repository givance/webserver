DROP TABLE "person_research_citations" CASCADE;--> statement-breakpoint
DROP TABLE "person_research_crawled_content" CASCADE;--> statement-breakpoint
DROP TABLE "person_research_search_results" CASCADE;--> statement-breakpoint
DROP TABLE "person_research_sources" CASCADE;--> statement-breakpoint
ALTER TABLE "person_research" ADD COLUMN "research_data" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "person_research" DROP COLUMN "answer";--> statement-breakpoint
ALTER TABLE "person_research" DROP COLUMN "total_loops";--> statement-breakpoint
ALTER TABLE "person_research" DROP COLUMN "total_sources";--> statement-breakpoint
ALTER TABLE "person_research" DROP COLUMN "research_timestamp";