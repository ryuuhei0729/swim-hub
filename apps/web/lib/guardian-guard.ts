/**
 * 保護者アカウント (team_memberships.role = guardian) の書き込みを API ルートで止める。
 *
 * DB 側は supabase/migrations/20261129000000_add_guardian_role.sql のトリガで
 * 保護者の書き込みを拒否しているが、API ルートは service_role (createAdminClient) で
 * 書き込むため JWT の sub が無く、トリガでは止まらない。
 * 書き込み・外部サービス操作をする API ルートは、ユーザー認証の直後に
 * rejectIfGuardian(user.id) を呼び、結果が null でなければそのまま返すこと。
 */
import { NextResponse } from "next/server";
import { GUARDIAN_ROLE } from "@apps/shared/types";
import { createAdminClient } from "./supabase-server";

/** 保護者アカウントか (承認済み・現役の guardian membership があるか)。DB の is_guardian_user と同じ条件 */
export async function isGuardianUser(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("team_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("role", GUARDIAN_ROLE)
    .eq("status", "approved")
    .eq("is_active", true)
    .limit(1);
  // 判定できないときは通さない (呼び出し側の try/catch で 500 になる)
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export function guardianForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: "保護者アカウントではこの操作はできません", code: "GUARDIAN_READ_ONLY" },
    { status: 403 },
  );
}

/** 保護者なら 403 のレスポンスを返す。保護者でなければ null */
export async function rejectIfGuardian(userId: string): Promise<NextResponse | null> {
  return (await isGuardianUser(userId)) ? guardianForbiddenResponse() : null;
}
