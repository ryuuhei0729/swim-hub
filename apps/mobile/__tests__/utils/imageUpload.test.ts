/**
 * imageUpload ユーティリティ テスト
 *
 * Sprint Contract: モバイル画像・動画アップロード修正
 * 対象バグ: #1 大会画像「認証が必要です」/ #2 練習画像「認証が必要です」
 *
 * 検証観点:
 * [IM-01] uploadImageViaApi — 正常系: access_token が有効な場合に API へ正しい headers/body で POST する
 * [IM-02] uploadImageViaApi — 認証エラー: API が 401 を返した場合に Error をスローする
 * [IM-03] uploadImagesViaApi — 複数画像を順番にアップロードし、結果の配列を返す
 * [IM-04] uploadImagesViaApi — 途中失敗時に成功済み画像を DELETE でロールバックする
 * [IM-05] uploadImageViaApi — access_token が空文字の場合は Authorization ヘッダが "Bearer " になる（問題の顕在化）
 * [IM-06] getImageUrlFromPath — R2_PUBLIC_URL が設定されている場合は R2 URL を返す
 * [IM-07] getImageUrlFromPath — R2_PUBLIC_URL が未設定の場合は Supabase Storage の publicUrl を返す
 * [IM-08] uploadImagesViaApi — 401 レスポンス時に「認証が必要」エラーが throw される (既存仕様の確認)
 */

import { describe, it, vi, beforeEach, expect } from "vitest";

// env モック (webApiUrl の解決用)
vi.mock("@/lib/env", () => ({
  env: {
    webApiUrl: "https://api.swimhub.example.com",
    r2PublicUrl: "",
  },
}));

// グローバル fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { uploadImageViaApi, uploadImagesViaApi, getImageUrlFromPath } from "@/utils/imageUpload";
import type { ImageBucket } from "@/utils/imageUpload";
import type { SupabaseClient } from "@supabase/supabase-js";

// テスト用ファイルデータ
const MOCK_FILE = { base64: "dGVzdA==", fileExtension: "jpg" };
const MOCK_ACCESS_TOKEN = "valid-access-token-xyz";
const PRACTICE_BUCKET: ImageBucket = "practice-images";
const COMPETITION_BUCKET: ImageBucket = "competition-images";

// supabase クライアントのモック (getImageUrlFromPath 用)
const mockGetPublicUrl = vi.fn();
const mockSupabase = {
  storage: {
    from: vi.fn(() => ({
      getPublicUrl: mockGetPublicUrl,
    })),
  },
} as unknown as SupabaseClient;

describe("[IM-01] uploadImageViaApi — 正常系", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("有効な access_token と practice バケットを指定すると /api/storage/images/practice に POST され { path } が返る", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: "practice-images/user1/practice1/00000000.jpg" }),
    });

    const result = await uploadImageViaApi(MOCK_FILE, "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.swimhub.example.com/api/storage/images/practice",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({ path: "practice-images/user1/practice1/00000000.jpg" });
  });

  it("有効な access_token と competition バケットを指定すると /api/storage/images/competition に POST される", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: "competition-images/user1/comp1/00000000.jpg" }),
    });

    await uploadImageViaApi(MOCK_FILE, "comp-1", COMPETITION_BUCKET, MOCK_ACCESS_TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.swimhub.example.com/api/storage/images/competition",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("Authorization ヘッダに 'Bearer {access_token}' が含まれる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ path: "some/path.jpg" }),
    });

    await uploadImageViaApi(MOCK_FILE, "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN);

    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
  });
});

describe("[IM-02] uploadImageViaApi — 認証エラー (401)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetch が 401 を返したとき Error をスローし、エラーメッセージに API レスポンスの error フィールドが含まれる", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "認証が必要です" }),
    });

    await expect(
      uploadImageViaApi(MOCK_FILE, "practice-1", PRACTICE_BUCKET, "expired-token"),
    ).rejects.toThrow("認証が必要です");
  });

  it("fetch が 401 を返し、レスポンスボディが不正 JSON のとき '画像のアップロードに失敗しました' をスローする", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(
      uploadImageViaApi(MOCK_FILE, "practice-1", PRACTICE_BUCKET, "expired-token"),
    ).rejects.toThrow("画像のアップロードに失敗しました");
  });
});

describe("[IM-03] uploadImagesViaApi — 複数画像", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("3 枚の画像を渡すと fetch が 3 回呼ばれ、3 件の { path } 配列が返る", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: "path/img1.jpg" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: "path/img2.jpg" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: "path/img3.jpg" }) });

    const files = [MOCK_FILE, MOCK_FILE, MOCK_FILE];
    const result = await uploadImagesViaApi(files, "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { path: "path/img1.jpg" },
      { path: "path/img2.jpg" },
      { path: "path/img3.jpg" },
    ]);
  });

  it("空配列を渡すと fetch は呼ばれず空配列が返る", async () => {
    const result = await uploadImagesViaApi([], "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe("[IM-04] uploadImagesViaApi — ロールバック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("2 枚目のアップロードが失敗したとき、1 枚目の path に対して DELETE リクエストが発行される", async () => {
    // 1枚目: 成功
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: "path/img1.jpg" }) })
      // 2枚目: 失敗
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Server error" }),
      })
      // ロールバック DELETE: 成功
      .mockResolvedValueOnce({ ok: true });

    const files = [MOCK_FILE, MOCK_FILE];

    await expect(
      uploadImagesViaApi(files, "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN),
    ).rejects.toThrow();

    // DELETE リクエストが発行されていること
    const deleteCalls = (mockFetch.mock.calls as Array<[string, RequestInit?]>).filter(
      ([, opts]) => opts?.method === "DELETE",
    );
    expect(deleteCalls).toHaveLength(1);
    // 1枚目の path がロールバック対象であること（URL エンコードを考慮して decodeURIComponent でチェック）
    const deleteUrl = decodeURIComponent(deleteCalls[0][0] as string);
    expect(deleteUrl).toContain("path/img1.jpg");
  });

  it("ロールバック DELETE が失敗しても元の Error を再スローする", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ path: "path/img1.jpg" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Upload failed" }),
      })
      // ロールバック DELETE も失敗
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const files = [MOCK_FILE, MOCK_FILE];

    // ロールバック失敗しても元の Error が伝播されること
    await expect(
      uploadImagesViaApi(files, "practice-1", PRACTICE_BUCKET, MOCK_ACCESS_TOKEN),
    ).rejects.toThrow();
  });
});

describe("[IM-05] uploadImageViaApi — access_token の境界値", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("access_token が空文字のとき Authorization ヘッダは 'Bearer ' になる（API は 401 を返す想定）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    await expect(
      uploadImageViaApi(MOCK_FILE, "practice-1", PRACTICE_BUCKET, ""),
    ).rejects.toThrow();

    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    // 空 token でも "Bearer " プレフィックスは付与される（バリデーションなし）
    expect(headers["Authorization"]).toBe("Bearer ");
  });
});

describe("[IM-06~07] getImageUrlFromPath — URL 解決", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("env.r2PublicUrl が空文字の場合は Supabase Storage の getPublicUrl 結果を返す", () => {
    // デフォルトモックでは r2PublicUrl = "" なので Supabase URL パスを使う
    mockGetPublicUrl.mockReturnValueOnce({
      data: {
        publicUrl:
          "https://supabase.co/storage/v1/object/public/practice-images/user1/img.jpg",
      },
    });

    const result = getImageUrlFromPath(mockSupabase, "user1/img.jpg", PRACTICE_BUCKET);

    // Supabase の getPublicUrl が呼ばれ、その結果が返ること
    expect(mockGetPublicUrl).toHaveBeenCalledWith("user1/img.jpg");
    expect(result).toContain("user1/img.jpg");
  });

  it("path が空文字のとき空文字を返す（境界値）", () => {
    const result = getImageUrlFromPath(mockSupabase, "", PRACTICE_BUCKET);
    expect(result).toBe("");
  });
});

describe("[IM-08] uploadImagesViaApi — 401 レスポンス時の動作 (既存仕様確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 レスポンス時に Error が throw される (token が正しく Authorization ヘッダに載る)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "認証が必要です" }),
    });

    await expect(
      uploadImagesViaApi([MOCK_FILE], "comp-1", COMPETITION_BUCKET, MOCK_ACCESS_TOKEN),
    ).rejects.toThrow();

    // Authorization ヘッダが正しく設定されていること
    const fetchOptions = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
  });
});
