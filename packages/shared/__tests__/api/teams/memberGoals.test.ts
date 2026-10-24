/**
 * TeamMemberGoalsAPI.list (Sprint Contract v1)。
 * rpc 名と引数を呼び出し記録で assert する (引数を捨てるモックにしない)。
 * 書き込み系 / from() 直叩きをしないこと、エラーは握り潰さず throw することを見る。
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamMemberGoalsAPI } from "../../../api/teams/memberGoals";

function makeClient(rpcResult: { data: unknown; error: unknown }) {
  const rpcCalls: Array<[string, unknown]> = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    rpcCalls.push([name, args]);
    return Promise.resolve(rpcResult);
  });
  const fromTouched = vi.fn();
  const client = { rpc, from: fromTouched } as unknown as SupabaseClient;
  return { client, rpc, rpcCalls, fromTouched };
}

describe("TeamMemberGoalsAPI.list", () => {
  it("rpc 名 get_team_member_goals を { p_team_id, p_member_id } で1回だけ呼ぶ", async () => {
    const { client, rpcCalls } = makeClient({ data: [], error: null });
    await new TeamMemberGoalsAPI(client).list("team-A", "member-B");
    expect(rpcCalls).toEqual([
      ["get_team_member_goals", { p_team_id: "team-A", p_member_id: "member-B" }],
    ]);
  });

  it("引数の順序を取り違えない (team と member を入れ替えると別の呼び出しになる)", async () => {
    const { client, rpcCalls } = makeClient({ data: [], error: null });
    await new TeamMemberGoalsAPI(client).list("T", "M");
    const args = rpcCalls[0]![1] as { p_team_id: string; p_member_id: string };
    expect(args.p_team_id).toBe("T");
    expect(args.p_member_id).toBe("M");
  });

  it("RPC の行をそのまま (並べ替え・加工なしで) 返す", async () => {
    const rows = [{ id: "g2" }, { id: "g1" }];
    const { client } = makeClient({ data: rows, error: null });
    await expect(new TeamMemberGoalsAPI(client).list("t", "m")).resolves.toEqual(rows);
  });

  it("data が null なら空配列", async () => {
    const { client } = makeClient({ data: null, error: null });
    await expect(new TeamMemberGoalsAPI(client).list("t", "m")).resolves.toEqual([]);
  });

  it("error は握り潰さず、そのオブジェクトを throw する", async () => {
    const err = { message: "not an approved active admin of the team", code: "P0001" };
    const { client } = makeClient({ data: null, error: err });
    await expect(new TeamMemberGoalsAPI(client).list("t", "m")).rejects.toBe(err);
  });

  it("from() を一切呼ばない (テーブル直叩き・insert/update/delete/upsert をしない)", async () => {
    const { client, fromTouched } = makeClient({ data: [], error: null });
    await new TeamMemberGoalsAPI(client).list("t", "m");
    expect(fromTouched).not.toHaveBeenCalled();
  });

  it("呼ぶ rpc は読み取り用の get_team_member_goals のみ (書き込み系 rpc を呼ばない)", async () => {
    const { client, rpc } = makeClient({ data: [], error: null });
    await new TeamMemberGoalsAPI(client).list("t", "m");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["get_team_member_goals"]);
  });
});
