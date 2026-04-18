import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

interface OnboardingGuideProps {
  onComplete: () => Promise<void>;
  onBack: () => void;
  completing: boolean;
  completeError: string | null;
}

/**
 * オンボーディング Step 4: 使い方ガイド + 「SwimHub を始める」(完了)
 */
export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  onComplete,
  onBack,
  completing,
  completeError,
}) => {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>SwimHub の使い方</Text>
        <Text style={styles.subtitle}>準備完了です！主な機能をご紹介します。</Text>
      </View>

      <View style={styles.guideList}>
        <GuideCard
          step="1"
          title="練習を記録する"
          description="ダッシュボードの「練習記録」から日々のトレーニングを記録。セット・距離・タイムを詳細に管理できます。"
          iconName="clipboard"
        />
        <GuideCard
          step="2"
          title="大会記録を管理する"
          description="大会ごとにエントリーと結果を記録。自己ベストの推移をグラフで確認できます。"
          iconName="award"
        />
        <GuideCard
          step="3"
          title="チームに参加する"
          description="コーチや仲間とチームを作成・参加。お知らせや記録を共有してチーム全体で成長しましょう。"
          iconName="users"
        />
        <GuideCard
          step="4"
          title="マイページで確認する"
          description="自分のプロフィール・サブスクリプション・設定はマイページからいつでも変更できます。"
          iconName="user"
        />
      </View>

      {completeError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{completeError}</Text>
        </View>
      )}

      <View style={styles.buttonSection}>
        <Pressable
          style={({ pressed }) => [
            styles.completeButton,
            completing && styles.completeButtonDisabled,
            pressed && !completing && styles.completeButtonPressed,
          ]}
          onPress={onComplete}
          disabled={completing}
          accessibilityRole="button"
          accessibilityLabel="SwimHub を始める"
        >
          {completing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.completeButtonText}>SwimHub を始める</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={onBack}
          disabled={completing}
          accessibilityRole="button"
          accessibilityLabel="戻る"
        >
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

interface GuideCardProps {
  step: string;
  title: string;
  description: string;
  iconName: React.ComponentProps<typeof Feather>["name"];
}

const GuideCard: React.FC<GuideCardProps> = ({ step: _step, title, description, iconName }) => (
  <View style={cardStyles.card}>
    <View style={cardStyles.iconWrapper}>
      <Feather name={iconName} size={20} color="#2563EB" />
    </View>
    <View style={cardStyles.content}>
      <Text style={cardStyles.title}>{title}</Text>
      <Text style={cardStyles.description}>{description}</Text>
    </View>
  </View>
);

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  description: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    gap: 20,
    paddingBottom: 16,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  guideList: {
    gap: 12,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
  buttonSection: {
    gap: 10,
    marginTop: 8,
  },
  completeButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  completeButtonPressed: {
    backgroundColor: "#1D4ED8",
  },
  completeButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  completeButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  backButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    color: "#6B7280",
  },
});
