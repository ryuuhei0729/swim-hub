import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TFunction } from "i18next";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import { isEnteredButInvalid, type BestTimeEntry } from "./styleOptions";

export interface BestTimeEntryRowProps {
  entry: BestTimeEntry;
  styleName: string;
  onUpdate: (key: string, patch: Partial<BestTimeEntry>) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
  isDuplicate: boolean;
  /** true の場合、長水路ボタンを非活性にする (25m / 100m IM 等) */
  longCourseDisabled?: boolean;
  /** true の場合、備考欄を表示する (一括入力モード) */
  showNote?: boolean;
  t: TFunction;
}

/**
 * ベストタイム一括入力の1エントリー (カード)。
 * オンボーディング (showNote なし): 水路トグル + タイムを横並び。
 * 一括入力 (showNote): 水路トグル / タイム + 備考を1行。
 */
export const BestTimeEntryRow: React.FC<BestTimeEntryRowProps> = ({
  entry,
  styleName,
  onUpdate,
  onRemove,
  disabled,
  isDuplicate,
  longCourseDisabled = false,
  showNote = false,
  t,
}) => {
  const timeInvalid = showNote && isEnteredButInvalid(entry.time);

  // blur 時に確定値へ再フォーマット (練習タイム・大会レコード入力と同じ UX)。
  // 不正形式は生値のまま残し、エラー表示 / canSave の無効化に任せる
  const handleTimeBlur = () => {
    const parsed = parseTimeFlexible(entry.time);
    if (parsed !== null) {
      onUpdate(entry.key, { time: formatTimeBest(parsed) });
    }
  };

  const poolToggle = (
    <View style={styles.poolToggle}>
      <Pressable
        style={[styles.poolButton, entry.poolType === 0 && styles.poolButtonActive]}
        onPress={() => onUpdate(entry.key, { poolType: 0 })}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t("common.poolTypeShort")}
      >
        <Text style={[styles.poolButtonText, entry.poolType === 0 && styles.poolButtonTextActive]}>
          {t("common.poolTypeShort")}
        </Text>
      </Pressable>
      <Pressable
        style={[
          styles.poolButton,
          entry.poolType === 1 && styles.poolButtonActive,
          longCourseDisabled && styles.poolButtonDisabled,
        ]}
        onPress={() => onUpdate(entry.key, { poolType: 1 })}
        disabled={disabled || longCourseDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: longCourseDisabled }}
        accessibilityLabel={t("common.poolTypeLong")}
      >
        <Text
          style={[
            styles.poolButtonText,
            entry.poolType === 1 && styles.poolButtonTextActive,
            longCourseDisabled && styles.poolButtonTextDisabled,
          ]}
        >
          {t("common.poolTypeLong")}
        </Text>
      </Pressable>
    </View>
  );

  const removeButton = (
    <Pressable
      onPress={() => onRemove(entry.key)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t("onboarding.step3.removeStyleAria", { styleName })}
      style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
    >
      <Feather name="x" size={16} color={disabled ? "#D1D5DB" : "#9CA3AF"} />
    </Pressable>
  );

  // --- オンボーディング: 水路トグル + タイムを横並び ---
  if (!showNote) {
    return (
      <View style={[styles.card, isDuplicate && styles.cardDuplicate]}>
        <View style={styles.cardHeader}>
          <Text style={styles.styleName}>{styleName}</Text>
          {removeButton}
        </View>
        <View style={styles.inputRow}>
          {poolToggle}
          <TextInput
            style={[styles.timeInput, styles.flex1, disabled && styles.inputDisabled]}
            value={entry.time}
            onChangeText={(text) => onUpdate(entry.key, { time: text })}
            onBlur={handleTimeBlur}
            placeholder={t("onboarding.step3.timePlaceholder")}
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            editable={!disabled}
            accessibilityLabel={t("onboarding.step3.timeAriaLabel", { styleName })}
          />
        </View>
      </View>
    );
  }

  // --- 一括入力: 水路トグル / タイム + 備考を1行 ---
  return (
    <View style={[styles.card, isDuplicate && styles.cardDuplicate]}>
      <View style={styles.cardHeader}>
        <Text style={styles.styleName}>{styleName}</Text>
        {removeButton}
      </View>

      {/* コントロール行: 水路トグル */}
      <View style={styles.controlsRow}>{poolToggle}</View>

      {/* タイム + 備考を1行 */}
      <View style={[styles.inputRow, styles.inputRowTop]}>
        <View style={styles.timeCell}>
          <TextInput
            style={[styles.timeInput, timeInvalid && styles.inputError, disabled && styles.inputDisabled]}
            value={entry.time}
            onChangeText={(text) => onUpdate(entry.key, { time: text })}
            onBlur={handleTimeBlur}
            placeholder={t("onboarding.step3.timePlaceholder")}
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            editable={!disabled}
            accessibilityLabel={t("onboarding.step3.timeAriaLabel", { styleName })}
          />
          {timeInvalid && (
            <Text style={styles.errorText} accessibilityRole="alert">
              {t("bulkBestTime.error.invalidTimeFormat")}
            </Text>
          )}
        </View>
        <TextInput
          style={[styles.noteInput, styles.noteCell, disabled && styles.inputDisabled]}
          value={entry.note}
          onChangeText={(text) => onUpdate(entry.key, { note: text })}
          placeholder={t("bulkBestTime.table.notePlaceholder")}
          placeholderTextColor="#9CA3AF"
          editable={!disabled}
          accessibilityLabel={`${styleName} ${t("bulkBestTime.table.note")}`}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  cardDuplicate: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  styleName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  removeButton: {
    padding: 4,
  },
  removeButtonPressed: {
    opacity: 0.6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputRowTop: {
    alignItems: "flex-start",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  flex1: {
    flex: 1,
  },
  timeCell: {
    flex: 1,
  },
  noteCell: {
    flex: 1.4,
  },
  poolToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  poolButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  poolButtonActive: {
    backgroundColor: "#2563EB",
  },
  poolButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  poolButtonText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  poolButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  poolButtonTextDisabled: {
    color: "#D1D5DB",
  },
  timeInput: {
    height: 36,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  noteInput: {
    height: 36,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: "#FCA5A5",
  },
  errorText: {
    marginTop: 4,
    fontSize: 11,
    color: "#DC2626",
    lineHeight: 14,
  },
  inputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
});
