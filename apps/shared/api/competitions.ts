// =============================================================================
// 大会API - Swim Hub共通パッケージ
// 画像操作（competitions.image_pathsで管理）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

export class CompetitionAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 大会画像の操作
  // NOTE: 画像パスはcompetitions.image_pathsで管理（competition_imagesテーブルは廃止）
  // =========================================================================

  /**
   * 大会画像をアップロード（API Route経由）
   * @param competitionId 大会ID
   * @param file 圧縮済み画像ファイル
   * @returns 保存されたパス
   */
  async uploadCompetitionImage(
    competitionId: string,
    file: File
  ): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('competitionId', competitionId)

    const appUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/storage/images/competition`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })

    if (!response.ok) {
      let errorMessage = '画像のアップロードに失敗しました'
      let bodyText = ''

      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json() as { error?: string }
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } else {
          bodyText = await response.text()
        }
      } catch {
        try {
          bodyText = await response.text()
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : ''
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`)
    }

    const result = await response.json() as { path: string }
    return result.path
  }

  /**
   * 複数の大会画像を一括アップロード
   * エラー発生時は成功済みの画像をすべてロールバック
   */
  async uploadCompetitionImages(
    competitionId: string,
    files: File[]
  ): Promise<string[]> {
    const results: string[] = []

    try {
      for (const file of files) {
        const path = await this.uploadCompetitionImage(competitionId, file)
        results.push(path)
      }
      return results
    } catch (error) {
      // ロールバック: 成功済みの画像をすべて削除
      console.error('画像アップロード中にエラーが発生。ロールバックを開始:', error)

      for (const path of results) {
        try {
          await this.deleteCompetitionImage(path)
        } catch (deleteError) {
          console.error(`画像 ${path} の削除に失敗:`, deleteError)
        }
      }

      throw error
    }
  }

  /**
   * 大会画像を削除（API Route経由）
   * @param path 画像パス
   */
  async deleteCompetitionImage(path: string): Promise<void> {
    const appUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const response = await fetch(`${appUrl}/api/storage/images/competition?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      credentials: 'include'
    })

    if (!response.ok) {
      let errorMessage = '画像の削除に失敗しました'
      let bodyText = ''

      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json() as { error?: string }
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } else {
          bodyText = await response.text()
        }
      } catch {
        try {
          bodyText = await response.text()
        } catch {
          // テキスト取得も失敗した場合は無視
        }
      }

      const details = bodyText ? `: ${bodyText}` : ''
      throw new Error(`${errorMessage} (HTTP ${response.status}${details})`)
    }
  }

  /**
   * 複数の大会画像を一括削除
   */
  async deleteCompetitionImages(paths: string[]): Promise<void> {
    for (const path of paths) {
      await this.deleteCompetitionImage(path)
    }
  }

  /**
   * 画像のURL（publicUrl）を取得
   * NOTE: R2使用時はR2_PUBLIC_URLを使用
   */
  getCompetitionImageUrl(path: string): string {
    // R2が有効な場合はR2のURLを使用
    const r2PublicUrl = typeof window !== 'undefined'
      ? (window as unknown as { __NEXT_PUBLIC_R2_PUBLIC_URL__?: string }).__NEXT_PUBLIC_R2_PUBLIC_URL__
      : process.env.NEXT_PUBLIC_R2_PUBLIC_URL

    if (r2PublicUrl) {
      return `${r2PublicUrl}/competition-images/${path}`
    }

    // フォールバック: Supabase Storage
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
