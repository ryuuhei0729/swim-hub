/**
 * FocusPointAPI と splitFocusPoints のテスト
 *
 * - 追加・再開で DB トリガーが上限超え ('focus_point_limit_exceeded') を投げたら FocusPointLimitError に置き換える
 * - 状態の変更は status だけを送る (mastered_at は DB のトリガーが入れる)
 * - 削除は RLS で拒否されても 0 行で正常終了するので、件数で失敗を見る
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type MockSupabaseClient } from "../../__mocks__/supabase";
import {
  FocusPointAPI,
  FocusPointLimitError,
  isFocusPointLimitError,
} from "../../api/focusPoints";
import { splitFocusPoints } from "../../hooks/queries/focusPoints";
import type { FocusPoint } from "../../types/focusPoint";

const point = (overrides: Partial<FocusPoint> = {}): FocusPoint => ({
  id: "fp-1",
  user_id: "user-1",
  title: "右手の入水を遠くに",
  note: null,
  status: "active",
  mastered_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...overrides,
});

const LIMIT_ERROR = { code: "P0001", message: "focus_point_limit_exceeded" };

/** insert/update(...).eq?().select().single() のチェイン */
function mockWriteChain(response: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(response);
  const select = vi.fn(() => ({ single }));
  const eq = vi.fn(() => ({ select }));
  const insert = vi.fn((_values: Record<string, unknown>) => ({ select }));
  const update = vi.fn((_values: Record<string, unknown>) => ({ eq }));
  return { builder: { insert, update }, insert, update, eq, select, single };
}

describe("FocusPointAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: FocusPointAPI;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    api = new FocusPointAPI(mockClient);
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    }) as typeof mockClient.auth.getUser;
  });

  describe("createFocusPoint", () => {
    it("本人の user_id で、前後の空白を落として追加する。空のメモは null にする", async () => {
      const chain = mockWriteChain({ data: point(), error: null });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      await api.createFocusPoint({ title: "  右手の入水を遠くに ", note: "   " });

      expect(mockClient.from).toHaveBeenCalledWith("focus_points");
      expect(chain.insert).toHaveBeenCalledWith({
        user_id: "user-1",
        title: "右手の入水を遠くに",
        note: null,
      });
    });

    it("上限超えのトリガーエラーは FocusPointLimitError にする", async () => {
      const chain = mockWriteChain({ data: null, error: LIMIT_ERROR });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      const error = await api.createFocusPoint({ title: "腰を浮かせる" }).catch((e) => e);
      expect(error).toBeInstanceOf(FocusPointLimitError);
      expect(isFocusPointLimitError(error)).toBe(true);
    });

    it("それ以外のエラーはそのまま投げる", async () => {
      const other = { code: "23514", message: "violates check constraint" };
      const chain = mockWriteChain({ data: null, error: other });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      const error = await api.createFocusPoint({ title: "x" }).catch((e) => e);
      expect(error).toBe(other);
      expect(isFocusPointLimitError(error)).toBe(false);
    });

    it("ログインしていなければ書き込まない", async () => {
      mockClient.auth.getUser = vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }) as typeof mockClient.auth.getUser;
      mockClient.from = vi.fn() as unknown as typeof mockClient.from;

      await expect(api.createFocusPoint({ title: "x" })).rejects.toThrow("認証が必要です");
      expect(mockClient.from).not.toHaveBeenCalled();
    });
  });

  describe("setStatus", () => {
    it("状態だけを送る (mastered_at は端末の時計ではなく DB のトリガーが入れる)", async () => {
      const chain = mockWriteChain({ data: point({ status: "mastered" }), error: null });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      await api.setStatus("fp-1", "mastered");

      expect(chain.update).toHaveBeenCalledWith({ status: "mastered" });
      expect(chain.eq).toHaveBeenCalledWith("id", "fp-1");
    });

    it("取り組み中に戻すときに上限を超えていたら FocusPointLimitError", async () => {
      const chain = mockWriteChain({ data: null, error: LIMIT_ERROR });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      await expect(api.setStatus("fp-1", "active")).rejects.toBeInstanceOf(FocusPointLimitError);
      expect(chain.update).toHaveBeenCalledWith({ status: "active" });
    });
  });

  describe("updateFocusPoint", () => {
    it("渡した項目だけ更新する (状態は変えない)", async () => {
      const chain = mockWriteChain({ data: point(), error: null });
      mockClient.from = vi.fn(() => chain.builder) as unknown as typeof mockClient.from;

      await api.updateFocusPoint("fp-1", { title: " 腰を浮かせる " });

      expect(chain.update).toHaveBeenCalledWith({ title: "腰を浮かせる" });
    });
  });

  describe("deleteFocusPoint", () => {
    const mockDeleteChain = (response: { data: unknown; error: unknown }) => {
      const select = vi.fn().mockResolvedValue(response);
      const eq = vi.fn(() => ({ select }));
      const del = vi.fn(() => ({ eq }));
      mockClient.from = vi.fn(() => ({ delete: del })) as unknown as typeof mockClient.from;
      return { del, eq, select };
    };

    it("1行消えたら正常終了する", async () => {
      const { eq, select } = mockDeleteChain({ data: [{ id: "fp-1" }], error: null });
      await expect(api.deleteFocusPoint("fp-1")).resolves.toBeUndefined();
      expect(eq).toHaveBeenCalledWith("id", "fp-1");
      expect(select).toHaveBeenCalledWith("id");
    });

    it("0行 (RLS で拒否) ならエラーにする", async () => {
      mockDeleteChain({ data: [], error: null });
      await expect(api.deleteFocusPoint("fp-1")).rejects.toThrow(
        "フォーカスポイントの削除に失敗しました",
      );
    });
  });
});

describe("splitFocusPoints", () => {
  it("取り組み中は渡した順のまま、身についたものは新しく身についた順に分ける", () => {
    const result = splitFocusPoints([
      point({ id: "a" }),
      point({ id: "old", status: "mastered", mastered_at: "2026-09-01T00:00:00Z" }),
      point({ id: "b" }),
      point({ id: "new", status: "mastered", mastered_at: "2026-11-01T00:00:00Z" }),
    ]);
    expect(result.active.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.mastered.map((p) => p.id)).toEqual(["new", "old"]);
  });
});
