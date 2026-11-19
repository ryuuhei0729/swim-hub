// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  getLastLoginMethod,
  LAST_LOGIN_METHOD_COOKIE,
  setLastLoginMethod,
} from "@/lib/lastLoginMethod";
import { updateSession } from "@/lib/supabase-auth/middleware";

function clearCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

describe("lastLoginMethod (クライアント)", () => {
  afterEach(() => {
    clearCookies();
  });

  it("未保存なら null を返す", () => {
    expect(getLastLoginMethod()).toBeNull();
  });

  it("保存した手法を返す", () => {
    setLastLoginMethod("email");
    expect(getLastLoginMethod()).toBe("email");
    setLastLoginMethod("google");
    expect(getLastLoginMethod()).toBe("google");
  });

  it("localStorage / sessionStorage を全消去しても (ログアウト時) 記録は残る", () => {
    setLastLoginMethod("apple");
    window.localStorage.clear();
    window.sessionStorage.clear();
    expect(getLastLoginMethod()).toBe("apple");
  });

  it("不正な値の Cookie は無視する", () => {
    document.cookie = `${LAST_LOGIN_METHOD_COOKIE}=github; Path=/`;
    expect(getLastLoginMethod()).toBeNull();
  });
});

describe("OAuth 戻り (/?code=...) のミドルウェア転送", () => {
  function oauthReturn(query: string, cookie?: string) {
    return new NextRequest(`http://localhost:3000/?code=abc&redirect_to=/ja/onboarding${query}`, {
      headers: cookie ? { cookie } : {},
    });
  }

  it("login_method をコールバックへ引き継ぐ", async () => {
    const res = await updateSession(oauthReturn("&login_method=google"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/api/auth/callback");
    expect(location.searchParams.get("login_method")).toBe("google");
  });

  it("不正な login_method は引き継がない", async () => {
    const res = await updateSession(oauthReturn("&login_method=evil"));
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.has("login_method")).toBe(false);
  });

  it("記録用 Cookie を httpOnly で上書きしない (JS から読めなくなるため)", async () => {
    const res = await updateSession(
      oauthReturn("", `${LAST_LOGIN_METHOD_COOKIE}=email; sb-pkce-verifier=xyz`),
    );
    expect(res.cookies.get(LAST_LOGIN_METHOD_COOKIE)).toBeUndefined();
    // 他の Cookie (PKCE verifier 等) は従来どおり転送される
    expect(res.cookies.get("sb-pkce-verifier")?.httpOnly).toBe(true);
  });
});
