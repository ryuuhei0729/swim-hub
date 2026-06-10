"use client";

import React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import {
  ClipboardDocumentListIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

interface Step1WelcomeProps {
  onNext: () => void;
}

export default function Step1Welcome({ onNext }: Step1WelcomeProps) {
  const t = useTranslations("onboarding.step1");
  return (
    <div className="text-center space-y-5 sm:space-y-8">
      {/* ロゴ・ヒーロー */}
      <div className="space-y-2 sm:space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20">
          <Image src="/favicon.png" alt="SwimHub" width={80} height={80} className="w-14 h-14 sm:w-20 sm:h-20" />
        </div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm sm:text-lg text-gray-600 max-w-md mx-auto">
          {t("description")}
        </p>
      </div>

      {/* 機能紹介カード */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 text-left">
        <div className="bg-white rounded-lg p-2.5 sm:p-4 shadow-sm border border-gray-100">
          <ClipboardDocumentListIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 mb-1 sm:mb-2" aria-hidden="true" />
          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">{t("feature.practice.title")}</h3>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{t("feature.practice.description")}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 sm:p-4 shadow-sm border border-gray-100">
          <TrophyIcon className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 mb-1 sm:mb-2" aria-hidden="true" />
          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">{t("feature.competition.title")}</h3>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{t("feature.competition.description")}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 sm:p-4 shadow-sm border border-gray-100">
          <UserGroupIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 mb-1 sm:mb-2" aria-hidden="true" />
          <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">{t("feature.team.title")}</h3>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{t("feature.team.description")}</p>
        </div>
      </div>

      <Button onClick={onNext} className="w-full sm:w-auto px-12">
        {t("startButton")}
      </Button>
    </div>
  );
}
