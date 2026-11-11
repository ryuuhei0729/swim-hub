"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PlusIcon, UserPlusIcon, UsersIcon } from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import Avatar from "@/components/ui/Avatar";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import type { TeamMembershipWithUser } from "@apps/shared/types";

interface AccountProfile {
  name: string;
  gender?: number;
  birthday?: string | null;
  bio?: string | null;
  profile_image_path?: string | null;
}

interface AccountProfileCardProps {
  profile: AccountProfile;
  teams: TeamMembershipWithUser[];
  onEdit: () => void;
  onCreateTeam: () => void;
  onJoinTeam: () => void;
}

/**
 * アカウント画面の先頭のプロフィールカード (アプリの ProfileDisplay と同じ並び)
 * 画像・名前を中央に置き、生年月日・性別を 1 行、その下に自己紹介と所属チームを並べる
 */
export default function AccountProfileCard({
  profile,
  teams,
  onEdit,
  onCreateTeam,
  onJoinTeam,
}: AccountProfileCardProps) {
  const t = useTranslations("account.web");
  const tProfile = useTranslations("mypage.profileDisplay");
  const locale = useLocale() as SupportedLocale;
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const teamMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTeamMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (teamMenuRef.current && !teamMenuRef.current.contains(event.target as Node)) {
        setIsTeamMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside, { passive: true });
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTeamMenuOpen]);

  // 生年月日・性別は入っているものだけを「・」でつなぐ (どちらも無ければ行ごと出さない)
  const metaParts: string[] = [];
  if (profile.birthday) {
    const birthday = formatDate(profile.birthday, "long", locale);
    if (birthday !== "-") metaParts.push(birthday);
  }
  if (profile.gender === 0) metaParts.push(tProfile("genderMale"));
  if (profile.gender === 1) metaParts.push(tProfile("genderFemale"));
  const metaLine = metaParts.join(" · ");

  // 承認済みかつアクティブなチームだけを出す
  const approvedTeams = teams.filter(
    (membership) => membership.status === "approved" && membership.is_active === true,
  );

  return (
    <section
      className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 px-4 py-5 sm:px-5 text-center"
      data-testid="account-profile-card"
    >
      <Avatar
        avatarUrl={profile.profile_image_path || null}
        userName={profile.name}
        size="lg"
        className="mx-auto"
      />
      <h2 className="mt-3 text-xl font-bold text-gray-900 break-words">{profile.name}</h2>
      {metaLine && <p className="mt-0.5 text-sm text-gray-500">{metaLine}</p>}

      {profile.bio && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2.5 text-left text-sm leading-relaxed text-gray-700 whitespace-pre-wrap break-words">
          {profile.bio}
        </p>
      )}

      {/* 所属チーム + 作成・参加 */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {approvedTeams.map((membership) => {
          const teamName =
            "teams" in membership && membership.teams?.name
              ? membership.teams.name
              : tProfile("unknownTeam");
          return (
            <Link
              key={membership.id}
              href={`/teams/${membership.team_id}`}
              className="inline-flex max-w-[220px] items-center truncate rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-200 transition-colors"
              title={teamName}
            >
              {teamName}
            </Link>
          );
        })}
        <div className="relative" ref={teamMenuRef}>
          <button
            type="button"
            onClick={() => setIsTeamMenuOpen((open) => !open)}
            className="inline-flex items-center rounded-full border border-dashed border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-500 hover:border-gray-400 hover:bg-gray-50 transition-colors"
            aria-label={t("addTeamAria")}
            aria-haspopup="menu"
            aria-expanded={isTeamMenuOpen}
            data-testid="account-add-team"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {approvedTeams.length === 0 && <span className="ml-1">{tProfile("addTeam")}</span>}
          </button>
          {isTeamMenuOpen && (
            <div
              role="menu"
              className="absolute left-1/2 z-10 mt-1 w-44 -translate-x-1/2 rounded-md bg-white py-1 text-left shadow-lg ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsTeamMenuOpen(false);
                  onCreateTeam();
                }}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <UsersIcon className="mr-2 h-4 w-4 text-gray-400" aria-hidden="true" />
                {tProfile("createTeam")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsTeamMenuOpen(false);
                  onJoinTeam();
                }}
                className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <UserPlusIcon className="mr-2 h-4 w-4 text-gray-400" aria-hidden="true" />
                {tProfile("joinTeam")}
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="mt-4 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        data-testid="account-edit-profile"
      >
        {t("editProfile")}
      </button>
    </section>
  );
}
