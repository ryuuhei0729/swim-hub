"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";

// next-intl の usePathname は locale プレフィックスを除いたパス (/dashboard 等) を返す。
// Link / useRouter も @/i18n/navigation に統一して、href にロケールプレフィックスを
// 含めずに済ませる (二重リダイレクト解消)。
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/contexts";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import {
  HomeIcon,
  ChartBarIcon,
  TrophyIcon,
  ChevronRightIcon,
  UsersIcon,
  UserIcon,
  ShieldCheckIcon,
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
  { href: "/mypage", icon: UserIcon },
  { href: "/teams", icon: UsersIcon },
];

type NavHref = "/dashboard" | "/practice" | "/competition" | "/mypage" | "/teams";

const NAV_NAME_KEYS: Record<NavHref, "nav.dashboard" | "nav.practice" | "nav.competition" | "nav.mypage" | "nav.team"> = {
  "/dashboard": "nav.dashboard",
  "/practice": "nav.practice",
  "/competition": "nav.competition",
  "/mypage": "nav.mypage",
  "/teams": "nav.team",
};

const NAV_DESC_KEYS: Record<NavHref, "nav.dashboardDesc" | "nav.practiceDesc" | "nav.competitionDesc" | "nav.mypageDesc" | "nav.teamDesc"> = {
  "/dashboard": "nav.dashboardDesc",
  "/practice": "nav.practiceDesc",
  "/competition": "nav.competitionDesc",
  "/mypage": "nav.mypageDesc",
  "/teams": "nav.teamDesc",
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations("sidebar");
  const pathname = usePathname();
  const router = useRouter();
  const { user, supabase, signOut } = useAuth();
  const [singleTeamId, setSingleTeamId] = useState<string | null>(null);
  const [adminTeamIds, setAdminTeamIds] = useState<string[]>([]);
  const [singleAdminTeamId, setSingleAdminTeamId] = useState<string | null>(null);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  // ユーザーのチーム一覧を取得してチーム数をチェック
  useEffect(() => {
    if (!user || !supabase) return;

    const loadTeams = async () => {
      try {
        const { data, error } = await supabase
          .from("team_memberships")
          .select("team_id, is_active")
          .eq("user_id", user.id)
          .eq("is_active", true);

        if (error) throw error;

        // チームが1つだけの場合はIDを保存
        if (data && data.length === 1) {
          setSingleTeamId(data[0].team_id);
        } else {
          setSingleTeamId(null);
        }
      } catch (error) {
        console.error("チーム情報の取得に失敗:", error);
        setSingleTeamId(null);
      }
    };

    // 管理者権限を持つチーム一覧を取得
    const loadAdminTeams = async () => {
      try {
        const { data, error } = await supabase
          .from("team_memberships")
          .select("team_id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .eq("is_active", true);

        if (error) throw error;

        const adminIds = data?.map((m) => m.team_id) || [];
        setAdminTeamIds(adminIds);

        // 管理者権限のチームが1つだけの場合はIDを保存
        if (adminIds.length === 1) {
          setSingleAdminTeamId(adminIds[0]);
        } else {
          setSingleAdminTeamId(null);
        }
      } catch (error) {
        console.error("管理者チーム情報の取得に失敗:", error);
        setAdminTeamIds([]);
        setSingleAdminTeamId(null);
      }
    };

    loadTeams();
    loadAdminTeams();

    // リアルタイム購読: チームメンバーシップの変更を監視
    const channel = supabase
      .channel("sidebar-team-memberships")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_memberships",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // チームメンバーシップが変更されたら再取得
          loadTeams();
          loadAdminTeams();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

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
              // チームの場合は、チームが1つだけの場合は直接チームページへ
              const href =
                item.href === "/teams" && singleTeamId ? `/teams/${singleTeamId}` : item.href;

              // アクティブ判定
              let isActive = pathname === item.href;

              // チームの場合は特別処理
              if (item.href === "/teams") {
                if (singleTeamId) {
                  // チームが1つの場合: チーム詳細ページ（/teams/[teamId]）にいる時はアクティブ
                  isActive =
                    pathname.startsWith(`/teams/${singleTeamId}`) &&
                    !pathname.startsWith("/teams-admin");
                } else {
                  // チームが0個または2つ以上の場合: /teamsページにいる時はアクティブ
                  isActive = pathname === "/teams";
                }
              }

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

            {/* チーム管理（管理者専用） */}
            {adminTeamIds.length > 0 && (
              <div className="group">
                <Link
                  href={singleAdminTeamId ? `/teams-admin/${singleAdminTeamId}` : "/teams-admin"}
                  className={`
                    group flex items-center px-3 py-2 lg:py-3 text-xs lg:text-sm font-medium rounded-lg transition-all duration-200 relative
                    ${
                      pathname.startsWith("/teams-admin")
                        ? "bg-purple-50 text-purple-700 shadow-sm border-l-4 border-purple-500"
                        : "text-purple-700 bg-purple-50/50 hover:text-purple-800 hover:bg-purple-100 hover:shadow-sm border-l-4 border-purple-300"
                    }
                  `}
                  onClick={onClose}
                  onMouseEnter={() =>
                    router.prefetch(
                      singleAdminTeamId ? `/teams-admin/${singleAdminTeamId}` : "/teams-admin",
                    )
                  }
                >
                  <ShieldCheckIcon
                    className={`
                      hidden lg:block mr-3 h-5 w-5 shrink-0 transition-colors duration-200
                      ${pathname.startsWith("/teams-admin") ? "text-purple-600" : "text-purple-500 group-hover:text-purple-600"}
                    `}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{t("nav.teamAdmin")}</span>
                      {!pathname.startsWith("/teams-admin") && (
                        <ChevronRightIcon className="h-4 w-4 text-purple-300 group-hover:text-purple-400 transition-colors duration-200" />
                      )}
                    </div>
                    <p className="hidden lg:block text-xs text-purple-600 mt-1 truncate font-medium">{t("nav.teamAdminDesc")}</p>
                  </div>
                </Link>
              </div>
            )}

            {/* スマホ用：言語切り替え + 設定・ログアウト */}
            <div className="lg:hidden mt-2 pt-2 border-t border-gray-200 space-y-1">
              <div className="px-3 py-2">
                <LanguageSwitcher />
              </div>
              <Link
                href="/settings"
                className={`
                  flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200
                  ${pathname === "/settings" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"}
                `}
                onClick={onClose}
              >
                {t("settings")}
              </Link>
              <button
                onClick={() => {
                  onClose();
                  setIsLogoutDialogOpen(true);
                }}
                className="flex items-center w-full px-3 py-2 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50 transition-all duration-200"
              >
                {t("logout")}
              </button>
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
              <span className="flex-1 truncate">SwimHub Timer</span>
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
              <span className="flex-1 truncate">SwimHub Scanner</span>
              <ArrowTopRightOnSquareIcon className="h-3 w-3 text-gray-300 group-hover:text-gray-400 shrink-0" />
            </a>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        variant="danger"
        title={t("logout")}
        message={t("logoutConfirm")}
        confirmLabel={t("logout")}
        cancelLabel={t("cancel")}
        onConfirm={async () => {
          const { error } = await signOut();
          setIsLogoutDialogOpen(false);
          if (error) {
            console.error("ログアウトエラー:", error);
            return;
          }
          router.replace("/login");
        }}
        onCancel={() => setIsLogoutDialogOpen(false)}
      />
    </>
  );
}
