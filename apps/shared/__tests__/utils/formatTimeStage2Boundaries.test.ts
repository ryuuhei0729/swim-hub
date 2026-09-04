/**
 * formatTime 小数第2位統一の境界値テスト
 *
 * Sprint Contract: GitHub Issue #13 Stage2 (swim-hub formatTime の桁数統一)
 *
 * 背景 (PM 裁定):
 *   `apps/shared/utils/time.ts` の `formatTime` は現在小数第1位までしか返さない。
 *   DB (`records.time numeric(10,2)` 等) は既に2桁精度を保持し、入力UI
 *   (useTimeInput) や mobile の `formatTime` は既に2桁で統一されている。
 *   一方 web の練習ログ表示パス (PracticeDetails.tsx / PracticeMenuItem.tsx /
 *   TeamPracticeDetailModal.tsx / TimeInputModal.tsx) だけが shared の1桁
 *   `formatTime` を経由しており、「入力時は2桁、保存後の一覧では1桁」という
 *   自己矛盾を起こしている (Issue #13 が見落とした最大の実害)。
 *   Stage2 では shared `formatTime` を2桁に統一する。scanner (OCR精度=1桁が
 *   正しい) と timer (既に2桁) は対象外。
 *
 *   負数の扱いは今スプリントでは変更しない: shared は 0 クランプを維持する
 *   (mobile の符号付き表示との差異は別債務として記録するに留める)。
 *
 * Sprint Contract 検証観点:
 *   [V-2-01] 0 → "0.00"
 *   [V-2-02] 1分未満 → "SS.mm" 形式 (分の接頭辞なし)
 *   [V-2-03] 1分以上 → "M:SS.mm" 形式 (例: "1:23.45")
 *   [V-2-04] 丸め: 小数第3位以降は四捨五入される (36.456 → "36.46")
 *   [V-2-05] 丸めで分が繰り上がる境界 (59.995 → "1:00.00")
 *   [V-2-06] 負数は0にクランプされる (今スプリントでは変更しない既存仕様の維持確認)
 *   [V-2-07] null/undefined (実行時にTS型を迂回して渡された場合) は "0.00" を返す
 *   [V-2-08] Infinity/NaN は "0.00" を返す
 *   [V-2-09] formatTime は既存の2桁フォーマッタ formatTimeBest と同じ丸め・
 *            分岐アルゴリズムで一致する (Stage2 実装後に formatTime と
 *            formatTimeBest が数値的に同一の出力になることを保証する)
 *
 * 現状 (Stage2 実装前): 本ファイルの全テストは red (formatTime が1桁のため)。
 * Stage2 実装 (formatTime を2桁化) 後に green になることを完了条件とする。
 *
 * トートロジー防止メモ:
 *   [V-2-09] は本物の `formatTimeBest` (既存の2桁実装、apps/shared/utils/time.ts)
 *   を import して `formatTime` と比較しており、期待値をテスト内で再実装していない。
 *   他の観点も期待値は手計算 (Math.round による四捨五入) で導出しており、
 *   formatTime の実装をコピーしたものではない。
 */
import { describe, expect, it } from "vitest";
import { formatTime, formatTimeBest } from "../../utils/time";

describe("[Stage2] formatTime — 小数第2位統一の境界値", () => {
  it("[V-2-01] 0秒は「0.00」を返す", () => {
    expect(formatTime(0)).toBe("0.00");
  });

  it("[V-2-02] 1分未満は分の接頭辞なしで小数第2位まで返す", () => {
    expect(formatTime(45.67)).toBe("45.67");
    expect(formatTime(5.12)).toBe("5.12");
  });

  it("[V-2-03] 1分以上は M:SS.mm 形式で返す (秒の2桁ゼロ埋めを含む)", () => {
    expect(formatTime(83.45)).toBe("1:23.45");
    expect(formatTime(65.0)).toBe("1:05.00");
  });

  it("[V-2-04] 小数第3位以降は四捨五入される", () => {
    // 36.456 → 100倍して四捨五入 → 3646 → 36.46
    expect(formatTime(36.456)).toBe("36.46");
  });

  it("[V-2-05] 四捨五入によって分が繰り上がる境界 (59.995 → 60.00 → 1:00.00)", () => {
    expect(formatTime(59.995)).toBe("1:00.00");
  });

  it("[V-2-06] 負数は0にクランプされる (今スプリントで変更しない既存仕様)", () => {
    expect(formatTime(-1)).toBe("0.00");
    expect(formatTime(-100.5)).toBe("0.00");
  });

  it("[V-2-07] null/undefined (実行時にTS型を迂回した場合) は「0.00」を返す", () => {
    expect(formatTime(null as unknown as number)).toBe("0.00");
    expect(formatTime(undefined as unknown as number)).toBe("0.00");
  });

  it("[V-2-08] Infinity/NaN は「0.00」を返す", () => {
    expect(formatTime(Infinity)).toBe("0.00");
    expect(formatTime(-Infinity)).toBe("0.00");
    expect(formatTime(NaN)).toBe("0.00");
  });

  it("[V-2-09] formatTime は formatTimeBest と数値的に同一の出力になる (2桁統一の実質的定義)", () => {
    const samples = [
      0, 0.01, 0.001, 5.12, 30.5, 36.456, 45.67, 59.94, 59.995, 60, 65.0, 65.42, 83.45, 125.5, 600,
      3599.995, -1, -100.5, Infinity, -Infinity, NaN,
    ];
    for (const seconds of samples) {
      expect(formatTime(seconds), `formatTime(${seconds})`).toBe(formatTimeBest(seconds));
    }
  });
});
