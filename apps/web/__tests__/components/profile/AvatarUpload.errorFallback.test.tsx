/**
 * AvatarUpload — 削除失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * handleRemoveAvatar の catch は
 * `setError(toUserFacingMessage(err, t("deleteImageFailed")))` で表示する。
 * 生の Error と UserFacingError を対で注入し、前者は汎用フォールバックに潰され、
 * 後者はそのまま表示されることを検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/image-url", () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue("https://example.test/avatar.jpg"),
}));

import AvatarUpload from "@/components/profile/AvatarUpload";

describe("AvatarUpload — 削除失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "[V-ERR-01] 削除APIが非OKレスポンス (生のエラー文字列を含む) を返した場合、" +
      "汎用フォールバック文言 (deleteImageFailed) が表示され、生のエラー文字列は表示されない",
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
      render(
        <AvatarUpload
          currentAvatarUrl="user-1/avatar.jpg"
          userName="テスト太郎"
          onAvatarChange={vi.fn()}
        />,
      );

      await user.click(await screen.findByLabelText("アバターを削除"));

      await screen.findByText("画像の削除に失敗しました");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] catch した error が UserFacingError の場合、そのメッセージがそのまま表示される" +
      " (対照実験)",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          throw new UserFacingError("テスト用の翻訳済みメッセージ");
        }),
      );
      render(
        <AvatarUpload
          currentAvatarUrl="user-1/avatar.jpg"
          userName="テスト太郎"
          onAvatarChange={vi.fn()}
        />,
      );

      await user.click(await screen.findByLabelText("アバターを削除"));

      await waitFor(() => {
        expect(screen.getByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
      });
    },
  );
});
