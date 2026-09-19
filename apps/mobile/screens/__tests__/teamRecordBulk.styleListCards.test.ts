// =============================================================================
// teamRecordBulk.styleListCards.test.ts
// [新Fix] 一覧カードの件数表示 ({filled}/{total}人 → 個人は{n}人、リレーは{n}チーム)
// (QA Sprint Contract Phase B / 修正ラウンド 2026-09-17)
// =============================================================================
//
// `buildIndividualStyleCards` / `buildRelayStyleCards`
// (apps/mobile/screens/teamRecordBulk/styleListCards.ts) を実物 import して
// 直接呼び出す (screen は render しない。件数計算は純粋関数なので画面を経由せず
// 検証できる — QA Sprint Contract の制約ハーネス要求)。
//
// 検証観点:
//   - 個人種目カードの filledCount は「タイム入力済みの人数」(records.time > 0)
//   - リレー種目カードの groupCount は「タイム入力済みの組 (チーム) 数」であり、
//     レグ人数の合計ではない (4人揃っていても1チームなら 1)
//   - 同一種目に複数の「組」がある場合、個人は全組を合算した人数、
//     リレーは組の数そのもの
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildIndividualStyleCards, buildRelayStyleCards } from "../teamRecordBulk/styleListCards";
import type { StyleEntry } from "../teamRecordBulk/buildStyleEntries";
import type { Style } from "@apps/shared/types";

const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "Fr",
  distance: 50,
};

function memberRecord(overrides: Partial<StyleEntry["memberRecords"][number]> = {}) {
  return {
    id: "mr-1",
    memberUserId: "user-1",
    memberName: "選手A",
    time: 0,
    timeDisplayValue: "",
    reactionTime: "",
    isRelaying: false,
    note: "",
    splitTimes: [],
    ...overrides,
  };
}

describe("[新Fix] 個人種目カードの件数表示 ({n}人、タイム入力済みの数)", () => {
  it("1組・2名中1名だけタイム入力済みなら filledCount は1 (未入力は数えない)", () => {
    const entry: StyleEntry = {
      id: "entry-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        memberRecord({ id: "mr-1", time: 30.1 }),
        memberRecord({ id: "mr-2", time: 0 }),
      ],
    };

    const cards = buildIndividualStyleCards([STYLE_FREE_50], [entry], 0, new Map());
    const card = cards.find((c) => c.styleId === 2);
    expect(card?.filledCount).toBe(1);
  });

  it("同一種目に2組ある場合、両方の組のタイム入力済み人数を合算する (組をまたいだ合算)", () => {
    const group1: StyleEntry = {
      id: "entry-group-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "mr-1", time: 30.1 })],
    };
    const group2: StyleEntry = {
      id: "entry-group-2",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [
        memberRecord({ id: "mr-2", time: 31.2 }),
        memberRecord({ id: "mr-3", time: 32.3 }),
      ],
    };

    const cards = buildIndividualStyleCards([STYLE_FREE_50], [group1, group2], 0, new Map());
    const card = cards.find((c) => c.styleId === 2);
    expect(card?.filledCount).toBe(3);
  });

  it("誰もタイムを入力していなければ filledCount は0 (組自体は存在してもカウントしない)", () => {
    const entry: StyleEntry = {
      id: "entry-1",
      styleId: 2,
      styleName: "自由形50m",
      memberRecords: [memberRecord({ id: "mr-1", time: 0 })],
    };

    const cards = buildIndividualStyleCards([STYLE_FREE_50], [entry], 0, new Map());
    const card = cards.find((c) => c.styleId === 2);
    expect(card?.filledCount).toBe(0);
  });
});

describe("[新機能] 個人種目カードの entryCount (entryUserCountByStyleId の消費)", () => {
  it("entryUserCountByStyleId に対象 styleId の値があれば、そのまま entryCount に反映する", () => {
    const entryUserCountByStyleId = new Map<number, number>([[2, 5]]);

    const cards = buildIndividualStyleCards([STYLE_FREE_50], [], 0, entryUserCountByStyleId);
    const card = cards.find((c) => c.styleId === 2);
    expect(card?.entryCount).toBe(5);
  });

  it("entryUserCountByStyleId に対象 styleId のキーが無い場合、entryCount は0にフォールバックする", () => {
    const entryUserCountByStyleId = new Map<number, number>([[999, 3]]);

    const cards = buildIndividualStyleCards([STYLE_FREE_50], [], 0, entryUserCountByStyleId);
    const card = cards.find((c) => c.styleId === 2);
    expect(card?.entryCount).toBe(0);
  });
});

describe("[新Fix] リレー種目カードの件数表示 ({n}チーム、タイム入力済みの組数)", () => {
  const relayLegUserIds = ["user-lead", "user-second", "user-third", "user-anchor"];

  function relayEntry(id: string, times: readonly number[]): StyleEntry {
    return {
      id,
      styleId: 2,
      styleName: "4x50mフリーリレー",
      relayEventId: "relay_4x50_free",
      memberRecords: relayLegUserIds.map((userId, idx) =>
        memberRecord({
          id: `${id}-leg-${idx}`,
          memberUserId: userId,
          time: times[idx] ?? 0,
          isRelaying: idx !== 0,
          cumulativeTimeSeconds: times[idx] ? (idx + 1) * 27 : 0,
        }),
      ),
    };
  }

  it("4レグ全員タイム入力済みでも groupCount は1 (人数の合計ではなくチーム数)", () => {
    const entry = relayEntry("entry-team-a", [27.5, 28.7, 28.3, 27.6]);

    const cards = buildRelayStyleCards([entry], 0);
    const card = cards.find((c) => c.relayEventId === "relay_4x50_free");
    expect(card?.groupCount).toBe(1);
  });

  it("同一種目に2チーム (2組) あり、両方に入力済みタイムがあれば groupCount は2", () => {
    const teamA = relayEntry("entry-team-a", [27.5, 28.7, 28.3, 27.6]);
    const teamB = relayEntry("entry-team-b", [28.0, 29.0, 28.5, 27.9]);

    const cards = buildRelayStyleCards([teamA, teamB], 0);
    const card = cards.find((c) => c.relayEventId === "relay_4x50_free");
    expect(card?.groupCount).toBe(2);
  });

  it("組はあるがどのレグにもタイムが入っていなければ groupCount は0 (未入力の組を数えない)", () => {
    const entry = relayEntry("entry-team-a", [0, 0, 0, 0]);

    const cards = buildRelayStyleCards([entry], 0);
    const card = cards.find((c) => c.relayEventId === "relay_4x50_free");
    expect(card?.groupCount).toBe(0);
  });

  it("2チーム中1チームだけタイム入力済みなら groupCount は1 (未入力の組は数えない)", () => {
    const teamA = relayEntry("entry-team-a", [27.5, 28.7, 28.3, 27.6]);
    const teamB = relayEntry("entry-team-b", [0, 0, 0, 0]);

    const cards = buildRelayStyleCards([teamA, teamB], 0);
    const card = cards.find((c) => c.relayEventId === "relay_4x50_free");
    expect(card?.groupCount).toBe(1);
  });
});
