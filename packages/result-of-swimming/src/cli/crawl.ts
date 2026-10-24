#!/usr/bin/env node
// =============================================================================
// ros:crawl - Result of Swimming から取得する
// =============================================================================
// 例:
//   npm run ros:crawl -- --year 2026 --games 1 --limit 10    # まず少しだけ
//   npm run ros:crawl -- --year 2026 --games 5 --limit 200
//
// --limit は「結果リクエスト数」の上限で、段階的に増やすための安全弁。
// 取得済み URL はキャッシュから返るため、何度実行しても取り直さない
// (= 途中で止めても、次回は続きから進む)。
// =============================================================================
import { parseArgs } from "node:util";
import { crawl } from "../crawler/crawl";
import { CRAWL_DEFAULTS, paths } from "../config";
import { journal, log, makeClient, store } from "./_shared";

async function main() {
  const { values } = parseArgs({
    options: {
      year: { type: "string", default: String(new Date().getFullYear()) },
      games: { type: "string", default: "1" },
      limit: { type: "string", default: "10" },
    },
    allowPositionals: true,
  });

  const year = Number(values.year);
  const gameLimit = Number(values.games);
  const resultRequestLimit = Number(values.limit);

  const raceStore = store();
  const seen = raceStore.existingIds();

  log(`年度=${year} 大会上限=${gameLimit} 結果リクエスト上限=${resultRequestLimit}`);
  log(`保存済み=${seen.size} 件 / 出力先=${paths.races}`);
  log("");

  const summary = await crawl({
    client: makeClient(),
    journal: journal(),
    year,
    gameLimit,
    resultRequestLimit,
    consecutiveBlockLimit: CRAWL_DEFAULTS.consecutiveBlockLimit,
    onProgress: log,
    onRaces: (races) => {
      const fresh = races.filter((r) => !seen.has(r.sourceRaceId));
      for (const r of fresh) seen.add(r.sourceRaceId);
      return raceStore.append(fresh);
    },
  });

  log("");
  log("=== 取得結果 ===");
  log(`大会 (一覧で見た数 / 実際に辿った数): ${summary.gamesSeen} / ${summary.gamesCrawled}`);
  log(`結果リクエスト数: ${summary.resultRequests}`);
  log(`集約heat使用: ${summary.aggregateHeatsUsed} 回 / 個別heat: ${summary.individualHeatsUsed} 回`);
  log(`パースしたレース: ${summary.racesParsed} 件 (新規保存 ${summary.racesStored} 件)`);
  log(`取得失敗: ${summary.fetchFailures} 件`);
  log(`残クォータ: ${summary.quotaRemaining ?? "不明"}`);
  if (summary.blocked) {
    log("");
    log("※ 403 が連続したためブロックと判断して中断しました。");
    log("  回避策は取らず、時間を置いて再実行してください。");
  }
  if (summary.resultRequests >= resultRequestLimit) {
    log("");
    log(`※ --limit ${resultRequestLimit} に達して打ち切りました。`);
    log("  続けるには --limit を上げて再実行してください (取得済みは再取得しません)。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
