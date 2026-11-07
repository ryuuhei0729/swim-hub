import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { ProfileDisplay, ProfileEditModal } from "@/components/profile";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { ProfileSkeleton } from "@/components/ui/ScreenSkeletons";
import type { MainStackParamList } from "@/navigation/types";
import type { UserProfile } from "@swim-hub/shared/types";
import { colors, sectionSurface } from "@/constants/theme";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

/**
 * マイページ画面
 * プロフィール表示・編集 (ベストタイム表は 2026-11-07 にホームへ移した)
 */
export const MyPageScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // プロフィールとチーム情報取得
  const {
    profile,
    teams,
    isLoading: profileLoading,
    isError: profileError,
    error: profileErrorObj,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false, // モバイルでは一旦無効化
  });

  const isLoading = profileLoading;
  const isError = profileError;
  const error = profileErrorObj;
  // この画面が依存する全クエリ (プロフィール) を尽くす
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refetchProfile()]);
  }, [refetchProfile]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refreshAll);

  // プルリフレッシュ処理
  const { refreshing, handleRefresh } = usePullToRefresh(refreshAll);

  // プロフィール更新処理
  const handleProfileUpdate = useCallback(
    async (updatedProfile: Partial<UserProfile>) => {
      if (!user) return;

      try {
        const dbUpdate: Partial<UserProfile> = {};
        if (updatedProfile.name !== undefined) dbUpdate.name = updatedProfile.name;
        if (updatedProfile.birthday !== undefined) dbUpdate.birthday = updatedProfile.birthday;
        if (updatedProfile.bio !== undefined) dbUpdate.bio = updatedProfile.bio;
        if (updatedProfile.gender !== undefined) dbUpdate.gender = updatedProfile.gender;
        if (updatedProfile.profile_image_path !== undefined)
          dbUpdate.profile_image_path = updatedProfile.profile_image_path;

        const { error: updateError } = await supabase
          .from("users")
          .update(dbUpdate)
          .eq("id", user.id);

        if (updateError) throw updateError;
        await refetchProfile();
      } catch (err) {
        console.error("プロフィール更新エラー:", err);
        throw err;
      }
    },
    [user, supabase, refetchProfile],
  );

  // アバター変更処理
  const handleAvatarChange = useCallback(
    async (newAvatarUrl: string | null) => {
      if (!user) return;

      try {
        const { error: updateError } = await supabase
          .from("users")
          .update({ profile_image_path: newAvatarUrl })
          .eq("id", user.id);

        if (updateError) throw updateError;
        await refetchProfile();
      } catch (err) {
        console.error("アバター更新エラー:", err);
        throw err;
      }
    },
    [user, supabase, refetchProfile],
  );

  // エラー状態 (前回取得したプロフィールが無いときだけ全画面エラーにする)
  if (isError && error && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView
          message={error.message || t("mypage.mobile.dataFetchFailed")}
          error={error}
          onRetry={() => {
            refetchProfile();
          }}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  // ローディング状態
  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  // プロフィールがない場合
  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("mypage.mobile.profileNotFound")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* ページヘッダー (スクロール固定) */}
      <View style={styles.pageHeader}>
        <Text style={styles.pageHeaderTitle}>{t("mypage.mobile.pageTitle")}</Text>
        <Pressable
          style={styles.pageHeaderSettings}
          onPress={() => navigation.navigate("Settings")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("mypage.mobile.settingsButtonAria")}
        >
          <Feather name="settings" size={18} color="#6B7280" />
          <Text style={styles.pageHeaderSettingsText}>{t("mypage.mobile.settingsButton")}</Text>
        </Pressable>
      </View>
      <StaleDataBanner
        visible={isError}
        onRetry={() => {
          refetchProfile();
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        // iOS 26 の浮いたタブバーの下に末尾が隠れないよう、OS に下端の余白を足させる
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
      >
        {/* プロフィールセクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("mypage.mobile.profileSectionTitle")}</Text>
            <Pressable style={styles.editButton} onPress={() => setIsEditModalOpen(true)}>
              <Text style={styles.editButtonText}>{t("mypage.mobile.editButton")}</Text>
            </Pressable>
          </View>
          <ProfileDisplay profile={profile} teams={teams} />
        </View>
      </ScrollView>

      {/* プロフィール編集モーダル */}
      <ProfileEditModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={profile}
        onUpdate={handleProfileUpdate}
        onAvatarChange={handleAvatarChange}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 16,
  },
  section: {
    ...sectionSurface,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pageHeaderTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  pageHeaderSettings: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageHeaderSettingsText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  passwordButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  passwordButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
});
