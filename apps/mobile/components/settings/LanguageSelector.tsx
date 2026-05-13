import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n";
import { useLocaleStore } from "@/stores/localeStore";

const LABELS: Record<SupportedLocale, string> = {
  ja: "日本語",
  en: "English",
};

/**
 * 言語選択 UI。Settings 画面に配置する基盤レイヤのコンポーネント。
 * Phase M1 時点では文言をインラインで保持し、M3 以降の機能スライス i18n 化と合わせて
 * `t('mobile.settings.language.*')` への置換を行う。
 */
export const LanguageSelector: React.FC = () => {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const handleSelect = useCallback(
    (next: SupportedLocale) => {
      void setLocale(next);
    },
    [setLocale],
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>言語 / Language</Text>
      <View style={styles.sectionContent}>
        {SUPPORTED_LOCALES.map((value) => {
          const selected = value === locale;
          return (
            <Pressable
              key={value}
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handleSelect(value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={LABELS[value]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {LABELS[value]}
              </Text>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  rowSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  label: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  labelSelected: {
    color: "#1D4ED8",
    fontWeight: "600",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    borderColor: "#2563EB",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
  },
});
