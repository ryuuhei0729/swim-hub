import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const EDGE_FADE_WIDTH = 28;

/** 横スクロール可能なチップ行。スクロール可能な間だけ右端にフェードを重ねてスクロール可能であることを示す */
export const ChipScrollRow: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const isScrollable = contentWidth > containerWidth + 1;
  const isAtEnd = scrollX >= contentWidth - containerWidth - 1;
  const showRightFade = isScrollable && !isAtEnd;

  return (
    <View
      style={styles.chipRowWrapper}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
          setScrollX(e.nativeEvent.contentOffset.x)
        }
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {showRightFade && (
        <LinearGradient
          colors={["rgba(255,255,255,0)", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.edgeFade}
          pointerEvents="none"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  chipRowWrapper: {
    position: "relative",
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
  },
  edgeFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: EDGE_FADE_WIDTH,
  },
});
