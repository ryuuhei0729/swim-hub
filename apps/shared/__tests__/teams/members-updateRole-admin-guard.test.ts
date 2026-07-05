/**
 * Issue #39 QA テスト: updateRole の requireTeamAdmin ガード検証
 *
 * 対象: apps/shared/api/teams/members.ts - updateRole()
 * 観点: admin 権限チェックが先頭で実行され、非 admin は拒否される
 *
 * QA Engineer (Evaluator) が Sprint Contract に基づいて独立に作成。
 * Developer 実装コードをコピーせず、仕様から観点を導出している。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamMembersAPI } from "../../api/teams/members";
import { createSupabaseMock } from "../utils/supabase-mock";

describe("TeamMembersAPI.updateRole - requireTeamAdmin ガード", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamMembersAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock(); // userId = "test-user-id"
    api = new TeamMembersAPI(supabaseMock.client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * requireTeamAdmin は内部で以下を実行する:
   *   supabase.from("team_memberships").select("role").eq(...).eq(...).eq(...).eq(...).single()
   * → single() が { data: null } を返す = admin 不在 → "管理者権限が必要です" を throw
   *
   * supabase-mock の queueTable は先頭 queue エントリを消費する。
   * updateRole 内の呼び出し順:
   *   1回目: requireTeamAdmin → team_memberships SELECT + single()
   *   2回目: 実際の UPDATE → team_memberships UPDATE + select + single
   *
   * 非 admin ケース: 1回目のキューで { data: null } を返し、throw させる。
   */
  it("admin 権限のないユーザーが updateRole を呼ぶと '管理者権限が必要です' で reject される", async () => {
    // requireTeamAdmin: team_memberships.select().eq().eq().eq().eq().single() → data=null (非 admin)
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateRole("team-1", "member-1", "admin")).rejects.toThrow(
      "管理者権限が必要です",
    );
  });

  it("admin 権限のないユーザーの場合、実際の UPDATE クエリは実行されない", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateRole("team-1", "member-1", "user")).rejects.toThrow(
      "管理者権限が必要です",
    );

    // team_memberships が呼ばれたのは 1 回（admin チェック）のみ。
    // UPDATE の呼び出しが発生していないこと（2回目の from("team_memberships") が発生していない）。
    const history = supabaseMock.getBuilderHistory("team_memberships");
    expect(history).toHaveLength(1);
    // UPDATE は呼ばれていないはず
    expect(history[0].update).not.toHaveBeenCalled();
  });

  it("admin 権限がある場合は updateRole が成功し、UPDATE が実行される", async () => {
    const adminMembership = { role: "admin" };
    const updatedMembership = {
      id: "membership-1",
      team_id: "team-1",
      user_id: "member-1",
      role: "user",
    };

    supabaseMock.queueTable("team_memberships", [
      // 1回目: requireTeamAdmin → admin あり
      {
        data: adminMembership,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: adminMembership, error: null });
        },
      },
      // 2回目: UPDATE → 成功
      {
        data: updatedMembership,
        configure: (builder) => {
          builder.update.mockReturnValue(builder);
          builder.single.mockResolvedValue({ data: updatedMembership, error: null });
        },
      },
    ]);

    const result = await api.updateRole("team-1", "member-1", "user");

    expect(result).toEqual(updatedMembership);

    const history = supabaseMock.getBuilderHistory("team_memberships");
    // 2 回の team_memberships アクセス（admin チェック + UPDATE）
    expect(history).toHaveLength(2);
    // 2回目が UPDATE であること
    expect(history[1].update).toHaveBeenCalledWith({ role: "user" });
    expect(history[1].eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(history[1].eq).toHaveBeenCalledWith("user_id", "member-1");
  });

  it("admin チェック中に DB エラーが発生した場合は DB エラーが伝播する", async () => {
    const dbError = new Error("connection error");

    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: dbError });
        },
      },
    ]);

    await expect(api.updateRole("team-1", "member-1", "admin")).rejects.toThrow(
      "管理者権限の確認中にエラーが発生しました",
    );
  });

  it("updateRole は teamId を admin チェックに使用する（user_id と team_id の組み合わせで確認）", async () => {
    // data=null で非 admin 扱い → throw
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateRole("team-99", "member-1", "admin")).rejects.toThrow(
      "管理者権限が必要です",
    );

    // requireTeamAdmin が team_id と user_id と is_active と role で eq を呼ぶこと
    const history = supabaseMock.getBuilderHistory("team_memberships");
    expect(history[0].eq).toHaveBeenCalledWith("team_id", "team-99");
    expect(history[0].eq).toHaveBeenCalledWith("user_id", "test-user-id"); // auth.getUser() のユーザー
    expect(history[0].eq).toHaveBeenCalledWith("is_active", true);
    expect(history[0].eq).toHaveBeenCalledWith("role", "admin");
  });
});
