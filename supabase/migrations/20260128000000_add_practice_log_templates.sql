-- =============================================================================
-- practice_log_templates テーブル
-- 練習ログのテンプレートを保存する
-- =============================================================================

CREATE TABLE IF NOT EXISTS practice_log_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  style VARCHAR(10) NOT NULL,
  swim_category VARCHAR(10) NOT NULL DEFAULT 'Swim',
  distance INTEGER NOT NULL DEFAULT 50,
  rep_count INTEGER NOT NULL DEFAULT 1,
  set_count INTEGER NOT NULL DEFAULT 1,
  circle INTEGER,
  note TEXT,
  tag_ids UUID[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_practice_log_templates_user_id
  ON practice_log_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_practice_log_templates_use_count
  ON practice_log_templates(user_id, use_count DESC);

-- RLS
ALTER TABLE practice_log_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own templates" ON practice_log_templates;
CREATE POLICY "Users can manage own templates"
  ON practice_log_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- use_count インクリメント用RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_template_use_count(template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE practice_log_templates
  SET use_count = use_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE id = template_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- updated_at 自動更新トリガー
-- =============================================================================

DROP TRIGGER IF EXISTS update_practice_log_templates_updated_at ON practice_log_templates;
CREATE TRIGGER update_practice_log_templates_updated_at
  BEFORE UPDATE ON practice_log_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
