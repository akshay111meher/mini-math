CREATE TABLE "runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current" text,
	"finished" boolean DEFAULT false NOT NULL
);
