"use client";

/**
 * チームタブ「その他」: メンバー・予定・出欠に入らない機能を大きめのカードで並べる。
 * カードを押すとそれぞれの画面 (MainStack) へ進む。
 *
 * - ランキング … 全員
 * - メンバーの目標 … 管理者ビューのときだけ
 *
 * 機能を足すときは CARDS に 1 行足す (タブを増やさない方針。teamTabDefs.ts 参照)。
 */
import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { MainStackParamList } from "@/navigation/types";
import { cardSurface, colors } from "@/constants/theme";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface OthersCard {
  id: "rankings" | "goals";
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBackground: string;
  titleKey: string;
  descriptionKey: string;
  adminOnly: boolean;
  route: "TeamRankings" | "TeamMemberGoals";
}

const CARDS: OthersCard[] = [
  {
    id: "rankings",
    icon: "bar-chart-2",
    iconColor: "#DB2777",
    iconBackground: "#FCE7F3",
    titleKey: "teams.mobile.others.rankingsTitle",
    descriptionKey: "teams.mobile.others.rankingsDescription",
    adminOnly: false,
    route: "TeamRankings",
  },
  {
    id: "goals",
    icon: "target",
    iconColor: "#0284C7",
    iconBackground: "#E0F2FE",
    titleKey: "teams.mobile.others.goalsTitle",
    descriptionKey: "teams.mobile.others.goalsDescription",
    adminOnly: true,
    route: "TeamMemberGoals",
  },
];

interface TeamOthersTabProps {
  teamId: string;
  /** 管理者ビューの実効値 (TeamDetailView の effectiveIsAdminView) */
  isAdminView: boolean;
}

export const TeamOthersTab: React.FC<TeamOthersTabProps> = ({ teamId, isAdminView }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const visibleCards = CARDS.filter((card) => !card.adminOnly || isAdminView);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      // チームタブは OS のタブバーの上に出るので、末尾がタブバーに隠れないよう OS に下端の余白を足させる
      contentInsetAdjustmentBehavior="automatic"
    >
      {visibleCards.map((card) => (
        <Pressable
          key={card.id}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate(card.route, { teamId })}
          accessibilityRole="button"
          accessibilityLabel={t(card.titleKey)}
          accessibilityHint={t(card.descriptionKey)}
          testID={`team-others-card-${card.id}`}
        >
          <View style={[styles.iconBox, { backgroundColor: card.iconBackground }]}>
            <Feather name={card.icon} size={24} color={card.iconColor} />
          </View>
          <View style={styles.textBox}>
            <Text style={styles.title}>{t(card.titleKey)}</Text>
            <Text style={styles.description}>{t(card.descriptionKey)}</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#9CA3AF" />
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 12,
    gap: 10,
  },
  card: {
    ...cardSurface,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textBox: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
