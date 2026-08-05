/**
 * extractTokensFromUrl (src/mobile/extractTokensFromUrl.ts) の単体テスト。
 *
 * Sprint Contract: OAuth コールバック URL (カスタムスキーム) から PKCE の
 * 認可コード・implicit フローのトークン・エラー情報を抽出する。
 * PM承認の設計判断2: 不正 URL (パース自体が失敗する場合) は各アプリの i18n 文言
 * ではなく非ローカライズの固定エラーコード "invalid_url" を返す
 * (ローカライズは呼び出し側の責務)。
 *
 * 移植元: swimhub-timer/apps/mobile/lib/google-auth.ts の extractTokensFromUrl を
 * ベースに、swim-hub/swimhub-scanner 版にあった providerToken/providerRefreshToken
 * (Google Calendar 連携用、implicit フォールバック時のみ意味を持つ) を
 * options.includeProviderTokens で、timer 版にあった recoveryType
 * (パスワードリセット判定用) を options.includeRecoveryType で、それぞれ
 * オプトインできるよう統合したもの。
 */
import { describe, it, expect } from "vitest";
import { extractTokensFromUrl } from "../../src/mobile/extractTokensFromUrl";

const SCHEME = "swimhub-test://auth/callback";

describe("extractTokensFromUrl — 基本抽出 (V-08, V-09)", () => {
  it("[V-08] クエリの code を抽出する (options 未指定でも常に抽出される)", () => {
    const result = extractTokensFromUrl(`${SCHEME}?code=abc123`);
    expect(result.code).toBe("abc123");
    expect(result.error).toBeNull();
  });

  it("[V-09] フラグメントの access_token/refresh_token/expires_in/token_type は options 未指定でも常に抽出される", () => {
    const result = extractTokensFromUrl(
      `${SCHEME}#access_token=at-1&refresh_token=rt-1&expires_in=3600&token_type=bearer`,
    );
    expect(result.accessToken).toBe("at-1");
    expect(result.refreshToken).toBe("rt-1");
    expect(result.expiresIn).toBe(3600);
    expect(result.tokenType).toBe("bearer");
  });

  it("境界値: expires_in がフラグメントに存在しない場合は null になる (NaN にはしない)", () => {
    const result = extractTokensFromUrl(`${SCHEME}#access_token=at-1`);
    expect(result.expiresIn).toBeNull();
  });
});

describe("extractTokensFromUrl — エラー優先順位 (V-10, V-11)", () => {
  it("[V-10a] hash.error_description が query/hash の他の error 系より最優先される", () => {
    const url =
      `${SCHEME}?error=query_error&error_description=query_error_description` +
      `#error=hash_error&error_description=hash_error_description`;
    const result = extractTokensFromUrl(url);
    expect(result.error).toBe("hash_error_description");
  });

  it("[V-10b] hash.error_description が無い場合は hash.error が次点で優先される", () => {
    const url = `${SCHEME}?error=query_error&error_description=query_error_description#error=hash_error`;
    const result = extractTokensFromUrl(url);
    expect(result.error).toBe("hash_error");
  });

  it("[V-10c] hash に error 系が無い場合は query.error_description が使われる", () => {
    const url = `${SCHEME}?error=query_error&error_description=query_error_description`;
    const result = extractTokensFromUrl(url);
    expect(result.error).toBe("query_error_description");
  });

  it("[V-10d] query.error_description も無い場合は query.error が使われる", () => {
    const url = `${SCHEME}?error=query_error_only`;
    const result = extractTokensFromUrl(url);
    expect(result.error).toBe("query_error_only");
  });

  it("[V-11] エラーが見つかった場合、code や token 系フィールドは URL に含まれていても全て null になる", () => {
    const url = `${SCHEME}?code=should-be-ignored&error=access_denied#access_token=should-be-ignored`;
    const result = extractTokensFromUrl(url, { includeProviderTokens: true, includeRecoveryType: true });
    expect(result.error).toBe("access_denied");
    expect(result.code).toBeNull();
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.expiresIn).toBeNull();
    expect(result.tokenType).toBeNull();
    expect(result.recoveryType).toBeNull();
    expect(result.providerToken).toBeNull();
    expect(result.providerRefreshToken).toBeNull();
  });
});

describe("extractTokensFromUrl — オプトインフィールド (V-12, V-13, V-14)", () => {
  it("[V-12a] options 省略時、hash に type=recovery があっても recoveryType は常に null", () => {
    const result = extractTokensFromUrl(`${SCHEME}#type=recovery&access_token=at-1`);
    expect(result.recoveryType).toBeNull();
  });

  it("[V-12b] options 省略時、hash に provider_token/provider_refresh_token があっても常に null", () => {
    const result = extractTokensFromUrl(
      `${SCHEME}#access_token=at-1&provider_token=g-at&provider_refresh_token=g-rt`,
    );
    expect(result.providerToken).toBeNull();
    expect(result.providerRefreshToken).toBeNull();
  });

  it("[V-12c] includeRecoveryType:false / includeProviderTokens:false を明示しても null のまま", () => {
    const result = extractTokensFromUrl(
      `${SCHEME}#type=recovery&provider_token=g-at&provider_refresh_token=g-rt`,
      { includeRecoveryType: false, includeProviderTokens: false },
    );
    expect(result.recoveryType).toBeNull();
    expect(result.providerToken).toBeNull();
    expect(result.providerRefreshToken).toBeNull();
  });

  it("[V-13] includeRecoveryType:true の場合、hash の type パラメータが recoveryType に反映される", () => {
    const result = extractTokensFromUrl(`${SCHEME}#type=recovery&access_token=at-1`, {
      includeRecoveryType: true,
    });
    expect(result.recoveryType).toBe("recovery");
  });

  it("[V-14] includeProviderTokens:true の場合、provider_token/provider_refresh_token が反映される", () => {
    const result = extractTokensFromUrl(
      `${SCHEME}#access_token=at-1&provider_token=g-at&provider_refresh_token=g-rt`,
      { includeProviderTokens: true },
    );
    expect(result.providerToken).toBe("g-at");
    expect(result.providerRefreshToken).toBe("g-rt");
  });

  it("includeRecoveryType/includeProviderTokens を両方 true にすると両方同時に反映される", () => {
    const result = extractTokensFromUrl(
      `${SCHEME}#type=recovery&access_token=at-1&provider_token=g-at&provider_refresh_token=g-rt`,
      { includeRecoveryType: true, includeProviderTokens: true },
    );
    expect(result.recoveryType).toBe("recovery");
    expect(result.providerToken).toBe("g-at");
    expect(result.providerRefreshToken).toBe("g-rt");
  });
});

describe("extractTokensFromUrl — 不正 URL・空入力 (V-15, V-16)", () => {
  it("[V-15] URL として解析できない文字列は error:'invalid_url' を返し、他のフィールドは全部 null になる", () => {
    const result = extractTokensFromUrl("not a valid url", {
      includeProviderTokens: true,
      includeRecoveryType: true,
    });
    expect(result.error).toBe("invalid_url");
    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.expiresIn).toBeNull();
    expect(result.tokenType).toBeNull();
    expect(result.code).toBeNull();
    expect(result.recoveryType).toBeNull();
    expect(result.providerToken).toBeNull();
    expect(result.providerRefreshToken).toBeNull();
  });

  it("[V-15] 空文字列も不正 URL として error:'invalid_url' を返す", () => {
    const result = extractTokensFromUrl("");
    expect(result.error).toBe("invalid_url");
  });

  it("[V-16] クエリ・フラグメントとも空の URL は全フィールド null (error も null)", () => {
    const result = extractTokensFromUrl(SCHEME, { includeProviderTokens: true, includeRecoveryType: true });
    expect(result).toEqual({
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      tokenType: null,
      code: null,
      recoveryType: null,
      providerToken: null,
      providerRefreshToken: null,
      error: null,
    });
  });
});
