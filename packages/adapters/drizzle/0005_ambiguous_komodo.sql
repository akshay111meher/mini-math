ALTER TABLE "workflows" ADD COLUMN "in_progress" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "is_initiated" boolean DEFAULT false NOT NULL;