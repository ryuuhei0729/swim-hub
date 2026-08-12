import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "@/navigation/types";
import { FREE_PLAN_LIMITS, type PremiumFeature } from "@swim-hub/shared/constants/premium";

interface PremiumBadgeProps {
  /** 制限対象の Premium 機能。表示文言は i18n (forms.premium.*) から解決する */
  feature: PremiumFeature;
  /** コンパクト表示（インライン用） */
  compact?: boolean;
}

/**
 * Premium 誘導バッジコンポーネント
 * Free ユーザーに Premium 機能の制限を案内し、アプリ内ペイウォール画面へ遷移する
 */
export const PremiumBadge: React.FC<PremiumBadgeProps> = ({ feature, compact = false }) => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { t } = useTranslation();

  // exhaustive: 新 PremiumFeature 追加時にここでコンパイルエラーを出す
  const messages: Record<PremiumFeature, string> = {
    image_upload: t("forms.premium.imageUpload"),
    video_upload: t("forms.premium.videoUpload"),
    split_time_limit: t("forms.premium.splitTimeLimit", {
      limit: FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD,
    }),
    practice_time_limit: t("forms.premium.practiceTimeLimit", {
      limit: FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG,
    }),
  };
  const message = messages[feature];

  const handlePress = () => {
    navigation.navigate("Paywall");
  };

  if (compact) {
    return (
      <Pressable style={styles.compactContainer} onPress={handlePress}>
        <Ionicons name="star" size={14} color="#D97706" />
        <Text style={styles.compactMessage} numberOfLines={2}>
          {message}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="star" size={16} color="#D97706" />
        <Text style={styles.title}>Premium</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.upgradeButton} onPress={handlePress}>
        <Text style={styles.upgradeButtonText}>{t("common.premiumBadge.upgradeAction")}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
  },
  message: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  upgradeButton: {
    alignSelf: "flex-start",
    backgroundColor: "#F59E0B",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  upgradeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  compactContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  compactMessage: {
    flex: 1,
    fontSize: 12,
    color: "#78350F",
    lineHeight: 16,
  },
});
