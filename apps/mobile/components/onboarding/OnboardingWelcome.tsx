import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

interface OnboardingWelcomeProps {
  onNext: () => void;
}

/**
 * オンボーディング Step 1: SwimHub 紹介 + 「始める」
 * ※ WelcomeScreen と名前衝突を避けるため OnboardingWelcome プレフィックス
 */
export const OnboardingWelcome: React.FC<OnboardingWelcomeProps> = ({ onNext }) => {
  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <Image
          source={require("@/assets/icons/app-icon.png")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.appName}>SwimHub へようこそ</Text>
        <Text style={styles.tagline}>水泳選手のための統合管理プラットフォーム</Text>
      </View>

      <View style={styles.featuresSection}>
        <FeatureRow iconName="bar-chart-2" title="練習記録" description="日々の練習をかんたんに記録・管理" />
        <FeatureRow iconName="award" title="大会記録" description="自己ベストの推移をグラフで確認" />
        <FeatureRow iconName="users" title="チーム機能" description="チームメンバーと情報を共有" />
      </View>

      <View style={styles.footer}>
        <Text style={styles.stepHint}>簡単な設定をして始めましょう（約 1 分）</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="始める"
        >
          <Text style={styles.primaryButtonText}>始める</Text>
        </Pressable>
      </View>
    </View>
  );
};

interface FeatureRowProps {
  iconName: React.ComponentProps<typeof Feather>["name"];
  title: string;
  description: string;
}

const FeatureRow: React.FC<FeatureRowProps> = ({ iconName, title, description }) => (
  <View style={featureStyles.row}>
    <View style={featureStyles.iconWrapper}>
      <Feather name={iconName} size={20} color="#2563EB" />
    </View>
    <View style={featureStyles.text}>
      <Text style={featureStyles.title}>{title}</Text>
      <Text style={featureStyles.description}>{description}</Text>
    </View>
  </View>
);

const featureStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 12,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 32,
  },
  heroSection: {
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
  },
  tagline: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  featuresSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 0,
  },
  footer: {
    gap: 12,
    marginTop: "auto",
  },
  stepHint: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonPressed: {
    backgroundColor: "#1D4ED8",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
});
