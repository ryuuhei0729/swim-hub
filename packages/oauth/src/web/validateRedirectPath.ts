/**
 * redirectTo パラメータを検証・サニタイズし、オープンリダイレクトを防止する。
 *
 * - `/` で始まる相対パスのみ許可する (スキーム付き URL は拒否)
 * - プロトコル相対 URL (`//evil.com`) を拒否する
 * - CR/LF や制御文字を含まないことを確認する
 * - `..` を含むパストラバーサルを拒否する
 * - デコード後の値に対して検証する (二重エンコード攻撃を防止)
 * - `origin` が指定されていれば URL コンストラクタで同一オリジンかを確認する
 *   (`new URL("/\\evil.com", origin)` のようにバックスラッシュが WHATWG URL 仕様で
 *   スラッシュへ正規化され別オリジンへ解決されるケースは、この同一オリジン確認でのみ
 *   捕捉できる。`//` 拒否チェックだけではすり抜ける)。`origin` 省略時はこの確認をスキップする。
 * - 無効な値の場合は呼び出し元が指定した defaultPath にフォールバックする
 *
 * 移植元: swim-hub / swimhub-scanner / swimhub-timer それぞれの
 * apps/web 配下の api/auth/callback/route.ts にあった同種関数 (ロジックは
 * byte-identical。defaultPath がアプリごとにハードコードされていた点のみ
 * 引数化して統合した)。
 */
export function validateRedirectPath(
  redirectTo: string | null,
  defaultPath: string,
  origin?: string,
): string {
  if (!redirectTo) {
    return defaultPath;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(redirectTo);
  } catch {
    return defaultPath;
  }

  // スキームを含む URL を拒否 (http:, https:, javascript:, data: など)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return defaultPath;
  }

  // プロトコル相対 URL (//evil.com) を拒否
  if (decoded.startsWith("//") || /^\/\//.test(decoded)) {
    return defaultPath;
  }

  // '/' で始まらないパスを拒否
  if (!decoded.startsWith("/")) {
    return defaultPath;
  }

  // 制御文字 (0x00-0x1F, 0x7F, 0x80-0x9F) を拒否
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i);
    if (
      (charCode >= 0x00 && charCode <= 0x1f) ||
      charCode === 0x7f ||
      (charCode >= 0x80 && charCode <= 0x9f)
    ) {
      return defaultPath;
    }
  }

  // 相対パストラバーサル攻撃を拒否
  if (decoded.includes("..")) {
    return defaultPath;
  }

  // URL コンストラクタで同一オリジン確認 (オープンリダイレクト対策の最終検証)
  if (origin) {
    try {
      const resolvedUrl = new URL(decoded, origin);
      if (resolvedUrl.origin !== origin) {
        return defaultPath;
      }
    } catch {
      return defaultPath;
    }
  }

  return decoded;
}
