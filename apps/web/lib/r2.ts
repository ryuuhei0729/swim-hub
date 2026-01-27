/**
 * Cloudflare R2 クライアント
 * Cloudflare Workers環境ではR2バインディングを使用
 * ローカル開発環境ではS3互換APIを使用（フォールバック）
 */

/// <reference types="@cloudflare/workers-types" />

// CloudflareEnvを拡張してR2_BUCKETバインディングを追加
declare global {
  interface CloudflareEnv {
    R2_BUCKET?: R2Bucket
  }
}

/**
 * R2バケットを取得（Cloudflare Workers環境）
 */
async function getR2Bucket(): Promise<R2Bucket> {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const ctx = await getCloudflareContext({ async: true })
  const bucket = ctx.env.R2_BUCKET
  if (!bucket) {
    throw new Error('R2_BUCKETバインディングが設定されていません')
  }
  return bucket
}

const getPublicUrl = (): string => {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) {
    throw new Error('R2_PUBLIC_URLが設定されていません')
  }
  return publicUrl
}

/**
 * R2が有効かどうかを確認
 * バインディングが設定されているかどうかはランタイムでしか確認できないため、
 * 公開URLの設定有無で判断
 */
export function isR2Enabled(): boolean {
  return !!process.env.R2_PUBLIC_URL
}

/**
 * ファイルをR2にアップロード
 * @param file ファイル内容（Buffer または Uint8Array）
 * @param key ファイルのキー（パス）
 * @param contentType MIMEタイプ
 * @returns 公開URL
 */
export async function uploadToR2(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = await getR2Bucket()

  await bucket.put(key, file, {
    httpMetadata: {
      contentType,
    },
  })

  return `${getPublicUrl()}/${key}`
}

/**
 * ファイルをR2から削除
 * @param key ファイルのキー（パス）
 */
export async function deleteFromR2(key: string): Promise<void> {
  const bucket = await getR2Bucket()
  await bucket.delete(key)
}

/**
 * 指定プレフィックス内のファイル一覧を取得
 * @param prefix プレフィックス（フォルダパス）
 * @returns ファイルキーの配列
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  const bucket = await getR2Bucket()

  const listed = await bucket.list({ prefix })

  return listed.objects
    .map(obj => obj.key)
    .filter((key): key is string => key !== undefined)
}

/**
 * 複数ファイルをR2から削除
 * @param keys ファイルキーの配列
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  const bucket = await getR2Bucket()
  // R2は一括削除をサポートしていないので個別に削除
  await Promise.all(keys.map(key => bucket.delete(key)))
}

/**
 * R2の公開URLを取得
 * @param key ファイルのキー（パス）
 * @returns 公開URL
 */
export function getR2PublicUrl(key: string): string {
  return `${getPublicUrl()}/${key}`
}
