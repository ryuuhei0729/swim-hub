import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { FOCUS_POINT_MAX_ACTIVE } from "@apps/shared/constants/focusPoints";
import { splitFocusPoints, useFocusPointsQuery } from "@apps/shared/hooks/queries/focusPoints";
import { formatDate } from "@apps/shared/utils/date";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { cardSurface, colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

interface FocusPointCardProps {
  /** 身についたものの一覧も出す (目標タブ用。ホームでは出さない) */
  showMastered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * フォーカスポイント (数字で測らない、泳ぎで意識すること) のカード。
 * ホーム (次の大会の隣のカルーセル) と目標タブの両方に置き、どちらからでも追加・編集できる。
 * 取り組み中は FOCUS_POINT_MAX_ACTIVE 個までで、超えて追加しようとするとエラーのダイアログを出す
 */
export const FocusPointCard: React.FC<FocusPointCardProps> = ({ showMastered = false, style }) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { data, isLoading, isError } = useFocusPointsQuery(supabase, user?.id);
  const { active, mastered } = useMemo(() => splitFocusPoints(data ?? []), [data]);
  const [isMasteredOpen, setIsMasteredOpen] = useState(false);

  const handleAdd = () => {
    if (active.length >= FOCUS_POINT_MAX_ACTIVE) {
      Alert.alert(
        t("focusPoints.limitTitle"),
        t("focusPoints.limitError", { max: FOCUS_POINT_MAX_ACTIVE }),
      );
      return;
    }
    navigation.navigate("FocusPointForm", {});
  };

  const openEdit = (focusPointId: string) => navigation.navigate("FocusPointForm", { focusPointId });

  if (isLoading) {
    return (
      <View style={[styles.card, styles.loading, style]} testID="focus-points-loading">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.card, style]} testID="focus-points-card">
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.kicker}>{t("focusPoints.title")}</Text>
          {!isError && active.length > 0 && (
            <Text style={styles.count}>
              {t("focusPoints.count", { count: active.length, max: FOCUS_POINT_MAX_ACTIVE })}
            </Text>
          )}
        </View>
        {!isError && active.length > 0 && (
          <Pressable
            onPress={handleAdd}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("focusPoints.addAria")}
            testID="focus-points-add"
          >
            <Text style={styles.addText}>{t("focusPoints.add")}</Text>
          </Pressable>
        )}
      </View>

      {isError ? (
        <Text style={styles.errorText}>{t("focusPoints.loadError")}</Text>
      ) : active.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t("focusPoints.emptyTitle")}</Text>
          <Text style={styles.emptyDescription}>{t("focusPoints.emptyDescription")}</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={handleAdd}
            accessibilityRole="button"
            testID="focus-points-add-first"
          >
            <Text style={styles.primaryButtonText}>{t("focusPoints.addAria")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {active.map((point, index) => (
            <Pressable
              key={point.id}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              onPress={() => openEdit(point.id)}
              accessibilityRole="button"
              accessibilityLabel={t("focusPoints.editAria", { title: point.title })}
            >
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{index + 1}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {point.title}
                </Text>
                {point.note ? (
                  <Text style={styles.rowNote} numberOfLines={1}>
                    {point.note}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {showMastered && !isError && mastered.length > 0 && (
        <View style={styles.mastered}>
          <Pressable
            style={styles.masteredToggle}
            onPress={() => setIsMasteredOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isMasteredOpen }}
          >
            <Text style={styles.masteredToggleText}>
              {t("focusPoints.masteredTitle", { count: mastered.length })}
            </Text>
            <Feather
              name={isMasteredOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
          {isMasteredOpen &&
            mastered.map((point) => (
              <Pressable
                key={point.id}
                style={({ pressed }) => [styles.masteredRow, pressed && styles.rowPressed]}
                onPress={() => openEdit(point.id)}
                accessibilityRole="button"
                accessibilityLabel={t("focusPoints.editAria", { title: point.title })}
              >
                <Text style={styles.masteredTitle}>{point.title}</Text>
                <Text style={styles.masteredDate}>
                  {t("focusPoints.masteredOn", {
                    date: formatDate(point.mastered_at, "numeric", locale),
                  })}
                </Text>
              </Pressable>
            ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    padding: 14,
  },
  loading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  count: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  addText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#DC2626",
  },
  empty: {
    marginTop: 8,
    alignItems: "center",
    paddingVertical: 8,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  primaryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 9,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    opacity: 0.6,
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  rowNote: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  mastered: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  masteredToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  masteredToggleText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  masteredRow: {
    paddingVertical: 8,
  },
  masteredTitle: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  masteredDate: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
