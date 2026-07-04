"use client";

import React, { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import BirthdayInput from "@/components/ui/BirthdayInput";
import AvatarUpload from "./AvatarUpload";
import type { UserProfile } from "@apps/shared/types";

const BIO_MAX_LENGTH = 500;

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Partial<UserProfile>;
  onUpdate: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onAvatarChange: (newAvatarUrl: string | null) => void;
}

export default function ProfileEditModal({
  isOpen,
  onClose,
  profile,
  onUpdate,
  onAvatarChange,
}: ProfileEditModalProps) {
  const t = useTranslations("mypage.profileEdit");
  const [formData, setFormData] = useState({
    name: "",
    birthday: "",
    gender: 0,
    bio: "",
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bioTooLong = formData.bio.length > BIO_MAX_LENGTH;

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || "",
        birthday: profile.birthday ? profile.birthday.split("T")[0] : "", // YYYY-MM-DD形式
        gender: profile.gender !== undefined ? profile.gender : 0,
        bio: profile.bio || "",
      });
    }
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError(t("nameRequired"));
      return;
    }

    if (bioTooLong) {
      setError(t("bioTooLong", { max: BIO_MAX_LENGTH }));
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      // DB の birthday は date 型。YYYY-MM-DD のまま送る (Supabase が date にキャスト)
      const birthday = formData.birthday || null;

      // タイムアウト通知付きで更新を実行
      const TIMEOUT = 15000;
      const timeoutId = window.setTimeout(() => {
        setError(t("updating"));
      }, TIMEOUT);
      try {
        await onUpdate({
          name: formData.name.trim(),
          birthday,
          gender: formData.gender,
          bio: formData.bio.trim() || null,
        });
        // 成功時は即時にモーダルを閉じる
        onClose();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      console.error("プロフィール更新エラー:", err);
      if (err instanceof Error) {
        console.error("詳細:", err.message);
      }
      setError(t("updateFailed"));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChange =
    (field: keyof typeof formData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: field === "gender" ? parseInt(e.target.value, 10) : e.target.value,
      }));
      setError(null);
    };

  const handleClose = () => {
    if (!isUpdating) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* オーバーレイ */}
      <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />

      {/* モーダル */}
      <div className="flex min-h-full items-center justify-center p-0 sm:p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-3xl w-full">
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-200">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t("title")}</h3>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
              onClick={handleClose}
              disabled={isUpdating}
            >
              <span className="sr-only">{t("close")}</span>
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* ボディ */}
          <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-4 sm:space-y-6">
            {/* フィードバックメッセージ */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {/* 上段: 左=アバター / 右=名前+生年月日 */}
            <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4 sm:gap-8">
              {/* アバター */}
              <div className="flex items-start">
                <AvatarUpload
                  currentAvatarUrl={profile.profile_image_path ?? null}
                  userName={(formData.name || profile.name) ?? ""}
                  onAvatarChange={onAvatarChange}
                  disabled={isUpdating}
                />
              </div>

              {/* 名前 + 生年月日・性別 */}
              <div className="space-y-4">
                {/* 名前 */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    {t("nameLabel")} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange("name")}
                    placeholder={t("namePlaceholder")}
                    required
                    className="w-full"
                    disabled={isUpdating}
                  />
                </div>
                {/* 生年月日と性別（横並び） */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                  {/* 生年月日 */}
                  <div>
                    <BirthdayInput
                      label={t("birthdayLabel")}
                      value={formData.birthday}
                      onChange={(date) => {
                        setFormData((prev) => ({ ...prev, birthday: date }));
                        setError(null);
                      }}
                      disabled={isUpdating}
                    />
                  </div>
                  {/* 性別 */}
                  <div>
                    <span className="block text-sm font-medium text-gray-700 mb-2">
                      {t("genderLabel")}
                    </span>
                    <div
                      className="grid grid-cols-2 h-10 rounded-lg border border-gray-300 overflow-hidden"
                      role="group"
                      aria-label={t("genderLabel")}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, gender: 0 }))
                        }
                        disabled={isUpdating}
                        aria-pressed={formData.gender === 0}
                        className={`px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          formData.gender === 0
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {t("genderMale")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, gender: 1 }))
                        }
                        disabled={isUpdating}
                        aria-pressed={formData.gender === 1}
                        className={`px-3 text-sm transition-colors border-l border-gray-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                          formData.gender === 1
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {t("genderFemale")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 自己紹介（下段・全幅） */}
              <div className="md:col-span-2">
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-2">
                  {t("bioLabel")}
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={handleChange("bio")}
                  placeholder={t("bioPlaceholder")}
                  rows={5}
                  disabled={isUpdating}
                  aria-invalid={bioTooLong}
                  aria-describedby={bioTooLong ? "bio-error" : undefined}
                  className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                    bioTooLong
                      ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                  }`}
                />
                <p className={`mt-1 text-sm ${bioTooLong ? "text-red-600" : "text-gray-500"}`}>
                  {t("bioCount", { count: formData.bio.length })}
                </p>
                {bioTooLong && (
                  <p id="bio-error" className="mt-1 text-sm text-red-600" role="alert">
                    {t("bioTooLong", { max: BIO_MAX_LENGTH })}
                  </p>
                )}
              </div>
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-2 sm:gap-3">
              <Button type="button" variant="secondary" onClick={handleClose} disabled={isUpdating}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isUpdating || !formData.name.trim() || bioTooLong}>
                {isUpdating ? t("submitUpdating") : t("submit")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
