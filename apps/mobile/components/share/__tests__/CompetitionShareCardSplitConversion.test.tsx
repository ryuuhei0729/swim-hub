/**
 * CompetitionShareCard (mobile) の DB SplitTime → UI SplitTime 変換テスト
 *
 * Sprint Contract: GitHub Issue #13 Stage1 (SplitTime 同一リポ内衝突の解消)
 *
 * 背景 (PM 裁定):
 *   `apps/mobile/utils/lapTimeCalculator.ts` の `SplitTime` (UI 計算型,
 *   `{ distance, splitTime }`) は web 版と同じ名前で `apps/shared/types/record.ts` の
 *   DB レコード型 `SplitTime` (`{ distance, split_time, ... }`) と概念が衝突している。
 *   Stage1 で mobile 側の lapTimeCalculator の `SplitTime` も別名にリネームする。
 *
 *   型のリネームは実行時の挙動を変えないため、このテストは型名ではなく、
 *   `CompetitionShareCard.tsx` の実際の変換ロジック (49-53行目の `validSplitTimes`
 *   生成部分) を DB 形状 ({ distance, split_time }) の実データで駆動し、
 *   `split_time` → `splitTime` への変換とラップタイムテーブル描画が正しく
 *   行われることを検証する。リネームの前後で挙動が変わらないことを保証する
 *   回帰ガードであり、Stage1 実装 (リネーム) の前後を通じて green であることが期待値。
 *
 * Sprint Contract 検証観点:
 *   [V-1-B-mobile] DB形状 ({ distance, split_time }) の splitTimes を渡しても
 *           distance/split_time だけが正しく distance/splitTime に変換され、
 *           ラップタイムテーブルが正しい値で描画される
 *
 * 依存モック方針:
 *   CompetitionShareCard → BestTimeBadge (getBadgeState 目的のimportだが、
 *   モジュール評価時に同ファイル冒頭の useAuth/RecordAPI/react-query import が
 *   評価されるため) → contexts/AuthProvider → google-auth.ts という依存チェーンを
 *   vitest が解決できるよう、既存の
 *   apps/mobile/components/share/__tests__/PracticeShareCard.test.tsx と同一の
 *   expo-auth-session / expo-web-browser モックを踏襲する。
 *
 * トートロジー防止メモ:
 *   期待値は web 版と同じ lapTimeCalculator.ts の計算式
 *   (`apps/web/__tests__/utils/lapTimeCalculator.test.ts` で独立検証済み) を
 *   手計算して算出した。mobile コンポーネント実装の diff を読んでコピーしたものではない。
 */
import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";

vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(() => "swimhub://auth/callback"),
  ResponseType: { Token: "token", Code: "code" },
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

import { CompetitionShareCard } from "../CompetitionShareCard";
import type { CompetitionShareData } from "../types";

function resolveKey(key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}
function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name) => (name in values ? String(values[name]) : `{${name}}`));
}
const t = ((key: string, options?: Record<string, unknown>) => {
  const raw = resolveKey(key);
  if (raw === undefined) return key;
  return options && Object.keys(options).length > 0 ? interpolate(raw, options) : raw;
}) as unknown as TFunction;

function makeShareData(overrides: Partial<CompetitionShareData>): CompetitionShareData {
  return {
    competitionName: "テスト大会",
    date: "2026年1月1日",
    place: "テストプール",
    poolType: "short",
    eventName: "100m 自由形",
    raceDistance: 100,
    time: 0,
    ...overrides,
  };
}

describe("CompetitionShareCard (mobile) — DB SplitTime → UI SplitTime 変換 (Stage1 回帰ガード)", () => {
  it("[V-1-B-mobile] DB形状の4件のsplitTimesから100m自由形のラップタイムテーブルが正しく描画される", () => {
    const data = makeShareData({
      time: 56.0,
      splitTimes: [
        { distance: 25, split_time: 12.0 },
        { distance: 50, split_time: 25.5 },
        { distance: 75, split_time: 40.0 },
        { distance: 100, split_time: 56.0 },
      ],
    });

    render(<CompetitionShareCard data={data} t={t} />);

    // distance 列: DB の distance がそのまま distance 列に使われている ("{distance}m" テンプレート)
    expect(screen.getByText("25m")).toBeTruthy();
    expect(screen.getByText("50m")).toBeTruthy();
    expect(screen.getByText("75m")).toBeTruthy();
    expect(screen.getByText("100m")).toBeTruthy();

    // splitTime 列: DB の split_time が UI の splitTime に変換されて表示されている
    expect(screen.getByText("40.00")).toBeTruthy(); // 75m行(重複なしの一意な値)
    // 25m行の splitTime(12.00) は同じ行の lap25 列とも一致する(区間の最初の split は
    // lap-time が split-time自身と一致するという lapTimeCalculator のドメイン上不可避な性質)
    expect(screen.getAllByText("12.00")).toHaveLength(2);
    // 50m行の splitTime(25.50) は同じ行の lap50 列とも一致する(50m=interval50の最初の区間のため)
    expect(screen.getAllByText("25.50")).toHaveLength(2);
    // 100m行の splitTime(56.00) はカード上部の合計タイム表示とも一致する
    expect(screen.getAllByText("56.00")).toHaveLength(2);

    // lap (25m区間)列
    expect(screen.getByText("13.50")).toBeTruthy(); // 50m地点 = 25.50 - 12.00
    expect(screen.getByText("14.50")).toBeTruthy(); // 75m地点 = 40.00 - 25.50
    expect(screen.getByText("16.00")).toBeTruthy(); // 100m地点 = 56.00 - 40.00

    // lap (50m区間)列
    expect(screen.getByText("30.50")).toBeTruthy(); // 100m地点 = 56.00 - 25.50
    expect(screen.getAllByText("–")).toHaveLength(2); // 25m行・75m行の lap50 セル
  });

  it("[V-1-B-mobile-異常系] distance<=0 または split_time<=0 のDBレコードは変換元から除外される(既存フィルタの回帰確認)", () => {
    const data = makeShareData({
      eventName: "50m 自由形",
      raceDistance: 50,
      time: 26.0,
      splitTimes: [
        { distance: 0, split_time: 0 }, // distance<=0 → 除外
        { distance: 50, split_time: 0 }, // split_time<=0 → 除外
      ],
    });

    render(<CompetitionShareCard data={data} t={t} />);

    expect(screen.queryByText(t("recordMobile.tableHeaderDistance"))).toBeNull();
    expect(screen.queryByText(t("recordMobile.tableHeaderSplit"))).toBeNull();
  });
});
