import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockStyle,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "../../__mocks__/supabase";
import { StyleAPI } from "../../api/styles";

describe("StyleAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: StyleAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    api = new StyleAPI(mockClient);
  });

  describe("種目取得", () => {
    it("すべての種目を取得できる", async () => {
      const mockStyles = [
        createMockStyle({ id: "1", name_en: "freestyle", distance: 50 }),
        createMockStyle({ id: "2", name_en: "freestyle", distance: 100 }),
      ];

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockStyles,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getStyles();

      expect(mockClient.from).toHaveBeenCalledWith("styles");
      expect(result).toEqual(mockStyles);
    });

    it("クエリが失敗したときエラーが発生する", async () => {
      const error = new Error("Query failed");
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.getStyles()).rejects.toThrow("Query failed");
    });
  });

  describe("種目取得（ID指定）", () => {
    it("IDを指定したとき該当種目を取得できる", async () => {
      const mockStyle = createMockStyle({ id: "1", distance: 100 });

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockStyle,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getStyle(1);

      expect(mockClient.from).toHaveBeenCalledWith("styles");
      expect(result).toEqual(mockStyle);
    });
  });

  describe("種目取得（ストローク指定）", () => {
    it("ストロークを指定したとき該当種目を取得できる", async () => {
      const mockStyles = [
        createMockStyle({ name_en: "freestyle", distance: 50 }),
        createMockStyle({ name_en: "freestyle", distance: 100 }),
      ];

      // NOTE (Sprint: GitHub Issue #13): getStylesByStroke は移行安全性のため
      // .eq ではなく .ilike で照合するよう変更された (apps/shared/api/styles.ts 参照)。
      // ケーシングの絞り込み値そのものの検証は
      // apps/shared/__tests__/api/styleCasingMigrationSafety.test.ts [V-MIG-03] で行う。
      // このテストは既存の「結果が返る」観点のみ維持するため、モックに ilike を追加した。
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        ilike: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockStyles,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getStylesByStroke("freestyle");

      expect(mockClient.from).toHaveBeenCalledWith("styles");
      expect(result).toEqual(mockStyles);
    });
  });
});
