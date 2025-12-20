/**
 * Base64エンコード/デコードユーティリティ
 * React Native対応（atob/btoaが使えない環境用）
 */

/**
 * Base64文字列をArrayBufferに変換
 * React Nativeではatobが使えないため、手動で変換
 * @param base64 Base64エンコードされた文字列
 * @returns ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  
  // パディング（'='）を考慮してバッファ長を計算
  let bufferLength = base64.length * 0.75
  if (base64[base64.length - 1] === '=') {
    bufferLength--
    if (base64[base64.length - 2] === '=') {
      bufferLength--
    }
  }

  const bytes = new Uint8Array(bufferLength)
  let p = 0

  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = chars.indexOf(base64[i])
    const encoded2 = chars.indexOf(base64[i + 1])
    const encoded3 = chars.indexOf(base64[i + 2])
    const encoded4 = chars.indexOf(base64[i + 3])

    // パディングチェック: indexOfは見つからない場合-1を返す
    // '='はcharsに含まれていないため、encoded3/encoded4が-1の場合はパディング
    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4)
    if (encoded3 !== -1) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2)
    if (encoded4 !== -1) bytes[p++] = ((encoded3 & 3) << 6) | encoded4
  }

  return bytes.buffer
}
