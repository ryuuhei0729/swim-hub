-- Google OAuthリフレッシュトークンの暗号化マイグレーション
-- pgsodiumを使用してトークンを暗号化し、セキュリティを強化

-- pgsodium拡張機能を有効化（vaultは既に有効化済み）
-- pgsodiumスキーマを作成してから拡張機能をインストール
CREATE SCHEMA IF NOT EXISTS "pgsodium";
CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";

-- 暗号化キーを生成（既に存在する場合はスキップ）
DO $$
DECLARE
  v_key_id uuid;
BEGIN
  -- キーが既に存在するか確認
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    -- 新しい暗号化キーを生成（secretboxタイプ）
    PERFORM pgsodium.create_key(
      name := 'google_token_encryption_key',
      key_type := 'secretbox'
    );
  END IF;
END $$;

-- 暗号化/復号化用のRPC関数を作成

-- トークンを暗号化して保存する関数
CREATE OR REPLACE FUNCTION public.set_google_refresh_token(
  p_user_id uuid,
  p_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id uuid;
  v_encrypted_token bytea;
  v_nonce bytea;
BEGIN
  -- 認証チェック
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;
  
  -- 自分のユーザーIDのみ更新可能
  IF (SELECT auth.uid()) != p_user_id THEN
    RAISE EXCEPTION '自分のトークンのみ更新可能です';
  END IF;
  
  -- キーIDを取得
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION '暗号化キーが見つかりません';
  END IF;
  
  -- トークンがNULLの場合はNULLを保存
  IF p_token IS NULL THEN
    UPDATE public.users
    SET google_calendar_refresh_token = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN;
  END IF;
  
  -- nonceを生成
  v_nonce := pgsodium.crypto_secretbox_noncegen();
  
  -- トークンを暗号化（key_idを使用）
  v_encrypted_token := pgsodium.crypto_secretbox(
    p_token::bytea,
    v_nonce,
    v_key_id
  );
  
  -- nonceと暗号化されたトークンを結合して保存（nonceは先頭24バイト）
  -- フォーマット: [nonce(24 bytes)][encrypted_token]
  UPDATE public.users
  SET google_calendar_refresh_token = v_nonce || v_encrypted_token,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.set_google_refresh_token(uuid, text) IS 'Google OAuthリフレッシュトークンを暗号化して保存する。認証されたユーザーが自分のトークンのみ更新可能。';

-- トークンを復号化して返す関数
CREATE OR REPLACE FUNCTION public.get_google_refresh_token(
  p_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key_id uuid;
  v_encrypted_data bytea;
  v_nonce bytea;
  v_encrypted_token bytea;
  v_decrypted_token text;
BEGIN
  -- 認証チェック
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;
  
  -- 自分のユーザーIDのみ取得可能
  IF (SELECT auth.uid()) != p_user_id THEN
    RAISE EXCEPTION '自分のトークンのみ取得可能です';
  END IF;
  
  -- 暗号化されたトークンを取得
  SELECT google_calendar_refresh_token INTO v_encrypted_data
  FROM public.users
  WHERE id = p_user_id;
  
  -- トークンがNULLの場合はNULLを返す
  IF v_encrypted_data IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- キーIDを取得
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION '暗号化キーが見つかりません';
  END IF;
  
  -- nonce（先頭24バイト）と暗号化されたトークンを分離
  v_nonce := substring(v_encrypted_data FROM 1 FOR 24);
  v_encrypted_token := substring(v_encrypted_data FROM 25);
  
  -- トークンを復号化（key_idを使用）
  v_decrypted_token := convert_from(
    pgsodium.crypto_secretbox_open(
      v_encrypted_token,
      v_nonce,
      v_key_id
    ),
    'UTF8'
  );
  
  RETURN v_decrypted_token;
END;
$$;

COMMENT ON FUNCTION public.get_google_refresh_token(uuid) IS 'Google OAuthリフレッシュトークンを復号化して返す。認証されたユーザーが自分のトークンのみ取得可能。';

-- 既存のトークンを暗号化して移行
DO $$
DECLARE
  v_user_record RECORD;
  v_key_id uuid;
  v_encrypted_token bytea;
  v_nonce bytea;
BEGIN
  -- キーIDを取得
  SELECT id INTO v_key_id
  FROM pgsodium.key
  WHERE name = 'google_token_encryption_key'
  LIMIT 1;
  
  IF v_key_id IS NULL THEN
    RAISE EXCEPTION '暗号化キーが見つかりません';
  END IF;
  
  -- 既存の平文トークンを暗号化
  FOR v_user_record IN
    SELECT id, google_calendar_refresh_token
    FROM public.users
    WHERE google_calendar_refresh_token IS NOT NULL
      AND length(google_calendar_refresh_token) > 24  -- 既に暗号化されている可能性をチェック（nonce+暗号化データは24バイト以上）
      AND NOT (google_calendar_refresh_token ~ '^[0-9A-Fa-f]+$')  -- 16進数文字列でないことを確認（平文の可能性）
  LOOP
    -- 既に暗号化されている可能性があるため、復号化を試みる
    BEGIN
      -- nonceを抽出（先頭24バイト）
      v_nonce := substring(v_user_record.google_calendar_refresh_token::bytea FROM 1 FOR 24);
      
      -- 復号化を試みる（成功すれば既に暗号化済み）
      PERFORM pgsodium.crypto_secretbox_open(
        substring(v_user_record.google_calendar_refresh_token::bytea FROM 25),
        v_nonce,
        v_key_id
      );
      
      -- 復号化成功 = 既に暗号化済みなのでスキップ
      CONTINUE;
    EXCEPTION
      WHEN OTHERS THEN
        -- 復号化失敗 = 平文なので暗号化する
    END;
    
    -- nonceを生成
    v_nonce := pgsodium.crypto_secretbox_noncegen();
    
    -- トークンを暗号化（key_idを使用）
    v_encrypted_token := pgsodium.crypto_secretbox(
      v_user_record.google_calendar_refresh_token::bytea,
      v_nonce,
      v_key_id
    );
    
    -- nonceと暗号化されたトークンを結合して保存
    UPDATE public.users
    SET google_calendar_refresh_token = v_nonce || v_encrypted_token
    WHERE id = v_user_record.id;
  END LOOP;
END $$;

-- カラムのコメントを更新
COMMENT ON COLUMN public.users.google_calendar_refresh_token IS 'Google OAuthリフレッシュトークン（pgsodiumで暗号化済み。nonce(24 bytes) + encrypted_token形式）';
