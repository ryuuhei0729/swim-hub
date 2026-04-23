/**
 * VideoUploader.test.tsx
 *
 * テスト観点 (Sprint Contract Bug 4(a)):
 *   onPendingVideoUri prop の動作検証
 *
 *   - id が undefined のとき動画選択後に onPendingVideoUri(uri) が呼ばれる
 *   - id が undefined のとき動画取り消し後に onPendingVideoUri(null) が呼ばれる
 *   - id が定義済みのとき動画選択後に onPendingVideoUri は呼ばれない（即アップロード）
 *   - onPendingVideoUri が未指定でも動画選択・取り消しでクラッシュしない
 *
 * 既存の VideoUploader の動作に影響しないことの確認:
 *   - isPremium=false かつ uploadState=idle のとき PremiumBadge が表示される（回帰）
 *   - 保留状態（selected）のとき「動画を選択済み」テキストが表示される（回帰）
 *   - アップロード完了後に onUploadComplete が呼ばれる（回帰）
 *
 * トートロジー防止メモ:
 *   - 内部 state (pendingVideoUri) を直接検査してはいけない
 *   - onPendingVideoUri の呼び出し引数を検証することで外部から観察する
 *   - uploadVideo 等の副作用はモックし、UI の振る舞いのみを検証する
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted で変数を事前定義（hoisting 問題を回避）
const mocks = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  deleteVideo: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  alertFn: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    session: { access_token: "mock-token" },
    getAccessToken: vi.fn(() => Promise.resolve("mock-token")),
  })),
}));

vi.mock("@/utils/videoUpload", () => ({
  uploadVideo: mocks.uploadVideo,
  deleteVideo: mocks.deleteVideo,
}));

vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: mocks.launchImageLibraryAsync,
  launchCameraAsync: mocks.launchCameraAsync,
}));

vi.mock("@swim-hub/shared/constants/premium", () => ({
  PREMIUM_MESSAGES: { video_upload: "動画アップロードはプレミアム会員限定" },
}));

vi.mock("@/components/shared/PremiumBadge", () => ({
  PremiumBadge: ({ message }: { message: string }) =>
    React.createElement("div", { "data-testid": "premium-badge" }, message),
}));

vi.mock("@/components/shared/VideoPlayer", () => ({
  VideoPlayer: () => React.createElement("div", { "data-testid": "video-player" }),
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Alert: {
      alert: mocks.alertFn,
    },
    Dimensions: {
      get: vi.fn(() => ({ width: 375, height: 667 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  };
});

import { VideoUploader } from "../VideoUploader";

const BASE_PROPS = {
  type: "record" as const,
  isPremium: true,
};

/** Alert.alert をモックして「ライブラリから選択」ボタンを自動押下する */
function mockAlertSelectLibrary() {
  mocks.alertFn.mockImplementation(
    (_title: string, _message: string, buttons: Array<{ text?: string; onPress?: () => void }>) => {
      // ボタンのテキストで検索することで、配列の順序変更に対して堅牢にする
      const libraryButton = buttons.find((b) => b?.text === "ライブラリから選択");
      libraryButton?.onPress?.();
    },
  );
}

describe("VideoUploader — onPendingVideoUri prop (Bug 4(a))", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("id が undefined（新規作成フロー）", () => {
    it("動画選択後に onPendingVideoUri(uri) が呼ばれる", async () => {
      const onPendingVideoUri = vi.fn();
      const selectedUri = "file:///video/selected.mp4";

      mockAlertSelectLibrary();
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: selectedUri, fileSize: 1024 * 1024 }],
      });

      render(
        <VideoUploader
          {...BASE_PROPS}
          id={undefined}
          onPendingVideoUri={onPendingVideoUri}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("動画を追加"));
      });

      expect(onPendingVideoUri).toHaveBeenCalledWith(selectedUri);
      // id なし → uploadVideo は呼ばれない
      expect(mocks.uploadVideo).not.toHaveBeenCalled();
    });

    it("取り消しボタン押下後に onPendingVideoUri(null) が呼ばれる", async () => {
      const onPendingVideoUri = vi.fn();
      const selectedUri = "file:///video/selected.mp4";

      mockAlertSelectLibrary();
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: selectedUri, fileSize: 1024 * 1024 }],
      });

      render(
        <VideoUploader
          {...BASE_PROPS}
          id={undefined}
          onPendingVideoUri={onPendingVideoUri}
        />,
      );

      // 動画を選択して保留状態にする
      await act(async () => {
        fireEvent.click(screen.getByText("動画を追加"));
      });

      // 保留状態で「取り消し」ボタンが表示される
      await act(async () => {
        fireEvent.click(screen.getByText("取り消し"));
      });

      expect(onPendingVideoUri).toHaveBeenNthCalledWith(1, selectedUri);
      expect(onPendingVideoUri).toHaveBeenNthCalledWith(2, null);
    });

    it("onPendingVideoUri が未指定でも取り消し操作でクラッシュしない", async () => {
      mockAlertSelectLibrary();
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024 }],
      });

      render(<VideoUploader {...BASE_PROPS} id={undefined} />);

      await act(async () => {
        fireEvent.click(screen.getByText("動画を追加"));
      });

      // 保留状態になったら取り消し
      if (screen.queryByText("取り消し")) {
        expect(() => fireEvent.click(screen.getByText("取り消し"))).not.toThrow();
      }
    });
  });

  describe("id が定義済み（編集フロー）", () => {
    it("動画選択後は即アップロードが走り onPendingVideoUri は呼ばれない", async () => {
      const onPendingVideoUri = vi.fn();
      const onUploadComplete = vi.fn();
      const selectedUri = "file:///video/selected.mp4";

      mockAlertSelectLibrary();
      mocks.launchImageLibraryAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: selectedUri, fileSize: 1024 * 1024 }],
      });

      mocks.uploadVideo.mockResolvedValueOnce({
        videoPath: "videos/user1/records/record1.mp4",
        thumbnailPath: "thumbnails/user1/records/record1.jpg",
      });

      render(
        <VideoUploader
          {...BASE_PROPS}
          id="record1"
          onPendingVideoUri={onPendingVideoUri}
          onUploadComplete={onUploadComplete}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByText("動画を追加"));
      });

      // id あり → 即アップロード → onPendingVideoUri は呼ばれない
      expect(onPendingVideoUri).not.toHaveBeenCalled();
      expect(mocks.uploadVideo).toHaveBeenCalled();
    });
  });
});

describe("VideoUploader — 既存動作の回帰テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isPremium=false かつ idle 状態のとき PremiumBadge が表示される", () => {
    render(<VideoUploader {...BASE_PROPS} isPremium={false} />);
    expect(screen.getByTestId("premium-badge")).toBeTruthy();
    expect(screen.getByText("動画アップロードはプレミアム会員限定")).toBeTruthy();
  });

  it("保留状態（selected）のとき「動画を選択済み」テキストが表示される", async () => {
    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024 }],
    });

    render(<VideoUploader {...BASE_PROPS} id={undefined} />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    // 保留状態のテキスト確認
    expect(screen.getByText(/動画を選択済み/)).toBeTruthy();
  });

  it("アップロード完了後に onUploadComplete(videoPath, thumbnailPath) が呼ばれる", async () => {
    const onUploadComplete = vi.fn();

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024 }],
    });

    const expectedVideoPath = "videos/user1/records/record1.mp4";
    const expectedThumbnailPath = "thumbnails/user1/records/record1.jpg";

    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: expectedVideoPath,
      thumbnailPath: expectedThumbnailPath,
    });

    render(
      <VideoUploader
        {...BASE_PROPS}
        id="record1"
        onUploadComplete={onUploadComplete}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(onUploadComplete).toHaveBeenCalledWith(expectedVideoPath, expectedThumbnailPath);
  });
});
