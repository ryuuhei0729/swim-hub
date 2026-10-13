/**
 * calculateGoalProgress が computeGoalProgress を唯一の式の定義元として使うことの固定
 * (Sprint Contract v1 S6: 式の二重定義を避ける)。
 *
 * - 振る舞い: computeGoalProgress をセンチネル値を返すモックに差し替え、
 *   calculateGoalProgress がその戻り値をそのまま返し、正しい引数で呼ぶことを見る。
 *   (式を再計算していればセンチネルにならず赤になる)
 * - 水路不明 (競合の competition が無い) では computeGoalProgress を呼ばず null を返す
 *   (「—」と 0% の区別は呼び出し側の責務)。
 * - 静的: goals.ts に旧インライン式の痕跡が残っていない。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const computeGoalProgressMock = vi.hoisted(() => vi.fn());
vi.mock("../../utils/goalProgress", () => ({
  computeGoalProgress: computeGoalProgressMock,
}));

import { createMockSupabaseClient } from "../../__mocks__/supabase";
import { GoalAPI } from "../../api/goals";

const SENTINEL = 12.345;

function buildApi(opts: { competition: { pool_type: number } | null; bestTime: number | null }) {
  const client = createMockSupabaseClient({ userId: "user-1" });
  const recordsEq: Array<[string, unknown]> = [];
  client.from = vi.fn((table: string) => {
    if (table === "goals") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "goal-1",
            style_id: 3,
            start_time: 70,
            target_time: 60,
            competition: opts.competition,
          },
          error: null,
        }),
      };
    }
    if (table === "records") {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn((c: string, v: unknown) => {
        recordsEq.push([c, v]);
        return b;
      });
      b.order = vi.fn(() => b);
      b.limit = vi.fn(() => b);
      b.single = vi.fn().mockResolvedValue(
        opts.bestTime === null
          ? { data: null, error: { code: "PGRST116" } }
          : { data: { time: opts.bestTime }, error: null },
      );
      return b;
    }
    throw new Error(`unexpected table ${table}`);
  }) as unknown as typeof client.from;
  return { api: new GoalAPI(client), recordsEq };
}

describe("GoalAPI.calculateGoalProgress と computeGoalProgress", () => {
  beforeEach(() => {
    computeGoalProgressMock.mockReset();
    computeGoalProgressMock.mockReturnValue(SENTINEL);
  });

  it("戻り値は computeGoalProgress の結果そのもの (式を再計算しない)", async () => {
    const { api } = buildApi({ competition: { pool_type: 1 }, bestTime: 65 });
    await expect(api.calculateGoalProgress("goal-1")).resolves.toBe(SENTINEL);
  });

  it("start / target / best を正しい名前つき引数で渡す", async () => {
    const { api } = buildApi({ competition: { pool_type: 1 }, bestTime: 65 });
    await api.calculateGoalProgress("goal-1");
    expect(computeGoalProgressMock).toHaveBeenCalledTimes(1);
    expect(computeGoalProgressMock).toHaveBeenCalledWith({
      startTime: 70,
      targetTime: 60,
      currentBestTime: 65,
    });
  });

  it("ベスト記録が無いとき currentBestTime は null で渡される", async () => {
    const { api } = buildApi({ competition: { pool_type: 1 }, bestTime: null });
    await api.calculateGoalProgress("goal-1");
    expect(computeGoalProgressMock).toHaveBeenCalledWith({
      startTime: 70,
      targetTime: 60,
      currentBestTime: null,
    });
  });

  it("水路不明 (大会なし) は computeGoalProgress を呼ばず null を返し、records も引かない", async () => {
    const { api, recordsEq } = buildApi({ competition: null, bestTime: 65 });
    await expect(api.calculateGoalProgress("goal-1")).resolves.toBeNull();
    expect(computeGoalProgressMock).not.toHaveBeenCalled();
    expect(recordsEq).toEqual([]);
  });

  it("ベスト取得は大会の水路で絞る (pool_type 条件が渡る)", async () => {
    const { api, recordsEq } = buildApi({ competition: { pool_type: 0 }, bestTime: 65 });
    await api.calculateGoalProgress("goal-1");
    expect(recordsEq).toContainEqual(["pool_type", 0]);
    expect(recordsEq).toContainEqual(["is_relaying", false]);
  });
});

describe("goals.ts の静的チェック (式の二重定義が無い)", () => {
  const src = readFileSync(resolve(__dirname, "../../api/goals.ts"), "utf8");

  it("旧インライン式 (targetImprovement / クランプ式) が残っていない", () => {
    expect(src).not.toMatch(/targetImprovement/);
    expect(src).not.toMatch(/Math\.min\(\s*Math\.max\(/);
  });

  it("computeGoalProgress の呼び出しはちょうど1箇所 (アンカー件数)", () => {
    expect(src.match(/computeGoalProgress\(/g)?.length).toBe(1);
  });

  it("getBestTimeForStyle に SQL 関数との相互参照コメントがある", () => {
    expect(src).toMatch(/get_team_member_goals/);
  });
});
