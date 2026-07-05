// =============================================================================
// useGroupActions.test.tsx - QA Engineer 検証 (グループ配線スプリント)
// 配線で初めて実行される CRUD ラッパーの純粋ロジックを検証する。
//   - 重複名エラー分類 (23505 / duplicate / unique -> groupDuplicateError)
//   - 非重複エラーはメッセージをそのまま透過
//   - createGroups (カンマ複数作成) の成否集計と部分失敗
//   - create/update は成功で値・失敗で null / delete・setGroupMembers は boolean
//   - onSuccess コールバックが成功時に呼ばれる
// TeamGroupManagement.handleFormSubmit が result!==null / boolean を分岐に使うため
// これらの戻り値契約は配線の健全性に直結する。
// =============================================================================

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  it("重複以外のエラーはメッセージをそのまま透過する", async () => {
    mockCreate.mockRejectedValueOnce(new Error("network down"));
    const { result } = setup();
    let ret: unknown = "sentinel";
    await act(async () => {
      ret = await result.current.createGroup(null, "A");
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe("network down");
  });
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

  it("deleteGroup 成功で true、失敗で false", async () => {
    mockRemove.mockResolvedValueOnce(undefined);
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.deleteGroup("g1");
    });
    expect(ok).toBe(true);

    mockRemove.mockRejectedValueOnce(new Error("forbidden"));
    await act(async () => {
      ok = await result.current.deleteGroup("g1");
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe("forbidden");
  });
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

  it("setGroupMembers 失敗で false を返しエラーを設定する", async () => {
    mockSetGroupMembers.mockRejectedValueOnce(new Error("rls denied"));
    const { result } = setup();
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setGroupMembers("g1", ["u1"]);
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe("rls denied");
  });

  it("listGroupMembers は失敗時に空配列を返しエラーを設定する", async () => {
    mockListGroupMembers.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();
    let members: unknown;
    await act(async () => {
      members = await result.current.listGroupMembers("g1");
    });
    expect(members).toEqual([]);
    expect(result.current.error).toBe("boom");
  });

  it("clearError でエラーが消える", async () => {
    mockRemove.mockRejectedValueOnce(new Error("x"));
    const { result } = setup();
    await act(async () => {
      await result.current.deleteGroup("g1");
    });
    expect(result.current.error).toBe("x");
    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
