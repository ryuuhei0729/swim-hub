/**
 * domainFilter.targetId.test.ts
 *
 * Sprint Contract (練習タブ/大会タブ経由の DayDetailModal を「タップした1件のみ」表示に
 * 絞り込む) 検証観点:
 *
 *   [V-49]      filterEntriesByTargetId は scope="day" のとき targetId を無視し、
 *               entries をそのまま (非破壊・参照そのまま) 返す (ダッシュボード無変更)
 *   [V-49b]     targetId が undefined のときも entries をそのまま返す
 *               (呼び出し元が targetId を渡し忘れても scope="day" と同じ安全側に倒れる)
 *   [V-50]      scope="practice"/"competition" かつ targetId 指定時、item.id === targetId の
 *               1件のみを返す (同じ日の兄弟アイテムは出さない)
 *   [V-50b]     targetId に一致するアイテムが0件のとき、空配列を返す
 *               (白紙パネルではなく「空メッセージ」に倒すのは呼び出し側 DayDetailModal の責務)
 *   [V-50c]     並び順は維持する・入力配列を変更しない (filterEntriesByScope と同じ規律)
 *   [V-51]      getCompetitionId は record/entry/competition/team_competition いずれの
 *               CalendarItem からも、DB (calendar_view) が実際に埋め込む metadata の形から
 *               大会IDを一意に解決する。DayDetailModal.tsx に現在3箇所ある抽出ロジックの
 *               「唯一の定義元」になるため、動作は各アイテム種別の実データ形状 (calendar_view
 *               migration 20260417000000 で確認済み) から導出した期待値であり、
 *               実装を読んでコピーしたものではない。
 *
 * 対象実装 (未実装 / Phase A 時点では存在しないため import エラーで RED):
 *   apps/mobile/components/calendar/DayDetailModal/domainFilter.ts
 *     export function filterEntriesByTargetId(
 *       entries: CalendarItem[],
 *       scope: DayDetailScope,
 *       targetId?: string,
 *     ): CalendarItem[]
 *     export function getCompetitionId(item: CalendarItem): string | undefined
 *
 * トートロジー防止メモ:
 *   - record 型の metadata には `record` キーが存在しない (calendar_view の record 型行は
 *     jsonb_build_object('competition', ..., 'user_id', ..., 'pool_type', ...) のみを積み、
 *     'record' キーは積まない)。にもかかわらず item.id 自体が competitions.id と一致する
 *     (calendar_view の record 型は `SELECT c.id, 'record' AS item_type, ...` で大会単位に
 *     複数日展開される)。この2点は migration SQL を実測した事実であり、getCompetitionId の
 *     期待値はここから導出する。
 *   - entry 型は metadata.entry.competition_id を持つが、DayDetailModal.tsx 現行コードの
 *     entriesByComp 側抽出には item.id フォールバックが無い(記録側とは非対称)。この非対称を
 *     解消するかどうかは実装判断だが、少なくとも entry 型は
 *     metadata.competition.id / metadata.entry.competition_id のどちらかから解決できることを
 *     仕様として固定する。
 */

import { describe, expect, it } from "vitest";
import { filterEntriesByTargetId, getCompetitionId } from "../domainFilter";
import type { CalendarItem } from "@apps/shared/types/ui";

function makeItem(
  type: CalendarItem["type"],
  id: string,
  overrides: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: {},
    ...overrides,
  };
}

describe("filterEntriesByTargetId — scope=\"day\" は無視する (ダッシュボード無変更)", () => {
  it("[V-49] scope=\"day\" は targetId を無視し entries をそのまま返す", () => {
    const entries = [makeItem("practice_log", "a"), makeItem("record", "b")];
    const result = filterEntriesByTargetId(entries, "day", "a");
    expect(result).toBe(entries);
    expect(result).toHaveLength(2);
  });

  it("[V-49b] targetId 未指定のときも entries をそのまま返す", () => {
    const entries = [makeItem("practice_log", "a")];
    expect(filterEntriesByTargetId(entries, "practice", undefined)).toBe(entries);
  });
});

describe("filterEntriesByTargetId — scope=\"practice\"/\"competition\" は1件に絞る", () => {
  it("[V-50] item.id === targetId の1件だけを返す (同日の兄弟アイテムは出ない)", () => {
    const target = makeItem("practice_log", "log-target");
    const sibling = makeItem("practice_log", "log-sibling");
    const result = filterEntriesByTargetId([sibling, target], "practice", "log-target");
    expect(result.map((e) => e.id)).toEqual(["log-target"]);
  });

  it("[V-50] scope=\"competition\" でも同様に1件だけを返す", () => {
    const target = makeItem("competition", "comp-target");
    const sibling = makeItem("record", "rec-sibling");
    const result = filterEntriesByTargetId([sibling, target], "competition", "comp-target");
    expect(result.map((e) => e.id)).toEqual(["comp-target"]);
  });

  it("[V-50b] targetId に一致するアイテムが無ければ空配列を返す (白紙化ではなく空配列)", () => {
    const entries = [makeItem("practice_log", "a"), makeItem("practice_log", "b")];
    expect(filterEntriesByTargetId(entries, "practice", "not-found")).toEqual([]);
  });

  it("[V-50c] 一致する複数件があれば並び順を維持したまま全て返す", () => {
    // 大会タブの「エントリー済み」行タップ (targetRecordId 無し) は同じ大会の
    // entry を複数件残す想定のため、「1件確定」ではなく「id 一致で絞る」契約にする
    const compX = { id: "comp-x", title: "X大会", date: "2026-07-15", place: null, pool_type: 0 };
    const entries = [
      makeItem("entry", "e1", { metadata: { competition: compX } }),
      makeItem("entry", "e2", { metadata: { competition: compX } }),
    ];
    // ここでは targetId をアイテムの id ではなく大会 id として渡すユースケースは扱わない
    // (targetId は常に CalendarItem.id と比較する契約)。id 一致するもののみ残る。
    const result = filterEntriesByTargetId(entries, "competition", "e1");
    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("[V-50c] 入力配列を変更しない (非破壊)", () => {
    const entries = [makeItem("practice_log", "a"), makeItem("practice_log", "b")];
    const snapshot = entries.map((e) => ({ ...e }));
    filterEntriesByTargetId(entries, "practice", "a");
    expect(entries).toEqual(snapshot);
  });

  it(
    "[G-1] targetId=大会id のとき、同じ大会に紐づく複数 entry は全て残り、" +
      "別大会の entry は残らない (エントリー済み行タップの実データ形状: 大会タブ経由の " +
      "targetId は entry.id ではなく getCompetitionId(entry) と比較される OR 分岐を検証)",
    () => {
      const compX = { id: "comp-x", title: "X大会", date: "2026-07-15", place: null, pool_type: 0 };
      const compY = { id: "comp-y", title: "Y大会", date: "2026-07-16", place: null, pool_type: 0 };
      const entries = [
        makeItem("entry", "e1", { metadata: { competition: compX } }), // 大会Xの100mFr
        makeItem("entry", "e2", { metadata: { competition: compX } }), // 大会Xの200mFr(同じ大会の別種目)
        makeItem("entry", "e3", { metadata: { competition: compY } }), // 別大会Yのエントリー
      ];
      const result = filterEntriesByTargetId(entries, "competition", "comp-x");
      expect(result.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
      expect(result.map((e) => e.id)).not.toContain("e3");
    },
  );

  it(
    "[V-44] team_practice でも targetId 絞り込みが効く (同日の他のチーム練習ログは出ない)",
    () => {
      const target = makeItem("team_practice", "team-practice-target", {
        metadata: { team_id: "team-1" },
      });
      const sibling = makeItem("practice_log", "sibling-log", {
        metadata: { team_id: "team-1" },
      });
      const result = filterEntriesByTargetId([sibling, target], "practice", "team-practice-target");
      expect(result.map((e) => e.id)).toEqual(["team-practice-target"]);
    },
  );

  it(
    "[V-44] team_competition/record(team) でも targetId(=大会id) 絞り込みが効く",
    () => {
      const teamComp = { id: "team-comp-1", title: "T", date: "2026-07-15", place: null, pool_type: 0, team_id: "team-1" };
      const target = makeItem("record", "r1", { metadata: { competition: teamComp, team_id: "team-1" } });
      const otherCompRecord = makeItem("record", "r2", {
        metadata: {
          competition: { id: "other-comp", title: "O", date: "2026-07-15", place: null, pool_type: 0 },
        },
      });
      const result = filterEntriesByTargetId(
        [otherCompRecord, target],
        "competition",
        "team-comp-1",
      );
      expect(result.map((e) => e.id)).toEqual(["r1"]);
    },
  );
});

describe("getCompetitionId — CalendarItem の種別ごとの大会ID解決", () => {
  it("[V-51] record 型: metadata.competition.id を優先する", () => {
    const item = makeItem("record", "comp-1", {
      metadata: { competition: { id: "comp-1", title: "T", date: "2026-07-15", place: null, pool_type: 0 } },
    });
    expect(getCompetitionId(item)).toBe("comp-1");
  });

  it("[V-51] record 型: metadata.competition が欠落していても item.id が競技会IDと一致する " +
    "(calendar_view の record 型行は c.id をそのまま item.id として出す)", () => {
    const item = makeItem("record", "comp-2", { metadata: {} });
    expect(getCompetitionId(item)).toBe("comp-2");
  });

  it("[V-51] entry 型: metadata.competition.id を優先する", () => {
    const item = makeItem("entry", "entry-1", {
      metadata: { competition: { id: "comp-3", title: "T", date: "2026-07-15", place: null, pool_type: 0 } },
    });
    expect(getCompetitionId(item)).toBe("comp-3");
  });

  it("[V-51] entry 型: metadata.competition が無くても metadata.entry.competition_id を解決する", () => {
    const item = makeItem("entry", "entry-2", {
      metadata: {
        entry: {
          id: "entry-2",
          competition_id: "comp-4",
          user_id: "user-1",
          style_id: 1,
        },
      },
    });
    expect(getCompetitionId(item)).toBe("comp-4");
  });

  it("[V-51] competition/team_competition 型: item.id 自体が競技会ID", () => {
    expect(getCompetitionId(makeItem("competition", "comp-5"))).toBe("comp-5");
    expect(getCompetitionId(makeItem("team_competition", "comp-6"))).toBe("comp-6");
  });
});
