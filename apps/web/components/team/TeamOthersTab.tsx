"use client";

/**
 * チーム画面「その他」タブ: メンバー・予定・出欠に入らない機能を大きめのカードで並べる
 * (mobile の components/teams/TeamOthersTab.tsx と同じ。swimhub-tasks #100)。
 * カードを押すと、タブの上に重ねてそれぞれの画面を開く (mobile ではスタックに積む画面)。
 *
 * - ランキング … 全員
 * - メンバーの目標 … 管理者ビューのときだけ
 *
 * 機能を足すときは CARDS に 1 行足す (タブを増やさない方針。teamTabDefs.ts 参照)。
 */
import React from "react";
import { useTranslations } from "next-intl";
import { ChartBarIcon, ChevronRightIcon, FlagIcon } from "@heroicons/react/24/outline";
import type { TeamSubScreen } from "./teamTabDefs";

interface OthersCard {
  id: Extract<TeamSubScreen, "rankings" | "goals">;
  icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  titleKey: "mobile.others.rankingsTitle" | "mobile.others.goalsTitle";
  descriptionKey: "mobile.others.rankingsDescription" | "mobile.others.goalsDescription";
  adminOnly: boolean;
}

const CARDS: OthersCard[] = [
  {
    id: "rankings",
    icon: ChartBarIcon,
    iconClassName: "bg-pink-100 text-pink-600",
    titleKey: "mobile.others.rankingsTitle",
    descriptionKey: "mobile.others.rankingsDescription",
    adminOnly: false,
  },
  {
    id: "goals",
    icon: FlagIcon,
    iconClassName: "bg-sky-100 text-sky-600",
    titleKey: "mobile.others.goalsTitle",
    descriptionKey: "mobile.others.goalsDescription",
    adminOnly: true,
  },
];

export interface TeamOthersTabProps {
  /** 管理者ビューか */
  isAdminView: boolean;
  onOpen: (screen: OthersCard["id"]) => void;
}

export default function TeamOthersTab({ isAdminView, onOpen }: TeamOthersTabProps) {
  const t = useTranslations("teams");
  const visibleCards = CARDS.filter((card) => !card.adminOnly || isAdminView);

  return (
    <div className="p-3 sm:p-4 space-y-3" data-testid="team-others-tab">
      {visibleCards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onOpen(card.id)}
            data-testid={`team-others-card-${card.id}`}
            className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${card.iconClassName}`}
            >
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base font-bold text-gray-900">{t(card.titleKey)}</span>
              <span className="text-sm text-gray-500">{t(card.descriptionKey)}</span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
