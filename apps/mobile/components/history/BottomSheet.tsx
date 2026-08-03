import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  PanResponder,
  type PanResponderInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";

/** この距離(px)以上ヘッダーを下方向へドラッグして離すとシートを閉じる */
const DISMISS_DISTANCE = 80;
/** 距離が足りなくてもこの速度(px/ms)以上の下方向フリックならシートを閉じる */
const DISMISS_VELOCITY = 0.6;
/** ドラッグ開始と判定する下方向の移動量(px)。これ未満は縦スクロール/タップと区別しない */
const DRAG_ACTIVATION_DISTANCE = 6;

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
 * SortBottomSheet / FilterBottomSheet の土台として使う。
 *
 * - 背面は暗くしない(オーバーレイは透明)。シート自体の影で背面と分離する
 * - 背面タップで閉じる。背景 Pressable はシートの「兄弟」として絶対配置しており、
 *   シート本体のタップがここに届かない(= 誤って閉じない)構造にしている
 * - ヘッダー(グラブハンドル + タイトル行)を下方向へスワイプすると閉じる
 * - Android のハードウェア戻るボタンは Modal の onRequestClose 経由で onClose を呼ぶ
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

  // ドラッグ量。マウント中ずっと同一インスタンスである必要があるため useState で遅延生成する
  const [translateY] = useState(() => new Animated.Value(0));

  // 呼び出し側の onClose はインライン関数で毎レンダー識別子が変わるが、PanResponder は
  // マウント中作り直せない (作り直すと内部 gestureState が初期化され、ドラッグ途中だった
  // 場合に dy が起点を失って暴発する)。そのため最新の onClose は ref 経由で読む。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ドラッグ量は閉じても Animated.Value に残るため、開き直すたびに原点へ戻す。
  // 閉じるアニメーション(Modal の slide out)中に戻すと飛びが見えるので、開く側でのみリセットする。
  useLayoutEffect(() => {
    if (isOpen) {
      translateY.setValue(0);
    }
  }, [isOpen, translateY]);

  // PanResponder はマウント直後に一度だけ生成する。生成をエフェクト内に置くことで、
  // ハンドラのクロージャが ref をレンダー中ではなくエフェクト/イベント時に読むことを保証する。
  const [panResponder, setPanResponder] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    const springBack = () => {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    };

    setPanResponder(
      PanResponder.create({
        // タップ(閉じるボタン等)を奪わないよう、開始時点では responder にならない
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > DRAG_ACTIVATION_DISTANCE && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_, gesture) => {
          // 上方向へは追従させない(シートは画面下端に固定されているため)
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            onCloseRef.current();
            return;
          }
          springBack();
        },
        onPanResponderTerminate: springBack,
      }),
    );
  }, [translateY]);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* 背面タップで閉じるための透明レイヤー。シートより下に敷く */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.bottomSheet.close")}
        />

        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: `${maxHeightPercent}%`, transform: [{ translateY }] },
          ]}
        >
          {/* 下スワイプで閉じられるドラッグ領域(グラブハンドル + ヘッダー) */}
          <View {...panResponder?.panHandlers}>
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // 背面を暗くしない代わりに、影で背面コンテンツとの境界を出す
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
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
