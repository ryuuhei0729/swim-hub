import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  type PanResponderInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";

/** 位置を調整する元画像 (幅・高さは ImageManipulator が切り抜く座標系と同じもの) */
export interface AvatarCropSource {
  uri: string;
  width: number;
  height: number;
}

/** 切り抜く正方形 (元画像の座標) */
export interface AvatarCropRect {
  originX: number;
  originY: number;
  size: number;
}

/** 表示枠の一辺 (px) の上限。枠には短辺が収まるように画像を縮小して出す */
const MAX_VIEWPORT = 320;

/**
 * 表示上のずらし量 (offsetX/offsetY。0 以下) から、元画像で切り抜く正方形を求める。
 * 短辺を枠に合わせて表示しているので、切り抜く一辺は常に短辺。
 * ずらしていない (中央) ときは (幅 - 短辺) / 2 などになり、従来の中央切り抜きと同じ座標になる。
 */
export function computeAvatarCrop(
  source: Pick<AvatarCropSource, "width" | "height">,
  viewport: number,
  offset: { x: number; y: number },
): AvatarCropRect {
  const size = Math.min(source.width, source.height);
  const scale = viewport / size;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  return {
    originX: clamp(Math.round(-offset.x / scale), source.width - size),
    originY: clamp(Math.round(-offset.y / scale), source.height - size),
    size,
  };
}

interface AvatarCropModalProps {
  /** null の間は表示しない */
  source: AvatarCropSource | null;
  onCancel: () => void;
  onConfirm: (crop: AvatarCropRect) => void;
}

/**
 * Android 用のプロフィール画像の位置調整 (正方形)。
 * システムの Photo Picker は切り抜きができないため、選んだ画像の短辺を枠に合わせて表示し、
 * はみ出した長辺の方向にドラッグして切り抜く位置を決める (ズームはしない)。
 * 追加のネイティブ依存を使わず、react-native の PanResponder と expo-image-manipulator だけで行う。
 */
export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ source, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const viewport = Math.max(Math.min(windowWidth - 64, MAX_VIEWPORT), 160);

  const layout = useMemo(() => {
    if (!source) return null;
    const size = Math.min(source.width, source.height);
    const scale = viewport / size;
    const displayWidth = source.width * scale;
    const displayHeight = source.height * scale;
    return {
      displayWidth,
      displayHeight,
      minX: viewport - displayWidth,
      minY: viewport - displayHeight,
    };
  }, [source, viewport]);

  // ずらし量。マウント中ずっと同一インスタンスである必要があるため useState で遅延生成する
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  // 確定時に読む現在のずらし量 (ドラッグのたびに書き換える。描画には使わない)
  const offsetRef = useRef({ x: 0, y: 0 });
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // 開くたび・画像が変わるたびに中央から始める
  useEffect(() => {
    if (!layout) return;
    const center = { x: layout.minX / 2, y: layout.minY / 2 };
    offsetRef.current = center;
    translateX.setValue(center.x);
    translateY.setValue(center.y);
  }, [layout, translateX, translateY]);

  // PanResponder はエフェクト内で一度だけ作る (ハンドラが ref を描画中ではなくイベント時に読むように。
  // history/BottomSheet と同じ)
  const [panResponder, setPanResponder] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    let start = { x: 0, y: 0 };
    setPanResponder(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start = offsetRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const current = layoutRef.current;
          if (!current) return;
          const next = {
            x: Math.min(Math.max(start.x + gesture.dx, current.minX), 0),
            y: Math.min(Math.max(start.y + gesture.dy, current.minY), 0),
          };
          offsetRef.current = next;
          translateX.setValue(next.x);
          translateY.setValue(next.y);
        },
      }),
    );
  }, [translateX, translateY]);

  if (!source || !layout) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("common.upload.adjustPositionTitle")}</Text>
          <Text style={styles.hint}>{t("common.upload.adjustPositionHint")}</Text>
          <View
            style={[styles.viewport, { width: viewport, height: viewport }]}
            testID="avatar-crop-viewport"
            {...(panResponder?.panHandlers ?? {})}
          >
            <Animated.View
              style={{
                width: layout.displayWidth,
                height: layout.displayHeight,
                transform: [{ translateX }, { translateY }],
              }}
            >
              <Image
                source={{ uri: source.uri }}
                style={{ width: layout.displayWidth, height: layout.displayHeight }}
                contentFit="fill"
              />
            </Animated.View>
            {/* 表示されるのは丸く切り抜いた部分 (プロフィール画像の見え方) */}
            <View
              pointerEvents="none"
              style={[styles.circleGuide, { borderRadius: viewport / 2 }]}
            />
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.confirmButton]}
              onPress={() => onConfirm(computeAvatarCrop(source, viewport, offsetRef.current))}
              accessibilityRole="button"
            >
              <Text style={styles.confirmButtonText}>
                {t("common.upload.adjustPositionConfirm")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  hint: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  viewport: {
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  circleGuide: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.9)",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  confirmButton: {
    backgroundColor: "#2563EB",
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
