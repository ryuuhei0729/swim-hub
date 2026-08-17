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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation, usePreventRemove, RouteProp } from "@react-navigation/native";
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
  useBestTimesQuery,
} from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { useTeamMembersQuery } from "@apps/shared/hooks/queries/teams";
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
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import { FormTabBar, FormTab } from "@/components/forms/FormTabBar";
import { ItemTabs } from "@/components/forms/ItemTabs";
import { StyleChipSelector } from "@/components/forms/StyleChipSelector";
import { LapTimeDisplay, getBestTimeForEntry } from "@/components/records";
import {
  uploadImagesViaApi,
  deleteImages,
  resolveGalleryImages,
  mergeImagePaths,
} from "@/utils/imageUpload";
import { uploadVideo } from "@/utils/videoUpload";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import { normalizeReactionTime, toReactionTimeValue } from "@apps/shared/utils/reactionTime";
import {
  hasUnsavedChanges,
  isEntryTabVisible,
  diffRecordDraft,
  isDefaultUntouchedEntry,
  getTabNavAdjacency,
} from "@/utils/tabFormUtils";
import { resolveEntryMutations } from "@/utils/entryMutations";
import type { ResolveExistingEntry, ResolveFormEntry } from "@/utils/entryMutations";
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
  /** リレー区分 (web EntryDraft.isRelaying と同一) */
  isRelaying: boolean;
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
  /** 既存動画パス (編集時に表示・削除・差し替え可能にする) */
  videoPath: string | null;
  videoThumbnailPath: string | null;
}

function createEmptyEntry(): EntryDraftRow {
  return {
    draftId: `entry-${Date.now()}-${Math.random()}`,
    styleId: "",
    entryTime: 0,
    entryTimeDisplayValue: "",
    note: "",
    isRelaying: false,
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
    videoPath: null,
    videoThumbnailPath: null,
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
  const { supabase, user, subscription, getAccessToken } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // ---- 大会ID (新規作成後に取得) ----
  const [resolvedCompetitionId, setResolvedCompetitionId] = useState<string | undefined>(
    initialCompetitionId,
  );
  const isEditMode = !!resolvedCompetitionId;

  // ---- 大会の所有者・所属チーム (編集権限判定用) ----
  // route.params.teamId は TeamCompetitionList からの遷移時のみ渡され、
  // useDayDetailHandlers.handleEditRecord からの遷移では渡らない。そのため
  // 既存データ取得時に competitions.team_id (source of truth) で上書きする。
  // handleSave 以降はこの competitionTeamId を唯一の参照先とし、route.params.teamId を
  // 直接参照しない (新規作成モードでは競技データ未取得のためこの初期値がそのまま使われる)。
  const [competitionOwnerId, setCompetitionOwnerId] = useState<string | null>(null);
  const [competitionTeamId, setCompetitionTeamId] = useState<string | null>(teamId ?? null);

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
  // 保存用の生パス一覧（表示専用の resolveGalleryImages 結果は署名URL取得に失敗した
  // パスを除外するため、保存に使う image_paths はこちらを source of truth とする）
  const [savedImagePaths, setSavedImagePaths] = useState<string[]>([]);
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles);
    setDeletedImageIds(deletedIds);
  }, []);

  // ---- 新規作成モードの初期エントリー/レコード (state と snapshot で同一参照を共有する) ----
  // 別々に createEmptyEntry()/createEmptyRecord() を呼ぶと draftId (Date.now()+Math.random())
  // が毎回異なり、無変更でも hasUnsavedChanges の JSON 比較が常に changed=true になってしまう。
  const initialEntriesRef = useRef<EntryDraftRow[]>([createEmptyEntry()]);
  const initialRecordsRef = useRef<RecordDraftRow[]>([createEmptyRecord()]);

  // ---- エントリータブ state ----
  const [entries, setEntries] = useState<EntryDraftRow[]>(initialEntriesRef.current);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [swimStyles, setSwimStyles] = useState<Style[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({});

  // ---- レースレコードタブ state ----
  const [records, setRecords] = useState<RecordDraftRow[]>(initialRecordsRef.current);
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  // 動画保留 (record.draftId → asset)
  // 配列 index キーだとレコード削除で index がずれ、動画の消失/誤添付が起きるため
  // PracticeTabFormScreen (menu.id キー) と同じく安定 ID で管理する
  const pendingVideoAssetRef = useRef<Map<string, { uri: string; mimeType?: string }>>(
    new Map(),
  );
  // 保留動画の有無 (shouldPreventRemove 用のリアクティブなミラー)。
  // pendingVideoAssetRef 自体は Map の実データ置き場として維持しつつ、
  // 件数が変わるたびにこの state も同期させることで shouldPreventRemove に反映させる。
  const [pendingVideoCount, setPendingVideoCount] = useState(0);
  const syncPendingVideoCount = useCallback(() => {
    setPendingVideoCount(pendingVideoAssetRef.current.size);
  }, []);

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

  // ---- エントリー1行目に自動セットされたデフォルト種目ID (未編集判定用) ----
  const defaultEntryStyleIdRef = useRef("");

  // ---- 保存完了フラグ (usePreventRemove 制御) ----
  // usePreventRemove(preventRemove, ...) の preventRemove は render のたびに評価される
  // ただの boolean のため、ref (isSavedRef.current 等) で持つと値を変えても再レンダーが
  // 起きず preventRemove が更新されない。state で持つことで変化が確実に再レンダーへ反映される。
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

  // ---- 大会の編集権限判定 ----
  // competitions UPDATE RLS (user_id = auth.uid() OR is_team_admin(team_id, auth.uid())) と
  // 同じ条件をクライアント側でも判定する。チーム大会でない場合は自分の大会なので常に true。
  // メンバー一覧の取得・管理者判定は TeamDetailScreen (members.some(m => m.user_id === user.id
  // && m.role === "admin")) と同じパターンを踏襲する。
  const { data: competitionTeamMembers, isLoading: isCompetitionTeamMembersLoading } =
    useTeamMembersQuery(supabase, competitionTeamId ?? undefined);
  const isCurrentUserCompetitionTeamAdmin = useMemo(() => {
    if (!user || !competitionTeamId || !competitionTeamMembers) return false;
    return competitionTeamMembers.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, competitionTeamId, competitionTeamMembers]);
  const canEditCompetitionDetails = useMemo(() => {
    if (!isEditMode) return true; // 新規作成は常に自分の大会
    if (!competitionTeamId) return true; // 個人の大会は常に自分のもの
    if (user && competitionOwnerId === user.id) return true;
    return isCurrentUserCompetitionTeamAdmin;
  }, [isEditMode, competitionTeamId, competitionOwnerId, user, isCurrentUserCompetitionTeamAdmin]);
  // チーム大会の編集権限確定待ち (未確定のまま編集可能 UI を出さないためのローディングガード)
  const isResolvingCompetitionPermission =
    isEditMode && !!competitionTeamId && isCompetitionTeamMembersLoading;

  // ---- EntryAPI ----
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);

  // ---- ベストタイム (エントリー/レコードの参照バッジ用。web useBestTimes 相当) ----
  const { data: bestTimesData } = useBestTimesQuery(supabase, {});
  const bestTimes = useMemo(() => bestTimesData ?? [], [bestTimesData]);

  // ---- 種目一覧取得 ----
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase);
        const stylesData = await styleApi.getStyles();
        setSwimStyles(stylesData);

        // 最初のエントリー行にデフォルト種目をセット
        if (stylesData.length > 0) {
          const defaultStyleId = String(stylesData[0].id);
          defaultEntryStyleIdRef.current = defaultStyleId;
          setEntries((prev) =>
            prev.map((e, i) => (i === 0 && !e.styleId ? { ...e, styleId: defaultStyleId } : e)),
          );
          setRecords((prev) =>
            prev.map((r, i) => (i === 0 && !r.styleId ? { ...r, styleId: defaultStyleId } : r)),
          );
          // 新規作成モードのみ: snapshot 側の1行目にも同じデフォルト種目を反映し、
          // 「自動セットされただけ」の行が編集扱いにならないようにする
          // (編集モードは既存データが真実のため触らない)。
          if (!isEditMode && snapshotRef.current) {
            snapshotRef.current = {
              ...snapshotRef.current,
              entries: snapshotRef.current.entries.map((e, i) =>
                i === 0 && !e.styleId ? { ...e, styleId: defaultStyleId } : e,
              ),
              records: snapshotRef.current.records.map((r, i) =>
                i === 0 && !r.styleId ? { ...r, styleId: defaultStyleId } : r,
              ),
            };
          }
        }
      } catch (error) {
        console.error("種目取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.entry.stylesFetchFailed"));
      } finally {
        setLoadingStyles(false);
      }
    };
    fetchStyles();
    // isEditMode は保存完了で resolvedCompetitionId が変わると同じ effect 内で
    // 再評価されてほしくない (初回種目取得のみでよい) ため意図的に依存から除外する。
    // isEditMode はこの effect のクロージャに mount 時点の値で固定されるため、
    // 保存完了後に true に変わっても (この effect 自体は再実行されないので) 影響しない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // 編集権限判定 (competitions UPDATE RLS と同条件をクライアントでも反映する)
        setCompetitionOwnerId(competition.user_id);
        setCompetitionTeamId(competition.team_id ?? null);
        // 保存用の生パスは表示用の解決結果と独立して常に保持する
        setSavedImagePaths(competition.image_paths ?? []);
        // competition-images は private バケットのため署名付きURLを解決する（Issue #36）
        const accessToken = await getAccessToken();
        if (accessToken) {
          const images = await resolveGalleryImages(
            "competition-images",
            competition.image_paths,
            accessToken,
          );
          setExistingImages(images);
        } else {
          setExistingImages([]);
        }

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
                entryTimeDisplayValue: e.entry_time ? formatTimeBest(e.entry_time) : "",
                note: e.note || "",
                isRelaying: e.is_relaying ?? false,
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
                timeDisplayValue: formatTimeBest(r.time),
                isRelaying: r.is_relaying,
                splitTimes: (r.split_times ?? []).map((st) => ({
                  distance: st.distance,
                  splitTime: st.split_time,
                  splitTimeDisplayValue: formatTimeBest(st.split_time),
                })),
                note: r.note || "",
                reactionTime: r.reaction_time != null ? String(r.reaction_time) : "",
                videoPath: r.video_path ?? null,
                videoThumbnailPath: r.video_thumbnail_path ?? null,
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
    // entries/records は state 初期値 (initialEntriesRef/initialRecordsRef) と同一参照を使う。
    // 別々に createEmptyEntry()/createEmptyRecord() を呼ぶと draftId が食い違い、
    // 無変更でも hasUnsavedChanges が常に changed=true を返してしまう。
    snapshotRef.current = {
      date: initDate,
      endDate: "",
      title: "",
      place: "",
      poolType: 0,
      note: "",
      entries: initialEntriesRef.current,
      records: initialRecordsRef.current,
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
      { date, endDate, title, place, poolType, note: competitionNote, entries, records },
      {
        date: snapshotRef.current.date,
        endDate: snapshotRef.current.endDate,
        title: snapshotRef.current.title,
        place: snapshotRef.current.place,
        poolType: snapshotRef.current.poolType,
        note: snapshotRef.current.note,
        entries: snapshotRef.current.entries,
        records: snapshotRef.current.records,
      },
    );
  }, [date, endDate, title, place, poolType, competitionNote, entries, records]);
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
      // blur を経ずに保存された場合の解釈不能な形式を確定拒否する
      const rawTime = entry.entryTimeDisplayValue.trim();
      if (rawTime !== "" && parseTimeFlexible(rawTime) === null) {
        newErrors[`entryTime-${index}`] = t("competition.entry.timeFormatInvalid");
      }
    });
    // 種目重複チェック (web CompetitionTabModal validateAll と同一)
    const styleIds = entries.filter((e) => e.styleId).map((e) => e.styleId);
    if (styleIds.length !== new Set(styleIds).size) {
      newErrors.duplicate = t("forms.tabModal.duplicateEntryStyle");
    }
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
      // blur を経ずに保存された場合の解釈不能な形式を確定拒否する
      const rawTime = record.timeDisplayValue.trim();
      if (rawTime !== "" && parseTimeFlexible(rawTime) === null) {
        newErrors[`time-${index}`] = t("recordMobile.form.timeFormatInvalid");
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
        // 更新: チーム大会かつ自分がオーナーでも管理者でもない場合は competitions
        // UPDATE RLS (user_id = auth.uid() OR is_team_admin) を満たさず 0 行ヒットで
        // 例外になる。その場合は大会本体の更新をスキップし、エントリー/レコード
        // (records の RLS は本人所有で許可される) の保存へ進む。
        if (canEditCompetitionDetails) {
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
          // 生パス (source of truth) から削除分を除外し新規分を追加（mergeImagePaths 参照）
          const updatedImagePaths = mergeImagePaths(savedImagePaths, deletedImageIds, newImagePaths);

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
          ...(competitionTeamId ? { team_id: competitionTeamId } : {}),
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
      // 未編集のデフォルト行 (種目取得後に自動セットされた1行目が未操作のまま) は
      // 保存対象から除外する。編集モードの既存行 (existingEntryId あり) は対象外。
      const effectiveEntries = entries.filter(
        (e) => !isDefaultUntouchedEntry(e, defaultEntryStyleIdRef.current),
      );

      // effectiveEntries が空 (全行が未編集デフォルト or 全削除) でも、既存エントリーの
      // 全件削除を resolveEntryMutations に委ねる必要があるためブロック自体はスキップしない。
      if (savedCompetitionId && showEntryTab) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

        // 既存エントリー取得 (衝突解決用)
        const allExistingEntries = await entryApi.getEntriesByCompetition(savedCompetitionId);
        const existingEntryList: ResolveExistingEntry[] = allExistingEntries
          .filter((e) => e.user_id === user.id)
          .map((e) => ({ id: e.id, styleId: e.style_id }));

        const formEntries: ResolveFormEntry[] = effectiveEntries.map((e) => ({
          formId: e.draftId,
          styleId: parseInt(e.styleId, 10),
          entryTime: e.entryTime > 0 ? e.entryTime : null,
          note: e.note.trim() || null,
        }));

        // resolveEntryMutations は isRelaying を扱わないため、styleId → isRelaying の
        // 対応表を別途構築する (同一 style は後勝ち。resolveEntryMutations の集約規則と同じ)
        const relayByStyleId = new Map<number, boolean>();
        for (const e of effectiveEntries) {
          const sid = parseInt(e.styleId, 10);
          if (Number.isInteger(sid) && sid > 0) relayByStyleId.set(sid, e.isRelaying);
        }

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
            is_relaying: relayByStyleId.get(update.styleId) ?? false,
          });
        }
        for (const create of creates) {
          if (competitionTeamId) {
            await entryApi.createTeamEntry(competitionTeamId, user.id, {
              competition_id: savedCompetitionId,
              style_id: create.styleId,
              entry_time: create.entryTime,
              note: create.note,
              is_relaying: relayByStyleId.get(create.styleId) ?? false,
            });
          } else {
            await entryApi.createPersonalEntry({
              competition_id: savedCompetitionId,
              style_id: create.styleId,
              entry_time: create.entryTime,
              note: create.note,
              is_relaying: relayByStyleId.get(create.styleId) ?? false,
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
            reaction_time: toReactionTimeValue(record.reactionTime),
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
            team_id: competitionTeamId,
            style_id: parseInt(record.styleId),
            time: record.time,
            reaction_time: toReactionTimeValue(record.reactionTime),
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
          // 動画アップロード (pending asset は record.draftId で管理)
          const pendingAsset = pendingVideoAssetRef.current.get(record.draftId);
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
            pendingVideoAssetRef.current.delete(record.draftId);
            syncPendingVideoCount();
          }
        }
      }

      // クエリ無効化
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      if (competitionTeamId) {
        queryClient.invalidateQueries({ queryKey: teamKeys.competitions(competitionTeamId) });
      }

      // navigation.goBack() はここで直接呼ばず、isSaved を state 化してレンダーを
      // 経由させる (usePreventRemove が preventRemove=false を読んだ後に goBack() する)
      setIsSaved(true);
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
    canEditCompetitionDetails,
    date,
    endDate,
    title,
    place,
    poolType,
    competitionNote,
    newImageFiles,
    savedImagePaths,
    deletedImageIds,
    showEntryTab,
    showRecordTab,
    entries,
    records,
    swimStyles,
    competitionTeamId,
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
    syncPendingVideoCount,
    t,
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
          isRelaying: false,
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
          const parsed = tv.trim() !== "" ? (parseTimeFlexible(tv) ?? 0) : 0;
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

  // ---- エントリータイム blur 時の確定・再フォーマット ----
  // parseTimeFlexible で構造ガードし、"1.23.45" のような入力もクイック解釈
  // (1:23.45) で確定する。解釈不能な入力のみ確定拒否 + エラー表示
  const handleEntryTimeBlur = useCallback(
    (draftId: string) => {
      setEntries((prev) =>
        prev.map((entry, index) => {
          if (entry.draftId !== draftId) return entry;
          const raw = entry.entryTimeDisplayValue.trim();
          if (raw === "") {
            setEntryErrors((prevErrors) => {
              const next = { ...prevErrors };
              delete next[`entryTime-${index}`];
              return next;
            });
            return { ...entry, entryTime: 0 };
          }
          const parsed = parseTimeFlexible(raw);
          if (parsed === null) {
            setEntryErrors((prevErrors) => ({
              ...prevErrors,
              [`entryTime-${index}`]: t("competition.entry.timeFormatInvalid"),
            }));
            return { ...entry, entryTime: 0 };
          }
          setEntryErrors((prevErrors) => {
            const next = { ...prevErrors };
            delete next[`entryTime-${index}`];
            return next;
          });
          return {
            ...entry,
            entryTime: parsed,
            entryTimeDisplayValue: formatTimeBest(parsed),
          };
        }),
      );
    },
    [t],
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
          videoPath: null,
          videoThumbnailPath: null,
        },
      ];
      setActiveRecordIndex(next.length - 1);
      return next;
    });
  }, [swimStyles]);

  const removeRecord = useCallback(
    (draftId: string) => {
      // setRecords の updater は純粋に保つ。ref の mutation と非 React state の同期は
      // updater の外で行うが、実行するかどうかの判定は updater 内の
      // `prev.length <= 1` チェックのみを唯一の権威とする。render スコープの
      // records.length (クロージャ固定値) で判定すると、同一 tick 内で連続削除された
      // 場合に古いクロージャの判定が権威と乖離し、行は残るのに保留動画だけ消える
      // データロスが起きうる。
      let didRemove = false;
      setRecords((prev) => {
        if (prev.length <= 1) return prev;
        didRemove = true;
        const removedIndex = prev.findIndex((r) => r.draftId === draftId);
        const next = prev.filter((r) => r.draftId !== draftId);
        setActiveRecordIndex((cur) => {
          const newLen = next.length;
          if (cur >= newLen) return newLen - 1;
          if (cur > removedIndex) return cur - 1;
          return cur;
        });
        return next;
      });
      if (didRemove) {
        pendingVideoAssetRef.current.delete(draftId);
        syncPendingVideoCount();
      }
    },
    [syncPendingVideoCount],
  );

  const updateRecord = useCallback(
    (draftId: string, updates: Partial<RecordDraftRow>) => {
      setRecords((prev) =>
        prev.map((r) => (r.draftId === draftId ? { ...r, ...updates } : r)),
      );
    },
    [],
  );

  // ---- 双方向リンク: entry[i] <-> record[i] (web CompetitionTabModal :733-774 と同一) ----
  const handleEntryStyleChange = useCallback(
    (draftId: string, index: number, styleId: string) => {
      updateEntry(draftId, { styleId });
      const linkedRecord = records[index];
      if (linkedRecord) {
        updateRecord(linkedRecord.draftId, { styleId });
      }
    },
    [updateEntry, updateRecord, records],
  );

  const handleEntryToggleRelaying = useCallback(
    (draftId: string, index: number, next: boolean) => {
      updateEntry(draftId, { isRelaying: next });
      const linkedRecord = records[index];
      if (linkedRecord) {
        updateRecord(linkedRecord.draftId, { isRelaying: next });
      }
    },
    [updateEntry, updateRecord, records],
  );

  const handleRecordStyleChange = useCallback(
    (draftId: string, index: number, styleId: string) => {
      updateRecord(draftId, { styleId });
      const linkedEntry = entries[index];
      if (linkedEntry) {
        updateEntry(linkedEntry.draftId, { styleId });
      }
    },
    [updateRecord, updateEntry, entries],
  );

  const handleRecordToggleRelaying = useCallback(
    (draftId: string, index: number, next: boolean) => {
      updateRecord(draftId, { isRelaying: next });
      const linkedEntry = entries[index];
      if (linkedEntry) {
        updateEntry(linkedEntry.draftId, { isRelaying: next });
      }
    },
    [updateRecord, updateEntry, entries],
  );

  // ---- タイム入力 ----
  // 入力中は生文字列を保持し、blur / 保存時の確定値と同じ parseTimeFlexible で
  // パースする (quick-carry コンテキストなし)。
  const handleRecordTimeChange = useCallback(
    (draftId: string, value: string) => {
      const newTime = parseTimeFlexible(value) ?? 0;
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
    [swimStyles],
  );

  // blur 時に確定値へ再フォーマット (web formatTimeBest と同一表示)。
  // parseTimeFlexible で構造ガードし、解釈不能な入力のみ確定せずエラー表示する
  const handleRecordTimeBlur = useCallback(
    (draftId: string) => {
      setRecords((prev) =>
        prev.map((r, index) => {
          if (r.draftId !== draftId) return r;
          const raw = r.timeDisplayValue.trim();
          if (raw === "") {
            setRecordErrors((prevErrors) => {
              const next = { ...prevErrors };
              delete next[`time-${index}`];
              return next;
            });
            return { ...r, time: 0 };
          }
          const parsed = parseTimeFlexible(raw);
          if (parsed === null) {
            setRecordErrors((prevErrors) => ({
              ...prevErrors,
              [`time-${index}`]: t("recordMobile.form.timeFormatInvalid"),
            }));
            return { ...r, time: 0 };
          }
          setRecordErrors((prevErrors) => {
            const next = { ...prevErrors };
            delete next[`time-${index}`];
            return next;
          });
          return {
            ...r,
            time: parsed,
            timeDisplayValue: formatTimeBest(parsed),
          };
        }),
      );
    },
    [t],
  );

  // ---- 反応時間: blur 時に shared/utils/reactionTime の範囲へクランプ ----
  const handleReactionTimeBlur = useCallback((draftId: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.draftId === draftId ? { ...r, reactionTime: normalizeReactionTime(r.reactionTime) } : r,
      ),
    );
  }, []);

  // ---- スプリットタイム操作 ----
  // Free プランの課金対象カウントはゴール地点スプリット (distance === raceDistance) を除外する
  // (web useRecordLogForm.countBillableSplitTimes と同一)
  const countBillableSplitTimes = useCallback(
    (record: RecordDraftRow): number => {
      const style = swimStyles.find((s) => s.id.toString() === record.styleId);
      const raceDistance = style?.distance;
      if (!raceDistance) return record.splitTimes.length;
      return record.splitTimes.filter(
        (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
      ).length;
    },
    [swimStyles],
  );

  const isSplitTimeLimitReached = useCallback(
    (draftId: string): boolean => {
      if (isPremium) return false;
      const record = records.find((r) => r.draftId === draftId);
      if (!record) return false;
      return countBillableSplitTimes(record) >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD;
    },
    [isPremium, records, countBillableSplitTimes],
  );

  const handleAddSplitTime = useCallback((draftId: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.draftId !== draftId) return r;
        if (
          !isPremium &&
          countBillableSplitTimes(r) >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD
        )
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
  }, [isPremium, countBillableSplitTimes]);

  // 25m/50m ごとの一括追加 (web useRecordLogForm handleAddSplitTimesEvery25m/50m と同一)
  const addSplitTimesEvery = useCallback(
    (draftId: string, interval: 25 | 50) => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.draftId !== draftId) return r;
          const style = swimStyles.find((s) => s.id.toString() === r.styleId);
          if (!style || !style.distance) return r;
          const raceDistance = style.distance;

          const existingDistances = new Set(
            r.splitTimes
              .map((st) =>
                typeof st.distance === "number"
                  ? st.distance
                  : st.distance === ""
                    ? null
                    : parseFloat(String(st.distance)) || null,
              )
              .filter((d): d is number => d !== null),
          );

          let newSplits: SplitTimeData[] = [];
          for (let distance = interval; distance <= raceDistance; distance += interval) {
            if (!existingDistances.has(distance)) {
              newSplits.push({ distance, splitTime: 0, splitTimeDisplayValue: "" });
            }
          }
          if (newSplits.length === 0) return r;

          // Free ユーザーは制限内に切り詰める (ゴール地点スプリットは常に許可)
          if (!isPremium) {
            const billableCount = countBillableSplitTimes(r);
            const maxNewBillable = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
            let billableAdded = 0;
            newSplits = newSplits.filter((st) => {
              const isRaceDist = typeof st.distance === "number" && st.distance === raceDistance;
              if (isRaceDist) return true;
              if (billableAdded < maxNewBillable) {
                billableAdded++;
                return true;
              }
              return false;
            });
            if (newSplits.length === 0) return r;
          }

          return { ...r, splitTimes: [...r.splitTimes, ...newSplits] };
        }),
      );
    },
    [swimStyles, isPremium, countBillableSplitTimes],
  );

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
            // blur / 保存時の確定値と同じ parseTimeFlexible 解釈。入力中は生文字列を保持する
            const parsedTime = value.trim() === "" ? 0 : (parseTimeFlexible(value) ?? 0);
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
    [],
  );

  const handleRemoveSplitTime = useCallback((draftId: string, splitIndex: number) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.draftId !== draftId) return r;
        return { ...r, splitTimes: r.splitTimes.filter((_, i) => i !== splitIndex) };
      }),
    );
  }, []);

  // スプリットタイムの blur 時に確定値へ再フォーマット (タイム欄と同じ UX)
  const handleSplitTimeBlur = useCallback(
    (draftId: string, splitIndex: number) => {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.draftId !== draftId) return r;
          const updatedSplitTimes = r.splitTimes.map((st, i) => {
            if (i !== splitIndex) return st;
            const parsed = parseTimeFlexible(st.splitTimeDisplayValue);
            if (parsed === null) return st;
            return {
              ...st,
              splitTimeDisplayValue: formatTimeBest(parsed),
              splitTime: parsed,
            };
          });
          return { ...r, splitTimes: updatedSplitTimes };
        }),
      );
    },
    [],
  );

  // スプリットタイムを距離昇順でソートして元インデックスを保持 (web RecordLogEntry :190-209)
  const getSortedSplitIndices = useCallback((splitTimes: SplitTimeData[]) => {
    return splitTimes
      .map((st, idx) => ({ st, idx }))
      .sort((a, b) => {
        const distA =
          typeof a.st.distance === "number"
            ? a.st.distance
            : parseFloat(String(a.st.distance)) || 0;
        const distB =
          typeof b.st.distance === "number"
            ? b.st.distance
            : parseFloat(String(b.st.distance)) || 0;
        if (distA === 0 && distB === 0) return a.idx - b.idx;
        if (distA === 0) return 1;
        if (distB === 0) return -1;
        return distA - distB;
      });
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

  // ---- フッターボタン用の前後タブ ----
  // record タブは showRecordTab=false (=未来日でエントリー表示中) のときガードする
  // (「次に進む」で無意味な非表示タブへ誘導しないため)
  const visibleTabs = useMemo((): CompetitionTab[] => {
    const result: CompetitionTab[] = ["competition"];
    if (showEntryTab) result.push("entry");
    result.push("record");
    return result;
  }, [showEntryTab]);
  const { prevTab, nextTab } = useMemo(
    () =>
      getTabNavAdjacency<CompetitionTab>(visibleTabs, activeTab, {
        guardedNextTab: "record",
        isGuarded: !showRecordTab,
      }),
    [visibleTabs, activeTab, showRecordTab],
  );

  // ---- ローディング ----
  if (loadingExisting || loadingStyles || isResolvingCompetitionPermission) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("competition.mobile.loadingInfo")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            {/* 編集権限なし (チーム大会の非管理者かつ非オーナー) の場合は読み取り専用にする */}
            {!canEditCompetitionDetails && (
              <View style={styles.guardMessage}>
                <Text style={styles.guardMessageText}>
                  {t("forms.tabModal.competitionEditRestricted")}
                </Text>
              </View>
            )}

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
                    disabled={isSaving || !canEditCompetitionDetails}
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
                    disabled={isSaving || !canEditCompetitionDetails}
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
                style={[styles.input, !canEditCompetitionDetails && styles.inputDisabled]}
                value={title}
                onChangeText={setTitle}
                placeholder={t("competition.form.namePlaceholder")}
                editable={!isSaving && canEditCompetitionDetails}
              />
            </View>

            {/* 場所 */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.form.placeLabel")}</Text>
              <TextInput
                style={[styles.input, !canEditCompetitionDetails && styles.inputDisabled]}
                value={place}
                onChangeText={setPlace}
                placeholder={t("competition.form.placePlaceholder")}
                editable={!isSaving && canEditCompetitionDetails}
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
                      !canEditCompetitionDetails && styles.pickerOptionDisabled,
                    ]}
                    onPress={() => setPoolType(type.value)}
                    disabled={isSaving || !canEditCompetitionDetails}
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
                style={[
                  styles.input,
                  styles.textArea,
                  !canEditCompetitionDetails && styles.inputDisabled,
                ]}
                value={competitionNote}
                onChangeText={setCompetitionNote}
                placeholder={t("competition.form.memoPlaceholder")}
                multiline
                numberOfLines={3}
                editable={!isSaving && canEditCompetitionDetails}
              />
            </View>

            {/* 画像 */}
            <View style={styles.section}>
              {canUploadImage(isPremium) ? (
                <ImageUploader
                  existingImages={existingImages}
                  onImagesChange={handleImagesChange}
                  maxImages={3}
                  disabled={isSaving || !canEditCompetitionDetails}
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

            <TimeInputHelp style={{ marginBottom: 12 }} />

            {/* 種目重複エラーバナー (web CompetitionTabModal entryValidationError と同一) */}
            {entryErrors.duplicate && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{entryErrors.duplicate}</Text>
              </View>
            )}

            {(() => {
              const entry = entries[activeEntryIndex];
              const index = activeEntryIndex;
              const entryStyle = entry
                ? swimStyles.find((s) => s.id.toString() === entry.styleId)
                : undefined;
              const entryBestTime = entry
                ? getBestTimeForEntry(
                    entryStyle?.name_jp ?? "",
                    poolType,
                    entry.isRelaying,
                    bestTimes,
                  )
                : null;
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
                  {/* ベストタイム参照バッジ (web CompetitionTabModal :1034-1040) */}
                  {entryBestTime && (
                    <View style={styles.bestTimeBadgeRow}>
                      <View style={styles.bestTimeBadge}>
                        <Text style={styles.bestTimeBadgeText}>
                          {t(entryBestTime.labelKey)}: {formatTimeBest(entryBestTime.time)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* 種目選択 (距離チップ × 泳法チップ + リレートグル) */}
                  <View style={styles.section}>
                    <Text style={styles.label}>
                      {t("competition.entry.styleLabel")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <StyleChipSelector
                      styles={swimStyles}
                      value={entry.styleId}
                      onChange={(styleId) =>
                        handleEntryStyleChange(entry.draftId, index, styleId)
                      }
                      disabled={isSaving}
                      isRelaying={entry.isRelaying}
                      onToggleRelaying={(next) =>
                        handleEntryToggleRelaying(entry.draftId, index, next)
                      }
                      relayLabel={t("forms.entry.relayLabel")}
                      testID={`entry-style-${index + 1}`}
                    />
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
                      onBlur={() => handleEntryTimeBlur(entry.draftId)}
                      placeholder={t("competition.entry.entryTimePlaceholder")}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="decimal-pad"
                      editable={!isSaving}
                    />
                    {entryErrors[`entryTime-${index}`] && (
                      <Text style={styles.errorText}>{entryErrors[`entryTime-${index}`]}</Text>
                    )}
                    {entry.entryTime > 0 && !entryErrors[`entryTime-${index}`] && (
                      <Text style={styles.timeHint}>
                        {t("competition.entry.inputValueHint", {
                          time: formatTimeBest(entry.entryTime),
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

            {showRecordTab && <TimeInputHelp style={{ marginBottom: 12 }} />}

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
              const recordStyle = record
                ? swimStyles.find((s) => s.id.toString() === record.styleId)
                : undefined;
              const raceDistance = recordStyle?.distance;
              // 同インデックスのエントリータイム (web RecordLogEntry entryInfo バッジ相当)
              const linkedEntryTime =
                record && entries[index] && entries[index].entryTime > 0
                  ? entries[index].entryTime
                  : null;
              // ベストタイム (水路フォールバック付き。web RecordLogEntry currentBestTime 相当)
              const recordBestTime = record
                ? getBestTimeForEntry(
                    recordStyle?.name_jp ?? "",
                    poolType,
                    record.isRelaying,
                    bestTimes,
                  )
                : null;
              // ラップタイムプレビュー用の有効スプリット (web RecordLogEntry :211-225)
              const validSplitTimes = record
                ? record.splitTimes
                    .map((st) => {
                      const distance =
                        typeof st.distance === "number"
                          ? st.distance
                          : st.distance === ""
                            ? NaN
                            : parseFloat(String(st.distance));
                      if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
                        return { distance, splitTime: st.splitTime };
                      }
                      return null;
                    })
                    .filter((st): st is { distance: number; splitTime: number } => st !== null)
                : [];
              return (
                <ItemTabs
                  count={records.length}
                  activeIndex={activeRecordIndex}
                  onSelect={setActiveRecordIndex}
                  onAdd={addRecord}
                  onRemove={(i) => {
                    const target = records[i];
                    if (target) removeRecord(target.draftId);
                  }}
                  label={(i) => t("recordMobile.form.recordNumber", { n: i + 1 })}
                  accent="blue"
                  disabled={isSaving}
                  testID="record-item-tabs"
                >
                  {record != null && (
                    <View key={record.draftId}>
                  {/* 参照バッジ: エントリータイム (blue) + ベストタイム (green) */}
                  {(linkedEntryTime != null || recordBestTime) && (
                    <View style={styles.bestTimeBadgeRow}>
                      {linkedEntryTime != null && (
                        <View style={styles.entryTimeBadge}>
                          <Text style={styles.entryTimeBadgeText}>
                            {t("forms.recordLog.entryTimeLabel")} {formatTimeBest(linkedEntryTime)}
                          </Text>
                        </View>
                      )}
                      {recordBestTime && (
                        <View style={styles.bestTimeBadge}>
                          <Text style={styles.bestTimeBadgeText}>
                            {t(recordBestTime.labelKey)}: {formatTimeBest(recordBestTime.time)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* 種目選択 (距離チップ × 泳法チップ + リレートグル) */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {t("recordMobile.form.styleLabel")}{" "}
                      <Text style={styles.required}>*</Text>
                    </Text>
                    <StyleChipSelector
                      styles={swimStyles}
                      value={record.styleId}
                      onChange={(styleId) =>
                        handleRecordStyleChange(record.draftId, index, styleId)
                      }
                      disabled={isSaving}
                      isRelaying={record.isRelaying}
                      onToggleRelaying={(next) =>
                        handleRecordToggleRelaying(record.draftId, index, next)
                      }
                      relayLabel={t("forms.recordLog.relayLabel")}
                      testID={`record-style-${index + 1}`}
                    />
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
                      onBlur={() => handleRecordTimeBlur(record.draftId)}
                      placeholder={t("recordMobile.form.timePlaceholder2")}
                      keyboardType="decimal-pad"
                      editable={!isSaving}
                    />
                    {recordErrors[`time-${index}`] && (
                      <Text style={styles.errorText}>{recordErrors[`time-${index}`]}</Text>
                    )}
                  </View>

                  {/* 反応時間 (web: step=0.01 / min=-1 / max=2) */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t("recordMobile.form.reactionTimeLabel")}</Text>
                    <TextInput
                      style={styles.input}
                      value={record.reactionTime}
                      onChangeText={(text) => updateRecord(record.draftId, { reactionTime: text })}
                      onBlur={() => handleReactionTimeBlur(record.draftId)}
                      placeholder={t("recordMobile.form.reactionTimePlaceholder")}
                      keyboardType="numbers-and-punctuation"
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

                  {/* 動画 (編集時は既存動画を表示し、削除・差し替え可能。web :1195-1197) */}
                  <View style={styles.field}>
                    <Text style={styles.label}>{t("recordMobile.form.videoLabel")}</Text>
                    <VideoUploader
                      key={record.draftId}
                      type="record"
                      id={record.existingRecordId}
                      existingVideoPath={record.videoPath}
                      existingThumbnailPath={record.videoThumbnailPath}
                      isPremium={isPremium}
                      onUploadComplete={(vPath, tPath) =>
                        updateRecord(record.draftId, {
                          videoPath: vPath,
                          videoThumbnailPath: tPath,
                        })
                      }
                      onDelete={() =>
                        updateRecord(record.draftId, {
                          videoPath: null,
                          videoThumbnailPath: null,
                        })
                      }
                      onPendingVideoAsset={(asset) => {
                        if (asset) {
                          pendingVideoAssetRef.current.set(record.draftId, asset);
                        } else {
                          pendingVideoAssetRef.current.delete(record.draftId);
                        }
                        syncPendingVideoCount();
                      }}
                    />
                  </View>

                  {/* スプリットタイム */}
                  <View style={styles.field}>
                    <View style={styles.splitTimeHeader}>
                      <Text style={styles.label}>{t("recordMobile.form.splitTimeLabel")}</Text>
                      <View style={styles.splitTimeButtons}>
                        <Pressable
                          style={[
                            styles.addSplitButton,
                            (!raceDistance || isSplitTimeLimitReached(record.draftId)) &&
                              styles.addButtonDisabled,
                          ]}
                          onPress={() => addSplitTimesEvery(record.draftId, 25)}
                          disabled={
                            isSaving || !raceDistance || isSplitTimeLimitReached(record.draftId)
                          }
                        >
                          <Text style={styles.addSplitButtonText}>
                            {t("recordMobile.form.addEvery25m")}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.addSplitButton,
                            (!raceDistance || isSplitTimeLimitReached(record.draftId)) &&
                              styles.addButtonDisabled,
                          ]}
                          onPress={() => addSplitTimesEvery(record.draftId, 50)}
                          disabled={
                            isSaving || !raceDistance || isSplitTimeLimitReached(record.draftId)
                          }
                        >
                          <Text style={styles.addSplitButtonText}>
                            {t("recordMobile.form.addEvery50m")}
                          </Text>
                        </Pressable>
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
                    </View>
                    {getSortedSplitIndices(record.splitTimes).map(
                      ({ st: splitTime, idx: splitIndex }) => (
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
                          onBlur={() => handleSplitTimeBlur(record.draftId, splitIndex)}
                          placeholder={t("recordMobile.form.splitPlaceholder")}
                          keyboardType="decimal-pad"
                          editable={!isSaving}
                        />
                        {/* ゴール地点スプリット (distance === raceDistance) は削除不可 (web :449-461) */}
                        {!(
                          typeof splitTime.distance === "number" &&
                          splitTime.distance === raceDistance
                        ) ? (
                          <Pressable
                            style={styles.removeButton}
                            onPress={() => handleRemoveSplitTime(record.draftId, splitIndex)}
                            disabled={isSaving}
                          >
                            <Feather name="trash-2" size={16} color="#EF4444" />
                          </Pressable>
                        ) : (
                          <View style={styles.removeButtonSpacer} />
                        )}
                      </View>
                      ),
                    )}

                    {/* ラップタイムプレビュー (web RecordLogEntry :468) */}
                    {validSplitTimes.length > 0 && (
                      <LapTimeDisplay
                        splitTimes={validSplitTimes}
                        raceDistance={raceDistance}
                      />
                    )}

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

      {/* 保存ボタン (画面下部固定) */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={styles.footerButtonRow}>
          {prevTab && (
            <Pressable
              style={[styles.outlineButton, isSaving && styles.buttonDisabled]}
              onPress={() => setActiveTab(prevTab)}
              disabled={isSaving}
              testID="competition-tab-form-back"
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
              isSaving && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={isSaving}
            testID="competition-tab-form-save"
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
              testID="competition-tab-form-next"
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
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
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
  pickerOptionDisabled: {
    opacity: 0.5,
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
  splitTimeHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 8,
  },
  splitTimeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  bestTimeBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  bestTimeBadge: {
    backgroundColor: "#DCFCE7", // green-100
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  bestTimeBadgeText: {
    fontSize: 12,
    color: "#15803D", // green-700
  },
  entryTimeBadge: {
    backgroundColor: "#DBEAFE", // blue-100
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  entryTimeBadgeText: {
    fontSize: 12,
    color: "#1D4ED8", // blue-700
  },
  removeButtonSpacer: {
    padding: 4,
    width: 24,
  },
  addSplitButton: {
    flex: 1,
    alignItems: "center",
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
});
