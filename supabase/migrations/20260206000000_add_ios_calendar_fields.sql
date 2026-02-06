-- iOSカレンダー同期用のフィールドをusersテーブルに追加
ALTER TABLE public.users
ADD COLUMN ios_calendar_enabled BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN ios_calendar_sync_practices BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN ios_calendar_sync_competitions BOOLEAN DEFAULT true NOT NULL;

-- コメント追加
COMMENT ON COLUMN public.users.ios_calendar_enabled IS 'iOSカレンダー連携が有効かどうか';
COMMENT ON COLUMN public.users.ios_calendar_sync_practices IS '練習記録をiOSカレンダーに自動同期するかどうか';
COMMENT ON COLUMN public.users.ios_calendar_sync_competitions IS '大会記録をiOSカレンダーに自動同期するかどうか';

-- practicesテーブルにios_calendar_event_idを追加
ALTER TABLE public.practices
ADD COLUMN ios_calendar_event_id TEXT;

-- competitionsテーブルにios_calendar_event_id追加
ALTER TABLE public.competitions
ADD COLUMN ios_calendar_event_id TEXT;

-- インデックス追加
CREATE INDEX idx_practices_ios_calendar_event_id ON practices(ios_calendar_event_id);
CREATE INDEX idx_competitions_ios_calendar_event_id ON competitions(ios_calendar_event_id);

COMMENT ON COLUMN public.practices.ios_calendar_event_id IS 'iOSカレンダーイベントID';
COMMENT ON COLUMN public.competitions.ios_calendar_event_id IS 'iOSカレンダーイベントID';
