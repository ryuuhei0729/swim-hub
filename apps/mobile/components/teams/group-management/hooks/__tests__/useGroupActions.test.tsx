// =============================================================================
// useGroupActions.test.tsx - QA Engineer 検証 (グループ配線スプリント)
// 配線で初めて実行される CRUD ラッパーの純粋ロジックを検証する。
//   - 重複名エラー分類 (23505 / duplicate / unique -> groupDuplicateError)
//   - 非重複の生エラーは汎用フォールバック文言 (groupCreateFailed 等) に置き換わる (情報露出防止)
//   - createGroups (カンマ複数作成) の成否集計と部分失敗
//   - create/update は成功で値・失敗で null / delete・setGroupMembers は boolean
//   - onSuccess コールバックが成功時に呼ばれる
// TeamGroupManagement.handleFormSubmit が result!==null / boolean を分岐に使うため
// これらの戻り値契約は配線の健全性に直結する。
//
// 情報露出防止 (PM 裁定による Phase B 再修正):
// 「非重複エラーはメッセージをそのまま透過する」等のテストは元々「生の Error メッセージが
// そのまま error state に入る」ことを正解として固定していたが、これは情報露出 (テーブル名・
// RLS ポリシー詳細を含む生の Postgres/RLS エラーをユーザーに見せてしまう) を仕様として肯定
// する記述だった。useGroupActions.ts は toUserFacingMessage (apps/shared/utils/
// userFacingError.ts) を使い、UserFacingError インスタンス以外は詳細を出さず i18n 済みの
// 汎用フォールバックに置き換える設計へ是正済みのため、期待値をフォールバック文言に更新した。
// 各関数につき、生の Error → フォールバックのテストと対を成す形で、UserFacingError が
// 素通しされることを検証する対照テストを追加している (実装が全部を汎用文言に潰しているだけ
// ではないことの証明)。
// なお rawMessage (23505/duplicate/unique 判定用の内部分類) は画面表示に使われない意図的な
// 残置であり、本スプリントの対象外 (PM 裁定)。
// =============================================================================

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@apps/shared/utils/userFacingError";

// TeamGroupsAPI をモック (実 Supabase に触れずロジックのみ検証)
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockListGroupMembers = vi.fn();
const mockSetGroupMembers = vi.fn();

vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(() => ({
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove,
    listGroupMembers: mockListGroupMembers,
    setGroupMembers: mockSetGroupMembers,
  })),
}));

import { useGroupActions } from "../useGroupActions";

const TEAM_ID = "team-1";
const fakeSupabase = {} as unknown as SupabaseClient;

const setup = (onSuccess?: () => void) =>
  renderHook(() => useGroupActions(TEAM_ID, fakeSupabase, onSuccess));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGroupActions - createGroup", () => {
  it("成功時は作成された TeamGroup を返し onSuccess を呼ぶ", async () => {
    const onSuccess = vi.fn();
    const created = { id: "g1", team_id: TEAM_ID, category: null, name: "A" };
    mockCreate.mockResolvedValueOnce(created);
    const { result } = setup(onSuccess);

    let ret: unknown;
    await act(async () => {
      ret = await result.current.createGroup(null, "A");
    });

    expect(ret).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith({
      team_id: TEAM_ID,
      category: null,
      name: "A",
      created_by: null,
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("23505 (一意制約違反) で groupDuplicateError を設定し null を返す", async () => {
    mockCreate.mockRejectedValueOnce(new Error("duplicate key value violates 23505"));
    const { result } = setup();

    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.createGroup("Cat", "A");
    });

    expect(ret).toBeNull();
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("'unique' を含むエラーでも groupDuplicateError に分類する", async () => {
    mockCreate.mockRejectedValueOnce(new Error("violates unique constraint"));
    const { result } = setup();
    await act(async () => {
      await result.current.createGroup(null, "A");
    });
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("重複以外の生エラーは汎用メッセージ (groupCreateFailed フォールバック) に置き換わる (情報露出防止)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.createGroup(null, "A");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("グループの作成に失敗しました");
  });

  it(
    "重複以外でも UserFacingError の場合はそのメッセージがそのまま表示される" +
      " (上記テストとの対照実験: toUserFacingMessage が UserFacingError を素通しすることの証明)",
    async () => {
      mockCreate.mockRejectedValueOnce(new UserFacingError("このカテゴリではグループを作成できません"));
      const { result } = setup();
      let ret: unknown = "sentinel";
      await act(async () => {
        ret = await result.current.createGroup(null, "A");
      });
      expect(ret).toBeNull();
      expect(result.current.error).toBe("このカテゴリではグループを作成できません");
    },
  );
});

describe("useGroupActions - createGroups (カンマ複数作成)", () => {
  it("全件成功で true を返し API を名前の数だけ呼ぶ", async () => {
    mockCreate.mockResolvedValue({ id: "x" });
    const onSuccess = vi.fn();
    const { result } = setup(onSuccess);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createGroups("Cat", ["A", "B", "C"]);
    });

    expect(ok).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("部分失敗 (重複) で false を返し残りは作成し続ける", async () => {
    mockCreate
      .mockResolvedValueOnce({ id: "a" }) // A 成功
      .mockRejectedValueOnce(new Error("duplicate")) // B 重複
      .mockResolvedValueOnce({ id: "c" }); // C 成功
    const { result } = setup();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.createGroups("Cat", ["A", "B", "C"]);
    });

    expect(ok).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(3); // 失敗しても残りを処理
    expect(result.current.error).toContain("「B」は既に存在します");
  });
});

describe("useGroupActions - updateGroup / deleteGroup", () => {
  it("updateGroup 成功で値を返す", async () => {
    const updated = { id: "g1", name: "renamed" };
    mockUpdate.mockResolvedValueOnce(updated);
    const { result } = setup();
    let ret: unknown;
    await act(async () => {
      ret = await result.current.updateGroup("g1", "Cat", "renamed");
    });
    expect(ret).toEqual(updated);
    expect(mockUpdate).toHaveBeenCalledWith("g1", { category: "Cat", name: "renamed" });
  });

  it("updateGroup の重複は groupDuplicateError、null を返す", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("23505"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.updateGroup("g1", null, "dup");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("deleteGroup 成功で true、失敗 (生エラー) で false + 汎用メッセージ (情報露出防止)", async () => {
    mockRemove.mockResolvedValueOnce(undefined);
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.deleteGroup("g1");
    });
    expect(ok).toBe(true);

    mockRemove.mockRejectedValueOnce(
      new Error('relation "team_groups" violates row-level security policy'),
    );
    await act(async () => {
      ok = await result.current.deleteGroup("g1");
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe("グループの削除に失敗しました");
  });

  it(
    "deleteGroup が UserFacingError で失敗した場合はそのメッセージがそのまま表示される" +
      " (上記テストとの対照実験: toUserFacingMessage が UserFacingError を素通しすることの証明)",
    async () => {
      mockRemove.mockRejectedValueOnce(
        new UserFacingError("このグループは削除できません（メンバーが所属しています）"),
      );
      const { result } = setup();
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.deleteGroup("g1");
      });
      expect(ok).toBe(false);
      expect(result.current.error).toBe("このグループは削除できません（メンバーが所属しています）");
    },
  );
});

describe("useGroupActions - setGroupMembers / listGroupMembers", () => {
  it("setGroupMembers 成功で true を返し userIds を渡す", async () => {
    mockSetGroupMembers.mockResolvedValueOnce(undefined);
    const onSuccess = vi.fn();
    const { result } = setup(onSuccess);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setGroupMembers("g1", ["u1", "u2"]);
    });
    expect(ok).toBe(true);
    expect(mockSetGroupMembers).toHaveBeenCalledWith("g1", ["u1", "u2"]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it(
    "setGroupMembers 失敗 (生エラー) で false を返し汎用メッセージ (groupMemberAssignFailed" +
      " フォールバック) を設定する (情報露出防止)",
    async () => {
      mockSetGroupMembers.mockRejectedValueOnce(
        new Error('relation "team_group_memberships" violates row-level security policy'),
      );
      const { result } = setup();
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.setGroupMembers("g1", ["u1"]);
      });
      expect(ok).toBe(false);
      expect(result.current.error).toBe("メンバーの割り当てに失敗しました");
    },
  );

  it(
    "setGroupMembers が UserFacingError で失敗した場合はそのメッセージがそのまま表示される" +
      " (上記テストとの対照実験: toUserFacingMessage が UserFacingError を素通しすることの証明)",
    async () => {
      mockSetGroupMembers.mockRejectedValueOnce(
        new UserFacingError("上限人数を超えるため割り当てできません"),
      );
      const { result } = setup();
      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.setGroupMembers("g1", ["u1"]);
      });
      expect(ok).toBe(false);
      expect(result.current.error).toBe("上限人数を超えるため割り当てできません");
    },
  );

  it(
    "listGroupMembers は失敗 (生エラー) 時に空配列を返し汎用メッセージ (groupMemberFetchFailed" +
      " フォールバック) を設定する (情報露出防止)",
    async () => {
      mockListGroupMembers.mockRejectedValueOnce(
        new Error('relation "team_group_memberships" violates row-level security policy'),
      );
      const { result } = setup();
      let members: unknown;
      await act(async () => {
        members = await result.current.listGroupMembers("g1");
      });
      expect(members).toEqual([]);
      expect(result.current.error).toBe("メンバー情報の取得に失敗しました");
    },
  );

  it(
    "listGroupMembers が UserFacingError で失敗した場合はそのメッセージがそのまま表示される" +
      " (上記テストとの対照実験: toUserFacingMessage が UserFacingError を素通しすることの証明)",
    async () => {
      mockListGroupMembers.mockRejectedValueOnce(
        new UserFacingError("このグループのメンバー一覧を閲覧する権限がありません"),
      );
      const { result } = setup();
      let members: unknown;
      await act(async () => {
        members = await result.current.listGroupMembers("g1");
      });
      expect(members).toEqual([]);
      expect(result.current.error).toBe("このグループのメンバー一覧を閲覧する権限がありません");
    },
  );

  it("clearError でエラーが消える (生エラーは groupDeleteFailed フォールバックに置き換わった上で消える)", async () => {
    mockRemove.mockRejectedValueOnce(
      new Error('relation "team_groups" violates row-level security policy'),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.deleteGroup("g1");
    });
    expect(result.current.error).toBe("グループの削除に失敗しました");
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
