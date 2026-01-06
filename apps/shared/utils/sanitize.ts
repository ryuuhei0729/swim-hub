// =============================================================================
// 入力サニタイズユーティリティ - Swim Hub共通パッケージ
// =============================================================================

/**
 * HTMLエスケープ関数
 * HTMLタグや特殊文字をエスケープしてXSS攻撃を防ぐ
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, (m) => map[m])
}

/**
 * テキスト入力のサニタイズ
 * - HTMLタグをエスケープ
 * - 最大長を制限
 * - 先頭・末尾の空白をトリム
 */
export function sanitizeTextInput(text: string, maxLength: number = 500): string {
  // 先頭・末尾の空白をトリム
  let sanitized = text.trim()
  
  // 最大長を制限
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength)
  }
  
  // HTMLエスケープ
  return escapeHtml(sanitized)
}

/**
 * テキスト入力の最大長を検証
 */
export function validateMaxLength(text: string, maxLength: number): boolean {
  return text.length <= maxLength
}

