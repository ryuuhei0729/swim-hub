/**
 * VideoPlayer — 署名付きURL取得失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * fetchPresignedUrls は fetch("/api/storage/videos/presigned-url") の結果を catch し、
 * `setError(toUserFacingMessage(err, t("loadFailed")))` で表示する。
 * 生の Error と UserFacingError を対で注入し、前者は汎用フォールバックに潰され、
 * 後者はそのまま表示されることを検証する。
 *
 * (VideoPlayer.tsx 自身は常に `throw new Error(...)` しか行わないため、UserFacingError
 * 側は fetch 境界を直接モックして注入する合成テストになる。目的は VideoPlayer が使う
 * toUserFacingMessage の表示側契約そのものの検証)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

import VideoPlayer from "@/components/video/VideoPlayer";

describe("VideoPlayer — 署名付きURL取得失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "[V-ERR-01] fetch が非OKレスポンス (生のエラー文字列を含む) を返した場合、" +
      "汎用フォールバック文言 (loadFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: () =>
            Promise.resolve({ error: 'relation "records" violates row-level security policy' }),
        }),
      );
      render(<VideoPlayer videoPath="records/user-1/video.mp4" />);

      await screen.findByText("動画の読み込みに失敗しました");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] catch した error が UserFacingError の場合、そのメッセージがそのまま表示される" +
      " (対照実験)",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          throw new UserFacingError("テスト用の翻訳済みメッセージ");
        }),
      );
      render(<VideoPlayer videoPath="records/user-1/video.mp4" />);

      await waitFor(() => {
        expect(screen.getByText("テスト用の翻訳済みメッセージ")).toBeInTheDocument();
      });
    },
  );
});
