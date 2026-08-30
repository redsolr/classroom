CREATE TABLE "study_deck_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"deck_id" uuid,
	"kind" "study_card_kind" NOT NULL,
	"cards" integer NOT NULL,
	"correct" integer NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_books" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "study_books" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_books" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "study_decks" ADD COLUMN "book_id" uuid;--> statement-breakpoint
ALTER TABLE "study_deck_runs" ADD CONSTRAINT "study_deck_runs_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_deck_runs" ADD CONSTRAINT "study_deck_runs_deck_id_study_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."study_decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_deck_runs_learner_deck_idx" ON "study_deck_runs" USING btree ("learner_id","deck_id");--> statement-breakpoint
CREATE INDEX "study_deck_runs_learner_time_idx" ON "study_deck_runs" USING btree ("learner_id","finished_at");--> statement-breakpoint
ALTER TABLE "study_decks" ADD CONSTRAINT "study_decks_book_id_study_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."study_books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_books_share_token_idx" ON "study_books" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "study_decks_book_id_idx" ON "study_decks" USING btree ("book_id");--> statement-breakpoint

-- BACKFILL: every existing deck gets a book of the same name, and moves
-- into it.
--
-- Without this, a learner wakes up to an empty Books shelf and their
-- decks apparently gone, because the surface they knew as "Books" is now
-- one level down. Their shelf looks identical the morning after; what
-- they gain is the ability to put a second deck, or a note, inside one.
--
-- Existing READING-LIST books are left exactly as they are: they already
-- were books, they already held notes, and the merge is precisely the
-- claim that those two things were the same shape all along.
INSERT INTO "study_books" ("id", "learner_id", "title", "pinned", "created_at", "updated_at")
SELECT gen_random_uuid(), d."learner_id", d."name", d."pinned", d."created_at", d."updated_at"
FROM "study_decks" d
WHERE d."book_id" IS NULL;--> statement-breakpoint

-- Match each deck to the book just minted for it. Keyed on
-- (learner, name, created_at) because that triple is what the insert
-- above copied verbatim, and a learner may legitimately have two decks
-- with the same name.
UPDATE "study_decks" d
SET "book_id" = b."id"
FROM "study_books" b
WHERE d."book_id" IS NULL
  AND b."learner_id" = d."learner_id"
  AND b."title" = d."name"
  AND b."created_at" = d."created_at"
  AND b."read_at" IS NULL
  AND b."summary" IS NULL;
