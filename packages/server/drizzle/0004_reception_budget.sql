CREATE TABLE "reception_daily_usage" (
	"space_id" uuid NOT NULL,
	"day" text NOT NULL,
	"reserved_ms" integer NOT NULL,
	CONSTRAINT "reception_daily_usage_space_id_day_pk" PRIMARY KEY("space_id","day")
);
--> statement-breakpoint
ALTER TABLE "reception_daily_usage" ADD CONSTRAINT "reception_daily_usage_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;