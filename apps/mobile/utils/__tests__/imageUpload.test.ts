// =============================================================================
// imageUpload.test.ts - 画像アップロードユーティリティのユニットテスト
// =============================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// expo-crypto をモック
vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "mocked-uuid-1234-5678-90ab-cdef12345678"),
}));

// base64ToArrayBuffer をモック
vi.mock("../base64", () => ({
  base64ToArrayBuffer: vi.fn(() => new ArrayBuffer(8)),
}));

import { generateUUID, uploadImage, uploadImages, deleteImage, deleteImages } from "../imageUpload";
import { randomUUID } from "expo-crypto";

// Supabaseクライアントのモック作成ヘルパー
function createMockSupabaseClient(options?: {
  uploadError?: Error | null;
  removeError?: Error | null;
  publicUrl?: string;
}) {
  const {
    uploadError = null,
    removeError = null,
    publicUrl = "https://example.com/storage/test.jpg",
  } = options ?? {};

  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: uploadError }),
        remove: vi.fn().mockResolvedValue({ error: removeError }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
      })),
    },
  } as unknown as Parameters<typeof uploadImage>[0]["supabase"];
}

describe("generateUUID", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expo-cryptoのrandomUUIDを呼び出す", () => {
    const result = generateUUID();
    expect(randomUUID).toHaveBeenCalled();
    expect(result).toBe("mocked-uuid-1234-5678-90ab-cdef12345678");
  });

  it("UUID形式の文字列を返す", () => {
    // モックをリセットして実際の形式をテスト
    const mockUUID = "a1b2c3d4-e5f6-4789-abcd-ef0123456789";
    vi.mocked(randomUUID).mockReturnValueOnce(mockUUID);

    const result = generateUUID();
    // UUID形式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result).toMatch(uuidRegex);
  });
});

describe("uploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("画像を正常にアップロードできる", async () => {
    const mockSupabase = createMockSupabaseClient({
      publicUrl: "https://storage.example.com/user1/record1/mocked-uuid.jpg",
    });

    const result = await uploadImage({
      supabase: mockSupabase,
      userId: "user1",
      recordId: "record1",
      base64: "base64encodeddata",
      fileExtension: "jpg",
      bucket: "practice-images",
    });

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("practice-images");
    expect(result.path).toBe("user1/record1/mocked-uuid-1234-5678-90ab-cdef12345678.jpg");
    expect(result.publicUrl).toBe("https://storage.example.com/user1/record1/mocked-uuid.jpg");
  });

  it("アップロードエラー時に例外をスローする", async () => {
    const mockSupabase = createMockSupabaseClient({
      uploadError: { message: "Upload failed" } as Error,
    });

    await expect(
      uploadImage({
        supabase: mockSupabase,
        userId: "user1",
        recordId: "record1",
        base64: "base64encodeddata",
        fileExtension: "jpg",
        bucket: "practice-images",
      }),
    ).rejects.toThrow("画像のアップロードに失敗しました: Upload failed");
  });

  it("異なるバケットを正しく使用する", async () => {
    const mockSupabase = createMockSupabaseClient();

    await uploadImage({
      supabase: mockSupabase,
      userId: "user1",
      recordId: "record1",
      base64: "base64encodeddata",
      fileExtension: "png",
      bucket: "competition-images",
    });

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("competition-images");
  });

  it("各ファイル拡張子に正しいcontent-typeを設定する", async () => {
    const testCases: Array<{ ext: string; expectedType: string }> = [
      { ext: "jpg", expectedType: "image/jpeg" },
      { ext: "jpeg", expectedType: "image/jpeg" },
      { ext: "png", expectedType: "image/png" },
      { ext: "gif", expectedType: "image/gif" },
      { ext: "webp", expectedType: "image/webp" },
      { ext: "unknown", expectedType: "image/jpeg" }, // default
    ];

    for (const { ext, expectedType } of testCases) {
      const uploadMock = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        storage: {
          from: vi.fn(() => ({
            upload: uploadMock,
            getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/test.jpg" } })),
          })),
        },
      } as unknown as Parameters<typeof uploadImage>[0]["supabase"];

      await uploadImage({
        supabase: mockSupabase,
        userId: "user1",
        recordId: "record1",
        base64: "data",
        fileExtension: ext,
        bucket: "practice-images",
      });

      expect(uploadMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(ArrayBuffer),
        expect.objectContaining({ contentType: expectedType }),
      );
    }
  });
});

describe("uploadImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("複数の画像を正常にアップロードできる", async () => {
    const mockSupabase = createMockSupabaseClient();
    const images = [
      { base64: "data1", fileExtension: "jpg" },
      { base64: "data2", fileExtension: "png" },
    ];

    const results = await uploadImages(mockSupabase, "user1", "record1", images, "practice-images");

    expect(results).toHaveLength(2);
    expect(results[0].path).toContain("user1/record1/");
    expect(results[1].path).toContain("user1/record1/");
  });

  it("空の配列を渡すと空の配列を返す", async () => {
    const mockSupabase = createMockSupabaseClient();
    const results = await uploadImages(mockSupabase, "user1", "record1", [], "practice-images");
    expect(results).toEqual([]);
  });

  it("エラー発生時に成功済み画像をロールバックする", async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null });
    let uploadCount = 0;
    const uploadMock = vi.fn().mockImplementation(() => {
      uploadCount++;
      if (uploadCount >= 2) {
        return Promise.resolve({ error: { message: "Second upload failed" } });
      }
      return Promise.resolve({ error: null });
    });

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
          remove: removeMock,
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://example.com/test.jpg" } })),
        })),
      },
    } as unknown as Parameters<typeof uploadImage>[0]["supabase"];

    const images = [
      { base64: "data1", fileExtension: "jpg" },
      { base64: "data2", fileExtension: "png" },
      { base64: "data3", fileExtension: "gif" },
    ];

    await expect(
      uploadImages(mockSupabase, "user1", "record1", images, "practice-images"),
    ).rejects.toThrow();

    // ロールバック検証: 成功した1件分だけ削除が呼ばれること
    expect(removeMock).toHaveBeenCalledTimes(1);
    // 1件目の成功パス（uuid はモックにより固定値）のみロールバックされること
    expect(removeMock).toHaveBeenCalledWith([
      "user1/record1/mocked-uuid-1234-5678-90ab-cdef12345678.jpg",
    ]);
  });
});

describe("deleteImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("画像を正常に削除できる", async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImage>[0];

    await deleteImage(mockSupabase, "user1/record1/image.jpg", "practice-images");

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("practice-images");
    expect(removeMock).toHaveBeenCalledWith(["user1/record1/image.jpg"]);
  });

  it("削除エラー時に例外をスローする", async () => {
    const mockSupabase = createMockSupabaseClient({
      removeError: { message: "Delete failed" } as Error,
    });

    await expect(
      deleteImage(mockSupabase, "user1/record1/image.jpg", "practice-images"),
    ).rejects.toThrow("画像の削除に失敗しました: Delete failed");
  });
});

describe("deleteImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("複数の画像を正常に削除できる", async () => {
    const removeMock = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImages>[0];

    const paths = ["user1/record1/image1.jpg", "user1/record1/image2.jpg"];
    await deleteImages(mockSupabase, paths, "competition-images");

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("competition-images");
    expect(removeMock).toHaveBeenCalledWith(paths);
  });

  it("空の配列を渡すと何もしない", async () => {
    const removeMock = vi.fn();
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          remove: removeMock,
        })),
      },
    } as unknown as Parameters<typeof deleteImages>[0];

    await deleteImages(mockSupabase, [], "practice-images");

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("削除エラー時に例外をスローする", async () => {
    const mockSupabase = createMockSupabaseClient({
      removeError: { message: "Batch delete failed" } as Error,
    });

    await expect(
      deleteImages(mockSupabase, ["path1.jpg", "path2.jpg"], "practice-images"),
    ).rejects.toThrow("画像の削除に失敗しました: Batch delete failed");
  });
});

// =============================================================================
// Issue #36 (mobile): getSignedImageUrl / resolveGalleryImages テスト
//
// private バケット化に伴い、公開URL生成 (getImagePublicUrl/getExistingImagesFromPaths/
// getImageUrlFromPath) は削除され、Web API (/api/storage/images/presigned-url) 経由で
// 署名付きURLを取得する getSignedImageUrl / resolveGalleryImages に置き換わった。
//
// テスト観点:
//   - 相対パスの場合、bucket/path を付けて presigned-url API を GET し、
//     Authorization: Bearer <accessToken> ヘッダを付与する
//   - path が http(s):// で始まる場合はそのまま返す（fetch を呼ばない後方互換）
//   - path が null/undefined の場合は null を返す（fetch を呼ばない）
//   - API が non-ok（401/403等）を返した場合は null を返す
//   - fetch 自体が例外を投げた場合も null を返す（catch される）
//   - resolveGalleryImages は複数パスを並列で解決し、失敗した要素は除外する
// =============================================================================

import { getSignedImageUrl, resolveGalleryImages } from "../imageUpload";

vi.mock("@/lib/env", () => ({
  env: {
    webApiUrl: "https://swim-hub.app",
  },
}));

const ACCESS_TOKEN = "test-access-token";

describe("getSignedImageUrl", () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("path が null の場合は null を返し、fetch を呼ばない", async () => {
    const result = await getSignedImageUrl("practice-images", null, ACCESS_TOKEN);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("path が undefined の場合は null を返し、fetch を呼ばない", async () => {
    const result = await getSignedImageUrl("practice-images", undefined, ACCESS_TOKEN);
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("path が http:// で始まる場合はそのまま返す（後方互換、fetch を呼ばない）", async () => {
    const legacyUrl = "http://127.0.0.1:54321/storage/v1/object/public/profile-images/user1/photo.jpg";
    const result = await getSignedImageUrl("profile-images", legacyUrl, ACCESS_TOKEN);
    expect(result).toBe(legacyUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("path が https:// で始まる場合はそのまま返す（後方互換、fetch を呼ばない）", async () => {
    const legacyUrl = "https://xxx.supabase.co/storage/v1/object/public/profile-images/user1/photo.jpg";
    const result = await getSignedImageUrl("profile-images", legacyUrl, ACCESS_TOKEN);
    expect(result).toBe(legacyUrl);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("相対パスの場合、presigned-url API を bucket/path 付きで GET し、署名付きURLを返す", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://signed.example.com/photo.jpg", expiresAt: 123456 }),
    });

    const result = await getSignedImageUrl("practice-images", "user1/practice1/photo.jpg", ACCESS_TOKEN);

    expect(result).toBe("https://signed.example.com/photo.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://swim-hub.app/api/storage/images/presigned-url?bucket=practice-images&path=user1%2Fpractice1%2Fphoto.jpg",
    );
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
  });

  it("API が 401 を返した場合は null を返す", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await getSignedImageUrl("profile-images", "user1/photo.jpg", "expired-token");
    expect(result).toBeNull();
  });

  it("API が 403 を返した場合は null を返す", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    const result = await getSignedImageUrl("competition-images", "other-user/comp1/photo.jpg", ACCESS_TOKEN);
    expect(result).toBeNull();
  });

  it("fetch が例外を投げた場合は null を返す（クラッシュしない）", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    const result = await getSignedImageUrl("practice-images", "user1/practice1/photo.jpg", ACCESS_TOKEN);
    expect(result).toBeNull();
  });
});

describe("resolveGalleryImages", () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("paths が null の場合は空の配列を返し、fetch を呼ばない", async () => {
    const result = await resolveGalleryImages("practice-images", null, ACCESS_TOKEN);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paths が undefined の場合は空の配列を返す", async () => {
    const result = await resolveGalleryImages("practice-images", undefined, ACCESS_TOKEN);
    expect(result).toEqual([]);
  });

  it("paths が空配列の場合は空の配列を返す", async () => {
    const result = await resolveGalleryImages("practice-images", [], ACCESS_TOKEN);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("複数パスを並列で解決し、id=path・url=署名付きURLの配列を返す", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://signed.example.com/1.jpg" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://signed.example.com/2.jpg" }) });

    const paths = ["user1/practice1/1.jpg", "user1/practice1/2.jpg"];
    const result = await resolveGalleryImages("practice-images", paths, ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { id: "user1/practice1/1.jpg", url: "https://signed.example.com/1.jpg" },
      { id: "user1/practice1/2.jpg", url: "https://signed.example.com/2.jpg" },
    ]);
  });

  it("一部のパスの解決に失敗した場合、その要素だけ結果から除外する", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://signed.example.com/1.jpg" }) })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://signed.example.com/3.jpg" }) });

    const paths = ["user1/1.jpg", "other-user/2.jpg", "user1/3.jpg"];
    const result = await resolveGalleryImages("competition-images", paths, ACCESS_TOKEN);

    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { id: "user1/1.jpg", url: "https://signed.example.com/1.jpg" },
      { id: "user1/3.jpg", url: "https://signed.example.com/3.jpg" },
    ]);
  });

  it("http(s) の旧データパスが混在していても正しく解決する（fetch を呼ばず、そのまま返す）", async () => {
    const legacyUrl = "https://xxx.supabase.co/storage/v1/object/public/practice-images/user1/legacy.jpg";
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ url: "https://signed.example.com/new.jpg" }) });

    const paths = [legacyUrl, "user1/new.jpg"];
    const result = await resolveGalleryImages("practice-images", paths, ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1); // legacy はfetchされない
    expect(result).toEqual([
      { id: legacyUrl, url: legacyUrl },
      { id: "user1/new.jpg", url: "https://signed.example.com/new.jpg" },
    ]);
  });
});
