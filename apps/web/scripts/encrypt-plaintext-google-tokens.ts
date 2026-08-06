/**
 * 既存の平文 Google Calendar リフレッシュトークンをアプリレベルで暗号化する
 * 一回限りのメンテナンススクリプト（本番DBを直接変更する。実行は人間の承認を得てから行うこと）
 *
 * ## 背景
 * supabase/migrations/20260209000000_fix_google_token_service_role.sql により、
 * DB側 (pgsodium) での暗号化は撤廃され、set_google_refresh_token / get_google_refresh_token は
 * 「暗号化済み文字列をそのまま保存 / 返す passthrough」になっている。暗号化責務は完全に
 * アプリ側 (apps/web/lib/encryption.ts の encrypt/decrypt/isEncrypted) にある。
 *
 * それ以前（あるいはアプリ側の暗号化漏れ）によって users.google_calendar_refresh_token に
 * 平文のまま保存された行が残っている可能性がある。読み出し側
 * apps/web/lib/google-calendar-auth.ts が isEncrypted(token) ? decrypt(token) : token という
 * 分岐を持つのはそのため。本スクリプトはその平文行を暗号化して正規化する。
 *
 * ## デプロイ順序 (重要・厳守すること)
 *   1. 先に apps/web/app/api/auth/callback/route.ts の暗号化修正
 *      (handleCalendarConnection で set_google_refresh_token 呼び出し前に encrypt() を通す修正)
 *      をデプロイする
 *   2. その後にこのスクリプトを実行する
 *
 * 逆順（このスクリプトを先に実行し、その後にコード修正をデプロイ）で行うと、
 * このスクリプトが平文行を暗号化した直後に、未修正のコード (旧 handleCalendarConnection) が
 * ログイン時に再度 provider_refresh_token を平文のまま書き込んでしまう競合窓が生じる。
 * 「コード修正を先にデプロイ → 移行スクリプトを実行」の順序を必ず守ること。
 *
 * ## 使い方
 *   cd apps/web
 *   pnpm exec dotenvx run -f .env.local -- npx tsx scripts/encrypt-plaintext-google-tokens.ts [--dry-run]
 *
 * ## 必要な環境変数
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - TOKEN_ENCRYPTION_KEY
 *
 * ## オプション
 *   --dry-run    実際には書き込まず、対象件数と対象ユーザーIDのみ表示する
 *
 * ## 冪等性
 * 対象は `google_calendar_refresh_token IS NOT NULL` かつ isEncrypted() が false の行のみ。
 * 既に暗号化済みの行 (enc:v1: プレフィックス) は対象から除外されるため、
 * 複数回実行しても安全（再暗号化されない）。
 */
import { createClient } from "@supabase/supabase-js";
import { encrypt, isEncrypted } from "../lib/encryption";
import type { Database } from "../../shared/types/supabase-schema";

const PAGE_SIZE = 500;

const isDryRun = process.argv.slice(2).includes("--dry-run");

type TargetRow = {
  id: string;
  google_calendar_refresh_token: string;
};

function checkEnvVars(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TOKEN_ENCRYPTION_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("以下の環境変数が設定されていません:");
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
  }
}

function getServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * google_calendar_refresh_token が NULL でない行をページングで全件取得し、
 * isEncrypted() が false（= 平文）の行だけを対象として絞り込む
 */
async function findPlaintextTokenRows(
  supabase: ReturnType<typeof getServiceRoleClient>,
): Promise<TargetRow[]> {
  const targets: TargetRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("users")
      .select("id, google_calendar_refresh_token")
      .not("google_calendar_refresh_token", "is", null)
      // ORDER BY を明示しないと Postgres はページ間で行順を保証しない。
      // 本番実行中に他ユーザーのログイン (INSERT/UPDATE) が走ると行がページを跨いで
      // シフトし、対象行を取りこぼす (再実行で拾えるとはいえ「全件処理した」という
      // 実行結果が不正確になる)。id で安定ソートする。
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`users テーブルの取得に失敗しました: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      if (row.google_calendar_refresh_token && !isEncrypted(row.google_calendar_refresh_token)) {
        targets.push({
          id: row.id,
          google_calendar_refresh_token: row.google_calendar_refresh_token,
        });
      }
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return targets;
}

/**
 * 1行を暗号化して set_google_refresh_token RPC で保存する
 * （書き込みは既存の RPC 経路を使い、users テーブルへの直接 UPDATE は行わない）
 */
async function encryptRow(
  supabase: ReturnType<typeof getServiceRoleClient>,
  row: TargetRow,
): Promise<{ success: boolean; error?: string }> {
  let encrypted: string;
  try {
    encrypted = encrypt(row.google_calendar_refresh_token);
  } catch (err) {
    return { success: false, error: `暗号化に失敗: ${String(err)}` };
  }

  const { error } = await supabase.rpc("set_google_refresh_token", {
    p_user_id: row.id,
    p_token: encrypted,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

async function main() {
  console.log("=".repeat(60));
  console.log("Google Calendar 平文リフレッシュトークン暗号化スクリプト");
  console.log("=".repeat(60));

  if (isDryRun) {
    console.log("ドライランモード: 実際の書き込みは行いません");
  }

  checkEnvVars();

  const supabase = getServiceRoleClient();

  console.log("\n平文トークンを検索中...");
  const targets = await findPlaintextTokenRows(supabase);
  console.log(`対象件数: ${targets.length} 件`);

  if (targets.length === 0) {
    console.log("\n対象がありません。処理を終了します。");
    return;
  }

  if (isDryRun) {
    console.log("\n対象ユーザーID:");
    targets.forEach((row) => console.log(`  - ${row.id}`));
    console.log("\nドライラン完了。実際に暗号化するには --dry-run を外して実行してください");
    return;
  }

  let succeeded = 0;
  let failed = 0;
  const failures: { userId: string; error: string }[] = [];

  for (const row of targets) {
    const result = await encryptRow(supabase, row);
    if (result.success) {
      succeeded++;
      process.stdout.write(".");
    } else {
      failed++;
      failures.push({ userId: row.id, error: result.error ?? "unknown error" });
      process.stdout.write("x");
    }
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("実行結果サマリー");
  console.log("=".repeat(60));
  console.log(`  対象件数: ${targets.length}`);
  console.log(`  成功: ${succeeded}`);
  console.log(`  失敗: ${failed}`);

  if (failures.length > 0) {
    console.log("\n失敗した行:");
    failures.forEach(({ userId, error }) => console.log(`  - ${userId}: ${error}`));
    process.exit(1);
  }

  console.log("\n暗号化が正常に完了しました");
}

main().catch((err) => {
  console.error("予期しないエラー:", err);
  process.exit(1);
});
