import React, { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { parseTime } from "@apps/shared/utils/time";
import {
  BestTimeEntryRow,
  StylePickerModal,
  getStyleOption,
  formatStyleDisplay,
  genKey,
  getDuplicateKeys,
  canSave,
  type BestTimeEntry,
} from "@/components/besttime";

export interface OnboardingBestTimeProps {
  onComplete: () => Promise<void>;
  onBack: () => void;
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export const OnboardingBestTime: React.FC<OnboardingBestTimeProps> = ({ onComplete, onBack }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<BestTimeEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const savingRef = useRef(false);

  const recordAPI = useMemo(() => {
    if (!supabase) return null;
    return new RecordAPI(supabase);
  }, [supabase]);

  const duplicateKeys = useMemo(() => getDuplicateKeys(entries), [entries]);
  const isDuplicate = duplicateKeys.size > 0;
  const hasEntries = entries.length > 0;
  const isSaveable = canSave(entries);

  const addEntry = useCallback((styleId: number) => {
    setEntries((prev) => [
      ...prev,
      {
        key: genKey(),
        styleId,
        poolType: 1,
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
    if (!recordAPI || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const records = entries.map((e) => ({
        style_id: e.styleId,
        time: parseTime(e.time),
        is_relaying: false,
        note: null,
        pool_type: e.poolType,
      }));

      const result = await recordAPI.createBulkRecords(records);
      if (result.errors.length > 0) {
        setSaveError(t("onboarding.step3.partialFailure", { errors: result.errors.join(", ") }));
        return;
      }

      await onComplete();
    } catch {
      setSaveError(t("onboarding.step3.saveError"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [entries, recordAPI, onComplete, t]);

  const handleSkip = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete();
    } catch {
      setSaveError(t("onboarding.step3.skipError"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onComplete, t]);

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerIconRow}>
          <Feather name="trending-up" size={24} color="#2563EB" />
        </View>
        <Text style={styles.title}>{t("onboarding.step3.title")}</Text>
        <Text style={styles.subtitle}>{t("onboarding.step3.subtitle")}</Text>
      </View>

      {/* エラー表示 */}
      {saveError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      )}

      {/* 重複警告 */}
      {isDuplicate && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>{t("onboarding.step3.duplicateError")}</Text>
        </View>
      )}

      {/* エントリー一覧 */}
      <ScrollView
        style={styles.entryList}
        contentContainerStyle={styles.entryListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
              t={t}
            />
          );
        })}

        {/* 種目追加ボタン */}
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

      {/* ボタン */}
      <View style={styles.buttonSection}>
        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.backButton, saving && styles.backButtonDisabled]}
            onPress={onBack}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t("onboarding.step3.backButton")}
          >
            <Text style={[styles.backButtonText, saving && styles.backButtonTextDisabled]}>
              {t("onboarding.step3.backButton")}
            </Text>
          </Pressable>

          {hasEntries ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (!isSaveable || saving) && styles.primaryButtonDisabled,
                pressed && isSaveable && !saving && styles.primaryButtonPressed,
              ]}
              onPress={handleSave}
              disabled={!isSaveable || saving}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.step3.saveButton")}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("onboarding.step3.saveButton")}</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                saving && styles.primaryButtonDisabled,
                pressed && !saving && styles.primaryButtonPressed,
              ]}
              onPress={handleSkip}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t("onboarding.step3.skipButton")}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("onboarding.step3.skipButton")}</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* 種目選択モーダル */}
      <StylePickerModal
        visible={showStyleModal}
        onClose={() => setShowStyleModal(false)}
        onSelect={addEntry}
        t={t}
      />
    </View>
  );
};

// =============================================================================
// スタイル
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  header: {
    gap: 6,
    alignItems: "flex-start",
  },
  headerIconRow: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
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
  entryList: {
    flex: 1,
  },
  entryListContent: {
    gap: 10,
    paddingBottom: 4,
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
  buttonSection: {
    gap: 0,
    marginTop: "auto",
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  backButtonDisabled: {
    backgroundColor: "#F9FAFB",
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  backButtonTextDisabled: {
    color: "#9CA3AF",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
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
