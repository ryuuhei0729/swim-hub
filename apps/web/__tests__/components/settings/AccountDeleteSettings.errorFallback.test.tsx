/**
 * AccountDeleteSettings — 削除失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * AccountDeleteSettings.tsx の handleDeleteAccount は fetch("/api/account/delete") の
 * 結果を catch し、`setError(toUserFacingMessage(err, tErrors("genericFailed")))` で
 * 表示する。生の Error (fetch 例外・非json応答等) と UserFacingError を対で注入し、
 * 前者は汎用フォールバックに潰され、後者はそのまま表示されることを検証する。
 *
 * (本番コードの handleDeleteAccount 自身は常に `throw new Error(...)` しか行わないため、
 * UserFacingError 側は fetch 境界を直接モックして注入する合成テストになる。これは
 * toUserFacingMessage を使うすべての catch ブロックに共通する「表示側の契約」を検証する
 * ためのものであり、将来 API 側が UserFacingError 相当のメッセージを返すよう変わっても
 * 表示が壊れないことを保証する)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    session: { access_token: "token-1" },
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import AccountDeleteSettings from "@/components/settings/AccountDeleteSettings";

describe("AccountDeleteSettings — 削除失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const clickDeleteAndConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "アカウントを削除する" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));
  };

  it(
    "[V-ERR-01] fetch が非OKレスポンス (生のエラー文字列を含む) を返した場合、" +
      "汎用フォールバック文言 (genericFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: () =>
            Promise.resolve({ error: 'relation "users" violates row-level security policy' }),
        }),
      );
      render(<AccountDeleteSettings />);

      await clickDeleteAndConfirm(user);

      await screen.findByText("エラーが発生しました");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] catch した error が UserFacingError の場合、そのメッセージがそのまま表示される" +
      " (対照実験: toUserFacingMessage の表示側契約を fetch 境界のモックで直接検証)",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          throw new UserFacingError("テスト用の翻訳済みメッセージ");
        }),
      );
      render(<AccountDeleteSettings />);

      await clickDeleteAndConfirm(user);

      await waitFor(() => {
        expect(screen.getByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
      });
    },
  );
});
