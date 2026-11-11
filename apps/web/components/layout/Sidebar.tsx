"use client";

import React from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

// next-intl の usePathname は locale プレフィックスを除いたパス (/dashboard 等) を返す。
// Link / useRouter も @/i18n/navigation に統一して、href にロケールプレフィックスを
// 含めずに済ませる (二重リダイレクト解消)。
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import {
  HomeIcon,
  ChartBarIcon,
  TrophyIcon,
  FlagIcon,
  ChevronRightIcon,
  UsersIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavigationItem {
  href: string;
  icon: React.ElementType;
  badge?: number;
}

const baseNavigation: NavigationItem[] = [
  { href: "/dashboard", icon: HomeIcon },
  { href: "/practice", icon: ChartBarIcon },
  { href: "/competition", icon: TrophyIcon },
  { href: "/goals", icon: FlagIcon },
  { href: "/teams", icon: UsersIcon },
];

// マイページは 2026-11 に設定と統合して「アカウント」になり、入口はヘッダーのアバターに移した
type NavHref = "/dashboard" | "/practice" | "/competition" | "/goals" | "/teams";

const NAV_NAME_KEYS: Record<
  NavHref,
  "nav.dashboard" | "nav.practice" | "nav.competition" | "nav.goals" | "nav.team"
> = {
  "/dashboard": "nav.dashboard",
  "/practice": "nav.practice",
  "/competition": "nav.competition",
  "/goals": "nav.goals",
  "/teams": "nav.team",
};

const NAV_DESC_KEYS: Record<
  NavHref,
  | "nav.dashboardDesc"
  | "nav.practiceDesc"
  | "nav.competitionDesc"
  | "nav.goalsDesc"
  | "nav.teamDesc"
> = {
  "/dashboard": "nav.dashboardDesc",
  "/practice": "nav.practiceDesc",
  "/competition": "nav.competitionDesc",
  "/goals": "nav.goalsDesc",
  "/teams": "nav.teamDesc",
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations("sidebar");
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* モバイル用オーバーレイ */}
      {isOpen && (
        <div
          className="fixed top-16 inset-x-0 bottom-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* サイドバー */}
      <div
        className={`
        fixed top-16 bottom-auto lg:bottom-0 right-0 lg:right-auto lg:left-0 z-50 w-44 bg-white shadow-xl rounded-bl-xl lg:rounded-none transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:fixed lg:w-64 flex flex-col
        ${isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
      `}
      >

        {/* ナビゲーション */}
        <nav className="mt-6 px-3 pb-6">
          <div className="space-y-2">
            {baseNavigation.map((item) => {
              const href = item.href;

              // チームは /teams (入口) から最後に開いたチームの利用者ビュー (/teams/[teamId]) か
              // 管理者ビュー (/teams-admin/[teamId]) へ移るので、その配下すべてでアクティブにする
              const isActive =
                item.href === "/teams"
                  ? pathname === "/teams" ||
                    pathname.startsWith("/teams/") ||
                    pathname.startsWith("/teams-admin")
                  : pathname === item.href;

              return (
                <div key={item.href} className="group">
                  <Link
                    href={href}
                    className={`
                      group flex items-center px-3 py-2 lg:py-3 text-xs lg:text-sm font-medium rounded-lg transition-all duration-200 relative
                      ${
                        isActive
                          ? "bg-blue-50 text-blue-700 shadow-sm border-l-4 border-blue-500"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:shadow-sm"
                      }
                    `}
                    onClick={onClose}
                    onMouseEnter={() => router.prefetch(href)}
                  >
                    <item.icon
                      className={`
                        hidden lg:block mr-3 h-5 w-5 shrink-0 transition-colors duration-200
                        ${isActive ? "text-blue-600" : "text-gray-400 group-hover:text-gray-600"}
                      `}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{t(NAV_NAME_KEYS[item.href as NavHref])}</span>
                        <div className="flex items-center space-x-2">
                          {item.badge && (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                              {item.badge > 9 ? "9+" : item.badge}
                            </span>
                          )}
                          {!isActive && (
                            <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-gray-400 transition-colors duration-200" />
                          )}
                        </div>
                      </div>
                      <p className="hidden lg:block text-xs text-gray-500 mt-1 truncate">{t(NAV_DESC_KEYS[item.href as NavHref])}</p>
                    </div>
                  </Link>
                </div>
              );
            })}

            {/* スマホ用：言語切り替え (設定・ログアウトはヘッダーのアバター → アカウント画面へ移した) */}
            <div className="lg:hidden mt-2 pt-2 border-t border-gray-200">
              <div className="px-3 py-2">
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </nav>

        {/* 関連サービス（デスクトップのみ） */}
        <div className="hidden lg:block mt-auto border-t border-gray-200 px-3 py-4">
          <p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            {t("relatedServices")}
          </p>
          <div className="space-y-1">
            <a
              href="https://timer.swim-hub.app"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center px-3 py-2 text-sm rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors duration-200"
            >
              <Image
                src="/timer-icon.png"
                alt="SwimHub Timer"
                width={48}
                height={48}
                className="mr-3 w-10 h-10 shrink-0"
              />
              <span className="flex-1 truncate font-(family-name:--font-chakra-petch)">SwimHub Timer</span>
              <ArrowTopRightOnSquareIcon className="h-3 w-3 text-gray-300 group-hover:text-gray-400 shrink-0" />
            </a>
            <a
              href="https://scanner.swim-hub.app"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center px-3 py-2 text-sm rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors duration-200"
            >
              <Image
                src="/scanner-icon.png"
                alt="SwimHub Scanner"
                width={48}
                height={48}
                className="mr-3 w-10 h-10 shrink-0"
              />
              <span className="flex-1 truncate font-(family-name:--font-chakra-petch)">SwimHub Scanner</span>
              <ArrowTopRightOnSquareIcon className="h-3 w-3 text-gray-300 group-hover:text-gray-400 shrink-0" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
