import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { colors } from "@/constants/theme";

/** 画面の左右の余白 (ホームの他のカードと同じ) */
const SIDE_PADDING = 16;
/** 隣のカードを見せる幅。横にスワイプできることに気付けるようにする */
const PEEK = 20;
const GAP = 8;

interface DashboardTopCarouselProps {
  /** 1枚ずつ横に並べるカード。各カードは幅いっぱい・高さいっぱいに広がる前提 (flex: 1) */
  pages: Array<{ key: string; label: string; node: React.ReactNode }>;
}

/**
 * ホーム上部の横スワイプのカード列 (次の大会 ⇄ フォーカスポイント)。
 * 1枚ずつ止まり、隣のカードが少し見える。下の点で今どのカードかを示し、点を押しても移れる。
 * カードの高さは高い方に揃う (横並びの行は子を引き伸ばすため)
 */
export const DashboardTopCarousel: React.FC<DashboardTopCarouselProps> = ({ pages }) => {
  // 幅はカルーセル自身の幅で決める (iPad の分割表示などで画面幅と違うことがある)。
  // 測るまでの初回は画面幅で仮置きする
  const [width, setWidth] = useState(() => Dimensions.get("window").width);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.width;
    if (measured > 0) setWidth((prev) => (prev === measured ? prev : measured));
  }, []);
  const pageWidth = Math.max(0, width - SIDE_PADDING * 2 - PEEK);
  const interval = pageWidth + GAP;
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.min(
        pages.length - 1,
        Math.max(0, Math.round(e.nativeEvent.contentOffset.x / interval)),
      );
      setIndex((prev) => (prev === next ? prev : next));
    },
    [interval, pages.length],
  );

  // 幅が変わった (回転・分割表示) ときは、今のカードの位置に合わせ直す。
  // そのままだと前の幅の位置に止まったままで、次にスワイプするまでカードがずれて見える。
  // 1枚目なら位置は 0 のままで合っているので何もしない (初回の描画も含む)
  // (今のカードが変わっただけのときは何もしない: 幅が同じなら位置は合っている)
  const prevIntervalRef = useRef(interval);
  useEffect(() => {
    if (prevIntervalRef.current === interval) return;
    prevIntervalRef.current = interval;
    if (index === 0) return;
    scrollRef.current?.scrollTo({ x: index * interval, animated: false });
  }, [interval, index]);

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * interval, animated: true });
    setIndex(i);
  };

  return (
    <View style={styles.wrap} onLayout={handleLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={handleScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
        testID="dashboard-top-carousel"
      >
        {pages.map((page) => (
          <View key={page.key} style={[styles.page, { width: pageWidth }]}>
            {page.node}
          </View>
        ))}
      </ScrollView>
      {pages.length > 1 && (
        <View style={styles.dots}>
          {pages.map((page, i) => (
            <Pressable
              key={page.key}
              onPress={() => goTo(i)}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel={page.label}
              accessibilityState={{ selected: i === index }}
              style={styles.dotHit}
            >
              <View style={[styles.dot, i === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
  },
  content: {
    paddingHorizontal: SIDE_PADDING,
    gap: GAP,
  },
  page: {
    // 横並びの行の高さ (高い方のカード) まで伸ばし、中のカードも flex: 1 で埋める
    alignSelf: "stretch",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
  },
  // 点そのものは小さいので、押せる範囲は周りに広げる (補助の操作。主な操作はスワイプ)。
  // 枠は 32pt 以上、hitSlop を足して約 44pt にする
  dotHit: {
    minWidth: 32,
    minHeight: 28,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
});
