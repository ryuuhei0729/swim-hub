/**
 * TeamCalendarColorSection.legacyColor.test.tsx — 旧色の素通し検証
 *
 * ■ 何を守るテストか
 *   カレンダー色の保存は「**変更しない側の色を既存値のまま再送する**」実装
 *   (`handleChange` が practice/competition の両方を毎回送る)。
 *   2026-09-16 にパレットを 10色 → 8色 へ削減したため、**旧色 (`#7DD3FC` /
 *   `#D1D5DB`) を保存済みのユーザー**では、変更しない側にパレット外の値が乗る。
 *
 *   実際に web 側で「`PaletteColor` が `(typeof TAG_COLORS)[number]` (8色) のまま
 *   キャストしており、コメントは『常にパレット内であることを保証』と**事実に反していた**」
 *   というバグが見つかっている (App Dev が `STORABLE_TAG_COLORS` 由来へ修正)。
 *
 * ■ なぜ shared の tagColors.test.ts では足りないのか
 *   あちらは定数と Zod スキーマ (= 保存を許可する色の集合) を検証するもので、
 *   **消費側が既存値をそのまま送っているか**は見ていない。ここで壊れる形は
 *   「旧色を `null` に潰す」「8色へ丸める」といった**値の書き換え**で、
 *   定数テストでは検出できない。
 *
 *   ⚠️ shared のパレット検証を mobile にコピーしないこと。それはパレット定義の
 *   4つ目のコピーを作るのと同じで、今回直した問題を再発させる。
 *   型 (`PaletteColor`) そのものは `type` エイリアスなので実行時テストからは見えない。
 *   **観測可能なのは「mutate に渡る実引数」**なので、そこを固定する。
 *
 * ■ 検証観点
 *   [V-LC-01] 旧色が保存済みの側は、他方を変更しても**そのまま**再送される
 *   [V-LC-02] 変更した側は新しい色になる (素通しだけでなく更新も効いている対照)
 *   [V-LC-03] 逆向き (練習が旧色・大会を変更) でも同じ
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

const LEGACY = "#7DD3FC"; // 2026-09-16 にパレットから外した色 (手書き)
const NEW_COLOR = "#FCA5A5"; // 選択肢に残っている赤

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  byTeam: {} as Record<string, { practice_color: string | null; competition_color: string | null }>,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" } }),
}));

vi.mock("@apps/shared/hooks/queries/calendarColors", () => ({
  useCalendarColorSettingsQuery: () => ({
    settings: {
      personal: { practice_color: null, competition_color: null },
      byTeam: mocks.byTeam,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    updatePersonalColors: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    upsertTeamColors: { mutate: mocks.mutate, mutateAsync: vi.fn(), isPending: false },
    deleteTeamColors: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { TeamCalendarColorSection } from "../TeamCalendarColorSection";

const TEAM_ID = "team-1";

/** ラベル+色のスウォッチを押す (accessibilityLabel は RN モックでそのまま属性になる) */
function clickSwatch(label: string, color: string) {
  const el = document.querySelector(`[accessibilitylabel="${label}: ${color}"]`);
  expect(el, `スウォッチ「${label}: ${color}」が見つからない`).not.toBeNull();
  fireEvent.click(el!);
}

describe("TeamCalendarColorSection — 旧色の素通し", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.byTeam = {};
  });

  it("[V-LC-01/02] 大会色が旧色のまま練習色を変更すると、大会色は旧色のまま再送される", () => {
    mocks.byTeam = { [TEAM_ID]: { practice_color: null, competition_color: LEGACY } };
    render(<TeamCalendarColorSection teamId={TEAM_ID} />);

    clickSwatch("練習", NEW_COLOR);

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      // [V-LC-02] 変更した側は新しい色
      practice_color: NEW_COLOR,
      // [V-LC-01] 🚨 変更していない側は**旧色のまま**。null に潰したり
      // 8色へ丸めたりすると、ユーザーの設定が黙って書き換わる
      competition_color: LEGACY,
    });
  });

  it("[V-LC-03] 逆向き: 練習色が旧色のまま大会色を変更しても練習色は保たれる", () => {
    mocks.byTeam = { [TEAM_ID]: { practice_color: LEGACY, competition_color: null } };
    render(<TeamCalendarColorSection teamId={TEAM_ID} />);

    clickSwatch("大会", NEW_COLOR);

    expect(mocks.mutate).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      practice_color: LEGACY,
      competition_color: NEW_COLOR,
    });
  });

  it("[V-LC-01 対照] 旧色が無い場合は null がそのまま送られる (素通しが値を捏造しない)", () => {
    mocks.byTeam = { [TEAM_ID]: { practice_color: null, competition_color: null } };
    render(<TeamCalendarColorSection teamId={TEAM_ID} />);

    clickSwatch("練習", NEW_COLOR);

    expect(mocks.mutate).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      practice_color: NEW_COLOR,
      competition_color: null,
    });
  });

  it("旧色が保存済みでもピッカーは8色のまま、選択状態にはならない", () => {
    mocks.byTeam = { [TEAM_ID]: { practice_color: LEGACY, competition_color: null } };
    render(<TeamCalendarColorSection teamId={TEAM_ID} />);

    // 練習行のスウォッチはちょうど8個 (旧色は選択肢に復活しない)
    const swatches = document.querySelectorAll('[accessibilitylabel^="練習: "]');
    expect(swatches).toHaveLength(8);
    expect(document.querySelector(`[accessibilitylabel="練習: ${LEGACY}"]`)).toBeNull();

    // 旧色は選択肢に無いのでチェックマークはどこにも付かない
    const practiceRow = swatches[0]!.parentElement!;
    expect(practiceRow.querySelectorAll('[data-testid="icon-check"]')).toHaveLength(0);
  });
});
