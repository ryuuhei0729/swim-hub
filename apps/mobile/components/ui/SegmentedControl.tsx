import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/constants/theme";

/** トラックの内側の余白。選択中を示す白いつまみはこの分だけ内側に収まる */
const TRACK_PADDING = 3;
const SLIDE_MS = 180;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * 2〜3 択の切り替え (iOS の UISegmentedControl 風)
 *
 * 灰色のトラックの上を、選択中を示す白いつまみが横に滑る。つまみの位置は
 * reanimated で動かすので、押した直後の反応が JS の負荷に左右されない。
 * つまみの幅は onLayout で測ったトラック幅から出すため、最初の描画では
 * (幅が分かるまで) つまみを出さない。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const segmentWidth = trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / options.length : 0;

  // shared value の読み書きは `.get()` / `.set()` で行う (React Compiler の lint の都合)
  const translateX = useSharedValue(0);
  useEffect(() => {
    translateX.set(
      withTiming(selectedIndex * segmentWidth, {
        duration: SLIDE_MS,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [selectedIndex, segmentWidth, translateX]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.track} onLayout={handleLayout} accessibilityRole="tablist" testID={testID}>
      {segmentWidth > 0 && (
        <Animated.View pointerEvents="none" style={[styles.thumb, { width: segmentWidth }, thumbStyle]} />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 36,
    padding: TRACK_PADDING,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
  },
  // 浮いている部品なので、ここだけは薄い影で立たせる
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: 8,
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  labelSelected: {
    color: colors.textPrimary,
  },
});
