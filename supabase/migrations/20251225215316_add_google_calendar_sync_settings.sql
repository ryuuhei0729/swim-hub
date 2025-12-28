-- Google Calendar連携設定をusersテーブルに追加
ALTER TABLE "public"."users"
ADD COLUMN IF NOT EXISTS "google_calendar_enabled" boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "google_calendar_refresh_token" text,
ADD COLUMN IF NOT EXISTS "google_calendar_sync_practices" boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS "google_calendar_sync_competitions" boolean DEFAULT true NOT NULL;

-- コメントを追加
COMMENT ON COLUMN "public"."users"."google_calendar_enabled" IS 'Googleカレンダー連携が有効かどうか';
COMMENT ON COLUMN "public"."users"."google_calendar_refresh_token" IS 'Google OAuthリフレッシュトークン（暗号化推奨）';
COMMENT ON COLUMN "public"."users"."google_calendar_sync_practices" IS '練習記録をGoogleカレンダーに同期するかどうか';
COMMENT ON COLUMN "public"."users"."google_calendar_sync_competitions" IS '大会記録をGoogleカレンダーに同期するかどうか';


