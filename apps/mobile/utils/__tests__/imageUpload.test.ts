// =============================================================================
// imageUpload.test.ts - 画像アップロードユーティリティのユニットテスト
// =============================================================================

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// expo-crypto をモック
vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "mocked-uuid-1234-5678-90ab-cdef12345678"),
}));

import { generateUUID, deleteImage, deleteImages } from "../imageUpload";
import { randomUUID } from "expo-crypto";

// Supabaseクライアントのモック作成ヘルパー
function createMockSupabaseClient(options?: {
  removeError?: Error | null;
}) {
  const { removeError = null } = options ?? {};

  return {
    storage: {
      from: vi.fn(() => ({
        remove: vi.fn().mockResolvedValue({ error: removeError }),
      })),
    },
  } as unknown as Parameters<typeof deleteImage>[0];
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

// =============================================================================
// Bug1 (Android): プロフィール画像アップロード失敗の修正 — Sprint Contract D1-b
//
// uploadProfileImageViaApi / deleteProfileImageViaApi (新規実装予定) のテストスケルトン。
// 既存の uploadImageViaApi / deleteImageViaApi (practice-images / competition-images 用) と
// 同型だが、profile-images は以下の点で異なるため、そのまま流用はできない:
//   - POST に practiceId/competitionId のような id パラメータが不要
//     (user.id はサーバー側で認証トークンから解決される)
//   - DELETE は特定の path を指定せず、そのユーザーの profile-images フォルダを丸ごと削除する
//     (クエリパラメータなし。他バケットの deleteImageViaApi(path, bucket, accessToken) とは
//     シグネチャが異なる)
//
// 前提 (QA が Sprint Contract Phase A で検証済み):
//   apps/web/app/api/storage/profile/route.ts は現状 getServerUser() / createAuthenticatedServerClient()
//   (Cookie 専用認証、@supabase/ssr + next/headers cookies()) のみを使用しており、mobile からの
//   Authorization: Bearer トークンのみのリクエスト (Cookie なし) を受け付けない (401 になる)。
//   images/practice, images/competition の route.ts は authenticateApiRequest()
//   (Cookie 認証 → 失敗時 Bearer トークンにフォールバック) を使用しており、mobile から現に
//   正常に呼べている。
//   → D1-b の実装には apps/web/app/api/storage/profile/route.ts を authenticateApiRequest() に
//     変更する web 側の修正が対になって必要 (Sprint Contract 参照。Web Developer 側の作業)。
//     この web 側修正自体の可否検証は本テストファイルの範囲外
//     (mobile 側の fetch モックでは web 側の実際の認証可否は検証できないため、
//     Web 側 CI / 実機・dev server 経由の疎通確認で別途確認すること)。
//
// 関数名・シグネチャは Developer の裁量に委ねるが、以下を推奨する:
//   uploadProfileImageViaApi(file: { base64: string; fileExtension: string }, accessToken: string): Promise<{ path: string }>
//   deleteProfileImageViaApi(accessToken: string): Promise<void>
//
// トートロジー防止メモ:
//   - 期待するエンドポイント・ヘッダー・ペイロード形状は Sprint Contract
//     (apps/web/app/api/storage/profile/route.ts の実装と、既存 uploadImageViaApi の慣習) から
//     QA が独立に定義したものであり、Developer の diff を見て書いたものではない。
// =============================================================================

import { uploadProfileImageViaApi, deleteProfileImageViaApi } from "../imageUpload";

describe("uploadProfileImageViaApi", () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it(
    "[V-P-01] POST {webApiUrl}/api/storage/profile を Authorization: Bearer <accessToken> ヘッダー付きで呼ぶ",
    async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ path: "user1/new.jpg" }),
      });

      await uploadProfileImageViaApi({ base64: "abc123", fileExtension: "jpg" }, ACCESS_TOKEN);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://swim-hub.app/api/storage/profile");
      expect(options.method).toBe("POST");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      );
    },
  );

  it(
    "[V-P-02] FormData の 'file' フィールドに base64 から組み立てた data URI " +
      "(fileExtension から導出した MIME タイプ) を付与する",
    async () => {
      // jsdom の FormData はスペック準拠で Blob 以外を append すると文字列化するため、
      // get() での読み戻しではなく append() 自体への呼び出し引数を spy で検証する
      const appendSpy = vi.spyOn(FormData.prototype, "append");
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ path: "user1/new.png" }) });

      await uploadProfileImageViaApi({ base64: "pngdata", fileExtension: "png" }, ACCESS_TOKEN);

      expect(appendSpy).toHaveBeenCalledWith(
        "file",
        expect.objectContaining({
          uri: "data:image/png;base64,pngdata",
          type: "image/png",
          name: "image.png",
        }),
      );
      appendSpy.mockRestore();
    },
  );

  it(
    "[V-P-03] practiceId/competitionId に相当する id パラメータを送らない " +
      "(profile は user.id をサーバー側で解決するため、FormData に file 以外のフィールドが無い)",
    async () => {
      const appendSpy = vi.spyOn(FormData.prototype, "append");
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ path: "user1/new.jpg" }) });

      await uploadProfileImageViaApi({ base64: "abc", fileExtension: "jpg" }, ACCESS_TOKEN);

      expect(appendSpy).toHaveBeenCalledTimes(1); // "file" 以外のフィールドを append していない
      appendSpy.mockRestore();
    },
  );

  it("[V-P-04] レスポンスが ok のとき { path } をそのまま返す", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: "user1/avatar-123.jpg" }),
    });

    const result = await uploadProfileImageViaApi(
      { base64: "abc", fileExtension: "jpg" },
      ACCESS_TOKEN,
    );

    expect(result).toEqual({ path: "user1/avatar-123.jpg" });
  });

  it(
    "[V-P-05] レスポンスが non-ok のとき、レスポンス body の message/error を含むエラーを throw する",
    async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "ファイルサイズは5MB以下にしてください" }),
      });

      await expect(
        uploadProfileImageViaApi({ base64: "abc", fileExtension: "jpg" }, ACCESS_TOKEN),
      ).rejects.toThrow("ファイルサイズは5MB以下にしてください");
    },
  );

  it(
    "[V-P-06] レスポンスが non-ok かつ JSON パース自体も失敗する場合、" +
      "デフォルトのエラーメッセージで throw する (クラッシュしない)",
    async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => {
          throw new Error("invalid json");
        },
      });

      await expect(
        uploadProfileImageViaApi({ base64: "abc", fileExtension: "jpg" }, ACCESS_TOKEN),
      ).rejects.toThrow("画像のアップロードに失敗しました");
    },
  );
});

describe("deleteProfileImageViaApi", () => {
  const originalFetch = global.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it(
    "[V-P-07] DELETE {webApiUrl}/api/storage/profile を Authorization: Bearer <accessToken> ヘッダー付きで呼ぶ",
    async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      await deleteProfileImageViaApi(ACCESS_TOKEN);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://swim-hub.app/api/storage/profile");
      expect(options.method).toBe("DELETE");
      expect((options.headers as Record<string, string>)["Authorization"]).toBe(
        `Bearer ${ACCESS_TOKEN}`,
      );
    },
  );

  it(
    "[V-P-08] path クエリパラメータを付与しない " +
      "(プロフィール画像はユーザーフォルダ丸ごと削除のため、他バケットの deleteImageViaApi(path, ...) とは" +
      "シグネチャが異なる)",
    async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      await deleteProfileImageViaApi(ACCESS_TOKEN);

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).not.toContain("?");
      expect(url).not.toContain("path=");
    },
  );

  it("[V-P-09] レスポンスが ok のとき正常終了する (戻り値なし)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await expect(deleteProfileImageViaApi(ACCESS_TOKEN)).resolves.toBeUndefined();
  });

  it("[V-P-10] レスポンスが non-ok のとき、レスポンス body の error を含むエラーを throw する", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "認証が必要です" }),
    });

    await expect(deleteProfileImageViaApi(ACCESS_TOKEN)).rejects.toThrow("認証が必要です");
  });

  it(
    "[V-P-11] 削除対象のファイルが元々存在しない場合でも成功として扱われる " +
      "(route.ts の files.length===0 分岐に対応。呼び出し側からは 200 { success: true } として観測される)",
    async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

      await expect(deleteProfileImageViaApi(ACCESS_TOKEN)).resolves.not.toThrow();
    },
  );
});
