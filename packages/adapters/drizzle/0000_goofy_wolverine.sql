CREATE TYPE "public"."role" AS ENUM('PlatformOwner', 'Developer');--> statement-breakpoint
CREATE TABLE "users" (
	"userId" text NOT NULL,
	"evm_payment_address" text NOT NULL,
	"unifiedCredits" integer DEFAULT 0 NOT NULL,
	"cdpAccountCredits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_pk" PRIMARY KEY("userId","evm_payment_address")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"user_id" text NOT NULL,
	"secret_identifier" text NOT NULL,
	"secret_data" text NOT NULL,
	CONSTRAINT "secrets_user_id_secret_identifier_pk" PRIMARY KEY("user_id","secret_identifier")
);
--> statement-breakpoint
CREATE TABLE "runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current" text,
	"finished" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"version" varchar(2) NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"entry" jsonb NOT NULL,
	"global_state" jsonb DEFAULT null,
	"trace" jsonb DEFAULT null,
	"webhook_url" text,
	"lock" jsonb DEFAULT null,
	"in_progress" boolean DEFAULT false NOT NULL,
	"is_initiated" boolean DEFAULT false NOT NULL,
	"is_terminated" boolean DEFAULT false NOT NULL,
	"expectingInputFor" jsonb DEFAULT null,
	"externalInputStorage" jsonb DEFAULT null,
	"previous_linked_workflow" text,
	"next_linked_workflow" jsonb DEFAULT null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"owner" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_images" (
	"owner_id" text NOT NULL,
	"workflow_name" text NOT NULL,
	"image" jsonb NOT NULL,
	CONSTRAINT "workflow_images_pk" PRIMARY KEY("owner_id","workflow_name")
);
--> statement-breakpoint
CREATE TABLE "cdp_accounts" (
	"user_id" text NOT NULL,
	"account_name" text NOT NULL,
	CONSTRAINT "cdp_accounts_user_id_account_name_pk" PRIMARY KEY("user_id","account_name")
);
--> statement-breakpoint
CREATE TABLE "workflow_batch_workflows" (
	"owner" varchar(128) NOT NULL,
	"batch_id" varchar(128) NOT NULL,
	"workflow_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_batches" (
	"owner" varchar(128) NOT NULL,
	"batch_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "users_evm_payment_address_idx" ON "users" USING btree ("evm_payment_address");--> statement-breakpoint
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "secrets_user_id_idx" ON "secrets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "secrets_secret_identifier_idx" ON "secrets" USING btree ("secret_identifier");--> statement-breakpoint
CREATE INDEX "workflows_name_idx" ON "workflows" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workflows_version_idx" ON "workflows" USING btree ("version");--> statement-breakpoint
CREATE INDEX "workflows_name_version_idx" ON "workflows" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "workflows_owner_idx" ON "workflows" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "workflows_prev_linked_idx" ON "workflows" USING btree ("previous_linked_workflow");--> statement-breakpoint
CREATE INDEX "workflows_next_linked_idx" ON "workflows" USING btree ("next_linked_workflow");--> statement-breakpoint
CREATE INDEX "workflow_images_owner_idx" ON "workflow_images" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "workflow_images_owner_workflow_idx" ON "workflow_images" USING btree ("owner_id","workflow_name");--> statement-breakpoint
CREATE INDEX "cdp_account_user_id_idx" ON "cdp_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_batch_workflows_owner_batch_workflow_uq" ON "workflow_batch_workflows" USING btree ("owner","batch_id","workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_batch_workflows_owner_batch_idx" ON "workflow_batch_workflows" USING btree ("owner","batch_id");--> statement-breakpoint
CREATE INDEX "workflow_batch_workflows_workflow_id_idx" ON "workflow_batch_workflows" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_batches_owner_batch_id_uq" ON "workflow_batches" USING btree ("owner","batch_id");--> statement-breakpoint
CREATE INDEX "workflow_batches_owner_idx" ON "workflow_batches" USING btree ("owner");