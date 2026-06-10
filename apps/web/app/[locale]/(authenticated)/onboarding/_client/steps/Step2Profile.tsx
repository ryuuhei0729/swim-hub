"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import BirthdayInput from "@/components/ui/BirthdayInput";
import AvatarUpload from "@/components/profile/AvatarUpload";
import type { UserProfile } from "@apps/shared/types";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Step2FormData {
  name: string;
  gender: number;
  birthday: string;
  bio: string;
}

interface Step2ProfileProps {
  formData: Step2FormData;
  setFormData: React.Dispatch<React.SetStateAction<Step2FormData>>;
  avatarUrl: string | null;
  setAvatarUrl: React.Dispatch<React.SetStateAction<string | null>>;
  onNext: (updates: Partial<UserProfile>) => Promise<void>;
  onBack: () => void;
}

interface FormErrors {
  name?: string;
}

export default function Step2Profile({
  formData,
  setFormData,
  avatarUrl,
  setAvatarUrl,
  onNext,
  onBack,
}: Step2ProfileProps) {
  const t = useTranslations("onboarding.step2");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validate = (): FormErrors => {
    const newErrors: FormErrors = {};
    const trimmedName = formData.name.trim();

    if (!trimmedName) {
      newErrors.name = t("validation.nameRequired");
    } else if (EMAIL_REGEX.test(trimmedName)) {
      newErrors.name = t("validation.nameEmailFormat");
    } else if (trimmedName.length > 50) {
      newErrors.name = t("validation.nameTooLong", { max: 50 });
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      // DB の birthday は date 型なので YYYY-MM-DD を直接送る
      const birthday = formData.birthday || null;
      await onNext({
        name: formData.name.trim(),
        gender: formData.gender,
        birthday,
        bio: formData.bio.trim() || null,
        profile_image_path: avatarUrl,
      });
    } catch {
      setSaveError(t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, name: e.target.value }));
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  const isNameEmailFormat = EMAIL_REGEX.test(formData.name.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

      {saveError && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700" role="alert">
            {saveError}
          </p>
        </div>
      )}

      {/* プロフィール画像 (任意) */}
      <div className="flex flex-col items-center gap-1">
        <AvatarUpload
          currentAvatarUrl={avatarUrl}
          userName={formData.name || "?"}
          onAvatarChange={setAvatarUrl}
          disabled={saving}
          sizeClassName="h-20 w-20 sm:h-32 sm:w-32"
        />
      </div>

      {/* 名前 */}
      <div>
        <Input
          label={t("nameLabel")}
          id="onboarding-name"
          type="text"
          value={formData.name}
          onChange={handleNameChange}
          placeholder={t("namePlaceholder")}
          required
          error={errors.name}
          disabled={saving}
          aria-describedby={isNameEmailFormat ? "name-email-hint" : undefined}
        />
        {isNameEmailFormat && !errors.name && (
          <p id="name-email-hint" className="mt-1 text-sm text-amber-600">
            メールアドレス形式が入力されています。お名前を入力してください（このステップはスキップできません）
          </p>
        )}
      </div>

      {/* 性別 + 生年月日 (sm 以上で 2 列、それ未満は縦積み) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <div>
          <label htmlFor="onboarding-gender" className="block text-sm font-medium text-gray-700 mb-2">
            {t("genderLabel")}
          </label>
          <select
            id="onboarding-gender"
            value={formData.gender}
            onChange={(e) => setFormData((prev) => ({ ...prev, gender: parseInt(e.target.value, 10) }))}
            disabled={saving}
            className="w-full h-8 sm:h-10 px-2 sm:px-3 text-xs sm:text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          >
            <option value={0}>{t("genderMale")}</option>
            <option value={1}>{t("genderFemale")}</option>
          </select>
        </div>

        <BirthdayInput
          label={t("birthdayLabel")}
          value={formData.birthday}
          onChange={(date) => setFormData((prev) => ({ ...prev, birthday: date }))}
          disabled={saving}
        />
      </div>

      {/* 自己紹介 */}
      <div>
        <label htmlFor="onboarding-bio" className="block text-sm font-medium text-gray-700 mb-2">
          {t("bioLabel")}
        </label>
        <textarea
          id="onboarding-bio"
          value={formData.bio}
          onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
          placeholder={t("bioPlaceholder")}
          rows={4}
          maxLength={500}
          disabled={saving}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
        <p className="mt-1 text-sm text-gray-500">{t("bioCharCount", { count: formData.bio.length })}</p>
      </div>

      {/* ボタン */}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={saving} className="flex-1">
          {t("backButton")}
        </Button>
        <Button type="submit" disabled={saving || isNameEmailFormat} className="flex-1">
          {saving ? t("saving") : t("nextButton")}
        </Button>
      </div>
    </form>
  );
}
