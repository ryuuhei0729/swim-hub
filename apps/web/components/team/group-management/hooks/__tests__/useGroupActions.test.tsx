// =============================================================================
// useGroupActions.test.tsx (web) - QA Engineer 検証 (情報露出防止の穴埋め)
//
// mobile 版 (apps/mobile/components/teams/group-management/hooks/__tests__/
// useGroupActions.test.tsx) は今スプリントで対のテスト (生の Error → フォールバック /
// UserFacingError → 素通し) を整備済み。web 版の useGroupActions.ts は mobile 版と
// ロジックが完全に同一 (i18n の実装のみ react-i18next → next-intl で異なる) だが、
// web 側にはテストが一切存在しなかった (前 QA 実測)。mobile 版の構成をそのまま移植する。
//
// web の i18n 名前空間は "teamsAdmin.groupManagement.errors" (mobile の
// "teams.mobile.group*" とはキー体系が異なる) のため、期待文言は
// apps/shared/messages/ja.json の実際の値を使う (推測しない)。
// =============================================================================

import { act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";
import { renderHookWithI18n as renderHook } from "../../../../../__tests__/utils/render";

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

describe("useGroupActions (web) - createGroup", () => {
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

  it("23505 (一意制約違反) で重複エラーを設定し null を返す", async () => {
    mockCreate.mockRejectedValueOnce(new Error("duplicate key value violates 23505"));
    const { result } = setup();

    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.createGroup("Cat", "A");
    });

    expect(ret).toBeNull();
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("'unique' を含むエラーでも重複エラーに分類する", async () => {
    mockCreate.mockRejectedValueOnce(new Error("violates unique constraint"));
    const { result } = setup();
    await act(async () => {
      await result.current.createGroup(null, "A");
    });
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("重複以外の生エラーは汎用メッセージ (createFailed フォールバック) に置き換わる (情報露出防止)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.createGroup(null, "A");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("グループの作成に失敗しました");
    expect(result.current.error).not.toContain("network down");
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

describe("useGroupActions (web) - createGroups (カンマ複数作成)", () => {
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

  it(
    "重複以外の部分失敗 (生エラー) では「行名: 作成に失敗」形式の汎用メッセージになる" +
      " (情報露出防止)",
    async () => {
      mockCreate
        .mockResolvedValueOnce({ id: "a" })
        .mockRejectedValueOnce(new Error('relation "team_groups" violates row-level security policy'));
      const { result } = setup();

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createGroups("Cat", ["A", "B"]);
      });

      expect(ok).toBe(false);
      expect(result.current.error).toBe("「B」: 作成に失敗");
      expect(result.current.error).not.toContain("row-level security policy");
    },
  );

  it(
    "createGroups が UserFacingError で部分失敗した場合はそのメッセージがそのまま表示される" +
      " (対照実験)",
    async () => {
      mockCreate
        .mockResolvedValueOnce({ id: "a" })
        .mockRejectedValueOnce(new UserFacingError("上限に達しました"));
      const { result } = setup();

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createGroups("Cat", ["A", "B"]);
      });

      expect(ok).toBe(false);
      expect(result.current.error).toBe("「B」: 上限に達しました");
    },
  );
});

describe("useGroupActions (web) - updateGroup / deleteGroup", () => {
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

  it("updateGroup の重複は重複エラー、null を返す", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("23505"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.updateGroup("g1", null, "dup");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("同じカテゴリに同名のグループが既に存在します");
  });

  it("updateGroup の重複以外の生エラーは汎用メッセージ (updateFailed) に置き換わる (情報露出防止)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error('relation "team_groups" violates row-level security policy'),
    );
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.updateGroup("g1", null, "renamed");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("グループの更新に失敗しました");
    expect(result.current.error).not.toContain("row-level security policy");
  });

  it("updateGroup が UserFacingError で失敗した場合はそのメッセージがそのまま表示される (対照実験)", async () => {
    mockUpdate.mockRejectedValueOnce(new UserFacingError("この名前には変更できません"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.updateGroup("g1", null, "renamed");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("この名前には変更できません");
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
    expect(result.current.error).not.toContain("row-level security policy");
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

describe("useGroupActions (web) - setGroupMembers / listGroupMembers", () => {
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
    "setGroupMembers 失敗 (生エラー) で false を返し汎用メッセージ (assignFailed" +
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
      expect(result.current.error).not.toContain("row-level security policy");
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
    "listGroupMembers は失敗 (生エラー) 時に空配列を返し汎用メッセージ (fetchMembersFailed" +
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
      expect(result.current.error).not.toContain("row-level security policy");
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

  it("clearError でエラーが消える (生エラーは deleteFailed フォールバックに置き換わった上で消える)", async () => {
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
