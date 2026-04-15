import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

interface OnboardingBestTimeProps {
  onSkip: () => void;
  onBack: () => void;
}

/**
 * オンボーディング Step 3: ベストタイム入力案内
 * OnboardingStack 内では MainStack の RecordForm に遷移できないため、
 * 案内のみ表示し、実際の入力はオンボーディング完了後に誘導する。
 */
export const OnboardingBestTime: React.FC<OnboardingBestTimeProps> = ({ onSkip, onBack }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ベストタイムを登録しよう</Text>
        <Text style={styles.subtitle}>
          ベストタイムを登録しておくと、成長の記録が見えやすくなります。
          {"\n"}オンボーディング完了後に登録できます。
        </Text>
      </View>

      <View style={styles.illustrationSection}>
        <Text style={styles.illustrationIcon}>🏊</Text>
        <View style={styles.exampleBox}>
          <Text style={styles.exampleLabel}>例: 100m 自由形</Text>
          <Text style={styles.exampleTime}>1:02.34</Text>
        </View>
      </View>

      <View style={styles.benefitList}>
        <BenefitRow text="自己ベストの推移をグラフで確認できます" />
        <BenefitRow text="チームメンバーと記録を共有できます" />
        <BenefitRow text="大会のエントリータイムとして活用できます" />
      </View>

      <View style={styles.buttonSection}>
        <View style={styles.bottomRow}>
          <Pressable
            style={styles.backButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <Text style={styles.backButtonText}>戻る</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="次へ進む"
          >
            <Text style={styles.primaryButtonText}>次へ</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

interface BenefitRowProps {
  text: string;
}

const BenefitRow: React.FC<BenefitRowProps> = ({ text }) => (
  <View style={benefitStyles.row}>
    <Text style={benefitStyles.check}>✓</Text>
    <Text style={benefitStyles.text}>{text}</Text>
  </View>
);

const benefitStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  check: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "700",
    lineHeight: 22,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 22,
  },
  illustrationSection: {
    alignItems: "center",
    gap: 12,
  },
  illustrationIcon: {
    fontSize: 48,
  },
  exampleBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  exampleLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  exampleTime: {
    fontSize: 28,
    fontWeight: "700",
    color: "#2563EB",
    fontVariant: ["tabular-nums"],
  },
  benefitList: {
    gap: 12,
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    padding: 16,
  },
  buttonSection: {
    gap: 12,
    marginTop: "auto",
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
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
});
