/**
 * applyCookies (src/web/applyCookies.ts) の単体テスト。
 *
 * Sprint Contract: createCallbackSupabaseClient / handleAuthCallback が蓄積した
 * cookiesToSet (CookieToSet[]) を、実際の NextResponse に反映する。
 * options をスプレッドした「後」に sameSite:"lax" / secure:NODE_ENV==="production" /
 * path:"/" を強制上書きする順序を固定する (呼び出し元が渡す options で
 * これら3属性を上書きできない設計であることを保証する)。
 *
 * 移植元: swimhub-scanner/apps/web/src/app/api/auth/callback/route.ts と
 * swimhub-timer の同等 route.ts の applyCookies (byte-identical)。
 *
 * NODE_ENV の一時切り替えは vi.stubEnv/vi.unstubAllEnvs で行う。`next/server` の型定義
 * (next/types/global.d.ts) が NodeJS.ProcessEnv.NODE_ENV を non-optional にグローバル拡張して
 * いるため、`delete process.env.NODE_ENV` は TS2790 (delete の対象は optional である必要がある)
 * になる。vi.stubEnv は元の値を内部に退避し、vi.unstubAllEnvs で確実に元へ戻す。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { applyCookies } from "../../src/web/applyCookies";

function makeResponse(): NextResponse {
  return NextResponse.redirect("http://localhost:3000/login");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("applyCookies — 基本の反映 (V-45)", () => {
  it("[V-45] cookiesToSet の各要素について response.cookies に name/value が設定される", () => {
    const res = makeResponse();
    applyCookies(res, [{ name: "sb-access-token", value: "abc" }]);
    expect(res.cookies.get("sb-access-token")?.value).toBe("abc");
  });
});

describe("applyCookies — sameSite/secure/path の強制上書き (V-46, V-47, V-48)", () => {
  it("[V-46] options.sameSite に何を指定しても最終的に 'lax' に強制上書きされる", () => {
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v", options: { sameSite: "strict" } }]);
    expect(res.cookies.get("c")?.sameSite).toBe("lax");
  });

  it("[V-47a] NODE_ENV=production のとき secure は常に true になる (options.secure:false を指定しても上書きされる)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v", options: { secure: false } }]);
    expect(res.cookies.get("c")?.secure).toBe(true);
  });

  it("[V-47b] NODE_ENV!==production のとき secure は常に false になる (options.secure:true を指定しても上書きされる)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v", options: { secure: true } }]);
    expect(res.cookies.get("c")?.secure).toBe(false);
  });

  it("[V-48] options.path に何を指定しても '/' に強制上書きされる", () => {
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v", options: { path: "/custom" } }]);
    expect(res.cookies.get("c")?.path).toBe("/");
  });
});

describe("applyCookies — 上書き対象以外の options は保持される (V-49)", () => {
  it("[V-49] httpOnly・maxAge 等はそのまま反映される", () => {
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v", options: { httpOnly: true, maxAge: 3600 } }]);
    const cookie = res.cookies.get("c");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(3600);
  });

  it("境界値: options 自体が省略された cookie も sameSite/path の既定値で設定される", () => {
    const res = makeResponse();
    applyCookies(res, [{ name: "c", value: "v" }]);
    const cookie = res.cookies.get("c");
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });
});

describe("applyCookies — 0件・複数件 (V-50, V-51)", () => {
  it("[V-50] 空配列の場合は Set-Cookie ヘッダーが設定されない", () => {
    const res = makeResponse();
    applyCookies(res, []);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("[V-51] 複数 cookie がすべて反映される", () => {
    const res = makeResponse();
    applyCookies(res, [
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
    expect(res.cookies.get("a")?.value).toBe("1");
    expect(res.cookies.get("b")?.value).toBe("2");
  });
});
