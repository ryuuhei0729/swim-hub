-- チームメンバーシップに承認ステータスを追加
-- status: pending (承認待ち), approved (承認済み), rejected (拒否)

-- ENUM型を作成（既に存在する場合はスキップ）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status_type') THEN
        CREATE TYPE "public"."membership_status_type" AS ENUM (
            'pending',
            'approved',
            'rejected'
        );
        ALTER TYPE "public"."membership_status_type" OWNER TO "postgres";
    END IF;
END $$;

-- team_membershipsテーブルにstatusカラムを追加（既に存在する場合はスキップ）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'team_memberships' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE "public"."team_memberships"
        ADD COLUMN "status" "public"."membership_status_type" DEFAULT 'pending'::"public"."membership_status_type";
    END IF;
END $$;

-- 既存データをapprovedに設定（is_active: trueのメンバーシップ）
-- statusカラムが存在する場合のみ実行
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'team_memberships' 
        AND column_name = 'status'
    ) THEN
        UPDATE "public"."team_memberships"
        SET "status" = 'approved'::"public"."membership_status_type"
        WHERE "is_active" = true AND "status" = 'pending'::"public"."membership_status_type";

        -- is_active: falseのメンバーシップはrejectedに設定（既に退会しているため）
        UPDATE "public"."team_memberships"
        SET "status" = 'rejected'::"public"."membership_status_type"
        WHERE "is_active" = false AND "status" = 'pending'::"public"."membership_status_type";

        -- statusカラムをNOT NULLに設定（既にNOT NULLの場合はスキップ）
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'team_memberships' 
            AND column_name = 'status'
            AND is_nullable = 'YES'
        ) THEN
            ALTER TABLE "public"."team_memberships"
            ALTER COLUMN "status" SET NOT NULL;
        END IF;
    END IF;
END $$;

-- インデックスを追加（承認待ちのクエリを高速化）
CREATE INDEX IF NOT EXISTS "idx_team_memberships_status" ON "public"."team_memberships" USING "btree" ("status");
CREATE INDEX IF NOT EXISTS "idx_team_memberships_team_status" ON "public"."team_memberships" USING "btree" ("team_id", "status");

-- 既存のRLSポリシーを削除して新しいポリシーで置き換え
DROP POLICY IF EXISTS "Users can view team memberships" ON "public"."team_memberships";

-- RLSポリシーを追加: チーム管理者は承認待ちリクエストを閲覧可能、メンバーは承認済みメンバーを閲覧可能
CREATE POLICY "Users can view team memberships" ON "public"."team_memberships"
FOR SELECT USING (
  ("user_id" = (SELECT "auth"."uid"()))
  OR
  public.is_team_admin("team_memberships"."team_id", (SELECT "auth"."uid"()))
  OR
  (
    "status" = 'approved'::"public"."membership_status_type"
    AND
    "is_active" = true
    AND
    public.is_team_member("team_memberships"."team_id", (SELECT "auth"."uid"()))
  )
  OR
  (
    EXISTS (
      SELECT 1
      FROM "public"."teams"
      WHERE (
        ("teams"."id" = "team_memberships"."team_id")
        AND
        ("teams"."created_by" = (SELECT "auth"."uid"()))
      )
    )
  )
);

-- コメントを追加
COMMENT ON COLUMN "public"."team_memberships"."status" IS 'メンバーシップの承認ステータス: pending=承認待ち, approved=承認済み, rejected=拒否';

-- usersテーブルのRLSポリシーを更新して、チーム管理者が承認待ちユーザー情報を閲覧できるようにする
DROP POLICY IF EXISTS "Users can view own profile and team members" ON "public"."users";

CREATE POLICY "Users can view own profile and team members" ON "public"."users"
FOR SELECT USING (
  ((SELECT "auth"."uid"()) = "id")
  OR
  public.shares_active_team("users"."id", (SELECT "auth"."uid"()))
  OR
  -- チーム管理者は承認待ちユーザー情報も閲覧可能
  EXISTS (
    SELECT 1
    FROM "public"."team_memberships" tm
    WHERE tm.user_id = "users"."id"
      AND tm.status = 'pending'::"public"."membership_status_type"
      AND public.is_team_admin(tm.team_id, (SELECT "auth"."uid"()))
  )
);

-- 承認待ちのメンバーシップから招待コードを取得するRPC関数
-- 自分のメンバーシップ（user_id = auth.uid()）の招待コードのみ取得可能
CREATE OR REPLACE FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid")
RETURNS "text"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_invite_code text;
BEGIN
  -- 認証チェック
  IF (SELECT "auth"."uid"()) IS NULL THEN
    RAISE EXCEPTION '認証が必要です';
  END IF;
  
  -- 自分のメンバーシップが存在するかチェック（承認待ちでも可）
  IF NOT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.team_id = p_team_id
      AND tm.user_id = (SELECT "auth"."uid"())
  ) THEN
    RAISE EXCEPTION 'チームへのアクセス権限がありません';
  END IF;
  
  -- 招待コードを取得
  SELECT t.invite_code INTO v_invite_code
  FROM public.teams t
  WHERE t.id = p_team_id
  LIMIT 1;
  
  RETURN v_invite_code;
END;
$$;

ALTER FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_invite_code_by_team_id"("p_team_id" "uuid") IS '承認待ちのメンバーシップからも招待コードを取得できる。自分のメンバーシップ（user_id = auth.uid()）が存在する場合のみ取得可能。';

