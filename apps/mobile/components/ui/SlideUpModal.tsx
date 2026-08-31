import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/** シートの開閉アニメーションにかける時間(ms)。 */
const SLIDE_DURATION = 250;

/**
 * iOS: ネイティブの `onDismiss` (dismissViewController:completion: の completion ブロック、
 * `RCTModalHostViewComponentView.mm` で実証済み) が何らかの理由で届かなかった場合の
 * フェイルセーフ時間(ms)。あくまで異常系の保険であり、正常系の待ち合わせ手段ではない
 * (Sprint Contract が禁止しているのは「主たる同期手段としての固定 setTimeout」であり、
 * これはそれとは別物)。iOS のモーダル遷移アニメーションは通常 300〜400ms 程度で完了するため、
 * 十分に安全側の余裕を持たせている。
 *
 * 【この待機窓自体が生む競合と、その対策】
 * `setModalVisible(false)` でネイティブの `dismissViewControllerAnimated:` を開始させた後、
 * `onDismiss` (またはこのフェイルセーフ) が実際に届くまでの間に `visible` が再び `true` に
 * なる (reopen) ケースがある。ネイティブの dismiss 処理自体は JS から途中キャンセルできない
 * ため、reopen 後に「古いクローズサイクルの」`onDismiss`/フェイルセーフが遅れて届く可能性が
 * ある。これを何の対策もなく `finishClosing()` に直結させると、reopen 後に再表示した
 * シートを誤って消してしまい (`isMounted=false`)、`onClosed` まで誤発火する
 * (Reviewer 指摘の Critical)。そのため `awaitingDismissRef` で「現在のクローズサイクルに
 * 属する信号か」を判定し、reopen 時にリセットすることで、古いサイクルの信号を無視する
 * (詳細はコンポーネント本体の `awaitingDismissRef` のコメントを参照)。
 */
const IOS_DISMISS_FAILSAFE_MS = 1000;

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
  /**
   * ネイティブ `<Modal>` が実際に dismiss を完了した (= シートのスライドアウトに加えて、
   * ネイティブモーダル自体の提示も完全に終わった) タイミングで呼ばれる。呼び出し元が
   * 「このモーダルが完全に閉じてから次のネイティブモーダルを開く」順序制御に使う
   * (タグ選択モーダル→タグ管理モーダルの二重マウント競合の修正で導入。詳細は
   * コンポーネント本体のコメントを参照)。
   * - 初回マウント時 (visible が最初から false) には発火しない。
   * - 閉じアニメーション中 (ネイティブ dismiss 完了待ちを含む) に再度開かれた場合、
   *   その reopen 直後に古いクローズサイクルの完了信号 (`onDismiss`/フェイルセーフ) が
   *   届いても無視される (close→reopen の2連続は保護されている)。
   *   ただし **close→reopen→close のように3回以上連続で操作された場合は保護できない**:
   *   RN の `<Modal onDismiss>` は発生源を識別する情報を一切運ばない空のイベントのため
   *   (`Modal.js` の `onDismiss` ラッパーは引数を取らず、ネイティブ側の `OnDismiss{}` も
   *   フィールドを持たない)、JS 側で保持できるのは「今どれか1つのクローズサイクルを
   *   待機中か」という1ビットの情報のみで、複数の未完了サイクルを区別できない。
   *   このため一番古いクローズサイクルの完了信号を最新のクローズサイクルのものと
   *   誤って消化し、`onClosed` が本来より早いタイミングで (ただし高々1回) 発火する
   *   ことがある。発生には数百ms以内の3回連続操作が必要な限定的なケースであり、
   *   今回のスプリントでは対応していない (根本対応には、未完了の dismiss がある間は
   *   reopen 自体をキューイングする状態機械の再設計が必要)。
   * - 1回のクローズサイクルにつき高々1回しか発火しない (フェイルセーフと本物の
   *   `onDismiss` が両方届いても二重発火しない)。
   */
  onClosed?: () => void;
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
 * ## 閉じる処理は3段階 (Reviewer 指摘により、ネイティブ dismiss の完了信号ベースに修正済み)
 *
 * 1. `visible=false` → シートだけを即座にスライドアウトさせる (`translateY` アニメーション、
 *    SLIDE_DURATION ms)。この間、内部の `<Modal>` 自体はまだ `visible` を落とさず表示した
 *    ままにする (見た目を変えないため必須。ここで Modal 自体を先に消すとスライドアウトの
 *    見た目が破綻する)。
 * 2. SLIDE_DURATION ms 経過 → ここで初めて内部 `<Modal>` の `visible` prop を `false` にし、
 *    ネイティブの dismiss (iOS では `dismissViewControllerAnimated:`) を開始させる。
 * 3. 実際に閉じ終わった通知 (`onClosed` の発火 + マウント解除):
 *    - iOS: `<Modal onDismiss>` (`dismissViewController:completion:` の completion ブロックで
 *      発火する、ネイティブの本物の完了信号。`RCTModalHostViewComponentView.mm` で確認済み)
 *      を待って初めて確定させる。
 *    - Android/その他: RN の `<Modal>` の `onDismiss` は iOS 専用で発火しないため、
 *      `visible` を落とした直後を「閉じ終わった」とみなす (Android には iOS のような
 *      「次のモーダル提示が単一の presentedViewController と競合する」制約が無いため安全)。
 *
 * (旧実装は `setIsMounted(false)` を SLIDE_DURATION 後の setTimeout だけで行い、内部
 * `<Modal>` の `visible` は常に固定 `true` にしていた。この場合、ネイティブの dismiss が
 * まだ「開始すらしていない」段階で `onClosed` を呼んでしまい、呼び出し元がそれを起点に
 * 次のネイティブモーダルを提示すると iOS 側の提示が失敗する — 元バグの猶予を 100ms から
 * 0ms に縮めただけで、根本原因は直っていなかった)。
 *
 * iOS のフェイルセーフ (`IOS_DISMISS_FAILSAFE_MS`) について: `onDismiss` が何らかの理由で
 * 届かないと、シートが永久にアンマウントされず `onClosed` も呼ばれなくなり、呼び出し元の
 * 次のモーダルが二度と開かなくなる (元のバグより悪化する)。そのため一定時間後に強制的に
 * 「閉じ終わった」ものとして扱う保険を入れている。これは主たる同期手段ではなく異常系の
 * 保険であり、Sprint Contract が禁止する固定 setTimeout 待ちとは意図が異なる。
 *
 * ## この待機窓 (2→3) 自体が生む競合と、その対策 (Reviewer 指摘の第2 Critical)
 *
 * 2 で `setModalVisible(false)` した後、3 の完了信号 (`onDismiss` またはフェイルセーフ) が
 * 実際に届くまでの間に `visible` が再び `true` になる (reopen) ことがある。ネイティブの
 * `dismissViewControllerAnimated:` は一度開始すると JS からキャンセルできないため、この
 * reopen より後に「reopen 前のクローズサイクルの」`onDismiss` やフェイルセーフが遅れて
 * 届く可能性がある。これを無条件に `finishClosing()` へ直結させると、reopen 後に
 * 開き直したばかりのシートを誤って `isMounted=false` にして消してしまい、さらに
 * `onClosed` まで誤発火する。
 *
 * 対策として `awaitingDismissRef` で「今の完了信号が現在進行中のクローズサイクルに
 * 属するか」を判定する:
 * - クローズ経路で `setModalVisible(false)` した直後に `true` にする
 * - 開く分岐 (`visible=true`) で `false` にリセットする (reopen が起きた=もう有効でない)
 * - `handleNativeDismiss` とフェイルセーフのどちらも、`false` なら何もせず return する
 *
 * 加えて `closeShouldNotifyRef` は `finishClosing()` 内で消費後に `false` へリセットする
 * (フェイルセーフと本物の `onDismiss` が両方届いても `onClosed` が2回発火しないように)。
 */
export const SlideUpModal: React.FC<SlideUpModalProps> = ({
  visible,
  onClose,
  onBackdropPress,
  backdropAccessibilityLabel,
  children,
  sheetStyle,
  overlayColor = "rgba(0, 0, 0, 0.5)",
  onClosed,
}) => {
  // Modal 自体は「表示中」+「閉じ処理中 (スライドアウト+ネイティブ dismiss 待ち)」の間だけマウントする。
  const [isMounted, setIsMounted] = useState(visible);
  // 内部の <Modal> に実際に渡す visible。閉じるときだけ isMounted より遅れて false になる
  // (スライドアウトのアニメーションが終わるまではネイティブ Modal 自体を残す必要があるため)。
  const [modalVisible, setModalVisible] = useState(visible);
  const [translateY] = useState(
    () => new Animated.Value(visible ? 0 : getOffscreenTranslateY()),
  );
  // 「1. スライドアウト完了 → 2. ネイティブ Modal の visible を落とす」を SLIDE_DURATION 後に行うタイマー。
  const slideOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // iOS 専用: onDismiss が届かなかった場合のフェイルセーフタイマー。
  const dismissFailsafeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 直前の visible を追跡し、「一度も表示されていない (= 閉じてすらいない)」初回マウントで
  // onClosed が誤発火しないようにする。
  const wasVisibleRef = useRef(visible);
  // 現在進行中のクローズサイクルで onClosed を呼ぶべきか (= 空振りのクローズ処理ではなく、
  // 実際に visible=true だった状態からの close であるか)。onDismiss ハンドラからも
  // 参照するため ref で保持する。finishClosing() が消費後に false へリセットするため、
  // フェイルセーフと本物の onDismiss が両方届いても onClosed は高々1回しか発火しない。
  const closeShouldNotifyRef = useRef(false);
  // 「今保留中の完了信号 (onDismiss / フェイルセーフ) が、現在進行中のクローズサイクルに
  // 属するか」を判定するフラグ。setModalVisible(false) でネイティブ dismiss を開始させた
  // 直後に true にし、開く分岐 (reopen) で false にリセットする。ネイティブの
  // dismissViewControllerAnimated: は JS から途中キャンセルできないため、reopen 後に
  // 「reopen 前のクローズサイクルの」onDismiss/フェイルセーフが遅れて届くことがあり、
  // これを無視するためのガードとして使う (Reviewer 指摘の Critical: reopen 直後に stale な
  // onDismiss が開き直したばかりのシートを消してしまう問題への対策)。
  const awaitingDismissRef = useRef(false);
  // onClosed 自体は ref 経由で参照し、下の effect の依存配列に含めない (呼び出し側が
  // 毎レンダー新しい関数を渡しても、開いている最中のシートが再アニメーションし直される
  // のを防ぐため)。
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  // 「閉じ終わった」の確定処理。Android/Web は visible=false 直後に、iOS は本物の
  // onDismiss (またはフェイルセーフ) から呼ばれる。呼ばれた時点でこのクローズサイクルは
  // 完全に終わるため、両方のフラグをここで消費・リセットする
  // (awaitingDismissRef を false に戻すことで、万一この後にもう一度同じサイクルの
  // 信号が届いても handleNativeDismiss 側のガードで無視される)。
  const finishClosing = () => {
    awaitingDismissRef.current = false;
    setIsMounted(false);
    const shouldNotify = closeShouldNotifyRef.current;
    closeShouldNotifyRef.current = false;
    if (shouldNotify) {
      onClosedRef.current?.();
    }
  };

  // iOS 専用: ネイティブモーダルの dismiss が完全に完了した通知 (Android では発火しない)。
  const handleNativeDismiss = () => {
    // reopen 後に届いた stale な onDismiss (現在のクローズサイクルに属さない) は無視する。
    if (!awaitingDismissRef.current) return;
    if (dismissFailsafeTimeoutRef.current) {
      clearTimeout(dismissFailsafeTimeoutRef.current);
      dismissFailsafeTimeoutRef.current = null;
    }
    finishClosing();
  };

  useEffect(() => {
    if (slideOutTimeoutRef.current) {
      clearTimeout(slideOutTimeoutRef.current);
      slideOutTimeoutRef.current = null;
    }
    if (dismissFailsafeTimeoutRef.current) {
      clearTimeout(dismissFailsafeTimeoutRef.current);
      dismissFailsafeTimeoutRef.current = null;
    }

    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible) {
      // reopen: 進行中だったクローズサイクル (もしあれば) を無効化する。ネイティブの
      // dismiss 自体は JS から止められないが、後から届く onDismiss/フェイルセーフを
      // 「もう有効でない」と判定できるようにする (上の awaitingDismissRef のコメント参照)。
      awaitingDismissRef.current = false;
      closeShouldNotifyRef.current = false;

      setIsMounted(true);
      setModalVisible(true);
      translateY.setValue(getOffscreenTranslateY());
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      closeShouldNotifyRef.current = wasVisible;
      Animated.timing(translateY, {
        toValue: getOffscreenTranslateY(),
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start();
      // 1. シートだけを即座にスライドアウトさせる。ネイティブ <Modal> の visible は
      //    まだ落とさない (見た目を変えないため)。
      slideOutTimeoutRef.current = setTimeout(() => {
        slideOutTimeoutRef.current = null;
        // 2. スライドアウト完了。ここで初めてネイティブ <Modal> の visible を落とし、
        //    実際のネイティブ dismiss を開始させる。このクローズサイクルの完了信号を
        //    待ち始めたことを記録する。
        setModalVisible(false);
        awaitingDismissRef.current = true;

        if (Platform.OS === "ios") {
          // 3. iOS: 本物の完了信号 (onDismiss) を待つ。ここでは isMounted も onClosed も
          //    まだ確定させない。
          dismissFailsafeTimeoutRef.current = setTimeout(() => {
            dismissFailsafeTimeoutRef.current = null;
            // reopen によってこのクローズサイクルが既に無効化されていれば何もしない。
            if (!awaitingDismissRef.current) return;
            finishClosing();
          }, IOS_DISMISS_FAILSAFE_MS);
        } else {
          // 3. Android/Web: <Modal> の onDismiss は発火しないため、visible を落とした
          //    直後を「閉じ終わった」とみなす。
          finishClosing();
        }
      }, SLIDE_DURATION);
    }

    return () => {
      if (slideOutTimeoutRef.current) {
        clearTimeout(slideOutTimeoutRef.current);
        slideOutTimeoutRef.current = null;
      }
      if (dismissFailsafeTimeoutRef.current) {
        clearTimeout(dismissFailsafeTimeoutRef.current);
        dismissFailsafeTimeoutRef.current = null;
      }
    };
  }, [visible, translateY]);

  if (!isMounted) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={handleNativeDismiss}
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
