import React, { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  /** 表示ごとに増える番号。同じメッセージを続けて出しても別物として扱う */
  id: number;
  message: string;
  kind: ToastKind;
  durationMs: number;
}

/**
 * タブバー (TabNavigator の tabBarStyle.height) の上に出す。タブバーの無い画面でも
 * 同じ高さに出し、画面によって位置が変わらないようにする。
 */
const TAB_BAR_HEIGHT = 64;
const BOTTOM_GAP = 12;
const ENTER_MS = 220;
const EXIT_MS = 180;

const ICONS: Record<ToastKind, { name: keyof typeof Feather.glyphMap; color: string }> = {
  success: { name: "check-circle", color: "#34D399" },
  error: { name: "alert-circle", color: "#F87171" },
  info: { name: "info", color: "#60A5FA" },
};

interface ToastHostProps {
  toast: ToastItem | null;
  onDismiss: (id: number) => void;
}

/**
 * トーストの表示面。`ToastProvider` が画面全体の上に 1 つだけ置く。
 *
 * 表示中のトーストは時間が経つか、タップすると消える。外側の View は常にマウント
 * しておき (pointerEvents="box-none" で下の画面の操作は妨げない)、中身だけを
 * 出し入れすることで exiting アニメーションが確実に走るようにしている。
 *
 * 制限: RN の `Modal` やネイティブスタックの `presentation: "modal"` で開いた画面は
 * この表示面より上に乗るため、その画面が開いている間はトーストが見えない。
 * そうした画面で完了を知らせるときは、先に閉じてから出すこと。
 */
export const ToastHost: React.FC<ToastHostProps> = ({ toast, onDismiss }) => {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <View
      style={[styles.host, { bottom: insets.bottom + TAB_BAR_HEIGHT + BOTTOM_GAP }]}
      pointerEvents="box-none"
    >
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInDown.duration(ENTER_MS)}
          exiting={FadeOutDown.duration(EXIT_MS)}
        >
          <Pressable
            style={styles.toast}
            onPress={() => onDismiss(toast.id)}
            accessibilityRole="button"
            accessibilityLabel={toast.message}
            accessibilityLiveRegion="polite"
            testID="toast"
          >
            <Feather name={ICONS[toast.kind].name} size={18} color={ICONS[toast.kind].color} />
            <Text style={styles.message} numberOfLines={3}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 480,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#111827",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  message: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#FFFFFF",
  },
});
