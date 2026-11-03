import React, { useEffect, useRef, useState } from "react";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";

/** 行ごとの時間差 (ms)。index が大きいほど遅れて出る */
const STAGGER_MS = 40;
/**
 * 時間差を付ける上限の index。これより後ろの行は同じタイミングで出す
 * (初回表示が 20 件あっても、画面外の行まで待たせない)。
 */
const MAX_STAGGER_INDEX = 10;
const DURATION_MS = 260;
/** 下から入ってくる距離 (dp)。FadeInDown 既定の 25 はカード一覧には大きすぎる */
const ENTER_OFFSET_Y = 12;
/**
 * 一覧が初めてデータ付きで描画されてから、この時間を過ぎてマウントされた行は
 * アニメーションしない。スクロールで足される行や、再取得・絞り込み後に増える行まで
 * 毎回ふわっと出ると鬱陶しいため、演出は「最初の 1 回」に限る。
 */
export const ENTER_WINDOW_MS = 700;

/**
 * 一覧の登場アニメーションを「最初の 1 回」に限るためのフラグ
 *
 * `ready` (一覧が表示できる状態か。例: `!isLoading && items.length > 0`) が初めて
 * true になった時点から {@link ENTER_WINDOW_MS} の間だけ true を返す。
 * 画面のマウント時点ではなく `ready` を起点にするのは、データ取得に時間がかかると
 * 一覧が出る前に窓が閉じてしまい、何も動かなくなるため。
 * 窓が閉じるときに一度だけ再レンダーが起きるが、既に出ている行は
 * {@link ListItemEnter} がマウント時の判定を保持するので見た目は変わらない。
 */
export function useListEnterOnce(ready: boolean): boolean {
  const [enabled, setEnabled] = useState(true);
  const startedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || startedRef.current) return;
    startedRef.current = true;
    timerRef.current = setTimeout(() => setEnabled(false), ENTER_WINDOW_MS);
  }, [ready]);

  // タイマーはアンマウント時だけ止める (ready が一時的に false に戻っても窓は閉じ切らせる)
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return enabled;
}

interface ListItemEnterProps {
  /** 一覧内の位置。時間差の計算に使う */
  index: number;
  /** false のときは何も包まず子をそのまま描画する ({@link useListEnterOnce} の値を渡す) */
  enabled: boolean;
  children: React.ReactNode;
}

/**
 * 一覧の行を、少しずつ時間差を付けて下からふわっと出す
 *
 * `entering` はマウント時にしか評価されないので、マウント後に `enabled` が false に
 * 変わっても、すでに出ている行には影響しない。OS の「視差効果を減らす」設定が
 * 有効なときはアニメーションせず、子をそのまま描画する。
 */
export const ListItemEnter: React.FC<ListItemEnterProps> = ({ index, enabled, children }) => {
  const reduceMotion = useReducedMotion();
  // マウント時点の判定で固定する (後から enabled が変わっても包み直さない)
  const [shouldAnimate] = useState(() => enabled && !reduceMotion);

  if (!shouldAnimate) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      entering={FadeInDown.withInitialValues({
        opacity: 0,
        transform: [{ translateY: ENTER_OFFSET_Y }],
      })
        .delay(Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS)
        .duration(DURATION_MS)}
    >
      {children}
    </Animated.View>
  );
};
