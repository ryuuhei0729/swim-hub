/**
 * useSignedImageUrl.test.ts - 署名付き画像URL取得フックのユニットテスト
 * (Issue #36 CodeRabbit指摘: isLoading 固着 + 未処理 rejection 修正の検証)
 *
 * 検証観点:
 *   [SU-01] path が falsy (null/undefined/"") の場合、早期 return で isLoading が
 *           false になり、fetch (getSignedImageUrlWithExpiry) は呼ばれない
 *   [SU-02] access_token が無い場合も同様に isLoading が false になる（修正前は
 *           true に固着したまま戻らなかった）。url も null にクリアされる
 *   [SU-03] getSignedImageUrlWithExpiry が reject した場合、catch で url が null になり、
 *           未処理 rejection にならず isLoading も false に戻る
 *   [SU-04] 正常系: 取得成功で url がセットされ isLoading が false になる
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetSignedImageUrl = vi.fn();

vi.mock("@/utils/imageUpload", () => ({
  getSignedImageUrlWithExpiry: (...args: unknown[]) => mockGetSignedImageUrl(...args),
}));

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

import { useSignedImageUrl } from "../useSignedImageUrl";

describe("useSignedImageUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ session: { access_token: "valid-token" } });
  });

  it("[SU-01] path が null の場合、isLoading は false になり fetch は呼ばれない", async () => {
    const { result } = renderHook(() => useSignedImageUrl("profile-images", null));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.url).toBeNull();
    expect(mockGetSignedImageUrl).not.toHaveBeenCalled();
  });

  it("[SU-01] path が undefined の場合、isLoading は false になり fetch は呼ばれない", async () => {
    const { result } = renderHook(() => useSignedImageUrl("profile-images", undefined));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetSignedImageUrl).not.toHaveBeenCalled();
  });

  it("[SU-01] path が空文字の場合、isLoading は false になり fetch は呼ばれない", async () => {
    const { result } = renderHook(() => useSignedImageUrl("profile-images", ""));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetSignedImageUrl).not.toHaveBeenCalled();
  });

  it("[SU-02] access_token が無い場合、isLoading は false になる（修正前は true 固着）", async () => {
    mockUseAuth.mockReturnValue({ session: null });

    const { result } = renderHook(() => useSignedImageUrl("profile-images", "user1/photo.jpg"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.url).toBeNull();
    expect(mockGetSignedImageUrl).not.toHaveBeenCalled();
  });

  it("[SU-03] getSignedImageUrl が reject した場合、url は null になり isLoading は false に戻る", async () => {
    mockGetSignedImageUrl.mockRejectedValueOnce(new Error("network error"));

    const { result } = renderHook(() => useSignedImageUrl("practice-images", "user1/photo.jpg"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.url).toBeNull();
  });

  it("[SU-04] 正常系: 取得成功で url がセットされ isLoading が false になる", async () => {
    mockGetSignedImageUrl.mockResolvedValueOnce({
      url: "https://signed.example.com/photo.jpg",
      expiresAt: Date.now() + 3600 * 1000,
    });

    const { result } = renderHook(() => useSignedImageUrl("competition-images", "user1/photo.jpg"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.url).toBe("https://signed.example.com/photo.jpg");
    expect(mockGetSignedImageUrl).toHaveBeenCalledWith(
      "competition-images",
      "user1/photo.jpg",
      "valid-token",
    );
  });
});
