/**
 * 画像URL取得ヘルパー
 * R2優先、Supabase Storageフォールバック対応
 */

const R2_PUBLIC_URL = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const SUPABASE_STORAGE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`
  : null

export type StorageBucket = 'profiles' | 'practices' | 'competitions'

// Supabaseバケット名とR2フォルダのマッピング
const BUCKET_MAPPING: Record<StorageBucket, string> = {
  profiles: 'profile-images',     // Supabase: profile-images / R2: profiles
  practices: 'practice-images',   // Supabase: practice-images / R2: practices
  competitions: 'competition-images' // Supabase: competition-images / R2: competitions
}

/**
 * 画像のフルURLを取得
 * R2が設定されている場合はR2優先、なければSupabase Storage
 *
 * @param path 画像パス（相対パスまたはフルURL）
 * @param bucket バケット種別
 * @returns 画像のフルURL、またはnull
 */
export function getImageUrl(
  path: string | null | undefined,
  bucket: StorageBucket
): string | null {
  if (!path) return null

  // 既にフルURLの場合はそのまま返す
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  // R2が設定されている場合はR2のURLを返す
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${bucket}/${path}`
  }

  // フォールバック: Supabase Storage
  if (SUPABASE_STORAGE_URL) {
    const supabaseBucket = BUCKET_MAPPING[bucket]
    return `${SUPABASE_STORAGE_URL}/${supabaseBucket}/${path}`
  }

  // どちらも設定されていない場合はnull
  console.warn('画像URL取得エラー: R2_PUBLIC_URL および SUPABASE_URL が未設定')
  return null
}

/**
 * R2が有効かどうかをクライアントサイドで確認
 */
export function isR2EnabledClient(): boolean {
  return !!R2_PUBLIC_URL
}

/**
 * 画像パスからフルURLを生成（Supabase Storage用）
 * 既存コードとの互換性のため
 */
export function getSupabaseStorageUrl(bucket: string, path: string): string {
  if (!SUPABASE_STORAGE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URLが設定されていません')
  }
  return `${SUPABASE_STORAGE_URL}/${bucket}/${path}`
}
