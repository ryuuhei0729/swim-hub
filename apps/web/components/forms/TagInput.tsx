"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDownIcon, XMarkIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import TagManagementModal from "./TagManagementModal";
import { useAuth } from "@/contexts";
import { PracticeTag } from "@apps/shared/types";
import { getColorForName } from "@apps/shared/constants/tagColors";
import { useTranslations } from "next-intl";

type Tag = PracticeTag;

interface TagInputProps {
  selectedTags: Tag[];
  availableTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  onAvailableTagsUpdate: (tags: Tag[]) => void; // 利用可能タグの更新用
  placeholder?: string;
}

export default function TagInput({
  selectedTags,
  availableTags,
  onTagsChange,
  onAvailableTagsUpdate,
  placeholder,
}: TagInputProps) {
  const t = useTranslations("forms.tag");
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [selectedTagForManagement, setSelectedTagForManagement] = useState<Tag | null>(null);
  const [showTagManagement, setShowTagManagement] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { supabase } = useAuth();

  // タグ管理モーダルはドロップダウン(dropdownRef)の外側に描画されるため、モーダル内クリックを
  // 「外側クリック」と誤検知してドロップダウンが閉じてしまう。開いている間は閉じないよう ref で参照する。
  const isManagementOpenRef = useRef(false);
  useEffect(() => {
    isManagementOpenRef.current = showTagManagement;
  }, [showTagManagement]);

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // タグ管理モーダルを操作中(更新/削除/キャンセル等)はドロップダウンを閉じない。
      // 閉じると削除・更新後に一覧が消え、リアルタイム更新されていないように見えるため。
      if (isManagementOpenRef.current) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setInputValue("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside, { passive: true });
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // フィルタリングされたタグ
  const filteredTags = availableTags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(inputValue.toLowerCase()) &&
      !selectedTags.some((selected) => selected.id === tag.id),
  );

  // 新規作成の対象（同名タグが既にあれば作成行は出さない）
  const trimmedInput = inputValue.trim();
  const canCreate =
    trimmedInput.length > 0 &&
    !availableTags.some((tag) => tag.name.toLowerCase() === trimmedInput.toLowerCase());

  // タグの選択/解除
  const handleTagToggle = (tag: Tag) => {
    const isSelected = selectedTags.some((t) => t.id === tag.id);
    if (isSelected) {
      onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  // 新規タグ作成（リアルタイムDB反映）
  const handleCreateTag = async (tagName: string) => {
    if (!tagName.trim()) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("authRequired"));

      // 候補プレビューと同じ色を割り当てる（名前から決定的に導出）
      const color = getColorForName(tagName.trim());

      // DBに直接挿入
      const { data, error } = await supabase
        .from("practice_tags")
        .insert({
          user_id: user.id,
          name: tagName.trim(),
          color,
        })
        .select()
        .single();

      if (error) throw error;

      // 利用可能タグリストを更新
      const updatedAvailableTags = [...availableTags, data];
      onAvailableTagsUpdate(updatedAvailableTags);

      // 選択済みタグにも追加
      onTagsChange([...selectedTags, data]);
      setInputValue("");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error: unknown) {
      console.error("タグ作成エラー:", error);
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        alert(t("duplicateError"));
      }
    }
  };

  // タグ更新（リアルタイムDB反映）
  const handleUpdateTag = async (id: string, name: string, color: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("authRequired"));

      // DBを更新
      const { error } = await supabase
        .from("practice_tags")
        .update({
          name: name.trim(),
          color,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      // 利用可能タグリストを更新
      const updatedAvailableTags = availableTags.map((tag) =>
        tag.id === id ? { ...tag, name: name.trim(), color } : tag,
      );
      onAvailableTagsUpdate(updatedAvailableTags);

      // 選択済みタグも更新
      const updatedSelectedTags = selectedTags.map((tag) =>
        tag.id === id ? { ...tag, name: name.trim(), color } : tag,
      );
      onTagsChange(updatedSelectedTags);
    } catch (error) {
      console.error("タグ更新エラー:", error);
      throw error;
    }
  };

  // タグ削除（リアルタイムDB反映）
  const handleDeleteTag = async (id: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("authRequired"));

      // DBから削除
      const { error } = await supabase
        .from("practice_tags")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;

      // 利用可能タグリストから削除
      const updatedAvailableTags = availableTags.filter((tag) => tag.id !== id);
      onAvailableTagsUpdate(updatedAvailableTags);

      // 選択済みタグからも削除
      const updatedSelectedTags = selectedTags.filter((tag) => tag.id !== id);
      onTagsChange(updatedSelectedTags);
    } catch (error) {
      console.error("タグ削除エラー:", error);
      throw error;
    }
  };

  // タグ管理モーダルを開く
  const handleTagManagement = (tag: Tag, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedTagForManagement(tag);
    setShowTagManagement(true);
  };

  // タグ管理後の処理
  const handleTagManagementClose = () => {
    setSelectedTagForManagement(null);
    setShowTagManagement(false);
  };

  // 入力値の変更を処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const stopFormSubmission = (event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.nativeEvent.stopImmediatePropagation === "function") {
      event.nativeEvent.stopImmediatePropagation();
    }
  };

  // Enterキーで新規タグ作成（フォーム送信を防止）
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      stopFormSubmission(e);
      void handleCreateTag(inputValue);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      stopFormSubmission(e);
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* タグ入力エリア */}
        <div className="flex items-center min-h-[32px] sm:min-h-[40px] border border-gray-300 rounded-md hover:border-gray-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all bg-white">
          <div className="flex flex-1 min-w-0 flex-wrap gap-1 items-center">
            {/* 選択済みタグ */}
            {selectedTags.map((tag, index) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-black animate-in slide-in-from-top-1 duration-200"
                style={{
                  backgroundColor: tag.color,
                  animationDelay: `${index * 50}ms`, // 順次表示のアニメーション
                }}
                data-testid={`selected-tag-${tag.id}`}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagsChange(selectedTags.filter((t) => t.id !== tag.id));
                  }}
                  className="hover:bg-black/20 rounded-full p-0.5 transition-colors"
                  title={t("manageTip")}
                  data-testid={`remove-tag-button-${tag.id}`}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* 入力欄 */}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onKeyPress={handleKeyPress}
              onFocus={() => setIsOpen(true)}
              placeholder={selectedTags.length === 0 ? (placeholder ?? t("placeholder")) : t("searchPlaceholder")}
              className="flex-1 min-w-[120px] pr-6 text-sm border-none outline-none bg-transparent"
              data-testid="tag-input"
            />
          </div>

          <ChevronDownIcon
            className={`h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 transition-transform cursor-pointer ${
              isOpen ? "rotate-180" : ""
            }`}
            onClick={() => setIsOpen(!isOpen)}
          />
        </div>

        {/* ドロップダウンメニュー */}
        {isOpen && (
          <div
            className="absolute z-70 w-full top-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
            data-testid="tag-dropdown"
          >
            {/* タグ一覧（背景色付きピルで表示） */}
            <div className="py-1">
              {filteredTags.map((tag) => (
                <div
                  key={tag.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t("addHint")} ${tag.name}`}
                  className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors group"
                  onClick={() => handleTagToggle(tag)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleTagToggle(tag);
                    }
                  }}
                  data-testid={`tag-row-${tag.id}`}
                >
                  <span
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-black"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleTagManagement(tag, e)}
                    className="p-1 hover:bg-blue-100 rounded transition-colors"
                    title={t("manageTip")}
                    data-testid={`manage-tag-button-${tag.id}`}
                  >
                    <EllipsisVerticalIcon className="h-4 w-4 text-gray-500 hover:text-blue-600 transition-colors" />
                  </button>
                </div>
              ))}

              {/* 新規作成：背景色付きピルで作成対象を表示 */}
              {canCreate && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`${t("createLabel")} ${trimmedInput}`}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => void handleCreateTag(inputValue)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void handleCreateTag(inputValue);
                    }
                  }}
                  data-testid="tag-create-row"
                >
                  <span className="shrink-0 text-sm text-gray-500">{t("createLabel")}</span>
                  <span
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-black"
                    style={{ backgroundColor: getColorForName(trimmedInput) }}
                  >
                    {trimmedInput}
                  </span>
                </div>
              )}

              {/* 空状態（候補も作成対象も無い） */}
              {filteredTags.length === 0 && !canCreate && (
                <div className="px-3 py-2 text-sm text-gray-500 text-center">{t("noTags")}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* タグ管理モーダル */}
      {selectedTagForManagement && (
        <TagManagementModal
          isOpen={showTagManagement}
          onClose={handleTagManagementClose}
          tag={selectedTagForManagement}
          onUpdateTag={handleUpdateTag}
          onDeleteTag={handleDeleteTag}
        />
      )}
    </>
  );
}
