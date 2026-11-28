import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { ALWAYS_REVALIDATE } from "@/hooks/cachedQuery";
import { teamDetailKeys } from "@/hooks/teamDetailQueries";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";
import { sortMembersByAgeForGroup } from "@apps/shared/utils/memberSort";
import type {
  TeamGroup,
  TeamGroupMembership,
  TeamMembershipWithUser,
} from "@swim-hub/shared/types";

interface MemberGroupSorterProps {
  teamId: string;
  supabase: SupabaseClient;
  members: TeamMembershipWithUser[];
  onGroupedMembersChange: (
    sorted: TeamMembershipWithUser[],
    groupHeaders: Map<number, string>,
  ) => void;
  /**
   * グループ表示のとき、各グループ内を年齢の降順 (同じ年齢は名前順、生年月日未設定は最後に名前順)
   * に並べる。メンバー一覧 (TeamMemberList) だけが指定する。メンバー選択モーダルは渡された順
   * (生年月日順) を保つので指定しない (web も同じ)。
   */
  sortWithinGroupsByAge?: boolean;
}

interface GroupFilterData {
  groups: TeamGroup[];
  memberships: TeamGroupMembership[];
}

const NO_GROUPS: TeamGroup[] = [];
const NO_MEMBERSHIPS: TeamGroupMembership[] = [];

// 性別カテゴリの内部識別子。表示は t("teams.mobile.genderCategoryLabel") 経由。
// 末尾アンダースコアでユーザー定義カテゴリ名との衝突を避ける。
const GENDER_CATEGORY = "__gender__";

/**
 * グループ表示コンポーネント（WEB版 MemberGroupSorter 準拠）
 * カテゴリボタンをタップするとメンバーをグループ別に並び替え、
 * グループヘッダーのインデックスを親に通知する
 * デフォルトで性別によるグルーピングが有効
 */
export const TeamMemberGroupFilter: React.FC<MemberGroupSorterProps> = ({
  teamId,
  supabase,
  members,
  onGroupedMembersChange,
  sortWithinGroupsByAge = false,
}) => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string | null>(GENDER_CATEGORY);

  // グループとメンバーシップを取得
  // メンバータブ・メンバー選択モーダルなど複数の場所で同じデータを使うので、キャッシュを
  // 共有する。開き直したときは前回の並びをすぐ出し、裏で取り直す。
  const { data: groupFilterData } = useQuery({
    queryKey: teamDetailKeys.groupFilter(teamId),
    queryFn: async (): Promise<GroupFilterData> => {
      try {
        const api = new TeamGroupsAPI(supabase);
        const [groups, memberships] = await Promise.all([
          api.list(teamId),
          api.listAllMemberships(teamId),
        ]);
        return { groups, memberships };
      } catch (err) {
        console.error("グループ情報の取得に失敗:", err);
        throw err;
      }
    },
    staleTime: ALWAYS_REVALIDATE,
  });
  const groups = groupFilterData?.groups ?? NO_GROUPS;
  const memberships = groupFilterData?.memberships ?? NO_MEMBERSHIPS;

  // カテゴリ別グループ
  const groupsByCategory = useMemo(() => {
    const map = new Map<string, TeamGroup[]>();
    for (const group of groups) {
      if (!group.category) continue;
      if (!map.has(group.category)) {
        map.set(group.category, []);
      }
      map.get(group.category)!.push(group);
    }
    return map;
  }, [groups]);

  const categories = useMemo(
    () => [GENDER_CATEGORY, ...groupsByCategory.keys()].filter((v, i, a) => a.indexOf(v) === i),
    [groupsByCategory],
  );

  // user_id → groupId Set のマップ
  const userGroupMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of memberships) {
      if (!map.has(m.user_id)) {
        map.set(m.user_id, new Set());
      }
      map.get(m.user_id)!.add(m.team_group_id);
    }
    return map;
  }, [memberships]);

  // カテゴリトグル
  const toggleCategory = useCallback((category: string) => {
    setActiveCategory((prev) => (prev === category ? null : category));
  }, []);

  // グルーピング結果を親に通知
  useEffect(() => {
    if (!activeCategory) {
      // グルーピングなし → メンバーそのまま、ヘッダーなし
      onGroupedMembersChange(members, new Map());
      return;
    }

    // グループ内の並び (sortWithinGroupsByAge のときだけ年齢順に並べ替える)
    const orderInGroup = (list: TeamMembershipWithUser[]) =>
      sortWithinGroupsByAge ? sortMembersByAgeForGroup(list) : list;

    // 性別カテゴリの場合はユーザープロファイルのgenderで分類
    if (activeCategory === GENDER_CATEGORY) {
      const flat: TeamMembershipWithUser[] = [];
      const headers = new Map<number, string>();

      const maleMembers = orderInGroup(members.filter((m) => m.users.gender === 0));
      const femaleMembers = orderInGroup(members.filter((m) => m.users.gender === 1));

      if (maleMembers.length > 0) {
        headers.set(flat.length, t("teams.mobile.genderMale"));
        flat.push(...maleMembers);
      }
      if (femaleMembers.length > 0) {
        headers.set(flat.length, t("teams.mobile.genderFemale"));
        flat.push(...femaleMembers);
      }

      onGroupedMembersChange(flat, headers);
      return;
    }

    const categoryGroups = groupsByCategory.get(activeCategory) || [];
    const flat: TeamMembershipWithUser[] = [];
    const headers = new Map<number, string>();
    const assigned = new Set<string>();

    for (const group of categoryGroups) {
      const groupMembers = orderInGroup(
        members.filter((m) => {
          const memberGroups = userGroupMap.get(m.user_id);
          return memberGroups?.has(group.id);
        }),
      );
      headers.set(flat.length, group.name);
      flat.push(...groupMembers);
      groupMembers.forEach((m) => assigned.add(m.user_id));
    }

    // 未所属メンバー
    const unassigned = orderInGroup(members.filter((m) => !assigned.has(m.user_id)));
    if (unassigned.length > 0) {
      headers.set(flat.length, t("teams.mobile.unassigned"));
      flat.push(...unassigned);
    }

    onGroupedMembersChange(flat, headers);
  }, [
    members,
    activeCategory,
    groupsByCategory,
    userGroupMap,
    onGroupedMembersChange,
    sortWithinGroupsByAge,
    t,
  ]);

  if (categories.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* 「グループ表示:」ラベルは撤去済み。行の右端は親 (TeamMemberList) が
          「引き継ぎを含む」トグルを置くため、ここではピルだけを描画する */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsContainer}
      >
        {categories.map((category) => {
          const isActive = activeCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => toggleCategory(category)}
              style={[styles.pill, isActive && styles.pillActive]}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                {category === GENDER_CATEGORY ? t("teams.mobile.genderCategoryLabel") : category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  pillsContainer: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  pillActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  pillText: {
    fontSize: 12,
    color: "#4B5563",
  },
  pillTextActive: {
    color: "#1D4ED8",
    fontWeight: "600",
  },
});
