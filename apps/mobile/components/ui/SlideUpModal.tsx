import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** シートの開閉アニメーションにかける時間(ms)。 */
const SLIDE_DURATION = 250;

/**
 * `Dimensions` が使えない環境 (このリポジトリの vitest 用 `__mocks__/react-native.ts` は
 * `Dimensions` を export していない) でのみ使うフォールバック値。実機ではまず使われない。
 */
const FALLBACK_OFFSCREEN_TRANSLATE_Y = 1200;

/**
 * シートを画面外に退避させるための translateY (dp)。画面の実高さを使うことで、
 * 大画面タブレット等でも「開く前にシートの初期位置が画面内に残ってしまう」ことなく
 * 確実に画面外へ出す。`Dimensions.get` 自体が例外を投げる/`height` が数値でない
 * (テスト環境など) 場合のみ固定値へフォールバックする (transform なので
 * レイアウトサイズには影響しない)。
 */
function getOffscreenTranslateY(): number {
  try {
    const height = Dimensions.get("window")?.height;
    return typeof height === "number" && height > 0
      ? height
      : FALLBACK_OFFSCREEN_TRANSLATE_Y;
  } catch {
    return FALLBACK_OFFSCREEN_TRANSLATE_Y;
  }
}

export interface SlideUpModalProps {
  visible: boolean;
  /** Android の戻るボタン (Modal の onRequestClose) 用。 */
  onClose: () => void;
  /**
   * 背面タップ時の処理。省略時は onClose を使う。
   * 保存中などタップで閉じさせたくない状態がある場合は、呼び出し側で
   * ガード済みの関数 (例: `() => !saving && onClose()`) を渡すこと。
   */
  onBackdropPress?: () => void;
  backdropAccessibilityLabel?: string;
  children: React.ReactNode;
  /** シート (Animated.View) に適用する追加スタイル。既存の modalContent/sheet 相当。 */
  sheetStyle?: StyleProp<ViewStyle>;
  /** オーバーレイ(暗幕)の背景色。既定 "rgba(0, 0, 0, 0.5)"。 */
  overlayColor?: string;
}

/**
 * 下からスライドインするボトムシートモーダルの共通プリミティブ。
 *
 * `<Modal animationType="slide">` は暗幕を含むモーダル全体をまとめてスライドさせて
 * しまうため、「暗幕は即時表示、シートだけが下から出てくる」という要求
 * (ユーザーフィードバック #3) を満たせない。そのため Modal 自体は
 * `animationType="none"` で即時表示し、シート部分だけを内部の Animated.View で
 * translateY アニメーションさせる
 * (`components/ui/CenterModal.tsx` が中央配置ポップアップで採用している
 * 「Modal は即時表示 + 内部だけアニメーション」という設計を、下スライド用に踏襲したもの)。
 *
 * 開くときだけでなく閉じるときも「シートが下にスライドしてから消える」ようにするため、
 * `visible=false` になっても即座に Modal を外さず、閉じアニメーションの再生時間ぶん
 * 待ってからマウントを外す (CenterModal は閉じアニメーションを持たないが、ボトムシートは
 * PM 指示により開閉を対称にする必要があるため異なる設計にしている)。
 * マウント解除のタイミングは `Animated.timing().start(callback)` の完了コールバックには
 * 依存させず、アニメーション時間と同じ長さの setTimeout で行う
 * (useNativeDriver 環境によって completion callback の呼ばれ方に差があるため)。
 */
export const SlideUpModal: React.FC<SlideUpModalProps> = ({
  visible,
  onClose,
  onBackdropPress,
  backdropAccessibilityLabel,
  children,
  sheetStyle,
  overlayColor = "rgba(0, 0, 0, 0.5)",
}) => {
  // Modal 自体は「表示中」+「閉じアニメーション再生中」の間だけマウントする。
  const [isMounted, setIsMounted] = useState(visible);
  const [translateY] = useState(
    () => new Animated.Value(visible ? 0 : getOffscreenTranslateY()),
  );
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    if (visible) {
      setIsMounted(true);
      translateY.setValue(getOffscreenTranslateY());
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: getOffscreenTranslateY(),
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();
      closeTimeoutRef.current = setTimeout(
        () => setIsMounted(false),
        SLIDE_DURATION,
      );
    }

    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [visible, translateY]);

  if (!isMounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.overlay, { backgroundColor: overlayColor }]}>
        {/* 背面タップで閉じるための透明レイヤー。シート (Animated.View) の「兄弟」として
            絶対配置しており、シート本体のタップがここに届かない構造にしている
            (components/history/BottomSheet.tsx と同じ方式)。 */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onBackdropPress ?? onClose}
          accessibilityRole="button"
          accessibilityLabel={backdropAccessibilityLabel}
        />
        <Animated.View
          style={[styles.sheet, sheetStyle, { transform: [{ translateY }] }]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
  },
});
