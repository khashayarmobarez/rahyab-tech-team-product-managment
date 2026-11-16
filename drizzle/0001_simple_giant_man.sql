CREATE TABLE "report_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"seen_at" timestamp with time zone,
	"note" text,
	"note_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_reviews_person_date_unique" UNIQUE("person_id","report_date")
);
--> statement-breakpoint
ALTER TABLE "daily_reports" ADD COLUMN "project" text;--> statement-breakpoint
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;