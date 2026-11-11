"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts";
import { useUserQuery, userKeys } from "@apps/shared/hooks";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { usePracticeLogTemplateCountQuery } from "@apps/shared/hooks/queries/practiceLogTemplates";
import { checkIsPremium } from "@apps/shared/utils/premium";
import ProfileEditModal from "@/components/profile/ProfileEditModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { UserProfile as SharedUserProfile, UserUpdate } from "@apps/shared/types";
import AccountProfileCard from "../_components/AccountProfileCard";
import AccountMenu from "../_components/AccountMenu";
import PlanSection from "../_components/sections/PlanSection";
import CalendarSection from "../_components/sections/CalendarSection";
import TemplatesSection from "../_components/sections/TemplatesSection";
import SecuritySection from "../_components/sections/SecuritySection";
import { DEFAULT_ACCOUNT_TAB, parseAccountTab, type AccountTab } from "../_components/accountTabs";

const TeamCreateModal = dynamic(() => import("@/components/team/TeamCreateModal"));
const TeamJoinModal = dynamic(() => import("@/components/team/TeamJoinModal"));

interface UserProfile {
  id: string;
  name: string;
  gender?: number;
  birthday?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  profile_image_path?: string | null;
}

interface AccountClientProps {
  // サーバー側で取得したデータ
  initialProfile: UserProfile | null;
}

/**
 * Stripe Checkout から戻ってきたとき (?session_id=...) にセッションを検証し、
 * subscription を最新化する (Webhook が遅れたときのフォールバック)。
 * 旧設定画面 (SettingsClient) から移設。
 */
function useCheckoutSessionVerification(): string | null {
  const router = useRouter();
  const { refreshSubscription } = useAuth();
  const tErrors = useTranslations("settings.errors");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // マウント時に subscription を最新化（null からの遅延ロード対策）
  useEffect(() => {
    refreshSubscription();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return;

    // URL から session_id だけを即座に除去（ブラウザ履歴を汚さない。?tab は残す）
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    const verifySession = async () => {
      try {
        const res = await fetch("/api/stripe/verify-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.ok) {
          // DB 更新成功 — AuthProvider の subscription を最新化してページをリフレッシュ
          await refreshSubscription();
          router.refresh();
          return;
        }
        console.error("verify-session failed:", res.status, data);
        setCheckoutError(data.error || tErrors("planSyncFailed"));
      } catch (err) {
        console.error("verify-session request error:", err);
        setCheckoutError(tErrors("planSyncError"));
      }
    };
    verifySession();
  }, [refreshSubscription]); // eslint-disable-line react-hooks/exhaustive-deps

  return checkoutError;
}

/**
 * アカウント画面 (旧マイページ + 設定)
 * - PC (lg 以上): 左にプロフィールカードと設定一覧、右に選んだ項目の詳細
 * - SP: プロフィールカードと設定一覧。行を押すと ?tab= の詳細画面へ進む
 */
export default function AccountClient({ initialProfile }: AccountClientProps) {
  const t = useTranslations("account.web");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, supabase, subscription, signOut } = useAuth();
  const queryClient = useQueryClient();

  const currentTab = parseAccountTab(searchParams.get("tab"));
  const activeTab: AccountTab = currentTab ?? DEFAULT_ACCOUNT_TAB;

  const { profile: queryProfile } = useUserQuery(supabase, {
    userId: user?.id,
    initialProfile: initialProfile as SharedUserProfile | null,
  });
  const { teams = [] } = useTeamsQuery(supabase);
  const { data: templateCount } = usePracticeLogTemplateCountQuery(supabase);
  const checkoutError = useCheckoutSessionVerification();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isJoinTeamModalOpen, setIsJoinTeamModalOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  const profile: UserProfile | null = queryProfile
    ? {
        id: queryProfile.id,
        name: queryProfile.name,
        gender: queryProfile.gender,
        birthday: queryProfile.birthday,
        bio: queryProfile.bio,
        avatar_url: queryProfile.profile_image_path,
        profile_image_path: queryProfile.profile_image_path,
      }
    : null;

  const invalidateProfile = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: userKeys.profile(user.id) });
    queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() });
  }, [user, queryClient]);

  const handleProfileUpdate = useCallback(
    async (updatedProfile: Partial<UserProfile>) => {
      if (!user) return;

      try {
        // データベースのカラム名に合わせて変換
        const dbUpdate: UserUpdate = {};
        if (updatedProfile.name !== undefined) dbUpdate.name = updatedProfile.name;
        if (updatedProfile.gender !== undefined) dbUpdate.gender = updatedProfile.gender;
        if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday;
        if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio;
        if (updatedProfile.avatar_url !== undefined)
          dbUpdate.profile_image_path = updatedProfile.avatar_url;
        if (updatedProfile.profile_image_path !== undefined)
          dbUpdate.profile_image_path = updatedProfile.profile_image_path;

        const { error } = await supabase
          .from("users")
          .update(dbUpdate as Record<string, unknown>)
          .eq("id", user.id);

        if (error) throw error;
        invalidateProfile();
      } catch (err) {
        console.error("プロフィール更新エラー:", err);
        throw err;
      }
    },
    [user, supabase, invalidateProfile],
  );

  const handleAvatarChange = useCallback(
    async (newAvatarUrl: string | null) => {
      if (!user) return;

      try {
        const { error } = await supabase
          .from("users")
          .update({ profile_image_path: newAvatarUrl } as Record<string, unknown>)
          .eq("id", user.id);

        if (error) throw error;
        invalidateProfile();
      } catch (err) {
        console.error("アバター更新エラー:", err);
        throw err;
      }
    },
    [user, supabase, invalidateProfile],
  );

  // チーム作成成功時: ページをリロードして最新状態を反映（旧マイページと同じ）
  const handleCreateTeamSuccess = useCallback((_teamId: string) => {
    window.location.reload();
  }, []);

  // チーム参加成功時: チーム一覧だけを取り直す
  const handleJoinTeamSuccess = useCallback(
    (_teamId: string) => {
      setIsJoinTeamModalOpen(false);
      queryClient.invalidateQueries({ queryKey: teamKeys.list() });
    },
    [queryClient],
  );

  const handleLogout = useCallback(async () => {
    const { error } = await signOut();
    setIsLogoutDialogOpen(false);
    if (error) {
      console.error("ログアウトエラー:", error);
      return;
    }
    router.replace("/login");
  }, [signOut, router]);

  // 「プラン」行の右に出す値
  const planValue = useMemo(() => {
    if (subscription?.status === "trialing") return t("planValue.trialing");
    return checkIsPremium(subscription) ? t("planValue.premium") : t("planValue.free");
  }, [subscription, t]);

  // 「カレンダー」行の右に出す値
  const calendarValue = queryProfile?.google_calendar_enabled
    ? t("calendarValue.google")
    : t("calendarValue.notConnected");

  const sectionTitle = t(`rows.${activeTab}`);
  const sectionDescription = t(`sections.${activeTab}`);

  const renderSection = () => {
    switch (activeTab) {
      case "plan":
        return <PlanSection checkoutError={checkoutError} />;
      case "calendar":
        return (
          <CalendarSection profile={queryProfile ?? null} onProfileUpdate={invalidateProfile} />
        );
      case "templates":
        return <TemplatesSection />;
      case "security":
        return <SecuritySection />;
    }
  };

  // SP では ?tab があれば詳細だけ、無ければ一覧だけを出す。PC は常に両方を並べる
  const listVisibility = currentTab ? "hidden lg:block" : "";
  const detailVisibility = currentTab ? "" : "hidden lg:block";

  return (
    <div className="px-3 sm:px-0">
      <h1
        className={`mb-4 text-xl sm:text-2xl font-bold text-gray-900 ${currentTab ? "hidden lg:block" : ""}`}
      >
        {t("title")}
      </h1>

      <div className="lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 左: プロフィールと設定一覧 */}
        <div className={`space-y-4 ${listVisibility}`}>
          {profile && (
            <AccountProfileCard
              profile={profile}
              teams={teams}
              onEdit={() => setIsEditModalOpen(true)}
              onCreateTeam={() => setIsCreateTeamModalOpen(true)}
              onJoinTeam={() => setIsJoinTeamModalOpen(true)}
            />
          )}
          <AccountMenu
            activeTab={activeTab}
            currentTab={currentTab}
            planValue={planValue}
            calendarValue={calendarValue}
            templateCount={templateCount}
            onLogout={() => setIsLogoutDialogOpen(true)}
          />
        </div>

        {/* 右: 選んだ項目の詳細 (SP では詳細画面) */}
        <section
          className={`space-y-4 sm:space-y-6 ${detailVisibility}`}
          aria-labelledby="account-section-title"
          data-testid={`account-section-${activeTab}`}
        >
          <Link
            href="/account"
            className="lg:hidden inline-flex items-center gap-0.5 text-sm font-semibold text-blue-600 hover:text-blue-700"
            aria-label={t("backAriaLabel")}
          >
            <ChevronLeftIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            {t("title")}
          </Link>
          <div>
            <h2 id="account-section-title" className="text-xl font-bold text-gray-900">
              {sectionTitle}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{sectionDescription}</p>
          </div>
          {renderSection()}
        </section>
      </div>

      {/* プロフィール編集モーダル */}
      {profile && (
        <ProfileEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          profile={profile}
          onUpdate={handleProfileUpdate}
          onAvatarChange={handleAvatarChange}
        />
      )}

      <TeamCreateModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleCreateTeamSuccess}
      />
      <TeamJoinModal
        isOpen={isJoinTeamModalOpen}
        onClose={() => setIsJoinTeamModalOpen(false)}
        onSuccess={handleJoinTeamSuccess}
      />

      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        variant="danger"
        title={t("rows.logout")}
        message={t("logoutConfirm")}
        confirmLabel={t("rows.logout")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleLogout}
        onCancel={() => setIsLogoutDialogOpen(false)}
      />
    </div>
  );
}
