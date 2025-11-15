CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"version" varchar(2) NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"entry" jsonb NOT NULL,
	"global_state" jsonb DEFAULT null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
