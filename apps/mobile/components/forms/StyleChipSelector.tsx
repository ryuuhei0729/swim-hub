import React from "react";
import { View, Text, Pressable, Switch, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import {
  getStyleOption,
  canRelay,
  type StyleKey,
} from "@/components/besttime/styleOptions";
import type { Style } from "@apps/shared/types";

interface StyleChipSelectorProps {
  /** 選択肢となる種目一覧 (距離・泳法を内部で導出) */
  styles: Style[];
  /** 選択中の種目ID (文字列) */
  value: string;
  /** 種目ID変更時のコールバック */
  onChange: (styleId: string) => void;
  disabled?: boolean;
  /** リレー区分。onToggleRelaying と併せて渡すとリレートグルを表示する */
  isRelaying?: boolean;
  onToggleRelaying?: (next: boolean) => void;
  /** リレートグルのラベル */
  relayLabel?: string;
  testID?: string;
}

/**
 * 距離チップ × 泳法チップで種目を選択するセレクタ (mobile 版)。
 * web apps/web/components/forms/StyleChipSelector.tsx の RN ポート。
 * 距離・泳法の組み合わせから種目ID(styleId)を逆引きして onChange に渡す。
 * 泳法チップのラベルは practice.styles.* 翻訳経由 (locale 対応)。
 * リレートグルは canRelay (besttime/styleOptions) で選択種目がリレー可能なときのみ表示。
 */
export const StyleChipSelector: React.FC<StyleChipSelectorProps> = ({
  styles: styleList,
  value,
  onChange,
  disabled = false,
  isRelaying = false,
  onToggleRelaying,
  relayLabel,
  testID,
}) => {
  const { t } = useTranslation();

  const currentStyle = styleList.find((s) => s.id.toString() === value);
  const raceDistance = currentStyle?.distance;
  const currentCodeKey = currentStyle
    ? getStyleOption(currentStyle.id)?.styleKey
    : undefined;

  const distanceOptions = Array.from(new Set(styleList.map((s) => s.distance))).sort(
    (a, b) => a - b,
  );

  // CodeKey の出現順を保持 (styleList 配列の順序を尊重)
  const codeKeyOrder: StyleKey[] = [];
  styleList.forEach((s) => {
    const key = getStyleOption(s.id)?.styleKey;
    if (key && !codeKeyOrder.includes(key)) codeKeyOrder.push(key);
  });

  /** 距離 d × StyleKey ck の style を検索して id を返す (id ベースで locale 非依存) */
  const findStyleIdBy = (
    d: number | undefined,
    ck: StyleKey | undefined,
  ): string | undefined => {
    if (d === undefined || ck === undefined) return undefined;
    const found = styleList.find(
      (s) => s.distance === d && getStyleOption(s.id)?.styleKey === ck,
    );
    return found ? found.id.toString() : undefined;
  };

  // 選択中の距離で入力可能な StyleKey のみ
  const codeKeysForCurrentDistance = codeKeyOrder.filter((ck) =>
    styleList.some(
      (s) => s.distance === raceDistance && getStyleOption(s.id)?.styleKey === ck,
    ),
  );

  // 距離未選択時は全泳法を表示し、種目チップを最初から見せる
  const codeKeysToShow =
    raceDistance !== undefined ? codeKeysForCurrentDistance : codeKeyOrder;

  const currentOption = currentStyle ? getStyleOption(currentStyle.id) : undefined;
  const showRelayToggle =
    onToggleRelaying != null && currentOption != null && canRelay(currentOption);

  return (
    <View style={sheet.container} testID={testID}>
      {/* 距離 */}
      <View style={sheet.chipRow}>
        {distanceOptions.map((d) => {
          const isActive = raceDistance === d;
          return (
            <Pressable
              key={d}
              disabled={disabled}
              onPress={() => {
                // 現在の泳法で同距離があればそれを、無ければその距離で選べる先頭泳法を選ぶ
                const id =
                  findStyleIdBy(d, currentCodeKey) ??
                  findStyleIdBy(
                    d,
                    codeKeyOrder.find((ck) => findStyleIdBy(d, ck) !== undefined),
                  );
                if (id) onChange(id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive, disabled }}
              style={[
                sheet.chip,
                isActive && sheet.chipSelected,
                disabled && sheet.chipDisabled,
              ]}
              testID={testID ? `${testID}-distance-${d}` : undefined}
            >
              <Text style={[sheet.chipText, isActive && sheet.chipTextSelected]}>
                {d}m
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* 泳法 — ラベルは practice.styles 翻訳 */}
      <View style={sheet.chipRow}>
        {codeKeysToShow.map((ck) => {
          const isActive = currentCodeKey === ck;
          return (
            <Pressable
              key={ck}
              disabled={disabled}
              onPress={() => {
                // 距離未選択ならその泳法が選べる先頭の距離を補う
                const targetDistance =
                  raceDistance ??
                  distanceOptions.find((d) => findStyleIdBy(d, ck) !== undefined);
                const id = findStyleIdBy(targetDistance, ck);
                if (id) onChange(id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive, disabled }}
              style={[
                sheet.chip,
                isActive && sheet.chipSelected,
                disabled && sheet.chipDisabled,
              ]}
              testID={testID ? `${testID}-stroke-${ck}` : undefined}
            >
              <Text style={[sheet.chipText, isActive && sheet.chipTextSelected]}>
                {t(`practice.styles.${ck}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* リレー (オンオフトグル) */}
      {showRelayToggle && (
        <View style={sheet.relayRow}>
          <Switch
            value={isRelaying}
            onValueChange={(next) => onToggleRelaying?.(next)}
            disabled={disabled}
            testID={testID ? `${testID}-relay` : undefined}
          />
          {relayLabel ? <Text style={sheet.relayLabel}>{relayLabel}</Text> : null}
        </View>
      )}
    </View>
  );
};

const sheet = StyleSheet.create({
  container: {
    gap: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  relayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  relayLabel: {
    fontSize: 13,
    color: "#374151",
  },
});
