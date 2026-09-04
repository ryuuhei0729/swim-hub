/**
 * PracticeLogTemplateAPI.deleteTemplate の 0行ガード回帰テスト
 *
 * このファイルは新規作成。既存の practiceLogTemplates.ts には他にも
 * getTemplates/createTemplate/updateTemplate 等のメソッドがあるが、
 * 今スプリントの担当範囲 (課題B: RLS拒否時の0行削除ガード) に絞り、
 * deleteTemplate のみを対象とする。他メソッドのテスト網羅は範囲外。
 *
 * deleteTemplate は delete().eq("id", id).select("id") というチェインで呼ばれる
 * (RLSがDELETEを拒否した場合もerrorを返さず0行削除で正常終了する問題への対策として
 * .select() で結果行を見る。practices.ts の deletePractice と同型)。
 * eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
 * クエリの絞り込み対象・返却カラムを捨てない。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient, type MockSupabaseClient } from "../../__mocks__/supabase";
import { PracticeLogTemplateAPI } from "../../api/practiceLogTemplates";

describe("PracticeLogTemplateAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: PracticeLogTemplateAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    api = new PracticeLogTemplateAPI(mockClient);
  });

  describe("テンプレート削除", () => {
    const mockDeleteTemplateChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("テンプレートを削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteTemplateChain({
        data: [{ id: "template-1" }],
        error: null,
      });

      await expect(api.deleteTemplate("template-1")).resolves.toBeUndefined();

      expect(mockClient.from).toHaveBeenCalledWith("practice_log_templates");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "template-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    it("削除が失敗したときエラーが発生する", async () => {
      const error = new Error("Delete failed");
      mockDeleteTemplateChain({ data: null, error });

      await expect(api.deleteTemplate("template-1")).rejects.toThrow("Delete failed");
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-1] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteTemplateChain({ data: [], error: null });

        await expect(api.deleteTemplate("template-1")).rejects.toThrow(
          "テンプレートの削除に失敗しました",
        );
        expect(eqMock).toHaveBeenCalledWith("id", "template-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-2] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteTemplateChain({ data: null, error: null });

        await expect(api.deleteTemplate("template-1")).rejects.toThrow(
          "テンプレートの削除に失敗しました",
        );
      });

      it("[D-3] 1行返った場合は正常終了する(非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteTemplateChain({
          data: [{ id: "template-99" }],
          error: null,
        });

        await expect(api.deleteTemplate("template-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "template-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-4] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table practice_log_templates");
        mockDeleteTemplateChain({ data: null, error });

        await expect(api.deleteTemplate("template-1")).rejects.toThrow(error);
      });
    });
  });
});
