/**
 * アプリケーションレベルの暗号化ユーティリティ
 * AES-256-GCM を使用してセンシティブデータを暗号化
 */
import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const CURRENT_VERSION = 'v1'
const PREFIX = `enc:${CURRENT_VERSION}:`

/**
 * 暗号化キーを取得
 * 環境変数から32バイトのキーを生成
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY 環境変数が設定されていません')
  }
  // SHA-256でハッシュ化して32バイトのキーを生成（ソルトとしてバージョンを含める）
  return crypto.createHash('sha256').update(`${CURRENT_VERSION}:${key}`).digest()
}

/**
 * テキストを暗号化
 * @param plaintext 平文
 * @returns 暗号化された文字列（プレフィックス + IV + AuthTag + 暗号文をBase64エンコード）
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // IV(16) + AuthTag(16) + 暗号文 を結合してBase64エンコード
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'base64')
  ])

  return PREFIX + combined.toString('base64')
}

/**
 * 暗号文を復号化
 * @param ciphertext 暗号化された文字列
 * @returns 復号化された平文
 */
export function decrypt(ciphertext: string): string {
  // プレフィックスを検証・除去
  if (!ciphertext.startsWith(PREFIX)) {
    throw new Error('不正な暗号化形式です')
  }
  const data = ciphertext.slice(PREFIX.length)

  const key = getEncryptionKey()
  const combined = Buffer.from(data, 'base64')

  // IV, AuthTag, 暗号文を分離
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted)
  decrypted = Buffer.concat([decrypted, decipher.final()])

  return decrypted.toString('utf8')
}

/**
 * 暗号化されたデータかどうかを判定
 * プレフィックスの存在で確実に判定
 */
export function isEncrypted(data: string): boolean {
  return data.startsWith(PREFIX)
}
