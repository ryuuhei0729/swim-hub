-- contact_messages テーブル（問い合わせフォーム用）
CREATE TABLE contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

-- RLS 有効化
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- anonymous INSERT を許可（フォーム送信用）
CREATE POLICY "allow_anonymous_insert" ON contact_messages
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- SELECT/UPDATE/DELETE は service_role のみ（管理用）
-- service_role は RLS をバイパスするため、明示的なポリシーは不要
