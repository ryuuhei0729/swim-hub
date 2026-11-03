// =============================================================================
// fetchWithTimeout - 時間切れで必ず終わる fetch
// =============================================================================
//
// React Native の fetch には既定のタイムアウトが実質無い (Android の OkHttp は
// connect/read/write すべて 0 = 無期限、iOS は OS 既定の約60秒)。プールのように
// 「つながってはいるが極端に遅い」回線では、保存ボタンや読み込み表示が終わらないまま
// 固まって見える。ここで上限を決め、超えたら NetworkTimeoutError で打ち切る。
//
// 注意: 打ち切っても、書き込みリクエストがサーバー側で処理済みの可能性はある
// (応答が戻ってこなかっただけのケース)。そのため書き込みは読み取りより長めにしている。

import { NetworkTimeoutError } from "@apps/shared/utils/networkError";

/** GET / HEAD の上限 */
export const READ_TIMEOUT_MS = 15_000;
/** POST / PATCH / DELETE など書き込みの上限 */
export const WRITE_TIMEOUT_MS = 30_000;
/** 画像本体のアップロードの上限 (数MBを低速回線で送る想定) */
export const UPLOAD_TIMEOUT_MS = 120_000;

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request)
    return input.method.toUpperCase();
  return "GET";
}

/** メソッドに応じた既定のタイムアウト */
export function defaultTimeoutFor(
  input: RequestInfo | URL,
  init?: RequestInit,
): number {
  const method = resolveMethod(input, init);
  return method === "GET" || method === "HEAD"
    ? READ_TIMEOUT_MS
    : WRITE_TIMEOUT_MS;
}

/**
 * 時間切れで NetworkTimeoutError を投げる fetch。
 *
 * 呼び出し元が `signal` を渡している場合 (supabase-js の `.abortSignal()` など) は
 * その中断も引き継ぐ。
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = defaultTimeoutFor(input, init),
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal ?? undefined;

  const forwardAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", forwardAbort);
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // fetch が abort を無視した場合でも確実に終わらせるため、タイマー側でも reject する
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new NetworkTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } catch (error) {
    // abort によって fetch 側が先に AbortError で失敗しても、原因は時間切れとして伝える
    if (timedOut) throw new NetworkTimeoutError();
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}
