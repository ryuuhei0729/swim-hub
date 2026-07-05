import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  usePracticesQuery,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  usePracticeTagsQuery,
  useCreatePracticeTagMutation,
  useUpdatePracticeTagMutation,
  useDeletePracticeTagMutation,
} from "@apps/shared/hooks/queries/practices";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { practiceKeys, teamKeys } from "@apps/shared/hooks/queries/keys";
import { PracticeAPI } from "@apps/shared/api/practices";
import { useIOSCalendarSync } from "@/hooks/useIOSCalendarSync";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ImageUploader, ImageFile, ExistingImage } from "@/components/shared/ImageUploader";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { TagChips, TagSelectModal, TagManageModal, VideoUploader } from "@/components/shared";
import { FormTabBar, FormTab } from "@/components/forms/FormTabBar";
import { ItemTabs } from "@/components/forms/ItemTabs";
import { uploadImagesViaApi, deleteImagesViaApi, getExistingImagesFromPaths } from "@/utils/imageUpload";
import { uploadVideo } from "@/utils/videoUpload";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { formatTime, SWIM_STYLES } from "@/utils/formatters";
import { hasUnsavedChanges, diffPracticeLogDraft } from "@/utils/tabFormUtils";
import { usePracticeTimeStore } from "@/stores/practiceTimeStore";
import type { MainStackParamList } from "@/navigation/types";
import type { PracticeTag } from "@apps/shared/types";
import type { TimeEntry } from "@apps/shared/types/ui";

type PracticeTabFormRouteProp = RouteProp<MainStackParamList, "PracticeTabForm">;
type PracticeTabFormNavigationProp = NativeStackNavigationProp<MainStackParamList>;

type PracticeTab = "practice" | "log";

// ---- 練習ログメニュー型 ----
const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
] as const;

interface PracticeMenu {
  id: string;
  style: string;
  swimCategory: "Swim" | "Pull" | "Kick";
  distance: number | "";
  reps: number | "";
  sets: number | "";
  circleMin: number | "";
  circleSec: number | "";
  note: string;
  tags: PracticeTag[];
  times: Array<TimeEntry & { id?: string }>;
  /** 既存ログのDBのid (編集時) */
  existingLogId?: string;
}

function createEmptyMenu(): PracticeMenu {
  return {
    id: `menu-${Date.now()}-${Math.random()}`,
    style: "Fr",
    swimCategory: "Swim",
    distance: "",
    reps: "",
    sets: "",
    circleMin: "",
    circleSec: "",
    note: "",
    tags: [],
    times: [],
  };
}

// ---- 練習タブのフォーム state 型 ----
interface PracticeTabState {
  date: string;
  title: string;
  place: string;
  note: string;
}

/**
 * 練習タブ統合フォーム画面（個人フロー）
 *
 * 2タブ構成: 「練習」「練習ログ」
 * - 新規作成: 両タブを自由入力 → 画面下部「保存」で一括コミット
 * - 編集: 親が既存 ID を持つ。子ログのリスト差分計算は diffPracticeLogDraft 関数を利用
 * - 保存の原子性: 親INSERT成功後に子INSERT失敗 → 編集モードへ遷移しエラー表示（画面は閉じない）
 * - beforeRemove: 未保存変更があれば破棄確認アラート
 */
export const PracticeTabFormScreen: React.FC = () => {
  const route = useRoute<PracticeTabFormRouteProp>();
  const navigation = useNavigation<PracticeTabFormNavigationProp>();
  const { practiceId: initialPracticeId, date: initialDateParam, teamId, initialTab } =
    route.params || {};
  const { supabase, subscription, getAccessToken } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // ---- タブ状態 ----
  const [activeTab, setActiveTab] = useState<PracticeTab>(initialTab ?? "practice");
  const [tabErrors, setTabErrors] = useState<Partial<Record<PracticeTab, boolean>>>({});

  // ---- 練習ID (新規作成後に取得) ----
  // 新規作成後に親INSERTで取得したIDを保持する (編集モード遷移用)
  const [resolvedPracticeId, setResolvedPracticeId] = useState<string | undefined>(
    initialPracticeId,
  );
  const isEditMode = !!resolvedPracticeId;

  // ---- 練習タブ state ----
  const [practiceTab, setPracticeTab] = useState<PracticeTabState>({
    date: initialDateParam || format(new Date(), "yyyy-MM-dd"),
    title: "",
    place: "",
    note: "",
  });
  const [practiceErrors, setPracticeErrors] = useState<Partial<Record<keyof PracticeTabState, string>>>({});

  // ---- 画像 state ----
  const [newImageFiles, setNewImageFiles] = useState<ImageFile[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles);
    setDeletedImageIds(deletedIds);
  }, []);

  // ---- 練習ログタブ state ----
  const [menus, setMenus] = useState<PracticeMenu[]>([createEmptyMenu()]);
  const [showTagSelectModal, setShowTagSelectModal] = useState(false);
  const [showTagManageModal, setShowTagManageModal] = useState(false);
  const [editingTag, setEditingTag] = useState<PracticeTag | null>(null);
  const [activeMenuIndex, setActiveMenuIndex] = useState(0);

  // ---- ローディング state ----
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- 二重送信防止 ----
  const isSubmittingRef = useRef(false);
  const initializedRef = useRef(false);

  // ---- 保存完了フラグ (beforeRemove 警告制御) ----
  const [isSaved, setIsSaved] = useState(false);

  // ---- 未保存変更検知用スナップショット ----
  const snapshotRef = useRef<{ practice: PracticeTabState; menus: PracticeMenu[] } | null>(null);

  // ---- ユーザープロフィール ----
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  const { syncPractice } = useIOSCalendarSync();

  // ---- タグ ----
  const { data: availableTags = [] } = usePracticeTagsQuery(supabase);
  const createTagMutation = useCreatePracticeTagMutation(supabase);
  const updateTagMutation = useUpdatePracticeTagMutation(supabase);
  const deleteTagMutation = useDeletePracticeTagMutation(supabase);

  // ---- ミューテーション ----
  const createPracticeMutation = useCreatePracticeMutation(supabase);
  const updatePracticeMutation = useUpdatePracticeMutation(supabase);
  const createLogMutation = useCreatePracticeLogMutation(supabase);
  const updateLogMutation = useUpdatePracticeLogMutation(supabase);

  // ---- 動画 (練習ログタブ) ----
  // メニューIDをキーに保留動画アセットを管理
  const pendingVideoAssetRef = useRef<Map<string, { uri: string; mimeType?: string }>>(new Map());
  const [existingLogVideoPath, setExistingLogVideoPath] = useState<string | null>(null);
  const [existingLogThumbnailPath, setExistingLogThumbnailPath] = useState<string | null>(null);

  // ---- 既存データ取得 (練習一覧) ----
  const { data: practices = [], isLoading: loadingPractices } = usePracticesQuery(supabase, {
    page: 1,
    pageSize: 1000,
    enableRealtime: false,
  });

  // ---- 既存データ初期化 ----
  useEffect(() => {
    if (initializedRef.current) return;

    if (isEditMode && resolvedPracticeId) {
      // 編集モード: 既存の練習データ + 練習ログを fetch してフォームへ
      setLoadingExisting(true);
      const practice = practices.find((p) => p.id === resolvedPracticeId);
      if (practice) {
        const practiceState: PracticeTabState = {
          date: practice.date,
          title: practice.title || "",
          place: practice.place || "",
          note: practice.note || "",
        };
        setPracticeTab(practiceState);
        const images = getExistingImagesFromPaths(
          supabase,
          practice.image_paths,
          "practice-images",
        );
        setExistingImages(images);

        // 既存の練習ログを fetch して menus を初期化 (C-4: getPracticeById で一括取得)
        const api = new PracticeAPI(supabase);
        api
          .getPracticeById(resolvedPracticeId)
          .then((practiceWithLogs) => {
            const logs = practiceWithLogs?.practice_logs ?? [];
            if (logs.length === 0) {
              // ログなし: 空ドラフト1件
              const emptyMenus = [createEmptyMenu()];
              setMenus(emptyMenus);
              snapshotRef.current = { practice: practiceState, menus: emptyMenus };
              return;
            }

            // PracticeLogWithTags → PracticeMenu へマッピング
            const detailedMenus: PracticeMenu[] = logs.map((log) => {
              const times: Array<TimeEntry & { id?: string }> = (log.practice_times || []).map(
                (t) => ({
                  id: t.id,
                  setNumber: t.set_number,
                  repNumber: t.rep_number,
                  time: t.time,
                }),
              );

              const tags: PracticeTag[] = (log.practice_log_tags || [])
                .map((plt) => plt.practice_tags)
                .filter(Boolean);

              return {
                id: log.id,
                existingLogId: log.id,
                style: log.style || "Fr",
                swimCategory: (log.swim_category as "Swim" | "Pull" | "Kick") || "Swim",
                distance: log.distance || "",
                reps: log.rep_count || "",
                sets: log.set_count || "",
                circleMin: log.circle ? Math.floor(log.circle / 60) : "",
                circleSec: log.circle ? log.circle % 60 : "",
                note: log.note || "",
                tags,
                times,
              } satisfies PracticeMenu;
            });

            setMenus(detailedMenus);
            // スナップショットは実際の既存ログで初期化(破棄警告の誤検知を防ぐ)
            snapshotRef.current = { practice: practiceState, menus: detailedMenus };
          })
          .catch((err) => {
            console.error("練習ログ取得エラー:", err);
            // fetch 失敗時は空ドラフトにフォールバック
            const emptyMenus = [createEmptyMenu()];
            setMenus(emptyMenus);
            snapshotRef.current = { practice: practiceState, menus: emptyMenus };
          })
          .finally(() => {
            initializedRef.current = true;
            setLoadingExisting(false);
          });
      } else if (!loadingPractices) {
        setLoadingExisting(false);
      }
    } else {
      // 作成モード
      const initPractice: PracticeTabState = {
        date: initialDateParam || format(new Date(), "yyyy-MM-dd"),
        title: "",
        place: "",
        note: "",
      };
      const emptyMenus = [createEmptyMenu()];
      setPracticeTab(initPractice);
      setMenus(emptyMenus);
      initializedRef.current = true;
      setLoadingExisting(false);

      // スナップショット記録
      snapshotRef.current = { practice: initPractice, menus: emptyMenus };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, resolvedPracticeId, loadingPractices, practices, supabase]);

  // ---- タイムストア (PracticeTimeForm から戻ったとき) ----
  const getTimes = usePracticeTimeStore((state) => state.getTimes);
  const setCurrentMenuId = usePracticeTimeStore((state) => state.setCurrentMenuId);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      const currentMenuId = usePracticeTimeStore.getState().currentMenuId;
      if (currentMenuId) {
        const savedTimes = getTimes(currentMenuId);
        if (savedTimes.length > 0) {
          const timesWithId = savedTimes.map((ti) => ({
            ...ti,
            id: `${ti.setNumber}-${ti.repNumber}-${Date.now()}`,
          }));
          setMenus((prev) =>
            prev.map((m) => (m.id === currentMenuId ? { ...m, times: timesWithId } : m)),
          );
        }
        setCurrentMenuId(null);
      }
    });
    return unsubscribe;
  }, [navigation, getTimes, setCurrentMenuId]);

  // ---- beforeRemove 警告 ----
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (isSaved) return;
      const snapshot = snapshotRef.current;
      if (!snapshot) return;
      const changed = hasUnsavedChanges(
        { practice: practiceTab, menus },
        { practice: snapshot.practice, menus: snapshot.menus },
      );
      if (!changed) return;

      e.preventDefault();
      Alert.alert(
        t("common.discardTitle"),
        t("common.discardMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.discard"),
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, isSaved, practiceTab, menus, t]);

  // ---- 練習タブ バリデーション ----
  const validatePracticeTab = useCallback((): boolean => {
    const errors: Partial<Record<keyof PracticeTabState, string>> = {};
    if (!practiceTab.date || practiceTab.date.trim() === "") {
      errors.date = t("practice.form.dateRequired");
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(practiceTab.date)) {
        errors.date = t("practice.form.dateInvalidFormat");
      } else {
        const dateObj = new Date(practiceTab.date);
        const [year, month, day] = practiceTab.date.split("-").map(Number);
        if (
          isNaN(dateObj.getTime()) ||
          dateObj.getFullYear() !== year ||
          dateObj.getMonth() + 1 !== month ||
          dateObj.getDate() !== day
        ) {
          errors.date = t("practice.form.dateInvalid");
        }
      }
    }
    setPracticeErrors(errors);
    return Object.keys(errors).length === 0;
  }, [practiceTab.date, t]);

  // ---- 練習ログタブ バリデーション (空のとき valid) ----
  const validateLogTab = useCallback((): boolean => {
    // ログタブはアイテム0件でも valid
    for (const menu of menus) {
      if (menu.distance === "" && menu.reps === "" && menu.sets === "") continue;
      if (!menu.style || menu.style.trim() === "") {
        Alert.alert(t("common.error"), t("practice.form.styleRequired"));
        return false;
      }
      if (!menu.distance || Number(menu.distance) <= 0) {
        Alert.alert(t("common.error"), t("practice.form.distanceRequired"));
        return false;
      }
      if (!menu.reps || Number(menu.reps) <= 0) {
        Alert.alert(t("common.error"), t("practice.form.repsRequired"));
        return false;
      }
      if (!menu.sets || Number(menu.sets) <= 0) {
        Alert.alert(t("common.error"), t("practice.form.setsRequired"));
        return false;
      }
    }
    return true;
  }, [menus, t]);

  // ---- 全タブ横断バリデーション ----
  const validateAll = useCallback((): boolean => {
    const practiceValid = validatePracticeTab();
    const logValid = validateLogTab();

    const errors: Partial<Record<PracticeTab, boolean>> = {};
    if (!practiceValid) errors.practice = true;
    if (!logValid) errors.log = true;
    setTabErrors(errors);

    if (!practiceValid) {
      setActiveTab("practice");
      return false;
    }
    if (!logValid) {
      setActiveTab("log");
      return false;
    }
    return true;
  }, [validatePracticeTab, validateLogTab]);

  // ---- 保存ハンドラ ----
  const handleSave = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!validateAll()) return;

    isSubmittingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        Alert.alert(t("common.error"), t("practice.mobile.sessionInvalid"), [{ text: "OK" }]);
        return;
      }

      let savedPracticeId = resolvedPracticeId;

      // --- 練習 INSERT or UPDATE ---
      if (isEditMode && savedPracticeId) {
        // 更新: 画像処理を含む
        let newImagePaths: string[] = [];
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImagesViaApi(
            newImageFiles.map((f) => ({ base64: f.base64, fileExtension: f.fileExtension })),
            savedPracticeId,
            "practice-images",
            accessToken,
          );
          newImagePaths = uploadResults.map((r) => r.path);
        }
        const currentPaths = existingImages
          .filter((img) => !deletedImageIds.includes(img.id))
          .map((img) => img.id);
        const updatedImagePaths = [...currentPaths, ...newImagePaths];

        const formData = {
          date: practiceTab.date,
          title: practiceTab.title.trim() || null,
          place: practiceTab.place.trim() || null,
          note: practiceTab.note.trim() || null,
          image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
        };
        await updatePracticeMutation.mutateAsync({ id: savedPracticeId, updates: formData });

        if (deletedImageIds.length > 0) {
          await deleteImagesViaApi(deletedImageIds, "practice-images", accessToken);
        }

        // iOSカレンダー同期
        if (
          Platform.OS === "ios" &&
          profile?.ios_calendar_enabled &&
          profile?.ios_calendar_sync_practices
        ) {
          const practiceForSync = practices.find((p) => p.id === savedPracticeId);
          if (practiceForSync) {
            try {
              await syncPractice({ ...practiceForSync, ...formData }, "update");
            } catch (syncError) {
              console.warn("カレンダー同期エラー:", syncError);
              Alert.alert(
                t("practice.mobile.calendarSyncFailedTitle"),
                t("practice.mobile.calendarSyncFailedMessage"),
                [{ text: "OK" }],
              );
            }
          }
        }
      } else {
        // 新規作成
        const formData = {
          date: practiceTab.date,
          title: practiceTab.title.trim() || null,
          place: practiceTab.place.trim() || null,
          note: practiceTab.note.trim() || null,
          ...(teamId ? { team_id: teamId } : {}),
        };
        const createdPractice = await createPracticeMutation.mutateAsync(formData);
        savedPracticeId = createdPractice.id;
        // 親INSERT成功 → 編集モードへ遷移（子INSERT失敗でもIDを保持）
        setResolvedPracticeId(createdPractice.id);

        // 画像アップロード
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImagesViaApi(
            newImageFiles.map((f) => ({ base64: f.base64, fileExtension: f.fileExtension })),
            createdPractice.id,
            "practice-images",
            accessToken,
          );
          const imagePaths = uploadResults.map((r) => r.path);
          await updatePracticeMutation.mutateAsync({
            id: createdPractice.id,
            updates: { image_paths: imagePaths },
          });
        }

        // iOSカレンダー同期
        if (
          Platform.OS === "ios" &&
          profile?.ios_calendar_enabled &&
          profile?.ios_calendar_sync_practices
        ) {
          try {
            await syncPractice(createdPractice, "create");
          } catch (syncError) {
            console.warn("カレンダー同期エラー:", syncError);
            Alert.alert(
              t("practice.mobile.calendarSyncFailedTitle"),
              t("practice.mobile.calendarSyncFailedMessage"),
              [{ text: "OK" }],
            );
          }
        }
      }

      // --- 練習ログ INSERT / UPDATE / DELETE ---
      // diffPracticeLogDraft が単一の権威となり creates/updates/deletes を決定する。
      // 有効なメニューのみ保存（全フィールド空はスキップ）
      const validMenus = menus.filter(
        (m) => m.distance !== "" || m.reps !== "" || m.sets !== "",
      );

      if (savedPracticeId) {
        const api = new PracticeAPI(supabase);

        // スナップショット時点の既存ログ ID を収集して差分を計算
        // 新規作成モードでは existingIds は空なので全て creates になる
        const snapshotExistingIds = (snapshotRef.current?.menus ?? [])
          .map((m) => m.existingLogId)
          .filter((id): id is string => !!id);
        const diff = diffPracticeLogDraft(
          validMenus.map((m) => ({ draftId: m.id, existingLogId: m.existingLogId })),
          snapshotExistingIds,
        );

        // DELETE: スナップショット後に除去されたログを削除
        for (const logId of diff.deletes) {
          await api.deletePracticeLog(logId);
        }

        // UPDATE: diff.updates に含まれる既存ログ ID を持つメニューを更新
        const updateSet = new Set(diff.updates);
        for (const menu of validMenus) {
          if (!menu.existingLogId || !updateSet.has(menu.existingLogId)) continue;
          const circleMin = Number(menu.circleMin) || 0;
          const circleSec = Number(menu.circleSec) || 0;
          const circleTime = circleMin * 60 + circleSec;
          const logData = {
            practice_id: savedPracticeId,
            style: menu.style,
            swim_category: menu.swimCategory,
            distance: Number(menu.distance),
            rep_count: Number(menu.reps),
            set_count: Number(menu.sets),
            circle: circleTime > 0 ? circleTime : null,
            note: menu.note.trim() || null,
          };
          await updateLogMutation.mutateAsync({ id: menu.existingLogId, updates: logData });
          await api.replacePracticeTimes(
            menu.existingLogId,
            menu.times.map((ti) => ({
              set_number: ti.setNumber,
              rep_number: ti.repNumber,
              time: ti.time,
            })),
          );
          const { error: tagError } = await supabase.rpc("replace_practice_log_tags", {
            p_practice_log_id: menu.existingLogId,
            p_tag_ids: menu.tags.map((tg) => tg.id),
          });
          if (tagError) throw tagError;
        }

        // INSERT: diff.creates に含まれるドラフト ID を持つメニューを新規作成
        const createSet = new Set(diff.creates);
        for (const menu of validMenus) {
          if (!createSet.has(menu.id)) continue;
          const circleMin = Number(menu.circleMin) || 0;
          const circleSec = Number(menu.circleSec) || 0;
          const circleTime = circleMin * 60 + circleSec;
          const logData = {
            practice_id: savedPracticeId,
            style: menu.style,
            swim_category: menu.swimCategory,
            distance: Number(menu.distance),
            rep_count: Number(menu.reps),
            set_count: Number(menu.sets),
            circle: circleTime > 0 ? circleTime : null,
            note: menu.note.trim() || null,
          };
          const createdLog = await createLogMutation.mutateAsync(logData);
          await api.replacePracticeTimes(
            createdLog.id,
            menu.times.map((ti) => ({
              set_number: ti.setNumber,
              rep_number: ti.repNumber,
              time: ti.time,
            })),
          );
          if (menu.tags.length > 0) {
            const { error: tagError } = await supabase.rpc("replace_practice_log_tags", {
              p_practice_log_id: createdLog.id,
              p_tag_ids: menu.tags.map((tg) => tg.id),
            });
            if (tagError) throw tagError;
          }
          // 保留動画アップロード
          const pendingAsset = pendingVideoAssetRef.current.get(menu.id);
          if (pendingAsset) {
            try {
              await uploadVideo({
                type: "practice-log",
                id: createdLog.id,
                videoUri: pendingAsset.uri,
                mimeType: pendingAsset.mimeType,
                accessToken,
              });
            } catch (err) {
              console.error("動画アップロードエラー:", err);
              const errorDetail = err instanceof Error ? err.message : t("common.error");
              Alert.alert(
                t("practice.mobile.videoUploadFailedTitle"),
                `${t("practice.mobile.videoUploadFailedSaved")}\n\n${errorDetail}`,
              );
            }
            pendingVideoAssetRef.current.delete(menu.id);
          }
        }
      }

      // クエリ無効化
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() });
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });
      }

      setIsSaved(true);
      navigation.goBack();
    } catch (error) {
      console.error("保存エラー:", error);
      const msg = error instanceof Error ? error.message : t("practice.mobile.saveFailed");
      setSaveError(msg);
      Alert.alert(t("common.error"), msg, [{ text: "OK" }]);
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  }, [
    validateAll,
    getAccessToken,
    resolvedPracticeId,
    isEditMode,
    practiceTab,
    newImageFiles,
    existingImages,
    deletedImageIds,
    menus,
    teamId,
    supabase,
    queryClient,
    createPracticeMutation,
    updatePracticeMutation,
    createLogMutation,
    updateLogMutation,
    profile,
    practices,
    syncPractice,
    t,
    navigation,
  ]);

  // ---- メニュー操作 ----
  const addMenu = useCallback(() => {
    setMenus((prev) => {
      const next = [...prev, createEmptyMenu()];
      setActiveMenuIndex(next.length - 1);
      return next;
    });
  }, []);

  const removeMenu = useCallback((id: string) => {
    setMenus((prev) => {
      if (prev.length <= 1) return prev;
      const removedIndex = prev.findIndex((m) => m.id === id);
      pendingVideoAssetRef.current.delete(id);
      const next = prev.filter((m) => m.id !== id);
      setActiveMenuIndex((cur) => {
        const newLen = next.length;
        if (cur >= newLen) return newLen - 1;
        if (cur > removedIndex) return cur - 1;
        return cur;
      });
      return next;
    });
  }, []);

  const updateMenu = useCallback(
    (
      id: string,
      field: keyof PracticeMenu,
      value: string | number | "" | PracticeTag[] | Array<TimeEntry & { id?: string }>,
    ) => {
      setMenus((prev) =>
        prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
      );
    },
    [],
  );

  // ---- タグ操作 ----
  const openTagSelectModal = useCallback((menuIndex: number) => {
    setActiveMenuIndex(menuIndex);
    setShowTagSelectModal(true);
  }, []);

  const openTagCreateModal = useCallback(() => {
    setShowTagSelectModal(false);
    setTimeout(() => {
      setEditingTag(null);
      setShowTagManageModal(true);
    }, 100);
  }, []);

  const openTagEditModal = useCallback((tag: PracticeTag) => {
    setShowTagSelectModal(false);
    setTimeout(() => {
      setEditingTag(tag);
      setShowTagManageModal(true);
    }, 100);
  }, []);

  const handleTagsChange = useCallback(
    (tags: PracticeTag[]) => {
      const menu = menus[activeMenuIndex];
      if (menu) updateMenu(menu.id, "tags", tags);
    },
    [menus, activeMenuIndex, updateMenu],
  );

  const handleSaveTag = useCallback(
    async (name: string, color: string) => {
      try {
        if (editingTag) {
          await updateTagMutation.mutateAsync({ id: editingTag.id, name, color });
        } else {
          const newTag = await createTagMutation.mutateAsync({ name, color });
          const menu = menus[activeMenuIndex];
          if (menu) updateMenu(menu.id, "tags", [...menu.tags, newTag]);
        }
      } catch (error) {
        console.error("タグ保存エラー:", error);
        Alert.alert(t("common.error"), t("practice.mobile.tagSaveFailed"));
      }
    },
    [editingTag, updateTagMutation, createTagMutation, menus, activeMenuIndex, updateMenu, t],
  );

  const handleDeleteTag = useCallback(
    async (id: string) => {
      try {
        await deleteTagMutation.mutateAsync(id);
        setMenus((prev) =>
          prev.map((m) => ({ ...m, tags: m.tags.filter((tg) => tg.id !== id) })),
        );
      } catch (error) {
        console.error("タグ削除エラー:", error);
        Alert.alert(t("common.error"), t("practice.mobile.tagDeleteFailed"));
      }
    },
    [deleteTagMutation, t],
  );

  // ---- タイム入力へ遷移 ----
  const handleTimeInput = useCallback(
    (menuId: string) => {
      const menu = menus.find((m) => m.id === menuId);
      if (!menu) return;
      setCurrentMenuId(menuId);
      navigation.navigate("PracticeTimeForm", {
        practiceLogId: menu.existingLogId,
        setCount: Number(menu.sets) || 1,
        repCount: Number(menu.reps) || 1,
        initialTimes: menu.times.map((ti) => ({
          id: ti.id || `${ti.setNumber}-${ti.repNumber}`,
          setNumber: ti.setNumber,
          repNumber: ti.repNumber,
          time: ti.time,
        })),
      });
    },
    [menus, setCurrentMenuId, navigation],
  );

  // ---- タブ定義 ----
  const tabs = useMemo(
    (): FormTab<PracticeTab>[] => [
      {
        id: "practice",
        label: t("practice.form.tabPractice"),
        hasError: tabErrors.practice,
      },
      {
        id: "log",
        label: t("practice.form.tabLog"),
        hasError: tabErrors.log,
      },
    ],
    [t, tabErrors],
  );

  // ---- ローディング ----
  if (loadingExisting) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loading")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* タブバー */}
      <FormTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="practice" />

      {/* エラーバナー */}
      {saveError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      )}

      {/* タブコンテンツ */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === "practice" && (
          <View style={styles.form}>
            {/* 日付 */}
            <View style={styles.field}>
              <Text style={styles.label}>
                {t("practice.form.dateLabel")} <Text style={styles.required}>*</Text>
              </Text>
              <DatePickerField
                value={practiceTab.date}
                onChange={(next) => {
                  setPracticeTab((prev) => ({ ...prev, date: next }));
                  if (practiceErrors.date) {
                    setPracticeErrors((prev) => ({ ...prev, date: undefined }));
                  }
                }}
                required
                disabled={isSaving}
                error={practiceErrors.date}
                placeholder={t("practice.form.datePlaceholder")}
              />
            </View>

            {/* タイトル */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("practice.form.titleLabel")}</Text>
              <TextInput
                style={styles.input}
                value={practiceTab.title}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, title: v }))}
                placeholder={t("practice.form.titlePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isSaving}
              />
            </View>

            {/* 場所 */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("practice.form.placeLabel")}</Text>
              <TextInput
                style={styles.input}
                value={practiceTab.place}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, place: v }))}
                placeholder={t("practice.form.placePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isSaving}
              />
            </View>

            {/* メモ */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("practice.modal.memo")}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={practiceTab.note}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, note: v }))}
                placeholder={t("practice.form.memoPlaceholder")}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isSaving}
              />
            </View>

            {/* 画像 */}
            <View style={styles.field}>
              {canUploadImage(isPremium) ? (
                <ImageUploader
                  existingImages={existingImages}
                  onImagesChange={handleImagesChange}
                  maxImages={3}
                  disabled={isSaving}
                  label={t("practice.form.imagesLabel")}
                />
              ) : (
                <PremiumBadge feature="image_upload" />
              )}
            </View>
          </View>
        )}

        {activeTab === "log" && (
          <View style={styles.form}>
            {/* メニューセクション */}
            <View style={styles.menuSection}>
              <View style={styles.menuHeader}>
                <Text style={styles.sectionTitle}>{t("practice.form.menuSection")}</Text>
              </View>

              {(() => {
                const menu = menus[activeMenuIndex];
                const index = activeMenuIndex;
                return (
                  <ItemTabs
                    count={menus.length}
                    activeIndex={activeMenuIndex}
                    onSelect={setActiveMenuIndex}
                    onAdd={addMenu}
                    onRemove={(i) => {
                      const target = menus[i];
                      if (target) removeMenu(target.id);
                    }}
                    label={(i) => t("practice.details.menuNumber", { n: i + 1 })}
                    accent="green"
                    disabled={isSaving}
                    testID="practicelog-item-tabs"
                  >
                    {menu != null && (
                      <View key={menu.id}>
                  {/* タグ */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>{t("practice.form.tagsLabel")}</Text>
                    <TagChips
                      tags={menu.tags}
                      onPress={() => openTagSelectModal(index)}
                      onRemove={(tagId) =>
                        updateMenu(menu.id, "tags", menu.tags.filter((tg) => tg.id !== tagId))
                      }
                    />
                  </View>

                  {/* 種目 */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>
                      {t("practice.form.styleLabel")} <Text style={styles.required}>*</Text>
                    </Text>
                    <View style={styles.pickerContainer}>
                      {SWIM_STYLES.map((style) => (
                        <Pressable
                          key={style.value}
                          style={[
                            styles.pickerOption,
                            menu.style === style.value && styles.pickerOptionSelected,
                          ]}
                          onPress={() => updateMenu(menu.id, "style", style.value)}
                          disabled={isSaving}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              menu.style === style.value && styles.pickerOptionTextSelected,
                            ]}
                          >
                            {t(`practice.styleAbbrev.${style.value}`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* 泳法カテゴリ */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>
                      {t("practice.form.categoryLabel")} <Text style={styles.required}>*</Text>
                    </Text>
                    <View style={styles.pickerContainer}>
                      {SWIM_CATEGORIES.map((category) => (
                        <Pressable
                          key={category.value}
                          style={[
                            styles.pickerOption,
                            menu.swimCategory === category.value && styles.pickerOptionSelected,
                          ]}
                          onPress={() =>
                            updateMenu(menu.id, "swimCategory", category.value)
                          }
                          disabled={isSaving}
                        >
                          <Text
                            style={[
                              styles.pickerOptionText,
                              menu.swimCategory === category.value &&
                                styles.pickerOptionTextSelected,
                            ]}
                          >
                            {category.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {/* 距離・本数・セット数 */}
                  <View style={styles.row}>
                    <View style={styles.fieldThird}>
                      <Text style={styles.label}>
                        {t("practice.form.distanceLabel")} <Text style={styles.required}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={menu.distance.toString()}
                        onChangeText={(text) => {
                          const num = text === "" ? "" : Number(text);
                          updateMenu(menu.id, "distance", num);
                        }}
                        placeholder="100"
                        keyboardType="numeric"
                        editable={!isSaving}
                      />
                    </View>
                    <View style={styles.fieldThird}>
                      <Text style={styles.label}>
                        {t("practice.form.repsLabel")} <Text style={styles.required}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={menu.reps.toString()}
                        onChangeText={(text) => {
                          const num = text === "" ? "" : Number(text);
                          updateMenu(menu.id, "reps", num);
                        }}
                        placeholder="4"
                        keyboardType="numeric"
                        editable={!isSaving}
                      />
                    </View>
                    <View style={styles.fieldThird}>
                      <Text style={styles.label}>
                        {t("practice.form.setsLabel")} <Text style={styles.required}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={menu.sets.toString()}
                        onChangeText={(text) => {
                          const num = text === "" ? "" : Number(text);
                          updateMenu(menu.id, "sets", num);
                        }}
                        placeholder="1"
                        keyboardType="numeric"
                        editable={!isSaving}
                      />
                    </View>
                  </View>

                  {/* サークル */}
                  <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>{t("practice.form.circleMinLabel")}</Text>
                      <TextInput
                        style={styles.input}
                        value={menu.circleMin.toString()}
                        onChangeText={(text) => {
                          const num = text === "" ? "" : Number(text);
                          updateMenu(menu.id, "circleMin", num);
                        }}
                        placeholder="1"
                        keyboardType="numeric"
                        editable={!isSaving}
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>{t("practice.form.circleSecLabel")}</Text>
                      <TextInput
                        style={styles.input}
                        value={menu.circleSec.toString()}
                        onChangeText={(text) => {
                          const num = text === "" ? "" : Number(text);
                          updateMenu(menu.id, "circleSec", num);
                        }}
                        placeholder="30"
                        keyboardType="numeric"
                        editable={!isSaving}
                      />
                    </View>
                  </View>

                  {/* タイム入力ボタン */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>{t("practice.details.timeLabel")}</Text>
                    <Pressable
                      style={styles.timeButton}
                      onPress={() => handleTimeInput(menu.id)}
                      disabled={isSaving}
                    >
                      <Feather name="clock" size={16} color="#374151" />
                      <Text style={styles.timeButtonText}>
                        {menu.times && menu.times.length > 0
                          ? t("practice.form.editTimes", { count: menu.times.length })
                          : t("practice.form.inputTimes")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* 既存タイム表示 */}
                  {menu.times && menu.times.length > 0 && (
                    <View style={styles.timesContainer}>
                      <Text style={styles.timesLabel}>{t("practice.form.registeredTimes")}</Text>
                      <View style={styles.timesTable}>
                        {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                          const setNumber = setIndex + 1;
                          const setTimes = menu.times.filter(
                            (ti) => ti.setNumber === setNumber && ti.time > 0,
                          );
                          const setFastest =
                            setTimes.length > 0 ? Math.min(...setTimes.map((ti) => ti.time)) : 0;
                          return (
                            <View key={setNumber} style={styles.setRow}>
                              <Text style={styles.setLabel}>
                                {t("practice.modal.setLabel", { n: setNumber })}
                              </Text>
                              <View style={styles.setTimes}>
                                {Array.from(
                                  { length: Number(menu.reps) || 1 },
                                  (__, repIndex) => {
                                    const repNumber = repIndex + 1;
                                    const time = menu.times.find(
                                      (ti) =>
                                        ti.setNumber === setNumber && ti.repNumber === repNumber,
                                    );
                                    const isFastest =
                                      time && time.time > 0 && time.time === setFastest;
                                    return (
                                      <View key={repNumber} style={styles.timeCell}>
                                        <Text style={styles.timeCellLabel}>
                                          {t("practice.modal.repLabel", { n: repNumber })}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.timeCellValue,
                                            isFastest && styles.timeCellValueFastest,
                                          ]}
                                        >
                                          {time && time.time > 0 ? formatTime(time.time) : "-"}
                                        </Text>
                                      </View>
                                    );
                                  },
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* メモ */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>{t("practice.modal.memo")}</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={menu.note}
                      onChangeText={(text) => updateMenu(menu.id, "note", text)}
                      placeholder={t("practice.form.memoPlaceholder")}
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      editable={!isSaving}
                    />
                  </View>

                  {/* 動画 */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>{t("practice.form.videoLabel")}</Text>
                    <VideoUploader
                      type="practice-log"
                      id={menu.existingLogId}
                      existingVideoPath={menu.existingLogId ? existingLogVideoPath : null}
                      existingThumbnailPath={
                        menu.existingLogId ? existingLogThumbnailPath : null
                      }
                      isPremium={isPremium}
                      onUploadComplete={(vPath, tPath) => {
                        setExistingLogVideoPath(vPath);
                        setExistingLogThumbnailPath(tPath);
                      }}
                      onDelete={() => {
                        setExistingLogVideoPath(null);
                        setExistingLogThumbnailPath(null);
                      }}
                      onPendingVideoAsset={(asset) => {
                        if (asset) {
                          pendingVideoAssetRef.current.set(menu.id, asset);
                        } else {
                          pendingVideoAssetRef.current.delete(menu.id);
                        }
                      }}
                    />
                  </View>
                    </View>
                  )}
                  </ItemTabs>
                );
              })()}
            </View>

            {/* タグ選択モーダル */}
            <TagSelectModal
              visible={showTagSelectModal}
              onClose={() => setShowTagSelectModal(false)}
              selectedTags={menus[activeMenuIndex]?.tags || []}
              availableTags={availableTags}
              onTagsChange={handleTagsChange}
              onCreateTag={openTagCreateModal}
              onEditTag={openTagEditModal}
              onDeleteTag={(tag) => handleDeleteTag(tag.id)}
            />

            {/* タグ管理モーダル */}
            <TagManageModal
              visible={showTagManageModal}
              onClose={() => {
                setShowTagManageModal(false);
                setTimeout(() => setShowTagSelectModal(true), 100);
              }}
              tag={editingTag}
              onSave={handleSaveTag}
              onDelete={handleDeleteTag}
            />
          </View>
        )}
      </ScrollView>

      {/* 保存ボタン (画面下部固定) */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, isSaving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{t("common.save")}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  form: {
    gap: 20,
  },
  field: {
    gap: 8,
  },
  menuField: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  required: {
    color: "#DC2626",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  fieldThird: {
    flex: 1,
    gap: 8,
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
    gap: 8,
    marginBottom: 16,
  },
  menuSection: {
    gap: 16,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  menuContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  menuItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  menuNumber: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  removeButton: {
    padding: 4,
  },
  pickerContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  pickerOptionSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  pickerOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  timeButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  timeButtonText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  timesContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  timesLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  timesTable: {
    gap: 12,
  },
  setRow: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  setLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  setTimes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeCell: {
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    padding: 8,
    minWidth: 80,
    alignItems: "center",
  },
  timeCellLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 4,
  },
  timeCellValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  timeCellValueFastest: {
    color: "#2563EB",
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    borderLeftWidth: 3,
    borderLeftColor: "#EF4444",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 4,
  },
  errorBannerText: {
    fontSize: 13,
    color: "#B91C1C",
  },
  footer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  saveButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
