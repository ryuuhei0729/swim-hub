import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { parseISO, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

interface ProfileSectionProps {
  member: TeamMembershipWithUser;
  currentUserId: string;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ member, currentUserId }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const user = member.users;
  const isCurrentUser = member.user_id === currentUserId;
  // profile-images は private バケットのため、パスから署名付きURLを解決して表示する（Issue #36）
  const { url: resolvedAvatarUrl } = useSignedImageUrl("profile-images", user?.profile_image_path);

  const formatBirthday = (birthday: string | null | undefined): string | null => {
    if (!birthday) return null;
    const date = parseISO(birthday);
    return isValid(date) ? formatDate(date, "longPadded", locale) : null;
  };

  const birthday = formatBirthday(user?.birthday);

  return (
    <View style={styles.container}>
      <View style={styles.profileRow}>
        {/* アバター */}
        <View style={styles.avatarContainer}>
          {resolvedAvatarUrl ? (
            <Image
              source={{ uri: resolvedAvatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(user?.name || "?").charAt(0)}</Text>
            </View>
          )}
        </View>

        {/* 基本情報 */}
        <View style={styles.infoContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>
              {user?.name || "Unknown User"}
            </Text>
            {member.role === "admin" && <Feather name="star" size={16} color="#EAB308" />}
          </View>

          <View style={styles.badgeRow}>
            <View
              style={[
                styles.roleBadge,
                member.role === "admin" ? styles.roleBadgeAdmin : styles.roleBadgeUser,
              ]}
            >
              <Text
                style={[
                  styles.roleBadgeText,
                  member.role === "admin" ? styles.roleBadgeTextAdmin : styles.roleBadgeTextUser,
                ]}
              >
                {member.role === "admin"
                  ? t("teams.mobile.roleAdmin")
                  : t("teams.mobile.roleUser")}
              </Text>
            </View>
            {isCurrentUser && (
              <View style={styles.youBadge}>
                <Text style={styles.youBadgeText}>{t("teams.mobile.youBadge")}</Text>
              </View>
            )}
          </View>

          {birthday && (
            <Text style={styles.birthday}>{t("teams.mobile.birthdayLabel", { date: birthday })}</Text>
          )}
        </View>
      </View>

      {/* 自己紹介 */}
      <View style={styles.bioContainer}>
        <Text style={styles.bioLabel}>{t("teams.memberDetail.profileSection.bioTitle")}</Text>
        <View style={styles.bioContent}>
          <Text style={styles.bioText}>
            {user?.bio ||
              t("teams.memberDetail.profileSection.noBio", { name: user?.name || "Unknown User" })}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  infoContainer: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleBadgeAdmin: {
    backgroundColor: "#FEF9C3",
  },
  roleBadgeUser: {
    backgroundColor: "#F3F4F6",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  roleBadgeTextAdmin: {
    color: "#854D0E",
  },
  roleBadgeTextUser: {
    color: "#374151",
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#DBEAFE",
  },
  youBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E40AF",
  },
  birthday: {
    fontSize: 13,
    color: "#6B7280",
  },
  bioContainer: {
    gap: 6,
  },
  bioLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  bioContent: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
  },
  bioText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
});
