import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { REFLECTION_OTHER_ID } from "@apps/shared/utils/goalReflection";

interface ReflectionChecklistProps {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
  otherLabel: string;
  otherPlaceholder: string;
  otherNote: string;
  onOtherNoteChange: (note: string) => void;
  disabled?: boolean;
}

/** 目標・マイルストーンの振り返りで共通の、選択式の理由 + 「その他」自由記述 */
export const ReflectionChecklist: React.FC<ReflectionChecklistProps> = ({
  label,
  options,
  selectedIds,
  onToggle,
  otherLabel,
  otherPlaceholder,
  otherNote,
  onOtherNoteChange,
  disabled = false,
}) => (
  <View style={styles.container}>
    <Text style={styles.label}>{label}</Text>
    {options.map((option) => {
      const checked = selectedIds.includes(option.id);
      return (
        <Pressable
          key={option.id}
          style={styles.option}
          onPress={() => onToggle(option.id)}
          disabled={disabled}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled }}
          accessibilityLabel={option.label}
        >
          <Feather
            name={checked ? "check-square" : "square"}
            size={20}
            color={checked ? "#2563EB" : "#9CA3AF"}
          />
          <Text style={styles.optionText}>{option.label}</Text>
        </Pressable>
      );
    })}
    {selectedIds.includes(REFLECTION_OTHER_ID) && (
      <View style={styles.other}>
        <Text style={styles.label}>{otherLabel}</Text>
        <TextInput
          style={styles.input}
          value={otherNote}
          onChangeText={onOtherNoteChange}
          placeholder={otherPlaceholder}
          placeholderTextColor="#9CA3AF"
          editable={!disabled}
          accessibilityLabel={otherLabel}
        />
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  other: {
    gap: 6,
    marginTop: 4,
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: "#111827",
  },
});
