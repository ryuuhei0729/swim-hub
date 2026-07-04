-- 大会エントリーにリレー区分を追加する
-- records テーブルと同様に is_relaying 列を持たせ、リレー種目のエントリーを区別できるようにする

ALTER TABLE "public"."entries"
  ADD COLUMN "is_relaying" boolean DEFAULT false NOT NULL;

CREATE INDEX "idx_entries_is_relaying"
  ON "public"."entries" USING "btree" ("is_relaying");

CREATE INDEX "idx_entries_user_style_relaying"
  ON "public"."entries" USING "btree" ("user_id", "style_id", "is_relaying");

COMMENT ON COLUMN "public"."entries"."is_relaying" IS 'リレー区分（true=リレー、false=個人）';
