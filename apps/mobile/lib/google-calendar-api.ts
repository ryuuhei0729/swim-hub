/**
 * Googleカレンダー同期APIクライアント
 * Web APIを呼び出して既存データをGoogleカレンダーに同期
 */
import Constants from 'expo-constants'

const WEB_API_URL = Constants.expoConfig?.extra?.webApiUrl || 'https://swimhub.app'

export interface BulkSyncResult {
  success: boolean
  results?: {
    practices: { success: number; error: number }
    competitions: { success: number; error: number }
  }
  error?: string
}

/**
 * 既存データをGoogleカレンダーに一括同期
 * @param accessToken Supabaseセッションのアクセストークン
 */
export const syncAllToGoogleCalendar = async (
  accessToken: string
): Promise<BulkSyncResult> => {
  try {
    const response = await fetch(`${WEB_API_URL}/api/google-calendar/sync-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string }
      return {
        success: false,
        error: errorData.error || `一括同期に失敗しました (${response.status})`,
      }
    }

    const data = await response.json() as {
      results: {
        practices: { success: number; error: number }
        competitions: { success: number; error: number }
      }
    }

    return { success: true, results: data.results }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '一括同期に失敗しました',
    }
  }
}
