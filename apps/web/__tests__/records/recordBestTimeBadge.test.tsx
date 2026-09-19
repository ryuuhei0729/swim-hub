/**
 * RecordClient — チーム代理入力のベストタイム参照バッジ
 *
 * 人間の意図:
 *   コーチが他人の記録を代理入力するとき、その選手の自己ベストが分からないと
 *   入力値の桁違い (26.50 と 2:6.50 の打ち間違い等) に気付けない。個人の大会入力画面には
 *   既にあるバッジを、チームの代理入力画面 (個人種目カード + リレーの4レグ) にも出す。
 *
 * ここで固定する契約:
 *   - バッジは **表示のみ**。タイム入力欄には絶対に入らない (エントリー画面の
 *     「ベストタイムを流用」ボタンと違い、ここは結果タイムを入力する画面なので
 *     ベストが初期値に入ると実測値と区別できなくなる)。
 *   - リレーの第2〜4泳者は引き継ぎスタートなので「引き継ぎベスト」を出す。
 *     第1泳者は通常スタートなので通常ベストを出す。両者は 0.5 秒前後違い、
 *     取り違えると速い方が自己ベストとして見えてしまう。
 *   - どの候補が選ばれたかは**ラベルでしか見分けられない**ので labelKey も検証する。
 *
 * トートロジー回避:
 *   next-intl はキーをそのまま返すモックを使い、日本語訳文をハードコードしない。
 *   期待タイム文字列 ("26.50" 等) は formatTimeBest を呼ばず直接書く
 *   (表示仕様「分:秒.コンマ秒」そのものを固定するため)。
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

function renderRecordClient(
  existingRecords: ExistingRecordFixture[],
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
    />,
  );
}

const badgeText = (testId: string): string | undefined =>
  screen.queryByTestId(testId)?.textContent?.replace(/\s+/g, " ").trim();

describe("RecordClient — 個人種目カードのベストタイムバッジ", () => {
  it("大会と同じ水路の通常ベストが、そのメンバーの行にラベル付きで表示される", () => {
    renderRecordClient(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false })],
      { "u-aoi": [makeBestTime({ styleId: 2, time: 26.5, poolType: 0 })] },
    );

    expect(badgeText("record-best-time-badge-u-aoi")).toBe("bestTimeLabel: 26.50");
  });

  it("リレー(引き継ぎ)チェックが入った個人行では引き継ぎベストが優先される", () => {
    renderRecordClient(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: true })],
      { "u-aoi": [makeBestTime({ styleId: 2, time: 26.5, poolType: 0, relayingTime: 25.9 })] },
    );

    expect(badgeText("record-best-time-badge-u-aoi")).toBe("bestTimeRelay: 25.90");
  });

  it("同じ水路に記録が無ければ他水路のベストへ落ち、ラベルで他水路だと分かる", () => {
    renderRecordClient(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false })],
      { "u-aoi": [makeBestTime({ styleId: 2, time: 28.4, poolType: 1 })] },
    );

    expect(badgeText("record-best-time-badge-u-aoi")).toBe("bestTimeLong: 28.40");
  });

  it("その種目のベストを持たないメンバーにはバッジ自体が出ない (0.00 等を出さない)", () => {
    renderRecordClient(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false })],
      { "u-aoi": [makeBestTime({ styleId: 9, time: 33.0, poolType: 0 })] },
    );

    expect(screen.queryByTestId("record-best-time-badge-u-aoi")).toBeNull();
  });

  it("バッジが出てもタイム入力欄は既存記録の値のままで、ベストタイムが流し込まれない", () => {
    renderRecordClient(
      [makeRecord({ id: "r1", userId: "u-aoi", name: "アオイ", styleId: 2, time: 27.0, isRelaying: false })],
      { "u-aoi": [makeBestTime({ styleId: 2, time: 26.5, poolType: 0 })] },
    );

    expect(badgeText("record-best-time-badge-u-aoi")).toBe("bestTimeLabel: 26.50");
    expect(screen.getByDisplayValue("27.00")).toBeDefined();
    expect(screen.queryByDisplayValue("26.50")).toBeNull();
  });
});

describe("RecordClient — リレー4レグのベストタイムバッジ", () => {
  const relayBestTimes: Record<string, BestTime[]> = {
    // 第1泳者 (背泳ぎ・通常スタート)
    "u-aoi": [makeBestTime({ styleId: 13, time: 30.2, poolType: 0, relayingTime: 29.7 })],
    // 第2泳者 (平泳ぎ・引き継ぎ)
    "u-misaki": [makeBestTime({ styleId: 9, time: 34.0, poolType: 0, relayingTime: 33.1 })],
    // 第3泳者 (バタフライ) は引き継ぎベストを持たない → 通常ベストへ落ちる
    "u-3": [makeBestTime({ styleId: 17, time: 29.0, poolType: 0 })],
    // 第4泳者 (自由形) は他水路にしか記録が無い
    "u-4": [makeBestTime({ styleId: 2, time: 27.8, poolType: 1, relayingTime: 27.1 })],
  };

  it("第1泳者は通常スタートなので通常ベストを表示する (引き継ぎベストを持っていても使わない)", () => {
    renderRecordClient(medleyRelayRecords(), relayBestTimes);

    expect(badgeText("relay-leg-best-time-badge-0")).toBe("bestTimeLabel: 30.20");
  });

  it("第2泳者は引き継ぎスタートなので引き継ぎベストを表示する", () => {
    renderRecordClient(medleyRelayRecords(), relayBestTimes);

    expect(badgeText("relay-leg-best-time-badge-1")).toBe("bestTimeRelay: 33.10");
  });

  it("引き継ぎベストを持たない泳者は同一水路の通常ベストへ落ちる", () => {
    renderRecordClient(medleyRelayRecords(), relayBestTimes);

    expect(badgeText("relay-leg-best-time-badge-2")).toBe("bestTimeLabel: 29.00");
  });

  it("同一水路に記録が無い泳者は他水路の引き継ぎベストへ落ちる", () => {
    renderRecordClient(medleyRelayRecords(), relayBestTimes);

    expect(badgeText("relay-leg-best-time-badge-3")).toBe("bestTimeLongRelay: 27.10");
  });

  it("各レグは自分が泳ぐ種目のベストを引く (第2泳者の平泳ぎ欄に自由形のベストが出ない)", () => {
    renderRecordClient(medleyRelayRecords(), {
      // 平泳ぎ (レグ2の種目) のベストは持たず、自由形のベストだけを持つ泳者
      "u-misaki": [makeBestTime({ styleId: 2, time: 24.0, poolType: 0, relayingTime: 23.5 })],
    });

    expect(screen.queryByTestId("relay-leg-best-time-badge-1")).toBeNull();
  });

  it("ベストタイムが1件も無ければリレーの4レグすべてにバッジが出ない", () => {
    renderRecordClient(medleyRelayRecords(), {});

    for (const legIndex of [0, 1, 2, 3]) {
      expect(screen.queryByTestId(`relay-leg-best-time-badge-${legIndex}`)).toBeNull();
    }
  });
});
