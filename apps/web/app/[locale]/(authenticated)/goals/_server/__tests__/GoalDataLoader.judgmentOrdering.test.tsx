/**
 * GoalDataLoader (Server Component) — マイルストーン判定の呼び出し順序
 *
 * チーム管理者による代理保存 (練習・大会記録の代理入力) は保存時点ではマイルストーン
 * 判定を行わない (遅延評価)。対象メンバー本人が /goals を開いたこのセッションで
 * GoalAPI.updateAllMilestoneStatuses(user.id) を1回走らせてから目標一覧を取得する
 * ことで、代理保存分も反映された一覧を表示する。並列取得にすると判定前の一覧を
 * 返しうるため、判定を待ってから一覧取得を開始する直列実行が必須。
 *
 * 本テストは:
 *  - updateAllMilestoneStatuses が getGoals/getSelectableCompetitions/getStyles より
 *    先に、かつ完了を待ってから呼ばれることを呼び出し順序で assert する
 *  - 判定が失敗 (reject) しても、一覧取得は実行され画面が落ちない
 *    (GoalDataLoader 自体が例外を投げない) ことを assert する
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  updateAllMilestoneStatuses: vi.fn(),
  getGoals: vi.fn(),
  getSelectableCompetitions: vi.fn(),
  getStyles: vi.fn(),
}));

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  createAuthenticatedServerClient: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/data-loaders/common", () => ({
  getStyles: (...args: unknown[]) => {
    mocks.callOrder.push("getStyles");
    return mocks.getStyles(...args);
  },
}));

vi.mock("@apps/shared/api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    updateAllMilestoneStatuses: (...args: unknown[]) => {
      mocks.callOrder.push("updateAllMilestoneStatuses");
      return mocks.updateAllMilestoneStatuses(...args);
    },
    getGoals: (...args: unknown[]) => {
      mocks.callOrder.push("getGoals");
      return mocks.getGoals(...args);
    },
    getSelectableCompetitions: (...args: unknown[]) => {
      mocks.callOrder.push("getSelectableCompetitions");
      return mocks.getSelectableCompetitions(...args);
    },
  })),
}));

vi.mock("../../_client/GoalsClient", () => ({
  __esModule: true,
  default: (props: { initialGoals: unknown[] }) => (
    <div data-testid="goals-client-stub">{props.initialGoals.length}</div>
  ),
}));

import GoalDataLoader from "../GoalDataLoader";

describe("GoalDataLoader — マイルストーン判定の呼び出し順序", () => {
  beforeEach(() => {
    mocks.callOrder.length = 0;
    mocks.updateAllMilestoneStatuses.mockReset().mockResolvedValue(undefined);
    mocks.getGoals.mockReset().mockResolvedValue([]);
    mocks.getSelectableCompetitions.mockReset().mockResolvedValue([]);
    mocks.getStyles.mockReset().mockResolvedValue([]);
  });

  it("updateAllMilestoneStatuses が getGoals/getSelectableCompetitions/getStyles より先に呼ばれる (呼び出し順)", async () => {
    const element = await GoalDataLoader();
    render(element);

    await waitFor(() => expect(mocks.getGoals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getSelectableCompetitions).toHaveBeenCalledTimes(1));

    const judgmentIndex = mocks.callOrder.indexOf("updateAllMilestoneStatuses");
    const goalsIndex = mocks.callOrder.indexOf("getGoals");
    const competitionsIndex = mocks.callOrder.indexOf("getSelectableCompetitions");
    const stylesIndex = mocks.callOrder.indexOf("getStyles");

    expect(judgmentIndex).toBe(0);
    expect(judgmentIndex).toBeLessThan(goalsIndex);
    expect(judgmentIndex).toBeLessThan(competitionsIndex);
    expect(judgmentIndex).toBeLessThan(stylesIndex);
  });

  it("updateAllMilestoneStatuses の解決を待ってから getGoals/getSelectableCompetitions/getStyles が呼ばれる (呼ばれた/呼ばれていないだけでなく、完了待ちであること自体を確認)", async () => {
    // 呼び出し順序 (どちらが先に呼ばれ始めるか) だけでは、await せず並列発火した
    // 場合でも「呼ばれる順」自体はソースコードの記述順と一致しうるため検出できない
    // (実引数の同期評価順とマイクロタスクの実行順は別物)。ここでは判定の Promise を
    // 明示的に「まだ解決していない」状態に固定し、その間 getGoals 等が一切呼ばれて
    // いないことを確認してから解決させる、という直接的な確認方法を取る。
    let resolveJudgment!: () => void;
    mocks.updateAllMilestoneStatuses.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveJudgment = resolve;
        }),
    );

    const loaderPromise = GoalDataLoader();

    // マイクロタスクを1周させても、判定が未解決の間は後続の一覧取得が呼ばれていない。
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.getGoals).not.toHaveBeenCalled();
    expect(mocks.getSelectableCompetitions).not.toHaveBeenCalled();
    expect(mocks.getStyles).not.toHaveBeenCalled();

    resolveJudgment();
    const element = await loaderPromise;
    render(element);

    await waitFor(() => expect(mocks.getGoals).toHaveBeenCalledTimes(1));
    expect(mocks.getSelectableCompetitions).toHaveBeenCalledTimes(1);
  });

  it("判定 (updateAllMilestoneStatuses) が失敗しても、一覧取得は実行され GoalDataLoader は例外を投げない", async () => {
    mocks.updateAllMilestoneStatuses.mockRejectedValue(new Error("judgment failed"));

    let element!: React.ReactElement;
    await expect(
      (async () => {
        element = await GoalDataLoader();
      })(),
    ).resolves.not.toThrow();

    render(element);

    await waitFor(() => expect(mocks.getGoals).toHaveBeenCalledTimes(1));
    expect(mocks.getSelectableCompetitions).toHaveBeenCalledTimes(1);
  });
});
