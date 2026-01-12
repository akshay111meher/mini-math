CREATE TABLE "key_value_store" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
DROP TABLE "keyValueStore" CASCADE;