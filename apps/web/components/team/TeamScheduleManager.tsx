"use client";

import React from "react";
import { useTranslations } from "next-intl";

interface TeamScheduleManagerProps {
  teamId: string;
}

// TODO: Supabase直接アクセスで実装する
export default function TeamScheduleManager({ teamId: _teamId }: TeamScheduleManagerProps) {
  const t = useTranslations("teams.managers");
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("scheduleTitle")}</h2>
      <div className="text-center py-8">
        <p className="text-gray-600">{t("scheduleComingSoon")}</p>
        <p className="text-sm text-gray-500 mt-2">{t("scheduleDesc")}</p>
      </div>
    </div>
  );
}
