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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation, usePreventRemove, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  usePracticeTagsQuery,
  useCreatePracticeTagMutation,
  useUpdatePracticeTagMutation,
  useDeletePracticeTagMutation,
} from "@apps/shared/hooks/queries/practices";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { useTeamMembersQuery } from "@apps/shared/hooks/queries/teams";
import { practiceKeys, teamKeys } from "@apps/shared/hooks/queries/keys";
import { PracticeAPI } from "@apps/shared/api/practices";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useIOSCalendarSync } from "@/hooks/useIOSCalendarSync";
import { useTagModalTransition } from "@/hooks/useTagModalTransition";
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
import {
  uploadImagesViaApi,
  deleteImagesViaApi,
  resolveGalleryImages,
  mergeImagePaths,
} from "@/utils/imageUpload";
import { uploadVideo } from "@/utils/videoUpload";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { formatTime, formatTimeAverage, SWIM_STYLES } from "@/utils/formatters";
import { hasUnsavedChanges, diffPracticeLogDraft, getTabNavAdjacency } from "@/utils/tabFormUtils";
import { usePracticeTimeStore } from "@/stores/practiceTimeStore";
import type { MainStackParamList } from "@/navigation/types";
import type { PracticeTag, PracticeWithLogs } from "@apps/shared/types";
import type { PracticeLogTemplate, CreatePracticeLogTemplateInput } from "@apps/shared/types/practiceLogTemplate";
import type { TimeEntry } from "@apps/shared/types/ui";

type PracticeTabFormRouteProp = RouteProp<MainStackParamList, "PracticeTabForm">;
type PracticeTabFormNavigationProp = NativeStackNavigationProp<MainStackParamList>;

type PracticeTab = "practice" | "log";

// タブ切替(前に戻る/次に進む)フッターボタン用の表示順序。ガード対象なし。
const PRACTICE_VISIBLE_TABS: PracticeTab[] = ["practice", "log"];

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
  const { supabase, user, subscription, getAccessToken } = useAuth();
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

  // ---- 練習の所有者・所属チーム (編集権限判定用) ----
  // CompetitionTabFormScreen の competitionOwnerId/competitionTeamId と同型。
  // route.params にチームIDは無いため、初期値は null (個人練習として扱う) とし、
  // 編集時の既存データ取得で practices.team_id (source of truth) を反映する。
  const [practiceOwnerId, setPracticeOwnerId] = useState<string | null>(null);
  const [practiceTeamId, setPracticeTeamId] = useState<string | null>(teamId ?? null);

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
  // 画像の source of truth は executeSave 内で保存直前に ID 直指定で再取得する。
  // 表示時点の値をここに保持して使い回すと、表示から保存までの間の変更を
  // 取りこぼすため state としては持たない。
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles);
    setDeletedImageIds(deletedIds);
  }, []);

  // ---- 練習ログタブ state ----
  const [menus, setMenus] = useState<PracticeMenu[]>([createDefaultMenu()]);
  const [showTagSelectModal, setShowTagSelectModal] = useState(false);
  const [activeMenuIndex, setActiveMenuIndex] = useState(0);
  // TagSelectModal ⇄ TagManageModal の遷移 (二重マウント競合の修正) は共通フックに集約。
  const {
    showTagManageModal,
    editingTag,
    openTagCreateModal,
    openTagEditModal,
    handleTagSelectModalClosed,
    handleTagManageModalClosed,
    closeTagManageModal,
  } = useTagModalTransition(setShowTagSelectModal);

  // ---- ローディング state ----
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- 二重送信防止 ----
  const isSubmittingRef = useRef(false);
  const initializedRef = useRef(false);

  // ---- iOSカレンダー同期用の読み込み済み練習行 ----
  // getTeamScopedPracticeById (ID 直指定) で取得した行を保持し、保存時の同期で使う。
  // ref なので保存処理からは常に最新値を読み、stale closure を起こさない。
  const loadedPracticeForSyncRef = useRef<PracticeWithLogs | null>(null);

  // ---- 保存完了フラグ (usePreventRemove 制御) ----
  // usePreventRemove(preventRemove, ...) の preventRemove は render のたびに評価される
  // ただの boolean のため、ref (isSavedRef.current 等) で持つと値を変えても再レンダーが
  // 起きず preventRemove が更新されない。state で持つことで変化が確実に再レンダーへ反映される。
  const [isSaved, setIsSaved] = useState(false);

  // ---- 保留動画の有無 (shouldPrevent 用のリアクティブなミラー) ----
  // pendingVideoAssetRef 自体は Map の実データ置き場として維持しつつ、
  // 件数が変わるたびにこの state も同期させることで shouldPrevent に反映させる。
  const [pendingVideoCount, setPendingVideoCount] = useState(0);

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

  // ---- 練習の編集権限判定 ----
  // practices UPDATE RLS (user_id = auth.uid() OR is_team_admin(team_id, auth.uid())) と
  // 同じ条件をクライアント側でも判定する。チーム練習でない場合は自分の練習なので常に true。
  // CompetitionTabFormScreen の canEditCompetitionDetails と同型。
  const { data: practiceTeamMembers, isLoading: isPracticeTeamMembersLoading } =
    useTeamMembersQuery(supabase, practiceTeamId ?? undefined);
  const isCurrentUserPracticeTeamAdmin = useMemo(() => {
    if (!user || !practiceTeamId || !practiceTeamMembers) return false;
    return practiceTeamMembers.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, practiceTeamId, practiceTeamMembers]);
  const canEditPracticeDetails = useMemo(() => {
    if (!isEditMode) return true; // 新規作成は常に自分の練習
    if (!practiceTeamId) return true; // 個人の練習は常に自分のもの
    if (user && practiceOwnerId === user.id) return true;
    return isCurrentUserPracticeTeamAdmin;
  }, [isEditMode, practiceTeamId, practiceOwnerId, user, isCurrentUserPracticeTeamAdmin]);
  // チーム練習の編集権限確定待ち (未確定のまま編集可能 UI を出さないためのローディングガード)
  const isResolvingPracticePermission =
    isEditMode && !!practiceTeamId && isPracticeTeamMembersLoading;

  // ---- 動画 (練習ログタブ) ----
  // メニューIDをキーに保留動画アセットを管理
  // 既存動画のパスはメニュー単位で menu.videoPath / menu.videoThumbnailPath に保持する (web と同じ構造)
  const pendingVideoAssetRef = useRef<Map<string, { uri: string; mimeType?: string }>>(new Map());
  // Map の件数を pendingVideoCount state に反映する (shouldPrevent 用)
  const syncPendingVideoCount = useCallback(() => {
    setPendingVideoCount(pendingVideoAssetRef.current.size);
  }, []);

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

  // ---- 既存データ初期化 ----
  useEffect(() => {
    if (initializedRef.current) return;

    // アンマウント後に setState しないためのガード。goBack() が実際に画面をスタックから
    // 取り除くまでの間に非同期処理が解決した場合の "setState on unmounted component"
    // 警告を防ぐ (CompetitionTabFormScreen の既存データ初期化 effect と同型)。
    let isMounted = true;

    if (isEditMode && resolvedPracticeId) {
      // 編集モード: getTeamScopedPracticeById (ID 直指定・practices SELECT RLS スコープ:
      // 所有者本人 OR チームメンバー) を唯一の取得元とする。
      // usePracticesQuery は「直近365日かつ自分の行」にスコープされた一覧専用のフックで、
      // 365日超の自分の練習ではヒットせず、その状態で保存すると title/place/note/
      // image_paths が空値のまま上書きされるデータ損失バグがあった。
      // getTeamScopedPracticeById は日付でも user_id でもスコープしないため、
      // 所有者本人に加え同じチームのメンバーであれば常に取得できる
      // (チーム管理者による代理編集を可能にするための変更。編集権限自体は
      // canEditPracticeDetails で別途判定する)。
      setLoadingExisting(true);
      const api = new PracticeAPI(supabase);
      api
        .getTeamScopedPracticeById(resolvedPracticeId)
        .then((practiceWithLogs) => {
          if (!isMounted) return;

          if (!practiceWithLogs) {
            // RLS スコープ外 (他ユーザー・他チームメンバーの練習ではない) または削除済み。
            // 既定値のまま編集可能にすると保存時に上書きが発生するため、
            // フォームを表示せず画面を離脱させる (CompetitionTabFormScreen と同型)。
            Alert.alert(t("common.error"), t("practice.mobile.notFound"), [{ text: "OK" }]);
            navigation.goBack();
            // 初期化に失敗しているため loadingExisting はここで解除しない。
            // navigation.goBack() が実際に画面を取り除くまでの間、ローディング表示を
            // 保ち続けることで保存ボタン自体を描画させず、保存を構造的に実行できなくする。
            return;
          }

          // 編集権限判定 (practices UPDATE RLS と同条件をクライアントでも反映する。
          // CompetitionTabFormScreen の competitionOwnerId/competitionTeamId と同型)。
          setPracticeOwnerId(practiceWithLogs.user_id);
          setPracticeTeamId(practiceWithLogs.team_id ?? null);
          // iOSカレンダー同期用に読み込んだ行を保持しておく (同一スコープの取得元を
          // 1本化する。usePracticesQuery の個人スコープ一覧に対する .find() だと
          // 365日超の練習や他メンバーのチーム練習で見つからず同期が黙ってスキップされる)
          loadedPracticeForSyncRef.current = practiceWithLogs;

          const practiceState: PracticeTabState = {
            date: practiceWithLogs.date,
            title: practiceWithLogs.title || "",
            place: practiceWithLogs.place || "",
            note: practiceWithLogs.note || "",
          };
          setPracticeTab(practiceState);
          // practice-images は private バケットのため署名付きURLを解決する（Issue #36）
          getAccessToken().then((accessToken) => {
            if (!isMounted) return;
            if (!accessToken) {
              setExistingImages([]);
              return;
            }
            resolveGalleryImages(
              "practice-images",
              practiceWithLogs.image_paths,
              accessToken,
            ).then((images) => {
              if (isMounted) setExistingImages(images);
            });
          });

          const logs = practiceWithLogs.practice_logs ?? [];
          if (logs.length === 0) {
            // ログなし: 空ドラフト1件
            const emptyMenus = [createDefaultMenu()];
            setMenus(emptyMenus);
            snapshotRef.current = { practice: practiceState, menus: emptyMenus };
            // 初期化成功。ここで初めて保存可能な状態にする。
            setLoadingExisting(false);
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
          // 初期化成功。ここで初めて保存可能な状態にする。
          setLoadingExisting(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          console.error("練習取得エラー:", err);
          // 唯一の取得元が失敗した場合、既定値のまま編集させると上書きにつながるため、
          // 上の getPracticeById が null を返す場合と同じ理由で画面を離脱させる。
          Alert.alert(t("common.error"), t("practice.mobile.fetchFailed"), [{ text: "OK" }]);
          navigation.goBack();
          // 上の notFound 分岐と同様、初期化失敗時は loadingExisting を解除しない
        })
        .finally(() => {
          initializedRef.current = true;
        });
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

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, resolvedPracticeId, supabase, getAccessToken, navigation, t]);

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

  // ---- 保存完了 → 前画面へ戻る ----
  // setIsSaved(true) の直後に navigation.goBack() を同期で呼ぶと、preventRemove=false を
  // 反映したレンダーが commit される前に REMOVE アクションが発行されてしまう。isSaved の
  // 変化で再レンダーが commit されるのを待ってからこの effect 経由で goBack() することで、
  // preventRemove=false が確定した状態で REMOVE を発行する。
  useEffect(() => {
    if (isSaved) {
      navigation.goBack();
    }
  }, [isSaved, navigation]);

  // ---- 破棄確認 ----
  // snapshotRef の更新は必ず対応する state 変更を伴わせること (伴わないと memo が再計算されず stale になる)
  const changedFromSnapshot = useMemo(() => {
    if (!snapshotRef.current) return false;
    return hasUnsavedChanges(
      { practice: practiceTab, menus },
      { practice: snapshotRef.current.practice, menus: snapshotRef.current.menus },
    );
  }, [practiceTab, menus]);
  const shouldPreventRemove = !isSaved && (changedFromSnapshot || pendingVideoCount > 0);

  usePreventRemove(shouldPreventRemove, ({ data }) => {
    Alert.alert(
      t("common.discardTitle"),
      t("common.discardMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.discard"),
          style: "destructive",
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

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
    if (isEditMode && !canEditPracticeDetails) {
      // 一般メンバーは他メンバーの練習を保存できない (practices UPDATE RLS と同条件)。
      // 保存ボタンの disabled に加えてここでも保存を構造的に実行できないようにする
      // (CompetitionTabFormScreen の canEditCompetitionDetails と同型のガード)。
      Alert.alert(t("common.error"), t("forms.tabModal.practiceEditRestricted"), [{ text: "OK" }]);
      return;
    }

    isSubmittingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    // アップロードした画像パス（保存失敗時のロールバック用。catch ブロックからも
    // 参照するため try の外で宣言する。RecordFormScreen.tsx と同型）
    let uploadedImagePaths: string[] = [];
    // catch ブロックからロールバックの API 呼び出しに使うため try の外で宣言する
    let accessToken: string | null = null;

    try {
      accessToken = await getAccessToken();
      if (!accessToken) {
        Alert.alert(t("common.error"), t("practice.mobile.sessionInvalid"), [{ text: "OK" }]);
        return;
      }

      let savedPracticeId = resolvedPracticeId;

      // --- 練習 INSERT or UPDATE ---
      if (isEditMode && savedPracticeId) {
        // 更新: 画像処理を含む
        // 画像を一切変更していない (追加も削除もない) 場合は、この後の再取得と
        // updates.image_paths への設定自体をスキップする。無条件に再取得すると、
        // 画像と無関係な title/place/note/date のみの編集までこの余分な
        // ラウンドトリップに巻き込まれ、失敗すると保存全体が中止されてしまう
        // (RecordFormScreen.tsx:533 の deletedImageIds/newImageFiles ゲート、
        // web PracticeTabModal.tsx:486-489 の hasImageChanges と同型)。
        const hasImageChanges = newImageFiles.length > 0 || deletedImageIds.length > 0;

        let newImagePaths: string[] = [];
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImagesViaApi(
            newImageFiles.map((f) => ({ base64: f.base64, fileExtension: f.fileExtension })),
            savedPracticeId,
            "practice-images",
            accessToken,
          );
          newImagePaths = uploadResults.map((r) => r.path);
          // アップロード直後にロールバック対象として記録する。この後の再取得や
          // update が失敗しても、ここまでにアップロード済みの画像は catch で削除する
          uploadedImagePaths = newImagePaths;
        }

        let updatedImagePaths: string[] = [];
        if (hasImageChanges) {
          // 保存直前に権威ある image_paths を ID 直指定で再取得する
          // (RecordFormScreen.tsx の #48 修正と同型)。画面表示時に読み込んだ値は
          // 表示から保存までの間に他の経路で画像が変わっている可能性があるため、
          // 保存の source of truth には使わない。取得に失敗した場合は「不明」を [] と
          // みなして全置換してはならないため、ここで throw して image_paths を含む
          // update を送らずに中断する。
          const { data: currentPractice, error: imagePathsError } = await supabase
            .from("practices")
            .select("image_paths")
            .eq("id", savedPracticeId)
            .single();

          if (imagePathsError || !currentPractice) {
            throw imagePathsError || new Error(t("practice.mobile.notFound"));
          }

          const authoritativeImagePaths =
            (currentPractice as { image_paths: string[] | null }).image_paths ?? [];

          // 権威ある生パスから削除分を除外し新規分を追加（mergeImagePaths 参照）
          updatedImagePaths = mergeImagePaths(
            authoritativeImagePaths,
            deletedImageIds,
            newImagePaths,
          );
        }

        const formData = {
          date: practiceTab.date,
          title: practiceTab.title.trim() || null,
          place: practiceTab.place.trim() || null,
          note: practiceTab.note.trim() || null,
          // 画像未変更時はキー自体を作らない (部分更新なので既存値がそのまま残る)。
          ...(hasImageChanges ? { image_paths: updatedImagePaths } : {}),
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
          const practiceForSync = loadedPracticeForSyncRef.current;
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
          // アップロード直後にロールバック対象として記録する
          uploadedImagePaths = imagePaths;
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
      // 保留動画のみが追加されたデフォルトログも「変更あり」として保存対象に含める
      const hasPendingVideo = menus.some((m) => pendingVideoAssetRef.current.has(m.id));
      const skipUntouchedDefaultLogs = !menusChanged && !snapshotHasExistingLogs && !hasPendingVideo;
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
            // 練習の所有者 (代理編集時は対象メンバー、通常は呼び出し元本人)。
            // このループは menu.existingLogId を持つメニューのみが対象 = 必ず編集モード。
            // 編集モードは初期化 (getTeamScopedPracticeById 成功) までローディング画面のまま
            // 保存ボタン自体が描画されないため、ここに到達する時点で practiceOwnerId は
            // 必ず非 null (setPracticeOwnerId は setLoadingExisting(false) と同じ then 内で
            // 呼ばれ、失敗時は goBack() のみで loadingExisting を解除しない)。
            // つまり `?? user?.id` はこの呼び出しに限れば型を合わせるためだけの防御的分岐で、
            // 現状の到達条件では発火しない。
            practiceOwnerId ?? user?.id,
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
          // user_id: 練習の所有者 (代理入力時は対象メンバー、通常は呼び出し元本人)。
          // 新規作成モード (practiceOwnerId が null のまま) では新しい practice 自体が
          // 常に呼び出し元を所有者として作成される (createPracticeMutation -> PracticeAPI
          // .createPractice が user_id: user.id を強制する。team_id を渡しても作成者は
          // 変わらない) ため、`?? user?.id` はここでは常に呼び出し元本人を指し、
          // 代理入力の所有者と衝突しない。既存練習に新規メニューを追加する場合
          // (管理者による代理入力の本題) は practiceOwnerId が対象メンバーの id で
          // 非 null のため、そちらが優先される。
          const logData = {
            practice_id: savedPracticeId,
            style: menu.style,
            swim_category: menu.swimCategory,
            distance: Number(menu.distance) || 100,
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
            circle: circleTime > 0 ? circleTime : null,
            note: menu.note.trim() || null,
            user_id: practiceOwnerId ?? user?.id,
          };
          const createdLog = await createLogMutation.mutateAsync(logData);
          await api.replacePracticeTimes(
            createdLog.id,
            menu.times.map((ti) => ({
              set_number: ti.setNumber,
              rep_number: ti.repNumber,
              time: ti.time,
            })),
            practiceOwnerId ?? user?.id,
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
              const errorDetail = toUserFacingMessage(err, t("common.error"));
              Alert.alert(
                t("practice.mobile.videoUploadFailedTitle"),
                `${t("practice.mobile.videoUploadFailedSaved")}\n\n${errorDetail}`,
              );
            }
            pendingVideoAssetRef.current.delete(menu.id);
            syncPendingVideoCount();
          }
        }
      }

      // クエリ無効化
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() });
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });
      }

      // navigation.goBack() はここで直接呼ばず、isSaved を state 化してレンダーを
      // 経由させる (usePreventRemove が preventRemove=false を読んだ後に goBack() する)
      setIsSaved(true);
    } catch (error) {
      console.error("保存エラー:", error);
      // 保存失敗時はアップロードした画像をロールバック（Web API 経由。R2 に孤児オブジェクトを残さない）
      if (uploadedImagePaths.length > 0 && accessToken) {
        try {
          await deleteImagesViaApi(uploadedImagePaths, "practice-images", accessToken);
        } catch (rollbackError) {
          console.error("画像ロールバックエラー:", rollbackError);
        }
      }
      const msg = toUserFacingMessage(error, t("practice.mobile.saveFailed"));
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
    canEditPracticeDetails,
    practiceOwnerId,
    user,
    practiceTab,
    newImageFiles,
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
    syncPractice,
    syncPendingVideoCount,
    t,
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
        toUserFacingMessage(error, t("practice.mobile.saveFailed")),
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

  const removeMenu = useCallback(
    (id: string) => {
      // setMenus の updater は純粋に保つ。ref の mutation と非 React state の同期は
      // updater の外で行うが、実行するかどうかの判定は updater 内の
      // `prev.length <= 1` チェックのみを唯一の権威とする。render スコープの
      // menus.length (クロージャ固定値) で判定すると、同一 tick 内で連続削除された
      // 場合に古いクロージャの判定が権威と乖離し、行は残るのに保留動画だけ消える
      // データロスが起きうる。
      let didRemove = false;
      setMenus((prev) => {
        if (prev.length <= 1) return prev;
        didRemove = true;
        const removedIndex = prev.findIndex((m) => m.id === id);
        const next = prev.filter((m) => m.id !== id);
        setActiveMenuIndex((cur) => {
          const newLen = next.length;
          if (cur >= newLen) return newLen - 1;
          if (cur > removedIndex) return cur - 1;
          return cur;
        });
        return next;
      });
      if (didRemove) {
        pendingVideoAssetRef.current.delete(id);
        syncPendingVideoCount();
      }
    },
    [syncPendingVideoCount],
  );

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

  // ---- フッターボタン用の前後タブ (ガードなし) ----
  const { prevTab, nextTab } = useMemo(
    () => getTabNavAdjacency<PracticeTab>(PRACTICE_VISIBLE_TABS, activeTab),
    [activeTab],
  );

  // ---- ローディング ----
  if (loadingExisting || isResolvingPracticePermission) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loading")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            {/* 編集権限なし (チーム練習の非管理者かつ非作成者) の場合は読み取り専用にする */}
            {!canEditPracticeDetails && (
              <View style={styles.guardMessage}>
                <Text style={styles.guardMessageText}>
                  {t("forms.tabModal.practiceEditRestricted")}
                </Text>
              </View>
            )}

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
                disabled={isSaving || !canEditPracticeDetails}
                error={practiceErrors.date}
                placeholder={t("practice.form.datePlaceholder")}
              />
            </View>

            {/* タイトル */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("practice.form.titleLabel")}</Text>
              <TextInput
                style={[styles.input, !canEditPracticeDetails && styles.inputDisabled]}
                value={practiceTab.title}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, title: v }))}
                placeholder={t("practice.form.titlePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isSaving && canEditPracticeDetails}
              />
            </View>

            {/* 場所 */}
            <View style={styles.field}>
              <Text style={styles.label}>{t("practice.form.placeLabel")}</Text>
              <TextInput
                style={[styles.input, !canEditPracticeDetails && styles.inputDisabled]}
                value={practiceTab.place}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, place: v }))}
                onFocus={() => setPlaceFocused(true)}
                onBlur={() => setPlaceFocused(false)}
                placeholder={t("practice.form.placePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isSaving && canEditPracticeDetails}
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
                style={[
                  styles.input,
                  styles.textArea,
                  !canEditPracticeDetails && styles.inputDisabled,
                ]}
                value={practiceTab.note}
                onChangeText={(v) => setPracticeTab((prev) => ({ ...prev, note: v }))}
                placeholder={t("practice.form.memoPlaceholder")}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isSaving && canEditPracticeDetails}
              />
            </View>

            {/* 画像 */}
            <View style={styles.field}>
              {canUploadImage(isPremium) ? (
                <ImageUploader
                  existingImages={existingImages}
                  onImagesChange={handleImagesChange}
                  maxImages={3}
                  disabled={isSaving || !canEditPracticeDetails}
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
            {/* 編集権限なし (チーム練習の非管理者かつ非作成者) の場合は読み取り専用にする。
                練習タブと同じバナーをタブ切替後も表示し続ける (タブ切替でメッセージが
                消えると、なぜ入力できないか分からなくなるため)。 */}
            {!canEditPracticeDetails && (
              <View style={styles.guardMessage}>
                <Text style={styles.guardMessageText}>
                  {t("forms.tabModal.practiceEditRestricted")}
                </Text>
              </View>
            )}

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
                    onAdd={canEditPracticeDetails ? addMenu : undefined}
                    onRemove={
                      canEditPracticeDetails
                        ? (i) => {
                            const target = menus[i];
                            if (target) removeMenu(target.id);
                          }
                        : undefined
                    }
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
                        disabled={isSaving || !canEditPracticeDetails}
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
                      disabled={isSaving || !canEditPracticeDetails}
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
                          disabled={isSaving || !canEditPracticeDetails}
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
                          disabled={isSaving || !canEditPracticeDetails}
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
                      disabled={isSaving || !canEditPracticeDetails}
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
                        disabled={isSaving || !canEditPracticeDetails}
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
                        disabled={isSaving || !canEditPracticeDetails}
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
                        disabled={isSaving || !canEditPracticeDetails}
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
                        disabled={isSaving || !canEditPracticeDetails}
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
                      disabled={isSaving || !canEditPracticeDetails}
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
                      style={[
                        styles.input,
                        styles.textArea,
                        !canEditPracticeDetails && styles.inputDisabled,
                      ]}
                      value={menu.note}
                      onChangeText={(text) => updateMenu(menu.id, "note", text)}
                      placeholder={t("practice.form.memoPlaceholder")}
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                      editable={!isSaving && canEditPracticeDetails}
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
                      disabled={isSaving || !canEditPracticeDetails}
                      onUploadComplete={(vPath, tPath) => {
                        // VideoUploader 側の disabled でボタン自体は非表示だが、id 付与後の
                        // 保留動画自動アップロード effect は disabled を見ないため、
                        // 二重防御として menus state への反映もここで止める。
                        if (!canEditPracticeDetails) return;
                        setMenus((prev) =>
                          prev.map((m) =>
                            m.id === menu.id
                              ? { ...m, videoPath: vPath, videoThumbnailPath: tPath }
                              : m,
                          ),
                        );
                      }}
                      onDelete={() => {
                        if (!canEditPracticeDetails) return;
                        setMenus((prev) =>
                          prev.map((m) =>
                            m.id === menu.id
                              ? { ...m, videoPath: null, videoThumbnailPath: null }
                              : m,
                          ),
                        );
                      }}
                      onPendingVideoAsset={(asset) => {
                        if (!canEditPracticeDetails) return;
                        if (asset) {
                          pendingVideoAssetRef.current.set(menu.id, asset);
                        } else {
                          pendingVideoAssetRef.current.delete(menu.id);
                        }
                        syncPendingVideoCount();
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
              onClosed={handleTagSelectModalClosed}
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
              onClose={closeTagManageModal}
              onClosed={handleTagManageModalClosed}
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
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
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
        <View style={styles.footerButtonRow}>
          {prevTab && (
            <Pressable
              style={[styles.outlineButton, isSaving && styles.buttonDisabled]}
              onPress={() => setActiveTab(prevTab)}
              disabled={isSaving}
              testID="practice-tab-form-back"
            >
              <Text
                style={styles.outlineButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t("forms.tabModal.back")}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[
              nextTab ? styles.outlineButton : styles.saveButton,
              (isSaving || !canEditPracticeDetails) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving || !canEditPracticeDetails}
            testID="practice-tab-form-save"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={nextTab ? "#2563EB" : "#FFFFFF"} />
            ) : (
              <Text
                style={nextTab ? styles.outlineButtonText : styles.saveButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t("forms.tabModal.saveAndClose")}
              </Text>
            )}
          </Pressable>
          {nextTab && (
            <Pressable
              style={[styles.saveButton, isSaving && styles.buttonDisabled]}
              onPress={() => setActiveTab(nextTab)}
              disabled={isSaving}
              testID="practice-tab-form-next"
            >
              <Text
                style={styles.saveButtonText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {t("forms.tabModal.next")}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
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
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  guardMessage: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 16,
    marginBottom: 8,
  },
  guardMessageText: {
    fontSize: 14,
    color: "#92400E",
    textAlign: "center",
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
  footerButtonRow: {
    flexDirection: "row",
    gap: 12,
  },
  saveButton: {
    flex: 1,
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
  outlineButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
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
