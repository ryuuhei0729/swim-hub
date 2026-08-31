/**
 * リダイレクトURLを安全に検証・サニタイズする
 * - null/無効な値の場合は'/dashboard'にフォールバック
 * - 相対パスのみを許可（startsWith('/')かつ!startsWith('//')）
 * - デコード後の値も検証してエンコードバイパス攻撃を防ぐ
 * - バックスラッシュ始まり(/\)も拒否
 * - オープンリダイレクト攻撃を防ぐ
 *
 * @param redirectTo - 検証するリダイレクトURL（null可）
 * @returns 検証済みの安全なリダイレクトパス
 */
export function getSafeRedirectUrl(redirectTo: string | null): string {
  const defaultPath = "/dashboard";

  if (!redirectTo) {
    return defaultPath;
  }

  // パスが'/'で始まることを確認（相対パスのみ許可）
  if (!redirectTo.startsWith("/")) {
    return defaultPath;
  }

  // '//'で始まるパスを拒否（プロトコル相対URLを防ぐ）
  if (redirectTo.startsWith("//")) {
    return defaultPath;
  }

  // '/\'で始まるパスを拒否（バックスラッシュによるバイパスを防ぐ）
  if (redirectTo.startsWith("/\\")) {
    return defaultPath;
  }

  // デコード後の値も検証（/%2F%2Fevil.com 等のエンコードバイパスを防ぐ）
  let decoded: string;
  try {
    decoded = decodeURIComponent(redirectTo);
  } catch {
    return defaultPath;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return defaultPath;
  }

  // ".." トラバーサルを拒否 (パスセグメント単位で判定)
  if (decoded.split(/[/\\]/).includes("..")) {
    return defaultPath;
  }

  // 制御文字 (0x00-0x1F, 0x7F, 0x80-0x9F) を拒否
  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      return defaultPath;
    }
  }

  // 検証を通過したパスを返す
  return redirectTo;
}
