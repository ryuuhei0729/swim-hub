"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamGroup, TeamGroupMembership } from "@swim-hub/shared/types";
import { teamGroupSortDataQueryOptions } from "@/hooks/queries/teamMemberQueries";
import type { TeamMember } from "./useMembers";

export interface MemberGroup<T = TeamMember> {
  groupName: string;
  members: T[];
}

// groupMembers が最低限必要とする構造 (W9: 3画面の member 型統一はスコープ外。
// TeamMemberManagement (TeamMember[]) と MemberSelectModal (MemberSelectOption[]) が
// どちらもこの最小構造さえ満たせば groupMembers を再利用できるようにするだけの一般化)
interface GroupSortableMember {
  user_id: string;
  users?: { gender?: number };
}

const GENDER_CATEGORY = "__gender__";

// 取得前に毎回新しい配列を作って useMemo を無駄に再計算しないための空配列
const EMPTY_GROUPS: TeamGroup[] = [];
const EMPTY_MEMBERSHIPS: TeamGroupMembership[] = [];

/**
 * メンバー一覧のグループ別表示機能
 *
 * カテゴリを選択すると、そのカテゴリ内のグループごとにメンバーを分類して表示する
 * デフォルトで性別によるグルーピングが有効
 *
 * @param enabled - false の間は TeamGroupsAPI へのフェッチを行わない (修正H)。
 *   既定は true なので、引数を渡さない既存呼び出し元 (TeamMemberManagement 等) は
 *   従来どおりマウント時に即フェッチする。MemberSelectModal は isOpen を渡し、
 *   モーダルを一度も開かなければリクエストが発生しないようにする。
 *   一度フェッチに成功した teamId の組については、enabled が
 *   false→true と再度切り替わっても再フェッチしない (取得済みデータを保持する)
 *
 * 取得は React Query (`teamDetailKeys.groupSortData`)。
 *   - refetchOnMount: "always" … 以前と同じく、マウント (タブを開く) のたびに再取得する。
 *     再取得中は前回のグループ情報でグループ別表示を続ける。
 *   - staleTime: Infinity … マウント中に enabled を再トグルしただけでは再取得しない (修正H)。
 *     グループの変更は invalidateTeamGroupQueries で stale にするので、その後は再取得される。
 */
export const useMemberGroupSort = (
  teamId: string,
  supabase: SupabaseClient,
  enabled: boolean = true,
) => {
  const t = useTranslations("teams.memberGroupSort");
  const [activeCategory, setActiveCategory] = useState<string | null>(
    GENDER_CATEGORY,
  );

  // グループとメンバーシップを取得
  const groupSortQuery = useQuery({
    ...teamGroupSortDataQueryOptions(supabase, teamId),
    enabled,
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const groups: TeamGroup[] = groupSortQuery.data?.groups ?? EMPTY_GROUPS;
  const memberships: TeamGroupMembership[] =
    groupSortQuery.data?.memberships ?? EMPTY_MEMBERSHIPS;

  // カテゴリ一覧（性別は常に先頭に表示）
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const group of groups) {
      if (group.category) cats.add(group.category);
    }
    return [GENDER_CATEGORY, ...[...cats].sort()].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  }, [groups]);

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string, TeamGroup[]>();
    for (const group of groups) {
      if (!group.category) continue;
      if (!map.has(group.category)) map.set(group.category, []);
      map.get(group.category)!.push(group);
    }
    return map;
  }, [groups]);

  // user_id → groupId set
  const userGroupMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of memberships) {
      if (!map.has(m.user_id)) map.set(m.user_id, new Set());
      map.get(m.user_id)!.add(m.team_group_id);
    }
    return map;
  }, [memberships]);

  // カテゴリ切り替え
  const toggleCategory = useCallback((category: string) => {
    setActiveCategory((prev) => (prev === category ? null : category));
  }, []);

  // メンバーをグループ別に分類
  const groupMembers = useCallback(
    <T extends GroupSortableMember>(members: T[]): MemberGroup<T>[] | null => {
      if (!activeCategory) return null;

      // 性別カテゴリの場合はユーザープロファイルのgenderで分類
      if (activeCategory === GENDER_CATEGORY) {
        const result: MemberGroup<T>[] = [];
        const maleMembers = members.filter((m) => m.users?.gender === 0);
        const femaleMembers = members.filter((m) => m.users?.gender === 1);

        if (maleMembers.length > 0)
          result.push({ groupName: t("male"), members: maleMembers });
        if (femaleMembers.length > 0)
          result.push({ groupName: t("female"), members: femaleMembers });

        return result;
      }

      const categoryGroups = groupsByCategory.get(activeCategory) || [];
      const result: MemberGroup<T>[] = [];
      const assigned = new Set<string>();

      for (const group of categoryGroups) {
        const groupMemberList = members.filter((m) => {
          const memberGroups = userGroupMap.get(m.user_id);
          return memberGroups?.has(group.id);
        });
        result.push({ groupName: group.name, members: groupMemberList });
        groupMemberList.forEach((m) => assigned.add(m.user_id));
      }

      // 未所属メンバー
      const unassigned = members.filter((m) => !assigned.has(m.user_id));
      if (unassigned.length > 0) {
        result.push({ groupName: t("unassigned"), members: unassigned });
      }

      return result;
    },
    [activeCategory, groupsByCategory, userGroupMap, t],
  );

  const getCategoryLabel = useCallback(
    (category: string) => {
      return category === GENDER_CATEGORY ? t("genderCategory") : category;
    },
    [t],
  );

  return {
    categories,
    activeCategory,
    toggleCategory,
    groupMembers,
    getCategoryLabel,
  };
};
