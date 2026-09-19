// =============================================================================
// core.teamSettings.test.ts — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/shared/api/teams/core.ts の updateTeam / deleteTeam
//
// Phase A 時点で以下はすべて **赤** になる (現行実装に該当のガードが無いため)。
// これは「実装が正で期待値が古い赤」ではなく **仕様が正で実装が足りていない赤** で
// あり、Phase B で Developer が実装すると緑になる。既存の
// __tests__/teams/core.test.ts の describe("updateTeam"/"deleteTeam") は
// 「ガードが無い現行挙動」を前提にしているため Phase B で更新が必要
// (QA の Phase B タスク。Developer は触らないこと)。
//
// ■ Sprint Contract 検証観点
//   [V-A20] updateTeam は requireTeamAdmin を通り、非管理者は UPDATE に到達しない
//           (既存バグ: 現在はガードが無く、RLS 任せ。しかも RLS 側は作成者限定
//            なので「作成者でない管理者はサイレントに 0 行更新」になりうる)
//   [V-A21] updateTeam は管理者なら従来どおり UPDATE + select().single() で返す
//   [V-A22] deleteTeam は teams テーブルへの直接 DELETE を **一切行わない**
//           (PM 裁定 B: CASCADE で他人の records を消す実装は採らない)
//   [V-A23] deleteTeam は RPC delete_team_preserving_records を p_team_id 付きで呼ぶ
//   [V-A24] RPC が success:false を返したら reject する
//   [V-A25] RPC が success:true でも deleted_team_count が 0 なら reject する
//           (PostgREST は RLS 拒否 DELETE を「0行・エラー無し」で返す。
//            0 件をサイレント成功にすると「削除できていないのに画面から消える」)
//   [V-A26] RPC 自体が error を返したら reject する
//
// ■ QA が Phase A で確定させる実装要件 (Contract 補強 / PM 経由で Developer へ)
//   RPC の戻り値は既存の delete_competition_with_records
//   (supabase/migrations/20260826000000_*) と同型の jsonb とする:
//     成功: { success: true, deleted_team_count, cleared_record_count, cleared_practice_count }
//     失敗: { success: false, error: "<機械可読なコード>" }
//   失敗時は UserFacingError で throw すること (生の PostgrestError を画面に出さない)。
//
// ⚠️ **フィクスチャは実 migration の戻り値と一致させること。**
//   本ファイルは当初 error に「チームの管理者のみ削除できます」という**日本語の
//   ユーザー向け文言**を入れていたが、実際の RPC
//   (supabase/migrations/20260910000001_*) が返すのは `not_authorized` /
//   `team_not_found` / `auth_required` という**snake_case のコード**である。
//   フィクスチャが実物と違うと、テストは緑のまま「コードを文言として素通しで
//   表示してしまう」欠陥を隠す。コード→文言の変換は UI 層が
//   `getDeleteTeamErrorMessageKey()` で行う (対応表の検証は
//   __tests__/teams/deleteTeamErrorMessageKey.test.ts が担当)。
//
// ■ トートロジー回避
//   RPC 名と引数キーはテスト内で組み立てず、期待値として直接書いた文字列で
//   完全一致 assert する (実装から読み取った値を使い回さない)。
// =============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamOperationError, TeamCoreAPI } from "../../api/teams/core";
import { UserFacingError, toUserFacingMessage } from "../../utils/userFacingError";
import { createSupabaseMock } from "../utils/supabase-mock";

const RPC_NAME = "delete_team_preserving_records";

describe("TeamCoreAPI.updateTeam — requireTeamAdmin ガード", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamCoreAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock();
    api = new TeamCoreAPI(supabaseMock.client);
  });

  // [V-A20]
  // ⚠️ 本スプリント途中で updateTeam は requireTeamAdmin の UserFacingError
  // (固定日本語) を **TeamOperationError("not_authorized") に変換**するようになった。
  // shared から日本語を出さないための変更で、実装が正・期待値が古い赤だったため更新。
  it("[V-A20] 非管理者が updateTeam を呼ぶと TeamOperationError('not_authorized') で reject される", async () => {
    // requireTeamAdmin: team_memberships.select(...).single() → data=null (非 admin)
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    const err = await api.updateTeam("team-1", { name: "乗っ取り" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamOperationError);
    expect((err as TeamOperationError).code).toBe("not_authorized");
    // 表示経路に流しても機械可読コードが画面に出ないこと (TeamOperationError は素通ししない)
    expect(toUserFacingMessage(err, "更新に失敗しました")).toBe("更新に失敗しました");
  });

  // [V-A20] 「ガードを通っただけ」ではなく「書き込みに到達していない」ことを見る
  it("[V-A20] 非管理者のとき teams テーブルへの update は一度も実行されない", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: null,
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: null, error: null });
        },
      },
    ]);

    await expect(api.updateTeam("team-1", { name: "乗っ取り" })).rejects.toBeInstanceOf(
      TeamOperationError,
    );

    expect(supabaseMock.getBuilderHistory("teams")).toHaveLength(0);
  });

  // [V-A21] 対照実験: 管理者なら従来どおり通る
  it("[V-A21] 管理者なら UPDATE が実行され、更新後の行が返る", async () => {
    supabaseMock.queueTable("team_memberships", [
      {
        data: { role: "admin" },
        configure: (builder) => {
          builder.single.mockResolvedValue({ data: { role: "admin" }, error: null });
        },
      },
    ]);
    const updated = { id: "team-1", name: "更新後チーム", description: "更新後説明" };
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
    // サーバー側で対象を絞っていること (クライアント filter との混同を防ぐため実引数を見る)
    expect(builder.eq).toHaveBeenCalledWith("id", "team-1");
  });
});

describe("TeamCoreAPI.deleteTeam — records を残す RPC 経由の削除", () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>;
  let api: TeamCoreAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = createSupabaseMock();
    api = new TeamCoreAPI(supabaseMock.client);
  });

  const queueRpc = (value: { data: unknown; error?: unknown }) => {
    (supabaseMock.client.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: value.data,
      error: value.error ?? null,
    });
  };

  // [V-A23]
  it("[V-A23] RPC delete_team_preserving_records を p_team_id 付きで呼ぶ", async () => {
    queueRpc({
      data: {
        success: true,
        deleted_team_count: 1,
        cleared_record_count: 3,
        cleared_practice_count: 2,
      },
    });

    await api.deleteTeam("team-1");

    expect(supabaseMock.client.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith(RPC_NAME, { p_team_id: "team-1" });
  });

  // [V-A22] これが PM 裁定 B の本体。直接 DELETE は他人の records を CASCADE で消す
  it("[V-A22] teams テーブルへの直接 DELETE は一切発行されない", async () => {
    queueRpc({
      data: {
        success: true,
        deleted_team_count: 1,
        cleared_record_count: 0,
        cleared_practice_count: 0,
      },
    });

    await api.deleteTeam("team-1");

    expect(supabaseMock.getBuilderHistory("teams")).toHaveLength(0);
  });

  // [V-A24] 実 RPC が返す3コードをそのまま UserFacingError の message に載せること。
  // ここで日本語へ変換してしまうと ja 以外の4ロケールに日本語が出る
  it.each([
    ["not_authorized"],
    ["team_not_found"],
    ["auth_required"],
  ])("[V-A24] RPC が success:false と %s を返したら、そのコードを載せて reject する", async (code) => {
    queueRpc({ data: { success: false, error: code } });

    await expect(api.deleteTeam("team-1")).rejects.toThrow(code);
  });

  // [V-A24 補強 M3-2] **例外の型**を pin する。
  //
  // `rejects.toThrow(code)` は message の部分一致でしかないため、実装が
  // `throw new UserFacingError(code)` に退行しても緑のまま通る。
  // それが起きると:
  //   - `getDeleteTeamErrorMessageKey()` は `instanceof TeamOperationError` で判定するので
  //     **全ての失敗理由が deleteFailed に潰れる**
  //   - `toUserFacingMessage()` は UserFacingError の message を素通しするので
  //     画面に `not_authorized` という機械可読コードがそのまま出る
  // 型そのものを要求して退行を塞ぐ。
  it("[V-A24 補強 M3-2] 失敗時に投げるのは TeamOperationError であり UserFacingError ではない", async () => {
    queueRpc({ data: { success: false, error: "not_authorized" } });

    await expect(api.deleteTeam("team-1")).rejects.toBeInstanceOf(TeamOperationError);

    // 対照: UserFacingError で投げていたら↑は通っても↓で落ちる
    queueRpc({ data: { success: false, error: "not_authorized" } });
    const err = await api.deleteTeam("team-1").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UserFacingError);
    expect((err as TeamOperationError).code).toBe("not_authorized");
  });

  it("[V-A24 補強 M3-2] deleted_team_count 異常時の例外も TeamOperationError である", async () => {
    queueRpc({
      data: { success: true, deleted_team_count: 0, cleared_record_count: 0, cleared_practice_count: 0 },
    });

    const err = await api.deleteTeam("team-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamOperationError);
    expect(err).not.toBeInstanceOf(UserFacingError);
  });

  // [V-A24 補強] 日本語の文言が shared から漏れ出していないこと。
  // shared は i18n の t() を持たないため、ここで文言を作ると必ず ja 固定になる
  it("[V-A24 補強] reject されたエラーの message に日本語が含まれない", async () => {
    queueRpc({ data: { success: false, error: "not_authorized" } });

    await expect(api.deleteTeam("team-1")).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      return !/[\u3040-\u30ff\u4e00-\u9fff]/.test(message);
    });
  });

  // [V-A25] 0行サイレント成功の封じ込め
  it("[V-A25] success:true でも deleted_team_count が 0 なら reject される", async () => {
    queueRpc({
      data: {
        success: true,
        deleted_team_count: 0,
        cleared_record_count: 0,
        cleared_practice_count: 0,
      },
    });

    await expect(api.deleteTeam("team-1")).rejects.toThrow();
  });

  // [V-A26]
  it("[V-A26] RPC 自体が error を返したら reject される", async () => {
    const error = new Error("rpc failed");
    queueRpc({ data: null, error });

    await expect(api.deleteTeam("team-1")).rejects.toThrow(error);
  });

  // 境界: RPC が null / 形の違う値を返したときに「成功」に化けないこと
  it("[V-A25 境界] RPC が null を返したら成功扱いにせず reject する", async () => {
    queueRpc({ data: null });

    await expect(api.deleteTeam("team-1")).rejects.toThrow();
  });
});
