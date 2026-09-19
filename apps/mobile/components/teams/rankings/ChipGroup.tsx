// =============================================================================
// ChipGroup - ランキング絞り込みシートの単一選択チップ群
// =============================================================================
//
// `RankingFilterSheet` の各絞り込みグループ (種目 / 距離 / 水路 / 性別 / 対象) が
// 同じ見た目・同じ操作契約でチップを並べるため、実装をここ1箇所に置く。
// グループごとにコピーすると、片方だけスタイルや再タップ挙動が変わって静かに乖離する。

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  /**
   * このチップから**視覚的な行を分ける** (省略時は分けない = 従来どおり
   * 1つの折り返し行に全チップを並べる)。
   *
   * 種目グループが「個人5種目 / 改行 / リレー2種類」の2行になるために足した。
   * ⚠️ **行が分かれても `options` は1本のままで、`radiogroup` の View も1つ**。
   * 「ChipGroup を2つ並べる」形にすると radiogroup が2つになり
   * 「7択のうち1つを選ぶ」という排他選択の意味論が支援技術に伝わらなくなる
   * (個人種目とリレーが独立した2つのラジオグループに読まれ、両方に選択が
   *  あるように見える)。
   *
   * 行の境目を「index」や「行の配列」ではなく**選択肢自身のフラグ**で持つのは、
   * 選択肢の並びが唯一の定義元 (shared の選択肢配列) にあり、行の境目も
   * そこから導出させたいため。呼び出し側が別に区切り位置を数えると、
   * shared 側に種目が増えたときフラグだけ古いままになって静かにずれる。
   */
  startsNewRow?: boolean;
}

export interface ChipGroupProps<T extends string | number> {
  label: string;
  options: ChipOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  /** 見出し直下に出す注記 (スコープ拡大の注意書きなど) */
  note?: string;
}

/** 表示用の1行。`key` は行頭のチップの値 (options 内で一意) から作る。 */
interface ChipRow<T extends string | number> {
  key: string;
  options: ChipOption<T>[];
}

/**
 * `startsNewRow` を境目に options を表示行へ畳む。
 * フラグが1つも無ければ行は1本だけになり、従来の描画と一致する。
 */
function buildChipRows<T extends string | number>(options: ChipOption<T>[]): ChipRow<T>[] {
  const rows: ChipRow<T>[] = [];
  let current: ChipRow<T> | null = null;

  for (const option of options) {
    if (!current || option.startsNewRow) {
      current = { key: String(option.value), options: [] };
      rows.push(current);
    }
    current.options.push(option);
  }

  return rows;
}

/**
 * 単一選択のチップ群。必ず1つが選択されている状態を保つため、
 * 選択中チップの再タップでは何もしない (FilterBottomSheet の single モードとは
 * ここが異なる)。
 *
 * 支援技術には **radiogroup / radio** として読ませる。見た目はチップだが操作契約は
 * 「常に1つだけ選択されている排他選択」であり、これはラジオボタンの意味論と一致する
 * (button + selected だと「押せるボタンが並んでいる」と読まれ、排他であることが伝わらない)。
 * 「包む View に radiogroup / 各要素に radio」という構造は既存の
 * `components/ui/GenderToggle.tsx` (26, 35 行) と同じ。
 *
 * radiogroup 側に `accessibilityLabel` は付けない。付けると iOS で View 自体が
 * アクセシビリティ要素になり配下のチップが読まれなくなる恐れがあるため、
 * 見出しは兄弟の `<Text>` のまま残す (上記の既存実装と同じ判断)。
 *
 * `startsNewRow` で視覚的に複数行へ分かれても、**radiogroup は1つのまま**
 * (行は radiogroup の内側の素の View で、アクセシビリティ要素にしない)。
 */
export function ChipGroup<T extends string | number>({
  label,
  options,
  selectedValue,
  onSelect,
  note,
}: ChipGroupProps<T>) {
  const rows = buildChipRows(options);

  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {note && <Text style={styles.groupNote}>{note}</Text>}
      <View style={styles.chipsContainer} accessibilityRole="radiogroup">
        {rows.map((row) => (
          <View key={row.key} style={styles.chipsRow}>
            {row.options.map((option) => {
              const selected = option.value === selectedValue;
              return (
                <Pressable
                  key={String(option.value)}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    if (selected) return;
                    onSelect(option.value);
                  }}
                  accessibilityRole="radio"
                  // radio ロールの canonical な状態は `checked` (Android TalkBack は
                  // `isChecked()` を読む) だが、iOS VoiceOver は `selected` トレイトを
                  // 読むため両方渡す。
                  //
                  // ⚠️ `components/ui/GenderToggle.tsx:36` は radio ロールなのに
                  // `checked` を渡していない (= あちらが不足している側)。構造の前例
                  // としては参照できるが、`accessibilityState` の中身は真似しないこと。
                  accessibilityState={{ selected, checked: selected }}
                  accessibilityLabel={option.label}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  groupNote: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 18,
  },
  // 行を縦に積む。行が1本だけのときは `chipsRow` 単体だった従来の描画と
  // 同じ見た目になる (縦の gap が効く相手がいない)
  chipsContainer: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
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
});
