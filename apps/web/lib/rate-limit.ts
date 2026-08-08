import "server-only";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * IP アドレスを SHA-256 でハッシュ化する。
 * 生 IP を DB に保存しないためのプライバシー配慮。Cloudflare Workers ランタイム
 * の Web Crypto (crypto.subtle) を使用するため Node.js の `crypto` モジュールは
 * 使わない (scanner の lib/rate-limit.ts の hashIp と同型)。
 */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 今日の日付を JST (Asia/Tokyo) の YYYY-MM-DD で返す。
 * scanner の apps/shared/utils/date.ts の getTodayJST と同型 (swim-hub 側には
 * 対応する共有ユーティリティが無いため、この用途専用にローカルで持つ)。
 */
function getTodayJST(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, "0");
  const day = String(jst.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * /api/contact の IP 単位の日次送信枠を原子的に予約する。
 *
 * 原子性の実体は Postgres 側 (reserve_contact_submission RPC, service_role
 * 限定) にある。単一の `INSERT ... ON CONFLICT DO UPDATE ... WHERE count <
 * limit` 文が行ロックを取りながら判定と加算を同時に行うため、並行リクエスト
 * の一方はもう一方の更新完了を待ってから自分の判定を行う (Cloudflare KV の
 * get→put 方式のような TOCTOU は発生しない)。
 *
 * IP は呼び出し前に SHA-256 でハッシュ化してから渡す (DB には生 IP を保存
 * しない。既存の ip_address カラムへの生IP保存とは別経路)。
 * release は無い (Gemini のような外部コスト呼び出しが無いため)。
 */
export async function reserveContactSubmission(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createAdminClient();
  const ipHash = await hashIp(ip);
  const usageDate = getTodayJST();

  const { data, error } = await supabase
    .rpc("reserve_contact_submission", {
      p_ip_hash: ipHash,
      p_usage_date: usageDate,
    })
    .single();

  if (error) {
    console.error("reserve_contact_submission failed:", error);
    throw error;
  }

  const row = data as { allowed: boolean; remaining: number } | null;
  return { allowed: row?.allowed ?? false, remaining: row?.remaining ?? 0 };
}
