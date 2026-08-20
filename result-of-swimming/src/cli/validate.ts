#!/usr/bin/env node
// =============================================================================
// ros:validate - 保存済み RawRace のクレンジング結果を集計する
// =============================================================================
import { paths } from "../config";
import { isAggregatable } from "../aggregation/aggregate";
import { log, store } from "./_shared";

const races = store().readAll();
log(`対象: ${races.length} 件 (${paths.races})`);
if (races.length === 0) {
  log("先に pnpm ros:crawl を実行してください");
  process.exit(0);
}

const byStatus = new Map<string, number>();
for (const r of races) byStatus.set(r.validationStatus, (byStatus.get(r.validationStatus) ?? 0) + 1);

log("");
log("=== validationStatus 別 ===");
for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
  log(`  ${status.padEnd(20)} ${String(count).padStart(6)}  (${((count / races.length) * 100).toFixed(1)}%)`);
}

const relay = races.filter((r) => r.isRelay).length;
const usable = races.filter(isAggregatable).length;
log("");
log(`リレー (集計対象外): ${relay} 件`);
log(`集計に使える: ${usable} 件 (${((usable / races.length) * 100).toFixed(1)}%)`);

log("");
log("=== 除外理由の例 ===");
const shown = new Set<string>();
for (const r of races) {
  if (r.validationStatus === "valid" || shown.has(r.validationStatus)) continue;
  shown.add(r.validationStatus);
  log(`  [${r.validationStatus}] ${r.validationReason}`);
}
