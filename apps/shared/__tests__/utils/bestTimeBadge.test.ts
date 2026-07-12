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
  computeListPreviousBest,
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
