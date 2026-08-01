import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BottomSheet } from "./BottomSheet";

export type SortOrder = "asc" | "desc";

export interface SortPreset<C extends string> {
  id: string;
  label: string;
  /** ソート対象カラム。既定順(例: 日付新しい順)は isDefault と組み合わせて表現する */
  column: C;
  order: SortOrder;
  /**
   * true の場合、activeColumn===null (=未ソート=既定表示順) のときもこのプリセットが
   * 選択中として扱われる(例: 「日付新しい順」は初期状態の sortColumn=null と等価)
   */
  isDefault?: boolean;
}

export interface SortBottomSheetProps<C extends string> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  presets: SortPreset<C>[];
  activeColumn: C | null;
  activeOrder: SortOrder;
  onSelect: (preset: SortPreset<C>) => void;
}

/**
 * 並べ替えボトムシート(汎用)。プリセットをタップすると即座に onSelect が呼ばれ、
 * 実際の sortColumn/sortOrder 反映・displayCount リセット・シートを閉じる処理は
 * 呼び出し側(各 Screen)が行う(web の SortBottomSheet と同じ契約)。
 */
export function SortBottomSheet<C extends string>({
  isOpen,
  onClose,
  title,
  presets,
  activeColumn,
  activeOrder,
  onSelect,
}: SortBottomSheetProps<C>) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <View>
        {presets.map((preset, index) => {
          const isSelected = preset.isDefault
            ? activeColumn === null || (activeColumn === preset.column && activeOrder === preset.order)
            : activeColumn === preset.column && activeOrder === preset.order;

          return (
            <Pressable
              key={preset.id}
              style={[styles.item, index < presets.length - 1 && styles.itemBorder]}
              onPress={() => onSelect(preset)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={preset.label}
            >
              <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                {preset.label}
              </Text>
              {isSelected && <Feather name="check" size={18} color="#2563EB" />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  itemText: {
    fontSize: 15,
    color: "#111827",
  },
  itemTextSelected: {
    fontWeight: "600",
    color: "#2563EB",
  },
});
