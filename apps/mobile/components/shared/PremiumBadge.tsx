import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "@/navigation/types";

interface PremiumBadgeProps {
  /** 表示メッセージ */
  message: string;
  /** コンパクト表示（インライン用） */
  compact?: boolean;
}

/**
 * Premium 誘導バッジコンポーネント
 * Free ユーザーに Premium 機能の制限を案内し、設定画面へ誘導する
 */
export const PremiumBadge: React.FC<PremiumBadgeProps> = ({ message, compact = false }) => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const handlePress = () => {
    navigation.navigate("Settings");
  };

  if (compact) {
    return (
      <Pressable style={styles.compactContainer} onPress={handlePress}>
        <Text style={styles.compactIcon}>★</Text>
        <Text style={styles.compactMessage} numberOfLines={2}>
          {message}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>★</Text>
        <Text style={styles.title}>Premium</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.upgradeButton} onPress={handlePress}>
        <Text style={styles.upgradeButtonText}>アップグレードする</Text>
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
  icon: {
    fontSize: 16,
    color: "#D97706",
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
  compactIcon: {
    fontSize: 14,
    color: "#D97706",
  },
  compactMessage: {
    flex: 1,
    fontSize: 12,
    color: "#78350F",
    lineHeight: 16,
  },
});
