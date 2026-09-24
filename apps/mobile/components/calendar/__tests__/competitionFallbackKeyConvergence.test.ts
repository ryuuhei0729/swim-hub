/**
 * competitionFallbackKeyConvergence.test.ts
 *
 * Reviewer Critical 対応 (作業2: 継ぎ目の再発防止ガード)
 *
 * 背景: 大会名未入力時のフォールバック文言 (「大会」) が、DayDetailModal を共有する
 * 4経路 (ダッシュボードのカレンダーチップ / DayDetailModal のエントリー・記録カード見出し /
 * 大会タブの記録タップ / 大会タブのエントリー済みタップ) で異なる i18n キーを使っていた
 * (`teams.mobile.fallbackCompetitionName` と `competition.client.competitionFallback` の
 * 混在)。ja では両キーとも解決結果が同一文字列 ("大会") のため、レンダリング結果の
 * 文字列比較ではこの不一致を検出できない (実際に検出できなかった実績: QA が一度
 * 「解決結果を直接assert」する形で書いたテストが機能しておらず、Reviewer の再レビューで
 * Critical として指摘された)。
 *
 * 検証観点:
 *   [G-3] CalendarDay.tsx / DayDetailModal.tsx / RecordsScreen.tsx の3ファイルが
 *         いずれも `competition.client.competitionFallback` を使用し、
 *         旧キー `teams.mobile.fallbackCompetitionName` を一切参照しない
 *
 * テスト方針:
 *   実行時の t() 呼び出しをコンポーネントごとに再現するには4経路それぞれに個別の
 *   モック基盤(react-navigation, react-query, supabase等)が必要で、変更のたびに
 *   壊れやすい。代わりに、ソースファイルをテキストとして読み込み「どちらのキー文字列が
 *   書かれているか」だけを機械的に確認するメタテストにする
 *   (DayDetailModal.flexibleModalHeight.test.tsx の [V-FLEX-09] と同一手法。
 *   プロダクションのロジックを再実装するのではなく「不在/存在」の有無だけを問う)。
 *
 * トートロジー防止メモ:
 *   期待するキー名は Reviewer 指摘・PM 裁定 (「大会タブ・ダッシュボード・DayDetailModal の
 *   全経路で competition.client.competitionFallback に統一する」) から直接引用したもので
 *   あり、対象ソースの実装を読んでその場でコピーしたものではない。
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const CALENDAR_DAY_SRC = readFileSync(
  path.join(__dirname, "..", "CalendarDay.tsx"),
  "utf-8",
);
const DAY_DETAIL_MODAL_SRC = readFileSync(
  path.join(__dirname, "..", "DayDetailModal", "DayDetailModal.tsx"),
  "utf-8",
);
const RECORDS_SCREEN_SRC = readFileSync(
  path.join(__dirname, "..", "..", "..", "screens", "RecordsScreen.tsx"),
  "utf-8",
);

const CURRENT_KEY = "competition.client.competitionFallback";
const STALE_KEY = "teams.mobile.fallbackCompetitionName";

const SOURCES: Array<[string, string]> = [
  ["CalendarDay.tsx (ダッシュボードのカレンダーチップ)", CALENDAR_DAY_SRC],
  ["DayDetailModal.tsx (エントリー・記録カード見出し)", DAY_DETAIL_MODAL_SRC],
  ["RecordsScreen.tsx (大会タブの記録タップ/エントリー済みタップ)", RECORDS_SCREEN_SRC],
];

describe("[G-3] 大会名フォールバックの i18n キーが4経路で1つに収束していること", () => {
  it.each(SOURCES)("%s は現行キーを使用している", (label, src) => {
    expect(src, `${label} に "${CURRENT_KEY}" が見つからない`).toContain(CURRENT_KEY);
  });

  it.each(SOURCES)("%s は旧キーを一切参照していない", (label, src) => {
    expect(src, `${label} に旧キー "${STALE_KEY}" が残っている`).not.toContain(STALE_KEY);
  });

  it(
    "RecordsScreen.tsx は現行キーを2箇所(記録タップ経由/エントリー済みタップ経由)で" +
      "使用している (どちらか一方だけ書き換えて継ぎ目を再発させていないか)",
    () => {
      const occurrences = RECORDS_SCREEN_SRC.split(CURRENT_KEY).length - 1;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    },
  );
});
