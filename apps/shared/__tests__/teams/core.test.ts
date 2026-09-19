import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamCoreAPI } from "../../api/teams/core";
import { createSupabaseMock } from "../utils/supabase-mock";

describe("TeamCoreAPI", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamCoreAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock();
    api = new TeamCoreAPI(supabaseMock.client);
  });

  describe("getMyTeams", () => {
    it("自身のチームメンバーシップ一覧を取得できる", async () => {
      // status='approved'かつis_active=trueの場合のみ返される
      const memberships = [
        {
          id: "membership-1",
          team_id: "team-1",
          user_id: "test-user-id",
          status: "approved" as const,
          is_active: true,
        },
      ];

      supabaseMock.queueTable("team_memberships", [{ data: memberships }]);

      const result = await api.getMyTeams();

      expect(result).toEqual(memberships);
      const builder = supabaseMock.getBuilder("team_memberships");
      expect(builder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
      expect(builder.in).toHaveBeenCalledWith("status", ["approved", "pending"]);
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamCoreAPI(supabaseMock.client);

      await expect(api.getMyTeams()).rejects.toThrow("認証が必要です");
    });
  });

  describe("getTeam", () => {
    it("チームの詳細を取得できる", async () => {
      const team = {
        id: "team-1",
        name: "テストチーム",
        team_memberships: [],
      };

      supabaseMock.queueTable("team_memberships", [{ data: { id: "membership-1" } }]);
      supabaseMock.queueTable("teams", [{ data: team }]);

      const result = await api.getTeam("team-1");

      expect(result).toEqual(team);
    });

    it("チームメンバーでない場合はエラーとなる", async () => {
      supabaseMock.queueTable("team_memberships", [{ data: null }, { data: null }]);

      await expect(api.getTeam("team-1")).rejects.toThrow("チームへのアクセス権限がありません");
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamCoreAPI(supabaseMock.client);

      await expect(api.getTeam("team-1")).rejects.toThrow("認証が必要です");
    });
  });

  describe("createTeam", () => {
    it("チームを作成できる", async () => {
      const input = {
        name: "新チーム",
        description: "説明",
        created_by: "test-user-id",
      };
      const created = {
        id: "team-1",
        invite_code: "CODE",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        ...input,
      };

      supabaseMock.queueTable("teams", [
        {
          data: created,
          configure: (builder) => {
            builder.insert.mockReturnValue(builder);
          },
        },
      ]);

      const result = await api.createTeam(input as unknown as Parameters<typeof api.createTeam>[0]);

      expect(result).toEqual(created);
      const builder = supabaseMock.getBuilder("teams");
      expect(builder.insert).toHaveBeenCalledWith(input);
    });

    it("未認証の場合はエラーとなる", async () => {
      supabaseMock = createSupabaseMock({ userId: "" });
      api = new TeamCoreAPI(supabaseMock.client);

      await expect(
        api.createTeam({ name: "新チーム", description: "説明" } as unknown as Parameters<
          typeof api.createTeam
        >[0]),
      ).rejects.toThrow("認証が必要です");
    });
  });

  describe("updateTeam", () => {
    it("チーム情報を更新できる", async () => {
      const updated = {
        id: "team-1",
        name: "更新後チーム",
        description: "更新後説明",
      };

      supabaseMock.queueTable("teams", [
        {
          data: updated,
          configure: (builder) => {
            builder.update.mockReturnValue(builder);
          },
        },
      ]);

      const result = await api.updateTeam("team-1", { name: "更新後チーム" });

      expect(result).toEqual(updated);
      const builder = supabaseMock.getBuilder("teams");
      expect(builder.update).toHaveBeenCalledWith({ name: "更新後チーム" });
      expect(builder.eq).toHaveBeenCalledWith("id", "team-1");
    });

    it("更新時にエラーが発生した場合は例外を投げる", async () => {
      const error = new Error("update failed");
      supabaseMock.queueTable("teams", [{ data: null, error }]);

      await expect(api.updateTeam("team-1", { name: "NG" })).rejects.toThrow(error);
    });
  });

  describe("deleteTeam", () => {
    // -------------------------------------------------------------------------
    // 本スプリントで deleteTeam は **teams への直接 DELETE から RPC 経由へ変更**された。
    //
    // 理由: records_team_id_fkey は ON DELETE CASCADE なので、teams を素朴に消すと
    // **他メンバーのレース記録が物理削除される**。RPC delete_team_preserving_records が
    // records.team_id を NULL 化してから teams を消す (migration 20260910000001)。
    //
    // 旧テストは「builder.delete が呼ばれること」= まさに消してはいけない経路を
    // 正解として pin していた。**実装が正で期待値が古い**ため期待値側を更新する。
    // 直接 DELETE を発行しないことの明示的なガードは
    // __tests__/teams/core.teamSettings.test.ts の [V-A22] が持つ。
    // -------------------------------------------------------------------------
    const mockRpc = (value: { data: unknown; error?: unknown }) => {
      (supabaseMock.client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: value.data,
        error: value.error ?? null,
      });
    };

    it("チームを削除できる (RPC delete_team_preserving_records 経由)", async () => {
      mockRpc({
        data: {
          success: true,
          deleted_team_count: 1,
          cleared_record_count: 2,
          cleared_practice_count: 1,
        },
      });

      await api.deleteTeam("team-1");

      expect(supabaseMock.client.rpc).toHaveBeenCalledWith("delete_team_preserving_records", {
        p_team_id: "team-1",
      });
      // teams テーブルには一切触れない (CASCADE で他人の記録を消さないことの担保)
      expect(supabaseMock.getBuilderHistory("teams")).toHaveLength(0);
    });

    it("削除時にエラーが発生した場合は例外を投げる", async () => {
      const error = new Error("delete failed");
      mockRpc({ data: null, error });

      await expect(api.deleteTeam("team-1")).rejects.toThrow(error);
    });

    // ⚠️ フィクスチャは実 migration (20260910000001) の戻り値に合わせること。
    // RPC が返すのは日本語の文言ではなく snake_case の機械可読コード。
    it("RPC が success:false を返した場合はそのコードを載せて例外を投げる", async () => {
      mockRpc({ data: { success: false, error: "not_authorized" } });

      await expect(api.deleteTeam("team-1")).rejects.toThrow("not_authorized");
    });

    it("success:true でも削除件数が 1 でなければ例外を投げる (0行サイレント成功の封じ込め)", async () => {
      mockRpc({
        data: {
          success: true,
          deleted_team_count: 0,
          cleared_record_count: 0,
          cleared_practice_count: 0,
        },
      });

      await expect(api.deleteTeam("team-1")).rejects.toThrow();
    });
  });
});
