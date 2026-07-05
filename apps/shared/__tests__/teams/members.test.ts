import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamMembersAPI } from "../../api/teams/members";
import { createSupabaseMock } from "../utils/supabase-mock";

describe("TeamMembersAPI", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamMembersAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    supabaseMock = createSupabaseMock();
    api = new TeamMembersAPI(supabaseMock.client);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("list", () => {
    it("チームメンバー一覧を取得できる", async () => {
      const members = [{ id: "membership-1", team_id: "team-1", user_id: "test-user-id" }];

      supabaseMock.queueTable("team_memberships", [{ data: members }]);

      const result = await api.list("team-1");

      expect(result).toEqual(members);
      const builder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(builder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(builder.eq).toHaveBeenCalledWith("status", "approved");
      expect(builder.eq).toHaveBeenCalledWith("is_active", true);
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamMembersAPI(supabaseMock.client);

      await expect(api.list("team-1")).rejects.toThrow("認証が必要です");
    });
  });

  describe("join", () => {
    // join() は招待コード検証・既存メンバーシップ判定・INSERT/UPDATE をすべて
    // SECURITY DEFINER RPC (request_join_team) 内で完結させる実装に変更された
    // (#42: 招待コード無しでの pending 行乱造を RLS 層で禁止するため)。
    // そのため TeamMembersAPI.join() は supabase.rpc("request_join_team", ...) を
    // 呼び出すだけの薄いラッパーになっており、テストも RPC の戻り値(jsonb)を
    // モックする形に統一する。
    it("招待コードを使ってチームに参加申請できる（承認待ち）", async () => {
      const membership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "test-user-id",
        role: "user",
        status: "pending",
        joined_at: "2025-01-01T00:00:00.000Z",
        is_active: false,
        left_at: null,
      };

      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: true, membership },
        error: null,
      });
      supabaseMock.client.rpc = rpcMock;

      const result = await api.join("CODE");

      expect(result).toEqual(membership);
      expect(rpcMock).toHaveBeenCalledWith("request_join_team", { p_invite_code: "CODE" });
    });

    it("招待コードが無効な場合はエラーとなる", async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: false, error: "招待コードが正しくありません" },
        error: null,
      });
      supabaseMock.client.rpc = rpcMock;

      await expect(api.join("INVALID")).rejects.toThrow("招待コードが正しくありません");
    });

    it("RPC呼び出し自体がエラーになった場合は例外を投げる", async () => {
      const rpcError = new Error("rpc call failed");
      const rpcMock = vi.fn().mockResolvedValue({
        data: null,
        error: rpcError,
      });
      supabaseMock.client.rpc = rpcMock;

      await expect(api.join("CODE")).rejects.toThrow(rpcError);
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamMembersAPI(supabaseMock.client);

      await expect(api.join("CODE")).rejects.toThrow("認証が必要です");
    });
  });

  describe("leave", () => {
    it("自身のチームメンバーシップを退会できる", async () => {
      supabaseMock.queueTable("team_memberships", [
        {
          data: null,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
          },
        },
      ]);

      await api.leave("team-1");

      const builder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(builder.update).toHaveBeenCalled();
      const updateArg = builder.update.mock.calls[0][0];
      expect(updateArg.is_active).toBe(false);
      expect(updateArg.left_at).toEqual(new Date("2025-01-01T00:00:00Z").toISOString());
      expect(builder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamMembersAPI(supabaseMock.client);

      await expect(api.leave("team-1")).rejects.toThrow("認証が必要です");
    });
  });

  describe("updateRole", () => {
    it("メンバーのロールを更新できる", async () => {
      const adminMembership = { role: "admin" };
      const updated = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "member-1",
        role: "admin",
      };

      supabaseMock.queueTable("team_memberships", [
        {
          // 1つ目: requireTeamAdmin による管理者権限チェック
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 2つ目: ロール更新 UPDATE
          data: updated,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
          },
        },
      ]);

      const result = await api.updateRole("team-1", "member-1", "admin");

      expect(result).toEqual(updated);
      const adminBuilder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(adminBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(adminBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
      expect(adminBuilder.eq).toHaveBeenCalledWith("is_active", true);
      const updateBuilder = supabaseMock.getBuilderHistory("team_memberships")[1];
      expect(updateBuilder.update).toHaveBeenCalledWith({ role: "admin" });
      expect(updateBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(updateBuilder.eq).toHaveBeenCalledWith("user_id", "member-1");
    });

    it("更新時にエラーが発生した場合は例外を投げる", async () => {
      const adminMembership = { role: "admin" };
      const updateError = new Error("update failed");

      supabaseMock.queueTable("team_memberships", [
        {
          // 1つ目: requireTeamAdmin 通過（admin あり）
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 2つ目: UPDATE でエラー発生
          data: null,
          error: updateError,
        },
      ]);

      await expect(api.updateRole("team-1", "member-1", "admin")).rejects.toThrow(updateError);
    });
  });

  describe("remove", () => {
    it("指定メンバーを退会させることができる", async () => {
      supabaseMock.queueTable("team_memberships", [
        {
          data: null,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
          },
        },
      ]);

      await api.remove("team-1", "member-1");

      const builder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(builder.update).toHaveBeenCalled();
      expect(builder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "member-1");
    });

    it("退会処理でエラーが発生した場合は例外を投げる", async () => {
      const error = new Error("remove failed");
      supabaseMock.queueTable("team_memberships", [{ data: null, error }]);

      await expect(api.remove("team-1", "member-1")).rejects.toThrow(error);
    });
  });

  describe("listPending", () => {
    it("承認待ちのメンバーシップ一覧を取得できる", async () => {
      const pendingMembers = [
        { id: "membership-1", team_id: "team-1", user_id: "user-1", status: "pending" },
        { id: "membership-2", team_id: "team-1", user_id: "user-2", status: "pending" },
      ];

      const adminMembership = { role: "admin" };

      supabaseMock.queueTable("team_memberships", [
        {
          // 1つ目: 管理者権限チェック
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 2つ目: 承認待ちメンバーシップ一覧
          data: pendingMembers,
        },
      ]);

      const result = await api.listPending("team-1");

      expect(result).toEqual(pendingMembers);
      const adminBuilder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(adminBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(adminBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
      expect(adminBuilder.eq).toHaveBeenCalledWith("is_active", true);
      const listBuilder = supabaseMock.getBuilderHistory("team_memberships")[1];
      expect(listBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(listBuilder.eq).toHaveBeenCalledWith("status", "pending");
    });
  });

  describe("countPending", () => {
    it("承認待ちのメンバーシップ数を取得できる", async () => {
      const adminMembership = { role: "admin" };

      supabaseMock.queueTable("team_memberships", [
        {
          // 1つ目: 管理者権限チェック
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 2つ目: カウント取得
          data: null,
          error: null,
          configure: (builder) => {
            // select()が呼ばれたときにcountを含むレスポンスを返す
            builder.select.mockImplementation((columns, options) => {
              if (options && "count" in options && options.count === "exact") {
                // then()でcountを含むレスポンスを返す
                /* biome-ignore lint/suspicious/noThenProperty: Supabaseのthenableクエリビルダーをモックするため */
                builder.then = <TResult1 = unknown, TResult2 = never>(
                  onfulfilled?:
                    | ((value: {
                        data: unknown;
                        error: unknown;
                        count?: number;
                      }) => TResult1 | PromiseLike<TResult1>)
                    | null,
                  onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
                ): Promise<TResult1 | TResult2> => {
                  return Promise.resolve({ data: null, error: null, count: 3 }).then(
                    onfulfilled,
                    onrejected,
                  );
                };
              }
              return builder;
            });
          },
        },
      ]);

      const result = await api.countPending("team-1");

      expect(result).toBe(3);
      const adminBuilder = supabaseMock.getBuilderHistory("team_memberships")[0];
      expect(adminBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(adminBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
      expect(adminBuilder.eq).toHaveBeenCalledWith("is_active", true);
      const countBuilder = supabaseMock.getBuilderHistory("team_memberships")[1];
      expect(countBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
      expect(countBuilder.eq).toHaveBeenCalledWith("status", "pending");
    });
  });

  describe("approve", () => {
    it("承認待ちのメンバーシップを承認できる", async () => {
      const membership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "user-1",
        status: "pending",
      };

      const approvedMembership = {
        ...membership,
        status: "approved",
        is_active: true,
      };

      const adminMembership = { role: "admin" };

      // 1つ目: メンバーシップを取得
      // 2つ目: 管理者権限チェック
      // 3つ目: 更新
      supabaseMock.queueTable("team_memberships", [
        {
          data: membership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: membership, error: null });
          },
        },
        {
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 3つ目: 更新
          data: approvedMembership,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
            builder.eq.mockReturnValue(builder);
            builder.select.mockReturnValue(builder);
            builder.single.mockResolvedValue({ data: approvedMembership, error: null });
          },
        },
      ]);

      const result = await api.approve("membership-1");

      expect(result).toEqual(approvedMembership);
      const updateBuilder = supabaseMock.getBuilderHistory("team_memberships")[2];
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "approved",
          is_active: true,
        }),
      );
    });

    it("承認待ちでないメンバーシップは承認できない", async () => {
      const membership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "user-1",
        status: "approved",
      };

      supabaseMock.queueTable("team_memberships", [
        {
          data: membership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: membership, error: null });
          },
        },
      ]);

      await expect(api.approve("membership-1")).rejects.toThrow(
        "承認待ちのメンバーシップのみ承認できます",
      );
    });
  });

  describe("reject", () => {
    it("承認待ちのメンバーシップを拒否できる", async () => {
      const membership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "user-1",
        status: "pending",
      };

      const rejectedMembership = {
        ...membership,
        status: "rejected",
        is_active: false,
      };

      const adminMembership = { role: "admin" };

      // 1つ目: メンバーシップを取得
      // 2つ目: 管理者権限チェック
      // 3つ目: 更新
      supabaseMock.queueTable("team_memberships", [
        {
          data: membership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: membership, error: null });
          },
        },
        {
          data: adminMembership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null });
          },
        },
        {
          // 3つ目: 更新
          data: rejectedMembership,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
            builder.eq.mockReturnValue(builder);
            builder.select.mockReturnValue(builder);
            builder.single.mockResolvedValue({ data: rejectedMembership, error: null });
          },
        },
      ]);

      const result = await api.reject("membership-1");

      expect(result).toEqual(rejectedMembership);
      const updateBuilder = supabaseMock.getBuilderHistory("team_memberships")[2];
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "rejected",
          is_active: false,
        }),
      );
    });

    it("承認待ちでないメンバーシップは拒否できない", async () => {
      const membership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "user-1",
        status: "approved",
      };

      supabaseMock.queueTable("team_memberships", [
        {
          data: membership,
          configure: (builder) => {
            builder.single.mockResolvedValue({ data: membership, error: null });
          },
        },
      ]);

      await expect(api.reject("membership-1")).rejects.toThrow(
        "承認待ちのメンバーシップのみ拒否できます",
      );
    });
  });

  describe("join - 再申請", () => {
    // 再申請(rejected→pending)の判定・UPDATE も request_join_team RPC 内で完結する。
    it("拒否されたメンバーシップは再申請できる", async () => {
      const updatedMembership = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "test-user-id",
        status: "pending",
        is_active: false,
      };

      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: true, membership: updatedMembership },
        error: null,
      });
      supabaseMock.client.rpc = rpcMock;

      const result = await api.join("CODE");

      expect(result).toEqual(updatedMembership);
      expect(result.status).toBe("pending");
      expect(rpcMock).toHaveBeenCalledWith("request_join_team", { p_invite_code: "CODE" });
    });
  });

  describe("reactivateMembership", () => {
    // reactivateMembership() は reactivate_own_membership RPC (SECURITY DEFINER) の
    // 薄いラッパー。「approved かつ is_active=false かつ left_at 記録済み」の行のみ
    // 再アクティブ化できるガードは RPC 側(SQL)の責務であり、ここでは API 層が
    // RPC の戻り値を正しく解釈すること（success:true→membership を返す、
    // success:false→エラーを投げる）を検証する。
    it("退会済みメンバーシップを再アクティブ化できる", async () => {
      const reactivated = {
        id: "membership-1",
        team_id: "team-1",
        user_id: "test-user-id",
        status: "approved",
        is_active: true,
        left_at: null,
      };

      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: true, membership: reactivated },
        error: null,
      });
      supabaseMock.client.rpc = rpcMock;

      const result = await api.reactivateMembership("team-1");

      expect(result).toEqual(reactivated);
      expect(rpcMock).toHaveBeenCalledWith("reactivate_own_membership", { p_team_id: "team-1" });
    });

    it("再アクティブ化できないメンバーシップ（例: pending）の場合はエラーとなる", async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: { success: false, error: "再アクティブ化できるメンバーシップではありません" },
        error: null,
      });
      supabaseMock.client.rpc = rpcMock;

      await expect(api.reactivateMembership("team-1")).rejects.toThrow(
        "再アクティブ化できるメンバーシップではありません",
      );
    });

    it("RPC呼び出し自体がエラーになった場合は例外を投げる", async () => {
      const rpcError = new Error("rpc call failed");
      const rpcMock = vi.fn().mockResolvedValue({
        data: null,
        error: rpcError,
      });
      supabaseMock.client.rpc = rpcMock;

      await expect(api.reactivateMembership("team-1")).rejects.toThrow(rpcError);
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamMembersAPI(supabaseMock.client);

      await expect(api.reactivateMembership("team-1")).rejects.toThrow("認証が必要です");
    });
  });
});
