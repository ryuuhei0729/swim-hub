-- =============================================================================
-- インデックスの整理
--
-- 削除するもの (書き込みのたびに更新されるが、読み取りでは別のインデックスで代わりが効くもの):
--   a. 同じ列の UNIQUE インデックスと全く同じもの
--   b. 先頭列が同じ UNIQUE / 複合インデックスがあり、そちらで代わりが効くもの
--   c. 値の種類が数個しかない列 (真偽値・状態) の単独インデックス。絞り込みに使われない
--   d. 子テーブルの作成・更新日時など、並べ替えにも絞り込みにも使っていない列
--   c・d は Supabase advisor の unused_index (本番、2026-11-28) に挙がっていたものに限る。
--   外部キーを支えるインデックス (削除時の参照チェックに使う) と、
--   カレンダー連携の event_id のような値で引くものは残す。
--
-- 追加するもの: 外部キーにインデックスが無かった7列 (advisor の unindexed_foreign_keys)。
--   どれも users の削除時に SET NULL の対象行を探すのに使われる。
-- =============================================================================

-- a. 完全な重複
DROP INDEX IF EXISTS "public"."idx_app_daily_usage_lookup";          -- = app_daily_usage_user_id_app_usage_date_key
DROP INDEX IF EXISTS "public"."idx_teams_invite_code";               -- = teams_invite_code_key
DROP INDEX IF EXISTS "public"."relay_record_legs_relay_record_id_idx"; -- = relay_record_legs_relay_record_id_leg_index_key

-- b. 先頭列で代わりが効く
DROP INDEX IF EXISTS "public"."idx_team_memberships_team_id";        -- team_memberships_team_id_user_id_key
DROP INDEX IF EXISTS "public"."idx_entries_competition_id";          -- entries_competition_id_user_id_style_id_key
DROP INDEX IF EXISTS "public"."idx_entries_user_id";                 -- idx_entries_user_style_relaying
DROP INDEX IF EXISTS "public"."idx_records_user_id";                 -- idx_records_user_style_relaying
DROP INDEX IF EXISTS "public"."idx_practices_user_id";               -- idx_practices_user_date
DROP INDEX IF EXISTS "public"."idx_practice_log_tags_practice_log_id"; -- practice_log_tags_practice_log_id_practice_tag_id_key
DROP INDEX IF EXISTS "public"."idx_practice_tags_user_id";           -- practice_tags_user_id_name_key
DROP INDEX IF EXISTS "public"."idx_practice_log_templates_user_id";  -- idx_practice_log_templates_use_count
DROP INDEX IF EXISTS "public"."idx_goals_user_id";                   -- unique_user_competition_style
DROP INDEX IF EXISTS "public"."idx_team_group_memberships_team_group_id"; -- team_group_memberships_team_group_id_user_id_key
DROP INDEX IF EXISTS "public"."idx_team_groups_team_id";             -- team_groups_team_id_category_name_key
DROP INDEX IF EXISTS "public"."idx_user_team_calendar_colors_user_id"; -- user_team_calendar_colors_user_id_team_id_key
DROP INDEX IF EXISTS "public"."idx_competitions_team_id";            -- idx_competitions_team_id_entry_status

-- c. 値の種類が少ない列
DROP INDEX IF EXISTS "public"."idx_team_memberships_is_active";
DROP INDEX IF EXISTS "public"."idx_team_memberships_status";
DROP INDEX IF EXISTS "public"."idx_records_is_relaying";
DROP INDEX IF EXISTS "public"."idx_entries_is_relaying";
DROP INDEX IF EXISTS "public"."idx_announcements_is_published";
DROP INDEX IF EXISTS "public"."idx_competitions_attendance_status";
DROP INDEX IF EXISTS "public"."idx_practices_attendance_status";
DROP INDEX IF EXISTS "public"."idx_team_attendance_status";
DROP INDEX IF EXISTS "public"."idx_users_gender";

-- d. 使っていない日時・数値の列
DROP INDEX IF EXISTS "public"."idx_split_times_created_at";
DROP INDEX IF EXISTS "public"."idx_split_times_updated_at";
DROP INDEX IF EXISTS "public"."idx_split_times_distance";
DROP INDEX IF EXISTS "public"."idx_practice_times_rep_set";
DROP INDEX IF EXISTS "public"."idx_records_created_at";
DROP INDEX IF EXISTS "public"."idx_records_updated_at";
DROP INDEX IF EXISTS "public"."idx_competitions_created_at";
DROP INDEX IF EXISTS "public"."idx_competitions_updated_at";
DROP INDEX IF EXISTS "public"."idx_teams_created_at";
DROP INDEX IF EXISTS "public"."idx_team_memberships_joined_at";

-- 外部キーのインデックス
CREATE INDEX IF NOT EXISTS "idx_competitions_created_by" ON "public"."competitions" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_practices_created_by" ON "public"."practices" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_team_group_memberships_assigned_by" ON "public"."team_group_memberships" ("assigned_by");
CREATE INDEX IF NOT EXISTS "idx_practice_times_user_id" ON "public"."practice_times" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_goals_style_id" ON "public"."goals" ("style_id");
CREATE INDEX IF NOT EXISTS "idx_relay_records_created_by" ON "public"."relay_records" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_relay_record_legs_style_id" ON "public"."relay_record_legs" ("style_id");
