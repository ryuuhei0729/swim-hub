import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import type { MainStackParamList } from "@/navigation/types";
import {
  BestTimeEntryRow,
  StylePickerModal,
  getStyleOption,
  formatStyleDisplay,
  genKey,
  isValidForLongCourse,
  canRelay,
  computeBulkState,
  type BestTimeEntry,
} from "@/components/besttime";

/**
 * ベストタイム一括手動登録画面 (マイページから遷移)。
 * 種目を追加し、短水路/長水路ごとにベストタイムをまとめて入力して一括登録する。
 * Web 版 /bulk-besttime のモバイル相当。既存ベストの上書きは行わず INSERT のみ。
 */
export const BulkBestTimeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [entries, setEntries] = useState<BestTimeEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const savingRef = useRef(false);

  const recordAPI = useMemo(() => {
    if (!supabase) return null;
    return new RecordAPI(supabase);
  }, [supabase]);

  const bulkState = useMemo(() => computeBulkState(entries), [entries]);
  const { records, duplicateKeys, canSave: isSaveable, validCount } = bulkState;
  const isDuplicate = duplicateKeys.size > 0;
  const hasEntries = entries.length > 0;

  // 種目追加: 長水路で無効な種目は短水路を初期値にする
  const addEntry = useCallback((styleId: number) => {
    const style = getStyleOption(styleId);
    const initialPoolType: 0 | 1 = style && !isValidForLongCourse(style) ? 0 : 1;
    setEntries((prev) => [
      ...prev,
      {
        key: genKey(),
        styleId,
        poolType: initialPoolType,
        time: "",
        note: "",
        isRelaying: false,
      },
    ]);
    setShowStyleModal(false);
  }, []);

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const updateEntry = useCallback((key: string, patch: Partial<BestTimeEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!recordAPI || savingRef.current || !isSaveable) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await recordAPI.createBulkRecords(
        records.map((r) => ({
          style_id: r.styleId,
          time: r.time,
          is_relaying: r.isRelaying,
          note: r.note,
          pool_type: r.poolType,
        })),
      );

      if (result.errors.length > 0) {
        setSaveError(t("bulkBestTime.error.partialFailure", { errors: result.errors.join(", ") }));
        return;
      }

      // マイページのベストタイム表を最新化
      await queryClient.invalidateQueries({ queryKey: recordKeys.bestTimes(user?.id) });

      Alert.alert(
        t("bulkBestTime.mobile.successTitle"),
        t("bulkBestTime.success.registered", { n: result.created }),
        [{ text: t("common.ok"), onPress: () => navigation.goBack() }],
      );
    } catch {
      setSaveError(t("bulkBestTime.error.registerFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [records, recordAPI, isSaveable, queryClient, user?.id, t, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>{t("bulkBestTime.mobile.description")}</Text>

        {saveError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        {isDuplicate && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>{t("onboarding.step3.duplicateError")}</Text>
          </View>
        )}

        {!hasEntries && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Feather name="clock" size={24} color="#9CA3AF" />
            </View>
            <Text style={styles.emptyTitle}>{t("bulkBestTime.mobile.emptyTitle")}</Text>
            <Text style={styles.emptyBody}>{t("bulkBestTime.mobile.emptyBody")}</Text>
          </View>
        )}

        {entries.map((entry) => {
          const styleOption = getStyleOption(entry.styleId);
          const styleName = styleOption ? formatStyleDisplay(styleOption, t) : "";
          return (
            <BestTimeEntryRow
              key={entry.key}
              entry={entry}
              styleName={styleName}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              disabled={saving}
              isDuplicate={duplicateKeys.has(entry.key)}
              longCourseDisabled={styleOption ? !isValidForLongCourse(styleOption) : false}
              relayEnabled={styleOption ? canRelay(styleOption) : false}
              showNote
              t={t}
            />
          );
        })}

        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.addButtonPressed,
            saving && styles.addButtonDisabled,
          ]}
          onPress={() => setShowStyleModal(true)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.step3.addStyleButton")}
        >
          <Feather name="plus" size={16} color={saving ? "#9CA3AF" : "#2563EB"} />
          <Text style={[styles.addButtonText, saving && styles.addButtonTextDisabled]}>
            {t("onboarding.step3.addStyleButton")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* フッター: 一括登録 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.footerCount}>
          {t("bulkBestTime.footer.inputLabel")}{" "}
          <Text style={styles.footerCountStrong}>
            {t("bulkBestTime.footer.inputCount", { count: validCount })}
          </Text>
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!isSaveable || saving) && styles.primaryButtonDisabled,
            pressed && isSaveable && !saving && styles.primaryButtonPressed,
          ]}
          onPress={handleSave}
          disabled={!isSaveable || saving}
          accessibilityRole="button"
          accessibilityLabel={t("bulkBestTime.button.register")}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t("bulkBestTime.button.register")}</Text>
          )}
        </Pressable>
      </View>

      <StylePickerModal
        visible={showStyleModal}
        onClose={() => setShowStyleModal(false)}
        onSelect={addEntry}
        t={t}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 2,
  },
  errorBanner: {
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
  },
  warningBanner: {
    padding: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warningText: {
    fontSize: 13,
    color: "#92400E",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  emptyBody: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    borderStyle: "dashed",
    backgroundColor: "#F0F9FF",
  },
  addButtonPressed: {
    backgroundColor: "#DBEAFE",
  },
  addButtonDisabled: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  addButtonText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "500",
  },
  addButtonTextDisabled: {
    color: "#9CA3AF",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  footerCount: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 1,
  },
  footerCountStrong: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  primaryButtonPressed: {
    backgroundColor: "#1D4ED8",
  },
  primaryButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
