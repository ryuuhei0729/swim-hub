#!/usr/bin/env node
// =============================================================================
// ros:probe - ブロックが解除されたかを1リクエストだけで確認する
// =============================================================================
// 2026-08-20 に IP 単位で 403 ブロックされたため、解除の検知用。
// 回避行為はしない (UA 偽装・プロキシ・IP変更はしない)。
// 1回の実行でリクエストは1本だけ。キャッシュは汚さない。
// =============================================================================
import { API_BASE } from "../parser/parseResults";
import { log } from "./_shared";

async function main() {
  const url = `${API_BASE}/games?year=2026&game_status=5&page=1`;
  const startedAt = Date.now();

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.text();
    const quota = res.headers.get("x-ratelimit-remaining");

    log(`${new Date().toISOString()}  HTTP ${res.status}  body=${body.length}B  quota=${quota ?? "(なし)"}  ${Date.now() - startedAt}ms`);

    if (res.status === 200) {
      log("");
      log("ブロック解除。再開する場合は間隔を空けて少量ずつ:");
      log("  pnpm ros:crawl --year 2026 --games 100 --limit 150");
      log("(既定 6秒間隔 / 403が5回連続で自動中断)");
      process.exit(0);
    }

    log("まだブロック中。時間を置いて再確認してください。");
    process.exit(1);
  } catch (e) {
    log(`ネットワークエラー: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(2);
  }
}

main();
