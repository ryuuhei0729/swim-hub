import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  Animated,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";

/** カード部分のフェード + スケールにかける時間(ms)。開くときも閉じるときも同じ長さを使う。 */
const ANIMATION_DURATION = 160;

export interface CenterModalProps {
  visible: boolean;
  onClose: () => void;
  /** 背面タップ領域・閉じるボタンの accessibilityLabel。i18n の解決は呼び出し元の責務とする */
  closeAccessibilityLabel: string;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * 右上の内蔵×ボタンを表示するか。既定 true。
   *
   * 呼び出し元が既に「タイトル + 独自の×ボタン」を持つヘッダー行を用意している場合
   * (例: `components/teams/TeamCreateModal.tsx` 等の既存フォーム系モーダル)、内蔵ボタンを
   * 表示すると×が二重になるため false を渡すこと。false の場合、カードの既定の
   * padding/maxWidth も付与しない (呼び出し元が `contentStyle` で完全に指定する前提)。
   */
  showCloseButton?: boolean;
}

/**
 * 画面中央に表示するポップアップモーダルの共通プリミティブ。
 *
 * 中央配置のカード + 半透明の暗幕 + 閉じるボタン、という構造は
 * `components/teams/group-management/GroupMemberListModal.tsx` の中央ダイアログパターンを
 * 踏襲している(新パターンを発明しない)。
 *
 * 一方、暗幕を含む Modal 全体を `animationType="slide"/"fade"` で動かすと、暗幕自体が
 * スライド/フェードして見えてしまう。これは「暗い画面はパッと出て、シートだけ動く」という
 * 別 Issue (#3) の要求にも反するため、`animationType="none"` で Modal 自体は即時表示させ、
 * カード部分だけを内部の Animated.View でフェード + スケールさせる。
 *
 * 開くときだけでなく閉じるときも同じ160msでフェード+スケールアウトさせて対称にするため、
 * `visible=false` になっても即座に Modal を外さず、アニメーション再生時間ぶん待ってから
 * マウントを外す。タイミングは `Animated.timing().start()` の完了コールバックに依存させず、
 * アニメーション時間と同じ長さの setTimeout で行う
 * (`components/ui/SlideUpModal.tsx` の閉じアニメーションと同じ設計方針)。
 */
export const CenterModal: React.FC<CenterModalProps> = ({
  visible,
  onClose,
  closeAccessibilityLabel,
  children,
  contentStyle,
  showCloseButton = true,
}) => {
  // Modal 自体は「表示中」+「閉じアニメーション再生中」の間だけマウントする。
  const [isMounted, setIsMounted] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [scale] = useState(() => new Animated.Value(visible ? 1 : 0.95));
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (visible) {
      setIsMounted(true);
      opacity.setValue(0);
      scale.setValue(0.95);
      Animated.timing(opacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
      Animated.timing(scale, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
      Animated.timing(scale, {
        toValue: 0.95,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
      closeTimeoutRef.current = setTimeout(() => setIsMounted(false), ANIMATION_DURATION);
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [visible, opacity, scale]);

  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* 背面タップで閉じるための透明レイヤー。暗幕自体はアニメーションさせず即時表示する */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
        />

        <Animated.View
          style={[
            showCloseButton ? styles.card : styles.cardBare,
            contentStyle,
            { opacity, transform: [{ scale }] },
          ]}
        >
          {showCloseButton && (
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeAccessibilityLabel}
              hitSlop={8}
            >
              <Feather name="x" size={18} color="#6B7280" />
            </Pressable>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    padding: 20,
    paddingTop: 40,
  },
  // showCloseButton=false 用の最小シェル。padding/maxWidth/maxHeight は
  // 呼び出し元が既存の modalContent 相当のスタイルを contentStyle として渡す前提。
  cardBare: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
});
