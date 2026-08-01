// =============================================================================
// calendarColorResolver.test.ts - カレンダー記録色カスタマイズ 色解決ロジックのテスト
// =============================================================================
// Sprint Contract: 「ダッシュボードの記録色をユーザーが設定画面からカスタマイズできる」
//
// 対象: apps/shared/utils/calendarColorResolver.ts (実装済み)
// シグネチャ:
//   resolveCalendarItemColor(type: CalendarItemType, metadata: CalendarItem["metadata"], settings: CalendarColorSettings): string
//
// フォールバック優先順位 (実装確定・apps/shared/utils/calendarColorResolver.ts と一致):
//   1. team_id を持つアイテム(team_practice/team_competition、および
//      team_id 付きの entry/record): byTeam[team_id][field] > personal[field] > デフォルト
//   2. team_id を持たない個人アイテム(practice/practice_log/competition、
//      および team_id なしの entry/record): personal[field] > デフォルト
//
// Phase B (実装後): QA が下記を実施した。
//   1. import を実装本体に差し替え、スタブ関数を削除した
//   2. CalendarColorSettings は snake_case ({ personal: {...}, byTeam: {...} }) が正であり、
//      Phase A のプレースホルダ camelCase 型 (personalPracticeColor/teamColors) は誤りだったため修正した
//   3. 各テストの `.toThrow()` プレースホルダを実装値に基づく `.toBe(...)` に確定させた
// トートロジー回避のため、assertion は実装コードをコピーせず、Sprint Contract の
// 優先順位仕様から独立して導出した期待値を用いる。
// =============================================================================

import { describe, expect, it } from "vitest";
import type { CalendarItem } from "../../types/ui";
import type { CalendarItemType } from "../../types/common";
import type { CalendarColorSettings } from "../../types/calendarColors";
import {
  resolveCalendarItemColor,
  DEFAULT_PRACTICE_COLOR,
  DEFAULT_COMPETITION_COLOR,
} from "../../utils/calendarColorResolver";

// -----------------------------------------------------------------------------
// テストデータヘルパー
// -----------------------------------------------------------------------------

// タグ機能と同一の10色パレット (apps/shared/constants/tagColors.ts に集約済み)
const PALETTE = [
  "#93C5FD", // 青
  "#7DD3FC", // 水色
  "#86EFAC", // 緑
  "#A3E635", // 黄緑
  "#FCA5A5", // 赤
  "#F9A8D4", // ピンク
  "#FDBA74", // オレンジ
  "#FDE047", // 黄色
  "#C4B5FD", // 紫
  "#D1D5DB", // グレー
] as const;

interface BuildSettingsOverrides {
  personalPracticeColor?: string | null;
  personalCompetitionColor?: string | null;
  byTeam?: CalendarColorSettings["byTeam"];
}

function buildSettings(overrides: BuildSettingsOverrides = {}): CalendarColorSettings {
  return {
    personal: {
      practice_color: overrides.personalPracticeColor ?? null,
      competition_color: overrides.personalCompetitionColor ?? null,
    },
    byTeam: overrides.byTeam ?? {},
  };
}

function buildMetadata(
  overrides: Partial<CalendarItem["metadata"]> = {},
): CalendarItem["metadata"] {
  return {
    ...overrides,
  } as CalendarItem["metadata"];
}

// =============================================================================
// 0. デフォルト値の健全性 (パレット内であること)
// =============================================================================

describe("デフォルト色定数", () => {
  it("デフォルト練習色・デフォルト大会色はいずれもパレット内の値である", () => {
    expect(PALETTE).toContain(DEFAULT_PRACTICE_COLOR);
    expect(PALETTE).toContain(DEFAULT_COMPETITION_COLOR);
  });

  it("デフォルト練習色とデフォルト大会色は異なる値である", () => {
    expect(DEFAULT_PRACTICE_COLOR).not.toBe(DEFAULT_COMPETITION_COLOR);
  });
});

// =============================================================================
// 1. 個人アイテム (team_id なし) の色解決
// =============================================================================

describe("resolveCalendarItemColor - 個人の練習 (practice)", () => {
  it("個人練習色が設定されていればそれを返す", () => {
    const settings = buildSettings({ personalPracticeColor: PALETTE[4] }); // 赤系
    const metadata = buildMetadata({});
    expect(resolveCalendarItemColor("practice", metadata, settings)).toBe(PALETTE[4]);
  });

  it("個人練習色が NULL ならデフォルト(緑hex)を返す (既存ユーザーの見た目不変)", () => {
    const settings = buildSettings({ personalPracticeColor: null });
    const metadata = buildMetadata({});
    expect(resolveCalendarItemColor("practice", metadata, settings)).toBe(DEFAULT_PRACTICE_COLOR);
  });

  it("practice_log も practice と同じ色解決ロジックを使う", () => {
    const settings = buildSettings({ personalPracticeColor: PALETTE[6] });
    const metadata = buildMetadata({});
    expect(resolveCalendarItemColor("practice_log", metadata, settings)).toBe(PALETTE[6]);
  });
});

describe("resolveCalendarItemColor - 個人の大会 (competition / entry / record)", () => {
  it("個人大会色が設定されていればそれを返す", () => {
    const settings = buildSettings({ personalCompetitionColor: PALETTE[7] });
    const metadata = buildMetadata({
      competition: { id: "c1", title: "大会", date: "2026-08-01", place: null, pool_type: 0 },
    });
    expect(resolveCalendarItemColor("competition", metadata, settings)).toBe(PALETTE[7]);
  });

  it("個人大会色が NULL ならデフォルト(青hex)を返す", () => {
    const settings = buildSettings({ personalCompetitionColor: null });
    const metadata = buildMetadata({});
    expect(resolveCalendarItemColor("competition", metadata, settings)).toBe(
      DEFAULT_COMPETITION_COLOR,
    );
  });

  it("entry (エントリー・記録未登録) は個人大会色を使う (team_id なしの場合)", () => {
    const settings = buildSettings({ personalCompetitionColor: PALETTE[8] });
    const metadata = buildMetadata({
      entry: { id: "e1", competition_id: "c1", user_id: "u1", style_id: 1, team_id: null },
    });
    expect(resolveCalendarItemColor("entry", metadata, settings)).toBe(PALETTE[8]);
  });

  it("record (記録バッジ) は個人大会色を使う (team_id なしの場合)", () => {
    const settings = buildSettings({ personalCompetitionColor: PALETTE[9] });
    const metadata = buildMetadata({
      record: {
        time: 60.5,
        is_relaying: false,
        style: { id: "1", name_jp: "自由形", distance: 50 },
      },
    });
    expect(resolveCalendarItemColor("record", metadata, settings)).toBe(PALETTE[9]);
  });
});

// =============================================================================
// 2. チームアイテム (team_id あり) の色解決 - team色 > 個人色 > デフォルト
// =============================================================================

describe("resolveCalendarItemColor - チームの練習 (team_practice)", () => {
  it("該当チームの練習色が設定されていればチーム色を返す (個人色より優先)", () => {
    const settings = buildSettings({
      personalPracticeColor: PALETTE[0],
      byTeam: { "team-1": { practice_color: PALETTE[3], competition_color: null } },
    });
    const metadata = buildMetadata({ team_id: "team-1", team: { id: "team-1", name: "Team A" } });
    expect(resolveCalendarItemColor("team_practice", metadata, settings)).toBe(PALETTE[3]);
  });

  it("該当チームの練習色が未設定なら個人練習色にフォールバックする", () => {
    const settings = buildSettings({
      personalPracticeColor: PALETTE[1],
      byTeam: { "team-1": { practice_color: null, competition_color: PALETTE[5] } },
    });
    const metadata = buildMetadata({ team_id: "team-1", team: { id: "team-1", name: "Team A" } });
    expect(resolveCalendarItemColor("team_practice", metadata, settings)).toBe(PALETTE[1]);
  });

  it("チーム色・個人色ともに未設定ならデフォルト(緑hex)を返す", () => {
    const settings = buildSettings({
      personalPracticeColor: null,
      byTeam: { "team-1": { practice_color: null, competition_color: null } },
    });
    const metadata = buildMetadata({ team_id: "team-1" });
    expect(resolveCalendarItemColor("team_practice", metadata, settings)).toBe(
      DEFAULT_PRACTICE_COLOR,
    );
  });

  it("byTeam に当該 team_id のエントリ自体が存在しない場合も個人色 → デフォルトにフォールバックする", () => {
    const settings = buildSettings({ personalPracticeColor: null, byTeam: {} });
    const metadata = buildMetadata({ team_id: "team-unknown" });
    expect(resolveCalendarItemColor("team_practice", metadata, settings)).toBe(
      DEFAULT_PRACTICE_COLOR,
    );
  });
});

describe("resolveCalendarItemColor - チームの大会 (team_competition / entry / record with team_id)", () => {
  it("該当チームの大会色が設定されていればチーム色を返す", () => {
    const settings = buildSettings({
      byTeam: { "team-2": { practice_color: null, competition_color: PALETTE[2] } },
    });
    const metadata = buildMetadata({
      team_id: "team-2",
      competition: {
        id: "c1",
        title: "チーム大会",
        date: "2026-09-01",
        place: null,
        pool_type: 0,
        team_id: "team-2",
      },
    });
    expect(resolveCalendarItemColor("team_competition", metadata, settings)).toBe(PALETTE[2]);
  });

  it("entry: team_id が付いた大会エントリーはチーム大会色が優先される", () => {
    // 判定観点: team_id は metadata 直下 (共通フィールド) と metadata.entry.team_id の
    // 両方に現れうる。実装は共通フィールド metadata.team_id を正として解決する。
    const settings = buildSettings({
      personalCompetitionColor: PALETTE[0],
      byTeam: { "team-2": { practice_color: null, competition_color: PALETTE[6] } },
    });
    const metadata = buildMetadata({
      team_id: "team-2",
      entry: { id: "e1", competition_id: "c1", user_id: "u1", style_id: 1, team_id: "team-2" },
    });
    expect(resolveCalendarItemColor("entry", metadata, settings)).toBe(PALETTE[6]);
  });

  it("record: team_id 付きの記録はチーム大会色 > 個人大会色 > デフォルトの順で解決する", () => {
    const settings = buildSettings({
      personalCompetitionColor: PALETTE[0],
      byTeam: { "team-2": { practice_color: null, competition_color: null } },
    });
    const metadata = buildMetadata({
      team_id: "team-2",
      record: {
        time: 30.12,
        is_relaying: false,
        style: { id: "1", name_jp: "平泳ぎ", distance: 50 },
      },
    });
    // チーム色未設定 → 個人色にフォールバック
    expect(resolveCalendarItemColor("record", metadata, settings)).toBe(PALETTE[0]);
  });
});

// =============================================================================
// 3. 同色許容 (練習色と大会色が同一でもエラーにしない)
// =============================================================================

describe("resolveCalendarItemColor - 同色設定", () => {
  it("個人の練習色と大会色が同一値でも、それぞれ正しく解決される (resolver 側はエラーにしない)", () => {
    const sameColor = PALETTE[4];
    const settings = buildSettings({
      personalPracticeColor: sameColor,
      personalCompetitionColor: sameColor,
    });
    const practiceMetadata = buildMetadata({});
    const competitionMetadata = buildMetadata({});
    expect(() =>
      resolveCalendarItemColor("practice", practiceMetadata, settings),
    ).not.toThrow();
    expect(resolveCalendarItemColor("practice", practiceMetadata, settings)).toBe(sameColor);
    expect(resolveCalendarItemColor("competition", competitionMetadata, settings)).toBe(
      sameColor,
    );
  });
});

// =============================================================================
// 4. team_id 有無の判定境界 (個人/チーム判定そのもの)
// =============================================================================

describe("resolveCalendarItemColor - team_id 有無による個人/チーム判定", () => {
  it("team_id が undefined の practice は個人色ロジックを使う", () => {
    const settings = buildSettings({ personalPracticeColor: PALETTE[0] });
    const metadata = buildMetadata({ team_id: undefined });
    expect(resolveCalendarItemColor("practice", metadata, settings)).toBe(PALETTE[0]);
  });

  it("team_id が null (明示的) の competition は個人色ロジックを使う (チーム扱いしない)", () => {
    const settings = buildSettings({ personalCompetitionColor: PALETTE[1] });
    const metadata = buildMetadata({
      competition: {
        id: "c1",
        title: "個人大会",
        date: "2026-08-01",
        place: null,
        pool_type: 0,
        team_id: null,
      },
      team_id: null,
    });
    expect(resolveCalendarItemColor("competition", metadata, settings)).toBe(PALETTE[1]);
  });

  it("team_id が空文字 '' の場合はクラッシュせず個人色にフォールバックする (境界値)", () => {
    // 空文字は truthy な team_id ではないため、実装は個人色ロジック側に分岐する。
    const settings = buildSettings({ personalPracticeColor: PALETTE[2] });
    const metadata = buildMetadata({ team_id: "" });
    expect(() => resolveCalendarItemColor("practice", metadata, settings)).not.toThrow();
    expect(resolveCalendarItemColor("practice", metadata, settings)).toBe(PALETTE[2]);
  });
});

// =============================================================================
// 5. 異常系・防御的境界値
// =============================================================================

describe("resolveCalendarItemColor - 異常系・防御的な境界値", () => {
  it("未知の CalendarItemType が渡されてもクラッシュせずデフォルト色を返す", () => {
    const settings = buildSettings();
    const metadata = buildMetadata({});
    // 実装は未知 type を防御的に practice 分類にフォールバックする。
    expect(() =>
      resolveCalendarItemColor(
        "unknown_type" as unknown as CalendarItemType,
        metadata,
        settings,
      ),
    ).not.toThrow();
    expect(
      resolveCalendarItemColor("unknown_type" as unknown as CalendarItemType, metadata, settings),
    ).toBe(DEFAULT_PRACTICE_COLOR);
  });

  it("settings.byTeam が空でも team_id 付きアイテムでクラッシュしない", () => {
    const settings = buildSettings({ byTeam: {} });
    const metadata = buildMetadata({ team_id: "team-x" });
    expect(() =>
      resolveCalendarItemColor("team_practice", metadata, settings),
    ).not.toThrow();
    expect(resolveCalendarItemColor("team_practice", metadata, settings)).toBe(
      DEFAULT_PRACTICE_COLOR,
    );
  });

  it("パレット外の hex 値が settings に混入していても resolver はそのまま返す (バリデーションは Zod 側の責務)", () => {
    // resolver 自体はバリデーションしない前提。不正値の拒否は
    // apps/shared/types/calendarColors.ts の Zod スキーマ側でテストする (別ファイル)。
    const settings = buildSettings({ personalPracticeColor: "#000000" });
    const metadata = buildMetadata({});
    expect(resolveCalendarItemColor("practice", metadata, settings)).toBe("#000000");
  });

  it("metadata が null/undefined でもクラッシュせず個人色ロジックにフォールバックする", () => {
    const settings = buildSettings({ personalPracticeColor: PALETTE[3] });
    expect(() => resolveCalendarItemColor("practice", null, settings)).not.toThrow();
    expect(resolveCalendarItemColor("practice", null, settings)).toBe(PALETTE[3]);
    expect(() => resolveCalendarItemColor("practice", undefined, settings)).not.toThrow();
    expect(resolveCalendarItemColor("practice", undefined, settings)).toBe(PALETTE[3]);
  });
});
