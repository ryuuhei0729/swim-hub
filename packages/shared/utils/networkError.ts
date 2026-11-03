// =============================================================================
// 通信エラー判定 - Swim Hub 共通パッケージ
// =============================================================================
//
// Supabase 系ライブラリは「通信できなかった」ことを別々の形で表現するため、
// 呼び出し側で一つずつ見分けるのは難しい。ここで1か所にまとめて判定する。
//
// - fetch 自体の失敗: RN は `TypeError: Network request failed`、ブラウザは
//   `TypeError: Failed to fetch` (Chrome) / `NetworkError ...` (Firefox) /
//   `Load failed` (Safari)
// - postgrest-js: fetch の例外を捕まえて `{ message: "TypeError: Network request failed",
//   code: "" }` という **Error ではないプレーンオブジェクト** を返す (API 層はそれを throw する)
// - auth-js: `AuthRetryableFetchError` (status 0) に包んで返す
// - storage-js: `StorageUnknownError` の `originalError` に元の例外を持つ
// - mobile の fetchWithTimeout: 時間切れで `NetworkTimeoutError` を投げる

export type NetworkErrorKind = "timeout" | "network";

/**
 * 通信が規定時間内に終わらなかったことを表すエラー。
 * name を "TimeoutError" にしておくと、postgrest-js が包んだ後も
 * message の先頭 (`TimeoutError: ...`) から判別できる。
 */
export class NetworkTimeoutError extends Error {
  constructor(message = "Network request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

const NETWORK_MESSAGE_PATTERNS = [
  "network request failed",
  "failed to fetch",
  "networkerror",
  "load failed",
  "network connection was lost",
  "internet connection appears to be offline",
];

const TIMEOUT_MESSAGE_PATTERNS = ["timed out", "timeout"];

/** 原因をたどる深さの上限 (循環参照対策) */
const MAX_CAUSE_DEPTH = 3;

function readString(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

function readField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function classifyMessage(message: string): NetworkErrorKind | null {
  const lower = message.toLowerCase();
  if (lower.startsWith("timeouterror")) return "timeout";
  if (NETWORK_MESSAGE_PATTERNS.some((p) => lower.includes(p))) return "network";
  return null;
}

/**
 * エラーが通信起因かを判定し、種類を返す。通信起因でなければ null。
 *
 * サーバーが返したエラー (PostgREST の `code` が空でないもの。例: statement timeout の 57014)
 * は「届いたうえで失敗した」ので通信エラーとは扱わない。
 */
export function getNetworkErrorKind(
  error: unknown,
  depth = 0,
): NetworkErrorKind | null {
  if (error === null || error === undefined || depth > MAX_CAUSE_DEPTH)
    return null;

  if (typeof error === "string") return classifyMessage(error);
  if (typeof error !== "object") return null;

  const name = readString(error, "name");
  const message = readString(error, "message");

  if (name === "TimeoutError") return "timeout";

  // auth-js: fetch 自体が失敗したときは status 0 の AuthRetryableFetchError になる
  // (5xx でも同じ名前になるが、それはサーバーに届いているので通信エラーではない)
  if (name === "AuthRetryableFetchError") {
    const status = readField(error, "status");
    if (status === 0 || status === undefined) {
      return (
        classifyMessage(message) ??
        (isTimeoutText(message) ? "timeout" : "network")
      );
    }
    return null;
  }

  // PostgREST がサーバー側で返したエラーは code を持つ。クライアント側の通信失敗は code が空
  const code = readField(error, "code");
  const isServerResponse = typeof code === "string" && code.length > 0;
  if (!isServerResponse) {
    const kind = classifyMessage(message);
    if (kind) return kind;
    if (name === "TypeError" && isTimeoutText(message)) return "timeout";
  }

  return (
    getNetworkErrorKind(readField(error, "cause"), depth + 1) ??
    getNetworkErrorKind(readField(error, "originalError"), depth + 1)
  );
}

function isTimeoutText(message: string): boolean {
  const lower = message.toLowerCase();
  return TIMEOUT_MESSAGE_PATTERNS.some((p) => lower.includes(p));
}

/** エラーが通信起因 (オフライン・タイムアウト・接続断) かどうか */
export function isNetworkError(error: unknown): boolean {
  return getNetworkErrorKind(error) !== null;
}
