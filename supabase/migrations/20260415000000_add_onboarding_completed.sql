-- onboarding_completed カラムを users テーブルに追加
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false NOT NULL;

-- 既存ユーザーはオンボーディング済みとしてバックフィル
-- マイグレーション実行時点で存在する全ユーザーを完了済みにする
UPDATE public.users
  SET onboarding_completed = true;
