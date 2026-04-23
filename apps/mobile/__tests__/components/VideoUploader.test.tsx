/**
 * VideoUploader コンポーネント テスト
 *
 * Sprint Contract: モバイル画像・動画アップロード修正
 * 対象バグ: #3 大会動画サイレント失敗 / #4,5 動画選択直後「予期しないエラー」
 *
 * 検証観点 (Sprint Contract 項目に絞る):
 * [VC-01] idle 状態 — Premium ユーザーに「動画を追加」ボタンが表示される
 * [VC-02] idle 状態 — 非 Premium ユーザーに PremiumBadge が表示され、追加ボタンが表示されない
 * [VC-03] pickVideo (id あり) — ライブラリ選択後に即 uploadVideo() が呼ばれ、done 状態に遷移する
 * [VC-04] pickVideo (id なし) — ライブラリ選択後は selected 状態に遷移し、uploadVideo() は呼ばれない
 * [VC-05] pickVideo (id なし) — selected 状態で onPendingVideoUri(uri) が呼ばれる
 * [VC-06] pickVideo — getAccessToken() が失敗したとき Alert.alert が呼ばれ、状態は idle のまま
 * [VC-08] selected 状態 — 「取り消し」を押すと onPendingVideoUri(null) が呼ばれ idle に戻る
 * [VC-14] ファイルサイズ超過 — 200MB を超える asset で Alert が表示され、uploadVideo は呼ばれない
 *
 * トートロジー防止メモ:
 * - 内部 state を直接検査しない
 * - 外から観察できる振る舞い（コールバック・DOM表示）のみを検証する
 * - getAccessToken の動作は AuthProvider.test.tsx で検証済み → ここではモックで代替
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// vi.hoisted で変数を事前定義（モジュール hoisting 問題を回避）
const mocks = vi.hoisted(() => ({
  uploadVideo: vi.fn(),
  deleteVideo: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  alertFn: vi.fn(),
  getAccessToken: vi.fn(),
}));

// useAuth モック — getAccessToken 関数を含む形に修正
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    getAccessToken: mocks.getAccessToken,
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

import { VideoUploader } from "@/components/shared/VideoUploader";

const BASE_PROPS = {
  type: "record" as const,
  isPremium: true,
};

/** Alert.alert をモックして「ライブラリから選択」ボタンを自動押下するヘルパー */
function mockAlertSelectLibrary() {
  mocks.alertFn.mockImplementation(
    (_title: string, _message: string, buttons?: Array<{ text?: string; onPress?: () => void }>) => {
      if (!Array.isArray(buttons)) return;
      const libraryButton = buttons.find((b) => b?.text === "ライブラリから選択");
      libraryButton?.onPress?.();
    },
  );
}

describe("[VC-01] idle — Premium ユーザーに追加ボタンが表示される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("isPremium=true かつ uploadState=idle のとき「動画を追加」ボタンが表示される", () => {
    render(<VideoUploader {...BASE_PROPS} />);
    expect(screen.getByText("動画を追加")).toBeTruthy();
  });
});

describe("[VC-02] idle — 非 Premium ユーザーに PremiumBadge が表示される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("isPremium=false のとき PremiumBadge が表示され、「動画を追加」ボタンは表示されない", () => {
    render(<VideoUploader {...BASE_PROPS} isPremium={false} />);

    expect(screen.getByTestId("premium-badge")).toBeTruthy();
    expect(screen.queryByText("動画を追加")).toBeNull();
  });
});

describe("[VC-03] pickVideo — id あり: 即アップロード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("ライブラリから動画を選択すると uploadVideo() が呼ばれる", async () => {
    const onUploadComplete = vi.fn();
    const selectedUri = "file:///video/selected.mp4";

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: selectedUri, fileSize: 1024 * 1024, mimeType: "video/mp4" }],
    });
    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: "videos/rec1.mp4",
      thumbnailPath: "thumbs/rec1.jpg",
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" onUploadComplete={onUploadComplete} />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.uploadVideo).toHaveBeenCalled();
  });

  it("uploadVideo() が成功すると onUploadComplete(videoPath, thumbnailPath) が呼ばれる", async () => {
    const onUploadComplete = vi.fn();
    const selectedUri = "file:///video/selected.mp4";

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: selectedUri, fileSize: 1024 * 1024, mimeType: "video/mp4" }],
    });
    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: "videos/rec1.mp4",
      thumbnailPath: "thumbs/rec1.jpg",
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" onUploadComplete={onUploadComplete} />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(onUploadComplete).toHaveBeenCalledWith("videos/rec1.mp4", "thumbs/rec1.jpg");
  });

  it("getAccessToken() が呼ばれる（session から直接 access_token を取得しない）", async () => {
    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024, mimeType: "video/mp4" }],
    });
    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: "videos/rec1.mp4",
      thumbnailPath: "thumbs/rec1.jpg",
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.getAccessToken).toHaveBeenCalled();
  });

  it("uploadVideo() に asset.mimeType が渡される", async () => {
    const onUploadComplete = vi.fn();

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mov", fileSize: 1024 * 1024, mimeType: "video/quicktime" }],
    });
    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: "videos/rec1.mp4",
      thumbnailPath: "thumbs/rec1.jpg",
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" onUploadComplete={onUploadComplete} />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "video/quicktime" }),
    );
  });
});

describe("[VC-04] pickVideo — id なし: 保留フロー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("ライブラリから動画を選択しても uploadVideo() は呼ばれず、selected 状態のテキストが表示される", async () => {
    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024 }],
    });

    render(<VideoUploader {...BASE_PROPS} id={undefined} />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.uploadVideo).not.toHaveBeenCalled();
    expect(screen.getByText(/動画を選択済み/)).toBeTruthy();
  });
});

describe("[VC-05] pickVideo — onPendingVideoUri コールバック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("id なし で動画を選択すると onPendingVideoUri(uri) が呼ばれる", async () => {
    const onPendingVideoUri = vi.fn();
    const selectedUri = "file:///video/selected.mp4";

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: selectedUri, fileSize: 1024 * 1024 }],
    });

    render(
      <VideoUploader {...BASE_PROPS} id={undefined} onPendingVideoUri={onPendingVideoUri} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(onPendingVideoUri).toHaveBeenCalledWith(selectedUri);
  });
});

describe("[VC-06] pickVideo — getAccessToken 失敗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAccessToken() が null を返すとき Alert が呼ばれ、uploadVideo は呼ばれない", async () => {
    // id ありフローでトークン取得失敗をシミュレート
    mocks.getAccessToken.mockResolvedValue(null);

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/test.mp4", fileSize: 1024 * 1024 }],
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.alertFn).toHaveBeenCalledWith("エラー", expect.any(String));
    expect(mocks.uploadVideo).not.toHaveBeenCalled();
  });
});

describe("[VC-08] selected 状態 — 取り消し", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("「取り消し」ボタンを押すと onPendingVideoUri(null) が呼ばれ idle 状態に遷移する", async () => {
    const onPendingVideoUri = vi.fn();
    const selectedUri = "file:///video/selected.mp4";

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: selectedUri, fileSize: 1024 * 1024 }],
    });

    render(
      <VideoUploader {...BASE_PROPS} id={undefined} onPendingVideoUri={onPendingVideoUri} />,
    );

    // まず動画を選択して保留状態にする
    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    // 取り消しを押す
    await act(async () => {
      fireEvent.click(screen.getByText("取り消し"));
    });

    expect(onPendingVideoUri).toHaveBeenNthCalledWith(1, selectedUri);
    expect(onPendingVideoUri).toHaveBeenNthCalledWith(2, null);
    // idle に戻り「動画を追加」が再表示される
    expect(screen.getByText("動画を追加")).toBeTruthy();
  });
});

describe("[VC-14] ファイルサイズ超過", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccessToken.mockResolvedValue("valid-token");
  });

  it("asset.fileSize が 200MB を超えるとき Alert が表示され、uploadVideo は呼ばれない", async () => {
    const OVER_200MB = 200 * 1024 * 1024 + 1;

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/huge.mp4", fileSize: OVER_200MB }],
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    expect(mocks.alertFn).toHaveBeenCalledWith("エラー", expect.stringContaining("200MB"));
    expect(mocks.uploadVideo).not.toHaveBeenCalled();
  });

  it("asset.fileSize が 200MB ちょうどのとき Alert は表示されず正常フローに進む（境界値）", async () => {
    const EXACTLY_200MB = 200 * 1024 * 1024;

    mockAlertSelectLibrary();
    mocks.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///video/exactly200.mp4", fileSize: EXACTLY_200MB, mimeType: "video/mp4" }],
    });
    mocks.uploadVideo.mockResolvedValueOnce({
      videoPath: "videos/rec1.mp4",
      thumbnailPath: "thumbs/rec1.jpg",
    });

    render(<VideoUploader {...BASE_PROPS} id="record1" />);

    await act(async () => {
      fireEvent.click(screen.getByText("動画を追加"));
    });

    // ファイルサイズ超過の Alert は呼ばれない（他の Alert は許容）
    const alertCalls = mocks.alertFn.mock.calls as Array<[string, string]>;
    const sizeAlerts = alertCalls.filter(([_title, msg]) =>
      typeof msg === "string" && msg.includes("200MB"),
    );
    expect(sizeAlerts).toHaveLength(0);
  });
});
