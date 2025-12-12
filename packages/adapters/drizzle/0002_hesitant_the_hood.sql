CREATE TABLE "cdp_accounts" (
	"user_id" text NOT NULL,
	"account_name" text NOT NULL,
	CONSTRAINT "cdp_accounts_user_id_account_name_pk" PRIMARY KEY("user_id","account_name")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cdpAccountCredits" integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX "cdp_account_user_id_idx" ON "cdp_accounts" USING btree ("user_id");