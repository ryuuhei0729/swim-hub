/**
 * getRedirectUri (src/mobile/getRedirectUri.ts) の単体テスト。
 *
 * Sprint Contract: expo-auth-session の makeRedirectUri に、アプリごとの
 * カスタムスキーム (swimhub:// / swimhub-scanner:// / swimhubtimer:// 等) を
 * 渡して OAuth コールバック用のリダイレクト URI を生成する。
 * path は3アプリ共通で "auth/callback" に固定する (移植元3ファイルとも同一)。
 *
 * expo-auth-session はネイティブ専用モジュールに依存するため vi.mock で完全に
 * 差し替える (実体を import・解決しない)。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const makeRedirectUriMock = vi.fn();
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: (...args: unknown[]) => makeRedirectUriMock(...args),
}));

import { getRedirectUri } from "../../src/mobile/getRedirectUri";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRedirectUri", () => {
  it("[V-17] makeRedirectUri に { scheme, path: 'auth/callback', native: `${scheme}://auth/callback` } を渡す", () => {
    makeRedirectUriMock.mockReturnValue("https://auth.expo.io/mock");
    getRedirectUri("swimhub");

    expect(makeRedirectUriMock).toHaveBeenCalledWith({
      scheme: "swimhub",
      path: "auth/callback",
      native: "swimhub://auth/callback",
    });
  });

  it("[V-18] makeRedirectUri の戻り値をそのまま返す", () => {
    makeRedirectUriMock.mockReturnValue("swimhub://auth/callback");
    const result = getRedirectUri("swimhub");
    expect(result).toBe("swimhub://auth/callback");
  });

  it("境界値: scheme が異なれば native URI もそれに応じて変わる (3アプリ分のスキームで確認)", () => {
    getRedirectUri("swimhub");
    expect(makeRedirectUriMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ scheme: "swimhub", native: "swimhub://auth/callback" }),
    );

    getRedirectUri("swimhub-scanner");
    expect(makeRedirectUriMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ scheme: "swimhub-scanner", native: "swimhub-scanner://auth/callback" }),
    );

    getRedirectUri("swimhubtimer");
    expect(makeRedirectUriMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ scheme: "swimhubtimer", native: "swimhubtimer://auth/callback" }),
    );
  });

  it("境界値: scheme が空文字の場合は native が '://auth/callback' になる (scheme の妥当性検証は呼び出し元の責務であることの明示)", () => {
    getRedirectUri("");
    expect(makeRedirectUriMock).toHaveBeenCalledWith({
      scheme: "",
      path: "auth/callback",
      native: "://auth/callback",
    });
  });
});
