/**
 * iOSカレンダー同期フック
 * expo-calendarを使用してiOSネイティブカレンダーと同期
 */
import { useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  requestCalendarPermissions,
  getCalendarPermissionStatus,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  practiceToIOSEvent,
  competitionToIOSEvent,
} from "@/services/iosCalendarSync";
import type { Practice, Competition } from "@swim-hub/shared/types";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";

export interface UseIOSCalendarSyncReturn {
  /** iOS カレンダー連携が利用可能か */
  isAvailable: boolean;
  /** パーミッション状態 */
  permissionStatus: "granted" | "denied" | "undetermined" | null;
  /** パーミッションをリクエスト */
  requestPermission: () => Promise<boolean>;
  /** 連携を有効化 */
  enableSync: () => Promise<boolean>;
  /** 連携を無効化 */
  disableSync: () => Promise<boolean>;
  /** 練習記録を同期 */
  syncPractice: (
    practice: Practice,
    action: "create" | "update" | "delete",
    teamName?: string,
  ) => Promise<{ success: boolean; eventId?: string }>;
  /** 大会記録を同期 */
  syncCompetition: (
    competition: Competition,
    action: "create" | "update" | "delete",
    teamName?: string,
  ) => Promise<{ success: boolean; eventId?: string }>;
  /** 同期設定を更新 */
  updateSyncSettings: (
    field: "ios_calendar_sync_practices" | "ios_calendar_sync_competitions",
    value: boolean,
  ) => Promise<boolean>;
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ */
  error: string | null;
  /** エラーをクリア */
  clearError: () => void;
}

export const useIOSCalendarSync = (): UseIOSCalendarSyncReturn => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<
    "granted" | "denied" | "undetermined" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = Platform.OS === "ios";

  // パーミッション状態を確認
  useEffect(() => {
    if (isAvailable) {
      getCalendarPermissionStatus()
        .then(setPermissionStatus)
        .catch((err) => {
          console.error("[IOSCalendarSync] Failed to get permission status:", err);
        });
    }
  }, [isAvailable]);

  // パーミッションリクエスト
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestCalendarPermissions();
    setPermissionStatus(granted ? "granted" : "denied");
    return granted;
  }, []);

  // 連携有効化
  const enableSync = useCallback(async (): Promise<boolean> => {
    if (!supabase) {
      setError(t("auth.ui.clientNotInitialized"));
      return false;
    }
    if (!user) {
      setError(t("settings.iosCalendar.errors.authRequired"));
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      // パーミッション確認
      if (permissionStatus !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          setError(t("settings.iosCalendar.errors.calendarPermissionRequired"));
          return false;
        }
      }

      // DB更新（更新エラーは disableSync と同様に throw し、下の catch で生の詳細を
      // 埋め込まずに処理する。生の PostgrestError.message をそのまま表示すると情報露出になる）
      const { error: updateError } = await supabase
        .from("users")
        .update({ ios_calendar_enabled: true })
        .eq("id", user.id);

      if (updateError) throw updateError;

      return true;
    } catch (err) {
      // 生の例外メッセージ (RLS/ネイティブ API の詳細) をそのまま埋め込むと情報露出になるため、
      // UserFacingError 由来のメッセージのみを通し、それ以外は i18n 済みの汎用文言にフォールバックする
      const errorMessage = toUserFacingMessage(err, t("common.error"));
      setError(t("settings.iosCalendar.errors.enableSyncFailed", { message: errorMessage }));
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, supabase, permissionStatus, requestPermission, t]);

  // 連携無効化
  const disableSync = useCallback(async (): Promise<boolean> => {
    if (!supabase) {
      setError(t("auth.ui.clientNotInitialized"));
      return false;
    }
    if (!user) {
      setError(t("settings.iosCalendar.errors.authRequired"));
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("users")
        .update({ ios_calendar_enabled: false })
        .eq("id", user.id);

      if (updateError) throw updateError;

      return true;
    } catch {
      setError(t("settings.iosCalendar.errors.disconnectFailed"));
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, supabase, t]);

  // 同期設定更新
  const updateSyncSettings = useCallback(
    async (
      field: "ios_calendar_sync_practices" | "ios_calendar_sync_competitions",
      value: boolean,
    ): Promise<boolean> => {
      if (!supabase) {
        setError(t("auth.ui.clientNotInitialized"));
        return false;
      }
      if (!user) {
        setError(t("settings.iosCalendar.errors.authRequired"));
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const { error: updateError } = await supabase
          .from("users")
          .update({ [field]: value })
          .eq("id", user.id);

        if (updateError) throw updateError;

        return true;
      } catch {
        setError(t("settings.iosCalendar.errors.settingsUpdateFailed"));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [user, supabase, t],
  );

  // 練習記録同期
  const syncPractice = useCallback(
    async (
      practice: Practice,
      action: "create" | "update" | "delete",
      teamName?: string,
    ): Promise<{ success: boolean; eventId?: string }> => {
      if (!user || !supabase) return { success: false };

      try {
        if (action === "delete") {
          // ios_calendar_event_idがない場合は削除の必要なし
          if (!practice.ios_calendar_event_id) {
            return { success: true };
          }

          const result = await deleteCalendarEvent(practice.ios_calendar_event_id);
          if (result.success) {
            // DB更新: event_idをクリア
            const { error: updateError } = await supabase
              .from("practices")
              .update({ ios_calendar_event_id: null })
              .eq("id", practice.id);

            if (updateError) {
              console.error("[IOSCalendarSync] Failed to clear event_id after deletion:", {
                practiceId: practice.id,
                eventId: practice.ios_calendar_event_id,
                error: updateError,
              });
              return { success: false };
            }
          }
          return { success: result.success };
        }

        const event = practiceToIOSEvent(practice, teamName);
        if (!event) {
          console.error("[IOSCalendarSync] Invalid practice date:", practice.date);
          return { success: false };
        }

        if (action === "update" && practice.ios_calendar_event_id) {
          const result = await updateCalendarEvent(practice.ios_calendar_event_id, event);
          return { success: result.success, eventId: result.eventId };
        }

        const result = await createCalendarEvent(event);

        // event_idをDBに保存
        if (result.success && result.eventId) {
          const { error: updateError } = await supabase
            .from("practices")
            .update({ ios_calendar_event_id: result.eventId })
            .eq("id", practice.id);

          if (updateError) {
            // DB保存失敗時はカレンダーイベントをロールバック
            console.error("[IOSCalendarSync] Failed to save event_id to DB:", {
              practiceId: practice.id,
              eventId: result.eventId,
              error: updateError,
            });

            // 作成したイベントを削除
            await deleteCalendarEvent(result.eventId);
            return { success: false };
          }
        }

        return { success: result.success, eventId: result.eventId };
      } catch {
        return { success: false };
      }
    },
    [user, supabase],
  );

  // 大会記録同期
  const syncCompetition = useCallback(
    async (
      competition: Competition,
      action: "create" | "update" | "delete",
      teamName?: string,
    ): Promise<{ success: boolean; eventId?: string }> => {
      if (!user || !supabase) return { success: false };

      try {
        if (action === "delete") {
          // ios_calendar_event_idがない場合は削除の必要なし
          if (!competition.ios_calendar_event_id) {
            return { success: true };
          }

          const result = await deleteCalendarEvent(competition.ios_calendar_event_id);
          if (result.success) {
            // DB更新: event_idをクリア
            const { error: updateError } = await supabase
              .from("competitions")
              .update({ ios_calendar_event_id: null })
              .eq("id", competition.id);

            if (updateError) {
              console.error("[IOSCalendarSync] Failed to clear event_id after deletion:", {
                competitionId: competition.id,
                eventId: competition.ios_calendar_event_id,
                error: updateError,
              });
              return { success: false };
            }
          }
          return { success: result.success };
        }

        const event = competitionToIOSEvent(competition, teamName);
        if (!event) {
          console.error("[IOSCalendarSync] Invalid competition date:", competition.date);
          return { success: false };
        }

        if (action === "update" && competition.ios_calendar_event_id) {
          const result = await updateCalendarEvent(competition.ios_calendar_event_id, event);
          return { success: result.success, eventId: result.eventId };
        }

        const result = await createCalendarEvent(event);

        // event_idをDBに保存
        if (result.success && result.eventId) {
          const { error: updateError } = await supabase
            .from("competitions")
            .update({ ios_calendar_event_id: result.eventId })
            .eq("id", competition.id);

          if (updateError) {
            // DB保存失敗時はカレンダーイベントをロールバック
            console.error("[IOSCalendarSync] Failed to save event_id to DB:", {
              competitionId: competition.id,
              eventId: result.eventId,
              error: updateError,
            });

            // 作成したイベントを削除
            await deleteCalendarEvent(result.eventId);
            return { success: false };
          }
        }

        return { success: result.success, eventId: result.eventId };
      } catch {
        return { success: false };
      }
    },
    [user, supabase],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    isAvailable,
    permissionStatus,
    requestPermission,
    enableSync,
    disableSync,
    syncPractice,
    syncCompetition,
    updateSyncSettings,
    loading,
    error,
    clearError,
  };
};
