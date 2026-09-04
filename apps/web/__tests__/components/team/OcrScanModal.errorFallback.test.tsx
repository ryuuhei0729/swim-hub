/**
 * OcrScanModal — 解析失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleAnalyze の catch は
 * `setError(toUserFacingMessage(err, t("ocr.errors.analyzeError")))` で表示する。
 *
 * - [V-ERR-01] (生の Error): `supabase.functions.invoke("scan-timesheet")` が生の
 *   エラー詳細を返すケース (OcrScanModal.tsx:230 `throw new Error(fnError.message ...)`)。
 * - [V-ERR-02] (UserFacingError): 解析結果の形式が不正 (`isGeminiScanResult` が false)
 *   なケース。OcrScanModal.tsx:239 `throw new UserFacingError(t("ocr.errors.invalidFormat"))`
 *   という実際の組織的な UserFacingError 送出経路であり、合成ではない。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { functions: { invoke: mockInvoke } } }),
}));

import OcrScanModal from "@/components/team/OcrScanModal";

const selectImageAndAnalyze = async (user: ReturnType<typeof userEvent.setup>) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["fake-image-data"], "scan.png", { type: "image/png" });
  await user.upload(input, file);
  await user.click(screen.getByRole("button", { name: "解析する" }));
};

describe("OcrScanModal — 解析失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom は URL.createObjectURL/revokeObjectURL を実装していないため、
    // OcrScanModal のプレビュー表示ロジック用にスタブする (今回のテストの関心事ではない)。
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mock-preview-url"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "[V-ERR-01] scan-timesheet 呼び出しが生のエラー詳細で失敗した場合、" +
      "汎用フォールバック文言 (analyzeError) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'relation "practices" violates row-level security policy' },
      });
      render(
        <OcrScanModal
          isOpen={true}
          onClose={vi.fn()}
          onApply={vi.fn()}
          members={[]}
          presentUserIds={[]}
        />,
      );

      await selectImageAndAnalyze(user);

      await waitFor(() => {
        expect(screen.getByText("解析中にエラーが発生しました")).toBeInTheDocument();
      });
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] 解析結果の形式が不正 (UserFacingError = invalidFormat、実際の送出経路) の場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      // isGeminiScanResult() が false になる不正な形状 (menu が無い)
      mockInvoke.mockResolvedValueOnce({
        data: { swimmers: [] },
        error: null,
      });
      render(
        <OcrScanModal
          isOpen={true}
          onClose={vi.fn()}
          onApply={vi.fn()}
          members={[]}
          presentUserIds={[]}
        />,
      );

      await selectImageAndAnalyze(user);

      await waitFor(() => {
        expect(
          screen.getByText("解析結果の形式が不正です。再度お試しください"),
        ).toBeInTheDocument();
      });
    },
  );
});
