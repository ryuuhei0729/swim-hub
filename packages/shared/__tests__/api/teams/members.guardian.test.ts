/**
 * TeamMembersAPI.list は保護者アカウント (role = guardian) を返さない。
 * メンバー一覧・グループ分け・代理入力の候補はすべてここから配信されるため、
 * 生徒側に保護者を出さないための除外はこのクエリで行う。
 */
import { describe, expect, it } from "vitest";
import { TeamMembersAPI } from "../../../api/teams/members";
import { createSupabaseMock } from "../../utils/supabase-mock";

describe("TeamMembersAPI.list", () => {
  it("承認済み・現役のメンバーから role = guardian を除外して取得する", async () => {
    const supabaseMock = createSupabaseMock({ userId: "viewer-1" });
    supabaseMock.queueTable("team_memberships", [{ data: [] }]);

    await new TeamMembersAPI(supabaseMock.client).list("team-1");

    const builder = supabaseMock.getBuilder("team_memberships");
    expect(builder.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "approved");
    expect(builder.eq).toHaveBeenCalledWith("is_active", true);
    expect(builder.neq).toHaveBeenCalledWith("role", "guardian");
  });
});
