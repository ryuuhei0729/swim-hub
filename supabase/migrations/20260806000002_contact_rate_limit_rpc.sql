-- =============================================================================
-- セキュリティ監査 Medium: M-2 (/api/contact のレート制限が存在しない)
-- =============================================================================
--
-- 背景:
--   /api/contact は未認証アクセス可能な POST エンドポイントだが、リクエスト数
--   の上限が一切無い。無制限にメール送信 (Resend) を発火させられる。
--
-- 対策方針: scanner の C-3 対応 (20260803000001_atomic_usage_reservation_rpc.sql
-- の reserve_guest_scan/guest_scan_daily_usage) と同型のテーブル + 単一 SQL 文
-- (INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit) による原子的予約に
-- 統一する。Cloudflare KV の get→put 方式は同ファイルのコメントの通り TOCTOU
-- (C-3) で淘汰された非推奨パターンであり使用しない。
--
-- reserve_guest_scan と異なり release_* は用意しない: Gemini のような外部コスト
-- 呼び出しが無く (問い合わせ送信はメール通知のみ)、失敗時に枠を戻す必要が無い
-- ため、C-3 の複雑な release 機構をこの用途に持ち込まない。
--
-- 上限: 同一 IP あたり 1日 10件。
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / REVOKE
-- (未付与でもエラーにならない) のみで構成しており、本番の既存データには
-- 影響しない。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. contact_rate_limit_daily_usage: IP ハッシュ単位の日次問い合わせ送信数
--
--   (ip_hash, usage_date) を主キーにする。生 IP ではなく呼び出し元
--   (Cloudflare Workers の Web Crypto crypto.subtle.digest) で SHA-256 済みの
--   値のみを保存する (guest_scan_daily_usage と同型・プライバシー配慮)。
--
--   RLS を有効化するがポリシーは一切定義しない (default deny)。加えてテーブル
--   権限層でも anon/authenticated から REVOKE する (guest_scan_daily_usage と
--   同型の多層防御)。
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."contact_rate_limit_daily_usage" (
  "ip_hash" text NOT NULL,
  "usage_date" date NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("ip_hash", "usage_date")
);

COMMENT ON TABLE "public"."contact_rate_limit_daily_usage" IS
  '/api/contact の IP ハッシュ単位の日次送信回数。ip_hash は生 IP を SHA-256 で
ハッシュ化した値 (呼び出し元の Cloudflare Workers Web Crypto で計算)。RLS は
ポリシー無し (default deny) + テーブル権限層でも anon/authenticated から REVOKE
済みで、reserve_contact_submission (service_role 限定 RPC) 経由でのみ読み書き
される。';

ALTER TABLE "public"."contact_rate_limit_daily_usage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."contact_rate_limit_daily_usage" FROM PUBLIC, "anon", "authenticated";
-- service_role は initial_schema.sql の
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "service_role" により
-- 自動付与されるため、明示 GRANT は不要 (かつ RLS も service_role には適用
-- されない=BYPASSRLS)。


-- -----------------------------------------------------------------------------
-- 2. reserve_contact_submission (M-2)
--
--   予約は INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit の単一文で
--   行う。これが原子性の核心 (Postgres は ON CONFLICT DO UPDATE の対象行に
--   対して行ロックを取ってから WHERE を評価するため、並行呼び出しの一方は
--   相手の更新完了を待ってから自分の WHERE を評価する=TOCTOU が発生しない)。
--
--   落とし穴: 「行が存在しない初回 INSERT」では ON CONFLICT の WHERE 句は
--   一切評価されない (INSERT 経路そのものであり UPDATE 経路の条件ではない
--   ため)。上限は現状 10 (> 0) だが、将来 0 以下の値が誤って設定された場合に
--   「初回だけ無条件で通ってしまう」事故を防ぐため、関数冒頭で
--   CONTACT_DAILY_LIMIT <= 0 のガードを明示する (reserve_guest_scan と同型)。
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."reserve_contact_submission"(
  "p_ip_hash" text,
  "p_usage_date" date
)
RETURNS TABLE("allowed" boolean, "remaining" integer)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit CONSTANT integer := 10; -- 同一IPあたり1日10件
  v_count integer;
BEGIN
  IF p_ip_hash IS NULL OR btrim(p_ip_hash) = '' THEN
    RAISE EXCEPTION 'p_ip_hash must not be empty';
  END IF;

  -- v_limit <= 0 だと「行が存在しない初回 INSERT」で WHERE 句が評価されず
  -- 無条件に通ってしまうため、ここで明示的に弾く (現状 v_limit=10 なので
  -- 到達しないが、将来の変更に対する安全策)。
  IF v_limit <= 0 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.contact_rate_limit_daily_usage AS c (ip_hash, usage_date, count)
  VALUES (p_ip_hash, p_usage_date, 1)
  ON CONFLICT (ip_hash, usage_date)
  DO UPDATE SET count = c.count + 1, updated_at = now()
  WHERE c.count < v_limit
  RETURNING c.count INTO v_count;

  IF v_count IS NULL THEN
    -- WHERE 条件が false で DO UPDATE が発火せず RETURNING も無かった
    -- = 既に上限に達している (行は既存のはず)
    SELECT count INTO v_count
    FROM public.contact_rate_limit_daily_usage
    WHERE ip_hash = p_ip_hash AND usage_date = p_usage_date;

    RETURN QUERY SELECT false, GREATEST(v_limit - COALESCE(v_count, v_limit), 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, GREATEST(v_limit - v_count, 0);
END;
$$;

ALTER FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) IS
  '/api/contact の IP ハッシュ単位の日次送信枠を単一 SQL 文 (INSERT ... ON
CONFLICT DO UPDATE ... WHERE count < limit) で原子的に予約する。並行リクエストは
Postgres の行ロックにより直列化され、両方が「枠が残っている」と誤判定すること
はない。release は用意しない (Gemini のような外部コスト呼び出しが無く、失敗時
に枠を戻す必要が無いため)。service_role 限定 (呼び出し元は Cloudflare Workers
の Web Crypto でハッシュ化した IP を渡すサーバーコードのみ)。';

REVOKE ALL ON FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reserve_contact_submission"("p_ip_hash" text, "p_usage_date" date) TO "service_role";
