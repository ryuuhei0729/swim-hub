import React, { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "@/contexts/AuthProvider";
import { restorePurchases } from "@/lib/revenucat";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { GoogleCalendarSyncSettings } from "@/components/settings/GoogleCalendarSyncSettings";
import { IOSCalendarSyncSettings } from "@/components/settings/IOSCalendarSyncSettings";
import { EmailChangeSettings } from "@/components/settings/EmailChangeSettings";
import { IdentityLinkSettings } from "@/components/settings/IdentityLinkSettings";
import { AccountDeleteSettings } from "@/components/settings/AccountDeleteSettings";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { MainStackParamList } from "@/navigation/types";

/**
 * 設定画面
 * メールアドレス・ログイン連携・カレンダー連携の設定を管理
 */
export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { supabase, signOut, subscription, refreshSubscription } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const {
    profile,
    isLoading,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false,
  });

  const executeLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        console.error("ログアウトエラー:", error);
        Alert.alert("エラー", "ログアウトに失敗しました。もう一度お試しください。");
      }
    } catch (err) {
      console.error("ログアウト処理エラー:", err);
      Alert.alert("エラー", "ログアウトに失敗しました。もう一度お試しください。");
    } finally {
      setIsLoggingOut(false);
    }
  }, [signOut]);

  const handleLogout = useCallback(() => {
    Alert.alert("ログアウト", "ログアウトしてもよろしいですか？", [
      { text: "キャンセル", style: "cancel" },
      { text: "ログアウト", style: "destructive", onPress: executeLogout },
    ]);
  }, [executeLogout]);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
      await refreshSubscription();
      Alert.alert("復元完了", "購入情報を復元しました。");
    } catch {
      Alert.alert("エラー", "購入情報の復元に失敗しました。");
    } finally {
      setIsRestoring(false);
    }
  }, [refreshSubscription]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchProfile();
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile]);

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <LoadingSpinner fullScreen message="設定を読み込み中..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
      >
        {/* サブスクリプション管理セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>サブスクリプション</Text>
          <View style={styles.sectionContent}>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>現在のプラン</Text>
              <View
                style={[
                  styles.planBadge,
                  isPremium ? styles.planBadgePremium : styles.planBadgeFree,
                ]}
              >
                <Text
                  style={[
                    styles.planBadgeText,
                    isPremium ? styles.planBadgeTextPremium : styles.planBadgeTextFree,
                  ]}
                >
                  {isPremium ? "Premium" : "Free"}
                </Text>
              </View>
            </View>
            {subscription?.status === "trialing" && subscription.trialEnd && (
              <Text style={styles.subscriptionNote}>
                トライアル期間: {new Date(subscription.trialEnd).toLocaleDateString("ja-JP")} まで
              </Text>
            )}
            {subscription?.cancelAtPeriodEnd && subscription.premiumExpiresAt && (
              <Text style={styles.subscriptionNote}>
                {new Date(subscription.premiumExpiresAt).toLocaleDateString("ja-JP")}{" "}
                に解約予定
              </Text>
            )}
            {!isPremium && (
              <Pressable
                style={styles.upgradeButton}
                onPress={() => navigation.navigate("Paywall")}
                accessibilityRole="button"
                accessibilityLabel="Premium にアップグレード"
              >
                <Text style={styles.upgradeButtonText}>Premium にアップグレード</Text>
              </Pressable>
            )}

            {/* 購入を復元 */}
            <Pressable
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={isRestoring}
              accessibilityRole="button"
              accessibilityLabel="購入を復元する"
            >
              {isRestoring ? (
                <ActivityIndicator color="#2563EB" size="small" />
              ) : (
                <Text style={styles.restoreButtonText}>購入を復元する</Text>
              )}
            </Pressable>

            {/* サブスクリプション管理 */}
            <Pressable
              style={styles.manageSubButton}
              onPress={() => Linking.openURL("https://apps.apple.com/account/subscriptions")}
              accessibilityRole="link"
              accessibilityLabel="サブスクリプションを管理"
            >
              <Text style={styles.manageSubText}>サブスクリプションを管理</Text>
            </Pressable>
          </View>
        </View>

        {/* Googleカレンダー連携セクション */}
        <GoogleCalendarSyncSettings profile={profile} onUpdate={refetchProfile} />

        {/* iOSカレンダー連携セクション */}
        <IOSCalendarSyncSettings profile={profile} onUpdate={refetchProfile} />

        {/* メールアドレス変更セクション */}
        <EmailChangeSettings />

        {/* ログイン連携セクション */}
        <IdentityLinkSettings />

        {/* アカウント削除セクション */}
        <AccountDeleteSettings />

        {/* 利用規約・プライバシーポリシー */}
        <View style={styles.legalLinks}>
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL("https://swim-hub.app/terms")}
          >
            利用規約
          </Text>
          <Text style={styles.legalDivider}> | </Text>
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL("https://swim-hub.app/privacy")}
          >
            プライバシーポリシー
          </Text>
        </View>

        {/* ログアウトセクション */}
        <View style={styles.logoutSection}>
          <Pressable
            style={[styles.logoutButton, isLoggingOut && styles.logoutButtonDisabled]}
            onPress={handleLogout}
            disabled={isLoggingOut}
            accessibilityRole="button"
            accessibilityLabel="ログアウト"
            accessibilityHint="アカウントからログアウトします"
          >
            <Text style={styles.logoutButtonText}>
              {isLoggingOut ? "ログアウト中..." : "ログアウト"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planLabel: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgePremium: {
    backgroundColor: "#FEF3C7",
  },
  planBadgeFree: {
    backgroundColor: "#F3F4F6",
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  planBadgeTextPremium: {
    color: "#92400E",
  },
  planBadgeTextFree: {
    color: "#6B7280",
  },
  subscriptionNote: {
    fontSize: 13,
    color: "#6B7280",
  },
  upgradeButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: 8,
    marginTop: 4,
  },
  restoreButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "500",
  },
  manageSubButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  manageSubText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
  },
  legalLink: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "500",
  },
  legalDivider: {
    fontSize: 13,
    color: "#D1D5DB",
  },
  logoutSection: {
    marginTop: 8,
  },
  logoutButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  logoutButtonDisabled: {
    backgroundColor: "#F87171",
    opacity: 0.6,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
