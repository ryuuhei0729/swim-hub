"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { XMarkIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ItemTabs from "@/components/forms/ItemTabs";
import DatePicker from "@/components/ui/DatePicker";
import PlaceCombobox from "@/components/ui/PlaceCombobox";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PracticeImageUploader from "@/components/forms/PracticeImageUploader";
import PremiumBadge from "@/components/ui/PremiumBadge";
import TimeInputModal from "@/components/forms/TimeInputModal";
import { PracticeMenuItem } from "@/components/forms/practice-log/components";
import { PracticeLogTemplateSelectModal } from "@/components/practice-log-templates/PracticeLogTemplateSelectModal";
import { usePracticeLogForm } from "@/components/forms/practice-log/hooks";
import { useAuth } from "@/contexts";
import { checkIsPremium, canUploadImage } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { validatePracticeTimeLimit } from "@swim-hub/shared/utils/validators";
import { useCreatePracticeLogTemplateMutation } from "@swim-hub/shared/hooks";
import { PracticeAPI } from "@apps/shared/api";
import { isDbUuid } from "@/utils/isDbUuid";
import { getTabNavAdjacency } from "@/utils/tabModalUtils";
import type { PracticeImageFile, ExistingImage } from "@/components/forms/PracticeImageUploader";
import type { PracticeImageData } from "@/components/forms/PracticeBasicForm";
import type { PracticeLogEditData, PracticeLogSubmitData, PracticeMenu } from "@/components/forms/practice-log/types";
import type { PracticeTag } from "@apps/shared/types";
import type { CreatePracticeLogTemplateInput, PracticeLogTemplate } from "@swim-hub/shared/types";
import type { EditingData, PracticeTabId, PendingVideoData } from "@/stores/types";

// VideoUploader is heavy — dynamic import
const VideoUploader = dynamic(() => import("@/components/video/VideoUploader"), { ssr: false });

// =============================================================================
// Tab bar item with optional error dot
// =============================================================================

interface TabItemProps {
  id: PracticeTabId;
  label: string;
  isActive: boolean;
  hasError: boolean;
  onClick: () => void;
}

function TabItem({ id, label, isActive, hasError, onClick }: TabItemProps) {
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
            ? "bg-green-50 border border-gray-200 border-b-white text-green-700 font-semibold"
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

export interface PracticeTabSaveParams {
  basicData: { date: string; title: string; place: string; note: string };
  imageData?: PracticeImageData;
  logs: PracticeLogSubmitData[];
  editingPracticeId: string | null;
  /** 編集前に DB に存在していた練習ログ ID 一覧 (diff 計算用) */
  originalLogIds: string[];
}

export interface PracticeTabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: PracticeTabSaveParams) => Promise<void>;
  selectedDate: Date;
  editingData: EditingData | null;
  editingPracticeId: string | null;
  availableTags: PracticeTag[];
  setAvailableTags: (tags: PracticeTag[] | ((prev: PracticeTag[]) => PracticeTag[])) => void;
  isLoading: boolean;
  initialTab?: PracticeTabId;
}

// =============================================================================
// Main component
// =============================================================================

export default function PracticeTabModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
  editingData,
  editingPracticeId,
  availableTags,
  setAvailableTags,
  isLoading,
  initialTab = "practice",
}: PracticeTabModalProps) {
  const t = useTranslations("forms.practice");
  const tTabModal = useTranslations("forms.tabModal");
  const tPracticeLog = useTranslations("forms.practiceLog");
  const tPremium = useTranslations("forms.premium");
  const { subscription, supabase } = useAuth();
  const isPremium = checkIsPremium(subscription);

  // ---------------------------------------------------------------------------
  // Active tab
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<PracticeTabId>(initialTab);
  const [activePracticeIndex, setActivePracticeIndex] = useState(0);

  // ---------------------------------------------------------------------------
  // Practice basic tab state
  // ---------------------------------------------------------------------------
  const [basicData, setBasicData] = useState({ date: "", title: "", place: "", note: "" });
  const [imageData, setImageData] = useState<PracticeImageData>({ newFiles: [], deletedIds: [] });
  const [placeSuggestions, setPlaceSuggestions] = useState<string[]>([]);

  // ---------------------------------------------------------------------------
  // Practice log tab state — via usePracticeLogForm hook
  // ---------------------------------------------------------------------------

  // テンプレートから追加モードかどうかを判定する。
  // editingData.id が DB UUID (= 親練習の編集モード) かつ editingData.style が存在する場合は
  // 「既存練習の練習ログタブを開き、テンプレ行を末尾に追記」するモード。
  // この場合 logEditData には渡さず、DB fetch 完了後に append する。
  const isTemplateAppendMode = useMemo(() => {
    if (!editingData || typeof editingData !== "object") return false;
    if (!("style" in editingData)) return false;
    const d = editingData as Record<string, unknown>;
    // id が DB UUID かつ style が存在 → テンプレート追記モード
    return isDbUuid(d.id as string | null | undefined) && typeof d.style === "string";
  }, [editingData]);

  // テンプレート追記モードでない場合のみ logEditData を構築して usePracticeLogForm に渡す
  const logEditData = useMemo<PracticeLogEditData | null>(() => {
    if (isTemplateAppendMode) return null;
    if (!editingData || typeof editingData !== "object") return null;
    if (!("style" in editingData)) return null;
    const d = editingData as Record<string, unknown>;
    return {
      id: d.id as string | undefined,
      style: String(d.style || "Fr"),
      swim_category: d.swim_category as "Swim" | "Pull" | "Kick" | undefined,
      distance: d.distance as number | undefined,
      rep_count: d.rep_count as number | undefined,
      set_count: d.set_count as number | undefined,
      circle: d.circle as number | null | undefined,
      note: d.note as string | null | undefined,
      tags: d.tags as PracticeTag[] | undefined,
    };
  }, [editingData, isTemplateAppendMode]);

  const {
    menus,
    setMenus,
    showTimeModal,
    setShowTimeModal,
    currentMenuId,
    setCurrentMenuId,
    addMenu,
    removeMenu,
    updateMenu,
    handleTagsChange,
    openTimeModal,
    handleTimeSave,
    getCurrentMenu,
    hasUnsavedChanges: hasMenuChanges,
    prepareSubmitData,
  } = usePracticeLogForm({ isOpen, editData: logEditData, availableTags });

  const pendingVideosRef = useRef<Map<string, PendingVideoData>>(new Map());

  // テンプレート追記モード: DB fetch 完了後に1度だけ append するためのフラグ
  const templateAppendedRef = useRef(false);

  // Template state
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const createTemplateMutation = useCreatePracticeLogTemplateMutation(supabase);

  // Practice time limit check
  const getTotalPracticeTimesCount = useCallback(() => {
    return menus.reduce((total, menu) => {
      return total + (menu.times || []).filter((t) => t.time > 0).length;
    }, 0);
  }, [menus]);

  const isPracticeTimeLimitReached =
    !isPremium && getTotalPracticeTimesCount() > FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  const [isInitialized, setIsInitialized] = useState(false);
  const initialDraftRef = useRef<string>("");
  /** 編集前に DB に存在していた練習ログ ID (diff 用スナップショット) */
  const [originalLogIds, setOriginalLogIds] = useState<string[]>([]);
  const initialMenusSnapshotRef = useRef<string>("");

  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setActiveTab(initialTab);
      setBasicData({ date: "", title: "", place: "", note: "" });
      setImageData({ newFiles: [], deletedIds: [] });
      setTabErrors({ practice: false, practiceLog: false });
      setBasicValidationError(null);
      setIsSubmitted(false);
      setShowConfirmDialog(false);
      setSaveAsTemplate(false);
      setTemplateName("");
      setOriginalLogIds([]);
      setActivePracticeIndex(0);
      pendingVideosRef.current.clear();
      isSubmittingRef.current = false;
      templateAppendedRef.current = false;
      initialDraftRef.current = "";
      initialMenusSnapshotRef.current = "";
      return;
    }
    if (isInitialized) return;

    // モーダルを開くたびに、呼び出し元が指定したタブ (initialTab) を反映する。
    // モーダルは常時マウントされているため useState(initialTab) だけでは再オープン時に同期されない。
    setActiveTab(initialTab);

    // Build initial basic data from editingData
    let initial = { date: format(selectedDate, "yyyy-MM-dd"), title: "", place: "", note: "" };
    if (editingData && typeof editingData === "object") {
      const d = editingData as Record<string, unknown>;
      if ("type" in d && (d.type === "practice" || d.type === "team_practice")) {
        const meta = d.metadata as Record<string, unknown> | undefined;
        const practice = meta?.practice as Record<string, string> | undefined;
        initial = {
          date: (d.date as string) || format(selectedDate, "yyyy-MM-dd"),
          title: (d.title as string) || "",
          place: (d.place as string) || practice?.place || "",
          note: (d.note as string) || "",
        };
      } else if ("metadata" in d && d.metadata) {
        const meta = d.metadata as Record<string, unknown>;
        const practice = meta.practice as Record<string, string> | undefined;
        initial = {
          date: (d.date as string) || format(selectedDate, "yyyy-MM-dd"),
          title: (d.title as string) || "",
          place: practice?.place || "",
          note: (d.note as string) || "",
        };
      }
    }
    setBasicData(initial);
    initialDraftRef.current = JSON.stringify(initial);
    // 新規作成時はデフォルトメニュースナップショットを記録
    if (!editingPracticeId) {
      initialMenusSnapshotRef.current = "";
    }
    setIsInitialized(true);
  }, [isOpen, isInitialized, editingData, selectedDate, initialTab, editingPracticeId]);

  // 編集モード: 練習IDに紐づく既存ログを全件 fetch して menus に初期化
  useEffect(() => {
    if (!isOpen || !isInitialized) return;
    // editingPracticeId が DB UUID の場合のみフェッチ
    if (!editingPracticeId || !isDbUuid(editingPracticeId)) return;
    // 既に originalLogIds が設定済みなら再フェッチしない
    if (originalLogIds.length > 0) return;

    supabase
      .from("practice_logs")
      .select("id, style, swim_category, distance, rep_count, set_count, circle, note, video_path, video_thumbnail_path, practice_log_tags(practice_tag_id), practice_times(set_number, rep_number, time)")
      .eq("practice_id", editingPracticeId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error || !data) return;
        const ids = data.map((row: { id: string }) => row.id);
        setOriginalLogIds(ids);
        // menus を DB 値で上書き（各 menu.id = DB UUID）
        const newMenus = data.map((row: Record<string, unknown>) => {
          const circleTime = (row.circle as number) || 0;
          const tagIds = (row.practice_log_tags as Array<{ practice_tag_id: string }>)?.map((t) => t.practice_tag_id) ?? [];
          const tags = availableTags.filter((tag) => tagIds.includes(tag.id));
          return {
            id: row.id as string,
            style: (row.style as string) || "Fr",
            swimCategory: ((row.swim_category as string) || "Swim") as "Swim" | "Pull" | "Kick",
            distance: (row.distance as number) || 100,
            reps: (row.rep_count as number) || 1,
            sets: (row.set_count as number) || 1,
            circleMin: Math.floor(circleTime / 60),
            circleSec: circleTime % 60,
            note: (row.note as string) || "",
            tags,
            // 既存のタイムを読み込む。読み込まないと保存時に diff が空となり既存タイムが削除される。
            times: (
              (row.practice_times as
                | Array<{ set_number: number; rep_number: number; time: number }>
                | undefined) ?? []
            ).map((time) => ({
              setNumber: time.set_number,
              repNumber: time.rep_number,
              time: time.time,
            })),
            videoPath: (row.video_path as string | null) ?? null,
            videoThumbnailPath: (row.video_thumbnail_path as string | null) ?? null,
          };
        });
        // テンプレート追記モード: 既存ログの末尾にテンプレ行を1件追加
        let finalMenus: PracticeMenu[] = newMenus.length > 0 ? newMenus : [];
        if (isTemplateAppendMode && !templateAppendedRef.current && editingData && typeof editingData === "object") {
          templateAppendedRef.current = true;
          const d = editingData as Record<string, unknown>;
          const circleTime = (d.circle as number) || 0;
          const tagIds = (d.tag_ids as string[] | undefined) ?? [];
          const templateTags = availableTags.filter((tag) => tagIds.includes(tag.id));
          const templateMenu: PracticeMenu = {
            id: String(Date.now()),
            style: String(d.style || "Fr"),
            swimCategory: ((d.swim_category as string) || "Swim") as "Swim" | "Pull" | "Kick",
            distance: (d.distance as number) || 100,
            reps: (d.rep_count as number) || 1,
            sets: (d.set_count as number) || 1,
            circleMin: Math.floor(circleTime / 60),
            circleSec: circleTime % 60,
            note: String(d.note || ""),
            tags: templateTags,
            times: [],
          };
          finalMenus = [...finalMenus, templateMenu];
        }
        if (finalMenus.length > 0) setMenus(finalMenus);
        // snapshot は DB から取得した既存ログ分のみ(newMenus)で取る。
        // テンプレ追記行は意図的に snapshot に含めない → 保存せず閉じると「未保存の変更あり」警告が出る。
        // ログが0件の練習にテンプレ追記した場合は finalMenus(=テンプレ行のみ)をそのまま使う。
        initialMenusSnapshotRef.current = JSON.stringify(newMenus.length > 0 ? newMenus : finalMenus);
      });
  }, [isOpen, isInitialized, editingPracticeId, originalLogIds.length, supabase, availableTags, setMenus, isTemplateAppendMode, editingData]);

  // Fetch place suggestions when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const api = new PracticeAPI(supabase);
    api.getUniquePlaces().then(setPlaceSuggestions).catch(() => {});
  }, [isOpen, supabase]);

  // ---------------------------------------------------------------------------
  // Unsaved-change detection
  // ---------------------------------------------------------------------------
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  const skipPopstateRef = useRef(false);

  const hasUnsavedChanges = useMemo(() => {
    if (!isOpen || !isInitialized) return false;
    const basicChanged = JSON.stringify(basicData) !== initialDraftRef.current;
    const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0;
    const menusSnapshot = initialMenusSnapshotRef.current;
    const menusChanged = menusSnapshot !== "" && JSON.stringify(menus) !== menusSnapshot;
    return basicChanged || hasImageChanges || menusChanged;
  }, [isOpen, isInitialized, basicData, imageData, menus]);

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
  const [tabErrors, setTabErrors] = useState<Record<PracticeTabId, boolean>>({
    practice: false,
    practiceLog: false,
  });
  const [basicValidationError, setBasicValidationError] = useState<string | null>(null);

  const validateAll = useCallback((): boolean => {
    const errors: Record<PracticeTabId, boolean> = { practice: false, practiceLog: false };
    if (!basicData.date) errors.practice = true;

    setTabErrors(errors);

    const firstError = (["practice", "practiceLog"] as PracticeTabId[]).find((t) => errors[t]);
    if (firstError) {
      setActiveTab(firstError);
      if (firstError === "practice") {
        setBasicValidationError(t("date_label") + " " + tTabModal("fieldRequired"));
      }
      return false;
    }
    return true;
  }, [basicData.date, t, tTabModal]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------
  const isSubmittingRef = useRef(false);

  const executeSave = useCallback(async () => {
    if (!isPremium) {
      const total = getTotalPracticeTimesCount();
      const validation = validatePracticeTimeLimit(total, false);
      if (!validation.valid) return;
    }

    // 未編集かつログ未保存の場合、デフォルトメニュー(100m×4)を保存しない。練習ログは opt-in。
    // originalLogIds.length === 0 で「まだログを保存していない新規練習」を判定する。
    const skipUntouchedDefaultLogs = !hasMenuChanges && originalLogIds.length === 0;
    const submitLogs = skipUntouchedDefaultLogs
      ? []
      : prepareSubmitData().map((data, index) => {
          const menuId = menus[index]?.id;
          const pendingVideo = menuId ? pendingVideosRef.current.get(menuId) : undefined;
          return { ...data, tempMenuId: menuId, pendingVideo };
        });

    const hasImageChanges = imageData.newFiles.length > 0 || imageData.deletedIds.length > 0;
    await onSave({
      basicData,
      imageData: hasImageChanges ? imageData : undefined,
      logs: submitLogs,
      editingPracticeId,
      originalLogIds,
    });
    pendingVideosRef.current.clear();
  }, [
    isPremium,
    getTotalPracticeTimesCount,
    hasMenuChanges,
    prepareSubmitData,
    menus,
    imageData,
    basicData,
    editingPracticeId,
    originalLogIds,
    onSave,
  ]);

  const handleSave = useCallback(async () => {
    if (isSubmittingRef.current) return;
    if (!validateAll()) return;

    if (saveAsTemplate) {
      setShowTemplateSaveModal(true);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitted(true);
    try {
      await executeSave();
    } catch (error) {
      console.error("練習一括保存に失敗しました:", error);
      isSubmittingRef.current = false;
      // 親保存済み(editingPracticeId セット済み)の場合は beforeunload を抑止するため isSubmitted を true のまま保持
      const parentAlreadySaved = !!editingPracticeId;
      if (!parentAlreadySaved) setIsSubmitted(false);
      const msg =
        parentAlreadySaved
          ? tTabModal("partialSaveError")
          : error instanceof Error
            ? error.message
            : String(error);
      setBasicValidationError(msg);
      setActiveTab("practice");
    }
  }, [validateAll, saveAsTemplate, executeSave, editingPracticeId, tTabModal]);

  const handleTemplateSave = useCallback(async () => {
    if (!templateName.trim()) return;
    setIsSavingTemplate(true);
    try {
      const firstMenu = menus[0];
      if (!firstMenu) return;
      const circleTime = (Number(firstMenu.circleMin) || 0) * 60 + (Number(firstMenu.circleSec) || 0);
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

      isSubmittingRef.current = true;
      setIsSubmitted(true);
      try {
        await executeSave();
      } catch (error) {
        console.error("練習一括保存に失敗しました:", error);
        isSubmittingRef.current = false;
        setIsSubmitted(false);
      }
    } catch (error) {
      console.error("テンプレート保存エラー:", error);
    } finally {
      setIsSavingTemplate(false);
    }
  }, [templateName, menus, createTemplateMutation, executeSave]);

  const handleTemplateSelect = useCallback((template: PracticeLogTemplate) => {
    const circleTime = template.circle || 0;
    const circleMin = Math.floor(circleTime / 60);
    const circleSec = circleTime % 60;
    const templateTags = template.tag_ids
      ? availableTags.filter((tag) => template.tag_ids.includes(tag.id))
      : [];
    const newMenu: PracticeMenu = {
      id: String(Date.now()),
      style: template.style,
      swimCategory: template.swim_category,
      distance: template.distance,
      reps: template.rep_count,
      sets: template.set_count,
      circleMin,
      circleSec,
      note: template.note || "",
      tags: templateTags,
      times: [],
    };
    setMenus([newMenu]);
  }, [availableTags, setMenus]);

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
  // Derive editData images for image uploader
  // ---------------------------------------------------------------------------
  const existingImages = useMemo<ExistingImage[] | undefined>(() => {
    if (!editingData || typeof editingData !== "object") return undefined;
    const d = editingData as Record<string, unknown>;
    const editPayload = d.editData as Record<string, unknown> | undefined;
    return editPayload?.images as ExistingImage[] | undefined;
  }, [editingData]);

  if (!isOpen) return null;

  const tabs: Array<{ id: PracticeTabId; label: string }> = [
    { id: "practice", label: t("tabs.practice") },
    { id: "practiceLog", label: t("tabs.log") },
  ];

  const visibleTabIds: PracticeTabId[] = ["practice", "practiceLog"];
  const { prevTab, nextTab } = getTabNavAdjacency(visibleTabIds, activeTab);

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="practice-tab-modal">
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
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </nav>
            </div>
          </div>

          {/* Tab panels */}
          <div className="flex-1 overflow-y-auto">
            {/* ---- Practice tab ---- */}
            <div
              role="tabpanel"
              hidden={activeTab !== "practice"}
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

              {/* Grid: date, title, place */}
              <div className="grid grid-cols-[auto_1fr] gap-x-2 sm:gap-x-4 gap-y-1.5 sm:gap-y-4 items-center">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {t("date_label")} <span className="text-red-500">*</span>
                </label>
                <DatePicker
                  value={basicData.date}
                  onChange={(date) => {
                    setBasicData({ ...basicData, date });
                    setBasicValidationError(null);
                  }}
                  required
                  placeholder={t("date_placeholder")}
                  data-testid="practice-tab-date"
                />

                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {t("title_field")}
                </label>
                <Input
                  type="text"
                  value={basicData.title}
                  onChange={(e) => setBasicData({ ...basicData, title: e.target.value })}
                  placeholder={t("title_placeholder")}
                  data-testid="practice-tab-title"
                />

                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {t("place_label")}
                </label>
                <PlaceCombobox
                  value={basicData.place}
                  onChange={(value) => setBasicData({ ...basicData, place: value })}
                  suggestions={placeSuggestions}
                  placeholder={t("place_placeholder")}
                  data-testid="practice-tab-place"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("note_label")}
                </label>
                <textarea
                  value={basicData.note}
                  onChange={(e) => setBasicData({ ...basicData, note: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("note_placeholder")}
                  data-testid="practice-tab-note"
                />
              </div>

              {/* Image upload（Free でも画像は許可。動画のみ Premium 限定） */}
              <div>
                {canUploadImage(isPremium) ? (
                  <PracticeImageUploader
                    existingImages={existingImages}
                    onImagesChange={(newFiles: PracticeImageFile[], deletedIds: string[]) =>
                      setImageData({ newFiles, deletedIds })
                    }
                    disabled={isLoading}
                  />
                ) : (
                  <PremiumBadge message={tPremium("imageUpload")} />
                )}
              </div>
            </div>

            {/* ---- Practice Log tab ---- */}
            <div
              role="tabpanel"
              hidden={activeTab !== "practiceLog"}
              className="p-3 sm:p-6 space-y-3 sm:space-y-6"
            >
              {/* Practice log item sub-tabs */}
              {(() => {
                const clampedIndex = Math.min(activePracticeIndex, Math.max(0, menus.length - 1));
                const menu = menus[clampedIndex];
                return (
                  <ItemTabs
                    count={menus.length}
                    activeIndex={clampedIndex}
                    onSelect={setActivePracticeIndex}
                    onAdd={() => {
                      addMenu();
                      setActivePracticeIndex(menus.length);
                    }}
                    onRemove={(i) => {
                      const target = menus[i];
                      if (!target) return;
                      removeMenu(target.id);
                      setActivePracticeIndex((prev) => Math.min(prev, menus.length - 2));
                    }}
                    label={(i) => tPracticeLog("menuHeader", { n: i + 1 })}
                    accent="green"
                    disabled={isLoading}
                    testIdPrefix="practicelog"
                    addTestId="add-menu-button"
                    addLabel={tPracticeLog("addMenu")}
                  >
                    {menu && (
                      <div key={menu.id} className="space-y-2 sm:space-y-4">
                        <PracticeMenuItem
                          menu={menu}
                          menuIndex={clampedIndex}
                          showTitle={false}
                          canRemove={false}
                          bare
                          tagRowAction={
                            <Button
                              type="button"
                              onClick={() => setIsTemplateSelectorOpen(true)}
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2 whitespace-nowrap"
                              disabled={isLoading}
                            >
                              <ClipboardDocumentListIcon className="h-4 w-4" />
                              <span className="sm:hidden">{tPracticeLog("templateFrom")}</span>
                              <span className="hidden sm:inline">{tPracticeLog("templateFromLong")}</span>
                            </Button>
                          }
                          availableTags={availableTags}
                          isLoading={isLoading}
                          onRemove={() => {}}
                          onUpdate={(field, value) => updateMenu(menu.id, field, value)}
                          onTagsChange={(tags) => handleTagsChange(menu.id, tags)}
                          onAvailableTagsUpdate={setAvailableTags}
                          onOpenTimeModal={() => openTimeModal(menu.id)}
                        />
                        <div>
                      <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                        {tPracticeLog("videoLabel")}
                      </label>
                      <VideoUploader
                        type="practice-log"
                        id={isDbUuid(menu.id) ? menu.id : undefined}
                        existingVideoPath={menu.videoPath ?? undefined}
                        existingThumbnailPath={menu.videoThumbnailPath ?? undefined}
                        isPremium={isPremium}
                        onUploadComplete={(videoPath, thumbnailPath) =>
                          setMenus((prev) =>
                            prev.map((m) =>
                              m.id === menu.id
                                ? { ...m, videoPath, videoThumbnailPath: thumbnailPath }
                                : m,
                            ),
                          )
                        }
                        onDelete={() =>
                          setMenus((prev) =>
                            prev.map((m) =>
                              m.id === menu.id
                                ? { ...m, videoPath: null, videoThumbnailPath: null }
                                : m,
                            ),
                          )
                        }
                        onPendingFile={(file, thumbnail) => {
                          if (file && thumbnail) {
                            pendingVideosRef.current.set(menu.id, { file, thumbnail });
                          } else {
                            pendingVideosRef.current.delete(menu.id);
                          }
                        }}
                      />
                        </div>
                      </div>
                    )}
                  </ItemTabs>
                );
              })()}

              {isPracticeTimeLimitReached && (
                <PremiumBadge
                  message={tPremium("practiceTimeLimit", {
                    limit: FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG,
                  })}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Template checkbox — only on log tab, new mode */}
            {activeTab === "practiceLog" && !logEditData ? (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="save-as-template-tab"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer"
                  disabled={isLoading}
                />
                <label
                  htmlFor="save-as-template-tab"
                  className="ml-2 text-sm text-gray-700 cursor-pointer select-none"
                >
                  {tPracticeLog("saveAsTemplate")}
                </label>
              </div>
            ) : (
              <div />
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              {prevTab && (
                <Button
                  type="button"
                  onClick={() => setActiveTab(prevTab)}
                  variant="outline"
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="practice-tab-modal-back"
                >
                  {tTabModal("back")}
                </Button>
              )}
              <Button
                type="button"
                onClick={() => void handleSave()}
                variant={nextTab ? "outline" : "primary"}
                disabled={isLoading || isPracticeTimeLimitReached}
                className="w-full sm:w-auto"
                data-testid="practice-tab-modal-save"
              >
                {isLoading ? tTabModal("saving") : tTabModal("saveAndClose")}
              </Button>
              {nextTab && (
                <Button
                  type="button"
                  onClick={() => setActiveTab(nextTab)}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="practice-tab-modal-next"
                >
                  {tTabModal("next")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Time input modal */}
      {currentMenuId && (
        <TimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false);
            setCurrentMenuId(null);
          }}
          onSubmit={handleTimeSave}
          setCount={Number(getCurrentMenu()?.sets) || 1}
          repCount={Number(getCurrentMenu()?.reps) || 1}
          initialTimes={
            (getCurrentMenu()?.times || []) as Array<{
              id: string;
              setNumber: number;
              repNumber: number;
              time: number;
              displayValue?: string;
            }>
          }
          menuNumber={menus.findIndex((m) => m.id === currentMenuId) + 1}
        />
      )}

      {/* Template selector */}
      <PracticeLogTemplateSelectModal
        isOpen={isTemplateSelectorOpen}
        onClose={() => setIsTemplateSelectorOpen(false)}
        onSelect={handleTemplateSelect}
      />

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

      {/* Template save modal */}
      {showTemplateSaveModal && (
        <div className="fixed inset-0 z-80 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowTemplateSaveModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {tPracticeLog("templateSaveTitle")}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTemplateSaveModal(false)}
                  className="text-gray-400 hover:text-gray-500 rounded-md p-1"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <div className="p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {tPracticeLog("templateNameLabel")}
                </label>
                <Input
                  id="template-name-tab"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={tPracticeLog("templateNamePlaceholder")}
                  className="w-full"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowTemplateSaveModal(false)}
                  disabled={isSavingTemplate}
                >
                  {tPracticeLog("cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleTemplateSave()}
                  disabled={!templateName.trim() || isSavingTemplate}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSavingTemplate
                    ? tPracticeLog("saving")
                    : tPracticeLog("save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
