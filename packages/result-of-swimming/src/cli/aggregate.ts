#!/usr/bin/env node
// =============================================================================
// ros:aggregate - RawRace -> RacePaceModel
// =============================================================================
// 例:
//   pnpm ros:aggregate --min-samples 30
//   pnpm ros:aggregate --min-samples 1 --age-mode school_class
// =============================================================================
import { writeFileSync } from "node:fs";
import { formatMsToTime, generateTargetLaps, TIME_BUCKET_CONFIG } from "@shared/racePace";
import { aggregate, DEFAULT_MIN_SAMPLE_COUNT } from "../aggregation/aggregate";
import { paths } from "../config";
import { parseArgs } from "node:util";
import { log, store } from "./_shared";

const { values } = parseArgs({
  options: {
    "min-samples": { type: "string", default: String(DEFAULT_MIN_SAMPLE_COUNT) },
    "age-mode": { type: "string", default: "all" },
    // bucket 幅の倍率。1=既定(100mで0.5秒)、2=1.0秒、4=2.0秒。
    // 広げるとモデル数(カバレッジ)は増えるが、タイム帯の解像度は落ちる。
    "bucket-scale": { type: "string", default: "1" },
  },
  allowPositionals: true,
});

const minSampleCount = Number(values["min-samples"]);
const ageCategoryMode = values["age-mode"] === "school_class" ? "school_class" : "all";

const bucketScale = Number(values["bucket-scale"]);
const bucketConfig = Object.fromEntries(
  Object.entries(TIME_BUCKET_CONFIG).map(([d, w]) => [Number(d), Math.round(w * bucketScale)]),
);

const races = store().readAll();
log(`入力: ${races.length} 件`);
if (races.length === 0) {
  log("先に pnpm ros:crawl を実行してください");
  process.exit(0);
}

const models = aggregate(races, { minSampleCount, ageCategoryMode, bucketConfig });
writeFileSync(paths.models, JSON.stringify(models, null, 2) + "\n");

log(`minSampleCount=${minSampleCount} ageCategoryMode=${ageCategoryMode} bucketScale=${bucketScale}`);
log(`生成モデル: ${models.length} 件 -> ${paths.models}`);

if (models.length === 0) {
  log("");
  log(`※ 0件でした。サンプルが閾値に届いていません。--min-samples を下げるか取得量を増やしてください。`);
  process.exit(0);
}

log("");
log("=== 生成されたモデル (上位10件) ===");
for (const m of models.slice(0, 10)) {
  const pool = m.poolType === 1 ? "長水路" : "短水路";
  log(
    `  ${m.gender === "male" ? "男子" : "女子"} ${pool} ${m.distance}m ${m.stroke} ` +
      `[${formatMsToTime(m.minTimeMs)}〜${formatMsToTime(m.maxTimeMs)}] n=${m.sampleCount}`,
  );
}

// 代表的なモデルで理想LAPを1本出して、通ることを目で確認できるようにする
const demo = models.find((m) => m.distance === 100 && m.stroke === "Fr") ?? models[0];
if (!demo) {
  // 48行目で models.length === 0 の場合は既に process.exit(0) 済みのため
  // ここに来る場合 models[0] は必ず存在するが、防御的にガードする
  throw new Error("aggregate: unreachable — models should be non-empty here");
}
const target = demo.centerTimeMs;
const out = generateTargetLaps({ targetTimeMs: target, model: demo });
log("");
log(
  `=== 理想LAP例: ${demo.gender === "male" ? "男子" : "女子"} ` +
    `${demo.poolType === 1 ? "長水路" : "短水路"} ${demo.distance}m ${demo.stroke} ` +
    `目標 ${formatMsToTime(target)} (n=${out.sampleCount}) ===`,
);
for (const lap of out.laps) {
  log(`  ${String(lap.distance).padStart(4)}m  ${formatMsToTime(lap.cumulativeTimeMs).padStart(8)}  (区間 ${formatMsToTime(lap.lapTimeMs)})`);
}
const sum = out.laps.reduce((a, l) => a + l.lapTimeMs, 0);
log(`  合計 = ${sum}ms / 目標 = ${target}ms  ${sum === target ? "一致" : "不一致!"}`);
