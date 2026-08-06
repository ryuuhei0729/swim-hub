-- =============================================================================
-- セキュリティ監査 High: C-3 (ゲストレート制限の TOCTOU) + C-4 (無料枠判定の TOCTOU)
-- =============================================================================
--
-- 背景:
--   - C-3: scanner のゲストレート制限は Cloudflare KV の get→put 2往復で実装
--     されており、KV には CAS も原子的インクリメントも無い (結果整合)。
--     並行リクエストは全て同じ current 値を読んで全て通過してしまう。
--   - C-4: canUserScan (読み取り) → Gemini 呼び出し (数秒) → incrementScanCount
--     (加算) という構造で、読み取りと加算の間に競合窓がある。同一ユーザーが
--     同時に2リクエストを送ると両方が「まだ枠が残っている」と判定できる。
--     swim-hub 側の scan-timesheet edge function も同型の構造を持つ。
--
-- 対策方針: Durable Object は不採用 (前例ゼロ・低スループット用途に過剰)。
--   Postgres の単一 SQL 文 (ゲスト) / advisory lock で直列化した SUM→判定→upsert
--   (認証済みユーザー) による原子的予約に統一する。
--
-- PM による重大な修正2点 (Planner 案からの変更):
--   1. 上限値をクライアントに渡させない。reserve_user_daily_usage は p_limit を
--      引数に取らず、関数内部で user_subscriptions を読んで Premium かどうかを
--      導出し、無料上限は関数内定数として保持する。呼び出し側から上限を渡せる
--      設計だと、万一 GRANT 設定を間違えて authenticated に EXECUTE が漏れた
--      場合、無料ユーザーが p_limit に大きな値/NULL を渡して自己申告で無制限を
--      名乗れてしまう。
--   2. reserve_* / release_* は全て service_role 限定にする。authenticated に
--      開くと、Gemini を一切呼ばずに release_user_daily_usage だけを直接連打
--      して daily_tokens_used を 0 まで戻せてしまい、C-1 (20260801000000) で
--      塞いだ「自己リセットで無料枠を無制限化する」穴が再び開く。
--
--   → service_role 限定にすると SECURITY DEFINER 関数内で auth.uid() が NULL に
--     なり、既存の「auth.uid() = p_user_id」自己検証パターン (increment_daily_usage
--     等) が使えなくなる。代わりに「呼び出し元 (Next.js API Route / Edge
--     Function) が verifyAuth で JWT 検証を済ませたユーザー ID を渡す」という
--     信頼モデルになる。呼び出し元はクライアント供給の user_id を絶対に渡さず、
--     必ずサーバー側で検証済みの uid を使うこと。
--
-- 既存の increment_daily_usage は削除せず併存させる (新 RPC に問題があった場合
-- に呼び出し元コードだけロールバックできるようにするため)。GRANT 剥奪は
-- 今回のスコープ外。
--
-- 冪等性: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION / REVOKE
-- (未付与でもエラーにならない) のみで構成しており、本番の既存データには
-- 影響しない。
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. guest_scan_daily_usage: ゲストの日次スキャン回数 (C-3)
--
--   (ip_hash, usage_date) を主キーにする。生 IP ではなく呼び出し元
--   (Cloudflare Workers の Web Crypto crypto.subtle.digest) で SHA-256 済みの
--   値のみを保存する (プライバシー配慮)。
--
--   RLS を有効化するがポリシーは一切定義しない (default deny)。加えてテーブル
--   権限層でも anon/authenticated から REVOKE する (多層防御。20260705000001
--   と同型)。この新規テーブルは ALTER DEFAULT PRIVILEGES FOR ROLE postgres
--   ... GRANT ALL ON TABLES TO authenticated (initial_schema.sql:2250、anon 分
--   のみ 20260705000001 で是正済み) により作成直後は authenticated に ALL が
--   自動付与されるため、ここで明示的に REVOKE する。
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."guest_scan_daily_usage" (
  "ip_hash" text NOT NULL,
  "usage_date" date NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("ip_hash", "usage_date")
);

COMMENT ON TABLE "public"."guest_scan_daily_usage" IS
  'ゲスト(未認証)ユーザーの IP ハッシュ単位の日次スキャン回数。ip_hash は生 IP を
SHA-256 でハッシュ化した値 (呼び出し元の Cloudflare Workers Web Crypto で計算)。
RLS はポリシー無し (default deny) + テーブル権限層でも anon/authenticated から
REVOKE 済みで、reserve_guest_scan/release_guest_scan (service_role 限定 RPC)
経由でのみ読み書きされる。';

ALTER TABLE "public"."guest_scan_daily_usage" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."guest_scan_daily_usage" FROM PUBLIC, "anon", "authenticated";
-- service_role は initial_schema.sql の
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO "service_role" により
-- 自動付与されるため、明示 GRANT は不要 (かつ RLS も service_role には適用
-- されない=BYPASSRLS)。


-- -----------------------------------------------------------------------------
-- 2. reserve_guest_scan / release_guest_scan (C-3)
--
--   予約は INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit の単一文で
--   行う。これが原子性の核心 (Postgres は ON CONFLICT DO UPDATE の対象行に
--   対して行ロックを取ってから WHERE を評価するため、並行呼び出しの一方は
--   相手の更新完了を待ってから自分の WHERE を評価する=TOCTOU が発生しない)。
--
--   落とし穴: 「行が存在しない初回 INSERT」では ON CONFLICT の WHERE 句は
--   一切評価されない (INSERT 経路そのものであり UPDATE 経路の条件ではない
--   ため)。ゲストの日次上限は現状 1 で固定 (> 0) だが、将来 0 以下の値が
--   誤って設定された場合に「初回だけ無条件で通ってしまう」事故を防ぐため、
--   関数冒頭で GUEST_DAILY_LIMIT <= 0 のガードを明示する。
--
--   上限値は関数内定数 (GUEST_DAILY_LIMIT) として持つ。scanner の
--   PLAN_LIMITS.guest.dailyScanLimit (apps/shared/types/plan.ts, 現在 1) と
--   値が二重管理になる点に注意 (値がズレた場合は挙動が分かれる)。
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."reserve_guest_scan"(
  "p_ip_hash" text,
  "p_usage_date" date
)
RETURNS TABLE("allowed" boolean, "remaining" integer)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit CONSTANT integer := 1; -- scanner PLAN_LIMITS.guest.dailyScanLimit と同値 (二重管理)
  v_count integer;
BEGIN
  IF p_ip_hash IS NULL OR btrim(p_ip_hash) = '' THEN
    RAISE EXCEPTION 'p_ip_hash must not be empty';
  END IF;

  -- v_limit <= 0 だと「行が存在しない初回 INSERT」で WHERE 句が評価されず
  -- 無条件に通ってしまうため、ここで明示的に弾く (現状 v_limit=1 なので
  -- 到達しないが、将来の変更に対する安全策)。
  IF v_limit <= 0 THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  INSERT INTO public.guest_scan_daily_usage AS g (ip_hash, usage_date, count)
  VALUES (p_ip_hash, p_usage_date, 1)
  ON CONFLICT (ip_hash, usage_date)
  DO UPDATE SET count = g.count + 1, updated_at = now()
  WHERE g.count < v_limit
  RETURNING g.count INTO v_count;

  IF v_count IS NULL THEN
    -- WHERE 条件が false で DO UPDATE が発火せず RETURNING も無かった
    -- = 既に上限に達している (行は既存のはず)
    SELECT count INTO v_count
    FROM public.guest_scan_daily_usage
    WHERE ip_hash = p_ip_hash AND usage_date = p_usage_date;

    RETURN QUERY SELECT false, GREATEST(v_limit - COALESCE(v_count, v_limit), 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, GREATEST(v_limit - v_count, 0);
END;
$$;

ALTER FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) IS
  'ゲスト(IPハッシュ)単位の日次スキャン枠を単一 SQL 文 (INSERT ... ON CONFLICT DO
UPDATE ... WHERE count < limit) で原子的に予約する。並行リクエストは Postgres の
行ロックにより直列化され、両方が「枠が残っている」と誤判定することはない。
service_role 限定 (呼び出し元は Cloudflare Workers の Web Crypto でハッシュ化した
IP を渡すサーバーコードのみ)。失敗時は release_guest_scan で解放すること。';

REVOKE ALL ON FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reserve_guest_scan"("p_ip_hash" text, "p_usage_date" date) TO "service_role";


CREATE OR REPLACE FUNCTION "public"."release_guest_scan"(
  "p_ip_hash" text,
  "p_usage_date" date
)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ip_hash IS NULL OR btrim(p_ip_hash) = '' THEN
    RAISE EXCEPTION 'p_ip_hash must not be empty';
  END IF;

  UPDATE public.guest_scan_daily_usage
  SET count = GREATEST(count - 1, 0), updated_at = now()
  WHERE ip_hash = p_ip_hash AND usage_date = p_usage_date;
END;
$$;

ALTER FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) IS
  'reserve_guest_scan で予約した枠を Gemini 呼び出し失敗時に解放する。
count は GREATEST(count-1, 0) で負数にならないようガードしているため、呼び出し元の
二重解放バグがあっても 0 未満には落ちない (ただしそれでも呼び出し元は解放を高々1回
に限定する冪等ガードを持つこと。詳細は rate-limit.ts のコメント参照)。service_role 限定。';

REVOKE ALL ON FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_guest_scan"("p_ip_hash" text, "p_usage_date" date) TO "service_role";


-- -----------------------------------------------------------------------------
-- 3. reserve_user_daily_usage / release_user_daily_usage (C-4)
--
--   認証済みユーザーの無料枠判定を原子化する。判定は app_daily_usage の
--   daily_tokens_used を全アプリ横断で SUM した値に対して行う (usage.ts の
--   getTodayTokensUsed と同じ横断集計仕様を維持する)。
--
--   この SUM→判定→upsert は複数行にまたがる集計を要するため、guest 版のような
--   単一 upsert 文では表現できない。「その日まだ1行も無い」ケース (=対象行が
--   存在せず FOR UPDATE で行ロックできない) を含めて直列化するため、
--   pg_advisory_xact_lock((user_id, usage_date) をキーにしたハッシュ) で
--   同一ユーザー・同一日の reserve/release 呼び出し全体をトランザクション
--   スコープでロックしてから SUM→判定→upsert を行う。advisory lock は
--   pg_advisory_xact_lock なのでトランザクション終了 (PostgREST 経由の RPC
--   呼び出しは1呼び出し=1トランザクション) で自動解放され、明示的な unlock は
--   不要。
--
--   Premium 判定は apps/shared/utils/premium.ts の checkIsPremium() と一致させる:
--     plan = 'premium' AND status IN ('active','trialing')
--     AND (premium_expires_at IS NULL OR premium_expires_at > now())
--
--   無料枠の上限値は apps/shared/constants/premium.ts の
--   FREE_PLAN_LIMITS.DAILY_TOKEN_LIMIT (現在 1) と同値の関数内定数として持つ
--   (二重管理。値がズレると挙動が分かれるため変更時は両方を揃えること)。
--
--   Premium は上限判定をバイパスするが、使用実績 (usage_count/
--   daily_tokens_used) は Free と同じく記録し続ける (既存 incrementScanCount /
--   scan-timesheet edge function が Free/Premium 問わず常に加算している実装と
--   整合させる)。
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."reserve_user_daily_usage"(
  "p_user_id" uuid,
  "p_app" "app_id",
  "p_usage_date" date
)
RETURNS TABLE("allowed" boolean, "is_premium" boolean, "tokens_used" integer)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_daily_limit CONSTANT integer := 1; -- FREE_PLAN_LIMITS.DAILY_TOKEN_LIMIT と同値 (二重管理)
  v_is_premium boolean;
  v_total_tokens integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id must not be null';
  END IF;

  -- (user_id, usage_date) 単位で直列化する。「その日まだ1行も無い」ケースは
  -- app_daily_usage に対象行が存在せず FOR UPDATE で行ロックできないため、
  -- advisory lock でユーザー×日付単位のクリティカルセクションを作る。
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_usage_date::text));

  -- checkIsPremium() (apps/shared/utils/premium.ts) と同一のロジック
  SELECT
    us.plan = 'premium'
    AND us.status IN ('active', 'trialing')
    AND (us.premium_expires_at IS NULL OR us.premium_expires_at > now())
  INTO v_is_premium
  FROM public.user_subscriptions us
  WHERE us.id = p_user_id;

  v_is_premium := COALESCE(v_is_premium, false);

  -- 全アプリ横断の当日トークン使用量 (usage.ts の getTodayTokensUsed と同じ集計)
  SELECT COALESCE(SUM(daily_tokens_used), 0) INTO v_total_tokens
  FROM public.app_daily_usage
  WHERE user_id = p_user_id AND usage_date = p_usage_date;

  IF NOT v_is_premium AND v_total_tokens >= v_free_daily_limit THEN
    RETURN QUERY SELECT false, v_is_premium, v_total_tokens;
    RETURN;
  END IF;

  INSERT INTO public.app_daily_usage (user_id, app, usage_date, usage_count, daily_tokens_used, last_used_at)
  VALUES (p_user_id, p_app, p_usage_date, 1, 1, now())
  ON CONFLICT (user_id, app, usage_date)
  DO UPDATE SET
    usage_count = app_daily_usage.usage_count + 1,
    daily_tokens_used = app_daily_usage.daily_tokens_used + 1,
    last_used_at = now();

  RETURN QUERY SELECT true, v_is_premium, v_total_tokens + 1;
END;
$$;

ALTER FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) IS
  '認証済みユーザーの無料枠判定 (全アプリ横断の daily_tokens_used SUM) と
app_daily_usage への加算を、(user_id, usage_date) 単位の pg_advisory_xact_lock で
直列化した上で原子的に行う。上限値と Premium 判定はいずれも関数内部で導出し、
呼び出し元から受け取らない (上限を外部から渡せる設計だと、万一 GRANT 設定を
誤って authenticated に開けてしまった場合に無料ユーザーが自己申告で無制限を
名乗れてしまうため)。service_role 限定。呼び出し元は verifyAuth 等で JWT 検証済み
の user_id のみを渡すこと。失敗時は release_user_daily_usage で解放すること。';

REVOKE ALL ON FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."reserve_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) TO "service_role";


CREATE OR REPLACE FUNCTION "public"."release_user_daily_usage"(
  "p_user_id" uuid,
  "p_app" "app_id",
  "p_usage_date" date
)
RETURNS void
LANGUAGE "plpgsql"
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id must not be null';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_usage_date::text));

  UPDATE public.app_daily_usage
  SET
    usage_count = GREATEST(usage_count - 1, 0),
    daily_tokens_used = GREATEST(daily_tokens_used - 1, 0),
    last_used_at = last_used_at
  WHERE user_id = p_user_id AND app = p_app AND usage_date = p_usage_date;
END;
$$;

ALTER FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) IS
  'reserve_user_daily_usage で加算した usage_count/daily_tokens_used を Gemini
呼び出し失敗時に GREATEST(x-1, 0) で減算する (負数にはならない)。authenticated には
一切開かない (C-1 で塞いだ「RPC を直接連打して daily_tokens_used を自己リセットする」
穴が再び開くため)。service_role 限定。呼び出し元は解放を高々1回に限定する冪等ガード
を持つこと。';

REVOKE ALL ON FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM "anon";
REVOKE ALL ON FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."release_user_daily_usage"("p_user_id" uuid, "p_app" "app_id", "p_usage_date" date) TO "service_role";
