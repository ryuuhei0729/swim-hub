/**
 * Issue #49 QA テスト (Phase A スケルトン): updateSwimmerStatus の requireTeamAdmin ガード
 *
 * 対象: apps/shared/api/teams/members.ts - TeamMembersAPI.updateSwimmerStatus()
 *   (Phase A 時点では未実装。Developer が updateRole() と同じ構造で追加する契約)
 *
 * Sprint Contract 検証観点:
 *   [V-05] is_swimmer の UPDATE はチーム管理者のみに限定される
 *          (受け入れ基準「一般メンバーには...API/RLS 経由でも is_swimmer を更新できない」の
 *           API 層側の担保。DB RLS 自体の防御は Phase B で実データベースに対して確認する
 *           別観点であり、このテストは「アプリのコードが管理者チェックを迂回していないか」
 *           を担保する)
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させたシグネチャ):
 *   TeamMembersAPI.updateSwimmerStatus(teamId: string, userId: string, isSwimmer: boolean):
 *     Promise<TeamMembership>
 *   実装は updateRole() と同一パターン (requireTeamAdmin 先行 → update().eq().eq().select().single())
 *
 * 既存の members-updateRole-admin-guard.test.ts をテンプレートとして踏襲する
 * (supabase-mock の queueTable で「1回目=admin チェック、2回目=実UPDATE」の順にレスポンスを積む)。
 *
 * QA Engineer (Evaluator) が Sprint Contract に基づいて独立に作成。
 * Developer 実装コードをコピーせず、仕様から観点を導出している。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TeamMembersAPI } from "../../api/teams/members";
import { createSupabaseMock } from "../utils/supabase-mock";

describe("TeamMembersAPI.updateSwimmerStatus - requireTeamAdmin ガード", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamMembersAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock(); // userId = "test-user-id"
    api = new TeamMembersAPI(supabaseMock.client);
  });

  it("admin 権限のないユーザーが呼ぶと '管理者権限が必要です' で reject される", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateSwimmerStatus("team-1", "member-1", false)).rejects.toThrow(
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

    await expect(api.updateSwimmerStatus("team-1", "member-1", false)).rejects.toThrow();

    const history = supabaseMock.getBuilderHistory("team_memberships");
    expect(history).toHaveLength(1);
    expect(supabaseMock.getBuilder("team_memberships", 0).update).not.toHaveBeenCalled();
  });

  it("admin 権限がある場合は is_swimmer=false への更新が成功する", async () => {
    const adminMembership = { role: "admin" };
    const updatedMembership = {
      id: "membership-1",
      team_id: "team-1",
      user_id: "member-1",
      role: "user",
      is_swimmer: false,
    };

    supabaseMock.queueTable("team_memberships", [
      {
        data: adminMembership,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: adminMembership, error: null });
        },
      },
      {
        data: updatedMembership,
        configure: (builder) => {
          builder.update.mockReturnValue(builder);
          builder.single.mockResolvedValue({ data: updatedMembership, error: null });
        },
      },
    ]);

    const result = await api.updateSwimmerStatus("team-1", "member-1", false);

    expect(result).toEqual(updatedMembership);

    const history = supabaseMock.getBuilderHistory("team_memberships");
    expect(history).toHaveLength(2);
    const updateBuilder = supabaseMock.getBuilder("team_memberships", 1);
    // payload は is_swimmer のみを送る (role 等の意図しないフィールドを巻き込まない)
    expect(updateBuilder.update).toHaveBeenCalledWith({ is_swimmer: false });
    expect(updateBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(updateBuilder.eq).toHaveBeenCalledWith("user_id", "member-1");
  });

  it("admin 権限がある場合は is_swimmer=true への更新 (泳者への戻し) も成功する", async () => {
    const adminMembership = { role: "admin" };
    const updatedMembership = {
      id: "membership-1",
      team_id: "team-1",
      user_id: "member-1",
      role: "user",
      is_swimmer: true,
    };

    supabaseMock.queueTable("team_memberships", [
      {
        data: adminMembership,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: adminMembership, error: null });
        },
      },
      {
        data: updatedMembership,
        configure: (builder) => {
          builder.update.mockReturnValue(builder);
          builder.single.mockResolvedValue({ data: updatedMembership, error: null });
        },
      },
    ]);

    const result = await api.updateSwimmerStatus("team-1", "member-1", true);

    expect(result).toEqual(updatedMembership);
    const updateBuilder = supabaseMock.getBuilder("team_memberships", 1);
    expect(updateBuilder.update).toHaveBeenCalledWith({ is_swimmer: true });
  });

  it("admin チェック中に DB エラーが発生した場合は元の DB エラーがそのまま伝播する（メッセージに埋め込まれない）", async () => {
    const dbError = new Error("connection error");

    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: dbError });
        },
      },
    ]);

    await expect(api.updateSwimmerStatus("team-1", "member-1", false)).rejects.toThrow(dbError);
  });

  it("updateSwimmerStatus は teamId と呼び出しユーザーの組み合わせで admin チェックする", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateSwimmerStatus("team-99", "member-1", false)).rejects.toThrow(
      "管理者権限が必要です",
    );

    const adminCheckBuilder = supabaseMock.getBuilder("team_memberships", 0);
    expect(adminCheckBuilder.eq).toHaveBeenCalledWith("team_id", "team-99");
    expect(adminCheckBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
    expect(adminCheckBuilder.eq).toHaveBeenCalledWith("is_active", true);
    expect(adminCheckBuilder.eq).toHaveBeenCalledWith("role", "admin");
  });
});
