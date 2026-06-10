"use client";

import React from "react";
import { useTranslations } from "next-intl";

interface MemberGroupSorterProps {
  categories: string[];
  activeCategory: string | null;
  onToggle: (category: string) => void;
  getCategoryLabel?: (category: string) => string;
}

export const MemberGroupSorter: React.FC<MemberGroupSorterProps> = ({
  categories,
  activeCategory,
  onToggle,
  getCategoryLabel,
}) => {
  const t = useTranslations("teams");

  if (categories.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-500">{t("memberGroupSorter.label")}</span>
      {categories.map((category) => {
        const isActive = activeCategory === category;
        const label = getCategoryLabel ? getCategoryLabel(category) : category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              isActive
                ? "bg-blue-100 border-blue-300 text-blue-700 font-semibold"
                : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
