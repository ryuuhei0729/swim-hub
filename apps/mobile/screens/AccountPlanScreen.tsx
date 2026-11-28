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
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { restorePurchases } from "@/lib/revenucat";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { useToast } from "@/providers/ToastProvider";
import { ListGroup, ListRow } from "@/components/account/AccountList";
import { colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

const STORE_SUBSCRIPTIONS_URL =
  Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";

/**
 * アカウント > プラン
 * 現在のプラン・トライアル / 解約予定の表示、アップグレード、購入の復元、ストアでの管理
 */
export const AccountPlanScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { subscription, refreshSubscription } = useAuth();
  const isPremium = checkIsPremium(subscription);
  // 支払い失敗 (past_due)。checkIsPremium は false になるが Free ではないため、
  // Free 表示・アップグレード導線は出さず、支払い方法の更新を案内する (web の SubscriptionSettings と同じ)
  const isPastDue = subscription?.status === "past_due";
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const insets = useSafeInsets();
  const toast = useToast();
  const [isRestoring, setIsRestoring] = useState(false);

  const refreshAll = useCallback(async () => {
    await refreshSubscription();
  }, [refreshSubscription]);
  const { refreshing, handleRefresh } = usePullToRefresh(refreshAll);

  const handleRestore = useCallback(async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
      await refreshSubscription();
      toast.success(t("settings.mobile.restoreSuccessMessage"));
    } catch {
      Alert.alert(t("common.error"), t("settings.mobile.restoreFailed"));
    } finally {
      setIsRestoring(false);
    }
  }, [refreshSubscription, t, toast]);

  // トライアル終了日 / 解約予定日の補足
  const planNote = useMemo(() => {
    if (subscription?.status === "trialing" && subscription.trialEnd) {
      return t("settings.mobile.trialPeriodUntil", {
        date: formatDate(subscription.trialEnd, "long", dateLocale),
      });
    }
    if (subscription?.cancelAtPeriodEnd && subscription.premiumExpiresAt) {
      return t("settings.mobile.cancelScheduledOn", {
        date: formatDate(subscription.premiumExpiresAt, "long", dateLocale),
      });
    }
    return undefined;
  }, [subscription, t, dateLocale]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getSafeFooterPadding(32, insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isPastDue && (
          <View style={styles.pastDueBanner} testID="plan-past-due-banner">
            <Text style={styles.pastDueTitle}>{t("settings.subscription.pastDueBanner.title")}</Text>
            <Text style={styles.pastDueDescription}>
              {t("settings.subscription.pastDueBanner.description")}
            </Text>
            <Pressable
              onPress={() => Linking.openURL(STORE_SUBSCRIPTIONS_URL)}
              accessibilityRole="link"
              accessibilityLabel={t("settings.subscription.pastDueBanner.updatePayment")}
              testID="plan-update-payment"
              hitSlop={8}
            >
              <Text style={styles.pastDueLink}>
                {t("settings.subscription.pastDueBanner.updatePayment")}
              </Text>
            </Pressable>
          </View>
        )}

        <ListGroup footer={planNote}>
          <ListRow
            label={t("settings.mobile.currentPlanLabel")}
            accessory="none"
            right={
              <View
                style={[
                  styles.badge,
                  isPastDue ? styles.badgePastDue : isPremium ? styles.badgePremium : styles.badgeFree,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    isPastDue
                      ? styles.badgeTextPastDue
                      : isPremium
                        ? styles.badgeTextPremium
                        : styles.badgeTextFree,
                  ]}
                >
                  {isPastDue
                    ? t("settings.subscription.badge.pastDue")
                    : isPremium
                      ? "Premium"
                      : "Free"}
                </Text>
              </View>
            }
            testID="plan-current"
          />
        </ListGroup>

        {!isPremium && !isPastDue && (
          <ListGroup>
            <ListRow
              label={t("settings.mobile.upgradeButton")}
              tone="action"
              centered
              onPress={() => navigation.navigate("Paywall")}
              accessibilityLabel={t("settings.mobile.upgradeAria")}
              testID="plan-upgrade"
            />
          </ListGroup>
        )}

        <ListGroup
          footer={
            Platform.OS === "ios"
              ? t("account.mobile.plan.manageNoteIos")
              : t("account.mobile.plan.manageNoteAndroid")
          }
        >
          <ListRow
            label={t("settings.mobile.restoreButton")}
            tone="action"
            accessory="none"
            loading={isRestoring}
            onPress={handleRestore}
            accessibilityLabel={t("settings.mobile.restoreAria")}
            testID="plan-restore"
          />
          <ListRow
            label={t("settings.mobile.manageSubButton")}
            tone="action"
            accessory="external"
            onPress={() =>
              // Web (Stripe) で契約したプランはストアに無く、開いても空の画面になるので案内する
              subscription?.provider === "stripe"
                ? Alert.alert(
                    t("settings.mobile.managedByWebTitle"),
                    t("settings.mobile.managedByWebMessage"),
                  )
                : Linking.openURL(STORE_SUBSCRIPTIONS_URL)
            }
            accessibilityLabel={t("settings.mobile.manageSubAria")}
            testID="plan-manage"
          />
        </ListGroup>
      </ScrollView>
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
    gap: 20,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgePremium: {
    backgroundColor: "#FEF3C7",
  },
  badgeFree: {
    backgroundColor: "#F3F4F6",
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  badgeTextPremium: {
    color: "#92400E",
  },
  badgeTextFree: {
    color: "#6B7280",
  },
  badgePastDue: {
    backgroundColor: "#FEE2E2",
  },
  badgeTextPastDue: {
    color: "#991B1B",
  },
  pastDueBanner: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    gap: 4,
  },
  pastDueTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#991B1B",
  },
  pastDueDescription: {
    fontSize: 14,
    color: "#B91C1C",
  },
  pastDueLink: {
    marginTop: 4,
    fontSize: 14,
    color: "#B91C1C",
    textDecorationLine: "underline",
  },
});
