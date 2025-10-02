-- =============================================================================
-- 統合スキーママイグレーション
-- 水泳選手管理システム（Swim Manager v2）
-- 作成日: 2025年1月17日
-- =============================================================================

-- 既存のテーブルとデータを削除（依存関係の順序で削除）
SET session_replication_role = replica;

DROP TABLE IF EXISTS practice_times CASCADE;
DROP TABLE IF EXISTS practice_log_tags CASCADE;
DROP TABLE IF EXISTS practice_logs CASCADE;
DROP TABLE IF EXISTS practices CASCADE;
DROP TABLE IF EXISTS practice_tags CASCADE;
DROP TABLE IF EXISTS split_times CASCADE;
DROP TABLE IF EXISTS records CASCADE;
DROP TABLE IF EXISTS competitions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS styles CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- 外部キー制約を再有効化
SET session_replication_role = DEFAULT;

-- =============================================================================
-- 1. 基本テーブルの作成
-- =============================================================================

-- 水泳種目マスタテーブル（固定データ）
CREATE TABLE styles (
  id INTEGER PRIMARY KEY,
  name_jp TEXT NOT NULL,
  name TEXT NOT NULL,
  style TEXT NOT NULL CHECK (style IN ('fr', 'br', 'ba', 'fly', 'im')),
  distance INTEGER NOT NULL
);

-- 水泳種目の固定データを挿入
INSERT INTO styles (id, name_jp, name, style, distance) VALUES
(1, '50m自由形', '50Fr', 'fr', 50),
(2, '100m自由形', '100Fr', 'fr', 100),
(3, '200m自由形', '200Fr', 'fr', 200),
(4, '400m自由形', '400Fr', 'fr', 400),
(5, '800m自由形', '800Fr', 'fr', 800),
(6, '50m平泳ぎ', '50Br', 'br', 50),
(7, '100m平泳ぎ', '100Br', 'br', 100),
(8, '200m平泳ぎ', '200Br', 'br', 200),
(9, '50m背泳ぎ', '50Ba', 'ba', 50),
(10, '100m背泳ぎ', '100Ba', 'ba', 100),
(11, '200m背泳ぎ', '200Ba', 'ba', 200),
(12, '50mバタフライ', '50Fly', 'fly', 50),
(13, '100mバタフライ', '100Fly', 'fly', 100),
(14, '200mバタフライ', '200Fly', 'fly', 200),
(15, '100m個人メドレー', '100IM', 'im', 100),
(16, '200m個人メドレー', '200IM', 'im', 200),
(17, '400m個人メドレー', '400IM', 'im', 400);

-- ユーザーテーブル（Supabase Authと連携）
CREATE TABLE users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  gender INTEGER NOT NULL DEFAULT 0 CHECK (gender IN (0, 1)), -- 0: male, 1: female
  birthday DATE,
  profile_image_path TEXT, -- Supabase Storageのパスを格納
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 大会情報テーブル（共有リソース）
CREATE TABLE competitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  place TEXT, -- NULL許可（2025年1月17日修正）
  pool_type INTEGER DEFAULT 0 CHECK (pool_type IN (0, 1)), -- 0: short, 1: long
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 記録テーブル
CREATE TABLE records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES competitions(id) ON DELETE SET NULL,
  style_id INTEGER NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  time DECIMAL(10,2) NOT NULL,
  video_url TEXT,
  note TEXT,
  is_relaying BOOLEAN NOT NULL DEFAULT false -- リレー種目フラグ（2025年1月17日追加）
);

-- スプリットタイムテーブル
CREATE TABLE split_times (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  distance INTEGER NOT NULL,
  split_time DECIMAL(10,2) NOT NULL
);

-- 練習日テーブル
CREATE TABLE practices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  place TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 練習タグテーブル
CREATE TABLE practice_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6', -- デフォルトカラー（青）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 練習ログテーブル
CREATE TABLE practice_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  style TEXT NOT NULL,
  rep_count INTEGER NOT NULL,
  set_count INTEGER NOT NULL,
  distance INTEGER NOT NULL,
  circle DECIMAL(10,2),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 練習ログタグ関連テーブル
CREATE TABLE practice_log_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  practice_log_id UUID NOT NULL REFERENCES practice_logs(id) ON DELETE CASCADE,
  practice_tag_id UUID NOT NULL REFERENCES practice_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(practice_log_id, practice_tag_id)
);

-- 練習タイムテーブル
CREATE TABLE practice_times (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_log_id UUID NOT NULL REFERENCES practice_logs(id) ON DELETE CASCADE,
  rep_number INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  time DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ユーザーセッションテーブル
CREATE TABLE user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip_address INET,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at_ts TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 2. インデックスの作成
-- =============================================================================

-- Users table indexes
CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_gender ON users(gender);

-- Competitions table indexes
CREATE INDEX idx_competitions_date ON competitions(date);
CREATE INDEX idx_competitions_title ON competitions(title);

-- Records table indexes
CREATE INDEX idx_records_user_id ON records(user_id);
CREATE INDEX idx_records_competition_id ON records(competition_id);
CREATE INDEX idx_records_style_id ON records(style_id);
CREATE INDEX idx_records_time ON records(time);
CREATE INDEX idx_records_is_relaying ON records(is_relaying);
CREATE INDEX idx_records_user_style_relaying ON records(user_id, style_id, is_relaying);

-- Split times table indexes
CREATE INDEX idx_split_times_record_id ON split_times(record_id);
CREATE INDEX idx_split_times_distance ON split_times(distance);

-- Practice table indexes
CREATE INDEX idx_practices_user_date ON practices(user_id, date);

-- Practice tags table indexes
CREATE INDEX idx_practice_tags_user_id ON practice_tags(user_id);
CREATE INDEX idx_practice_tags_name ON practice_tags(name);

-- Practice logs table indexes
CREATE INDEX idx_practice_logs_user_id ON practice_logs(user_id);
CREATE INDEX idx_practice_logs_practice_id ON practice_logs(practice_id);
CREATE INDEX idx_practice_logs_style ON practice_logs(style);

-- Practice log tags table indexes
CREATE INDEX idx_practice_log_tags_practice_log_id ON practice_log_tags(practice_log_id);
CREATE INDEX idx_practice_log_tags_practice_tag_id ON practice_log_tags(practice_tag_id);

-- Practice times table indexes
CREATE INDEX idx_practice_times_practice_log_id ON practice_times(practice_log_id);
CREATE INDEX idx_practice_times_rep_set ON practice_times(rep_number, set_number);

-- User sessions table indexes
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- =============================================================================
-- 3. Row Level Security (RLS) の設定
-- =============================================================================

-- 全テーブルでRLSを有効化
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_log_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- stylesテーブルはRLS無効（固定データのため）

-- =============================================================================
-- 4. RLSポリシーの設定
-- =============================================================================

-- Users table policies（自分のデータのみアクセス可能）
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON users FOR DELETE USING (auth.uid() = id);

-- Competitions table policies（共有リソース）
CREATE POLICY "Everyone can view competitions" ON competitions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert competitions" ON competitions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update competitions" ON competitions FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete competitions" ON competitions FOR DELETE USING (auth.uid() IS NOT NULL);

-- Records table policies（自分のデータのみアクセス可能）
CREATE POLICY "Users can view own records" ON records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own records" ON records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own records" ON records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own records" ON records FOR DELETE USING (auth.uid() = user_id);

-- Split times table policies（関連するrecordの所有者のみアクセス可能）
CREATE POLICY "Users can view own split_times" ON split_times FOR SELECT 
    USING (EXISTS (SELECT 1 FROM records WHERE records.id = split_times.record_id AND records.user_id = auth.uid()));
CREATE POLICY "Users can insert own split_times" ON split_times FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM records WHERE records.id = split_times.record_id AND records.user_id = auth.uid()));
CREATE POLICY "Users can update own split_times" ON split_times FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM records WHERE records.id = split_times.record_id AND records.user_id = auth.uid()));
CREATE POLICY "Users can delete own split_times" ON split_times FOR DELETE 
    USING (EXISTS (SELECT 1 FROM records WHERE records.id = split_times.record_id AND records.user_id = auth.uid()));

-- Practices table policies（自分のデータのみアクセス可能）
CREATE POLICY "Users can view own practices" ON practices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own practices" ON practices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own practices" ON practices FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own practices" ON practices FOR DELETE USING (auth.uid() = user_id);

-- Practice tags table policies（自分のデータのみアクセス可能）
CREATE POLICY "Users can view own practice_tags" ON practice_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own practice_tags" ON practice_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own practice_tags" ON practice_tags FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own practice_tags" ON practice_tags FOR DELETE USING (auth.uid() = user_id);

-- Practice logs table policies（関連するpracticeの所有者のみアクセス可能）
CREATE POLICY "Users can view own practice_logs" ON practice_logs FOR SELECT 
    USING (EXISTS (SELECT 1 FROM practices WHERE practices.id = practice_logs.practice_id AND practices.user_id = auth.uid()));
CREATE POLICY "Users can insert own practice_logs" ON practice_logs FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM practices WHERE practices.id = practice_logs.practice_id AND practices.user_id = auth.uid()));
CREATE POLICY "Users can update own practice_logs" ON practice_logs FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM practices WHERE practices.id = practice_logs.practice_id AND practices.user_id = auth.uid()));
CREATE POLICY "Users can delete own practice_logs" ON practice_logs FOR DELETE 
    USING (EXISTS (SELECT 1 FROM practices WHERE practices.id = practice_logs.practice_id AND practices.user_id = auth.uid()));

-- Practice log tags table policies（関連するpractice_logの所有者のみアクセス可能）
CREATE POLICY "Users can view own practice_log_tags" ON practice_log_tags FOR SELECT 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_log_tags.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can insert own practice_log_tags" ON practice_log_tags FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM practice_logs pl 
                        JOIN practices p ON p.id = pl.practice_id 
                        WHERE pl.id = practice_log_tags.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update own practice_log_tags" ON practice_log_tags FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_log_tags.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can delete own practice_log_tags" ON practice_log_tags FOR DELETE 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_log_tags.practice_log_id AND p.user_id = auth.uid()));

-- Practice times table policies（関連するpractice_logの所有者のみアクセス可能）
CREATE POLICY "Users can view own practice_times" ON practice_times FOR SELECT 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_times.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can insert own practice_times" ON practice_times FOR INSERT 
    WITH CHECK (EXISTS (SELECT 1 FROM practice_logs pl 
                        JOIN practices p ON p.id = pl.practice_id 
                        WHERE pl.id = practice_times.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can update own practice_times" ON practice_times FOR UPDATE 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_times.practice_log_id AND p.user_id = auth.uid()));
CREATE POLICY "Users can delete own practice_times" ON practice_times FOR DELETE 
    USING (EXISTS (SELECT 1 FROM practice_logs pl 
                   JOIN practices p ON p.id = pl.practice_id 
                   WHERE pl.id = practice_times.practice_log_id AND p.user_id = auth.uid()));

-- User sessions table policies（自分のセッションのみアクセス可能）
CREATE POLICY "Users can view own sessions" ON user_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON user_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON user_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON user_sessions FOR DELETE USING (auth.uid() = user_id);

-- Styles table policies（全ユーザーが読み取り専用でアクセス可能）
CREATE POLICY "Everyone can view styles" ON styles FOR SELECT USING (true);

-- =============================================================================
-- 5. トリガーと関数の設定
-- =============================================================================

-- 更新日時の自動更新関数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 各テーブルに更新日時トリガーを設定
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_competitions_updated_at BEFORE UPDATE ON competitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_practices_updated_at BEFORE UPDATE ON practices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_practice_tags_updated_at BEFORE UPDATE ON practice_tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_practice_logs_updated_at BEFORE UPDATE ON practice_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_practice_times_updated_at BEFORE UPDATE ON practice_times
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ユーザープロフィール自動作成関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, gender, birthday, profile_image_path, bio)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'gender')::INTEGER, 0), -- デフォルト: 0 (male)
    NULL,
    NULL, -- プロフィール画像は後でアップロード
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ユーザー作成時のトリガー
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 6. Supabase Storage の設定
-- =============================================================================

-- Storage バケットの作成
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS ポリシーの設定
CREATE POLICY "Users can view profile images" ON storage.objects
FOR SELECT USING (bucket_id = 'profile-images');

CREATE POLICY "Users can upload their own profile images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own profile images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'profile-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =============================================================================
-- 7. データの整合性チェック
-- =============================================================================

-- 既存のnull値を修正（competitions.place）
UPDATE competitions 
SET place = '' 
WHERE place IS NULL;

-- =============================================================================
-- マイグレーション完了
-- =============================================================================
