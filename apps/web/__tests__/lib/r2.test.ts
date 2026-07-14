// R2 バケット名乖離ガードの検証 (Task E):
//   generateImageGetUrl はアップロード先 (Workers バインディング R2_BUCKET) とは
//   別経路の S3 互換 API に署名するため、署名先バケット名 R2_BUCKET_NAME が
//   未設定の場合にデフォルトバケット名へサイレントフォールバックすると
//   「アップロード成功・署名GET 404」の乖離事故を隠蔽してしまう。
//   → 未設定なら明確に throw することを検証する。
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImageGetUrl } from "@/lib/r2";

describe("generateImageGetUrl", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_ACCOUNT_ID = "test-account";
    // jsdom の crypto には subtle が無いため、署名 (aws4fetch) 用に Node の webcrypto を使う
    vi.stubGlobal("crypto", webcrypto);
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllGlobals();
  });

  it("R2_BUCKET_NAME 未設定の場合はデフォルトバケットにフォールバックせず throw する", async () => {
    delete process.env.R2_BUCKET_NAME;

    await expect(generateImageGetUrl("profile-images/user-1/a.jpg")).rejects.toThrow(
      "R2_BUCKET_NAME が設定されていません",
    );
  });

  it("R2_BUCKET_NAME 設定時は そのバケット名に対する署名付きGET URLを生成する", async () => {
    process.env.R2_BUCKET_NAME = "my-images-bucket";

    const url = await generateImageGetUrl("profile-images/user 1/a.jpg", 600);
    const parsed = new URL(url);

    expect(parsed.hostname).toBe("test-account.r2.cloudflarestorage.com");
    // バケット名は env の値そのもの ("swim-hub-images-prod" ではない) +
    // キーはセグメント単位エンコード ("/" は保持、空白等はエンコード)
    expect(parsed.pathname).toBe("/my-images-bucket/profile-images/user%201/a.jpg");
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
