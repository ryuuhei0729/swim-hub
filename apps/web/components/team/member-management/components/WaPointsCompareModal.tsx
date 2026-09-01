"use client";

import React, { useMemo } from "react";
import { useTranslations } from "next-intl";
import BaseModal from "@/components/ui/BaseModal";
import Avatar from "@/components/ui/Avatar";
import { formatTimeBest } from "@apps/shared/utils/time";
import {
  rankMembersByWaPoints,
  type Gender,
  type MemberWaPointsInput,
  type PoolType,
  type WaPointRecordInput,
} from "@apps/shared/utils/waPoints";
import { STYLES, STYLE_KEY_MAP, getStyleOrderIndex } from "@apps/shared/utils/swimStyles";
import type { BestTime } from "../../shared/hooks/useMemberBestTimes";
import type { TeamMember } from "../hooks/useMembers";

interface WaPointsCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: TeamMember[];
  memberBestTimes: Map<string, BestTime[]>;
  isLoading: boolean;
  error: string | null;
}

/**
 * BestTime.style.name_jp (距離接頭辞つき、例: "100m自由形") から
 * StyleTranslationKey (例: "Fr") を導出する。対応する種目が無ければ null。
 */
function toStyleKey(nameJp: string) {
  const index = getStyleOrderIndex(nameJp);
  if (index === -1) return null;
  const styleName = STYLES[index];
  if (!styleName) return null; // getStyleOrderIndex は STYLES 内の位置を返すため通常
    // undefined にならないが、STYLES と STYLE_KEY_MAP は別データ構造であり
    // 型上の保証はないため防御的に扱う (! による強制は使わない)
  return STYLE_KEY_MAP[styleName];
}

/**
 * メンバー1名分の BestTime[] を WA ポイント計算用の入力配列に変換する。
 *
 * - is_relaying=true の記録は常に除外する (includeRelaying トグルに依存しない、要件5)
 * - useMemberBestTimes のフォールバックエントリ (非リレー記録が無い種目に混入する
 *   is_relaying=true エントリ) も同じフィルタで除外される
 * - gender が 0/1 以外 (未設定) のメンバーは計算対象外 (空配列を返す)
 */
function buildWaPointRecords(bestTimes: BestTime[], gender: Gender | null): WaPointRecordInput[] {
  if (gender === null) return [];

  const records: WaPointRecordInput[] = [];
  for (const bestTime of bestTimes) {
    if (bestTime.is_relaying) continue;

    const styleKey = toStyleKey(bestTime.style.name_jp);
    if (!styleKey) continue;

    const poolType: PoolType = bestTime.pool_type === 1 ? 1 : 0;
    records.push({
      time: bestTime.time,
      poolType,
      gender,
      styleKey,
      distance: bestTime.style.distance,
      isRelaying: false,
    });
  }
  return records;
}

export function WaPointsCompareModal({
  isOpen,
  onClose,
  members,
  memberBestTimes,
  isLoading,
  error,
}: WaPointsCompareModalProps) {
  const t = useTranslations("teams");
  const tPractice = useTranslations("practice");

  const ranking = useMemo(() => {
    if (!isOpen) return [];

    const inputs: MemberWaPointsInput[] = members.map((member) => {
      const genderRaw = member.users?.gender;
      const gender: Gender | null = genderRaw === 0 || genderRaw === 1 ? genderRaw : null;
      const bestTimes = memberBestTimes.get(member.id) ?? [];
      return {
        memberId: member.id,
        displayName: member.users?.name || t("membersTimeTable.unknownUser"),
        records: buildWaPointRecords(bestTimes, gender),
      };
    });

    return rankMembersByWaPoints(inputs);
  }, [isOpen, members, memberBestTimes, t]);

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("waPointsCompare.modalTitle")}
      size="lg"
    >
      <div data-testid="team-wa-points-modal">
        {isLoading && (
          <div className="animate-pulse space-y-2" data-testid="team-wa-points-loading">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="h-10 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="text-center py-8 text-red-600 text-sm" data-testid="team-wa-points-error">
            {error}
          </div>
        )}

        {!isLoading && !error && ranking.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-sm" data-testid="team-wa-points-empty">
            {t("waPointsCompare.empty")}
          </div>
        )}

        {!isLoading && !error && ranking.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-700 w-12">
                    {t("waPointsCompare.rankLabel")}
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-gray-700">
                    {t("membersTimeTable.col.name")}
                  </th>
                  <th className="text-left py-2 px-2 font-medium text-gray-700">
                    {t("waPointsCompare.styleLabel")}
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-gray-700">
                    {t("waPointsCompare.pointsLabel")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => {
                  const member = memberById.get(entry.memberId);
                  const styleLabel = tPractice(
                    `styles.${entry.styleKey}` as Parameters<typeof tPractice>[0],
                  );
                  const courseLabel =
                    entry.poolType === 1
                      ? t("waPointsCompare.courseLong")
                      : t("waPointsCompare.courseShort");

                  return (
                    <tr
                      key={entry.memberId}
                      className="border-b border-gray-100 last:border-b-0"
                      data-testid={`team-wa-points-row-${entry.rank}`}
                    >
                      <td className="py-2 px-2 font-semibold text-gray-700">{entry.rank}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar
                            avatarUrl={member?.users?.profile_image_path ?? null}
                            userName={entry.displayName}
                            size="sm"
                          />
                          <span className="truncate text-gray-900">{entry.displayName}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-700">
                        <span>
                          {entry.distance}m{styleLabel}
                        </span>
                        <span className="ml-1 text-[10px] text-gray-500">({courseLabel})</span>
                        <span className="ml-1 text-xs text-gray-500">
                          {formatTimeBest(entry.time)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-bold text-blue-700">
                        {entry.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
