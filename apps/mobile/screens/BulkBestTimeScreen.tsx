import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import type { MainStackParamList } from "@/navigation/types";
import {
  STYLE_TAB_IDS,
  getStylesForTab,
  getCellKey,
  computeMatrixRecords,
  isValidForLongCourse,
  canRelay,
  isEnteredButInvalid,
  type StyleTabId,
  type StyleOption,
  type BestTimeInputMap,
  type CellInput,
} from "@/components/besttime";

const EMPTY_CELL: CellInput = { time: "", note: "" };

/**
 * ベストタイム一括手動登録画面 (マイページから遷移)。
 * Web 版 /bulk-besttime の BestTimeMobileView と同じ固定マトリクス
 * (種目タブ × 水路トグル × 距離カード) 方式。構造上、重複登録は起こり得ない。
 * 不正なタイムはインラインエラーで示し保存対象から除外するだけで、
 * 有効な入力が1件以上あれば登録できる (Web 版と同一セマンティクス)。
 * 既存ベストの上書きは行わず INSERT のみ。
 */
export const BulkBestTimeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<StyleTabId>("fr");
  const [activePool, setActivePool] = useState<0 | 1>(0);
  const [inputs, setInputs] = useState<BestTimeInputMap>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const recordAPI = useMemo(() => {
    if (!supabase) return null;
    return new RecordAPI(supabase);
  }, [supabase]);

  const records = useMemo(() => computeMatrixRecords(inputs), [inputs]);
  const validCount = records.length;
  const isSaveable = validCount >= 1;

  const updateCell = useCallback((key: string, field: "time" | "note", value: string) => {
    setInputs((prev) => {
      const current = prev[key] ?? EMPTY_CELL;
      const updated = { ...current, [field]: value };
      const next = { ...prev };
      // Web 版と同じく、タイム・備考とも空になったセルはマップから除去する
      if (!updated.time && !updated.note) {
        delete next[key];
      } else {
        next[key] = updated;
      }
      return next;
    });
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

  const tabStyles = getStylesForTab(activeTab);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>{t("bulkBestTime.header.description")}</Text>

        <TimeInputHelp />

        {saveError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        {/* 種目タブ (Web 版と同じ 5 泳法) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
          accessibilityLabel={t("bulkBestTime.tabsAriaLabel")}
        >
          {STYLE_TAB_IDS.map((tabId) => {
            const active = tabId === activeTab;
            return (
              <Pressable
                key={tabId}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tabId)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`bulkBestTime.tabs.${tabId}`)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {t(`bulkBestTime.tabs.${tabId}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 水路トグル (短水路 / 長水路) */}
        <View
          style={styles.poolToggleWrapper}
          accessibilityLabel={t("bulkBestTime.mobile.poolToggleLabel")}
        >
          <View style={styles.poolToggle}>
            {([0, 1] as const).map((pool) => {
              const active = activePool === pool;
              const label = pool === 0 ? t("common.poolTypeShort") : t("common.poolTypeLong");
              return (
                <Pressable
                  key={pool}
                  style={[styles.poolButton, active && styles.poolButtonActive]}
                  onPress={() => setActivePool(pool)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                >
                  <Text style={[styles.poolButtonText, active && styles.poolButtonTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 距離カード一覧 (長水路で存在しない種目は非表示 = Web 版と同じ) */}
        {tabStyles.map((style) => {
          if (activePool === 1 && !isValidForLongCourse(style)) return null;
          return (
            <MatrixDistanceCard
              key={`${activeTab}_${style.id}_${activePool}`}
              style={style}
              poolType={activePool}
              inputs={inputs}
              onUpdateCell={updateCell}
              disabled={saving}
              t={t}
            />
          );
        })}
      </ScrollView>

      {/* フッター: 一括登録 */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
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
      </SafeAreaView>
    </View>
  );
};

// =============================================================================
// 距離カード (Web 版 BestTimeCard のモバイル移植)
// =============================================================================

interface MatrixDistanceCardProps {
  style: StyleOption;
  poolType: 0 | 1;
  inputs: BestTimeInputMap;
  onUpdateCell: (key: string, field: "time" | "note", value: string) => void;
  disabled: boolean;
  t: TFunction;
}

const MatrixDistanceCard: React.FC<MatrixDistanceCardProps> = ({
  style,
  poolType,
  inputs,
  onUpdateCell,
  disabled,
  t,
}) => {
  const normalKey = getCellKey(style.id, poolType, false);
  const relayKey = getCellKey(style.id, poolType, true);
  const normal = inputs[normalKey] ?? EMPTY_CELL;
  const relay = inputs[relayKey] ?? EMPTY_CELL;

  // Web 版と同じく、既に引き継ぎタイムが入力済みならセクションを開いた状態で表示する
  const [showRelaySection, setShowRelaySection] = useState<boolean>(() => !!relay.time);

  const normalInvalid = isEnteredButInvalid(normal.time);
  const relayInvalid = isEnteredButInvalid(relay.time);
  const hasValidInput =
    (!!normal.time && !normalInvalid) || (!!relay.time && !relayInvalid);
  const showRelayButton = canRelay(style);

  // blur 時に確定値へ再フォーマット (練習タイム・大会レコード入力と同じ UX)。
  // 不正形式は生値のまま残し、既存のインラインエラー表示に任せる
  const handleTimeBlur = (key: string, raw: string) => {
    const parsed = parseTimeFlexible(raw);
    if (parsed !== null) {
      onUpdateCell(key, "time", formatTimeBest(parsed));
    }
  };

  const distanceLabel = `${style.distance}m`;

  return (
    <View style={[styles.card, hasValidInput && styles.cardFilled]}>
      <Text style={styles.cardTitle}>{distanceLabel}</Text>

      {/* 通常タイム */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t("bulkBestTime.table.time")}</Text>
        <TextInput
          style={[styles.timeInput, normalInvalid && styles.inputError, disabled && styles.inputDisabled]}
          value={normal.time}
          onChangeText={(text) => onUpdateCell(normalKey, "time", text)}
          onBlur={() => handleTimeBlur(normalKey, normal.time)}
          placeholder={t("onboarding.step3.timePlaceholder")}
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoCapitalize="none"
          editable={!disabled}
          accessibilityLabel={`${distanceLabel} ${t("bulkBestTime.table.time")}`}
        />
        {normalInvalid && (
          <Text style={styles.fieldErrorText} accessibilityRole="alert">
            {t("bulkBestTime.error.invalidTimeFormat")}
          </Text>
        )}
      </View>

      {/* 備考 */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>{t("bulkBestTime.table.note")}</Text>
        <TextInput
          style={[styles.noteInput, disabled && styles.inputDisabled]}
          value={normal.note}
          onChangeText={(text) => onUpdateCell(normalKey, "note", text)}
          placeholder={t("bulkBestTime.table.notePlaceholder")}
          placeholderTextColor="#9CA3AF"
          editable={!disabled}
          accessibilityLabel={`${distanceLabel} ${t("bulkBestTime.table.note")}`}
        />
      </View>

      {/* 引き継ぎセクション */}
      {showRelayButton && !showRelaySection && (
        <Pressable
          onPress={() => setShowRelaySection(true)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t("bulkBestTime.mobile.addRelaying")}
          style={({ pressed }) => [styles.relayToggle, pressed && styles.relayTogglePressed]}
        >
          <Text style={styles.relayToggleText}>{t("bulkBestTime.mobile.addRelaying")}</Text>
        </Pressable>
      )}

      {showRelayButton && showRelaySection && (
        <View style={styles.relaySection}>
          <Text style={styles.relaySectionTitle}>{t("bulkBestTime.mobile.relayingLabel")}</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t("bulkBestTime.table.time")}</Text>
            <TextInput
              style={[styles.timeInput, relayInvalid && styles.inputError, disabled && styles.inputDisabled]}
              value={relay.time}
              onChangeText={(text) => onUpdateCell(relayKey, "time", text)}
              onBlur={() => handleTimeBlur(relayKey, relay.time)}
              placeholder={t("onboarding.step3.timePlaceholder")}
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              autoCorrect={false}
              autoCapitalize="none"
              editable={!disabled}
              accessibilityLabel={`${distanceLabel} ${t("bulkBestTime.mobile.relayingLabel")} ${t("bulkBestTime.table.time")}`}
            />
            {relayInvalid && (
              <Text style={styles.fieldErrorText} accessibilityRole="alert">
                {t("bulkBestTime.error.invalidTimeFormat")}
              </Text>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t("bulkBestTime.table.note")}</Text>
            <TextInput
              style={[styles.noteInput, disabled && styles.inputDisabled]}
              value={relay.note}
              onChangeText={(text) => onUpdateCell(relayKey, "note", text)}
              placeholder={t("bulkBestTime.table.notePlaceholder")}
              placeholderTextColor="#9CA3AF"
              editable={!disabled}
              accessibilityLabel={`${distanceLabel} ${t("bulkBestTime.mobile.relayingLabel")} ${t("bulkBestTime.table.note")}`}
            />
          </View>

          <Pressable
            onPress={() => setShowRelaySection(false)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t("bulkBestTime.mobile.hideRelaying")}
            style={({ pressed }) => [styles.relayToggle, pressed && styles.relayTogglePressed]}
          >
            <Text style={styles.relayHideText}>{t("bulkBestTime.mobile.hideRelaying")}</Text>
          </Pressable>
        </View>
      )}
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
  tabBar: {
    flexGrow: 0,
    marginHorizontal: -16,
  },
  tabBarContent: {
    paddingHorizontal: 16,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#2563EB",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },
  poolToggleWrapper: {
    alignItems: "center",
    marginVertical: 4,
  },
  poolToggle: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    padding: 3,
  },
  poolButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  poolButtonActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  poolButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  poolButtonTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  cardFilled: {
    borderLeftWidth: 4,
    borderLeftColor: "#2563EB",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  noteInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: "#FCA5A5",
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
  fieldErrorText: {
    fontSize: 11,
    color: "#DC2626",
    lineHeight: 14,
  },
  relayToggle: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  relayTogglePressed: {
    opacity: 0.6,
  },
  relayToggleText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "500",
  },
  relayHideText: {
    fontSize: 13,
    color: "#6B7280",
    textDecorationLine: "underline",
  },
  relaySection: {
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 10,
    gap: 10,
  },
  relaySectionTitle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
