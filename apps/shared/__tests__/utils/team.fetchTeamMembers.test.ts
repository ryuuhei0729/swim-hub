/**
 * team.fetchTeamMembers.test.ts — apps/shared/utils/team.ts::fetchTeamMembers() の検証
 *
 * Sprint Contract [並び順スプリント]:
 *   - 出欠画面 (AdminMonthlyAttendance / AttendanceGroupModal) が使う fetchTeamMembers() も
 *     年上順（生年月日昇順、未設定は末尾）で返すこと
 *   - 戻り値の形状 ({id, name}) は変更せず、birthday はソート専用の内部情報として扱う
 *     （呼び出し元の型を壊さない）
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 */

import { describe, expect, it } from "vitest";
import { fetchTeamMembers } from "../../utils/team";
import { createSupabaseMock } from "./supabase-mock";

describe("fetchTeamMembers", () => {
  it("select() に渡す文字列に birthday が含まれる（未select化の検出）", async () => {
    const supabaseMock = createSupabaseMock();
    supabaseMock.queueTable("team_memberships", [{ data: [] }]);

    await fetchTeamMembers(supabaseMock.client, "team-1");

    const builder = supabaseMock.getBuilder("team_memberships");
    expect(builder.select).toHaveBeenCalledTimes(1);
    const selectArg = builder.select.mock.calls[0]![0] as string; // toHaveBeenCalledTimes(1) で存在確認済み
    expect(selectArg).toContain("birthday");
  });

  it("年上順（生年月日昇順）で返り、戻り値の形状は {id, name} のまま（birthdayは公開しない）", async () => {
    const supabaseMock = createSupabaseMock();
    const younger = {
      user_id: "u-younger",
      users: { id: "u-younger", name: "ジロウ", birthday: "2012-04-01" },
    };
    const older = {
      user_id: "u-older",
      users: { id: "u-older", name: "タロウ", birthday: "2008-04-01" },
    };
    const noBirthday = {
      user_id: "u-none",
      users: { id: "u-none", name: "サブロウ", birthday: null },
    };
    // 意図的に望ましい並びと異なる順で DB から返す
    supabaseMock.queueTable("team_memberships", [{ data: [younger, older, noBirthday] }]);

    const result = await fetchTeamMembers(supabaseMock.client, "team-1");

    expect(result.map((m) => m.id)).toEqual(["u-older", "u-younger", "u-none"]);
    // 形状は {id, name} を維持している（型上 birthday? はあるが、値の有無に関わらず
    // 呼び出し元が既存通り id/name だけ見ても壊れないことを確認）
    expect(Object.keys(result[0]!).sort()).toEqual(["birthday", "id", "name"]);
    expect(result[0]).toMatchObject({ id: "u-older", name: "タロウ" });
  });

  it("生年月日未設定のメンバーは常に末尾（並び順の方向に関わらず）", async () => {
    const supabaseMock = createSupabaseMock();
    const noBirthday = {
      user_id: "u-none",
      users: { id: "u-none", name: "ナシ", birthday: null },
    };
    const has = {
      user_id: "u-has",
      users: { id: "u-has", name: "アリ", birthday: "2010-01-01" },
    };
    // 未設定を先頭に置いて DB から返しても、末尾に押し出されることを確認する
    supabaseMock.queueTable("team_memberships", [{ data: [noBirthday, has] }]);

    const result = await fetchTeamMembers(supabaseMock.client, "team-1");

    expect(result.map((m) => m.id)).toEqual(["u-has", "u-none"]);
  });

  it("同じ生年月日の場合は name で決定的に並ぶ", async () => {
    const supabaseMock = createSupabaseMock();
    const b = { user_id: "u-b", users: { id: "u-b", name: "ベータ", birthday: "2010-01-01" } };
    const a = { user_id: "u-a", users: { id: "u-a", name: "アルファ", birthday: "2010-01-01" } };
    supabaseMock.queueTable("team_memberships", [{ data: [b, a] }]);

    const result = await fetchTeamMembers(supabaseMock.client, "team-1");

    expect(result.map((m) => m.id)).toEqual(["u-a", "u-b"]);
  });

  it("Unknown User (name未設定) は除外フィルタが維持されている（既存挙動の非退行）", async () => {
    const supabaseMock = createSupabaseMock();
    const noName = { user_id: "u-noname", users: { id: "u-noname", name: "", birthday: null } };
    const has = { user_id: "u-has", users: { id: "u-has", name: "アリ", birthday: "2010-01-01" } };
    supabaseMock.queueTable("team_memberships", [{ data: [noName, has] }]);

    const result = await fetchTeamMembers(supabaseMock.client, "team-1");

    expect(result.map((m) => m.id)).toEqual(["u-has"]);
  });
});
