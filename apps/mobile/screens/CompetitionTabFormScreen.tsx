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
  Keyboard,
  Dimensions,
  Switch,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, parseISO, isValid, isBefore } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useReplaceSplitTimesMutation,
} from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { EntryAPI } from "@apps/shared/api/entries";
import { RecordAPI } from "@apps/shared/api/records";
import { StyleAPI } from "@apps/shared/api/styles";
import { useIOSCalendarSync } from "@/hooks/useIOSCalendarSync";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ImageUploader, ImageFile, ExistingImage } from "@/components/shared/ImageUploader";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { VideoUploader } from "@/components/shared/VideoUploader";
import { FormTabBar, FormTab } from "@/components/forms/FormTabBar";
import { ItemTabs } from "@/components/forms/ItemTabs";
import { uploadImagesViaApi, deleteImages, getExistingImagesFromPaths } from "@/utils/imageUpload";
import { uploadVideo } from "@/utils/videoUpload";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { formatTime } from "@/utils/formatters";
import { localizedStyleName } from "@/utils/styleName";
import { parseTime } from "@apps/shared/utils/time";
import { hasUnsavedChanges, isEntryTabVisible, diffRecordDraft } from "@/utils/tabFormUtils";
import { resolveEntryMutations } from "@/utils/entryMutations";
import type { ResolveExistingEntry, ResolveFormEntry } from "@/utils/entryMutations";
import { useQuickTimeInput } from "@/hooks/useQuickTimeInput";
import type { MainStackParamList } from "@/navigation/types";
import type { Style, PoolType, RecordInsert } from "@apps/shared/types";

type CompetitionTabFormRouteProp = RouteProp<MainStackParamList, "CompetitionTabForm">;
type CompetitionTabFormNavigationProp = NativeStackNavigationProp<MainStackParamList>;

type CompetitionTab = "competition" | "entry" | "record";

// ---- プール種別 ----
type PoolTypeOption = { value: number; labelKey: string };
const POOL_TYPES: PoolTypeOption[] = [
  { value: 0, labelKey: "competition.form.poolTypeShort" },
  { value: 1, labelKey: "competition.form.poolTypeLong" },
];

// ---- エントリー行 ----
interface EntryDraftRow {
  /** ドラフトローカルID */
  draftId: string;
  /** 既存DBエントリーID (編集時) */
  existingEntryId?: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
}

// ---- スプリットタイム ----
interface SplitTimeData {
  distance: number | string;
  splitTime: number;
  splitTimeDisplayValue: string;
}

// ---- レースレコード行 ----
interface RecordDraftRow {
  /** ドラフトローカルID */
  draftId: string;
  /** 既存DBレコードID (編集時) */
  existingRecordId?: string;
  styleId: string;
  time: number;
  timeDisplayValue: string;
  isRelaying: boolean;
  splitTimes: SplitTimeData[];
  note: string;
  reactionTime: string;
}

function createEmptyEntry(): EntryDraftRow {
  return {
    draftId: `entry-${Date.now()}-${Math.random()}`,
    styleId: "",
    entryTime: 0,
    entryTimeDisplayValue: "",
    note: "",
  };
}

function createEmptyRecord(): RecordDraftRow {
  return {
    draftId: `record-${Date.now()}-${Math.random()}`,
    styleId: "",
    time: 0,
    timeDisplayValue: "",
    isRelaying: false,
    splitTimes: [],
    note: "",
    reactionTime: "",
  };
}

/**
 * 大会タブ統合フォーム画面（個人フロー）
 *
 * 3タブ構成: 「大会」「エントリー」「レースレコード」
 * - エントリータブは大会日付が未来のときのみ表示
 * - 新規作成: 全タブを自由入力 → 画面下部「保存」で一括コミット
 * - 編集: 親が既存 ID を持つ。子の差分計算を resolveEntryMutations で実施
 * - 保存の原子性: 親INSERT成功後に子INSERT失敗 → 編集モードへ遷移してエラー表示
 * - beforeRemove: 未保存変更があれば破棄確認アラート
 */
export const CompetitionTabFormScreen: React.FC = () => {
  const route = useRoute<CompetitionTabFormRouteProp>();
  const navigation = useNavigation<CompetitionTabFormNavigationProp>();
  const {
    competitionId: initialCompetitionId,
    date: initialDateParam,
    teamId,
    initialTab,
  } = route.params;
  const { supabase, subscription, getAccessToken } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // ---- クイック入力 ----
  const { parseInput } = useQuickTimeInput();

  // ---- 大会ID (新規作成後に取得) ----
  const [resolvedCompetitionId, setResolvedCompetitionId] = useState<string | undefined>(
    initialCompetitionId,
  );
  const isEditMode = !!resolvedCompetitionId;

  // ---- 大会タブ state ----
  const [date, setDate] = useState(initialDateParam || format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [poolType, setPoolType] = useState<number>(0);
  const [competitionNote, setCompetitionNote] = useState("");
  const [competitionErrors, setCompetitionErrors] = useState<Record<string, string>>({});

  // ---- 画像 state ----
  const [newImageFiles, setNewImageFiles] = useState<ImageFile[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles);
    setDeletedImageIds(deletedIds);
  }, []);

  // ---- エントリータブ state ----
  const [entries, setEntries] = useState<EntryDraftRow[]>([createEmptyEntry()]);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [swimStyles, setSwimStyles] = useState<Style[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [pickingEntryIndex, setPickingEntryIndex] = useState<number | null>(null);
  const entryStyleButtonRefs = useRef<Map<number, View>>(new Map());
  const [entryDropdownLayout, setEntryDropdownLayout] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  // ---- レースレコードタブ state ----
  const [records, setRecords] = useState<RecordDraftRow[]>([createEmptyRecord()]);
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  const [showRecordStylePicker, setShowRecordStylePicker] = useState(false);
  const [pickingRecordIndex, setPickingRecordIndex] = useState<number | null>(null);
  const recordStyleButtonRefs = useRef<Map<number, View>>(new Map());
  const [recordDropdownLayout, setRecordDropdownLayout] = useState({
    top: 0,
    left: 0,
    width: 0,
  });
  // 動画保留 (record index → asset)
  const pendingVideoAssetRef = useRef<Map<number, { uri: string; mimeType?: string }>>(
    new Map(),
  );

  // ---- タブ state ----
  // エントリータブ表示制御: 大会日付が未来のときのみ true
  const showEntryTab = isEntryTabVisible(date);
  // レコードタブ表示制御: showEntryTab の補完（今日・過去・空/不正 → true、未来 → false）
  const showRecordTab = !isEntryTabVisible(date);
  const [activeTab, setActiveTab] = useState<CompetitionTab>(() => {
    const requested = initialTab ?? "competition";
    // エントリータブが非表示なのにrequested="entry"の場合は"competition"に戻す
    if (requested === "entry" && !isEntryTabVisible(initialDateParam || "")) {
      return "competition";
    }
    return requested;
  });
  const [tabErrors, setTabErrors] = useState<Partial<Record<CompetitionTab, boolean>>>({});

  // ---- ローディング ----
  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- 二重送信防止 ----
  const isSubmittingRef = useRef(false);

  // ---- 保存完了フラグ ----
  const [isSaved, setIsSaved] = useState(false);

  // ---- 未保存変更スナップショット ----
  const snapshotRef = useRef<{
    date: string; endDate: string; title: string; place: string;
    poolType: number; note: string; entries: EntryDraftRow[]; records: RecordDraftRow[];
  } | null>(null);

  // ---- ユーザープロフィール ----
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  const { syncCompetition } = useIOSCalendarSync();

  // ---- ミューテーション ----
  const createCompetitionMutation = useCreateCompetitionMutation(supabase);
  const updateCompetitionMutation = useUpdateCompetitionMutation(supabase);
  const createRecordMutation = useCreateRecordMutation(supabase);
  const updateRecordMutation = useUpdateRecordMutation(supabase);
  const deleteRecordMutation = useDeleteRecordMutation(supabase);
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase);

  // ---- EntryAPI ----
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);

  // ---- スクリーンサイズ (ドロップダウン位置計算) ----
  const screenHeight = Dimensions.get("window").height;
  const DROPDOWN_MAX_HEIGHT = 260;

  // ---- 種目一覧取得 ----
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase);
        const stylesData = await styleApi.getStyles();
        setSwimStyles(stylesData);

        // 最初のエントリー行にデフォルト種目をセット
        if (stylesData.length > 0) {
          setEntries((prev) =>
            prev.map((e, i) =>
              i === 0 && !e.styleId ? { ...e, styleId: String(stylesData[0].id) } : e,
            ),
          );
          setRecords((prev) =>
            prev.map((r, i) =>
              i === 0 && !r.styleId ? { ...r, styleId: String(stylesData[0].id) } : r,
            ),
          );
        }
      } catch (error) {
        console.error("種目取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.entry.stylesFetchFailed"));
      } finally {
        setLoadingStyles(false);
      }
    };
    fetchStyles();
  }, [supabase, t]);

  // ---- 既存データ初期化 (編集モード) ----
  useEffect(() => {
    if (!isEditMode || !resolvedCompetitionId) return;

    let isMounted = true;
    const init = async () => {
      try {
        setLoadingExisting(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

        // 大会データ取得
        const { data: competition, error } = await supabase
          .from("competitions")
          .select("*")
          .eq("id", resolvedCompetitionId)
          .single();

        if (!isMounted) return;
        if (error) throw error;
        if (!competition) {
          Alert.alert(t("common.error"), t("competition.mobile.notFound"));
          navigation.goBack();
          return;
        }

        setDate(competition.date);
        setEndDate(competition.end_date || "");
        setTitle(competition.title || "");
        setPlace(competition.place || "");
        setPoolType(competition.pool_type ?? 0);
        setCompetitionNote(competition.note || "");
        const images = getExistingImagesFromPaths(
          supabase,
          competition.image_paths,
          "competition-images",
        );
        setExistingImages(images);

        // エントリーデータ取得
        const allEntries = await entryApi.getEntriesByCompetition(resolvedCompetitionId);
        const userEntries = allEntries.filter((e) => e.user_id === user.id);
        // initialEntries を一度だけ構築して setEntries とスナップショット両方に使う。
        // 別々に createEmptyEntry() を呼ぶと draftId が異なり、無変更でも
        // JSON 比較が常に changed=true になる誤発火を防ぐ。
        const initialEntries: EntryDraftRow[] =
          userEntries.length > 0
            ? userEntries.map((e) => ({
                draftId: e.id,
                existingEntryId: e.id,
                styleId: String(e.style_id),
                entryTime: e.entry_time || 0,
                entryTimeDisplayValue: e.entry_time ? formatTime(e.entry_time) : "",
                note: e.note || "",
              }))
            : [createEmptyEntry()];
        setEntries(initialEntries);

        // レースレコードデータ取得 (C-5: 編集モードで既存レコードを初期化)
        // RecordAPI に competition_id フィルタ付きメソッドが無いため getRecords() で全件取得後
        // クライアント側でフィルタ。user_id スコープ保証済みのため越境削除リスクは無し。
        // 将来的には shared API に getRecordsByCompetitionId() を追加して DB クエリ化推奨。
        const recordApi = new RecordAPI(supabase);
        const allRecords = await recordApi.getRecords();
        const userCompetitionRecords = allRecords.filter(
          (r) => r.competition_id === resolvedCompetitionId,
        );
        const initialRecords: RecordDraftRow[] =
          userCompetitionRecords.length > 0
            ? userCompetitionRecords.map((r) => ({
                draftId: r.id,
                existingRecordId: r.id,
                styleId: String(r.style_id),
                time: r.time,
                timeDisplayValue: formatTime(r.time),
                isRelaying: r.is_relaying,
                splitTimes: (r.split_times ?? []).map((st) => ({
                  distance: st.distance,
                  splitTime: st.split_time,
                  splitTimeDisplayValue: formatTime(st.split_time),
                })),
                note: r.note || "",
                reactionTime: r.reaction_time != null ? String(r.reaction_time) : "",
              }))
            : [createEmptyRecord()];
        if (!isMounted) return;
        setRecords(initialRecords);

        // スナップショット記録 (編集開始時)
        // initialEntries / initialRecords と同一参照を使うことで
        // 無変更時の JSON 比較が常に一致することを保証する。
        snapshotRef.current = {
          date: competition.date,
          endDate: competition.end_date || "",
          title: competition.title || "",
          place: competition.place || "",
          poolType: competition.pool_type ?? 0,
          note: competition.note || "",
          entries: initialEntries,
          records: initialRecords,
        };
      } catch (error) {
        if (!isMounted) return;
        console.error("大会取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.mobile.fetchFailed"));
        navigation.goBack();
      } finally {
        if (isMounted) setLoadingExisting(false);
      }
    };
    init();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, resolvedCompetitionId]);

  // ---- 新規作成モードのスナップショット ----
  useEffect(() => {
    if (isEditMode) return;
    const initDate = initialDateParam || format(new Date(), "yyyy-MM-dd");
    snapshotRef.current = {
      date: initDate,
      endDate: "",
      title: "",
      place: "",
      poolType: 0,
      note: "",
      entries: [createEmptyEntry()],
      records: [createEmptyRecord()],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 日付変更時: エントリータブ表示制御 ----
  useEffect(() => {
    if (activeTab === "entry" && !isEntryTabVisible(date)) {
      setActiveTab("competition");
    }
  }, [date, activeTab]);

  // ---- 開始日変更ハンドラ ----
  const handleStartDateChange = useCallback(
    (newDate: string) => {
      setDate(newDate);
      const parsedNew = parseISO(newDate);
      const parsedEnd = parseISO(endDate);
      if (
        endDate &&
        isValid(parsedEnd) &&
        isValid(parsedNew) &&
        isBefore(parsedEnd, parsedNew)
      ) {
        setEndDate("");
      }
    },
    [endDate],
  );

  // ---- beforeRemove 警告 ----
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (isSaved) return;
      const snapshot = snapshotRef.current;
      if (!snapshot) return;
      const changed = hasUnsavedChanges(
        { date, endDate, title, place, poolType, note: competitionNote, entries, records },
        {
          date: snapshot.date,
          endDate: snapshot.endDate,
          title: snapshot.title,
          place: snapshot.place,
          poolType: snapshot.poolType,
          note: snapshot.note,
          entries: snapshot.entries,
          records: snapshot.records,
        },
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
  }, [
    navigation,
    isSaved,
    date,
    endDate,
    title,
    place,
    poolType,
    competitionNote,
    entries,
    records,
    t,
  ]);

  // ---- 大会タブ バリデーション ----
  const validateCompetitionTab = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!date || date.trim() === "") {
      newErrors.date = t("competition.form.dateRequired");
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        newErrors.date = t("competition.form.dateFormatInvalid");
      }
    }
    if (endDate && endDate.trim() !== "") {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(endDate)) {
        newErrors.endDate = t("competition.form.dateFormatInvalid");
      } else {
        const parsedEndDate = parseISO(endDate);
        if (!isValid(parsedEndDate)) {
          newErrors.endDate = t("competition.form.dateInvalid");
        } else if (date && date.trim() !== "" && dateRegex.test(date)) {
          const parsedStartDate = parseISO(date);
          if (isValid(parsedStartDate) && isBefore(parsedEndDate, parsedStartDate)) {
            newErrors.endDate = t("competition.form.endBeforeStart");
          }
        }
      }
    }
    setCompetitionErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [date, endDate, t]);

  // ---- エントリータブ バリデーション (空→valid) ----
  const validateEntryTab = useCallback((): boolean => {
    if (!showEntryTab) return true;
    const newErrors: Record<string, string> = {};
    entries.forEach((entry, index) => {
      if (!entry.styleId) {
        newErrors[`style-${index}`] = t("competition.entry.selectStyleRequired");
      }
    });
    setEntryErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [entries, showEntryTab, t]);

  // ---- レコードタブ バリデーション (空→valid) ----
  const validateRecordTab = useCallback((): boolean => {
    if (!showRecordTab) return true;
    const newErrors: Record<string, string> = {};
    records.forEach((record, index) => {
      // 全フィールド空ならスキップ
      if (!record.styleId && record.time === 0) return;
      if (!record.styleId) {
        newErrors[`style-${index}`] = t("recordMobile.form.styleRequired");
      }
    });
    setRecordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [records, showRecordTab, t]);

  // ---- 全タブ横断バリデーション ----
  const validateAll = useCallback((): boolean => {
    const competitionValid = validateCompetitionTab();
    const entryValid = validateEntryTab();
    const recordValid = validateRecordTab();

    const errors: Partial<Record<CompetitionTab, boolean>> = {};
    if (!competitionValid) errors.competition = true;
    if (!entryValid) errors.entry = true;
    if (!recordValid) errors.record = true;
    setTabErrors(errors);

    if (!competitionValid) {
      setActiveTab("competition");
      return false;
    }
    if (!entryValid && showEntryTab) {
      setActiveTab("entry");
      return false;
    }
    if (!recordValid) {
      setActiveTab("record");
      return false;
    }
    return true;
  }, [validateCompetitionTab, validateEntryTab, validateRecordTab, showEntryTab]);

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

      let savedCompetitionId = resolvedCompetitionId;

      // --- 大会 INSERT or UPDATE ---
      if (isEditMode && savedCompetitionId) {
        // 更新
        let newImagePaths: string[] = [];
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImagesViaApi(
            newImageFiles.map((f) => ({ base64: f.base64, fileExtension: f.fileExtension })),
            savedCompetitionId,
            "competition-images",
            accessToken,
          );
          newImagePaths = uploadResults.map((r) => r.path);
        }
        const currentPaths = existingImages
          .filter((img) => !deletedImageIds.includes(img.id))
          .map((img) => img.id);
        const updatedImagePaths = [...currentPaths, ...newImagePaths];

        const formData = {
          date,
          end_date: endDate.trim() || null,
          title: title.trim() || null,
          place: place.trim() || null,
          pool_type: poolType,
          note: competitionNote.trim() || null,
          image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
        };
        const updatedCompetition = await updateCompetitionMutation.mutateAsync({
          id: savedCompetitionId,
          updates: formData,
        });

        if (deletedImageIds.length > 0) {
          await deleteImages(supabase, deletedImageIds, "competition-images");
        }

        if (
          Platform.OS === "ios" &&
          profile?.ios_calendar_enabled &&
          profile?.ios_calendar_sync_competitions
        ) {
          try {
            await syncCompetition(updatedCompetition, "update");
          } catch (syncError) {
            console.warn("カレンダー同期エラー:", syncError);
            Alert.alert(
              t("competition.mobile.calendarSyncFailedTitle"),
              t("competition.mobile.calendarSyncFailedMessage"),
              [{ text: "OK" }],
            );
          }
        }
      } else {
        // 新規作成
        const formData = {
          date,
          end_date: endDate.trim() || null,
          title: title.trim() || null,
          place: place.trim() || null,
          pool_type: poolType,
          note: competitionNote.trim() || null,
          ...(teamId ? { team_id: teamId } : {}),
        };
        const newCompetition = await createCompetitionMutation.mutateAsync(formData);
        savedCompetitionId = newCompetition.id;
        // 親INSERT成功 → 編集モードへ遷移
        setResolvedCompetitionId(newCompetition.id);

        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImagesViaApi(
            newImageFiles.map((f) => ({ base64: f.base64, fileExtension: f.fileExtension })),
            newCompetition.id,
            "competition-images",
            accessToken,
          );
          const imagePaths = uploadResults.map((r) => r.path);
          try {
            await updateCompetitionMutation.mutateAsync({
              id: newCompetition.id,
              updates: { image_paths: imagePaths },
            });
          } catch (updateError) {
            await deleteImages(supabase, imagePaths, "competition-images");
            throw updateError;
          }
        }

        if (
          Platform.OS === "ios" &&
          profile?.ios_calendar_enabled &&
          profile?.ios_calendar_sync_competitions
        ) {
          try {
            await syncCompetition(newCompetition, "create");
          } catch (syncError) {
            console.warn("カレンダー同期エラー:", syncError);
            Alert.alert(
              t("competition.mobile.calendarSyncFailedTitle"),
              t("competition.mobile.calendarSyncFailedMessage"),
              [{ text: "OK" }],
            );
          }
        }
      }

      // --- エントリー保存 (大会日付が未来のときのみ) ---
      if (savedCompetitionId && showEntryTab && entries.length > 0) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

        // 既存エントリー取得 (衝突解決用)
        const allExistingEntries = await entryApi.getEntriesByCompetition(savedCompetitionId);
        const existingEntryList: ResolveExistingEntry[] = allExistingEntries
          .filter((e) => e.user_id === user.id)
          .map((e) => ({ id: e.id, styleId: e.style_id }));

        const formEntries: ResolveFormEntry[] = entries.map((e) => ({
          formId: e.draftId,
          styleId: parseInt(e.styleId, 10),
          entryTime: e.entryTime > 0 ? e.entryTime : null,
          note: e.note.trim() || null,
        }));

        const { creates, updates, deletes } = resolveEntryMutations(
          formEntries,
          existingEntryList,
          isEditMode,
        );

        for (const update of updates) {
          await entryApi.updateEntry(update.id, {
            style_id: update.styleId,
            entry_time: update.entryTime,
            note: update.note,
          });
        }
        for (const create of creates) {
          if (teamId) {
            await entryApi.createTeamEntry(teamId, user.id, {
              competition_id: savedCompetitionId,
              style_id: create.styleId,
              entry_time: create.entryTime,
              note: create.note,
              is_relaying: false,
            });
          } else {
            await entryApi.createPersonalEntry({
              competition_id: savedCompetitionId,
              style_id: create.styleId,
              entry_time: create.entryTime,
              note: create.note,
              is_relaying: false,
            });
          }
        }
        if (isEditMode) {
          for (const deleteId of deletes) {
            await entryApi.deleteEntry(deleteId);
          }
        }
      }

      // --- レースレコード保存 (大会日付が今日以前のときのみ) ---
      // diffRecordDraft が単一の権威となり creates/updates/deletes を決定する。
      if (savedCompetitionId && showRecordTab) {
        // プールタイプを取得
        const { data: competitionForPool } = await supabase
          .from("competitions")
          .select("pool_type")
          .eq("id", savedCompetitionId)
          .single();
        const poolTypeValue: PoolType = ((competitionForPool?.pool_type ?? poolType) as PoolType);

        // 有効なレコードのみを保存対象とする（style/time 未入力はスキップ）
        const validRecords = records.filter((r) => r.styleId !== "" && r.time > 0);

        // スナップショット時点の既存レコード ID と現在ドラフトを比較
        // 新規作成モードでは existingIds は空なので全て creates になる
        const snapshotExistingRecordIds = (snapshotRef.current?.records ?? [])
          .map((r) => r.existingRecordId)
          .filter((id): id is string => !!id);
        const recordDiff = diffRecordDraft(
          validRecords.map((r) => ({ draftId: r.draftId, existingRecordId: r.existingRecordId })),
          snapshotExistingRecordIds,
        );

        // DELETE: スナップショット後に除去されたレコードを削除
        for (const recordId of recordDiff.deletes) {
          await deleteRecordMutation.mutateAsync(recordId);
        }

        // UPDATE: recordDiff.updates に含まれる既存レコード ID を持つドラフトを更新
        const updateRecordSet = new Set(recordDiff.updates);
        for (const record of validRecords) {
          if (!record.existingRecordId || !updateRecordSet.has(record.existingRecordId)) continue;
          const updates = {
            style_id: parseInt(record.styleId),
            time: record.time,
            reaction_time: record.reactionTime.trim() !== "" ? parseFloat(record.reactionTime) : null,
            note: record.note.trim() || null,
            is_relaying: record.isRelaying,
          };
          await updateRecordMutation.mutateAsync({ id: record.existingRecordId, updates });
          const validSplitTimes = buildValidSplitTimes(record.splitTimes, record.styleId, swimStyles);
          if (validSplitTimes.length > 0) {
            await replaceSplitTimesMutation.mutateAsync({
              recordId: record.existingRecordId,
              splitTimes: validSplitTimes,
            });
          }
        }

        // INSERT: recordDiff.creates に含まれるドラフト ID を持つレコードを新規作成
        const createRecordSet = new Set(recordDiff.creates);
        for (let idx = 0; idx < validRecords.length; idx++) {
          const record = validRecords[idx];
          if (!createRecordSet.has(record.draftId)) continue;
          const recordData: Omit<RecordInsert, "user_id"> = {
            competition_id: savedCompetitionId,
            team_id: teamId ?? null,
            style_id: parseInt(record.styleId),
            time: record.time,
            reaction_time: record.reactionTime.trim() !== "" ? parseFloat(record.reactionTime) : null,
            note: record.note.trim() || null,
            is_relaying: record.isRelaying,
            pool_type: poolTypeValue,
          };
          const savedRecord = await createRecordMutation.mutateAsync(recordData);
          const validSplitTimes = buildValidSplitTimes(record.splitTimes, record.styleId, swimStyles);
          if (savedRecord && validSplitTimes.length > 0) {
            await replaceSplitTimesMutation.mutateAsync({
              recordId: savedRecord.id,
              splitTimes: validSplitTimes,
            });
          }
          // 動画アップロード (pending asset は元の records 配列のインデックスで管理)
          const originalIdx = records.indexOf(record);
          const pendingAsset = pendingVideoAssetRef.current.get(originalIdx);
          if (pendingAsset && savedRecord) {
            const videoToken = await getAccessToken();
            if (!videoToken) {
              Alert.alert(
                t("recordMobile.videoUploadFailedTitle"),
                t("recordMobile.videoUploadFailedSession"),
              );
            } else {
              try {
                await uploadVideo({
                  type: "record",
                  id: savedRecord.id,
                  videoUri: pendingAsset.uri,
                  mimeType: pendingAsset.mimeType,
                  accessToken: videoToken,
                });
              } catch (err) {
                console.error("動画アップロードエラー:", err);
                const errorDetail = err instanceof Error ? err.message : t("common.error");
                Alert.alert(
                  t("recordMobile.videoUploadFailedTitle"),
                  `${t("recordMobile.videoUploadFailedSaved")}\n\n${errorDetail}`,
                );
              }
            }
            pendingVideoAssetRef.current.delete(originalIdx);
          }
        }
      }

      // クエリ無効化
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamId) });
      }

      setIsSaved(true);
      navigation.goBack();
    } catch (error) {
      console.error("保存エラー:", error);
      const msg = error instanceof Error ? error.message : t("competition.mobile.saveFailed");
      setSaveError(msg);
      Alert.alert(t("common.error"), msg, [{ text: "OK" }]);
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  }, [
    validateAll,
    getAccessToken,
    resolvedCompetitionId,
    isEditMode,
    date,
    endDate,
    title,
    place,
    poolType,
    competitionNote,
    newImageFiles,
    existingImages,
    deletedImageIds,
    showEntryTab,
    showRecordTab,
    entries,
    records,
    swimStyles,
    teamId,
    supabase,
    queryClient,
    createCompetitionMutation,
    updateCompetitionMutation,
    createRecordMutation,
    updateRecordMutation,
    deleteRecordMutation,
    replaceSplitTimesMutation,
    entryApi,
    profile,
    syncCompetition,
    t,
    navigation,
  ]);

  // ---- エントリー操作 ----
  const addEntry = useCallback(() => {
    const firstStyle = swimStyles.length > 0 ? swimStyles[0] : null;
    setEntries((prev) => {
      const next = [
        ...prev,
        {
          draftId: `entry-${Date.now()}-${Math.random()}`,
          styleId: firstStyle?.id ? String(firstStyle.id) : "",
          entryTime: 0,
          entryTimeDisplayValue: "",
          note: "",
        },
      ];
      setActiveEntryIndex(next.length - 1);
      return next;
    });
  }, [swimStyles]);

  const removeEntry = useCallback((draftId: string) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      const removedIndex = prev.findIndex((e) => e.draftId === draftId);
      const next = prev.filter((e) => e.draftId !== draftId);
      setActiveEntryIndex((cur) => {
        const newLen = next.length;
        if (cur >= newLen) return newLen - 1;
        if (cur > removedIndex) return cur - 1;
        return cur;
      });
      return next;
    });
  }, []);

  const updateEntry = useCallback((draftId: string, updates: Partial<EntryDraftRow>) => {
    setEntries((prev) =>
      prev.map((entry, index) => {
        if (entry.draftId !== draftId) return entry;
        const updated = { ...entry, ...updates };
        if ("entryTimeDisplayValue" in updates) {
          const tv = updates.entryTimeDisplayValue || "";
          const parsed = tv.trim() !== "" ? parseTime(tv) : 0;
          updated.entryTime = parsed;
          if (tv.trim() !== "" && parsed <= 0) {
            setEntryErrors((prev) => ({
              ...prev,
              [`entryTime-${index}`]: t("competition.entry.timeFormatInvalid"),
            }));
          } else {
            setEntryErrors((prev) => {
              const next = { ...prev };
              delete next[`entryTime-${index}`];
              return next;
            });
          }
        }
        return updated;
      }),
    );
  }, [t]);

  // ---- エントリー 種目ドロップダウン ----
  const openEntryStylePicker = useCallback(
    (index: number) => {
      Keyboard.dismiss();
      const buttonRef = entryStyleButtonRefs.current.get(index);
      buttonRef?.measureInWindow((x, y, width, height) => {
        const top = y + height + 4;
        const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40;
        setEntryDropdownLayout({
          top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
          left: x,
          width,
        });
        setPickingEntryIndex(index);
        setShowStylePicker(true);
      });
    },
    [screenHeight],
  );

  // ---- レコード操作 ----
  const addRecord = useCallback(() => {
    const firstStyle = swimStyles.length > 0 ? swimStyles[0] : null;
    setRecords((prev) => {
      const next = [
        ...prev,
        {
          draftId: `record-${Date.now()}-${Math.random()}`,
          styleId: firstStyle?.id ? String(firstStyle.id) : "",
          time: 0,
          timeDisplayValue: "",
          isRelaying: false,
          splitTimes: [],
          note: "",
          reactionTime: "",
        },
      ];
      setActiveRecordIndex(next.length - 1);
      return next;
    });
  }, [swimStyles]);

  const removeRecord = useCallback((draftId: string, index: number) => {
    setRecords((prev) => {
      if (prev.length <= 1) return prev;
      const removedIndex = prev.findIndex((r) => r.draftId === draftId);
      pendingVideoAssetRef.current.delete(index);
      const next = prev.filter((r) => r.draftId !== draftId);
      setActiveRecordIndex((cur) => {
        const newLen = next.length;
        if (cur >= newLen) return newLen - 1;
        if (cur > removedIndex) return cur - 1;
        return cur;
      });
      return next;
    });
  }, []);

  const updateRecord = useCallback(
    (draftId: string, updates: Partial<RecordDraftRow>) => {
      setRecords((prev) =>
        prev.map((r) => (r.draftId === draftId ? { ...r, ...updates } : r)),
      );
    },
    [],
  );

  const handleRecordTimeChange = useCallback(
    (draftId: string, value: string) => {
      const { time: newTime } = parseInput(value);
      setRecords((prev) =>
        prev.map((r) => {
          if (r.draftId !== draftId) return r;
          const style = swimStyles.find((s) => s.id.toString() === r.styleId);
          const raceDistance = style?.distance;
          let updatedSplitTimes = [...r.splitTimes];
          if (raceDistance && newTime > 0) {
            const existingSplitIndex = updatedSplitTimes.findIndex(
              (st) => typeof st.distance === "number" && st.distance === raceDistance,
            );
            if (existingSplitIndex >= 0) {
              updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
                idx === existingSplitIndex
                  ? {
                      ...st,
                      splitTime: newTime,
                      splitTimeDisplayValue: formatSecondsToDisplay(newTime),
                    }
                  : st,
              );
            } else {
              updatedSplitTimes.push({
                distance: raceDistance,
                splitTime: newTime,
                splitTimeDisplayValue: formatSecondsToDisplay(newTime),
              });
            }
          }
          return {
            ...r,
            timeDisplayValue: value,
            time: newTime,
            splitTimes: updatedSplitTimes,
          };
        }),
      );
    },
    [parseInput, swimStyles],
  );

  // ---- レコード 種目ドロップダウン ----
  const openRecordStylePicker = useCallback(
    (index: number) => {
      Keyboard.dismiss();
      const buttonRef = recordStyleButtonRefs.current.get(index);
      buttonRef?.measureInWindow((x, y, width, height) => {
        const top = y + height + 4;
        const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40;
        setRecordDropdownLayout({
          top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
          left: x,
          width,
        });
        setPickingRecordIndex(index);
        setShowRecordStylePicker(true);
      });
    },
    [screenHeight],
  );

  // ---- スプリットタイム操作 ----
  const isSplitTimeLimitReached = useCallback(
    (draftId: string): boolean => {
      if (isPremium) return false;
      const record = records.find((r) => r.draftId === draftId);
      return (record?.splitTimes.length ?? 0) >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD;
    },
    [isPremium, records],
  );

  const handleAddSplitTime = useCallback((draftId: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.draftId !== draftId) return r;
        if (!isPremium && r.splitTimes.length >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD)
          return r;
        return {
          ...r,
          splitTimes: [
            ...r.splitTimes,
            { distance: 0, splitTime: 0, splitTimeDisplayValue: "" },
          ],
        };
      }),
    );
  }, [isPremium]);

  const handleSplitTimeChange = useCallback(
    (
      draftId: string,
      splitIndex: number,
      field: "distance" | "splitTime",
      value: string,
    ) => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.draftId !== draftId) return r;
          const updatedSplitTimes = r.splitTimes.map((st, i) => {
            if (i !== splitIndex) return st;
            if (field === "distance") {
              if (value.endsWith(".")) return { ...st, distance: value };
              const numValue = parseFloat(value);
              return { ...st, distance: isNaN(numValue) ? value : numValue };
            }
            const { time: parsedTime } = value.trim() === "" ? { time: 0 } : parseInput(value);
            return {
              ...st,
              splitTimeDisplayValue: value,
              splitTime: parsedTime,
            };
          });
          return { ...r, splitTimes: updatedSplitTimes };
        }),
      );
    },
    [parseInput],
  );

  const handleRemoveSplitTime = useCallback((draftId: string, splitIndex: number) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.draftId !== draftId) return r;
        return { ...r, splitTimes: r.splitTimes.filter((_, i) => i !== splitIndex) };
      }),
    );
  }, []);

  // ---- タブ定義 ----
  const tabs = useMemo((): FormTab<CompetitionTab>[] => {
    const result: FormTab<CompetitionTab>[] = [
      { id: "competition", label: t("competition.form.tabCompetition"), hasError: tabErrors.competition },
      { id: "record", label: t("competition.form.tabRecord"), hasError: tabErrors.record },
    ];
    if (showEntryTab) {
      // エントリータブは「大会」と「レコード」の間に挿入
      result.splice(1, 0, {
        id: "entry",
        label: t("competition.form.tabEntry"),
        hasError: tabErrors.entry,
      });
    }
    return result;
  }, [t, tabErrors, showEntryTab]);

  // ---- ローディング ----
  if (loadingExisting || loadingStyles) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("competition.mobile.loadingInfo")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* タブバー */}
      <FormTabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="competition" />

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
        {/* ---- 大会タブ ---- */}
        {activeTab === "competition" && (
          <View style={styles.form}>
            {/* 日付 */}
            <View style={styles.section}>
              <View style={styles.dateRow}>
                <View style={styles.dateColumn}>
                  <Text style={styles.label}>
                    {t("competition.form.startDateLabel")}{" "}
                    <Text style={styles.required}>*</Text>
                  </Text>
                  <DatePickerField
                    value={date}
                    onChange={handleStartDateChange}
                    required
                    disabled={isSaving}
                    error={competitionErrors.date}
                  />
                </View>
                <View style={styles.dateColumn}>
                  <Text style={styles.label}>
                    {t("competition.form.endDateLabel")}{" "}
                    <Text style={styles.optional}>{t("competition.form.multiDayHint")}</Text>
                  </Text>
                  <DatePickerField
                    value={endDate}
                    onChange={setEndDate}
                    allowClear
                    disabled={isSaving}
                    error={competitionErrors.endDate}
                    minDate={isValid(parseISO(date)) ? parseISO(date) : undefined}
                  />
                </View>
              </View>
            </View>

            {/* 大会名 */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.form.nameLabel")}</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t("competition.form.namePlaceholder")}
                editable={!isSaving}
              />
            </View>

            {/* 場所 */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.form.placeLabel")}</Text>
              <TextInput
                style={styles.input}
                value={place}
                onChangeText={setPlace}
                placeholder={t("competition.form.placePlaceholder")}
                editable={!isSaving}
              />
            </View>

            {/* プール種別 */}
            <View style={styles.section}>
              <Text style={styles.label}>
                {t("competition.form.poolTypeLabel")}{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.pickerContainer}>
                {POOL_TYPES.map((type) => (
                  <Pressable
                    key={type.value}
                    style={[
                      styles.pickerOption,
                      poolType === type.value && styles.pickerOptionSelected,
                    ]}
                    onPress={() => setPoolType(type.value)}
                    disabled={isSaving}
                  >
                    <Text
                      style={[
                        styles.pickerOptionText,
                        poolType === type.value && styles.pickerOptionTextSelected,
                      ]}
                    >
                      {t(type.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* メモ */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.form.memoLabel")}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={competitionNote}
                onChangeText={setCompetitionNote}
                placeholder={t("competition.form.memoPlaceholder")}
                multiline
                numberOfLines={3}
                editable={!isSaving}
              />
            </View>

            {/* 画像 */}
            <View style={styles.section}>
              {canUploadImage(isPremium) ? (
                <ImageUploader
                  existingImages={existingImages}
                  onImagesChange={handleImagesChange}
                  maxImages={3}
                  disabled={isSaving}
                  label={t("competition.form.imagesLabel")}
                />
              ) : (
                <PremiumBadge feature="image_upload" />
              )}
            </View>
          </View>
        )}

        {/* ---- エントリータブ ---- */}
        {activeTab === "entry" && showEntryTab && (
          <View style={styles.form}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("competition.entry.title")}</Text>
            </View>

            {(() => {
              const entry = entries[activeEntryIndex];
              const index = activeEntryIndex;
              return (
                <ItemTabs
                  count={entries.length}
                  activeIndex={activeEntryIndex}
                  onSelect={setActiveEntryIndex}
                  onAdd={addEntry}
                  onRemove={(i) => {
                    const target = entries[i];
                    if (target) removeEntry(target.draftId);
                  }}
                  label={(i) => t("competition.entry.styleNumber", { index: i + 1 })}
                  accent="blue"
                  disabled={isSaving}
                  testID="entry-item-tabs"
                >
                  {entry != null && (
                    <View key={entry.draftId}>
                  {/* 種目選択 */}
                  <View style={styles.section}>
                    <Text style={styles.label}>
                      {t("competition.entry.styleLabel")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <Pressable
                      ref={(ref) => {
                        if (ref) {
                          entryStyleButtonRefs.current.set(index, ref);
                        } else {
                          entryStyleButtonRefs.current.delete(index);
                        }
                      }}
                      style={[
                        styles.pickerButton,
                        entryErrors[`style-${index}`] && styles.pickerButtonError,
                      ]}
                      onPress={() => openEntryStylePicker(index)}
                      disabled={isSaving}
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !entry.styleId && styles.pickerButtonPlaceholder,
                        ]}
                      >
                        {entry.styleId
                          ? localizedStyleName(
                              swimStyles.find((s) => s.id.toString() === entry.styleId),
                              t,
                            ) || t("competition.entry.selectStyle")
                          : t("competition.entry.selectStyle")}
                      </Text>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </Pressable>
                    {entryErrors[`style-${index}`] && (
                      <Text style={styles.errorText}>{entryErrors[`style-${index}`]}</Text>
                    )}
                  </View>

                  {/* エントリータイム */}
                  <View style={styles.section}>
                    <Text style={styles.label}>{t("competition.entry.entryTimeLabel")}</Text>
                    <TextInput
                      style={[
                        styles.input,
                        entryErrors[`entryTime-${index}`] && styles.inputError,
                      ]}
                      value={entry.entryTimeDisplayValue}
                      onChangeText={(text) =>
                        updateEntry(entry.draftId, { entryTimeDisplayValue: text })
                      }
                      placeholder={t("competition.entry.entryTimePlaceholder")}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="default"
                      editable={!isSaving}
                    />
                    {entryErrors[`entryTime-${index}`] && (
                      <Text style={styles.errorText}>{entryErrors[`entryTime-${index}`]}</Text>
                    )}
                    {entry.entryTime > 0 && !entryErrors[`entryTime-${index}`] && (
                      <Text style={styles.timeHint}>
                        {t("competition.entry.inputValueHint", {
                          time: formatTime(entry.entryTime),
                        })}
                      </Text>
                    )}
                  </View>

                  {/* メモ */}
                  <View style={styles.section}>
                    <Text style={styles.label}>{t("competition.entry.memoLabel")}</Text>
                    <TextInput
                      style={[styles.input, styles.textAreaSmall]}
                      value={entry.note}
                      onChangeText={(text) => updateEntry(entry.draftId, { note: text })}
                      placeholder={t("competition.entry.memoPlaceholder")}
                      placeholderTextColor="#9CA3AF"
                      multiline
                      numberOfLines={3}
                      editable={!isSaving}
                    />
                  </View>
                    </View>
                  )}
                </ItemTabs>
              );
            })()}
          </View>
        )}

        {/* ---- レースレコードタブ ---- */}
        {activeTab === "record" && (
          <View style={styles.form}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t("recordMobile.form.sectionTitle")}</Text>
            </View>

            {!showRecordTab && (
              <View style={styles.guardMessage}>
                <Text style={styles.guardMessageText}>
                  {t("forms.tabModal.recordFutureGuard")}
                </Text>
              </View>
            )}

            {showRecordTab && (() => {
              const record = records[activeRecordIndex];
              const index = activeRecordIndex;
              return (
                <ItemTabs
                  count={records.length}
                  activeIndex={activeRecordIndex}
                  onSelect={setActiveRecordIndex}
                  onAdd={addRecord}
                  onRemove={(i) => {
                    const target = records[i];
                    if (target) removeRecord(target.draftId, i);
                  }}
                  label={(i) => t("recordMobile.form.recordNumber", { n: i + 1 })}
                  accent="blue"
                  disabled={isSaving}
                  testID="record-item-tabs"
                >
                  {record != null && (
                    <View key={record.draftId}>
                  {/* 種目選択 */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {t("recordMobile.form.styleLabel")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <Pressable
                      ref={(ref) => {
                        if (ref) {
                          recordStyleButtonRefs.current.set(index, ref);
                        } else {
                          recordStyleButtonRefs.current.delete(index);
                        }
                      }}
                      style={[
                        styles.pickerButton,
                        recordErrors[`style-${index}`] && styles.pickerButtonError,
                      ]}
                      onPress={() => openRecordStylePicker(index)}
                      disabled={isSaving}
                    >
                      <Text
                        style={[
                          styles.pickerButtonText,
                          !record.styleId && styles.pickerButtonPlaceholder,
                        ]}
                      >
                        {record.styleId
                          ? localizedStyleName(
                              swimStyles.find((s) => s.id.toString() === record.styleId),
                              t,
                            ) || t("recordMobile.form.stylePlaceholder")
                          : t("recordMobile.form.stylePlaceholder")}
                      </Text>
                      <Feather name="chevron-down" size={20} color="#6B7280" />
                    </Pressable>
                    {recordErrors[`style-${index}`] && (
                      <Text style={styles.errorText}>{recordErrors[`style-${index}`]}</Text>
                    )}
                  </View>

                  {/* タイム */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {t("recordMobile.form.timeLabel")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.input, recordErrors[`time-${index}`] && styles.inputError]}
                      value={record.timeDisplayValue}
                      onChangeText={(text) => handleRecordTimeChange(record.draftId, text)}
                      placeholder={t("recordMobile.form.timePlaceholder2")}
                      keyboardType="default"
                      editable={!isSaving}
                    />
                    {recordErrors[`time-${index}`] && (
                      <Text style={styles.errorText}>{recordErrors[`time-${index}`]}</Text>
                    )}
                  </View>

                  {/* リレー */}
                  <View style={styles.field}>
                    <View style={styles.switchContainer}>
                      <Text style={styles.label}>{t("recordMobile.form.relayStyleLabel")}</Text>
                      <Switch
                        value={record.isRelaying}
                        onValueChange={(value) => updateRecord(record.draftId, { isRelaying: value })}
                        disabled={isSaving}
                      />
                    </View>
                  </View>

                  {/* 反応時間 */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t("recordMobile.form.reactionTimeLabel")}</Text>
                    <TextInput
                      style={styles.input}
                      value={record.reactionTime}
                      onChangeText={(text) => updateRecord(record.draftId, { reactionTime: text })}
                      placeholder={t("recordMobile.form.reactionTimePlaceholder")}
                      keyboardType="decimal-pad"
                      editable={!isSaving}
                    />
                  </View>

                  {/* メモ */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t("recordMobile.form.memoLabel")}</Text>
                    <TextInput
                      style={[styles.input, styles.textAreaSmall]}
                      value={record.note}
                      onChangeText={(text) => updateRecord(record.draftId, { note: text })}
                      placeholder={t("recordMobile.form.memoPlaceholder")}
                      multiline
                      numberOfLines={3}
                      editable={!isSaving}
                    />
                  </View>

                  {/* 動画 */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t("recordMobile.form.videoLabel")}</Text>
                    <VideoUploader
                      type="record"
                      id={record.existingRecordId}
                      existingVideoPath={null}
                      existingThumbnailPath={null}
                      isPremium={isPremium}
                      onUploadComplete={() => {}}
                      onDelete={() => {}}
                      onPendingVideoAsset={(asset) => {
                        if (asset) {
                          pendingVideoAssetRef.current.set(index, asset);
                        } else {
                          pendingVideoAssetRef.current.delete(index);
                        }
                      }}
                    />
                  </View>

                  {/* スプリットタイム */}
                  <View style={styles.field}>
                    <View style={styles.splitTimeHeader}>
                      <Text style={styles.label}>{t("recordMobile.form.splitTimeLabel")}</Text>
                      <Pressable
                        style={[
                          styles.addSplitButton,
                          isSplitTimeLimitReached(record.draftId) && styles.addButtonDisabled,
                        ]}
                        onPress={() => handleAddSplitTime(record.draftId)}
                        disabled={isSaving || isSplitTimeLimitReached(record.draftId)}
                      >
                        <Text style={styles.addSplitButtonText}>
                          {t("recordMobile.form.addButton")}
                        </Text>
                      </Pressable>
                    </View>
                    {record.splitTimes.map((splitTime, splitIndex) => (
                      <View key={splitIndex} style={styles.splitTimeRow}>
                        <TextInput
                          style={[styles.input, styles.splitTimeDistance]}
                          value={
                            typeof splitTime.distance === "number" && splitTime.distance > 0
                              ? String(splitTime.distance)
                              : typeof splitTime.distance === "string"
                                ? splitTime.distance
                                : ""
                          }
                          onChangeText={(text) => {
                            if (text === "" || /^\d+(\.\d*)?$/.test(text)) {
                              handleSplitTimeChange(record.draftId, splitIndex, "distance", text);
                            }
                          }}
                          placeholder={t("recordMobile.form.distancePlaceholder")}
                          keyboardType="decimal-pad"
                          editable={!isSaving}
                        />
                        <Text style={styles.splitTimeSeparator}>m:</Text>
                        <TextInput
                          style={[styles.input, styles.splitTimeTime]}
                          value={splitTime.splitTimeDisplayValue}
                          onChangeText={(text) =>
                            handleSplitTimeChange(record.draftId, splitIndex, "splitTime", text)
                          }
                          placeholder={t("recordMobile.form.splitPlaceholder")}
                          keyboardType="default"
                          editable={!isSaving}
                        />
                        <Pressable
                          style={styles.removeButton}
                          onPress={() => handleRemoveSplitTime(record.draftId, splitIndex)}
                          disabled={isSaving}
                        >
                          <Feather name="trash-2" size={16} color="#EF4444" />
                        </Pressable>
                      </View>
                    ))}
                    {isSplitTimeLimitReached(record.draftId) && (
                      <View style={{ marginTop: 8 }}>
                        <PremiumBadge feature="split_time_limit" compact />
                      </View>
                    )}
                  </View>
                    </View>
                  )}
                </ItemTabs>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* エントリー 種目ドロップダウン */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowStylePicker(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowStylePicker(false)}>
          <View
            style={[
              styles.dropdownContainer,
              {
                top: entryDropdownLayout.top,
                left: entryDropdownLayout.left,
                width: entryDropdownLayout.width,
              },
            ]}
          >
            <ScrollView
              style={styles.dropdownScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {swimStyles.map((style) => {
                const entry = entries[pickingEntryIndex ?? 0];
                const isSelected = entry?.styleId === String(style.id);
                return (
                  <Pressable
                    key={style.id}
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      if (pickingEntryIndex !== null) {
                        // entry[i] 種目変更
                        updateEntry(entries[pickingEntryIndex].draftId, {
                          styleId: String(style.id),
                        });
                        // 双方向リンク: 同インデックスの record が存在する場合は同種目に同期
                        // 直接 setRecords で set するため相互ハンドラの再帰発火なし
                        const linkedRecord = records[pickingEntryIndex];
                        if (linkedRecord) {
                          updateRecord(linkedRecord.draftId, { styleId: String(style.id) });
                        }
                      }
                      setShowStylePicker(false);
                      setPickingEntryIndex(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {localizedStyleName(style, t)}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#2563EB" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* レコード 種目ドロップダウン */}
      <Modal
        visible={showRecordStylePicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowRecordStylePicker(false)}
      >
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setShowRecordStylePicker(false)}
        >
          <View
            style={[
              styles.dropdownContainer,
              {
                top: recordDropdownLayout.top,
                left: recordDropdownLayout.left,
                width: recordDropdownLayout.width,
              },
            ]}
          >
            <ScrollView
              style={styles.dropdownScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {swimStyles.map((style) => {
                const record = records[pickingRecordIndex ?? 0];
                const isSelected = record?.styleId === String(style.id);
                return (
                  <Pressable
                    key={style.id}
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      if (pickingRecordIndex !== null) {
                        // record[i] 種目変更
                        updateRecord(records[pickingRecordIndex].draftId, {
                          styleId: String(style.id),
                        });
                        // 双方向リンク: 同インデックスの entry が存在する場合は同種目に同期
                        // 直接 setEntries で set するため相互ハンドラの再帰発火なし
                        const linkedEntry = entries[pickingRecordIndex];
                        if (linkedEntry) {
                          updateEntry(linkedEntry.draftId, { styleId: String(style.id) });
                        }
                      }
                      setShowRecordStylePicker(false);
                      setPickingRecordIndex(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {localizedStyleName(style, t)}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#2563EB" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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

// ---- ヘルパー関数 ----

function formatSecondsToDisplay(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(2).padStart(5, "0");
  return minutes > 0 ? `${minutes}:${remainder}` : remainder;
}

function buildValidSplitTimes(
  splitTimes: SplitTimeData[],
  styleId: string,
  swimStyles: Style[],
): { distance: number; split_time: number }[] {
  const selectedStyle = swimStyles.find((s) => String(s.id) === styleId);
  const raceDistance = selectedStyle?.distance;

  return splitTimes
    .map((st) => {
      const distance =
        typeof st.distance === "number"
          ? st.distance
          : st.distance === ""
            ? NaN
            : parseFloat(String(st.distance));
      if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
        return { distance, split_time: st.splitTime };
      }
      return null;
    })
    .filter((st): st is { distance: number; split_time: number } => st !== null)
    .filter((st) => !(raceDistance && st.distance === raceDistance));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  form: {
    gap: 16,
  },
  section: {
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateColumn: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  optional: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  textAreaSmall: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  pickerContainer: {
    flexDirection: "row",
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  pickerOptionSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  pickerOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  pickerButtonError: {
    borderColor: "#EF4444",
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  pickerButtonPlaceholder: {
    color: "#9CA3AF",
  },
  entryCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  entryItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  entryNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  recordCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  recordItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  recordNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  removeButton: {
    padding: 4,
  },
  addEntryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  addEntryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  timeHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  splitTimeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  addSplitButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  addSplitButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  splitTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  splitTimeDistance: {
    width: 80,
  },
  splitTimeSeparator: {
    fontSize: 14,
    color: "#6B7280",
  },
  splitTimeTime: {
    flex: 1,
  },
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContainer: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    maxHeight: 260,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  dropdownOptionSelected: {
    backgroundColor: "#EFF6FF",
  },
  dropdownOptionText: {
    fontSize: 15,
    color: "#111827",
  },
  dropdownOptionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
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
  guardMessage: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 16,
    marginVertical: 8,
  },
  guardMessageText: {
    fontSize: 14,
    color: "#92400E",
    textAlign: "center",
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
