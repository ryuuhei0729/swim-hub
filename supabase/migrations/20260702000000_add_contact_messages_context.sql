-- contact_messages に問い合わせ元のコンテキスト情報を追加
-- 利用アプリ / 利用環境 / 端末情報 をサポート triage 用に保存する（全て nullable・後方互換）
ALTER TABLE contact_messages
  ADD COLUMN IF NOT EXISTS source_app TEXT,   -- 'swimhub' | 'timer' | 'scanner'
  ADD COLUMN IF NOT EXISTS platform TEXT,     -- 'web' | 'ios' | 'android'
  ADD COLUMN IF NOT EXISTS user_agent TEXT,   -- 送信時の User-Agent（端末/OS/ブラウザ判定用の生値）
  ADD COLUMN IF NOT EXISTS referrer TEXT,     -- 遷移元URL（例: timer.swim-hub.app/ja/support）
  ADD COLUMN IF NOT EXISTS page_url TEXT,     -- 送信元ページURL
  ADD COLUMN IF NOT EXISTS locale TEXT;       -- フォーム表示言語
