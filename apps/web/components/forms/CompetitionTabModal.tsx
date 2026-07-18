"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslations } from "next-intl";

import { format } from "date-fns";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DatePicker from "@/components/ui/DatePicker";
import PlaceCombobox from "@/components/ui/PlaceCombobox";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import CompetitionImageUploader from "@/components/forms/CompetitionImageUploader";
import PremiumBadge from "@/components/ui/PremiumBadge";
import RecordLogEntry from "@/components/forms/record-log/components/RecordLogEntry";
import { useRecordLogForm } from "@/components/forms/record-log/hooks";
import ItemTabs from "@/components/forms/ItemTabs";
import StyleChipSelector from "@/components/forms/StyleChipSelector";
import { useAuth } from "@/contexts";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { CompetitionAPI } from "@apps/shared/api";
import { isEntryTabVisible } from "@/utils/tabModalUtils";
import { isDefaultUntouchedEntry } from "@/utils/tabModalDiff";
import { useBestTimes } from "@/hooks/useBestTimes";
import { formatTimeBest } from "@/utils/formatters";
import { getBestTimeForEntry } from "@/utils/bestTimeForEntry";
import { parseTimeFlexible } from "@apps/shared/utils/time";
import type { CompetitionImageFile, ExistingImage } from "@/components/forms/CompetitionImageUploader";
import type { CompetitionImageData } from "@/components/forms/CompetitionBasicForm";
import type { RecordLogFormData } from "@/components/forms/record-log/types";
import type { StyleOption } from "@/components/forms/record-log/types";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { EditingData, CompetitionTabId, EntryFormData } from "@/stores/types";

const POOL_TYPES = [{ value: 0 }, { value: 1 }];

// =============================================================================
// Tab bar item with error dot
// =============================================================================

interface TabItemProps {
  id: CompetitionTabId;
  label: string;
  isActive: boolean;
  hasError: boolean;
  isHidden: boolean;
  onClick: () => void;
}

function TabItem({ id, label, isActive, hasError, isHidden, onClick }: TabItemProps) {
  if (isHidden) return null;
  return (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={`
        relative -mb-px whitespace-nowrap rounded-t-lg py-2.5 px-4 text-sm font-medium
        transition-colors flex items-center gap-1.5 select-none
        ${
          isActive
            ? "bg-blue-50 border border-gray-200 border-b-white text-blue-700 font-semibold"
            : "bg-gray-100 border border-transparent text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        }
      `}
    >
      {label}
      {hasError && (
        <span
          aria-label="error"
          className="inline-flex w-2 h-2 rounded-full bg-red-500 shrink-0"
        />
      )}
    </button>
  );
}

// =============================================================================
// Props
// =============================================================================

export interface CompetitionTabSaveParams {
  basicData: {
    date: string;
    endDate: string;
    title: string;
    place: string;
    poolType: number;
    note: string;
  };
  imageData?: CompetitionImageData;
  entries: EntryFormData[];
  records: Array<RecordLogFormData & { id?: string }>;
  editingCompetitionId: string | null;
  /** 編集前に DB に存在していたエントリー ID 一覧 */
  originalEntryIds: string[];
  /** 編集前に DB に存在していたレコード ID 一覧 */
  originalRecordIds: string[];
}

export interface CompetitionTabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: CompetitionTabSaveParams) => Promise<void>;
  selectedDate: Date;
  editingData: EditingData | null;
  editingCompetitionId: string | null;
  styles: StyleOption[];
  /** 編集時の既存エントリー一覧（レコードタブで参照） */
  existingEntries?: EntryInfo[];
  isLoading: boolean;
  initialTab?: CompetitionTabId;
  /** エントリー編集をロックする（チーム大会で entry_status が open でない場合など）。true のとき記録入力のみ許可 */
  entryLocked?: boolean;
}

// =============================================================================
// Entry draft type (internal only)
// =============================================================================

interface EntryDraft {
  id: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

// =============================================================================
// Main component
// =============================================================================

export default function CompetitionTabModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  editingData,
  editingCompetitionId,
  styles,
  existingEntries = [],
  isLoading,
  initialTab = "competition",
  entryLocked = false,
}: CompetitionTabModalProps) {
  const t = useTranslations("forms.competition");
  const tEntry = useTranslations("forms.entry");
  const tRecord = useTranslations("forms.recordLog");
  const tTabModal = useTranslations("forms.tabModal");
  const tPremium = useTranslations("forms.premium");
  const tTimeError = useTranslations("bulkBestTime.error");
  const { subscription, user, supabase } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const { bestTimes, loadBestTimes } = useBestTimes(supabase);

  // ---------------------------------------------------------------------------
  // Active tab
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<CompetitionTabId>(initialTab);

  // ---------------------------------------------------------------------------
  // Competition basic tab state
  // ---------------------------------------------------------------------------
  const [basicData, setBasicData] = useState({
    date: "",
    endDate: "",
    title: "",
    place: "",
    poolType: 0,
    note: "",
  });
  const [imageData, setImageData] = useState<CompetitionImageData>({ newFiles: [], deletedIds: [] });
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([]);
  const [basicValidationError, setBasicValidationError] = useState<string | null>(null);

  // Entry tab visible only when date is future かつエントリーがロックされていない
  // entryLocked: チーム大会で entry_status が open でない場合などに記録入力のみ許可する
  const showEntryTab = useMemo(
    () => !entryLocked && isEntryTabVisible(basicData.date),
    [entryLocked, basicData.date],
  );

  // Record tab shows form only when date is today or past (not future).
  // isEntryTabVisible returns true for future dates, so negating it gives us today/past/empty.
  // Empty/invalid date → isEntryTabVisible returns false → showRecordTab=true (safe side: show form).
  const showRecordTab = useMemo(
    () => !isEntryTabVisible(basicData.date),
    [basicData.date],
  );

  // If entry tab hidden and active, switch back to competition
  useEffect(() => {
    if (!showEntryTab && activeTab === "entry") {
      setActiveTab("competition");
    }
  }, [showEntryTab, activeTab]);

  // ---------------------------------------------------------------------------
  // Entry tab state
  // ---------------------------------------------------------------------------
  const [entries, setEntries] = useState<EntryDraft[]>([
    {
      id: "entry-1",
      styleId: styles[0]?.id?.toString() || "",
      entryTime: 0,
      entryTimeDisplayValue: "",
      note: "",
      isRelaying: false,
    },
  ]);
  // 1行目のエントリーに自動セットされたデフォルト種目ID (未編集判定用)。
  // 上の useState 初期値と同一の式・同一タイミングで固定し、以後 styles prop が
  // 変化しても handleSave 時の判定基準がズレないようにする。
  const defaultEntryStyleIdRef = useRef(styles[0]?.id?.toString() || "");
  const [entryValidationError, setEntryValidationError] = useState<string | null>(null);
  const [originalEntryIds, setOriginalEntryIds] = useState<string[]>([]);
  const [originalRecordIds, setOriginalRecordIds] = useState<string[]>([]);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [activeRecordIndex, setActiveRecordIndex] = useState(0);
  const [initialRecords, setInitialRecords] = useState<import("@/components/forms/record-log/types").RecordLogEditData[] | undefined>(undefined);
  const initialEntriesSnapshotRef = useRef<string>("");
  const initialRecordsSnapshotRef = useRef<string>("");

  // ---------------------------------------------------------------------------
  // Record tab state — useRecordLogForm
  // ---------------------------------------------------------------------------
  const recordEditData = useMemo(() => {
    if (!editingData || typeof editingData !== "object") return null;
    const d = editingData as Record<string, unknown>;
    if (!("styleId" in d)) return null;
    return {
      id: d.id as string | undefined,
      styleId: d.styleId as number | undefined,
      time: d.time as number | undefined,
      isRelaying: d.isRelaying as boolean | undefined,
      splitTimes: d.splitTimes as Array<{ distance: number; splitTime: number }> | undefined,
      note: d.note as string | undefined,
      videoPath: d.videoPath as string | null | undefined,
      reactionTime: d.reactionTime as number | null | undefined,
    };
  }, [editingData]);

  const entryDataListForRecord = useMemo<EntryInfo[]>(() => {
    if (existingEntries.length > 0) return existingEntries;
    return entries
      .filter((e) => e.styleId)
      .map((e) => {
        const style = styles.find((s) => s.id?.toString() === e.styleId);
        return {
          styleId: parseInt(e.styleId),
          styleName: style?.nameJp || "",
          entryTime: e.entryTime > 0 ? e.entryTime : undefined,
        };
      });
  }, [existingEntries, entries, styles]);

  const {
    formDataList: recordFormDataList,
    handleTimeChange: handleRecordTimeChange,
    handleToggleRelaying: handleRecordToggleRelaying,
    handleNoteChange: handleRecordNoteChange,
    handleVideoPathChange: handleRecordVideoPathChange,
    handlePendingFileChange: handleRecordPendingFileChange,
    handleReactionTimeChange: handleRecordReactionTimeChange,
    handleStyleChange: handleRecordStyleChange,
    handleAddSplitTime: handleRecordAddSplitTime,
    handleAddSplitTimesEvery25m: handleRecordAddSplitTimesEvery25m,
    handleAddSplitTimesEvery50m: handleRecordAddSplitTimesEvery50m,
    handleRemoveSplitTime: handleRecordRemoveSplitTime,
    handleSplitTimeChange: handleRecordSplitTimeChange,
    prepareSubmitData: prepareRecordSubmitData,
    isSplitTimeLimitReached: isRecordSplitTimeLimitReached,
    addFormData: addRecordFormData,
    removeFormData: removeRecordFormData,
  } = useRecordLogForm({
    isOpen,
    editData: initialRecords ? undefined : recordEditData,
    initialRecords,
    entryDataList: entryDataListForRecord,
    styles,
    isPremium,
  });

  // Load best times when modal opens
  useEffect(() => {
    if (isOpen && user?.id) {
      void loadBestTimes(user.id);
    }
  }, [isOpen, user?.id, loadBestTimes]);

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  const [isInitialized, setIsInitialized] = useState(false);
  const initialDraftRef = useRef<string>("");
  const [tabErrors, setTabErrors] = useState<Record<CompetitionTabId, boolean>>({
    competition: false,
    entry: false,
    record: false,
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  const skipPopstateRef = useRef(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setActiveTab(initialTab);
      setBasicData({ date: "", endDate: "", title: "", place: "", poolType: 0, note: "" });
      setImageData({ newFiles: [], deletedIds: [] });
      setBasicValidationError(null);
      setEntryValidationError(null);
      setTabErrors({ competition: false, entry: false, record: false });
      setIsSubmitted(false);
      setShowConfirmDialog(false);
      isSubmittingRef.current = false;
      initialDraftRef.current = "";
      setOriginalEntryIds([]);
      setOriginalRecordIds([]);
      setInitialRecords(undefined);
      setActiveEntryIndex(0);
      setActiveRecordIndex(0);
      initialEntriesSnapshotRef.current = "";
      initialRecordsSnapshotRef.current = "";
      return;
    }
    if (isInitialized) return;

    let initial = {
      date: format(selectedDate, "yyyy-MM-dd"),
      endDate: "",
      title: "",
      place: "",
      poolType: 0,
      note: "",
    };

    if (editingData && typeof editingData === "object") {
      const d = editingData as Record<string, unknown>;
      if ("title" in d) {
        initial = {
          date: (d.date as string) || format(selectedDate, "yyyy-MM-dd"),
          endDate: (d.end_date as string) || "",
          title: (d.title as string) || "",
          place: (d.place as string) || "",
          poolType: (d.pool_type as number) ?? 0,
          note: (d.note as string) || "",
        };
      } else if ("editData" in d && d.editData) {
        const editPayload = d.editData as Record<string, unknown>;
        const comp = editPayload.competition as Record<string, unknown> | undefined;
        initial = {
          date: (comp?.date as string) || (editPayload.date as string) || format(selectedDate, "yyyy-MM-dd"),
          endDate: (comp?.end_date as string) || "",
          title: (comp?.title as string) || "",
          place: (comp?.place as string) || "",
          poolType: (comp?.pool_type as number) ?? 0,
          note: (comp?.note as string) || "",
        };
        const rawEntries = editPayload.entries as Array<Record<string, unknown>> | undefined;
        if (rawEntries && rawEntries.length > 0) {
          const drafts = rawEntries.map((entry, idx) => {
            const rawTime = Number(entry.entryTime ?? entry.entry_time ?? 0);
            return {
              id: String(entry.id ?? `entry-${idx + 1}`),
              styleId: String(entry.styleId ?? entry.style_id ?? ""),
              entryTime: rawTime,
              entryTimeDisplayValue: rawTime > 0 ? formatTimeBest(rawTime) : "",
              note: String(entry.note ?? ""),
              isRelaying: Boolean(entry.isRelaying ?? entry.is_relaying ?? false),
            };
          });
          setEntries(drafts);
          // DB UUID を持つエントリーの ID を originalEntryIds に保存
          const dbIds = drafts
            .map((d) => d.id)
            .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
          setOriginalEntryIds(dbIds);
          initialEntriesSnapshotRef.current = JSON.stringify(drafts);
        }
      }
    }

    setBasicData(initial);
    initialDraftRef.current = JSON.stringify(initial);
    setIsInitialized(true);
    setActiveTab(initialTab);
  }, [isOpen, isInitialized, editingData, selectedDate, initialTab]);

  // 編集モード: competition_id に紐づく全エントリーを DB から取得してフォームを初期化
  // rawEntries(editData.editData.entries)が既にある場合はスキップ(二重ロード防止)
  useEffect(() => {
    if (!isOpen || !isInitialized || !editingCompetitionId || !user?.id) return;
    if (originalEntryIds.length > 0) return; // 既にフェッチ済み(rawEntriesまたは前回のfetch)

    const fetchEntries = async () => {
      const { data } = await supabase
        .from("entries")
        .select("id, style_id, entry_time, note, is_relaying")
        .eq("competition_id", editingCompetitionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) return;

      const rows = data as Array<{
        id: string;
        style_id: number;
        entry_time: number | null;
        note: string | null;
        is_relaying: boolean | null;
      }>;

      const drafts: EntryDraft[] = rows.map((r) => {
        const rawTime = r.entry_time ?? 0;
        return {
          id: r.id,
          styleId: String(r.style_id),
          entryTime: rawTime,
          entryTimeDisplayValue: rawTime > 0 ? formatTimeBest(rawTime) : "",
          note: r.note ?? "",
          isRelaying: r.is_relaying ?? false,
        };
      });

      setEntries(drafts);
      const ids = rows.map((r) => r.id);
      setOriginalEntryIds(ids);
      // snapshot は EntryDraft[] で取る(hasUnsavedChangesと型を揃える)
      initialEntriesSnapshotRef.current = JSON.stringify(drafts);
    };

    fetchEntries().catch(() => {});
  }, [isOpen, isInitialized, editingCompetitionId, user?.id, originalEntryIds.length, supabase]);

  // 編集モード: competition_id に紐づく全レコードを DB から取得してフォームを初期化
  useEffect(() => {
    if (!isOpen || !isInitialized || !editingCompetitionId || !user?.id) return;
    if (originalRecordIds.length > 0) return; // 既にフェッチ済み

    const fetchRecords = async () => {
      const { data } = await supabase
        .from("records")
        .select("id, style_id, time, is_relaying, note, video_path, reaction_time")
        .eq("competition_id", editingCompetitionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) return;

      const rows = data as Array<{
        id: string;
        style_id: number;
        time: number;
        is_relaying: boolean;
        note: string | null;
        video_path: string | null;
        reaction_time: number | null;
      }>;

      const ids = rows.map((r) => r.id);
      setOriginalRecordIds(ids);

      const records: import("@/components/forms/record-log/types").RecordLogEditData[] = rows.map((r) => ({
        id: r.id,
        styleId: r.style_id,
        time: r.time,
        isRelaying: r.is_relaying,
        note: r.note ?? undefined,
        videoPath: r.video_path ?? null,
        reactionTime: r.reaction_time ?? null,
      }));
      setInitialRecords(records);
    };

    fetchRecords().catch(() => {});
  }, [isOpen, isInitialized, editingCompetitionId, user?.id, originalRecordIds.length, supabase]);

  // initialRecords が hook に反映されて recordFormDataList が populate された後に snapshot を取る
  // 長さが一致 かつ 先頭 styleId が initialRecords 由来の値と一致した時点で hook の反映が完了している
  useEffect(() => {
    if (!isOpen || initialRecordsSnapshotRef.current !== "" || initialRecords == null) return;
    if (recordFormDataList.length !== initialRecords.length) return;
    const firstExpectedStyleId = initialRecords[0]?.styleId?.toString() ?? "";
    if (firstExpectedStyleId && recordFormDataList[0]?.styleId !== firstExpectedStyleId) return;
    initialRecordsSnapshotRef.current = JSON.stringify(recordFormDataList);
  }, [isOpen, initialRecords, recordFormDataList]);

  // Fetch place suggestions
  useEffect(() => {
    if (!isOpen) return;
    const api = new CompetitionAPI(supabase);
    api.getUniqueCompetitionPlaces().then(setPlaceSuggestions).catch(() => {});
  }, [isOpen, supabase]);

  // ---------------------------------------------------------------------------
  // Unsaved-change detection
  // ---------------------------------------------------------------------------
  const hasUnsavedChanges = useMemo(() => {
    if (!isOpen || !isInitialized) return false;
    const basicChanged = JSON.stringify(basicData) !== initialDraftRef.current;
    const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0;
    const entriesSnapshot = initialEntriesSnapshotRef.current;
    const entriesChanged = entriesSnapshot !== "" && JSON.stringify(entries) !== entriesSnapshot;
    const recordsSnapshot = initialRecordsSnapshotRef.current;
    const recordsChanged = recordsSnapshot !== "" && JSON.stringify(recordFormDataList) !== recordsSnapshot;
    return basicChanged || hasImageChanges || entriesChanged || recordsChanged;
  }, [isOpen, isInitialized, basicData, imageData, entries, recordFormDataList]);

  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const handlePopState = () => {
      if (skipPopstateRef.current) {
        skipPopstateRef.current = false;
        return;
      }
      window.history.pushState(null, "", window.location.href);
      setConfirmContext("back");
      setShowConfirmDialog(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  const validateAll = useCallback((): boolean => {
    const errors: Record<CompetitionTabId, boolean> = {
      competition: false,
      entry: false,
      record: false,
    };

    if (!basicData.date) errors.competition = true;
    if (basicData.endDate && basicData.endDate < basicData.date) errors.competition = true;

    // エントリータブ: style_id 重複チェック + タイム形式チェック
    if (showEntryTab) {
      const styleIds = entries.filter((e) => e.styleId).map((e) => e.styleId);
      const hasDuplicate = styleIds.length !== new Set(styleIds).size;
      // 解釈不能な形式は entryTime=0 のまま静かに保存しない
      const hasInvalidEntryTime = entries.some(
        (e) => e.entryTimeDisplayValue.trim() !== "" && parseTimeFlexible(e.entryTimeDisplayValue) === null,
      );
      if (hasDuplicate) {
        errors.entry = true;
        setEntryValidationError(tTabModal("duplicateEntryStyle"));
      } else if (hasInvalidEntryTime) {
        errors.entry = true;
        setEntryValidationError(tTimeError("invalidTimeFormat"));
      } else {
        setEntryValidationError(null);
      }
    }

    // レコードタブ: 未来日ガード中はバリデーションをスキップ
    // (showRecordTab === false のときレコードは保存しないので検証不要)

    setTabErrors(errors);

    const firstError = (["competition", "entry", "record"] as CompetitionTabId[]).find(
      (tab) => errors[tab],
    );
    if (firstError) {
      setActiveTab(firstError);
      if (firstError === "competition") {
        if (!basicData.date) {
          setBasicValidationError(t("start_date_label") + " " + tTabModal("fieldRequired"));
        } else {
          setBasicValidationError(t("end_date_error"));
        }
      }
      return false;
    }
    return true;
  }, [basicData.date, basicData.endDate, showEntryTab, entries, t, tTabModal, tTimeError]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!validateAll()) return;

    isSubmittingRef.current = true;
    setIsSubmitted(true);

    try {
      const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0;

      // 未編集のデフォルト行(種目・タイム・メモ・リレーいずれも初期値のまま)は
      // ユーザーが一度も触れていない行として保存対象から除外する(行数に関係ない per-row 判定)。
      const entryFormData: EntryFormData[] = entries
        .filter((e) => !isDefaultUntouchedEntry(e, defaultEntryStyleIdRef.current))
        .map((e) => ({
          id: e.id,
          styleId: e.styleId,
          entryTime: e.entryTime,
          note: e.note,
          isRelaying: e.isRelaying,
        }));

      // レコードタブ: 未来日ガード中はレコードを一切変更しない。
      // records と originalRecordIds の両方を空にして diff を no-op にする（既存レコードの誤削除防止）。
      let recordListWithIds: Array<RecordLogFormData & { id?: string }> = [];
      let effectiveOriginalRecordIds: string[] = [];
      if (showRecordTab) {
        const { hasStyleError, hasTimeFormatError, submitList: recordList } =
          prepareRecordSubmitData();
        if (hasStyleError || hasTimeFormatError) {
          setTabErrors((prev) => ({ ...prev, record: true }));
          setActiveTab("record");
          isSubmittingRef.current = false;
          setIsSubmitted(false);
          return;
        }
        // 編集時は既存レコードの DB ID をインデックス順に注入する
        recordListWithIds = recordList.map((r, i) => ({
          ...r,
          id: originalRecordIds[i],
        }));
        effectiveOriginalRecordIds = originalRecordIds;
      }

      await onSave({
        basicData,
        imageData: hasImageChanges ? imageData : undefined,
        // エントリータブ非表示時（今日・過去 / entryLocked）はエントリーを一切変更しない。
        // entries と originalEntryIds の両方を空にして diff を no-op にする（既存エントリーの誤削除防止）。
        entries: showEntryTab ? entryFormData : [],
        records: recordListWithIds,
        editingCompetitionId,
        originalEntryIds: showEntryTab ? originalEntryIds : [],
        originalRecordIds: effectiveOriginalRecordIds,
      });
    } catch (error) {
      console.error("大会一括保存に失敗しました:", error);
      isSubmittingRef.current = false;
      setIsSubmitted(false);
      if (error instanceof Error && error.message) {
        setBasicValidationError(error.message);
        setActiveTab("competition");
      }
    }
  }, [
    validateAll,
    basicData,
    imageData,
    entries,
    prepareRecordSubmitData,
    showEntryTab,
    showRecordTab,
    editingCompetitionId,
    originalEntryIds,
    originalRecordIds,
    onSave,
  ]);

  // ---------------------------------------------------------------------------
  // Close handling
  // ---------------------------------------------------------------------------
  const cleanupAndClose = useCallback(() => {
    imageData.newFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setShowConfirmDialog(false);
    onClose();
  }, [imageData, onClose]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext("close");
      setShowConfirmDialog(true);
      return;
    }
    cleanupAndClose();
  }, [hasUnsavedChanges, isSubmitted, cleanupAndClose]);

  const handleConfirmClose = useCallback(() => {
    if (confirmContext === "back") {
      skipPopstateRef.current = true;
      window.history.back();
    }
    cleanupAndClose();
  }, [confirmContext, cleanupAndClose]);

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Entry helpers
  // ---------------------------------------------------------------------------
  const addEntry = useCallback(() => {
    setEntries((prev) => [
      ...prev,
      {
        id: `entry-${Date.now()}`,
        styleId: defaultEntryStyleIdRef.current,
        entryTime: 0,
        entryTimeDisplayValue: "",
        note: "",
        isRelaying: false,
      },
    ]);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateEntry = useCallback(
    (id: string, updates: Partial<EntryDraft>) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
      setEntryValidationError(null);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Bidirectional style link: entry[i] <-> record[i]
  // ---------------------------------------------------------------------------

  // Entry style changed → also update record[index] if it exists
  const handleEntryStyleChange = useCallback(
    (entryId: string, entryIndex: number, styleId: string) => {
      updateEntry(entryId, { styleId });
      if (showEntryTab && recordFormDataList[entryIndex] !== undefined) {
        handleRecordStyleChange(entryIndex, styleId);
      }
    },
    [updateEntry, showEntryTab, recordFormDataList, handleRecordStyleChange],
  );

  // Record style changed → also update entry[index] if it exists (and entry tab is relevant)
  const handleLinkedRecordStyleChange = useCallback(
    (recordIndex: number, styleId: string) => {
      handleRecordStyleChange(recordIndex, styleId);
      if (showEntryTab && entries[recordIndex] !== undefined) {
        updateEntry(entries[recordIndex].id, { styleId });
      }
    },
    [handleRecordStyleChange, showEntryTab, entries, updateEntry],
  );

  // Entry relay toggled → also sync the linked record[index] (style と同じくリンク)
  const handleEntryToggleRelaying = useCallback(
    (entryId: string, entryIndex: number, next: boolean) => {
      updateEntry(entryId, { isRelaying: next });
      if (showEntryTab && recordFormDataList[entryIndex] !== undefined) {
        handleRecordToggleRelaying(entryIndex, next);
      }
    },
    [updateEntry, showEntryTab, recordFormDataList, handleRecordToggleRelaying],
  );

  // Record relay toggled → also update entry[index] if it exists
  const handleLinkedRecordToggleRelaying = useCallback(
    (recordIndex: number, checked: boolean) => {
      handleRecordToggleRelaying(recordIndex, checked);
      if (showEntryTab && entries[recordIndex] !== undefined) {
        updateEntry(entries[recordIndex].id, { isRelaying: checked });
      }
    },
    [handleRecordToggleRelaying, showEntryTab, entries, updateEntry],
  );

  // ---------------------------------------------------------------------------
  // Existing images for image uploader
  // ---------------------------------------------------------------------------
  const existingImages = useMemo<ExistingImage[] | undefined>(() => {
    if (!editingData || typeof editingData !== "object") return undefined;
    const d = editingData as Record<string, unknown>;
    const editPayload = d.editData as Record<string, unknown> | undefined;
    return editPayload?.images as ExistingImage[] | undefined;
  }, [editingData]);

  if (!isOpen) return null;

  const tabs: Array<{ id: CompetitionTabId; label: string; hidden: boolean }> = [
    { id: "competition", label: t("tabs.competition"), hidden: false },
    { id: "entry", label: t("tabs.entry"), hidden: !showEntryTab },
    { id: "record", label: t("tabs.record"), hidden: false },
  ];

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="competition-tab-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Overlay */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />

        {/* Modal content */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-white px-6 pt-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editingData ? t("title_edit") : t("title_create")}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label={tTabModal("close")}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="mt-3">
              <nav
                className="flex items-end gap-1"
                role="tablist"
                aria-label={t("title_create")}
              >
                {tabs.map((tab) => (
                  <TabItem
                    key={tab.id}
                    id={tab.id}
                    label={tab.label}
                    isActive={activeTab === tab.id}
                    hasError={tabErrors[tab.id]}
                    isHidden={tab.hidden}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </nav>
            </div>
          </div>

          {/* Tab panels */}
          <div className="flex-1 overflow-y-auto">
            {/* ---- Competition tab ---- */}
            <div
              role="tabpanel"
              hidden={activeTab !== "competition"}
              className="p-4 sm:p-6 space-y-4"
            >
              {basicValidationError && (
                <div
                  role="alert"
                  className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"
                >
                  {basicValidationError}
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <DatePicker
                  label={t("start_date_label")}
                  value={basicData.date}
                  onChange={(date) => {
                    setBasicData((prev) => ({ ...prev, date }));
                    setBasicValidationError(null);
                  }}
                  required
                  placeholder={t("start_date_label")}
                  data-testid="competition-tab-date"
                />
                <DatePicker
                  label={t("end_date_label")}
                  value={basicData.endDate}
                  onChange={(date) => {
                    setBasicData((prev) => ({ ...prev, endDate: date }));
                    setBasicValidationError(null);
                  }}
                  minDate={basicData.date ? new Date(basicData.date) : undefined}
                  placeholder=""
                  popupAlign="right"
                  data-testid="competition-tab-end-date"
                />
              </div>

              {/* Name, Place, PoolType */}
              <div className="grid grid-cols-[auto_1fr] gap-x-2 sm:gap-x-4 gap-y-1.5 sm:gap-y-4 items-center">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {t("name_label")}
                </label>
                <Input
                  type="text"
                  value={basicData.title}
                  onChange={(e) => setBasicData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder={t("name_placeholder")}
                  data-testid="competition-tab-title"
                />

                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {t("place_label")}
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <PlaceCombobox
                      value={basicData.place}
                      onChange={(value) => setBasicData((prev) => ({ ...prev, place: value }))}
                      suggestions={placeSuggestions}
                      placeholder="TAC"
                      data-testid="competition-tab-place"
                    />
                  </div>
                  <div
                    className="flex shrink-0"
                    role="group"
                    aria-label={t("pool_type_label")}
                    data-testid="competition-tab-pool-type"
                  >
                    {POOL_TYPES.map((type, idx) => {
                      const isActive = basicData.poolType === type.value;
                      const isFirst = idx === 0;
                      const isLast = idx === POOL_TYPES.length - 1;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() =>
                            setBasicData((prev) => ({ ...prev, poolType: type.value }))
                          }
                          aria-pressed={isActive}
                          className={`h-8 sm:h-10 px-3 border text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isFirst ? "rounded-l-md" : ""
                          } ${isLast ? "rounded-r-md" : ""} ${!isFirst ? "-ml-px" : ""} ${
                            isActive
                              ? "relative z-10 bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                          }`}
                          data-testid={`competition-tab-pool-type-${type.value}`}
                        >
                          {type.value === 0 ? t("pool_short") : t("pool_long")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("note_label")}
                </label>
                <textarea
                  value={basicData.note}
                  onChange={(e) => setBasicData((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder={t("note_placeholder")}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="competition-tab-note"
                />
              </div>

              {/* Image upload（Free でも画像は許可。動画のみ Premium 限定） */}
              <div>
                {canUploadImage(isPremium) ? (
                  <CompetitionImageUploader
                    existingImages={existingImages}
                    onImagesChange={(newFiles: CompetitionImageFile[], deletedIds: string[]) =>
                      setImageData({ newFiles, deletedIds })
                    }
                    disabled={isLoading}
                  />
                ) : (
                  <PremiumBadge message={tPremium("imageUpload")} />
                )}
              </div>
            </div>

            {/* ---- Entry tab ---- */}
            {showEntryTab && (
              <div
                role="tabpanel"
                hidden={activeTab !== "entry"}
                className="p-3 sm:p-6 space-y-3 sm:space-y-6"
              >
                {entryValidationError && (
                  <div
                    role="alert"
                    className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3"
                  >
                    {entryValidationError}
                  </div>
                )}

                <p className="text-[10px] sm:text-sm text-gray-600 whitespace-pre-line">
                  {tEntry("subtitle")}
                </p>

                {(() => {
                  const clampedIndex = Math.min(activeEntryIndex, entries.length - 1);
                  const entry = entries[clampedIndex];
                  const entryStyleName = entry
                    ? (styles.find((s) => s.id.toString() === entry.styleId)?.nameJp ?? "")
                    : "";
                  const entryBestTime = entry
                    ? getBestTimeForEntry(
                        entryStyleName,
                        basicData.poolType,
                        entry.isRelaying,
                        bestTimes,
                      )
                    : null;
                  return (
                    <ItemTabs
                      count={entries.length}
                      activeIndex={clampedIndex}
                      onSelect={setActiveEntryIndex}
                      onAdd={() => {
                        addEntry();
                        setActiveEntryIndex(entries.length);
                      }}
                      onRemove={(i) => {
                        const target = entries[i];
                        if (!target) return;
                        removeEntry(target.id);
                        setActiveEntryIndex((prev) => Math.min(prev, entries.length - 2));
                      }}
                      label={(i) => tEntry("eventHeader", { n: i + 1 })}
                      accent="blue"
                      disabled={isLoading}
                      testIdPrefix="entry"
                      addLabel={tEntry("addEvent")}
                    >
                      {entry && (
                        <div key={entry.id} className="flex flex-col gap-3 sm:gap-4">
                          {/* ベストタイムバッジ（タブ内の一番上） */}
                          {entryBestTime && (
                            <div className="self-start text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
                              <span className="text-green-700">
                                {tRecord(entryBestTime.labelKey)}: {formatTimeBest(entryBestTime.time)}
                              </span>
                            </div>
                          )}

                          {/* Style（距離チップ × 泳法チップ。レコード入力と同じUI） */}
                          <div>
                            <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-1">
                              <span className="sm:hidden">{tEntry("styleLabelShort")}</span>
                              <span className="hidden sm:inline">{tEntry("styleLabel")}</span>{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <StyleChipSelector
                              styles={styles}
                              value={entry.styleId}
                              onChange={(styleId) =>
                                handleEntryStyleChange(entry.id, clampedIndex, styleId)
                              }
                              disabled={isLoading}
                              testIdPrefix={`entry-style-${clampedIndex + 1}`}
                              isRelaying={entry.isRelaying}
                              onToggleRelaying={(next) =>
                                handleEntryToggleRelaying(entry.id, clampedIndex, next)
                              }
                              relayLabel={tEntry("relayLabel")}
                            />
                          </div>

                          {/* エントリータイム + メモ を1行に */}
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                            {/* Entry time */}
                            <div className="flex items-start gap-2 sm:flex-1">
                              <label className="text-[10px] sm:text-sm font-medium text-gray-700 whitespace-nowrap shrink-0 h-8 sm:h-10 flex items-center">
                                <span className="sm:hidden">{tEntry("timeLabelShort")}</span>
                                <span className="hidden sm:inline">{tEntry("timeLabel")}</span>
                              </label>
                              <div className="flex-1 min-w-0">
                                <Input
                                  type="text"
                                  value={entry.entryTimeDisplayValue}
                                  onChange={(e) => {
                                    // 構造ガード: "1.23.45" 等はクイック解釈で受理。解釈不能なら 0 のまま
                                    const parsed = parseTimeFlexible(e.target.value);
                                    updateEntry(entry.id, {
                                      entryTimeDisplayValue: e.target.value,
                                      entryTime: parsed ?? 0,
                                    });
                                  }}
                                  onBlur={(e) => {
                                    const parsed = parseTimeFlexible(e.target.value);
                                    updateEntry(entry.id, {
                                      // 不正形式は入力値を残してエラー表示する（誤値で整形しない）
                                      entryTimeDisplayValue:
                                        parsed !== null ? formatTimeBest(parsed) : e.target.value,
                                      entryTime: parsed ?? 0,
                                    });
                                  }}
                                  placeholder="1:23.45"
                                  className="w-full h-8 sm:h-10"
                                  disabled={isLoading}
                                  data-testid={`entry-time-${clampedIndex + 1}`}
                                />
                                {entry.entryTimeDisplayValue.trim() !== "" &&
                                  parseTimeFlexible(entry.entryTimeDisplayValue) === null && (
                                    <p
                                      className="mt-1 text-xs text-red-600"
                                      data-testid={`entry-time-error-${clampedIndex + 1}`}
                                    >
                                      {tTimeError("invalidTimeFormat")}
                                    </p>
                                  )}
                              </div>
                            </div>

                            {/* Note */}
                            <div className="flex items-start gap-2 sm:flex-1">
                              <label className="text-[10px] sm:text-sm font-medium text-gray-700 whitespace-nowrap shrink-0 h-8 sm:h-10 flex items-center">
                                {tEntry("noteLabel")}
                              </label>
                              <Input
                                type="text"
                                value={entry.note}
                                onChange={(e) => updateEntry(entry.id, { note: e.target.value })}
                                placeholder={tEntry("notePlaceholder")}
                                className="flex-1 min-w-0 h-8 sm:h-10"
                                disabled={isLoading}
                                data-testid={`entry-note-${clampedIndex + 1}`}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </ItemTabs>
                  );
                })()}
              </div>
            )}

            {/* ---- Record tab ---- */}
            <div
              role="tabpanel"
              hidden={activeTab !== "record"}
              className="p-3 sm:p-6 space-y-3 sm:space-y-6"
            >
              {showRecordTab ? (
                (() => {
                  const clampedIndex = Math.min(activeRecordIndex, Math.max(0, recordFormDataList.length - 1));
                  const formData = recordFormDataList[clampedIndex];
                  // For manually-added records (index >= entries.length), don't use linked style change
                  const isLinked = clampedIndex < entries.length;
                  return (
                    <ItemTabs
                      count={recordFormDataList.length}
                      activeIndex={clampedIndex}
                      onSelect={setActiveRecordIndex}
                      onAdd={() => {
                        addRecordFormData();
                        setActiveRecordIndex(recordFormDataList.length);
                      }}
                      onRemove={(i) => {
                        removeRecordFormData(i);
                        setActiveRecordIndex((prev) =>
                          Math.min(prev, recordFormDataList.length - 2),
                        );
                      }}
                      label={(i) => tRecord("recordNumber", { n: i + 1 })}
                      accent="blue"
                      disabled={isLoading}
                      testIdPrefix="record"
                      addLabel={tRecord("addRecord")}
                    >
                      {formData && (
                        <RecordLogEntry
                          showTitle={false}
                          bare
                          formData={formData}
                          index={clampedIndex}
                          entryInfo={entryDataListForRecord[clampedIndex]}
                          styles={styles}
                          poolType={basicData.poolType}
                          bestTimes={bestTimes}
                          isLoading={isLoading}
                          isPremium={isPremium}
                          isSplitTimeLimitReached={isRecordSplitTimeLimitReached(clampedIndex)}
                          onTimeChange={(value) => handleRecordTimeChange(clampedIndex, value)}
                          onToggleRelaying={(checked) =>
                            isLinked
                              ? handleLinkedRecordToggleRelaying(clampedIndex, checked)
                              : handleRecordToggleRelaying(clampedIndex, checked)
                          }
                          onNoteChange={(value) => handleRecordNoteChange(clampedIndex, value)}
                          onVideoPathChange={(videoPath, thumbnailPath) =>
                            handleRecordVideoPathChange(clampedIndex, videoPath, thumbnailPath)
                          }
                          onVideoDelete={() => handleRecordVideoPathChange(clampedIndex, "", "")}
                          onPendingFile={(file, thumbnail) =>
                            handleRecordPendingFileChange(clampedIndex, file, thumbnail)
                          }
                          onReactionTimeChange={(value) => handleRecordReactionTimeChange(clampedIndex, value)}
                          onStyleChange={(value) =>
                            isLinked
                              ? handleLinkedRecordStyleChange(clampedIndex, value)
                              : handleRecordStyleChange(clampedIndex, value)
                          }
                          onAddSplitTime={() => handleRecordAddSplitTime(clampedIndex)}
                          onAddSplitTimesEvery25m={() => handleRecordAddSplitTimesEvery25m(clampedIndex)}
                          onAddSplitTimesEvery50m={() => handleRecordAddSplitTimesEvery50m(clampedIndex)}
                          onRemoveSplitTime={(splitIndex) => handleRecordRemoveSplitTime(clampedIndex, splitIndex)}
                          onSplitTimeChange={(splitIndex, field, value) =>
                            handleRecordSplitTimeChange(clampedIndex, splitIndex, field, value)
                          }
                          recordId={formData.videoPath ? String(editingCompetitionId) : undefined}
                          videoPath={formData.videoPath}
                          videoThumbnailPath={formData.videoThumbnailPath}
                        />
                      )}
                    </ItemTabs>
                  );
                })()
              ) : (
                <div
                  role="status"
                  className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3"
                >
                  {tTabModal("recordFutureGuard")}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <Button
              type="button"
              onClick={handleClose}
              variant="outline"
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {tTabModal("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isLoading}
              className="w-full sm:w-auto"
              data-testid="competition-tab-modal-save"
            >
              {isLoading ? tTabModal("saving") : tTabModal("save")}
            </Button>
            {activeTab !== "record" && showRecordTab && (
              <Button
                type="button"
                onClick={() => setActiveTab("record")}
                variant="outline"
                disabled={isLoading}
                className="w-full sm:w-auto"
                data-testid="competition-tab-modal-proceed-record"
              >
                {tTabModal("proceedToRecord")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Discard confirm dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title={tTabModal("discardWarning.title")}
        message={tTabModal("discardWarning.message")}
        confirmLabel={tTabModal("discardWarning.confirm")}
        cancelLabel={tTabModal("discardWarning.cancel")}
        variant="warning"
      />
    </div>
  );
}
