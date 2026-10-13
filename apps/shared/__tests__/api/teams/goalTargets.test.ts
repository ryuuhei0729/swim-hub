/**
 * TeamGoalTargetsAPI.listForCompetition (Sprint Contract goal_target_badge)
 * rpc 名と引数を呼び出し記録で assert (引数を捨てるモックにしない)。
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamGoalTargetsAPI } from "../../../api/teams/goalTargets";
import { findGoalTargetTime } from "../../../utils/goalTarget";

function makeClient(result: { data: unknown; error: unknown }) {
  const rpcCalls: Array<[string, unknown]> = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    rpcCalls.push([name, args]);
    return Promise.resolve(result);
  });
  const from = vi.fn();
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, rpcCalls, from };
}

describe("TeamGoalTargetsAPI.listForCompetition", () => {
  it("rpc 名 get_team_competition_goal_targets を { p_team_id, p_competition_id } で1回だけ呼ぶ", async () => {
    const { client, rpcCalls } = makeClient({ data: [], error: null });
    await new TeamGoalTargetsAPI(client).listForCompetition("team-A", "comp-B");
    expect(rpcCalls).toEqual([
      ["get_team_competition_goal_targets", { p_team_id: "team-A", p_competition_id: "comp-B" }],
    ]);
  });

  it("引数の順序を取り違えない (teamId → p_team_id / competitionId → p_competition_id)", async () => {
    const { client, rpcCalls } = makeClient({ data: [], error: null });
    await new TeamGoalTargetsAPI(client).listForCompetition("T", "C");
    const args = rpcCalls[0]![1] as { p_team_id: string; p_competition_id: string };
    expect(args.p_team_id).toBe("T");
    expect(args.p_competition_id).toBe("C");
  });

  it("各行に引数の competition_id を付与して返す (行ごとに厳密一致。他の列は変えない。RPC は1回)", async () => {
    const rows = [
      { user_id: "u1", style_id: 2, target_time: 28, status: "active" },
      { user_id: "u2", style_id: 2, target_time: 29, status: "cancelled" },
    ];
    const { client, rpc } = makeClient({ data: rows, error: null });
    const result = await new TeamGoalTargetsAPI(client).listForCompetition("t", "comp-X");
    expect(result).toStrictEqual([
      { competition_id: "comp-X", user_id: "u1", style_id: 2, target_time: 28, status: "active" },
      { competition_id: "comp-X", user_id: "u2", style_id: 2, target_time: 29, status: "cancelled" },
    ]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("付与する大会 id は teamId ではなく competitionId (取り違えない)", async () => {
    const { client } = makeClient({ data: [{ user_id: "u", style_id: 1, target_time: 1, status: "active" }], error: null });
    const [row] = await new TeamGoalTargetsAPI(client).listForCompetition("TEAM", "COMP");
    expect(row!.competition_id).toBe("COMP");
  });

  it("付与した結果は findGoalTargetTime で、別の大会 id では一致しない (型による照合強制の実効)", async () => {
    const { client } = makeClient({ data: [{ user_id: "u", style_id: 1, target_time: 30, status: "active" }], error: null });
    const rows = await new TeamGoalTargetsAPI(client).listForCompetition("t", "COMP");
    expect(findGoalTargetTime(rows, { userId: "u", styleId: 1, competitionId: "COMP" })).toBe(30);
    expect(findGoalTargetTime(rows, { userId: "u", styleId: 1, competitionId: "OTHER" })).toBeNull();
  });

  it("status で絞らない (cancelled もそのまま返す。絞りは TS の述語が担う)", async () => {
    const rows = [{ user_id: "u1", style_id: 2, target_time: 28, status: "cancelled" }];
    const { client } = makeClient({ data: rows, error: null });
    await expect(new TeamGoalTargetsAPI(client).listForCompetition("t", "c")).resolves.toHaveLength(1);
  });

  it("data が null なら空配列", async () => {
    const { client } = makeClient({ data: null, error: null });
    await expect(new TeamGoalTargetsAPI(client).listForCompetition("t", "c")).resolves.toEqual([]);
  });

  it("error は握り潰さず、そのオブジェクトを throw する", async () => {
    const err = { message: "competition does not belong to the team", code: "P0001" };
    const { client } = makeClient({ data: null, error: err });
    await expect(new TeamGoalTargetsAPI(client).listForCompetition("t", "c")).rejects.toBe(err);
  });

  it("from() を呼ばない (テーブル直叩き・書き込みをしない)", async () => {
    const { client, from } = makeClient({ data: [], error: null });
    await new TeamGoalTargetsAPI(client).listForCompetition("t", "c");
    expect(from).not.toHaveBeenCalled();
  });
});
