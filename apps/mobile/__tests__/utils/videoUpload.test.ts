/**
 * videoUpload ユーティリティ テスト
 *
 * Sprint Contract: モバイル画像・動画アップロード修正
 * 対象バグ: #3 大会動画サイレント失敗 / #4,5 動画選択直後「予期しないエラー」
 *
 * 検証観点:
 * [VU-01] generateThumbnail — 通常 URI (file://) を渡すと expo-video-thumbnails が呼ばれ uri を返す
 * [VU-02] generateThumbnail — iOS ph:// URI を渡すと expo-video-thumbnails が例外をスローする（問題の顕在化）
 * [VU-03] generateThumbnail 失敗時フォールバック — uploadVideo は継続する
 * [VU-04] requestUploadUrl — 正常系
 * [VU-05] requestUploadUrl — contentType 伝達
 * [VU-06] requestUploadUrl — 認証エラー
 * [VU-07] uploadVideoToR2 — PUT アップロード
 * [VU-08] uploadVideoToR2 — PUT 失敗
 * [VU-09] uploadVideo — 全フロー正常系
 * [VU-10] uploadVideo — サムネイル失敗時フォールバック
 * [VU-11] uploadVideo — contentType を mimeType から決定
 * [VU-12] confirmUpload — DB 更新 API が 500 を返したとき Error をスローする
 */

import { describe, it, vi, beforeEach, expect } from "vitest";

// vi.hoisted でモック関数を先に定義（hoisting 問題を回避）
const mockGetThumbnailAsync = vi.hoisted(() => vi.fn());

vi.mock("expo-video-thumbnails", () => ({
  getThumbnailAsync: mockGetThumbnailAsync,
}));

// env モック (WEB_API_URL の解決用)
vi.mock("@/lib/env", () => ({
  env: {
    webApiUrl: "https://api.swimhub.example.com",
    r2PublicUrl: null,
  },
}));

// グローバル fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  generateThumbnail,
  requestUploadUrl,
  uploadVideoToR2,
  uploadVideo,
  confirmUpload,
} from "@/utils/videoUpload";

const MOCK_UPLOAD_URL_RESPONSE = {
  videoUploadUrl: "https://r2.example.com/video-presigned",
  thumbnailUploadUrl: "https://r2.example.com/thumb-presigned",
  videoPath: "videos/user1/records/record1.mp4",
  thumbnailPath: "thumbnails/user1/records/record1.jpg",
};

// uploadVideo 統合テスト用の簡易 fetch ルーター
// URL/method を見てレスポンスを返す実装に切り替え
function setupUploadVideoMocks({
  thumbnailSuccess = true,
}: { thumbnailSuccess?: boolean } = {}) {
  if (thumbnailSuccess) {
    mockGetThumbnailAsync.mockResolvedValue({
      uri: "file:///tmp/thumb.jpg",
      width: 1280,
      height: 720,
    });
  } else {
    mockGetThumbnailAsync.mockRejectedValue(new Error("Thumbnail failed"));
  }

  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";

    // requestUploadUrl: POST to /api/storage/videos/upload-url
    if (typeof url === "string" && url.includes("/api/storage/videos/upload-url")) {
      return Promise.resolve({
        ok: true,
        json: async () => MOCK_UPLOAD_URL_RESPONSE,
      });
    }

    // confirmUpload: POST to /api/storage/videos/confirm
    if (typeof url === "string" && url.includes("/api/storage/videos/confirm")) {
      return Promise.resolve({ ok: true });
    }

    // uploadVideoToR2 / uploadThumbnailToR2: PUT to presigned URL
    if (method === "PUT") {
      return Promise.resolve({ ok: true });
    }

    // fetch(fileUri) or fetch(thumbnailUri) → blob()
    return Promise.resolve({
      ok: true,
      blob: async () => new Blob(["binary-data"]),
    });
  });
}

// --------------------------------------------------------------------------
// テスト本体
// --------------------------------------------------------------------------

describe("[VU-01] generateThumbnail — 通常 URI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("file:// URI を渡すと getThumbnailAsync が呼ばれ { uri, width, height } を返す", async () => {
    const expected = { uri: "file:///tmp/thumb.jpg", width: 1280, height: 720 };
    mockGetThumbnailAsync.mockResolvedValueOnce(expected);

    const result = await generateThumbnail("file:///video/test.mp4");

    expect(mockGetThumbnailAsync).toHaveBeenCalledWith("file:///video/test.mp4", { time: 0 });
    expect(result).toEqual(expected);
  });
});

describe("[VU-02] generateThumbnail — iOS ph:// URI (問題の顕在化)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ph:// URI を渡すと getThumbnailAsync が例外をスローする（現行実装の問題記録）", async () => {
    mockGetThumbnailAsync.mockRejectedValueOnce(
      new Error("Cannot read ph:// URI in video thumbnail"),
    );

    await expect(generateThumbnail("ph://ABCD1234/Video/12345")).rejects.toThrow();
  });
});

describe("[VU-04] requestUploadUrl — 正常系", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("type='practice-log', id, contentType='video/mp4', accessToken を渡すと POST され UploadUrlResponse が返る", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_UPLOAD_URL_RESPONSE,
    });

    const result = await requestUploadUrl("practice-log", "log-1", "video/mp4", "test-token");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.swimhub.example.com/api/storage/videos/upload-url",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ type: "practice-log", id: "log-1", contentType: "video/mp4" }),
      }),
    );
    expect(result).toEqual(MOCK_UPLOAD_URL_RESPONSE);
  });

  it("type='record' で呼ぶと body.type が 'record' になる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_UPLOAD_URL_RESPONSE,
    });

    await requestUploadUrl("record", "rec-1", "video/mp4", "test-token");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as { type: string };
    expect(body.type).toBe("record");
  });
});

describe("[VU-05] requestUploadUrl — contentType 伝達", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("contentType='video/quicktime' を渡すと body.contentType が 'video/quicktime' になる（iOS MOV 対応）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_UPLOAD_URL_RESPONSE,
    });

    await requestUploadUrl("record", "rec-1", "video/quicktime", "test-token");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      contentType: string;
    };
    expect(body.contentType).toBe("video/quicktime");
  });

  it("contentType='video/mp4' を渡すと body.contentType が 'video/mp4' になる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => MOCK_UPLOAD_URL_RESPONSE,
    });

    await requestUploadUrl("record", "rec-1", "video/mp4", "test-token");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      contentType: string;
    };
    expect(body.contentType).toBe("video/mp4");
  });
});

describe("[VU-06] requestUploadUrl — 認証エラー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("API が 401 を返すと Error をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    await expect(
      requestUploadUrl("record", "rec-1", "video/mp4", "bad-token"),
    ).rejects.toThrow("Unauthorized");
  });

  it("API が 500 を返すと Error をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    });

    await expect(
      requestUploadUrl("record", "rec-1", "video/mp4", "test-token"),
    ).rejects.toThrow();
  });
});

describe("[VU-07] uploadVideoToR2 — PUT アップロード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fileUri から fetch で blob を取得し、presignedUrl へ Content-Type 付きで PUT する", async () => {
    const mockBlob = new Blob(["video-binary-data"]);
    // 1回目: fileUri から blob 取得
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockBlob,
    });
    // 2回目: presignedUrl へ PUT
    mockFetch.mockResolvedValueOnce({ ok: true });

    await uploadVideoToR2(
      "https://r2.example.com/presigned",
      "file:///video/test.mp4",
      "video/mp4",
    );

    // 最初の fetch は fileUri
    expect(mockFetch).toHaveBeenNthCalledWith(1, "file:///video/test.mp4");
    // 2回目の fetch は PUT
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://r2.example.com/presigned",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: mockBlob,
      }),
    );
  });

  it("PUT 成功後に onProgress(90) が呼ばれる", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob() })
      .mockResolvedValueOnce({ ok: true });

    const onProgress = vi.fn();
    await uploadVideoToR2(
      "https://r2.example.com/presigned",
      "file:///video/test.mp4",
      "video/mp4",
      onProgress,
    );

    expect(onProgress).toHaveBeenCalledWith(90);
  });
});

describe("[VU-08] uploadVideoToR2 — PUT 失敗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PUT が 403 を返すと '動画アップロード失敗: HTTP 403' を含む Error をスローする", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob() })
      .mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(
      uploadVideoToR2("https://r2.example.com/presigned", "file:///video/test.mp4", "video/mp4"),
    ).rejects.toThrow("動画アップロード失敗: HTTP 403");
  });
});

describe("[VU-09] uploadVideo — 全フロー正常系", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("完了後に { videoPath, thumbnailPath } を返す", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: true });

    const result = await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
    });

    expect(result).toEqual({
      videoPath: MOCK_UPLOAD_URL_RESPONSE.videoPath,
      thumbnailPath: MOCK_UPLOAD_URL_RESPONSE.thumbnailPath,
    });
  });

  it("onProgress コールバックが複数回呼ばれ 5, 15, 100 を含む", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: true });

    const progressValues: number[] = [];
    await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
      onProgress: (p) => progressValues.push(p),
    });

    expect(progressValues).toContain(5);
    expect(progressValues).toContain(15);
    expect(progressValues).toContain(100);
    // 単調増加
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });
});

describe("[VU-10] uploadVideo — サムネイル生成失敗時のフォールバック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateThumbnail が失敗した場合もアップロードが継続され videoPath を返す", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: false });

    const result = await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
    });

    expect(result.videoPath).toBe(MOCK_UPLOAD_URL_RESPONSE.videoPath);
  });

  it("generateThumbnail が失敗した場合は uploadThumbnailToR2 の PUT は呼ばれない（fetch で PUT は 1 回のみ）", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: false });

    await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
    });

    // サムネイルなしなら PUT は 1 回のみ (動画のみ)
    const putCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([, opts]) => opts?.method === "PUT",
    );
    expect(putCalls).toHaveLength(1);
  });
});

describe("[VU-11] uploadVideo — contentType を mimeType から決定", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mimeType が 'video/quicktime' のとき requestUploadUrl へ contentType='video/quicktime' が渡る", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: true });

    await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mov",
      accessToken: "valid-token",
      mimeType: "video/quicktime",
    });

    // requestUploadUrl の POST body を検索
    const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([url, opts]) =>
        typeof url === "string" &&
        url.includes("upload-url") &&
        opts?.method === "POST",
    );
    expect(postCalls).toHaveLength(1);
    const body = JSON.parse(postCalls[0][1]?.body as string) as { contentType: string };
    expect(body.contentType).toBe("video/quicktime");
  });

  it("mimeType が 'video/mp4' のとき requestUploadUrl へ contentType='video/mp4' が渡る", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: true });

    await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
      mimeType: "video/mp4",
    });

    const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([url, opts]) =>
        typeof url === "string" &&
        url.includes("upload-url") &&
        opts?.method === "POST",
    );
    const body = JSON.parse(postCalls[0][1]?.body as string) as { contentType: string };
    expect(body.contentType).toBe("video/mp4");
  });

  it("mimeType が undefined のとき contentType='video/mp4' がデフォルト値として渡る", async () => {
    setupUploadVideoMocks({ thumbnailSuccess: true });

    await uploadVideo({
      type: "record",
      id: "rec-1",
      videoUri: "file:///video/test.mp4",
      accessToken: "valid-token",
      // mimeType を省略
    });

    const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([url, opts]) =>
        typeof url === "string" &&
        url.includes("upload-url") &&
        opts?.method === "POST",
    );
    const body = JSON.parse(postCalls[0][1]?.body as string) as { contentType: string };
    expect(body.contentType).toBe("video/mp4");
  });
});

describe("[VU-12] confirmUpload — DB 更新失敗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("API が 500 を返すと 'DB更新に失敗しました' を含む Error をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(
      confirmUpload("record", "rec-1", "videos/path.mp4", "thumbs/path.jpg", "valid-token"),
    ).rejects.toThrow("DB更新に失敗しました");
  });

  it("API が 500 でエラーフィールドがある場合、そのメッセージを含む Error をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "レコードが見つかりません" }),
    });

    await expect(
      confirmUpload("record", "rec-1", "videos/path.mp4", "thumbs/path.jpg", "valid-token"),
    ).rejects.toThrow("レコードが見つかりません");
  });
});
