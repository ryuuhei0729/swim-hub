import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { cardSurface } from "@/constants/theme";

interface DashboardCardCarouselProps {
  /**
   * 1枚ずつ横に並べるカード。各カードは左右の余白 (marginHorizontal) を自分で持ち、
   * 高さを揃えるため style に { flex: 1 } を受け取れること
   */
  children: React.ReactNode;
  /**
   * 開いたときに表示しておくカードの位置 (既定 0)。カルーセルを組んだときに1度だけ効く。
   * 並び順は変えずに、最初に見せるカードだけを選ぶために使う
   */
  initialIndex?: number;
  /**
   * 並べるカードと initialIndex が決まったか (既定 true)。false の間は読み込み表示を出す。
   * 先にカードを出してから最初のカードへ移ると、開いた直後に表示が切り替わって見えるため
   */
  ready?: boolean;
}

/**
 * ホームのカードを横に並べ、1枚ずつスワイプで切り替える。下のドットで今の位置を示す。
 * カードが1枚だけならカルーセルにせず、そのまま出す。
 * 各ページの高さは一番高いカードに揃う (横スクロールの中身は行方向で、ページが縦に伸びる)。
 */
export const DashboardCardCarousel: React.FC<DashboardCardCarouselProps> = ({
  children,
  initialIndex = 0,
  ready = true,
}) => {
  const cards = React.Children.toArray(children).filter(React.isValidElement);

  if (!ready) {
    return (
      <View style={styles.placeholder} testID="dashboard-card-carousel-loading">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }
  if (cards.length <= 1) return <>{cards}</>;
  // カルーセルを組むたびに作り直し、そのときの initialIndex で開く
  return <CarouselPager cards={cards} initialIndex={initialIndex} />;
};

const CarouselPager: React.FC<{ cards: React.ReactElement[]; initialIndex: number }> = ({
  cards,
  initialIndex,
}) => {
  const { t } = useTranslation();
  // 最初に見せるカードは組んだ時点の値で固定する (見ている途中で勝手に切り替えない)
  const [startIndex] = useState(() => Math.max(0, Math.min(cards.length - 1, initialIndex)));
  // 初回の描画は画面幅で組み、onLayout で実際の幅 (回転・分割表示) に合わせ直す
  const [width, setWidth] = useState(() => Dimensions.get("window").width);
  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const startAppliedRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // 幅が変わったら、今のカードの位置に合わせ直す (そのままだとカードが半分ずれて見える)
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [width]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.max(
      0,
      Math.min(cards.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)),
    );
    indexRef.current = next;
    setIndex(next);
  };

  // iOS は contentOffset で最初から目的のカードを描く。contentOffset が効かない環境に備えて、
  // 中身の大きさが決まった最初のタイミングでも1度だけ移す
  const applyStartIndex = () => {
    if (startAppliedRef.current) return;
    startAppliedRef.current = true;
    if (startIndex > 0) scrollRef.current?.scrollTo({ x: startIndex * width, animated: false });
  };

  return (
    <View testID="dashboard-card-carousel">
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: startIndex * width, y: 0 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onContentSizeChange={applyStartIndex}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {cards.map((card, i) => (
          <View key={card.key ?? i} style={[styles.page, { width }]}>
            {card}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {cards.map((card, i) => (
          <Pressable
            key={card.key ?? i}
            onPress={() => scrollRef.current?.scrollTo({ x: i * width, animated: true })}
            accessibilityRole="button"
            accessibilityLabel={t("dashboard.cardCarousel.goTo", { index: i + 1 })}
            accessibilityState={{ selected: i === index }}
            // 見た目は小さい点のまま、押せる範囲を広げる (ドットの間は padding で埋める)
            style={styles.dotButton}
            hitSlop={{ top: 11, bottom: 11 }}
          >
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    // 次の大会 (エントリー2種目) のカードとほぼ同じ高さ。出たときに下の内容がずれにくい
    minHeight: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  page: {
    flexDirection: "column",
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 1,
  },
  dotButton: {
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
  },
  dotActive: {
    width: 16,
    backgroundColor: "#2563EB",
  },
});
