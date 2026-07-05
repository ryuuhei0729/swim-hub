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
  Modal,
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
import { NumberStepper } from "@/components/ui/NumberStepper";
import { TagChips, TagSelectModal, TagManageModal, VideoUploader } from "@/components/shared";
import { FormTabBar, FormTab } from "@/components/forms/FormTabBar";
import { ItemTabs } from "@/components/forms/ItemTabs";
import { DistanceChips } from "@/components/practices/DistanceChips";
import { PracticeLogTemplateSelectModal } from "@/components/practices/PracticeLogTemplateSelectModal";
import { useCreatePracticeLogTemplateMutation } from "@apps/shared/hooks/queries/practiceLogTemplates";
import { uploadImagesViaApi, deleteImagesViaApi, resolveGalleryImages } from "@/utils/imageUpload";
import { uploadVideo } from "@/utils/videoUpload";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { formatTime, formatTimeAverage, SWIM_STYLES } from "@/utils/formatters";
import { hasUnsavedChanges, diffPracticeLogDraft } from "@/utils/tabFormUtils";
import { usePracticeTimeStore } from "@/stores/practiceTimeStore";
import type { MainStackParamList } from "@/navigation/types";
import type { PracticeTag } from "@apps/shared/types";
import type { PracticeLogTemplate, CreatePracticeLogTemplateInput } from "@apps/shared/types/practiceLogTemplate";
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
  /** 既存ログの動画パス (メニュー単位。web PracticeMenu と同じ構造) */
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
}

/**
 * 新規メニューのデフォルト値 (web usePracticeLogForm.createDefaultMenu と同一: 100m×4本×1セット サークル1:30)。
 * 未編集のままなら保存時にスキップされる (opt-in)。
 */
function createDefaultMenu(): PracticeMenu {
  return {
    id: `menu-${Date.now()}-${Math.random()}`,
    style: "Fr",
    swimCategory: "Swim",
    distance: 100,
    reps: 4,
    sets: 1,
    circleMin: 1,
    circleSec: 30,
    note: "",
    tags: [],
    times: [],
    videoPath: null,
    videoThumbnailPath: null,
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
  const [menus, setMenus] = useState<PracticeMenu[]>([createDefaultMenu()]);
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
  // 既存動画のパスはメニュー単位で menu.videoPath / menu.videoThumbnailPath に保持する (web と同じ構造)
  const pendingVideoAssetRef = useRef<Map<string, { uri: string; mimeType?: string }>>(new Map());

  // ---- テンプレート ----
  const [showTemplateSelectModal, setShowTemplateSelectModal] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const createTemplateMutation = useCreatePracticeLogTemplateMutation(supabase);

  // ---- 場所サジェスト ----
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([]);
  const [placeFocused, setPlaceFocused] = useState(false);
  useEffect(() => {
    const api = new PracticeAPI(supabase);
    api.getUniquePlaces().then(setPlaceSuggestions).catch(() => {});
  }, [supabase]);

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
        // practice-images は private バケットのため署名付きURLを解決する（Issue #36）
        getAccessToken().then((accessToken) => {
          if (!accessToken) return;
          resolveGalleryImages("practice-images", practice.image_paths, accessToken).then(
            setExistingImages,
          );
        });

        // 既存の練習ログを fetch して menus を初期化 (C-4: getPracticeById で一括取得)
        const api = new PracticeAPI(supabase);
        api
          .getPracticeById(resolvedPracticeId)
          .then((practiceWithLogs) => {
            const logs = practiceWithLogs?.practice_logs ?? [];
            if (logs.length === 0) {
              // ログなし: 空ドラフト1件
              const emptyMenus = [createDefaultMenu()];
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
                // 動画パスはメニュー単位で保持 (編集時に既存動画を表示するため)
                videoPath: log.video_path ?? null,
                videoThumbnailPath: log.video_thumbnail_path ?? null,
              } satisfies PracticeMenu;
            });

            setMenus(detailedMenus);
            // スナップショットは実際の既存ログで初期化(破棄警告の誤検知を防ぐ)
            snapshotRef.current = { practice: practiceState, menus: detailedMenus };
          })
          .catch((err) => {
            console.error("練習ログ取得エラー:", err);
            // fetch 失敗時は空ドラフトにフォールバック
            const emptyMenus = [createDefaultMenu()];
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
      const emptyMenus = [createDefaultMenu()];
      setPracticeTab(initPractice);
      setMenus(emptyMenus);
      initializedRef.current = true;
      setLoadingExisting(false);

      // スナップショット記録
      snapshotRef.current = { practice: initPractice, menus: emptyMenus };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, resolvedPracticeId, loadingPractices, practices, supabase, getAccessToken]);

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

  // ---- 全タブ横断バリデーション ----
  // 練習ログタブは web と同じく部分入力でもブロックしない
  // (保存時に距離→100 / 本数→1 / セット→1 へフォールバックする)
  const validateAll = useCallback((): boolean => {
    const practiceValid = validatePracticeTab();

    const errors: Partial<Record<PracticeTab, boolean>> = {};
    if (!practiceValid) errors.practice = true;
    setTabErrors(errors);

    if (!practiceValid) {
      setActiveTab("practice");
      return false;
    }
    return true;
  }, [validatePracticeTab]);

  // ---- 保存ハンドラ ----
  const executeSave = useCallback(async () => {
    if (isSubmittingRef.current) return;

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
      // 練習ログは opt-in (web と同じ): 既存ログが無く、メニューがスナップショット (デフォルト値)
      // から一切変更されていない場合は、デフォルトメニュー (100m×4本) を保存しない。
      const snapshotMenus = snapshotRef.current?.menus ?? [];
      const menusChanged = JSON.stringify(menus) !== JSON.stringify(snapshotMenus);
      const snapshotHasExistingLogs = snapshotMenus.some((m) => m.existingLogId);
      const skipUntouchedDefaultLogs = !menusChanged && !snapshotHasExistingLogs;
      const validMenus = skipUntouchedDefaultLogs ? [] : menus;

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
          // 空・不正値は web と同じフォールバック (距離100 / 本数1 / セット1)
          const logData = {
            practice_id: savedPracticeId,
            style: menu.style,
            swim_category: menu.swimCategory,
            distance: Number(menu.distance) || 100,
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
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
          // 空・不正値は web と同じフォールバック (距離100 / 本数1 / セット1)
          const logData = {
            practice_id: savedPracticeId,
            style: menu.style,
            swim_category: menu.swimCategory,
            distance: Number(menu.distance) || 100,
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
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

  // ---- 保存ハンドラ ----
  const handleSave = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!validateAll()) return;

    // 「テンプレートとして保存する」チェック時は名前入力モーダルを先に表示 (web と同じ)
    if (saveAsTemplate) {
      setShowTemplateSaveModal(true);
      return;
    }

    await executeSave();
  }, [validateAll, saveAsTemplate, executeSave]);

  // ---- テンプレート保存 (名前入力モーダルの保存ボタン) ----
  const handleTemplateSave = useCallback(async () => {
    if (!templateName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const firstMenu = menus[0];
      if (!firstMenu) return;
      const circleTime =
        (Number(firstMenu.circleMin) || 0) * 60 + (Number(firstMenu.circleSec) || 0);
      const input: CreatePracticeLogTemplateInput = {
        name: templateName.trim(),
        style: firstMenu.style,
        swim_category: firstMenu.swimCategory,
        distance: Number(firstMenu.distance) || 0,
        rep_count: Number(firstMenu.reps) || 1,
        set_count: Number(firstMenu.sets) || 1,
        circle: circleTime > 0 ? circleTime : null,
        note: firstMenu.note || null,
        tag_ids: firstMenu.tags.map((tag) => tag.id),
      };
      await createTemplateMutation.mutateAsync(input);
      setShowTemplateSaveModal(false);
      setTemplateName("");
      setSaveAsTemplate(false);

      await executeSave();
    } catch (error) {
      console.error("テンプレート保存エラー:", error);
      Alert.alert(
        t("common.error"),
        error instanceof Error ? error.message : t("practice.mobile.saveFailed"),
      );
    } finally {
      setIsSavingTemplate(false);
    }
  }, [templateName, menus, createTemplateMutation, executeSave, t]);

  // ---- テンプレートから作成 (web handleTemplateSelect と同じ: メニューをテンプレート1件で置き換え) ----
  const handleTemplateSelect = useCallback(
    (template: PracticeLogTemplate) => {
      const circleTime = template.circle || 0;
      const templateTags = template.tag_ids
        ? availableTags.filter((tag) => template.tag_ids.includes(tag.id))
        : [];
      const templateMenu: PracticeMenu = {
        id: `menu-${Date.now()}-${Math.random()}`,
        style: template.style,
        swimCategory: template.swim_category,
        distance: template.distance,
        reps: template.rep_count,
        sets: template.set_count,
        circleMin: Math.floor(circleTime / 60),
        circleSec: circleTime % 60,
        note: template.note || "",
        tags: templateTags,
        times: [],
        videoPath: null,
        videoThumbnailPath: null,
      };
      setMenus([templateMenu]);
      setActiveMenuIndex(0);
    },
    [availableTags],
  );

  // ---- メニュー操作 ----
  const addMenu = useCallback(() => {
    setMenus((prev) => {
      const next = [...prev, createDefaultMenu()];
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
                onFocus={() => setPlaceFocused(true)}
                onBlur={() => setPlaceFocused(false)}
                placeholder={t("practice.form.placePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isSaving}
              />
              {/* 過去に使った場所のサジェスト (web PlaceCombobox 相当) */}
              {placeFocused &&
                (() => {
                  const query = practiceTab.place.trim().toLowerCase();
                  const filtered = placeSuggestions
                    .filter(
                      (p) =>
                        p.toLowerCase() !== query &&
                        (query === "" || p.toLowerCase().includes(query)),
                    )
                    .slice(0, 5);
                  if (filtered.length === 0) return null;
                  return (
                    <View style={styles.placeSuggestions}>
                      {filtered.map((p) => (
                        <Pressable
                          key={p}
                          style={styles.placeSuggestionItem}
                          onPress={() => {
                            setPracticeTab((prev) => ({ ...prev, place: p }));
                            setPlaceFocused(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={p}
                        >
                          <Feather name="map-pin" size={13} color="#6B7280" />
                          <Text style={styles.placeSuggestionText} numberOfLines={1}>
                            {p}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })()}
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
                  {/* タグ + テンプレートから作成 */}
                  <View style={styles.menuField}>
                    <View style={styles.tagRowHeader}>
                      <Text style={styles.label}>{t("practice.form.tagsLabel")}</Text>
                      <Pressable
                        style={styles.templateButton}
                        onPress={() => setShowTemplateSelectModal(true)}
                        disabled={isSaving}
                        accessibilityRole="button"
                      >
                        <Feather name="clipboard" size={14} color="#374151" />
                        <Text style={styles.templateButtonText}>
                          {t("forms.practiceLog.templateFromLong")}
                        </Text>
                      </Pressable>
                    </View>
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

                  {/* 距離 (プリセットチップ + その他で直接入力) */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>
                      {t("practice.form.distanceLabel")} <Text style={styles.required}>*</Text>
                    </Text>
                    <DistanceChips
                      value={menu.distance}
                      onChange={(v) => updateMenu(menu.id, "distance", v)}
                      disabled={isSaving}
                      testID="practice-distance"
                    />
                  </View>

                  {/* 本数・セット数 (ステッパー) */}
                  <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>
                        {t("practice.form.repsLabel")} <Text style={styles.required}>*</Text>
                      </Text>
                      <NumberStepper
                        value={menu.reps}
                        onChange={(v) => updateMenu(menu.id, "reps", v)}
                        min={1}
                        step={1}
                        placeholder="4"
                        disabled={isSaving}
                        accessibilityLabel={t("practice.form.repsLabel")}
                        testID="practice-rep-count"
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>
                        {t("practice.form.setsLabel")} <Text style={styles.required}>*</Text>
                      </Text>
                      <NumberStepper
                        value={menu.sets}
                        onChange={(v) => updateMenu(menu.id, "sets", v)}
                        min={1}
                        step={1}
                        placeholder="1"
                        disabled={isSaving}
                        accessibilityLabel={t("practice.form.setsLabel")}
                        testID="practice-set-count"
                      />
                    </View>
                  </View>

                  {/* サークル (分: step1 / 秒: step10, max59) */}
                  <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>{t("practice.form.circleMinLabel")}</Text>
                      <NumberStepper
                        value={menu.circleMin}
                        onChange={(v) => updateMenu(menu.id, "circleMin", v)}
                        min={0}
                        step={1}
                        placeholder="1"
                        disabled={isSaving}
                        accessibilityLabel={t("practice.form.circleMinLabel")}
                        testID="practice-circle-min"
                      />
                    </View>
                    <View style={styles.fieldHalf}>
                      <Text style={styles.label}>{t("practice.form.circleSecLabel")}</Text>
                      <NumberStepper
                        value={menu.circleSec}
                        onChange={(v) => updateMenu(menu.id, "circleSec", v)}
                        min={0}
                        max={59}
                        step={10}
                        placeholder="30"
                        disabled={isSaving}
                        accessibilityLabel={t("practice.form.circleSecLabel")}
                        testID="practice-circle-sec"
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
                          const setAverage =
                            setTimes.length > 0
                              ? setTimes.reduce((sum, ti) => sum + ti.time, 0) / setTimes.length
                              : 0;
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
                              {/* セット平均 (web の平均行に相当) */}
                              <View style={styles.setAvgRow}>
                                <Text style={styles.setAvgLabel}>
                                  {t("forms.practiceMenu.avgRow")}
                                </Text>
                                <Text style={styles.setAvgValue}>
                                  {setAverage > 0 ? formatTimeAverage(setAverage) : "-"}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                        {/* 全体平均・全体最速 (web と同じサマリー行) */}
                        {(() => {
                          const allValidTimes = menu.times.filter((ti) => ti.time > 0);
                          const overallAverage =
                            allValidTimes.length > 0
                              ? allValidTimes.reduce((sum, ti) => sum + ti.time, 0) /
                                allValidTimes.length
                              : 0;
                          const overallFastest =
                            allValidTimes.length > 0
                              ? Math.min(...allValidTimes.map((ti) => ti.time))
                              : 0;
                          return (
                            <View style={styles.overallSummary}>
                              <View style={styles.overallRow}>
                                <Text style={styles.overallLabel}>
                                  {t("forms.practiceMenu.overallAvg")}
                                </Text>
                                <Text style={styles.overallValue}>
                                  {overallAverage > 0 ? formatTimeAverage(overallAverage) : "-"}
                                </Text>
                              </View>
                              <View style={styles.overallRow}>
                                <Text style={styles.overallLabel}>
                                  {t("forms.practiceMenu.overallFastest")}
                                </Text>
                                <Text style={styles.overallValue}>
                                  {overallFastest > 0 ? formatTime(overallFastest) : "-"}
                                </Text>
                              </View>
                            </View>
                          );
                        })()}
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

                  {/* 動画 (メニュー単位で既存動画パスを保持。web と同じ構造) */}
                  <View style={styles.menuField}>
                    <Text style={styles.label}>{t("practice.form.videoLabel")}</Text>
                    <VideoUploader
                      type="practice-log"
                      id={menu.existingLogId}
                      existingVideoPath={menu.videoPath ?? null}
                      existingThumbnailPath={menu.videoThumbnailPath ?? null}
                      isPremium={isPremium}
                      onUploadComplete={(vPath, tPath) => {
                        setMenus((prev) =>
                          prev.map((m) =>
                            m.id === menu.id
                              ? { ...m, videoPath: vPath, videoThumbnailPath: tPath }
                              : m,
                          ),
                        );
                      }}
                      onDelete={() => {
                        setMenus((prev) =>
                          prev.map((m) =>
                            m.id === menu.id
                              ? { ...m, videoPath: null, videoThumbnailPath: null }
                              : m,
                          ),
                        );
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

      {/* テンプレート選択モーダル */}
      <PracticeLogTemplateSelectModal
        visible={showTemplateSelectModal}
        onClose={() => setShowTemplateSelectModal(false)}
        onSelect={handleTemplateSelect}
        onManage={() => {
          setShowTemplateSelectModal(false);
          navigation.navigate("PracticeLogTemplates");
        }}
      />

      {/* テンプレート名入力モーダル (テンプレートとして保存) */}
      <Modal
        visible={showTemplateSaveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTemplateSaveModal(false)}
      >
        <View style={styles.templateModalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowTemplateSaveModal(false)}
          />
          <View style={styles.templateModal}>
            <Text style={styles.templateModalTitle}>
              {t("forms.practiceLog.templateSaveTitle")}
            </Text>
            <Text style={styles.label}>{t("forms.practiceLog.templateNameLabel")}</Text>
            <TextInput
              style={styles.input}
              value={templateName}
              onChangeText={setTemplateName}
              placeholder={t("forms.practiceLog.templateNamePlaceholder")}
              placeholderTextColor="#9CA3AF"
              autoFocus
              editable={!isSavingTemplate}
            />
            <View style={styles.templateModalActions}>
              <Pressable
                style={styles.templateModalCancel}
                onPress={() => setShowTemplateSaveModal(false)}
                disabled={isSavingTemplate}
              >
                <Text style={styles.templateModalCancelText}>
                  {t("forms.practiceLog.cancel")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.templateModalSave,
                  (!templateName.trim() || isSavingTemplate) && styles.buttonDisabled,
                ]}
                onPress={() => void handleTemplateSave()}
                disabled={!templateName.trim() || isSavingTemplate}
              >
                {isSavingTemplate ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.templateModalSaveText}>
                    {t("forms.practiceLog.save")}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 保存ボタン (画面下部固定) */}
      <View style={styles.footer}>
        {/* テンプレートとして保存 (新規作成時のみ。web と同じ) */}
        {!isEditMode && activeTab === "log" && (
          <Pressable
            style={styles.templateCheckboxRow}
            onPress={() => setSaveAsTemplate((prev) => !prev)}
            disabled={isSaving}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: saveAsTemplate }}
          >
            <View style={[styles.checkbox, saveAsTemplate && styles.checkboxChecked]}>
              {saveAsTemplate && <Feather name="check" size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.templateCheckboxLabel}>
              {t("forms.practiceLog.saveAsTemplate")}
            </Text>
          </Pressable>
        )}
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

  // 場所サジェスト
  placeSuggestions: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  placeSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  placeSuggestionText: {
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },

  // タグ行 (テンプレートボタン付き)
  tagRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  templateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  templateButtonText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },

  // セット平均・全体サマリー
  setAvgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  setAvgLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  setAvgValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  overallSummary: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overallLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E40AF",
  },
  overallValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E40AF",
  },

  // テンプレート保存チェックボックス
  templateCheckboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  templateCheckboxLabel: {
    fontSize: 14,
    color: "#374151",
  },

  // テンプレート名入力モーダル
  templateModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  templateModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    maxWidth: 400,
    gap: 8,
  },
  templateModalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  templateModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 12,
  },
  templateModalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  templateModalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  templateModalSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  templateModalSaveText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
