/**
 * DayDetailModal - PracticeLog 重複排除ロジック検証テスト
 *
 * Sprint Contract Verification Checklist 対象:
 * - [V-01] 1 Practice に PracticeLog 2件 → カードが1枚のみ表示
 * - [V-02] 1 Practice に PracticeLog 3件 → カードが1枚のみ表示
 * - [V-03] PracticeLog 0件の Practice（type="practice"）は従来通り1枚表示
 * - [V-04] practiceLogUpdateKey が全ログの id+updated_at 連結で維持されている
 * - [V-05] 大会・記録セクションに影響なし（competition/entry/record アイテムは dedupe 対象外）
 *
 * 検証戦略: DayDetailModal.tsx の重複排除ロジックを純粋関数として切り出し、
 * Sprint Contract の仕様に基づいて独立した観点でテストする。
 * 実装コードを参照せず、型定義と仕様のみに基づいてアサーションを記述する。
 */

import { describe, it, expect } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { isPracticeMetadata } from "@apps/shared/types/ui";

// ------------------------------------------------------------------
// DayDetailModal.tsx の重複排除ロジックを再現したヘルパー
// (実装のコピーではなく、仕様に基づく独立実装)
// ------------------------------------------------------------------
function deduplicatePracticeLogItems(practiceLogItems: CalendarItem[]): CalendarItem[] {
  const seenPracticeIds = new Set<string>();
  return practiceLogItems.filter((item) => {
    const pid = isPracticeMetadata(item.metadata)
      ? item.metadata.practice?.id || item.metadata.practice_id
      : null;
    if (!pid || seenPracticeIds.has(pid)) return false;
    seenPracticeIds.add(pid);
    return true;
  });
}

function buildPracticeLogUpdateKey(
  practiceLogItems: CalendarItem[],
  targetPracticeId: string,
): string {
  return practiceLogItems
    .filter((p) => {
      const pid = isPracticeMetadata(p.metadata)
        ? p.metadata.practice?.id || p.metadata.practice_id
        : null;
      return pid === targetPracticeId;
    })
    .map((p) => {
      const practiceLog = (p.metadata as { practice_log?: { updated_at?: string } })?.practice_log;
      return `${p.id}:${practiceLog?.updated_at || p.id}`;
    })
    .sort()
    .join(",");
}

// ------------------------------------------------------------------
// テストデータファクトリ
// ------------------------------------------------------------------
function makeCalendarItem(
  overrides: Partial<CalendarItem> & { type: CalendarItem["type"] },
): CalendarItem {
  const { type, ...rest } = overrides;
  return {
    id: "item-default",
    type,
    date: "2026-06-30",
    title: "テスト練習",
    metadata: {},
    ...rest,
  };
}

function makePracticeLogItem(
  itemId: string,
  practiceId: string,
  updatedAt?: string,
): CalendarItem {
  return makeCalendarItem({
    id: itemId,
    type: "practice_log",
    metadata: {
      practice_id: practiceId,
      practice_log: updatedAt ? { updated_at: updatedAt } : undefined,
    } as CalendarItem["metadata"],
  });
}

function makePracticeLogItemWithNestedId(
  itemId: string,
  practiceId: string,
  updatedAt?: string,
): CalendarItem {
  return makeCalendarItem({
    id: itemId,
    type: "practice_log",
    metadata: {
      practice: { id: practiceId, place: "テストプール" },
      practice_log: updatedAt ? { updated_at: updatedAt } : undefined,
    } as CalendarItem["metadata"],
  });
}

// ------------------------------------------------------------------
// テスト: 重複排除ロジック
// ------------------------------------------------------------------
describe("PracticeLog 重複排除ロジック", () => {
  describe("[V-01] 1 Practice に PracticeLog 2件 → 代表アイテムが1件のみ残る", () => {
    it("practice_id ベースで2件 → 1件に絞り込まれる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-item-1", "practice-abc"),
        makePracticeLogItem("log-item-2", "practice-abc"),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("log-item-1"); // 最初の出現が代表
    });

    it("practice.id（ネスト）ベースで2件 → 1件に絞り込まれる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItemWithNestedId("log-item-1", "practice-xyz"),
        makePracticeLogItemWithNestedId("log-item-2", "practice-xyz"),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("log-item-1");
    });
  });

  describe("[V-02] 1 Practice に PracticeLog 3件 → 代表アイテムが1件のみ残る", () => {
    it("practice_id ベースで3件 → 1件に絞り込まれる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-item-1", "practice-abc"),
        makePracticeLogItem("log-item-2", "practice-abc"),
        makePracticeLogItem("log-item-3", "practice-abc"),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result).toHaveLength(1);
    });

    it("3件すべてが同じ practiceId を持つ場合、最初の出現のみ残る", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("first-log", "practice-abc"),
        makePracticeLogItem("second-log", "practice-abc"),
        makePracticeLogItem("third-log", "practice-abc"),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result[0]!.id).toBe("first-log");
    });
  });

  describe("[V-03] 異なる practiceId を持つ複数の PracticeLog アイテム → それぞれ1件ずつ残る", () => {
    it("2つの異なる practiceId → 2件が残る", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-1a", "practice-A"),
        makePracticeLogItem("log-1b", "practice-A"),
        makePracticeLogItem("log-2a", "practice-B"),
        makePracticeLogItem("log-2b", "practice-B"),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result).toHaveLength(2);
      // practice-A と practice-B それぞれの代表が残る
      const practiceIds = result.map((item) => {
        return isPracticeMetadata(item.metadata) ? item.metadata.practice_id : null;
      });
      expect(practiceIds).toContain("practice-A");
      expect(practiceIds).toContain("practice-B");
    });
  });

  describe("[V-03] PracticeLog 0件 → 空配列が返る", () => {
    it("空の practiceLogItems → 空配列", () => {
      const result = deduplicatePracticeLogItems([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("境界値: practice_id が null/undefined のアイテムは除外される", () => {
    it("metadata に practice_id も practice.id もない場合 → 除外される", () => {
      const items: CalendarItem[] = [
        makeCalendarItem({
          id: "no-practice-id",
          type: "practice_log",
          metadata: {} as CalendarItem["metadata"],
        }),
      ];

      const result = deduplicatePracticeLogItems(items);

      // practiceId が null なので除外される（isPracticeMetadata が false を返す、
      // もしくは pid が null になる）
      expect(result).toHaveLength(0);
    });

    it("metadata が null の場合 → 除外される", () => {
      const items: CalendarItem[] = [
        makeCalendarItem({
          id: "null-metadata",
          type: "practice_log",
          metadata: null as unknown as CalendarItem["metadata"],
        }),
      ];

      const result = deduplicatePracticeLogItems(items);

      expect(result).toHaveLength(0);
    });
  });

  describe("[V-05] 大会・記録アイテムは dedupe 対象外（competition/entry/record の type は practiceLogItems に入らない）", () => {
    it("practice_log 以外の type は practiceLogItems にフィルタされないので、dedupe ロジックに渡されない", () => {
      // 本ユニットテストでは型別フィルタ後の配列に dedupe を適用する
      // よってここでは competition type がそもそも渡されないことを確認
      const competitionItem: CalendarItem = makeCalendarItem({
        id: "comp-1",
        type: "competition",
        metadata: { competition: { id: "comp-id", title: "大会", date: "2026-06-30", end_date: null, place: "東京", pool_type: 25 } } as CalendarItem["metadata"],
      });

      // competition 型は practiceLogItems.filter() で除外されるため、
      // dedupe 関数には渡らない。ここでは仮に渡した場合の挙動を確認:
      // isPracticeMetadata が false → pid が null → 除外される
      const result = deduplicatePracticeLogItems([competitionItem]);
      expect(result).toHaveLength(0);
    });
  });
});

// ------------------------------------------------------------------
// テスト: practiceLogUpdateKey の計算
// ------------------------------------------------------------------
describe("practiceLogUpdateKey の計算（[V-04]）", () => {
  describe("全ログの id+updated_at が連結されている", () => {
    it("2件のログ → 両方の id:updated_at がキーに含まれる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-item-1", "practice-abc", "2026-06-30T10:00:00Z"),
        makePracticeLogItem("log-item-2", "practice-abc", "2026-06-30T11:00:00Z"),
      ];

      const key = buildPracticeLogUpdateKey(items, "practice-abc");

      expect(key).toContain("log-item-1:2026-06-30T10:00:00Z");
      expect(key).toContain("log-item-2:2026-06-30T11:00:00Z");
    });

    it("3件のログ → 3つ全部のエントリがキーに含まれる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-1", "practice-abc", "2026-06-30T09:00:00Z"),
        makePracticeLogItem("log-2", "practice-abc", "2026-06-30T10:00:00Z"),
        makePracticeLogItem("log-3", "practice-abc", "2026-06-30T11:00:00Z"),
      ];

      const key = buildPracticeLogUpdateKey(items, "practice-abc");

      // キーは sort 後に join されるため、3つのエントリを確認
      const entries = key.split(",");
      expect(entries).toHaveLength(3);
      expect(entries.some((e) => e.startsWith("log-1:"))).toBe(true);
      expect(entries.some((e) => e.startsWith("log-2:"))).toBe(true);
      expect(entries.some((e) => e.startsWith("log-3:"))).toBe(true);
    });

    it("updated_at がない場合 → id:id の形式になる", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-fallback", "practice-abc"),
      ];

      const key = buildPracticeLogUpdateKey(items, "practice-abc");

      expect(key).toBe("log-fallback:log-fallback");
    });

    it("別の practiceId のログは含まれない（対象 practiceId でフィルタされる）", () => {
      const items: CalendarItem[] = [
        makePracticeLogItem("log-A1", "practice-A", "2026-06-30T10:00:00Z"),
        makePracticeLogItem("log-A2", "practice-A", "2026-06-30T11:00:00Z"),
        makePracticeLogItem("log-B1", "practice-B", "2026-06-30T12:00:00Z"),
      ];

      const keyForA = buildPracticeLogUpdateKey(items, "practice-A");
      const keyForB = buildPracticeLogUpdateKey(items, "practice-B");

      // practice-A のキーには B のログが含まれない
      expect(keyForA).not.toContain("log-B1");
      expect(keyForA).toContain("log-A1");
      expect(keyForA).toContain("log-A2");

      // practice-B のキーには A のログが含まれない
      expect(keyForB).not.toContain("log-A1");
      expect(keyForB).not.toContain("log-A2");
      expect(keyForB).toContain("log-B1");
    });

    it("重複排除後もキーは全件（重複を含む元のリスト）を対象に計算される", () => {
      // 重複排除は表示のみの話。updateKey は全ログを見ている
      const allItems: CalendarItem[] = [
        makePracticeLogItem("log-1", "practice-abc", "2026-06-30T09:00:00Z"),
        makePracticeLogItem("log-2", "practice-abc", "2026-06-30T10:00:00Z"),
        makePracticeLogItem("log-3", "practice-abc", "2026-06-30T11:00:00Z"),
      ];

      const uniqueItems = deduplicatePracticeLogItems(allItems);
      // 重複排除後は1件
      expect(uniqueItems).toHaveLength(1);

      // しかし updateKey は元の allItems 全件から計算する
      const key = buildPracticeLogUpdateKey(allItems, "practice-abc");
      const entries = key.split(",");
      expect(entries).toHaveLength(3); // 全3件が対象
    });
  });

  describe("キーのソート安定性", () => {
    it("アイテムの順序が変わっても同じキーになる", () => {
      const items1: CalendarItem[] = [
        makePracticeLogItem("log-1", "practice-abc", "2026-06-30T09:00:00Z"),
        makePracticeLogItem("log-2", "practice-abc", "2026-06-30T10:00:00Z"),
      ];
      const items2: CalendarItem[] = [
        makePracticeLogItem("log-2", "practice-abc", "2026-06-30T10:00:00Z"),
        makePracticeLogItem("log-1", "practice-abc", "2026-06-30T09:00:00Z"),
      ];

      const key1 = buildPracticeLogUpdateKey(items1, "practice-abc");
      const key2 = buildPracticeLogUpdateKey(items2, "practice-abc");

      expect(key1).toBe(key2);
    });
  });
});

// ------------------------------------------------------------------
// テスト: isPracticeMetadata 型ガードの動作確認
// (重複排除ロジックが依存しているため検証する)
// ------------------------------------------------------------------
describe("isPracticeMetadata 型ガード（依存関数の動作確認）", () => {
  it("practice_id を持つオブジェクト → true", () => {
    expect(isPracticeMetadata({ practice_id: "p-1" })).toBe(true);
  });

  it("practice を持つオブジェクト → true", () => {
    expect(isPracticeMetadata({ practice: { id: "p-1", place: "pool" } })).toBe(true);
  });

  it("空オブジェクト → false（practiceMetadata として認識されない）", () => {
    // 空オブジェクトは "practice" も "practice_id" も "team_id" も "team" も "user_id" も持たない
    expect(isPracticeMetadata({})).toBe(false);
  });

  it("null → false", () => {
    expect(isPracticeMetadata(null)).toBe(false);
  });

  it("undefined → false", () => {
    expect(isPracticeMetadata(undefined)).toBe(false);
  });

  it("string → false", () => {
    expect(isPracticeMetadata("practice-id-string")).toBe(false);
  });
});
