/**
 * 画像アップロードユーティリティ
 * 練習記録・大会記録の画像をSupabase Storageにアップロード
 */

import { randomUUID } from 'expo-crypto'
import { SupabaseClient } from '@supabase/supabase-js'
import { base64ToArrayBuffer } from './base64'

export type ImageBucket = 'practice-images' | 'competition-images'

export interface UploadImageParams {
  supabase: SupabaseClient
  userId: string
  recordId: string
  base64: string
  fileExtension: string
  bucket: ImageBucket
}

export interface UploadResult {
  path: string
  publicUrl: string
}

/**
 * UUIDを生成（暗号学的に安全なexpo-cryptoを使用）
 */
export function generateUUID(): string {
  return randomUUID()
}

/**
 * コンテンツタイプを取得
 */
function getContentType(fileExtension: string): string {
  const ext = fileExtension.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg'
  }
}

/**
 * 単一の画像をアップロード
 * @returns アップロードされた画像のパスとpublicUrl
 */
export async function uploadImage({
  supabase,
  userId,
  recordId,
  base64,
  fileExtension,
  bucket,
}: UploadImageParams): Promise<UploadResult> {
  // base64をArrayBufferに変換
  const arrayBuffer = base64ToArrayBuffer(base64)

  // ファイル名を生成
  const uuid = generateUUID()
  const fileName = `${uuid}.${fileExtension}`
  const filePath = `${userId}/${recordId}/${fileName}`

  // コンテンツタイプを決定
  const contentType = getContentType(fileExtension)

  // Supabase Storageにアップロード
  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, arrayBuffer, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })

  if (uploadError) {
    console.error('画像アップロードエラー:', uploadError)
    throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`)
  }

  // 公開URLを取得
  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  }
}

/**
 * 複数の画像をアップロード
 * エラー発生時は成功済みの画像をロールバック
 */
export async function uploadImages(
  supabase: SupabaseClient,
  userId: string,
  recordId: string,
  images: Array<{ base64: string; fileExtension: string }>,
  bucket: ImageBucket
): Promise<UploadResult[]> {
  const results: UploadResult[] = []

  try {
    for (const image of images) {
      const result = await uploadImage({
        supabase,
        userId,
        recordId,
        base64: image.base64,
        fileExtension: image.fileExtension,
        bucket,
      })
      results.push(result)
    }
    return results
  } catch (error) {
    // ロールバック: 成功済みの画像をすべて削除
    console.error('画像アップロード中にエラーが発生。ロールバックを開始:', error)

    for (const result of results) {
      try {
        await deleteImage(supabase, result.path, bucket)
      } catch (deleteError) {
        console.error(`画像 ${result.path} の削除に失敗:`, deleteError)
      }
    }

    throw error
  }
}

/**
 * 単一の画像を削除
 */
export async function deleteImage(
  supabase: SupabaseClient,
  path: string,
  bucket: ImageBucket
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    console.error('画像削除エラー:', error)
    throw new Error(`画像の削除に失敗しました: ${error.message}`)
  }
}

/**
 * 複数の画像を削除
 */
export async function deleteImages(
  supabase: SupabaseClient,
  paths: string[],
  bucket: ImageBucket
): Promise<void> {
  if (paths.length === 0) return

  const { error } = await supabase.storage.from(bucket).remove(paths)

  if (error) {
    console.error('画像削除エラー:', error)
    throw new Error(`画像の削除に失敗しました: ${error.message}`)
  }
}

/**
 * 画像のpublicUrlを取得
 */
export function getImagePublicUrl(
  supabase: SupabaseClient,
  path: string,
  bucket: ImageBucket
): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * 画像パスの配列からpublicUrl付きの情報を取得
 */
export function getExistingImagesFromPaths(
  supabase: SupabaseClient,
  paths: string[] | undefined | null,
  bucket: ImageBucket
): Array<{ id: string; url: string }> {
  if (!paths || paths.length === 0) return []

  return paths.map((path) => ({
    id: path, // pathをIDとして使用（削除時に必要）
    url: getImagePublicUrl(supabase, path, bucket),
  }))
}
