CREATE TYPE "public"."role" AS ENUM('PlatformOwner', 'Developer');--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" "role" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "owner" varchar(255) NOT NULL;