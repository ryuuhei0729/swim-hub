/**
 * Email Deep Link - ユニットテスト
 *
 * Sprint Contract: メール確認リンクのディープリンク復帰修正
 *
 * 検証観点:
 * [DL-01] extractTokensFromUrl — 正常系: access_token / refresh_token が取れる
 * [DL-02] extractTokensFromUrl — error フラグメントがある場合は error を返す
 * [DL-03] extractTokensFromUrl — error_description がある場合は error を返す
 * [DL-04] extractTokensFromUrl — フラグメントにトークンがない場合は null を返す
 * [DL-05] extractTokensFromUrl — 不正 URL の場合は error を返す
 * [DL-06] isEmailAuthCallback — swimhub://auth/callback + access_token を含む URL は true
 * [DL-07] isEmailAuthCallback — swimhub://auth/callback + error を含む URL は true
 * [DL-08] isEmailAuthCallback — swimhub://auth/callback だがパス不一致 / 別スキームは false
 * [DL-09] isEmailAuthCallback — 無関係な URL は false
 * [DL-10] isEmailAuthCallback — フラグメントが空は false
 * [DL-11] isEmailAuthCallback — 無関係キーのみは false
 * [DL-12] isEmailAuthCallback — type=recovery は false (除外仕様)
 * [DL-13] isEmailAuthCallback — クエリパラメータ付き URL でも正しく判定される
 * [DL-14] isEmailAuthCallback — swimhub:// を含む https:// URL は false (完全一致ベース)
 */

import { describe, it, expect, vi } from "vitest";

// expo-auth-session が expo-modules-core の CodedError を必要とするが、
// vitest.setup.ts のモックに含まれていない。ここで補完する。
vi.mock("expo-modules-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("expo-modules-core")>();
  class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { ...actual, CodedError };
});

// expo-auth-session を stub (makeRedirectUri だけ必要)
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(
    ({ native }: { native?: string }) => native ?? "swimhub://auth/callback",
  ),
  ResponseType: { Token: "token", Code: "code" },
}));

// 実物の isEmailAuthCallback を auth-deep-link から import してテストする
// (トートロジー排除: テストファイル内にロジックを複製しない)
import { isEmailAuthCallback } from "@/lib/auth-deep-link";
import { extractTokensFromUrl } from "@/lib/google-auth";

// ---- [DL-01] 正常系 --------------------------------------------------------

describe("[DL-01] extractTokensFromUrl — 正常系", () => {
  it("access_token と refresh_token を抽出できる", () => {
    const url =
      "swimhub://auth/callback#access_token=at123&refresh_token=rt456&expires_in=3600&token_type=bearer";
    const result = extractTokensFromUrl(url);

    expect(result.accessToken).toBe("at123");
    expect(result.refreshToken).toBe("rt456");
    expect(result.expiresIn).toBe(3600);
    expect(result.tokenType).toBe("bearer");
    expect(result.error).toBeNull();
  });

  it("provider_token / provider_refresh_token も抽出できる", () => {
    const url =
      "swimhub://auth/callback#access_token=at&refresh_token=rt&provider_token=pt&provider_refresh_token=prt";
    const result = extractTokensFromUrl(url);

    expect(result.providerToken).toBe("pt");
    expect(result.providerRefreshToken).toBe("prt");
    expect(result.error).toBeNull();
  });
});

// ---- [DL-02] error フラグメント -------------------------------------------

describe("[DL-02] extractTokensFromUrl — error フラグメント", () => {
  it("error パラメータがある場合は error を返し、トークンは null", () => {
    const url = "swimhub://auth/callback#error=access_denied";
    const result = extractTokensFromUrl(url);

    expect(result.error).toBe("access_denied");
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
  });
});

// ---- [DL-03] error_description --------------------------------------------

describe("[DL-03] extractTokensFromUrl — error_description", () => {
  it("error_description が優先して error に入る", () => {
    const url =
      "swimhub://auth/callback#error=invalid_request&error_description=Token+has+expired";
    const result = extractTokensFromUrl(url);

    expect(result.error).toBe("Token has expired");
    expect(result.accessToken).toBeNull();
  });
});

// ---- [DL-04] トークンなし --------------------------------------------------

describe("[DL-04] extractTokensFromUrl — トークンなし", () => {
  it("フラグメントにトークンが存在しない場合は全フィールドが null / error も null", () => {
    const url = "swimhub://auth/callback#some_other_param=value";
    const result = extractTokensFromUrl(url);

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.error).toBeNull();
  });

  it("フラグメント自体がない場合も全フィールドが null", () => {
    const url = "swimhub://auth/callback";
    const result = extractTokensFromUrl(url);

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.error).toBeNull();
  });
});

// ---- [DL-05] 不正 URL ------------------------------------------------------

describe("[DL-05] extractTokensFromUrl — 不正 URL", () => {
  it("not-a-url のような不正文字列は error を返す", () => {
    const url = "not-a-url";
    const result = extractTokensFromUrl(url);

    // URL パース失敗 → catch で error が設定される
    expect(result.error).not.toBeNull();
    expect(result.accessToken).toBeNull();
  });
});

// ---- [DL-06] isEmailAuthCallback — PASS (access_token) --------------------
// 実物の isEmailAuthCallback を import してテストする (仕様: ベース完全一致 + access_token)

describe("[DL-06] isEmailAuthCallback — access_token を含む URL", () => {
  it("swimhub://auth/callback#access_token=... は true", () => {
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback#access_token=at123&refresh_token=rt456",
      ),
    ).toBe(true);
  });
});

// ---- [DL-07] isEmailAuthCallback — PASS (error) ---------------------------

describe("[DL-07] isEmailAuthCallback — error を含む URL", () => {
  it("swimhub://auth/callback#error=access_denied は true", () => {
    expect(
      isEmailAuthCallback("swimhub://auth/callback#error=access_denied"),
    ).toBe(true);
  });

  it("error_description 単体 (error キーなし) は false", () => {
    // 仕様: error キー OR access_token キー のみ
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback#error_description=Token+expired",
      ),
    ).toBe(false);
  });
});

// ---- [DL-08] isEmailAuthCallback — FAIL (パス不一致 / 別スキーム) --------
// 新仕様: url.split("#")[0].split("?")[0] === "swimhub://auth/callback" の完全一致
// "swimhub://auth/callback-extra" は完全一致しないので false

describe("[DL-08] isEmailAuthCallback — パス不一致 / 別スキームは false", () => {
  it("swimhub://other/path#access_token=... は false", () => {
    expect(
      isEmailAuthCallback("swimhub://other/path#access_token=at123"),
    ).toBe(false);
  });

  it("swimhub://auth/callback-extra#access_token=... はパス不一致なので false (新仕様: 完全一致)", () => {
    // 旧実装 (includes) では true だったが、新仕様 (完全一致) では false
    expect(
      isEmailAuthCallback("swimhub://auth/callback-extra#access_token=x"),
    ).toBe(false);
  });

  it("swimhub://auth/callback/extra#access_token=... はパス不一致なので false", () => {
    expect(
      isEmailAuthCallback("swimhub://auth/callback/extra#access_token=x"),
    ).toBe(false);
  });
});

// ---- [DL-09] isEmailAuthCallback — FAIL (無関係 URL) ----------------------

describe("[DL-09] isEmailAuthCallback — 無関係な URL", () => {
  it("https://swim-hub.app/... は false", () => {
    expect(
      isEmailAuthCallback(
        "https://swim-hub.app/auth/callback#access_token=at123",
      ),
    ).toBe(false);
  });

  it("空文字列は false", () => {
    expect(isEmailAuthCallback("")).toBe(false);
  });

  it("swimhub://deep/link — フラグメントなし は false", () => {
    expect(isEmailAuthCallback("swimhub://deep/link")).toBe(false);
  });
});

// ---- [DL-10] isEmailAuthCallback — FAIL (フラグメントが空) ----------------

describe("[DL-10] isEmailAuthCallback — フラグメントが空", () => {
  it("swimhub://auth/callback# は false", () => {
    expect(isEmailAuthCallback("swimhub://auth/callback#")).toBe(false);
  });

  it("swimhub://auth/callback (フラグメントなし) は false", () => {
    expect(isEmailAuthCallback("swimhub://auth/callback")).toBe(false);
  });
});

// ---- [DL-11] isEmailAuthCallback — FAIL (無関係キーのみ) ------------------

describe("[DL-11] isEmailAuthCallback — 無関係キーのみ", () => {
  it("swimhub://auth/callback#state=xyz のみは false", () => {
    expect(
      isEmailAuthCallback("swimhub://auth/callback#state=xyz"),
    ).toBe(false);
  });

  it("swimhub://auth/callback#refresh_token=Y のみ (access_token なし) は false", () => {
    // 仕様: access_token キー OR error キー が必要。refresh_token のみは不十分
    expect(
      isEmailAuthCallback("swimhub://auth/callback#refresh_token=rt123"),
    ).toBe(false);
  });
});

// ---- [DL-12] isEmailAuthCallback — FAIL (type=recovery 除外) --------------

describe("[DL-12] isEmailAuthCallback — type=recovery は false", () => {
  it("type=recovery かつ access_token あり でも false (recovery は別スプリント)", () => {
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback#type=recovery&access_token=at123",
      ),
    ).toBe(false);
  });

  it("type=recovery かつ error あり でも false", () => {
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback#type=recovery&error=access_denied",
      ),
    ).toBe(false);
  });
});

// ---- [DL-13] isEmailAuthCallback — クエリパラメータ付き URL ---------------

describe("[DL-13] isEmailAuthCallback — クエリパラメータ付き URL", () => {
  it("swimhub://auth/callback?foo=bar#access_token=X は true (クエリを除いてベース一致)", () => {
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback?foo=bar#access_token=at123&refresh_token=rt456",
      ),
    ).toBe(true);
  });

  it("swimhub://auth/callback?foo=bar#error=access_denied は true", () => {
    expect(
      isEmailAuthCallback(
        "swimhub://auth/callback?foo=bar#error=access_denied",
      ),
    ).toBe(true);
  });
});

// ---- [DL-14] isEmailAuthCallback — swimhub:// を含む https:// URL ---------

describe("[DL-14] isEmailAuthCallback — swimhub://を含む https:// URL", () => {
  it("https://evil.com/...swimhub://auth/callback#access_token=X は false (完全一致ベース)", () => {
    // ベースが "https://evil.com/...swimhub://auth/callback" であり完全一致しない
    expect(
      isEmailAuthCallback(
        "https://evil.com/redirect?to=swimhub://auth/callback#access_token=X",
      ),
    ).toBe(false);
  });
});
