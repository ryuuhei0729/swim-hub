/**
 * リダイレクトURLを安全に検証・サニタイズする
 * - null/無効な値の場合は'/dashboard'にフォールバック
 * - 相対パスのみを許可（startsWith('/')かつ!startsWith('//')）
 * - オープンリダイレクト攻撃を防ぐ
 * 
 * @param redirectTo - 検証するリダイレクトURL（null可）
 * @returns 検証済みの安全なリダイレクトパス
 */
export function getSafeRedirectUrl(redirectTo: string | null): string {
  const defaultPath = '/dashboard'
  
  if (!redirectTo) {
    return defaultPath
  }
  
  // パスが'/'で始まることを確認（相対パスのみ許可）
  if (!redirectTo.startsWith('/')) {
    return defaultPath
  }
  
  // '//'で始まるパスを拒否（プロトコル相対URLを防ぐ）
  if (redirectTo.startsWith('//')) {
    return defaultPath
  }
  
  // 検証を通過したパスを返す
  return redirectTo
}
