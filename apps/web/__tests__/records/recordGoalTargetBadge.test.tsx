/**
 * RecordClient — チーム代理入力の「目標: xx.xx」バッジ (W1 / W1')
 * Sprint Contract goal_target_badge。
 *   - 個人種目の行 / リレー第1泳者に出る。リレー第2〜4泳者・引き継ぎトグル ON では出ない
 *   - メンバー A の目標が B の行に出ない (user_id で照合)。別大会・cancelled は出ない
 *   - ベストバッジが無くても目標は出る。ベストバッジの直下 (DOM 順でベストの後) に出る
 *   - goalTargets 未指定 (optional prop) でも壊れない
 * next-intl はキーをそのまま返すモック。期待値の整形 ("28.50") は直書き。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Style } from "@apps/shared/types";
import type { BestTime } from "@apps/shared/types/ui";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () =>
      ((key: string, values?: Record<string, unknown>) => {
        if (key === "relayLegLabel" && values) return `LEG${values.num} ${values.style}`;
        if (key === "relayLegShort" && values) return `LEG${values.num}`;
        if (key === "reactionTimeLabelShort") return "RT";
        return values ? `${key}::${JSON.stringify(values)}` : key;
      }) as unknown as ReturnType<typeof original.useTranslations>,
    useLocale: () => "ja",
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: { from: () => ({ select: () => ({ eq: () => ({}) }) }) },
    subscription: null,
  }),
}));

const STYLE_FR_50: Style = { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 };
const STYLE_BR_50: Style = { id: 9, name_jp: "平泳ぎ50m", name: "Breaststroke", style: "Br", distance: 50 };
const STYLE_BA_50: Style = { id: 13, name_jp: "背泳ぎ50m", name: "Backstroke", style: "Ba", distance: 50 };
const STYLE_FLY_50: Style = { id: 17, name_jp: "バタフライ50m", name: "Butterfly", style: "Fly", distance: 50 };
const STYLES = [STYLE_FR_50, STYLE_BR_50, STYLE_BA_50, STYLE_FLY_50];

/** 短水路 (pool_type=0) の大会。他水路フォールバックの検証で向きが問題になる */
const baseCompetition = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: "2026-01-01",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const members = [
  { id: "u-aoi", user_id: "u-aoi", role: "admin", users: { id: "u-aoi", name: "アオイ", gender: 0 } },
  { id: "u-misaki", user_id: "u-misaki", role: "user", users: { id: "u-misaki", name: "ミサキ", gender: 0 } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];
type ExistingRecordFixture = RecordClientPropsFull["existingRecords"][number];

function makeRecord(opts: {
  id: string;
  userId: string;
  name: string;
  styleId: number;
  time: number;
  isRelaying: boolean;
}): ExistingRecordFixture {
  const style = STYLES.find((s) => s.id === opts.styleId)!;
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    video_path: null,
    note: null,
    is_relaying: opts.isRelaying,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: opts.userId, name: opts.name },
    styles: { id: style.id, name_jp: style.name_jp, distance: style.distance },
  };
}

function makeBestTime(opts: {
  styleId: number;
  time: number;
  poolType: number;
  isRelaying?: boolean;
  relayingTime?: number;
}): BestTime {
  const style = STYLES.find((s) => s.id === opts.styleId)!;
  return {
    id: `bt-${opts.styleId}-${opts.poolType}-${opts.time}`,
    time: opts.time,
    created_at: "2025-06-01T00:00:00Z",
    pool_type: opts.poolType,
    is_relaying: opts.isRelaying ?? false,
    style_id: style.id,
    style: { name_jp: style.name_jp, distance: style.distance },
    ...(opts.relayingTime !== undefined
      ? {
          relayingTime: {
            id: `bt-relay-${opts.styleId}-${opts.poolType}`,
            time: opts.relayingTime,
            created_at: "2025-06-01T00:00:00Z",
          },
        }
      : {}),
  };
}

/** メドレーリレー (背→平→バタ→自) の4件連続並び */
function medleyRelayRecords(): ExistingRecordFixture[] {
  return [
    makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 13, time: 31.0, isRelaying: false }),
    makeRecord({ id: "r2", userId: "u-misaki", name: "ミサキ", styleId: 9, time: 33.5, isRelaying: true }),
    makeRecord({ id: "r3", userId: "u-3", name: "レン", styleId: 17, time: 29.8, isRelaying: true }),
    makeRecord({ id: "r4", userId: "u-4", name: "ハル", styleId: 2, time: 27.0, isRelaying: true }),
  ];
}

const badgeText = (testId: string): string | undefined =>
  screen.queryByTestId(testId)?.textContent?.replace(/\s+/g, " ").trim();

type GoalTargetsProp = NonNullable<RecordClientPropsFull["goalTargets"]>;
const goalTarget = (over: Partial<GoalTargetsProp[number]> = {}): GoalTargetsProp[number] => ({
  competition_id: "comp-1",
  user_id: "u-aoi",
  style_id: 2,
  target_time: 28.5,
  status: "active",
  ...over,
});

function renderWithGoals(
  existingRecords: ExistingRecordFixture[],
  goalTargets: GoalTargetsProp | undefined,
  bestTimesByUser: Record<string, BestTime[]> = {},
) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={members}
      existingRecords={existingRecords}
      styles={STYLES}
      entries={[]}
      bestTimesByUser={bestTimesByUser}
      goalTargets={goalTargets}
    />,
  );
}

const aoiFr = () => [
  makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false }),
];

describe("RecordClient — 個人種目の目標バッジ (W1)", () => {
  it("目標があれば行に「goalTargetLabel: 28.50」が出る", () => {
    renderWithGoals(aoiFr(), [goalTarget()]);
    expect(badgeText("record-goal-target-badge-u-aoi")).toBe("goalTargetLabel: 28.50");
  });

  it("goalTargets 未指定 (optional) でも描画でき、バッジは出ない", () => {
    renderWithGoals(aoiFr(), undefined);
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
  });

  it("目標が無ければ出ない / cancelled は出ない / achieved は出る", () => {
    const { unmount } = renderWithGoals(aoiFr(), []);
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
    unmount();
    const r2 = renderWithGoals(aoiFr(), [goalTarget({ status: "cancelled" })]);
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
    r2.unmount();
    renderWithGoals(aoiFr(), [goalTarget({ status: "achieved", target_time: 27.5 })]);
    expect(badgeText("record-goal-target-badge-u-aoi")).toBe("goalTargetLabel: 27.50");
  });

  it("別大会の目標 (competition_id 違い) は出ない", () => {
    renderWithGoals(aoiFr(), [goalTarget({ competition_id: "comp-OTHER" })]);
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
  });

  it("別種目の目標は出ない (種目3 ではなく行の種目2 で照合)", () => {
    renderWithGoals(aoiFr(), [goalTarget({ style_id: 9 })]);
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
  });

  it("メンバーごとに別の値が出る (混線しない)。目標を持たないメンバーの行には出ない", () => {
    renderWithGoals(
      [
        makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false }),
        makeRecord({ id: "r2", userId: "u-misaki", name: "ミサキ", styleId: 2, time: 28.0, isRelaying: false }),
      ],
      [goalTarget({ user_id: "u-aoi", target_time: 26 }), goalTarget({ user_id: "u-3", target_time: 20 })],
    );
    expect(badgeText("record-goal-target-badge-u-aoi")).toBe("goalTargetLabel: 26.00");
    expect(screen.queryByTestId("record-goal-target-badge-u-misaki")).toBeNull();
  });

  it("同じ種目でもメンバーごとの値がそれぞれの行に出る", () => {
    renderWithGoals(
      [
        makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false }),
        makeRecord({ id: "r2", userId: "u-misaki", name: "ミサキ", styleId: 2, time: 28.0, isRelaying: false }),
      ],
      [goalTarget({ user_id: "u-aoi", target_time: 26 }), goalTarget({ user_id: "u-misaki", target_time: 29 })],
    );
    expect(badgeText("record-goal-target-badge-u-aoi")).toBe("goalTargetLabel: 26.00");
    expect(badgeText("record-goal-target-badge-u-misaki")).toBe("goalTargetLabel: 29.00");
  });

  it("引き継ぎあり (is_relaying=true) の記録行には出ない", () => {
    renderWithGoals(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: true })],
      [goalTarget()],
    );
    expect(screen.queryByTestId("record-goal-target-badge-u-aoi")).toBeNull();
  });

  it("ベストタイムが無くても目標は出る", () => {
    renderWithGoals(aoiFr(), [goalTarget()], {});
    expect(screen.queryByTestId("record-best-time-badge-u-aoi")).toBeNull();
    expect(badgeText("record-goal-target-badge-u-aoi")).toBe("goalTargetLabel: 28.50");
  });

  it("ベストと目標は同じ縦並びコンテナ (flex-col) の子で、目標がベストの直後 (真下)", () => {
    renderWithGoals(aoiFr(), [goalTarget()], {
      "u-aoi": [makeBestTime({ styleId: 2, time: 26.5, poolType: 0 })],
    });
    const best = screen.getByTestId("record-best-time-badge-u-aoi");
    const goalEl = screen.getByTestId("record-goal-target-badge-u-aoi");
    expect(goalEl.parentElement).toBe(best.parentElement);
    expect(best.parentElement!.className).toContain("flex-col");
    expect(best.nextElementSibling).toBe(goalEl);
  });

  it("ベストが無いとき、目標はベストの位置 (同じ縦並びコンテナの先頭) に出る", () => {
    renderWithGoals(aoiFr(), [goalTarget()], {});
    const goalEl = screen.getByTestId("record-goal-target-badge-u-aoi");
    expect(screen.queryByTestId("record-best-time-badge-u-aoi")).toBeNull();
    expect(goalEl.parentElement!.className).toContain("flex-col");
    expect(goalEl.parentElement!.firstElementChild).toBe(goalEl);
  });
});

describe("RecordClient — リレー4レグの目標バッジ (W1')", () => {
  const legGoals: GoalTargetsProp = [
    goalTarget({ user_id: "u-aoi", style_id: 13, target_time: 30 }), // 第1泳者 (背)
    goalTarget({ user_id: "u-misaki", style_id: 9, target_time: 33 }), // 第2泳者 (平)
    goalTarget({ user_id: "u-3", style_id: 17, target_time: 29 }), // 第3泳者 (バタ)
    goalTarget({ user_id: "u-4", style_id: 2, target_time: 26 }), // 第4泳者 (自)
  ];

  it("第1泳者 (引き継ぎなし) には出る", () => {
    renderWithGoals(medleyRelayRecords(), legGoals);
    expect(badgeText("relay-leg-goal-target-badge-0")).toBe("goalTargetLabel: 30.00");
  });

  it("第2〜4泳者 (引き継ぎあり) には、目標があっても出ない", () => {
    renderWithGoals(medleyRelayRecords(), legGoals);
    for (const legIndex of [1, 2, 3]) {
      expect(screen.queryByTestId(`relay-leg-goal-target-badge-${legIndex}`)).toBeNull();
    }
  });

  it("第1泳者でも、レグの種目 (背) と違う種目の目標しか無ければ出ない", () => {
    renderWithGoals(medleyRelayRecords(), [goalTarget({ user_id: "u-aoi", style_id: 2, target_time: 30 })]);
    expect(screen.queryByTestId("relay-leg-goal-target-badge-0")).toBeNull();
  });
});
