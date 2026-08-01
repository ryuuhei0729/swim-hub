import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** シートのタイトル。省略時はヘッダー領域を閉じるボタンのみにする */
  title?: string;
  children: React.ReactNode;
  /** sticky フッター領域(例:「すべてクリア」+「適用」ボタン) */
  footer?: React.ReactNode;
  /** シートの最大高さ(画面高さに対する割合、既定80) */
  maxHeightPercent?: number;
}

/**
 * 汎用ボトムシート(下部からスライドインするパネル)。
 * `components/besttime/StylePickerModal.tsx` のシート実装(RN Modal transparent
 * animationType="slide" + Pressable overlay + 角丸View)を一般化したもの。
 * SortBottomSheet / FilterBottomSheet の土台として使う。
 *
 * Android のハードウェア戻るボタンは Modal の onRequestClose 経由で onClose を呼ぶ。
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxHeightPercent = 80,
}) => {
  const { t } = useTranslation();
  const insets = useSafeInsets();

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("common.bottomSheet.close")}
      >
        {/* 内側タップはオーバーレイの閉じる処理へ伝播させない */}
        <Pressable
          style={[styles.sheet, { maxHeight: `${maxHeightPercent}%` }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabHandleRow} accessible={false}>
            <View style={styles.grabHandle} />
          </View>

          <View style={styles.header}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : (
              <View />
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.bottomSheet.close")}
              hitSlop={8}
            >
              <Feather name="x" size={20} color="#374151" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? (
            <SafeAreaView edges={["bottom"]} style={styles.footer}>
              {footer}
            </SafeAreaView>
          ) : (
            // footer 不在時 (例: SortBottomSheet) も children (ScrollView) の
            // 最下段が Android edge-to-edge のシステムナビゲーションバーに埋没しないよう、
            // bottom inset ぶんの高さのスペーサーを確保する。
            // 実機検証で「children/style なしの空 SafeAreaView」は padding を生成しない
            // ことが判明したため、useSafeInsets の値を明示的な高さとして持つ
            // プレーン View に置き換えた (footer 側の SafeAreaView は実測 PASS 済みのため不変)。
            <View style={{ height: getSafeFooterPadding(0, insets.bottom) }} />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  grabHandleRow: {
    alignItems: "center",
    paddingTop: 8,
  },
  grabHandle: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 12,
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
});
