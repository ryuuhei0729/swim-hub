import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import type { TeamGroup, TeamGroupMembership } from "@swim-hub/shared/types";
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
 *   一度フェッチに成功した teamId/supabase の組については、enabled が
 *   false→true と再度切り替わっても再フェッチしない (取得済みデータを保持する)
 */
export const useMemberGroupSort = (
  teamId: string,
  supabase: SupabaseClient,
  enabled: boolean = true,
) => {
  const t = useTranslations("teams.memberGroupSort");
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [memberships, setMemberships] = useState<TeamGroupMembership[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(
    GENDER_CATEGORY,
  );

  // フェッチ済みの teamId/supabase の組。enabled の再トグルだけでは変わらないため、
  // モーダルを閉じて再度開いても再フェッチしない (修正H)
  const loadedKeyRef = useRef<{
    teamId: string;
    supabase: SupabaseClient;
  } | null>(null);

  // グループとメンバーシップを取得
  useEffect(() => {
    if (!enabled) return;
    if (
      loadedKeyRef.current?.teamId === teamId &&
      loadedKeyRef.current?.supabase === supabase
    ) {
      return;
    }
    loadedKeyRef.current = { teamId, supabase };

    const load = async () => {
      try {
        const api = new TeamGroupsAPI(supabase);
        const [groupsData, membershipsData] = await Promise.all([
          api.list(teamId),
          api.listAllMemberships(teamId),
        ]);
        setGroups(groupsData);
        setMemberships(membershipsData);
      } catch (err) {
        console.error("グループ情報の取得に失敗:", err);
      }
    };
    load();
  }, [teamId, supabase, enabled]);

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
