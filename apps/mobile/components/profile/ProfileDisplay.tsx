import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { parseISO, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import type { TeamMembershipWithUser, UserProfile } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";

interface ProfileDisplayProps {
  profile: UserProfile;
  teams?: TeamMembershipWithUser[];
  /** 「プロフィールを編集」ボタンを押したとき。渡さなければボタンを出さない */
  onEdit?: () => void;
  /** チップ列の末尾の「＋」を押したとき。渡さなければ「＋」を出さない */
  onAddTeam?: () => void;
}

type ProfileDisplayNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * プロフィールカード (アカウントタブの先頭)
 * 画像・名前を中央に置き、生年月日・性別を 1 行、その下に自己紹介と所属チームを並べる
 */
export const ProfileDisplay: React.FC<ProfileDisplayProps> = ({
  profile,
  teams = [],
  onEdit,
  onAddTeam,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigation = useNavigation<ProfileDisplayNavigationProp>();
  // profile-images は private バケットのため、パスから署名付きURLを解決して表示する（Issue #36）
  const { url: resolvedAvatarUrl } = useSignedImageUrl("profile-images", profile.profile_image_path);

  // 生年月日・性別は入っているものだけを「・」でつなぐ (どちらも無ければ行ごと出さない)
  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (profile.birthday) {
      const date = parseISO(profile.birthday);
      if (isValid(date)) parts.push(formatDate(date, "long", locale));
    }
    if (profile.gender === 0) parts.push(t("mypage.profileDisplay.genderMale"));
    if (profile.gender === 1) parts.push(t("mypage.profileDisplay.genderFemale"));
    return parts.join(" · ");
  }, [profile.birthday, profile.gender, locale, t]);

  // 承認済みかつアクティブなチームのみフィルタリング
  const approvedTeams = useMemo(() => {
    return teams.filter(
      (membership) => membership.status === "approved" && membership.is_active === true,
    );
  }, [teams]);

  // プロフィール画像の表示（デフォルトは名前の頭文字）
  const renderAvatar = () => {
    if (resolvedAvatarUrl) {
      return (
        <Image
          source={{ uri: resolvedAvatarUrl }}
          style={styles.avatarImage}
          contentFit="cover"
        />
      );
    }
    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>{profile.name.charAt(0) || "?"}</Text>
      </View>
    );
  };

  const handleTeamPress = (teamId: string) => {
    navigation.navigate("MainTabs", { screen: "Teams", params: { teamId } });
  };

  return (
    <View style={styles.container}>
      <View
        style={[styles.avatarContainer, !!resolvedAvatarUrl && styles.avatarContainerWithImage]}
      >
        {renderAvatar()}
      </View>
      <Text style={styles.name}>{profile.name}</Text>
      {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}

      {profile.bio ? (
        <View style={styles.bioContent}>
          <Text style={styles.bioText}>{profile.bio}</Text>
        </View>
      ) : null}

      {/* 所属チーム */}
      {approvedTeams.length > 0 || onAddTeam ? (
        <View style={styles.teamsContainer}>
          {approvedTeams.map((membership) => {
            const teamName =
              "teams" in membership && membership.teams?.name
                ? membership.teams.name
                : t("mypage.profileDisplay.unknownTeam");
            const teamId = membership.team_id;

            return (
              <Pressable
                key={membership.id}
                style={styles.teamBadge}
                onPress={() => handleTeamPress(teamId)}
                accessibilityRole="button"
                accessibilityLabel={teamName}
              >
                <Text style={styles.teamBadgeText} numberOfLines={1}>
                  {teamName}
                </Text>
              </Pressable>
            );
          })}
          {onAddTeam ? (
            <Pressable
              style={styles.addTeamBadge}
              onPress={onAddTeam}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t("account.mobile.addTeamAria")}
              testID="profile-add-team"
            >
              <Text style={styles.addTeamBadgeText}>＋</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {onEdit ? (
        <Pressable
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
          onPress={onEdit}
          accessibilityRole="button"
          testID="profile-edit-button"
        >
          <Text style={styles.editButtonText}>{t("account.mobile.editProfile")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: 16,
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
  // 画像がある場合は透過PNGの背景として薄いグレーを敷く（青が透けるのを防ぐ / web の bg-gray-100 と一致）
  avatarContainerWithImage: {
    backgroundColor: "#F3F4F6",
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
  name: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  bioContent: {
    alignSelf: "stretch",
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
  },
  bioText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  teamsContainer: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  teamBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#DBEAFE",
    maxWidth: 220,
  },
  teamBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#1E40AF",
  },
  addTeamBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  addTeamBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  editButton: {
    alignSelf: "stretch",
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  editButtonPressed: {
    backgroundColor: "#F3F4F6",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
});
