import { describe, expect, it } from "vitest";
import {
  getNetworkErrorKind,
  isNetworkError,
  NetworkTimeoutError,
} from "../../utils/networkError";

describe("getNetworkErrorKind", () => {
  it("React Native の fetch 失敗 (TypeError: Network request failed) を network と判定する", () => {
    expect(getNetworkErrorKind(new TypeError("Network request failed"))).toBe(
      "network",
    );
  });

  it("React Native の fetch タイムアウト (TypeError: Network request timed out) を timeout と判定する", () => {
    expect(
      getNetworkErrorKind(new TypeError("Network request timed out")),
    ).toBe("timeout");
  });

  it("ブラウザの fetch 失敗も network と判定する", () => {
    expect(getNetworkErrorKind(new TypeError("Failed to fetch"))).toBe(
      "network",
    );
    expect(getNetworkErrorKind(new TypeError("Load failed"))).toBe("network");
  });

  it("postgrest-js が包んだプレーンオブジェクト (code が空) を判定する", () => {
    expect(
      getNetworkErrorKind({
        message: "TypeError: Network request failed",
        code: "",
        details: "",
      }),
    ).toBe("network");
    expect(
      getNetworkErrorKind({
        message: "TimeoutError: Network request timed out",
        code: "",
      }),
    ).toBe("timeout");
  });

  it("サーバーが返した PostgREST エラーは、文言に timeout を含んでも通信エラーにしない", () => {
    expect(
      getNetworkErrorKind({
        message: "canceling statement due to statement timeout",
        code: "57014",
      }),
    ).toBeNull();
    expect(
      getNetworkErrorKind({ message: "duplicate key value", code: "23505" }),
    ).toBeNull();
  });

  it("auth-js の AuthRetryableFetchError (status 0) を判定し、5xx は除外する", () => {
    const offline = Object.assign(new Error("Network request failed"), {
      name: "AuthRetryableFetchError",
      status: 0,
    });
    const timedOut = Object.assign(new Error("Network request timed out"), {
      name: "AuthRetryableFetchError",
      status: 0,
    });
    const serverError = Object.assign(new Error("Service Unavailable"), {
      name: "AuthRetryableFetchError",
      status: 503,
    });
    expect(getNetworkErrorKind(offline)).toBe("network");
    expect(getNetworkErrorKind(timedOut)).toBe("timeout");
    expect(getNetworkErrorKind(serverError)).toBeNull();
  });

  it("NetworkTimeoutError を timeout と判定する", () => {
    expect(getNetworkErrorKind(new NetworkTimeoutError())).toBe("timeout");
  });

  it("storage-js の originalError や cause をたどって判定する", () => {
    expect(
      getNetworkErrorKind({
        name: "StorageUnknownError",
        message: "unknown",
        originalError: new TypeError("Network request failed"),
      }),
    ).toBe("network");
    expect(
      getNetworkErrorKind(
        new Error("wrapped", { cause: new NetworkTimeoutError() }),
      ),
    ).toBe("timeout");
  });

  it("文字列のエラーメッセージも判定する", () => {
    expect(getNetworkErrorKind("TypeError: Network request failed")).toBe(
      "network",
    );
    expect(getNetworkErrorKind("保存に失敗しました")).toBeNull();
  });

  it("通信と無関係なエラーや値は null", () => {
    expect(getNetworkErrorKind(new Error("認証が必要です"))).toBeNull();
    expect(getNetworkErrorKind(null)).toBeNull();
    expect(getNetworkErrorKind(undefined)).toBeNull();
    expect(getNetworkErrorKind(42)).toBeNull();
  });

  it("cause が循環していても止まる", () => {
    const a: { message: string; cause?: unknown } = { message: "a" };
    a.cause = a;
    expect(getNetworkErrorKind(a)).toBeNull();
  });
});

describe("isNetworkError", () => {
  it("通信エラーなら true", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("boom"))).toBe(false);
  });
});
