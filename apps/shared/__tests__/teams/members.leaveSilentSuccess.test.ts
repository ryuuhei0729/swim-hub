// =============================================================================
// members.leaveSilentSuccess.test.ts — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/shared/api/teams/members.ts の leave()
//
// ■ 背景 (Planner 実測 / CLAUDE.md メモリ「PostgREST は RLS 拒否 DELETE を
//    0行成功で返す」と同型の問題)
//   現行の leave() は
//     .update({...}).eq("team_id", ...).eq("user_id", ...)
//   で終わっており `.select().single()` が無い。PostgREST は「条件に一致する行が
//   0 件」でも `error: null` を返すため、RLS 拒否・メンバーシップ不在・teamId
//   取り違えのいずれでも **例外が出ず成功扱い**になる。設定タブの「脱退する」は
//   成功トーストを出して一覧から消えるが、DB には何も起きていない。
//   同ファイルの remove() には既に `.select("*").single()` が付いており、
//   leave() だけが非対称に取り残されている。
//
// ■ Sprint Contract 検証観点
//   [V-A30] 0 行更新 (PGRST116) のとき leave() は reject する
//   [V-A31] leave() は update に対して select().single() を連鎖させている
//           (「例外が出る」だけでなく「0行を検出できる形になっている」ことを直接見る。
//            将来 .select() を外す差し戻しが起きたらここで落ちる)
//   [V-A32] 0 行更新のときカレンダー記録色のクリーンアップまで進まない
//           (脱退していないのに個人の色設定だけ消える片side-effect を防ぐ)
//   [V-A33] 対照: 1 行更新できたときは従来どおり成功し、色設定の削除も走る
//
// ■ ミューテーションによる赤の実証 (Phase B で QA が実施する手順)
//   `.select("*").single()` を実装から外すと [V-A30]/[V-A31]/[V-A32] が赤になる。
//   赤にならない場合、このテストはガードを迂回する fixture を踏んでいるので
//   テスト側の欠陥として扱うこと。
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamMembersAPI } from "../../api/teams/members";
import { createSupabaseMock } from "../utils/supabase-mock";

/** PostgREST が single() で 0 行のときに返すエラー */
const NO_ROWS_ERROR = {
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
  details: null,
  hint: null,
};

describe("TeamMembersAPI.leave — 0行サイレント成功の封じ込め", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamMembersAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock();
    api = new TeamMembersAPI(supabaseMock.client);
  });

  // [V-A30]
  it("[V-A30] RLS 拒否などで 0 行更新になったとき reject する (成功扱いにしない)", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: NO_ROWS_ERROR });
        },
      },
    ]);

    await expect(api.leave("team-1")).rejects.toMatchObject({ code: "PGRST116" });
  });

  // [V-A31] 「0行を検出できる形か」を直接見る
  it("[V-A31] update のあとに select() と single() が連鎖して呼ばれている", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: { id: "membership-1" },
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: { id: "membership-1" }, error: null });
        },
      },
    ]);

    await api.leave("team-1");

    const builder = supabaseMock.getBuilder("team_memberships");
    expect(builder.update).toHaveBeenCalled();
    expect(builder.select).toHaveBeenCalled();
    expect(builder.single).toHaveBeenCalled();
    // サーバー側で対象を絞っていること (クライアント filter との混同防止)
    expect(builder.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
  });

  // [V-A32]
  it("[V-A32] 0 行更新のときカレンダー記録色 (user_team_calendar_colors) は削除されない", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: NO_ROWS_ERROR });
        },
      },
    ]);

    await expect(api.leave("team-1")).rejects.toMatchObject({ code: "PGRST116" });

    expect(supabaseMock.getBuilderHistory("user_team_calendar_colors")).toHaveLength(0);
  });

  // [V-A33] 対照実験
  it("[V-A33] 1 行更新できたときは成功し、カレンダー記録色の削除も実行される", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: { id: "membership-1" },
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: { id: "membership-1" }, error: null });
        },
      },
    ]);
    supabaseMock.queueTable("user_team_calendar_colors", [{ data: null }]);

    await expect(api.leave("team-1")).resolves.toBeUndefined();

    const colorBuilder = supabaseMock.getBuilder("user_team_calendar_colors");
    expect(colorBuilder.delete).toHaveBeenCalled();
    expect(colorBuilder.eq).toHaveBeenCalledWith("team_id", "team-1");
    expect(colorBuilder.eq).toHaveBeenCalledWith("user_id", "test-user-id");
  });

  it("未認証のときは update に到達せず reject する", async () => {
    supabaseMock = createSupabaseMock({ userId: "" });
    api = new TeamMembersAPI(supabaseMock.client);

    await expect(api.leave("team-1")).rejects.toThrow("認証が必要です");
    expect(supabaseMock.getBuilderHistory("team_memberships")).toHaveLength(0);
  });
});
