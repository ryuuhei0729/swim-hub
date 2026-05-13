"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { createBrowserClient } from "@supabase/ssr";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Input from "@/components/ui/Input";
import FormStepper from "@/components/ui/FormStepper";
import { XMarkIcon, PlusIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import { useCreatePracticeLogTemplateMutation } from "@swim-hub/shared/hooks";
import type { CreatePracticeLogTemplateInput } from "@swim-hub/shared/types";
import { PracticeLogTemplateSelectModal } from "@/components/practice-log-templates/PracticeLogTemplateSelectModal";
import type { PracticeLogTemplate } from "@swim-hub/shared/types";
import { usePracticeLogForm } from "./hooks";
import { PracticeMenuItem } from "./components";
import type { PracticeLogFormProps, PracticeMenu } from "./types";
import type { PendingVideoData } from "@/stores/types";
import { useAuth } from "@/contexts";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { validatePracticeTimeLimit } from "@swim-hub/shared/utils/validators";
import PremiumBadge from "@/components/ui/PremiumBadge";

import TimeInputModal from "../TimeInputModal";
// VideoUploaderは重いコンポーネントのため動的インポートを維持
const VideoUploader = dynamic(() => import("@/components/video/VideoUploader"), { ssr: false });

// DB の UUID かどうか判定
const isDbUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * 練習記録入力フォーム
 *
 * フェーズ3リファクタリングにより、854行から約200行に削減
 * - 状態管理: usePracticeLogForm フック
 * - メニュー入力: PracticeMenuItem コンポーネント
 */
export default function PracticeLogForm({
  isOpen,
  onClose,
  onSubmit,
  practiceId: _practiceId,
  editData,
  isLoading = false,
  availableTags,
  setAvailableTags,
  styles: _styles = [],
}: PracticeLogFormProps) {
  const t = useTranslations("forms.practiceLog");
  const tPractice = useTranslations("forms.practice");
  const tUnsaved = useTranslations("forms.unsavedChanges");
  const tPremium = useTranslations("forms.premium");
  const { subscription } = useAuth();
  const isPremium = checkIsPremium(subscription);

  const {
    menus,
    setMenus,
    showTimeModal,
    setShowTimeModal,
    currentMenuId,
    setCurrentMenuId,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    addMenu,
    removeMenu,
    updateMenu,
    handleTagsChange,
    openTimeModal,
    handleTimeSave,
    getCurrentMenu,
    prepareSubmitData,
  } = usePracticeLogForm({ isOpen, editData, availableTags });

  // 練習記録フォームのステップ定義
  const PRACTICE_STEPS = useMemo(() => [
    { id: "basic", label: tPractice("steps.basic.label"), description: tPractice("steps.basic.description") },
    { id: "log", label: tPractice("steps.log.label"), description: tPractice("steps.log.description") },
  ], [tPractice]);

  // Practice time 件数制限チェック: 実際に入力されたタイム数の合計
  const getTotalPracticeTimesCount = useCallback((): number => {
    return menus.reduce((total, menu) => {
      const enteredCount = (menu.times || []).filter((t) => t.time > 0).length;
      return total + enteredCount;
    }, 0);
  }, [menus]);

  const isPracticeTimeLimitReached = !isPremium &&
    getTotalPracticeTimesCount() > FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG;

  // 新規作成時の保留動画データ: menuId → { file, thumbnail }
  const pendingVideosRef = useRef<Map<string, PendingVideoData>>(new Map());

  // テンプレート選択モーダルの状態
  const [isTemplateSelectorOpen, setIsTemplateSelectorOpen] = useState(false);
  // 確認ダイアログの表示状態
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // 確認ダイアログのコンテキスト
  const [confirmContext, setConfirmContext] = useState<"close" | "back">("close");
  // プログラム的なナビゲーション中はpopstateを無視するフラグ
  const isNavigatingBack = useRef(false);

  // テンプレートとして保存するチェックボックスの状態
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  // テンプレート保存モーダルの状態
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  // テンプレート名
  const [templateName, setTemplateName] = useState("");
  // テンプレート保存中フラグ
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Supabaseクライアント
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const createTemplateMutation = useCreatePracticeLogTemplateMutation(supabase);

  // ブラウザバックや閉じるボタンでの離脱を防ぐ
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      // プログラム的なナビゲーション中は無視し、フラグをリセット
      if (isNavigatingBack.current) {
        isNavigatingBack.current = false;
        return;
      }
      if (hasUnsavedChanges && !isSubmitted) {
        window.history.pushState(null, "", window.location.href);
        setConfirmContext("back");
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && !isSubmitted) {
      setConfirmContext("close");
      setShowConfirmDialog(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, isSubmitted, onClose]);

  const handleConfirmClose = useCallback(() => {
    if (confirmContext === "back") {
      // popstateリスナーが再度ダイアログを開かないようにフラグを設定
      isNavigatingBack.current = true;
      setHasUnsavedChanges(false);
      setShowConfirmDialog(false);
      window.history.back();
      return;
    }
    setShowConfirmDialog(false);
    onClose();
  }, [confirmContext, onClose, setHasUnsavedChanges]);

  const handleCancelClose = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    // テンプレート保存チェックがONの場合、テンプレート保存モーダルを表示
    if (saveAsTemplate) {
      setShowTemplateSaveModal(true);
      return;
    }

    await executeSubmit();
  };

  const executeSubmit = async () => {
    // Practice time 件数バリデーション（送信前）
    if (!isPremium) {
      const totalTimes = getTotalPracticeTimesCount();
      const validation = validatePracticeTimeLimit(totalTimes, false);
      if (!validation.valid) {
        return;
      }
    }

    setIsSubmitted(true);
    try {
      // menus の id（一時ID）を tempMenuId として、pending video を pendingVideo としてマージ
      const submitData = prepareSubmitData().map((data, index) => {
        const menuId = menus[index]?.id;
        const pendingVideo = menuId ? pendingVideosRef.current.get(menuId) : undefined;
        return {
          ...data,
          tempMenuId: menuId,
          pendingVideo,
        };
      });
      await onSubmit(submitData);
      // submit 成功後に pending videos をクリア
      pendingVideosRef.current.clear();
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("フォーム送信エラー:", error);
    } finally {
      setIsSubmitted(false);
    }
  };

  const handleTemplateSave = async () => {
    if (!templateName.trim()) return;

    setIsSavingTemplate(true);
    try {
      // 最初のメニューをテンプレートとして保存
      const firstMenu = menus[0];
      if (!firstMenu) return;

      const circleTime =
        (Number(firstMenu.circleMin) || 0) * 60 + (Number(firstMenu.circleSec) || 0);

      const templateInput: CreatePracticeLogTemplateInput = {
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

      await createTemplateMutation.mutateAsync(templateInput);

      // モーダルを閉じてリセット
      setShowTemplateSaveModal(false);
      setTemplateName("");
      setSaveAsTemplate(false);

      // 練習記録も保存
      await executeSubmit();
    } catch (error) {
      console.error("テンプレート保存エラー:", error);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTemplateSelect = (template: PracticeLogTemplate) => {
    // テンプレートからメニューを作成
    const circleTime = template.circle || 0;
    const circleMin = Math.floor(circleTime / 60);
    const circleSec = circleTime % 60;

    // テンプレートのtag_idsからタグを取得
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
      circleMin: circleMin,
      circleSec: circleSec,
      note: template.note || "",
      tags: templateTags,
      times: [],
    };

    setMenus([newMenu]);
  };

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="practice-log-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? t("title_edit") : t("title_create")}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                aria-label={t("close_aria")}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            {/* ステッププログレス（新規作成時のみ表示） */}
            {!editData && (
              <div className="mt-4">
                <FormStepper steps={PRACTICE_STEPS} currentStep={1} />
              </div>
            )}
          </div>

          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-6">
              {/* メニューセクション */}
              <div className="space-y-2 sm:space-y-4">
                <div className="flex items-center justify-end">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setIsTemplateSelectorOpen(true)}
                      variant="outline"
                      className="flex items-center gap-2"
                      disabled={isLoading}
                    >
                      <ClipboardDocumentListIcon className="h-5 w-5" />
                      <span className="sm:hidden">{t("templateFrom")}</span>
                      <span className="hidden sm:inline">{t("templateFromLong")}</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={addMenu}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      disabled={isLoading}
                      data-testid="add-menu-button"
                    >
                      <PlusIcon className="h-4 w-4" />
                      {t("addMenu")}
                    </Button>
                  </div>
                </div>

                {menus.map((menu, index) => (
                  <div key={menu.id} className="space-y-3">
                    <PracticeMenuItem
                      menu={menu}
                      menuIndex={index}
                      canRemove={menus.length > 1}
                      availableTags={availableTags}
                      isLoading={isLoading}
                      onRemove={() => removeMenu(menu.id)}
                      onUpdate={(field, value) => updateMenu(menu.id, field, value)}
                      onTagsChange={(tags) => handleTagsChange(menu.id, tags)}
                      onAvailableTagsUpdate={setAvailableTags}
                      onOpenTimeModal={() => openTimeModal(menu.id)}
                    />
                    {/* 動画アップロード（編集時のみ、1メニュー1動画） */}
                    <div className="px-1">
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t("videoLabel")}</label>
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
                ))}

                {/* Practice time 制限メッセージ */}
                {isPracticeTimeLimitReached && (
                  <PremiumBadge
                    message={tPremium("practiceTimeLimit", { limit: FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG })}
                  />
                )}
              </div>
            </div>

            {/* フッター（固定） */}
            <div className="shrink-0 bg-gray-50 px-4 py-3 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* テンプレート保存チェックボックス（新規作成時のみ表示） */}
              {!editData ? (
                <div className="flex items-center order-2 sm:order-1">
                  <input
                    type="checkbox"
                    id="save-as-template"
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded cursor-pointer"
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="save-as-template"
                    className="ml-2 text-sm text-gray-700 cursor-pointer select-none"
                  >
                    {t("saveAsTemplate")}
                  </label>
                </div>
              ) : (
                <div className="order-2 sm:order-1" />
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="outline"
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                  data-testid="practice-log-cancel-button"
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={isLoading || isPracticeTimeLimitReached}
                  onClick={() => void handleSubmit()}
                  className="w-full sm:w-auto"
                  data-testid={editData ? "update-practice-log-button" : "save-practice-log-button"}
                >
                  {isLoading ? (editData ? t("updating") : t("saving")) : editData ? t("update") : t("save")}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* タイム入力モーダル */}
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

      {/* テンプレート選択モーダル */}
      <PracticeLogTemplateSelectModal
        isOpen={isTemplateSelectorOpen}
        onClose={() => setIsTemplateSelectorOpen(false)}
        onSelect={handleTemplateSelect}
      />

      {/* 確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
        title={tUnsaved("title")}
        message={
          confirmContext === "back"
            ? tUnsaved("messageBack")
            : tUnsaved("messageClose")
        }
        confirmLabel={confirmContext === "back" ? tUnsaved("confirmBack") : tUnsaved("confirmClose")}
        cancelLabel={tUnsaved("cancel")}
        variant="warning"
      />

      {/* テンプレート保存確認モーダル */}
      {showTemplateSaveModal && (
        <div
          className="fixed inset-0 z-80 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-save-modal-title"
        >
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* オーバーレイ */}
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowTemplateSaveModal(false)}
              aria-hidden="true"
            />

            {/* モーダルコンテンツ */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
              {/* ヘッダー */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 id="template-save-modal-title" className="text-lg font-semibold text-gray-900">
                  {t("templateSaveTitle")}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTemplateSaveModal(false)}
                  className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 rounded-md p-1"
                  aria-label={t("close_aria")}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* コンテンツ */}
              <div className="p-4">
                <label
                  htmlFor="template-name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  {t("templateNameLabel")}
                </label>
                <Input
                  id="template-name"
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t("templateNamePlaceholder")}
                  className="w-full"
                  autoFocus
                />
              </div>

              {/* フッター */}
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowTemplateSaveModal(false)}
                  disabled={isSavingTemplate}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleTemplateSave()}
                  disabled={!templateName.trim() || isSavingTemplate}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isSavingTemplate ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
