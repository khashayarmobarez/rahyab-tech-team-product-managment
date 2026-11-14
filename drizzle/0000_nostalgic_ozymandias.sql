CREATE TYPE "public"."audit_source" AS ENUM('web', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."decision_status" AS ENUM('open', 'answered');--> statement-breakpoint
CREATE TYPE "public"."person_slug" AS ENUM('khashayar', 'mahan', 'hossein');--> statement-breakpoint
CREATE TYPE "public"."status_label" AS ENUM('green', 'yellow', 'red');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"source" "audit_source" NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"done" text[] DEFAULT '{}' NOT NULL,
	"blockers" text[] DEFAULT '{}' NOT NULL,
	"next" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_reports_person_date_unique" UNIQUE("person_id","report_date")
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "decision_status" DEFAULT 'open' NOT NULL,
	"raised_on" date NOT NULL,
	"raised_by" text NOT NULL,
	"answered_on" date,
	"answer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "person_slug" NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"one_line" text NOT NULL,
	"results" text[] DEFAULT '{}' NOT NULL,
	"by_person" jsonb NOT NULL,
	"waiting_decisions" text[] DEFAULT '{}' NOT NULL,
	"not_finished" text[] DEFAULT '{}' NOT NULL,
	"numbers" jsonb NOT NULL,
	"label" "status_label" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_reports_week_start_unique" UNIQUE("week_start")
);
--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "daily_reports_date_idx" ON "daily_reports" USING btree ("report_date");--> statement-breakpoint
CREATE INDEX "decisions_status_idx" ON "decisions" USING btree ("status","raised_on");