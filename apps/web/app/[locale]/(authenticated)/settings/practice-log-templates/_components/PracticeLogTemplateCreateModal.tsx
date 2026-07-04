"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createBrowserClient } from "@supabase/ssr";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  useCreatePracticeLogTemplateMutation,
  useUpdatePracticeLogTemplateMutation,
} from "@swim-hub/shared/hooks";
import { usePracticeTagsQuery } from "@swim-hub/shared/hooks/queries/practices";
import type { CreatePracticeLogTemplateInput, PracticeLogTemplate } from "@swim-hub/shared/types";
import type { PracticeTag } from "@swim-hub/shared/types";
import TagInput from "@/components/forms/TagInput";
import Button from "@/components/ui/Button";
import NumberStepper from "@/components/ui/NumberStepper";
import { SelectChips, chipClass } from "@/components/forms/practice-log/components/SelectChips";
import { SWIM_STYLES, SWIM_CATEGORIES, DISTANCE_PRESETS } from "@/components/forms/practice-log/types";
import { cn } from "@/utils/cn";

interface PracticeLogTemplateCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: PracticeLogTemplate | null;
}

export function PracticeLogTemplateCreateModal({
  isOpen,
  onClose,
  editData,
}: PracticeLogTemplateCreateModalProps) {
  const t = useTranslations("practiceLogTemplates.createModal");
  const tPM = useTranslations("forms.practiceMenu");
  const tPractice = useTranslations("practice");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const createMutation = useCreatePracticeLogTemplateMutation(supabase);
  const updateMutation = useUpdatePracticeLogTemplateMutation(supabase);
  const { data: tagsData } = usePracticeTagsQuery(supabase);

  const isEditMode = !!editData;

  // 固定フィールド（name / style / swim_category / note / tag_ids）
  const [name, setName] = useState("");
  const [style, setStyle] = useState("Fr");
  const [swimCategory, setSwimCategory] = useState<"Swim" | "Pull" | "Kick">("Swim");
  const [note, setNote] = useState("");

  // 距離: PracticeMenuItem と同じく number | "" で唯一の真実として保持
  // showCustomDistance=false のとき値はプリセット確定値、true のとき input 直結
  const [distance, setDistance] = useState<number | "">(50);
  const [showCustomDistance, setShowCustomDistance] = useState(false);

  // Critical 2: rep_count / set_count も number | "" で保持（入力途中の空を許容）
  const [repCount, setRepCount] = useState<number | "">(1);
  const [setCount, setSetCount] = useState<number | "">(1);

  // circle 分/秒: 既存どおり number | ""
  const [circleMinutes, setCircleMinutes] = useState<number | "">(1);
  const [circleSeconds, setCircleSeconds] = useState<number | "">(30);

  const [availableTags, setAvailableTags] = useState<PracticeTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<PracticeTag[]>([]);

  // タグデータを設定
  useEffect(() => {
    if (tagsData) {
      setAvailableTags(tagsData);
    }
  }, [tagsData]);

  // モーダル開閉 / editData 変更時にフォームを初期化
  useEffect(() => {
    if (isOpen && editData) {
      const circleTime = editData.circle || 0;
      const min = Math.floor(circleTime / 60);
      const sec = circleTime % 60;

      const distanceIsPreset = (DISTANCE_PRESETS as readonly number[]).includes(editData.distance);

      setName(editData.name);
      setStyle(editData.style);
      setSwimCategory(editData.swim_category);
      setNote(editData.note || "");
      setRepCount(editData.rep_count);
      setSetCount(editData.set_count);
      setCircleMinutes(min);
      setCircleSeconds(sec);

      if (!distanceIsPreset) {
        // プリセット外（400/800/1500 等）→ 「その他」モードで値をセット
        setDistance(editData.distance);
        setShowCustomDistance(true);
      } else {
        setDistance(editData.distance);
        setShowCustomDistance(false);
      }

      if (editData.tag_ids && tagsData) {
        const selected = tagsData.filter((tag) => editData.tag_ids.includes(tag.id));
        setSelectedTags(selected);
      }
    } else if (isOpen && !editData) {
      setName("");
      setStyle("Fr");
      setSwimCategory("Swim");
      setNote("");
      setDistance(50);
      setShowCustomDistance(false);
      setRepCount(1);
      setSetCount(1);
      setCircleMinutes(1);
      setCircleSeconds(30);
      setSelectedTags([]);
    }
  }, [isOpen, editData, tagsData]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Critical 1: カスタム距離が空なら保存をブロック（required HTML バリデーションが通れば
      // ここには来ないが、念のため JS 側でもガード）
      const distanceNum = Number(distance);
      if (!distanceNum || distanceNum <= 0) return;

      // Critical 2: submit 時に rep/set を確定（空 → 1）
      const repCountNum = Math.max(1, Number(repCount) || 1);
      const setCountNum = Math.max(1, Number(setCount) || 1);

      // circle: 0分0秒 → 0（null にしない）
      const circleInSeconds = (Number(circleMinutes) || 0) * 60 + (Number(circleSeconds) || 0);

      const input: CreatePracticeLogTemplateInput = {
        name,
        style,
        swim_category: swimCategory,
        distance: distanceNum,
        rep_count: repCountNum,
        set_count: setCountNum,
        circle: circleInSeconds,
        note: note || null,
        tag_ids: selectedTags.map((tag) => tag.id),
      };

      try {
        if (isEditMode && editData) {
          await updateMutation.mutateAsync({
            templateId: editData.id,
            input,
          });
        } else {
          await createMutation.mutateAsync(input);
        }
        onClose();
      } catch (error) {
        console.error("テンプレート保存エラー:", error);
      }
    },
    [
      name,
      style,
      swimCategory,
      distance,
      repCount,
      setCount,
      circleMinutes,
      circleSeconds,
      note,
      selectedTags,
      isEditMode,
      editData,
      createMutation,
      updateMutation,
      onClose,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  const handleTagsChange = useCallback((tags: PracticeTag[]) => {
    setSelectedTags(tags);
  }, []);

  const handleAvailableTagsUpdate = useCallback((tags: PracticeTag[]) => {
    setAvailableTags(tags);
  }, []);

  if (!isOpen) return null;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-modal-title"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
            <h2
              id="template-modal-title"
              className="text-base sm:text-lg font-semibold text-gray-900"
            >
              {isEditMode ? t("editTitle") : t("createTitle")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              aria-label={t("closeAriaLabel")}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4">
            {/* テンプレート名 */}
            <div>
              <label
                htmlFor="template-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("nameLabel")} <span className="text-red-500">*</span>
              </label>
              <input
                id="template-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                maxLength={100}
              />
            </div>

            {/* 種目 */}
            <div>
              <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                {t("styleLabel")} <span className="text-red-500">*</span>
              </label>
              <SelectChips
                options={SWIM_STYLES.map((s) => ({
                  value: s.value,
                  label: tPractice(`styles.${s.value}` as Parameters<typeof tPractice>[0]),
                }))}
                value={style}
                onChange={setStyle}
                testIdPrefix="template-style"
              />
            </div>

            {/* カテゴリ */}
            <div>
              <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                {t("categoryLabel")} <span className="text-red-500">*</span>
              </label>
              <SelectChips
                options={SWIM_CATEGORIES.map((category) => ({
                  value: category.value,
                  label: category.label,
                }))}
                value={swimCategory}
                onChange={(value) => setSwimCategory(value as "Swim" | "Pull" | "Kick")}
                testIdPrefix="template-swim-category"
              />
            </div>

            {/* 距離 — PracticeMenuItem と同一挙動 */}
            <div>
              <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                {t("distanceLabel")} <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {DISTANCE_PRESETS.map((preset) => {
                  const selected = !showCustomDistance && Number(distance) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setShowCustomDistance(false);
                        setDistance(preset);
                      }}
                      className={cn(chipClass(selected), "min-w-12")}
                      aria-pressed={selected}
                      data-testid={`template-distance-preset-${preset}`}
                    >
                      {preset}
                    </button>
                  );
                })}
                {showCustomDistance ? (
                  // Critical 1: distance state に直接反映。空のまま送信 → required が確実に効く
                  <input
                    type="number"
                    inputMode="numeric"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="400"
                    min={1}
                    required
                    autoFocus
                    aria-label={t("distanceLabel")}
                    data-testid="template-distance-custom"
                    className="h-8 sm:h-10 w-20 px-3 rounded-md border border-blue-600 bg-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDistance("");
                      setShowCustomDistance(true);
                    }}
                    className={chipClass(false)}
                    data-testid="template-distance-other"
                  >
                    {tPM("distanceOther")}
                  </button>
                )}
              </div>
            </div>

            {/* 本数 × セット数 — Critical 2: number | "" で保持 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                  {tPM("repsLabel")} <span className="text-red-500">*</span>
                </label>
                <NumberStepper
                  value={repCount}
                  onChange={(v) => setRepCount(v === "" ? "" : Number(v))}
                  min={1}
                  step={1}
                  placeholder="4"
                  ariaLabel={tPM("repsLabel")}
                  fieldLabel={tPM("repsLabel")}
                  decreaseLabel={tPM("decrease")}
                  increaseLabel={tPM("increase")}
                  data-testid="template-rep-count"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                  {tPM("setsLabel")} <span className="text-red-500">*</span>
                </label>
                <NumberStepper
                  value={setCount}
                  onChange={(v) => setSetCount(v === "" ? "" : Number(v))}
                  min={1}
                  step={1}
                  placeholder="1"
                  ariaLabel={tPM("setsLabel")}
                  fieldLabel={tPM("setsLabel")}
                  decreaseLabel={tPM("decrease")}
                  increaseLabel={tPM("increase")}
                  data-testid="template-set-count"
                />
              </div>
            </div>

            {/* サークル（分 / 秒）— Critical 3: circleMinutes の max={59} を削除 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                  {tPM("circleMinLabel")}
                </label>
                <NumberStepper
                  value={circleMinutes}
                  onChange={(v) => setCircleMinutes(v === "" ? "" : Number(v))}
                  min={0}
                  step={1}
                  placeholder="1"
                  ariaLabel={tPM("circleMinLabel")}
                  fieldLabel={tPM("circleMinLabel")}
                  decreaseLabel={tPM("decrease")}
                  increaseLabel={tPM("increase")}
                  data-testid="template-circle-min"
                />
              </div>

              <div>
                <label className="block text-[10px] sm:text-sm font-medium text-gray-700 mb-0.5 sm:mb-2">
                  {tPM("circleSecLabel")}
                </label>
                <NumberStepper
                  value={circleSeconds}
                  onChange={(v) => setCircleSeconds(v === "" ? "" : Number(v))}
                  min={0}
                  max={59}
                  step={10}
                  placeholder="30"
                  ariaLabel={tPM("circleSecLabel")}
                  fieldLabel={tPM("circleSecLabel")}
                  decreaseLabel={tPM("decrease")}
                  increaseLabel={tPM("increase")}
                  data-testid="template-circle-sec"
                />
              </div>
            </div>

            {/* タグ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("tagLabel")}</label>
              <TagInput
                selectedTags={selectedTags}
                availableTags={availableTags}
                onTagsChange={handleTagsChange}
                onAvailableTagsUpdate={handleAvailableTagsUpdate}
                placeholder={t("tagPlaceholder")}
              />
            </div>

            {/* メモ */}
            <div>
              <label
                htmlFor="template-note"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t("noteLabel")}
              </label>
              <textarea
                id="template-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("notePlaceholder")}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                {t("cancelButton")}
              </Button>
              <Button type="submit" disabled={!name || isPending}>
                {isPending
                  ? isEditMode
                    ? t("updatingButton")
                    : t("creatingButton")
                  : isEditMode
                    ? t("editButton")
                    : t("createButton")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
