/**
 * VideoUploader — アップロード失敗時のエラー表示 (情報露出防止の対テスト)
 *
 * 対象は今スプリントの Sprint Contract で「テストが皆無」と分類された13ファイルの1つ。
 * doUpload の catch は `setError(toUserFacingMessage(err, t("uploadFailed")))` で表示する。
 *
 * VideoUploader.tsx は VideoEditor (dynamic import, ssr:false) を経由してファイルを
 * 受け取るため、VideoEditor はスタブに差し替え、onComplete を直接呼べるようにする。
 *
 * - [V-ERR-01] (生の Error): アップロードURL取得 API (upload-url) が非OKレスポンスで
 *   生のエラー詳細を返すケース (`throw new Error(...)`、VideoUploader.tsx:88)。
 * - [V-ERR-02] (UserFacingError): 動画本体の XHR PUT がネットワークエラーになるケース
 *   (`reject(new UserFacingError(t("videoNetworkError")))`、VideoUploader.tsx:107)。
 *   これは VideoUploader.tsx が実際に UserFacingError を投げる唯一の組織的な経路であり、
 *   合成ではなく実装の実際の分岐を通す。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/components/video/VideoEditor", () => ({
  __esModule: true,
  default: ({
    onComplete,
  }: {
    onComplete: (file: File, thumbnail: Blob) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onComplete(
          new File(["video-data"], "clip.mp4", { type: "video/mp4" }),
          new Blob(["thumb-data"], { type: "image/jpeg" }),
        )
      }
    >
      編集完了スタブ
    </button>
  ),
}));

import VideoUploader from "@/components/video/VideoUploader";

// jsdom の実 XMLHttpRequest は実ネットワークに触れようとして不安定なため、
// テストごとに挙動 (成功/onerror) を制御できるフェイクに差し替える。
class FakeXHR {
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  open() {}
  setRequestHeader() {}
  send() {
    queueMicrotask(() => {
      if (FakeXHR.mode === "error") {
        this.onerror?.();
      } else {
        this.status = 200;
        this.onload?.();
      }
    });
  }
  static mode: "success" | "error" = "success";
}

const selectAndCompleteEditing = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "動画を追加" }));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["source"], "source.mp4", { type: "video/mp4" });
  await user.upload(input, file);
  await user.click(await screen.findByText("編集完了スタブ"));
};

describe("VideoUploader — アップロード失敗時のエラー表示 — 情報露出防止の対テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeXHR.mode = "success";
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it(
    "[V-ERR-01] アップロードURL取得APIが生のエラー詳細を返して失敗した場合、" +
      "汎用フォールバック文言 (uploadFailed) が表示され、生のエラー文字列は表示されない",
    async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          json: () =>
            Promise.resolve({ error: 'relation "records" violates row-level security policy' }),
        }),
      );
      render(<VideoUploader type="record" id="record-1" isPremium={true} />);

      await selectAndCompleteEditing(user);

      await screen.findByText("アップロードに失敗しました");
      expect(screen.queryByText(/row-level security policy/)).not.toBeInTheDocument();
    },
  );

  it(
    "[V-ERR-02] 動画本体のアップロード (XHR) がネットワークエラーになった場合" +
      " (VideoUploader.tsx の実際の UserFacingError 送出経路)、" +
      "そのメッセージがそのまま表示される (対照実験)",
    async () => {
      const user = userEvent.setup();
      FakeXHR.mode = "error";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              videoUploadUrl: "https://example.test/upload/video",
              thumbnailUploadUrl: "https://example.test/upload/thumb",
              videoPath: "records/user-1/video.mp4",
              thumbnailPath: "records/user-1/thumb.jpg",
            }),
        }),
      );
      render(<VideoUploader type="record" id="record-1" isPremium={true} />);

      await selectAndCompleteEditing(user);

      await waitFor(() => {
        expect(
          screen.getByText("動画アップロード中にネットワークエラーが発生しました"),
        ).toBeInTheDocument();
      });
    },
  );
});
