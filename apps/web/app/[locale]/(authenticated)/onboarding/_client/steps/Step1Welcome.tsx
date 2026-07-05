"use client";

import React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import {
  ClipboardDocumentListIcon,
  TrophyIcon,
  UserPlusIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
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

      {/* 個人機能 */}
      <div className="space-y-2 text-left">
        <h2 className="text-xs sm:text-sm font-semibold text-gray-500 px-0.5">{t("personalLabel")}</h2>
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
        </div>
      </div>

      {/* チーム機能 */}
      <div className="space-y-2 text-left">
        <h2 className="text-xs sm:text-sm font-semibold text-gray-500 px-0.5">{t("teamLabel")}</h2>

        {/* 代理入力（イチオシ） */}
        <div className="bg-linear-to-r from-indigo-50 to-blue-50 rounded-lg p-3 sm:p-4 border border-indigo-200 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-indigo-600">
              <UserPlusIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="font-bold text-gray-900 text-sm sm:text-base">{t("teamFeature.proxy.title")}</h3>
                <span className="inline-block text-[9px] sm:text-[10px] font-semibold text-white bg-indigo-600 rounded-full px-2 py-0.5">
                  {t("teamFeature.proxy.badge")}
                </span>
              </div>
              <p className="text-[11px] sm:text-sm text-gray-600 mt-0.5 sm:mt-1">{t("teamFeature.proxy.description")}</p>
            </div>
          </div>
        </div>

        {/* その他のチーム機能 */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <div className="bg-white rounded-lg p-2.5 sm:p-4 shadow-sm border border-gray-100">
            <CalendarDaysIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 mb-1 sm:mb-2" aria-hidden="true" />
            <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">{t("teamFeature.attendance.title")}</h3>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{t("teamFeature.attendance.description")}</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 sm:p-4 shadow-sm border border-gray-100">
            <ClipboardDocumentCheckIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 mb-1 sm:mb-2" aria-hidden="true" />
            <h3 className="font-semibold text-gray-900 text-xs sm:text-sm">{t("teamFeature.entry.title")}</h3>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">{t("teamFeature.entry.description")}</p>
          </div>
        </div>
      </div>

      <Button onClick={onNext} className="w-full sm:w-auto px-12">
        {t("startButton")}
      </Button>
    </div>
  );
}
