/**
 * PracticeTabModal — 保存失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleSave の catch は
 * `setBasicValidationError(toUserFacingMessage(error, tCommon("error")))` で表示する
 * (親が既に保存済みの partialSaveError 分岐は本テストの対象外)。
 *
 * onSave はプロパティとして直接注入できるため、それを reject させることで
 * D-1 相当の DB fetch を経由せずに handleSave の catch ブロックだけを単独で検証する
 * (editingPracticeId を null にし、既存ログ再取得自体を起こさせない)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: {} }),
}));

vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// PracticeLogTemplateSelectModal は常時マウントされ next-intl の useRouter を呼ぶため、
// AppRouterContext 無しの単体テストではクラッシュする (本テストの関心事とは無関係)。
vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

import PracticeTabModal from "@/components/forms/PracticeTabModal";

const FUTURE_DATE = new Date("2099-01-01");

describe("PracticeTabModal — 保存失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[V-ERR-01] onSave が生の Error (RLSポリシー詳細等) で失敗した場合、" +
      "汎用フォールバック文言 (common.error) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(
        new Error('relation "practices" violates row-level security policy'),
      );
      render(
        <PracticeTabModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={onSave}
          selectedDate={FUTURE_DATE}
          editingData={null}
          editingPracticeId={null}
          availableTags={[]}
          setAvailableTags={vi.fn()}
          isLoading={false}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("practice-tab-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("practice-tab-modal-save"));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("エラーが発生しました");
      expect(alert).not.toHaveTextContent("row-level security policy");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] onSave が UserFacingError (i18n 済みメッセージ) で失敗した場合、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      const onSave = vi.fn().mockRejectedValue(
        new UserFacingError("テスト用の翻訳済みメッセージ"),
      );
      render(
        <PracticeTabModal
          isOpen={true}
          onClose={vi.fn()}
          onSave={onSave}
          selectedDate={FUTURE_DATE}
          editingData={null}
          editingPracticeId={null}
          availableTags={[]}
          setAvailableTags={vi.fn()}
          isLoading={false}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("practice-tab-modal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("practice-tab-modal-save"));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("テスト用の翻訳済みメッセージ");
    },
  );
});
