/**
 * Cloudflare R2 クライアント
 * S3互換APIを使用してR2バケットを操作
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// R2クライアントの初期化（遅延初期化）
let r2Client: S3Client | null = null

function getR2Client(): S3Client {
  if (!r2Client) {
    const accountId = process.env.R2_ACCOUNT_ID
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2環境変数が設定されていません')
    }

    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
  }
  return r2Client
}

const getBucketName = (): string => {
  const bucketName = process.env.R2_BUCKET_NAME
  if (!bucketName) {
    throw new Error('R2_BUCKET_NAMEが設定されていません')
  }
  return bucketName
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
 */
export function isR2Enabled(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  )
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
  const client = getR2Client()
  const bucketName = getBucketName()

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )

  return `${getPublicUrl()}/${key}`
}

/**
 * ファイルをR2から削除
 * @param key ファイルのキー（パス）
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client()
  const bucketName = getBucketName()

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  )
}

/**
 * 指定プレフィックス内のファイル一覧を取得
 * @param prefix プレフィックス（フォルダパス）
 * @returns ファイルキーの配列
 */
export async function listR2Objects(prefix: string): Promise<string[]> {
  const client = getR2Client()
  const bucketName = getBucketName()

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    })
  )

  return (response.Contents || [])
    .map(obj => obj.Key)
    .filter((key): key is string => key !== undefined)
}

/**
 * 複数ファイルをR2から削除
 * @param keys ファイルキーの配列
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  for (const key of keys) {
    await deleteFromR2(key)
  }
}

/**
 * R2の公開URLを取得
 * @param key ファイルのキー（パス）
 * @returns 公開URL
 */
export function getR2PublicUrl(key: string): string {
  return `${getPublicUrl()}/${key}`
}
