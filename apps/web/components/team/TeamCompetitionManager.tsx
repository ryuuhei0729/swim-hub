"use client";

import React from "react";
import { useTranslations } from "next-intl";

interface TeamCompetitionManagerProps {
  teamId: string;
}

// TODO: Supabase直接アクセスで実装する
export default function TeamCompetitionManager({ teamId: _teamId }: TeamCompetitionManagerProps) {
  const t = useTranslations("teams.managers");
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{t("competitionTitle")}</h2>
      <div className="text-center py-8">
        <p className="text-gray-600">{t("competitionComingSoon")}</p>
        <p className="text-sm text-gray-500 mt-2">{t("competitionDesc")}</p>
      </div>
    </div>
  );
}
