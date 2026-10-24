// =============================================================================
// bestTimeBadge.test.ts - 一覧ベストバッジ判定ユーティリティのテスト
// =============================================================================
// computeListPreviousBest は per-record クエリ版 (PostgREST の
// `.lt("competition.date", ...)` / `.lt("created_at", ...)` / `.neq("id", ...)`)
// と同一の判定をメモリ上で再現する。web/mobile の一覧 BestTimeBadge が共用する。
// =============================================================================

import { describe, expect, it } from "vitest";
import type { ListBestCandidates } from "../../api/records";
import {
  BEST_EPSILON,
  NEW_RECORD_DAYS,
  computeListPreviousBest,
  formatBestDelta,
  getBestBadgeState,
  isNewRecord,
  normalizeRecordDateForBulkComparison,
} from "../../utils/bestTimeBadge";

function candidates(partial: Partial<ListBestCandidates> = {}): ListBestCandidates {
  return { competitionRows: [], bulkRows: [], ...partial };
}

describe("normalizeRecordDateForBulkComparison", () => {
  it("YYYY-MM-DD を当日 00:00:00.000Z に拡張する", () => {
    expect(normalizeRecordDateForBulkComparison("2025-03-01")).toBe("2025-03-01T00:00:00.000Z");
  });

  it("ISO タイムスタンプはそのまま返す", () => {
    expect(normalizeRecordDateForBulkComparison("2025-03-01T10:00:00.000Z")).toBe(
      "2025-03-01T10:00:00.000Z",
    );
  });
});

describe("computeListPreviousBest", () => {
  it("大会/一括の候補から自己除外・日付フィルタ済みの min を返す", () => {
    const cand = candidates({
      competitionRows: [
        { id: "record-1", time: 50.0, date: "2025-02-01" }, // 自分自身 → 除外
        { id: "c1", time: 55.0, date: "2025-02-01" },
        { id: "c2", time: 54.0, date: "2025-03-01" }, // 記録日と同日 → 除外 (厳密に前のみ)
      ],
      bulkRows: [
        { id: "b1", time: 53.0, created_at: "2025-02-15T00:00:00.000Z" },
        { id: "b2", time: 52.0, created_at: "2025-03-01T00:00:00.000Z" }, // 正規化境界 (>=) → 除外
      ],
    });

    expect(computeListPreviousBest(cand, "record-1", "2025-03-01")).toBe(53.0);
  });

  it("一括側の自分自身も除外される", () => {
    const cand = candidates({
      bulkRows: [{ id: "record-1", time: 40.0, created_at: "2025-02-15T00:00:00.000Z" }],
    });

    expect(computeListPreviousBest(cand, "record-1", "2025-03-01")).toBeNull();
  });

  it("recordDate が ISO タイムスタンプのとき大会側は日付部分で比較し一括側はミリ秒で比較する", () => {
    const cand = candidates({
      competitionRows: [
        // PostgREST の date キャストと同じく同日 (2025-03-01) は除外される
        { id: "c1", time: 55.0, date: "2025-03-01" },
      ],
      bulkRows: [
        // タイムスタンプ比較では 10:00 より前なので候補に含まれる
        { id: "b1", time: 57.0, created_at: "2025-03-01T09:59:59.000Z" },
      ],
    });

    expect(computeListPreviousBest(cand, "record-1", "2025-03-01T10:00:00.000Z")).toBe(57.0);
  });

  it("候補が空のとき null（その時点で初記録）を返す", () => {
    expect(computeListPreviousBest(candidates(), "record-1", "2025-03-01")).toBeNull();
  });
});

// =============================================================================
// getBestBadgeState / formatBestDelta - 2026-07-22 Sprint 新規
// web/mobile の一覧 BestTimeBadge が共用する「初/Best-X.XX/Best+X.XX」3状態判定。
// 「Best」「±」はASCII固定・i18n しない（i18n されるのは「初」のみ、common.bestBadge.first）。
// =============================================================================

describe("BEST_EPSILON", () => {
  it("web components/share/utils.ts / mobile BestTimeBadge.tsx の BEST_EPSILON と同値(0.005)である", () => {
    expect(BEST_EPSILON).toBe(0.005);
  });
});

describe("formatBestDelta", () => {
  it("改善(現在 < 過去ベスト)のとき 'Best-X.XX' 形式(マイナス符号)を返す", () => {
    expect(formatBestDelta(58.77, 60.0)).toBe("Best-1.23");
  });

  it("悪化(現在 > 過去ベスト)のとき 'Best+X.XX' 形式(プラス符号)を返す", () => {
    expect(formatBestDelta(62.5, 60.0)).toBe("Best+2.50");
  });

  it("完全同値のとき 'Best±0.00' を返す", () => {
    expect(formatBestDelta(60.0, 60.0)).toBe("Best±0.00");
  });

  it("BEST_EPSILON(0.005)未満の悪化(0.004)は 'Best±0.00' 扱い", () => {
    // NOTE: `60.0 + BEST_EPSILON` のような浮動小数点演算でちょうど 0.005 を作ろうとすると
    // IEEE754 の丸め誤差で 0.005000000000002558 のようにわずかに超過し、意図と異なり
    // slower 判定になってしまう。境界値テストは丸め誤差の影響を受けない明確に
    // epsilon 未満/超過の値(0.004 / 0.01)で行う。
    expect(formatBestDelta(60.004, 60.0)).toBe("Best±0.00");
  });

  it("BEST_EPSILON をわずかに超える悪化(0.01)は 'Best+0.01' になる", () => {
    expect(formatBestDelta(60.01, 60.0)).toBe("Best+0.01");
  });

  it("BEST_EPSILON をわずかに超える改善側も符号付きで正しく丸められる", () => {
    expect(formatBestDelta(124.0, 125.0)).toBe("Best-1.00");
  });

  it("「Best」「±」がASCII固定であること(いかなる delta でも接頭辞が変わらない)", () => {
    expect(formatBestDelta(58.77, 60.0)).toMatch(/^Best-/);
    expect(formatBestDelta(62.5, 60.0)).toMatch(/^Best\+/);
    expect(formatBestDelta(60.0, 60.0)).toMatch(/^Best±/);
  });
});

describe("getBestBadgeState", () => {
  it("time<=0 のとき isFirstRecord/previousBest に関係なく最優先で none を返す(誤表示防止)", () => {
    expect(getBestBadgeState(0, 55.0, true)).toEqual({ kind: "none" });
    expect(getBestBadgeState(0, null, true)).toEqual({ kind: "none" });
    expect(getBestBadgeState(-1, 55.0, false)).toEqual({ kind: "none" });
  });

  it("time が非有限(NaN/Infinity)のとき none を返す", () => {
    expect(getBestBadgeState(NaN, 55.0, false)).toEqual({ kind: "none" });
    expect(getBestBadgeState(Infinity, 55.0, false)).toEqual({ kind: "none" });
  });

  it("isFirstRecord=true(かつ time>0)のとき previousBest に関係なく first を返す", () => {
    expect(getBestBadgeState(60.0, null, true)).toEqual({ kind: "first" });
    expect(getBestBadgeState(60.0, 55.0, true)).toEqual({ kind: "first" });
  });

  it("previousBest が null で isFirstRecord=false のとき none を返す(判定不能)", () => {
    expect(getBestBadgeState(60.0, null, false)).toEqual({ kind: "none" });
  });

  it("previousBest より速い(改善)とき best + 'Best-X.XX' ラベルを返す", () => {
    expect(getBestBadgeState(58.77, 60.0, false)).toEqual({ kind: "best", label: "Best-1.23" });
  });

  it("previousBest と完全同値のとき best + 'Best±0.00' ラベルを返す(悪化ではなくベスト扱い)", () => {
    expect(getBestBadgeState(60.0, 60.0, false)).toEqual({ kind: "best", label: "Best±0.00" });
  });

  it("BEST_EPSILON(0.005)未満の悪化(0.004)は best + 'Best±0.00' 扱い", () => {
    expect(getBestBadgeState(60.004, 60.0, false)).toEqual({
      kind: "best",
      label: "Best±0.00",
    });
  });

  it("previousBest より遅い(BEST_EPSILON超の悪化)とき slower + 'Best+X.XX' ラベルを返す", () => {
    expect(getBestBadgeState(62.5, 60.0, false)).toEqual({ kind: "slower", label: "Best+2.50" });
    // 境界: epsilon をわずかに超える悪化は slower
    expect(getBestBadgeState(60.01, 60.0, false)).toEqual({ kind: "slower", label: "Best+0.01" });
  });
});

// =============================================================================
// isNewRecord — New バッジ / 赤文字の判定軸は「大会実施日」であること
// =============================================================================
describe("isNewRecord", () => {
  // 判定を実時刻から切り離すため now を明示注入する
  const now = new Date("2026-09-05T09:00:00+09:00");

  it("大会実施日が当日なら New", () => {
    expect(isNewRecord("2026-09-05", now)).toBe(true);
  });

  it("大会実施日から NEW_RECORD_DAYS(30日) 経過した日は New (境界の内側)", () => {
    expect(NEW_RECORD_DAYS).toBe(30);
    expect(isNewRecord("2026-08-06", now)).toBe(true);
  });

  it("大会実施日から31日経過した記録は New ではない (境界の外側)", () => {
    expect(isNewRecord("2026-08-05", now)).toBe(false);
  });

  it("何年も前の大会の記録は New ではない", () => {
    expect(isNewRecord("2020-01-01", now)).toBe(false);
  });

  it("一括登録 (competition なし = null/undefined) は常に New ではない", () => {
    expect(isNewRecord(null, now)).toBe(false);
    expect(isNewRecord(undefined, now)).toBe(false);
    expect(isNewRecord("", now)).toBe(false);
  });

  it("パースできない日付文字列は New ではない (isValid ガード)", () => {
    expect(isNewRecord("not-a-date", now)).toBe(false);
  });

  it("未来日の大会は「大会日からまだ30日経っていない」ため New", () => {
    expect(isNewRecord("2026-10-01", now)).toBe(true);
  });
});
