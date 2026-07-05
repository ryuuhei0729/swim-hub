"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
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
  bio?: string;
}

const BIO_MAX_LENGTH = 500;

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

    if (formData.bio.length > BIO_MAX_LENGTH) {
      newErrors.bio = t("validation.bioTooLong", { max: BIO_MAX_LENGTH });
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
  const bioTooLong = formData.bio.length > BIO_MAX_LENGTH;

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
        <label htmlFor="onboarding-name" className="block text-sm font-medium text-gray-700 mb-2">
          {t("nameLabel")}
          <span className="text-red-500 ml-1">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <input
            type="text"
            id="onboarding-name"
            value={formData.name}
            onChange={handleNameChange}
            placeholder={t("namePlaceholder")}
            required
            disabled={saving}
            aria-invalid={!!errors.name}
            aria-describedby={isNameEmailFormat ? "name-email-hint" : undefined}
            className="pl-10 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
        </div>
        {errors.name && (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {errors.name}
          </p>
        )}
        {isNameEmailFormat && !errors.name && (
          <p id="name-email-hint" className="mt-1 text-sm text-amber-600">
            メールアドレス形式が入力されています。お名前を入力してください（このステップはスキップできません）
          </p>
        )}
      </div>

      {/* 性別 + 生年月日 (sm 以上で 2 列、それ未満は縦積み) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            {t("genderLabel")}
          </span>
          <div
            className="grid grid-cols-2 h-8 sm:h-10 rounded-lg border border-gray-300 overflow-hidden"
            role="group"
            aria-label={t("genderLabel")}
          >
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, gender: 0 }))}
              disabled={saving}
              aria-pressed={formData.gender === 0}
              className={`px-2 sm:px-3 text-xs sm:text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                formData.gender === 0 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("genderMale")}
            </button>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, gender: 1 }))}
              disabled={saving}
              aria-pressed={formData.gender === 1}
              className={`px-2 sm:px-3 text-xs sm:text-sm transition-colors border-l border-gray-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                formData.gender === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t("genderFemale")}
            </button>
          </div>
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
          onChange={(e) => {
            setFormData((prev) => ({ ...prev, bio: e.target.value }));
            if (errors.bio) {
              setErrors((prev) => ({ ...prev, bio: undefined }));
            }
          }}
          placeholder={t("bioPlaceholder")}
          rows={4}
          disabled={saving}
          aria-invalid={bioTooLong}
          aria-describedby={bioTooLong ? "onboarding-bio-error" : undefined}
          className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:cursor-not-allowed ${
            bioTooLong
              ? "border-red-500 focus:ring-red-500 focus:border-red-500"
              : "border-gray-300 focus:ring-blue-500 focus:border-blue-500"
          }`}
        />
        <p className={`mt-1 text-sm ${bioTooLong ? "text-red-600" : "text-gray-500"}`}>
          {t("bioCharCount", { count: formData.bio.length })}
        </p>
        {bioTooLong && (
          <p id="onboarding-bio-error" className="mt-1 text-sm text-red-600" role="alert">
            {t("validation.bioTooLong", { max: BIO_MAX_LENGTH })}
          </p>
        )}
      </div>

      {/* ボタン */}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} disabled={saving} className="flex-1">
          {t("backButton")}
        </Button>
        <Button type="submit" disabled={saving || isNameEmailFormat || bioTooLong} className="flex-1">
          {saving ? t("saving") : t("nextButton")}
        </Button>
      </div>
    </form>
  );
}
