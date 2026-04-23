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

import {
  generateUUID,
  uploadImage,
  uploadImages,
  deleteImage,
  deleteImages,
  getImagePublicUrl,
  getExistingImagesFromPaths,
} from "../imageUpload";
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

describe("getImagePublicUrl", () => {
  it("画像のpublicUrlを正しく返す", () => {
    const expectedUrl = "https://storage.example.com/bucket/user1/image.jpg";
    const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: expectedUrl } }));
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: getPublicUrlMock,
        })),
      },
    } as unknown as Parameters<typeof getImagePublicUrl>[0];

    const result = getImagePublicUrl(mockSupabase, "user1/image.jpg", "practice-images");

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("practice-images");
    expect(getPublicUrlMock).toHaveBeenCalledWith("user1/image.jpg");
    expect(result).toBe(expectedUrl);
  });
});

describe("getExistingImagesFromPaths", () => {
  it("パス配列からid/url付きオブジェクト配列を返す", () => {
    const getPublicUrlMock = vi.fn((path: string) => ({
      data: { publicUrl: `https://storage.example.com/${path}` },
    }));
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: getPublicUrlMock,
        })),
      },
    } as unknown as Parameters<typeof getExistingImagesFromPaths>[0];

    const paths = ["user1/image1.jpg", "user1/image2.png"];
    const result = getExistingImagesFromPaths(mockSupabase, paths, "practice-images");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "user1/image1.jpg",
      url: "https://storage.example.com/user1/image1.jpg",
    });
    expect(result[1]).toEqual({
      id: "user1/image2.png",
      url: "https://storage.example.com/user1/image2.png",
    });
  });

  it("nullを渡すと空の配列を返す", () => {
    const mockSupabase = createMockSupabaseClient();
    const result = getExistingImagesFromPaths(mockSupabase, null, "practice-images");
    expect(result).toEqual([]);
  });

  it("undefinedを渡すと空の配列を返す", () => {
    const mockSupabase = createMockSupabaseClient();
    const result = getExistingImagesFromPaths(mockSupabase, undefined, "practice-images");
    expect(result).toEqual([]);
  });

  it("空の配列を渡すと空の配列を返す", () => {
    const mockSupabase = createMockSupabaseClient();
    const result = getExistingImagesFromPaths(mockSupabase, [], "practice-images");
    expect(result).toEqual([]);
  });
});

// =============================================================================
// Bug 3(a) — getImageUrlFromPath テスト
//
// テスト観点:
//   - EXPO_PUBLIC_R2_PUBLIC_URL が設定されている場合、R2 の公開 URL を返す
//   - EXPO_PUBLIC_R2_PUBLIC_URL が未設定の場合、Supabase Storage の publicUrl を返す
//   - path が空文字のとき空文字を返す（空文字境界値）
//   - bucket 引数が "practice-images" / "competition-images" 両方で正しく動作する
//
// トートロジー防止メモ:
//   - 「R2 URL が設定されていれば R2 URL を返す」という仕様から期待値を導く
//   - env モジュールを vi.mock でモックし、テストごとに r2PublicUrl を制御する
// =============================================================================

// getImageUrlFromPath は env に依存するためここで動的にインポート
import { getImageUrlFromPath } from "../imageUpload";

// env モジュールのモック（テスト内で書き換えてR2の有無をシミュレート）
vi.mock("@/lib/env", () => ({
  env: {
    supabaseUrl: "https://test.supabase.co",
    supabaseAnonKey: "test-anon-key",
    googleWebClientId: "",
    webApiUrl: "https://swim-hub.app",
    r2PublicUrl: "", // デフォルトは空（R2 なし）
    revenuecatIosApiKey: "",
    environment: "test",
    webAppResetPasswordUrl: "https://swim-hub.app/reset-password",
  },
}));

function createMockSupabaseForUrl(publicUrl: string) {
  return {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn(() => ({ data: { publicUrl } })),
      })),
    },
  } as unknown as Parameters<typeof getImageUrlFromPath>[0];
}

describe("getImageUrlFromPath (Bug 3(a))", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // テスト間の状態漏れを防ぐため、afterEach でも r2PublicUrl を必ずリセットする
    const envModule = await import("@/lib/env");
    // @ts-expect-error テスト用にリセット
    envModule.env.r2PublicUrl = "";
  });

  describe("R2 URL が設定されている場合", () => {
    it("EXPO_PUBLIC_R2_PUBLIC_URL + bucket + path を結合した URL を返す", async () => {
      // env モジュールを動的に差し替えて r2PublicUrl を設定
      const envModule = await import("@/lib/env");
      // @ts-expect-error テスト用に r2PublicUrl を書き換え
      envModule.env.r2PublicUrl = "https://r2.example.com";

      const mockSupabase = createMockSupabaseForUrl("https://supabase.example.com/practice-images/user1/img.jpg");
      const result = getImageUrlFromPath(mockSupabase, "user1/img.jpg", "practice-images");

      // R2 URL が設定されている → R2 URL + bucket + path
      expect(result).toBe("https://r2.example.com/practice-images/user1/img.jpg");

      // 後片付け
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";
    });

    it("bucket 引数に関わらず R2 URL を優先して返す", async () => {
      const envModule = await import("@/lib/env");
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "https://r2.example.com";

      const mockSupabase = createMockSupabaseForUrl("https://supabase.example.com/competition-images/user1/img.jpg");
      const result = getImageUrlFromPath(mockSupabase, "user1/comp.jpg", "competition-images");

      expect(result).toBe("https://r2.example.com/competition-images/user1/comp.jpg");

      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";
    });
  });

  describe("R2 URL が未設定の場合（Supabase フォールバック）", () => {
    it("supabase.storage.from(bucket).getPublicUrl(path) の結果を返す", async () => {
      const envModule = await import("@/lib/env");
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";

      const supabaseUrl = "https://supabase.example.com/storage/v1/object/public/practice-images/user1/img.jpg";
      const mockSupabase = createMockSupabaseForUrl(supabaseUrl);

      const result = getImageUrlFromPath(mockSupabase, "user1/img.jpg", "practice-images");

      expect(result).toBe(supabaseUrl);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith("practice-images");
    });

    it("bucket='competition-images' でも正しく動作する", async () => {
      const envModule = await import("@/lib/env");
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";

      const supabaseUrl = "https://supabase.example.com/storage/v1/object/public/competition-images/user1/comp.jpg";
      const mockSupabase = createMockSupabaseForUrl(supabaseUrl);

      const result = getImageUrlFromPath(mockSupabase, "user1/comp.jpg", "competition-images");

      expect(result).toBe(supabaseUrl);
      expect(mockSupabase.storage.from).toHaveBeenCalledWith("competition-images");
    });
  });

  describe("境界値・異常系", () => {
    it("path が空文字のとき空文字を返す（クラッシュしない）", async () => {
      const envModule = await import("@/lib/env");
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";

      const mockSupabase = createMockSupabaseForUrl("https://supabase.example.com/");

      // path が空文字のとき実装は "" を返す
      const result = getImageUrlFromPath(mockSupabase, "", "practice-images");
      expect(result).toBe("");
    });

    it("path が空文字のとき R2 URL 設定時も空文字を返す", async () => {
      const envModule = await import("@/lib/env");
      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "https://r2.example.com";

      const mockSupabase = createMockSupabaseForUrl("https://supabase.example.com/");

      const result = getImageUrlFromPath(mockSupabase, "", "practice-images");
      // 実装: if (!path) return "" なので空文字を返す
      expect(result).toBe("");

      // @ts-expect-error -- env は const as const だが、テスト用に書き換える
      envModule.env.r2PublicUrl = "";
    });
  });
});
