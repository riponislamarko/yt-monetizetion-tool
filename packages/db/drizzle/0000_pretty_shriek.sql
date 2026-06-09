CREATE TABLE "api_quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_index" integer NOT NULL,
	"units_used" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"daily_limit" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_name" varchar(64) NOT NULL,
	"input_url" text NOT NULL,
	"result" jsonb NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"signal_source" varchar(16),
	"ip_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_quota_usage_key_date_unique" ON "api_quota_usage" USING btree ("api_key_index","date");--> statement-breakpoint
CREATE INDEX "tool_lookups_tool_created_idx" ON "tool_lookups" USING btree ("tool_name","created_at");--> statement-breakpoint
CREATE INDEX "tool_lookups_ip_created_idx" ON "tool_lookups" USING btree ("ip_hash","created_at");