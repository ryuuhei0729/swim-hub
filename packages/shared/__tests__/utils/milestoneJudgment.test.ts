// =============================================================================
// shared/utils/milestoneJudgment.test.ts  (S7, D1, A10)
// =============================================================================
// 壊したら赤: try/catch を外す -> reject ケース赤 / userId を渡さない -> 引数 assert 赤 /
//   2回呼ぶ -> 回数 assert 赤 / production でも console.error を出す -> A10 ケース赤
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoalAPI } from "../../api/goals";
import { runMilestoneJudgment } from "../../utils/milestoneJudgment";

function makeApi(impl: () => Promise<unknown>) {
  const updateAllMilestoneStatuses = vi.fn(impl);
  return { api: { updateAllMilestoneStatuses } as unknown as GoalAPI, updateAllMilestoneStatuses };
}

describe("runMilestoneJudgment", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    errSpy.mockRestore();
  });

  it("updateAllMilestoneStatuses を userId 引数でちょうど1回呼び、undefined を返す", async () => {
    const { api, updateAllMilestoneStatuses } = makeApi(async () => undefined);
    await expect(runMilestoneJudgment(api, "user-123")).resolves.toBeUndefined();
    expect(updateAllMilestoneStatuses).toHaveBeenCalledTimes(1);
    expect(updateAllMilestoneStatuses).toHaveBeenCalledWith("user-123");
  });

  it("reject しても resolve する (後続の一覧取得を止めない)", async () => {
    const { api } = makeApi(async () => {
      throw new Error("boom");
    });
    await expect(runMilestoneJudgment(api, "u")).resolves.toBeUndefined();
  });

  it("同期 throw でも resolve する", async () => {
    const api = {
      updateAllMilestoneStatuses: vi.fn(() => {
        throw new Error("sync boom");
      }),
    } as unknown as GoalAPI;
    await expect(runMilestoneJudgment(api, "u")).resolves.toBeUndefined();
  });

  it("非 production では失敗時に console.error を1回出す", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { api } = makeApi(async () => {
      throw new Error("boom");
    });
    await runMilestoneJudgment(api, "u");
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it("production では失敗しても console.error を出さない (現行 web と同挙動 / A10)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { api } = makeApi(async () => {
      throw new Error("boom");
    });
    await runMilestoneJudgment(api, "u");
    expect(errSpy).not.toHaveBeenCalled();
  });
});
