"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

export function BackButton() {
  const t = useTranslations("common");
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center text-sm text-gray-600 hover:text-blue-600 transition-colors mb-6"
    >
      <ArrowLeftIcon className="w-4 h-4 mr-2" />
      {t("back")}
    </button>
  );
}
