"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Keyboard,
} from "react-native";
import { useTranslation } from "react-i18next";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import type { BestTime } from "@apps/shared/types/ui";
import { formatTime } from "@/utils/formatters";
import { BottomDockPortal } from "@/components/ui/BottomDock";
import {
  INPUT_GRID_DISTANCES,
  INPUT_GRID_STYLE_KEYS,
  findStyleOption,
  formatStyleDisplay,
  getCellKey,
  getStyleOption,
  isEnterableCell,
  isEnteredButInvalid,
  type BestTimeInputMap,
  type StyleKey,
} from "./styleOptions";

// 種目ごとの色 (ホームのベストタイム表 profile/BestTimesTable と同じ)
const STYLE_COLORS: Record<StyleKey, { bg: string; text: string }> = {
  Fr: { bg: "#FEF3C7", text: "#92400E" },
  Br: { bg: "#D1FAE5", text: "#065F46" },
  Ba: { bg: "#FEE2E2", text: "#991B1B" },
  Fly: { bg: "#DBEAFE", text: "#1E40AF" },
  IM: { bg: "#FCE7F3", text: "#9F1239" },
};

/** マスのキー → 今のベスト (秒)。通常タイムと引き継ぎタイムは別のマスとして持つ */
export function buildCurrentBestMap(
  bestTimes: BestTime[],
): Map<string, number> {
  const map = new Map<string, number>();
  const put = (
    styleId: number,
    poolType: number,
    isRelaying: boolean,
    time: number,
  ) => {
    const key = getCellKey(styleId, poolType === 1 ? 1 : 0, isRelaying);
    const prev = map.get(key);
    if (prev === undefined || time < prev) map.set(key, time);
  };
  for (const bt of bestTimes) {
    put(bt.style_id, bt.pool_type, bt.is_relaying, bt.time);
    if (!bt.is_relaying && bt.relayingTime) {
      put(bt.style_id, bt.pool_type, true, bt.relayingTime.time);
    }
  }
  return map;
}

export interface BestTimeInputGridProps {
  bestTimes: BestTime[];
  poolType: 0 | 1;
  isRelaying: boolean;
  inputs: BestTimeInputMap;
  onUpdateCell: (key: string, field: "time" | "note", value: string) => void;
  onClearCell: (key: string) => void;
  disabled: boolean;
  /** マスを選んだとき・キーボードが出たときに、表と入力欄が見える位置まで画面を送る */
  onRequestReveal?: () => void;
}

/**
 * ホームのベストタイム表の入力モード。表の形はそのままで、マスをタップすると表の下に入力欄が開く。
 * 入力欄はモーダルにしない (開いたまま別のマスをタップして切り替えられるようにするため)。
 * 水路と「引き継ぎ」は表の上の切り替え (BestTimesTable) で選ぶ。切り替えると呼び出し元が key を
 * 変えて作り直すので、選択中のマスもそこで閉じる。
 */
export const BestTimeInputGrid: React.FC<BestTimeInputGridProps> = ({
  bestTimes,
  poolType,
  isRelaying,
  inputs,
  onUpdateCell,
  onClearCell,
  disabled,
  onRequestReveal,
}) => {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const currentBest = useMemo(
    () => buildCurrentBestMap(bestTimes),
    [bestTimes],
  );
  const poolLabel =
    poolType === 0
      ? t("mypage.bestTimesTable.shortCourse")
      : t("mypage.bestTimesTable.longCourse");

  // マスを選んだら、表と入力欄をキーボードの上へ送ってもらう (送る時機は呼び出し元が決める)
  useEffect(() => {
    if (selectedKey) onRequestReveal?.();
  }, [selectedKey, onRequestReveal]);

  // 画面のキーボードが閉じて入力欄にフォーカスが無くなったら、入力欄も閉じる
  // (入力欄はキーボードの真上に固定しているので、キーボードだけ消えると画面下端に取り残される)。
  // - 別のマスへ切り替えた直後は新しい入力欄にフォーカスがあるので閉じない
  // - 画面にキーボードが出ていない (外付けキーボード・シミュレータのハードウェアキーボード) ときも
  //   iOS は「閉じた」通知だけを送ってくる。キーボードが実際に出た後に閉じたときだけ閉じる
  useEffect(() => {
    let keyboardShown = false;
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      keyboardShown = true;
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      const wasShown = keyboardShown;
      keyboardShown = false;
      if (wasShown && !TextInput.State?.currentlyFocusedInput?.()) setSelectedKey(null);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const selectedStyle = selectedKey
    ? getStyleOption(Number(selectedKey.split("_")[0]))
    : undefined;

  const closeEditor = () => {
    Keyboard.dismiss();
    setSelectedKey(null);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.hint, isRelaying && styles.hintRelay]}>
        {isRelaying
          ? t("mypage.bestTimesTable.edit.relayModeHint")
          : t("mypage.bestTimesTable.edit.tapHint")}
      </Text>

      <View style={styles.table} testID="best-time-input-grid">
        <View style={styles.row}>
          <View style={[styles.headerCell, styles.distanceCell]}>
            <Text style={styles.headerText}>
              {t("mypage.bestTimesTable.distanceHeader")}
            </Text>
          </View>
          {INPUT_GRID_STYLE_KEYS.map((key) => (
            <View
              key={key}
              style={[
                styles.headerCell,
                styles.styleCell,
                { backgroundColor: STYLE_COLORS[key].bg },
              ]}
            >
              <Text
                style={[styles.headerText, { color: STYLE_COLORS[key].text }]}
              >
                {t(`practice.styleAbbrev.${key}`)}
              </Text>
            </View>
          ))}
        </View>

        {INPUT_GRID_DISTANCES.map((distance) => (
          <View key={distance} style={styles.row}>
            <View style={[styles.cell, styles.distanceCell]}>
              <Text style={styles.distanceText}>{distance}m</Text>
            </View>
            {INPUT_GRID_STYLE_KEYS.map((key) => {
              const style = findStyleOption(key, distance);
              if (!isEnterableCell(style, poolType, isRelaying)) {
                return (
                  <View
                    key={key}
                    style={[
                      styles.cell,
                      styles.styleCell,
                      styles.cellUnavailable,
                    ]}
                  />
                );
              }
              const cellKey = getCellKey(style.id, poolType, isRelaying);
              const input = inputs[cellKey];
              const best = currentBest.get(cellKey);
              const isSelected = selectedKey === cellKey;
              const enteredTime = input?.time ?? "";
              const invalid = isEnteredButInvalid(enteredTime);
              const color = STYLE_COLORS[key];
              const styleName = formatStyleDisplay(style, t);
              const state = enteredTime
                ? t("mypage.bestTimesTable.edit.cellEntered", {
                    time: enteredTime,
                  })
                : best !== undefined
                  ? t("mypage.bestTimesTable.edit.currentBest", {
                      time: formatTime(best),
                    })
                  : t("mypage.bestTimesTable.edit.cellEmpty");
              const relayLabel = isRelaying
                ? ` ${t("mypage.bestTimesTable.edit.relayTag")}`
                : "";

              return (
                <Pressable
                  key={key}
                  testID={`best-time-input-cell-${cellKey}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled }}
                  accessibilityLabel={`${styleName} ${poolLabel}${relayLabel} ${state}`}
                  disabled={disabled}
                  onPress={() => setSelectedKey(isSelected ? null : cellKey)}
                  style={[
                    styles.cell,
                    styles.styleCell,
                    { backgroundColor: color.bg },
                    invalid && styles.cellInvalid,
                    isSelected && styles.cellSelected,
                  ]}
                >
                  {enteredTime ? (
                    <>
                      <Text
                        style={[
                          styles.cellText,
                          invalid ? styles.cellTextInvalid : styles.cellTextNew,
                        ]}
                        numberOfLines={1}
                      >
                        {enteredTime}
                        {isRelaying && <Text style={styles.suffix}>R</Text>}
                      </Text>
                      {best !== undefined && !invalid && (
                        <Text style={styles.oldText} numberOfLines={1}>
                          {formatTime(best)}
                        </Text>
                      )}
                    </>
                  ) : best !== undefined ? (
                    <Text
                      style={[styles.cellText, { color: color.text }]}
                      numberOfLines={1}
                    >
                      {formatTime(best)}
                      {isRelaying && <Text style={styles.suffix}>R</Text>}
                    </Text>
                  ) : (
                    <Text style={styles.plus}>＋</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {selectedKey && selectedStyle && (
        <BottomDockPortal>
          <BestTimeCellEditor
            key={selectedKey}
            title={formatStyleDisplay(selectedStyle, t)}
            subtitle={
              isRelaying
                ? `${poolLabel} · ${t("mypage.bestTimesTable.edit.relayTag")}`
                : poolLabel
            }
            time={inputs[selectedKey]?.time ?? ""}
            note={inputs[selectedKey]?.note ?? ""}
            currentBest={currentBest.get(selectedKey)}
            disabled={disabled}
            onChangeTime={(v) => onUpdateCell(selectedKey, "time", v)}
            onChangeNote={(v) => onUpdateCell(selectedKey, "note", v)}
            onClear={() => onClearCell(selectedKey)}
            onDone={closeEditor}
          />
        </BottomDockPortal>
      )}
    </View>
  );
};

// =============================================================================
// 選んだマスの入力欄
// =============================================================================

interface BestTimeCellEditorProps {
  title: string;
  subtitle: string;
  time: string;
  note: string;
  currentBest: number | undefined;
  disabled: boolean;
  onChangeTime: (value: string) => void;
  onChangeNote: (value: string) => void;
  onClear: () => void;
  onDone: () => void;
}

const BestTimeCellEditor: React.FC<BestTimeCellEditorProps> = ({
  title,
  subtitle,
  time,
  note,
  currentBest,
  disabled,
  onChangeTime,
  onChangeNote,
  onClear,
  onDone,
}) => {
  const { t } = useTranslation();
  const [showNote, setShowNote] = useState(() => note !== "");
  const invalid = isEnteredButInvalid(time);
  const parsed = parseTimeFlexible(time);
  const slower =
    parsed !== null && currentBest !== undefined && parsed > currentBest;

  // 確定したら表示を揃える (練習タイム・大会記録の入力と同じ)。形式が正しくない値はそのまま残す
  const handleBlur = () => {
    if (parsed !== null) onChangeTime(formatTimeBest(parsed));
  };

  return (
    <View style={styles.editor} testID="best-time-cell-editor">
      <View style={styles.editorHeader}>
        <Text style={styles.editorTitle} numberOfLines={1}>
          {title}
          <Text style={styles.editorSubtitle}>{`  ${subtitle}`}</Text>
        </Text>
        <Text style={styles.editorCurrent} numberOfLines={1}>
          {currentBest !== undefined
            ? t("mypage.bestTimesTable.edit.currentBest", {
                time: formatTime(currentBest),
              })
            : t("mypage.bestTimesTable.edit.noCurrentBest")}
        </Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.timeInput, invalid && styles.timeInputInvalid]}
          value={time}
          onChangeText={onChangeTime}
          onBlur={handleBlur}
          placeholder={t("onboarding.step3.timePlaceholder")}
          placeholderTextColor="#9CA3AF"
          // returnKeyType を付けると iOS が数字キーボードの上に独自の「Done」バーを足し、
          // この欄の「完了」と二重になるので付けない
          keyboardType="decimal-pad"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
          editable={!disabled}
          accessibilityLabel={`${title} ${subtitle}`}
        />
        <Pressable
          style={[styles.editorButton, styles.editorButtonGhost]}
          onPress={onClear}
          disabled={disabled}
          accessibilityRole="button"
        >
          <Text style={styles.editorButtonGhostText}>
            {t("mypage.bestTimesTable.edit.clear")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.editorButton, styles.editorButtonPrimary]}
          onPress={onDone}
          accessibilityRole="button"
          testID="best-time-cell-editor-done"
        >
          <Text style={styles.editorButtonPrimaryText}>
            {t("mypage.bestTimesTable.edit.done")}
          </Text>
        </Pressable>
      </View>

      {invalid && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {t("bulkBestTime.error.invalidTimeFormat")}
        </Text>
      )}
      {slower && (
        <Text style={styles.warnText}>
          {t("mypage.bestTimesTable.edit.slowerThanBest")}
        </Text>
      )}

      {showNote ? (
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={onChangeNote}
          placeholder={t("mypage.bestTimesTable.edit.notePlaceholder")}
          placeholderTextColor="#9CA3AF"
          editable={!disabled}
          accessibilityLabel={`${title} ${t("mypage.bestTimesTable.edit.notePlaceholder")}`}
        />
      ) : (
        <Pressable
          style={styles.noteChip}
          onPress={() => setShowNote(true)}
          disabled={disabled}
          accessibilityRole="button"
          hitSlop={6}
        >
          <Text style={styles.noteChipText}>
            {t("mypage.bestTimesTable.edit.addNote")}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    paddingHorizontal: 16,
  },
  hintRelay: {
    color: "#2563EB",
    fontWeight: "600",
  },
  table: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
  },
  headerCell: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#D1D5DB",
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  distanceCell: {
    width: 44,
    backgroundColor: "#F9FAFB",
  },
  styleCell: {
    flex: 1,
  },
  cell: {
    minHeight: 40,
    paddingVertical: 3,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#D1D5DB",
  },
  cellUnavailable: {
    backgroundColor: "#E5E7EB",
  },
  cellSelected: {
    borderWidth: 2,
    borderColor: "#2563EB",
    borderRightColor: "#2563EB",
  },
  cellInvalid: {
    borderWidth: 2,
    borderColor: "#DC2626",
    borderRightColor: "#DC2626",
  },
  distanceText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  cellText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cellTextNew: {
    color: "#2563EB",
  },
  cellTextInvalid: {
    color: "#DC2626",
  },
  oldText: {
    fontSize: 8,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  suffix: {
    fontSize: 8,
  },
  plus: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  // キーボードの真上に固定する入力欄 (BottomDockHost の中に出る)
  editor: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  editorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  editorTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  editorSubtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
  },
  editorCurrent: {
    fontSize: 12,
    color: "#6B7280",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInput: {
    flex: 1,
    height: 44,
    borderWidth: 2,
    borderColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  timeInputInvalid: {
    borderColor: "#DC2626",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  warnText: {
    fontSize: 12,
    color: "#B45309",
  },
  noteChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  noteChipText: {
    fontSize: 12,
    color: "#475569",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  editorButton: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  editorButtonGhost: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  editorButtonGhostText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  editorButtonPrimary: {
    backgroundColor: "#2563EB",
  },
  editorButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
