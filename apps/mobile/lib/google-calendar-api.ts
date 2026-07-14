/**
 * Googleカレンダー同期APIクライアント
 * Web APIを呼び出して既存データをGoogleカレンダーに同期
 */
import { env } from "@/lib/env";
import i18n from "@/i18n";

const WEB_API_URL = env.webApiUrl;

export interface BulkSyncResult {
  success: boolean;
  results?: {
    practices: { success: number; error: number };
    competitions: { success: number; error: number };
  };
  error?: string;
}

export interface SaveGoogleCalendarTokenResult {
  success: boolean;
  error?: string;
}

/**
 * Google OAuth の provider_refresh_token をサーバーに保存し、カレンダー連携を有効化する。
 * useGoogleAuth (warm path) と AuthProvider のディープリンクハンドラ (コールドスタート復帰)
 * の両方から呼ばれるため、API 呼び出しをここに集約する。
 * @param accessToken Supabaseセッションのアクセストークン
 * @param providerRefreshToken Google OAuth のリフレッシュトークン
 */
export const saveGoogleCalendarRefreshToken = async (
  accessToken: string,
  providerRefreshToken: string,
): Promise<SaveGoogleCalendarTokenResult> => {
  try {
    const response = await fetch(`${WEB_API_URL}/api/google-calendar/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ providerRefreshToken }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        success: false,
        error: errorData.error || i18n.t("auth.mobile.calendarConnectionSaveFailed"),
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : i18n.t("auth.mobile.calendarConnectionSaveFailed"),
    };
  }
};

/**
 * 既存データをGoogleカレンダーに一括同期
 * @param accessToken Supabaseセッションのアクセストークン
 */
export const syncAllToGoogleCalendar = async (accessToken: string): Promise<BulkSyncResult> => {
  try {
    const response = await fetch(`${WEB_API_URL}/api/google-calendar/sync-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      return {
        success: false,
        error: errorData.error || i18n.t("common.app.bulkSyncFailedWithStatus", { status: response.status }),
      };
    }

    const data = (await response.json()) as {
      results: {
        practices: { success: number; error: number };
        competitions: { success: number; error: number };
      };
    };

    return { success: true, results: data.results };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : i18n.t("common.app.bulkSyncFailed"),
    };
  }
};
