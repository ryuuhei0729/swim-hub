/**
 * google-auth.ts - Googleカレンダー連携コールドスタート復帰用フラグのユニットテスト
 *
 * Sprint Contract: Google カレンダー連携の OAuth コールバックがコールドスタート
 * (プロセス kill 後) でも取りこぼされないこと
 *
 * 検証観点:
 * [CP-01] markCalendarConnectPending — AsyncStorage に現在時刻の文字列を保存する
 * [CP-02] markCalendarConnectPending — AsyncStorage.setItem が失敗しても例外を投げない
 * [CP-03] clearCalendarConnectPending — AsyncStorage からキーを削除する
 * [CP-04] clearCalendarConnectPending — AsyncStorage.removeItem が失敗しても例外を投げない
 * [CP-05] consumeCalendarConnectPending — フラグが存在しない場合は false を返す
 * [CP-06] consumeCalendarConnectPending — TTL (10分) 以内なら true を返す
 * [CP-07] consumeCalendarConnectPending — TTL (10分) 超過なら false を返す (期限切れ)
 * [CP-08] consumeCalendarConnectPending — 読み取りと同時にキーを削除する (二重処理防止)
 * [CP-09] consumeCalendarConnectPending — 不正な値 (数値でない) の場合は false を返す
 * [CP-10] consumeCalendarConnectPending — AsyncStorage.getItem が失敗しても例外を投げず false を返す
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// expo-auth-session が expo-modules-core の CodedError を必要とするが、
// vitest.setup.ts のモックに含まれていない。emailDeepLink.test.ts と同様に補完する。
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

vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(
    ({ native }: { native?: string }) => native ?? "swimhub://auth/callback",
  ),
  ResponseType: { Token: "token", Code: "code" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  markCalendarConnectPending,
  clearCalendarConnectPending,
  consumeCalendarConnectPending,
} from "@/lib/google-auth";

const CALENDAR_CONNECT_PENDING_KEY = "swimhub:googleCalendarConnectPending";
const TTL_MS = 10 * 60 * 1000;

describe("[CP-01,02] markCalendarConnectPending", () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.setItem).mockReset();
    vi.mocked(AsyncStorage.setItem).mockResolvedValue(undefined);
  });

  it("[CP-01] 現在時刻を文字列として AsyncStorage に保存する", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    await markCalendarConnectPending();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      CALENDAR_CONNECT_PENDING_KEY,
      String(now),
    );

    vi.mocked(Date.now).mockRestore?.();
  });

  it("[CP-02] AsyncStorage.setItem が reject しても例外を投げない", async () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage full"));

    await expect(markCalendarConnectPending()).resolves.toBeUndefined();
  });
});

describe("[CP-03,04] clearCalendarConnectPending", () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.removeItem).mockReset();
    vi.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
  });

  it("[CP-03] AsyncStorage からフラグキーを削除する", async () => {
    await clearCalendarConnectPending();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CALENDAR_CONNECT_PENDING_KEY);
  });

  it("[CP-04] AsyncStorage.removeItem が reject しても例外を投げない", async () => {
    vi.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error("io error"));

    await expect(clearCalendarConnectPending()).resolves.toBeUndefined();
  });
});

describe("[CP-05..10] consumeCalendarConnectPending", () => {
  beforeEach(() => {
    vi.mocked(AsyncStorage.getItem).mockReset();
    vi.mocked(AsyncStorage.removeItem).mockReset();
    vi.mocked(AsyncStorage.removeItem).mockResolvedValue(undefined);
  });

  it("[CP-05] フラグが存在しない (null) 場合は false を返す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);
  });

  it("[CP-06] TTL (10分) 以内のタイムスタンプなら true を返す", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(now - TTL_MS + 1000));

    await expect(consumeCalendarConnectPending()).resolves.toBe(true);

    vi.mocked(Date.now).mockRestore?.();
  });

  it("[CP-07] TTL (10分) を超過したタイムスタンプは false を返す (期限切れ)", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(now - TTL_MS - 1));

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);

    vi.mocked(Date.now).mockRestore?.();
  });

  it("[CP-07b] ちょうど TTL 境界 (差分 = TTL) は false を返す (未満のみ true の仕様)", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(now - TTL_MS));

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);

    vi.mocked(Date.now).mockRestore?.();
  });

  it("[CP-08] 値の有無・TTL 判定に関わらず、読み取りと同時にキーを削除する (二重処理防止)", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));

    await consumeCalendarConnectPending();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(CALENDAR_CONNECT_PENDING_KEY);
  });

  it("[CP-08b] 連続で呼び出すと2回目は false になる (フラグが復活しない)", async () => {
    const now = Date.now();
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(now));
    await expect(consumeCalendarConnectPending()).resolves.toBe(true);

    // 2回目は removeItem 済みのためモックストレージには何も残っていない想定
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    await expect(consumeCalendarConnectPending()).resolves.toBe(false);
  });

  it("[CP-09] 数値に変換できない不正な値の場合は false を返す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("not-a-number");

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);
  });

  it("[CP-09b] 空文字列の場合は false を返す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("");

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);
  });

  it("[CP-10] AsyncStorage.getItem が reject しても例外を投げず false を返す", async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("read error"));

    await expect(consumeCalendarConnectPending()).resolves.toBe(false);
  });
});
