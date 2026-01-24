// =============================================================================
// 大会API - Swim Hub共通パッケージ
// 画像操作（competition_images / competition-images）など
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import type {
  CompetitionImage,
  CompetitionImageInsert
} from '../types'

export class CompetitionAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 大会画像の操作
  // =========================================================================

  /**
   * 大会画像一覧取得
   */
  async getCompetitionImages(competitionId: string): Promise<CompetitionImage[]> {
    const { data, error } = await this.supabase
      .from('competition_images')
      .select('*')
      .eq('competition_id', competitionId)
      .order('display_order')

    if (error) throw error
    return data || []
  }

  /**
   * 大会画像のアップロード
   * @param competitionId 大会ID
   * @param originalFile オリジナル画像ファイル
   * @param thumbnailFile サムネイル画像ファイル
   * @param originalFileName 元ファイル名
   * @param displayOrder 表示順序
   * @returns 作成された画像レコード
   */
  async uploadCompetitionImage(
    competitionId: string,
    originalFile: File,
    thumbnailFile: File,
    originalFileName: string,
    displayOrder: number = 0
  ): Promise<CompetitionImage> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // ストレージパスを生成
    const uuid = crypto.randomUUID()
    const originalPath = `${user.id}/${competitionId}/original_${uuid}.webp`
    const thumbnailPath = `${user.id}/${competitionId}/thumb_${uuid}.webp`

    // オリジナル画像をアップロード
    const { error: originalError } = await this.supabase.storage
      .from('competition-images')
      .upload(originalPath, originalFile, {
        contentType: 'image/webp',
        upsert: false
      })

    if (originalError) throw originalError

    // サムネイル画像をアップロード
    const { error: thumbnailError } = await this.supabase.storage
      .from('competition-images')
      .upload(thumbnailPath, thumbnailFile, {
        contentType: 'image/webp',
        upsert: false
      })

    if (thumbnailError) {
      // サムネイルアップロードに失敗したらオリジナルも削除
      await this.supabase.storage.from('competition-images').remove([originalPath])
      throw thumbnailError
    }

    // データベースに記録を作成
    const insertData: CompetitionImageInsert = {
      competition_id: competitionId,
      user_id: user.id,
      original_path: originalPath,
      thumbnail_path: thumbnailPath,
      file_name: originalFileName,
      file_size: originalFile.size,
      display_order: displayOrder
    }

    const { data, error } = await this.supabase
      .from('competition_images')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      // データベース挿入に失敗したらストレージのファイルも削除
      await this.supabase.storage.from('competition-images').remove([originalPath, thumbnailPath])
      throw error
    }

    return data as CompetitionImage
  }

  /**
   * 複数の大会画像を一括アップロード
   * エラー発生時は成功済みの画像をすべてロールバック（ストレージ＋DB削除）
   */
  async uploadCompetitionImages(
    competitionId: string,
    images: Array<{
      originalFile: File
      thumbnailFile: File
      originalFileName: string
    }>
  ): Promise<CompetitionImage[]> {
    const results: CompetitionImage[] = []

    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const result = await this.uploadCompetitionImage(
          competitionId,
          img.originalFile,
          img.thumbnailFile,
          img.originalFileName,
          i
        )
        results.push(result)
      }

      return results
    } catch (error) {
      // ロールバック: 成功済みの画像をすべて削除
      console.error('画像アップロード中にエラーが発生。ロールバックを開始:', error)

      // 逆順で削除（最後に追加したものから削除）
      for (let i = results.length - 1; i >= 0; i--) {
        try {
          await this.deleteCompetitionImage(results[i].id)
        } catch (deleteError) {
          // 削除エラーはログに記録するが、ロールバック処理は継続
          console.error(`画像ID ${results[i].id} の削除に失敗:`, deleteError)
        }
      }

      // 元のエラーを再スロー
      throw error
    }
  }

  /**
   * 大会画像を削除
   */
  async deleteCompetitionImage(imageId: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 画像情報を取得
    const { data: image, error: fetchError } = await this.supabase
      .from('competition_images')
      .select('*')
      .eq('id', imageId)
      .eq('user_id', user.id)
      .single()

    if (fetchError) throw fetchError
    if (!image) throw new Error('画像が見つかりません')

    const img = image as CompetitionImage

    // ストレージからファイルを削除
    const { error: storageError } = await this.supabase.storage
      .from('competition-images')
      .remove([img.original_path, img.thumbnail_path])

    if (storageError) {
      console.error('ストレージ削除エラー:', storageError)
      // ストレージ削除が失敗してもデータベースのレコードは削除を試みる
    }

    // データベースのレコードを削除
    const { error: deleteError } = await this.supabase
      .from('competition_images')
      .delete()
      .eq('id', imageId)
      .eq('user_id', user.id)

    if (deleteError) throw deleteError
  }

  /**
   * 複数の大会画像を一括削除
   */
  async deleteCompetitionImages(imageIds: string[]): Promise<void> {
    for (const id of imageIds) {
      await this.deleteCompetitionImage(id)
    }
  }

  /**
   * 画像のURL（publicUrl）を取得
   */
  getCompetitionImageUrl(path: string): string {
    const { data } = this.supabase.storage
      .from('competition-images')
      .getPublicUrl(path)
    return data.publicUrl
  }

  // =========================================================================
  // 場所候補の取得
  // =========================================================================

  /**
   * 過去の大会で使用した場所一覧を取得（重複排除・最近使われた順）
   */
  async getUniqueCompetitionPlaces(): Promise<string[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('competitions')
      .select('place, date')
      .eq('user_id', user.id)
      .not('place', 'is', null)
      .not('place', 'eq', '')
      .order('date', { ascending: false })

    if (error) throw error

    // 重複排除しつつ、最近使われた順を維持
    const seen = new Set<string>()
    const uniquePlaces: string[] = []
    for (const item of data || []) {
      const place = item.place?.trim()
      if (place && !seen.has(place)) {
        seen.add(place)
        uniquePlaces.push(place)
      }
    }

    return uniquePlaces
  }
}

