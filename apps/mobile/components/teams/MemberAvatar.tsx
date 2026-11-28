import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";

/**
 * private バケット内相対パスから署名付きURLを解決する、チームの一覧行用の丸いアバター。
 * 大会の記録一覧 (TeamCompetitionRecordsModal) と練習のタイム一覧 (TeamPracticeTimesModal) で共用する。
 * path が null (未設定・退会・RLS 0件) でもクラッシュせずイニシャルへフォールバックする。
 */
export function MemberAvatar({
  path,
  name,
  size,
}: {
  path: string | null;
  name: string;
  size: number;
}) {
  const { url } = useSignedImageUrl("profile-images", path);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.avatarImage, dimensionStyle]}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.avatarPlaceholder, dimensionStyle]}>
      <Text style={[styles.avatarPlaceholderText, { fontSize: size * 0.45 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    backgroundColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholderText: {
    color: "#6B7280",
    fontWeight: "700",
  },
});
