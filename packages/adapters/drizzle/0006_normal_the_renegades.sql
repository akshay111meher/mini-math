ALTER TABLE "workflows" ADD COLUMN "expectingInputFor" jsonb DEFAULT null;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "externalInputStorage" jsonb DEFAULT null;