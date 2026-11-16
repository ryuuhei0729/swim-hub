import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { usePracticeLogTemplateCountQuery } from "@apps/shared/hooks/queries/practiceLogTemplates";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { ProfileDisplay, ProfileEditModal } from "@/components/profile";
import { ListGroup, ListRow } from "@/components/account/AccountList";
import { TeamCreateModal } from "@/components/teams/TeamCreateModal";
import { TeamJoinModal } from "@/components/teams/TeamJoinModal";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { AccountSkeleton } from "@/components/ui/ScreenSkeletons";
import type { MainStackParamList } from "@/navigation/types";
import type { UserProfile } from "@swim-hub/shared/types";
import { colors, sectionSurface } from "@/constants/theme";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const TERMS_URL = "https://swim-hub.app/terms";
const PRIVACY_URL = "https://swim-hub.app/privacy";

/**
 * アカウントタブ (旧マイページ + 設定)
 * 上にプロフィールカード、下に iOS の設定アプリ風の一覧を置き、各行から詳細画面へ進む。
 * (ベストタイム表は 2026-11-07 にホームへ、設定画面は 2026-11-09 にこの画面と
 *  プラン / カレンダー / ログインとセキュリティ の3画面へ分けた)
 */
export const MyPageScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { supabase, user, subscription, signOut } = useAuth();
  const { t } = useTranslation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isJoinTeamModalOpen, setIsJoinTeamModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  // 「練習ログテンプレート」行の右に出す件数
  const { data: templateCount, refetch: refetchTemplateCount } =
    usePracticeLogTemplateCountQuery(supabase);

  const isLoading = profileLoading;
  const isError = profileError;
  const error = profileErrorObj;
  // この画面が依存する全クエリ (プロフィール・テンプレート件数) を尽くす
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refetchProfile(), refetchTemplateCount()]);
  }, [refetchProfile, refetchTemplateCount]);

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

  // 「プラン」行の右に出す値
  const planValue = useMemo(() => {
    if (subscription?.status === "trialing") return t("account.mobile.planValue.trialing");
    return checkIsPremium(subscription)
      ? t("account.mobile.planValue.premium")
      : t("account.mobile.planValue.free");
  }, [subscription, t]);

  // 「カレンダー」行の右に出す値 (連携しているカレンダーを並べる)
  const calendarValue = useMemo(() => {
    const connected: string[] = [];
    if (profile?.google_calendar_enabled) connected.push(t("account.mobile.calendarValue.google"));
    if (Platform.OS === "ios" && profile?.ios_calendar_enabled) {
      connected.push(t("account.mobile.calendarValue.ios"));
    }
    return connected.length > 0
      ? connected.join(" · ")
      : t("account.mobile.calendarValue.notConnected");
  }, [profile?.google_calendar_enabled, profile?.ios_calendar_enabled, t]);

  // チップ列の「＋」: 作成か参加かを選んでもらう
  const handleAddTeam = useCallback(() => {
    Alert.alert(t("account.mobile.addTeamAria"), undefined, [
      {
        text: t("mypage.profileDisplay.createTeam"),
        onPress: () => setIsCreateTeamModalOpen(true),
      },
      {
        text: t("mypage.profileDisplay.joinTeam"),
        onPress: () => setIsJoinTeamModalOpen(true),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [t]);

  // 作成・参加したチームをチームタブで開く
  const handleTeamAdded = useCallback(
    (teamId: string) => {
      setIsCreateTeamModalOpen(false);
      setIsJoinTeamModalOpen(false);
      void refetchProfile();
      navigation.navigate("MainTabs", { screen: "Teams", params: { teamId } });
    },
    [navigation, refetchProfile],
  );

  const executeLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const { error: signOutError } = await signOut();
      if (signOutError) {
        console.error("ログアウトエラー:", signOutError);
        Alert.alert(t("common.error"), t("settings.mobile.logoutFailed"));
      }
    } catch (err) {
      console.error("ログアウト処理エラー:", err);
      Alert.alert(t("common.error"), t("settings.mobile.logoutFailed"));
    } finally {
      setIsLoggingOut(false);
    }
  }, [signOut, t]);

  const handleLogout = useCallback(() => {
    Alert.alert(t("settings.mobile.logoutTitle"), t("settings.mobile.logoutConfirmMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.mobile.logoutButtonText"),
        style: "destructive",
        onPress: executeLogout,
      },
    ]);
  }, [executeLogout, t]);

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

  // ページヘッダー (スクロール固定)。読み込み中も出し、表示後に中身がずれないようにする
  const pageHeader = (
    <View style={styles.pageHeader}>
      <Text style={styles.pageHeaderTitle}>{t("account.mobile.pageTitle")}</Text>
    </View>
  );

  // ローディング状態
  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        {pageHeader}
        <AccountSkeleton />
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
      {pageHeader}
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
        {/* プロフィール */}
        <View style={styles.profileCard}>
          <ProfileDisplay
            profile={profile}
            teams={teams}
            onEdit={() => setIsEditModalOpen(true)}
            onAddTeam={handleAddTeam}
          />
        </View>

        <ListGroup>
          <ListRow
            icon="star"
            iconColor="#F59E0B"
            label={t("account.mobile.rows.plan")}
            value={planValue}
            onPress={() => navigation.navigate("AccountPlan")}
            testID="account-row-plan"
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            icon="calendar"
            iconColor="#3B82F6"
            label={t("account.mobile.rows.calendar")}
            value={calendarValue}
            onPress={() => navigation.navigate("AccountCalendar")}
            testID="account-row-calendar"
          />
          <ListRow
            icon="file-text"
            iconColor="#22C55E"
            label={t("account.mobile.rows.practiceLogTemplates")}
            value={templateCount !== undefined ? String(templateCount) : undefined}
            onPress={() => navigation.navigate("PracticeLogTemplates")}
            testID="account-row-templates"
          />
          <ListRow
            icon="lock"
            iconColor="#6B7280"
            label={t("account.mobile.rows.security")}
            onPress={() => navigation.navigate("AccountSecurity")}
            testID="account-row-security"
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            label={t("settings.mobile.termsLink")}
            accessory="external"
            onPress={() => Linking.openURL(TERMS_URL)}
            accessibilityHint={TERMS_URL}
          />
          <ListRow
            label={t("settings.mobile.privacyLink")}
            accessory="external"
            onPress={() => Linking.openURL(PRIVACY_URL)}
            accessibilityHint={PRIVACY_URL}
          />
        </ListGroup>

        <ListGroup>
          <ListRow
            label={
              isLoggingOut
                ? t("settings.mobile.logoutLoading")
                : t("settings.mobile.logoutButtonText")
            }
            tone="destructive"
            centered
            disabled={isLoggingOut}
            onPress={handleLogout}
            accessibilityLabel={t("settings.mobile.logoutAriaLabel")}
            accessibilityHint={t("settings.mobile.logoutAriaHint")}
            testID="account-logout"
          />
        </ListGroup>
      </ScrollView>

      {/* プロフィール編集モーダル */}
      <ProfileEditModal
        visible={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        profile={profile}
        onUpdate={handleProfileUpdate}
        onAvatarChange={handleAvatarChange}
      />

      {/* チーム作成・参加モーダル */}
      <TeamCreateModal
        visible={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSuccess={handleTeamAdded}
      />
      <TeamJoinModal
        visible={isJoinTeamModalOpen}
        onClose={() => setIsJoinTeamModalOpen(false)}
        onSuccess={handleTeamAdded}
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
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  profileCard: {
    ...sectionSurface,
    paddingVertical: 20,
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
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
});
