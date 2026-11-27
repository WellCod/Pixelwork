CREATE TABLE "space_map_versions" (
	"space_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"map" jsonb NOT NULL,
	"author" text,
	"created_at" timestamp with time zone,
	CONSTRAINT "space_map_versions_space_id_version_pk" PRIMARY KEY("space_id","version")
);
--> statement-breakpoint
ALTER TABLE "space_map_versions" ADD CONSTRAINT "space_map_versions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;