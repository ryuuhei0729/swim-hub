// =============================================================================
// React Native 静的モック - Vitest用
// =============================================================================

import React from "react";
import { vi } from "vitest";

// React Nativeコンポーネントのモック
export const View = ({
  children,
  style,
  pointerEvents,
  ...props
}: { children?: React.ReactNode; style?: unknown; pointerEvents?: string } & Record<
  string,
  unknown
>) => {
  // styleプロップを処理（配列の場合はマージ）
  const processedStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  // 実機 RN の pointerEvents="none" は、この View 自身と配下をタッチ判定から除外する
  // (タッチはこの要素の背後にあるものへ素通りする)。jsdom の DOM には「タッチ判定」の
  // 概念自体が無く、pointerEvents を素通しの DOM 属性として描画するだけでは
  // fireEvent.click が素通りせず子要素のハンドラをそのまま発火させてしまう
  // (実機と異なる=モックの嘘)。capture フェーズで stopPropagation することで、
  // このサブツリー配下のクリックハンドラにイベントが到達しないようにし、実機の
  // 「タップが素通りする」挙動を模す ("box-none"/"box-only" は対象外。RN の意味論上
  // 対象コンポーネント自身のみ/子要素のみをタッチ対象から除外する複合的な挙動であり、
  // 本モックでは単純な最頻出ケース "none" のみを扱う)。
  const pointerEventsCaptureProps =
    pointerEvents === "none" ? { onClickCapture: (e: { stopPropagation?: () => void }) => e.stopPropagation?.() } : {};
  return React.createElement(
    "div",
    { ...props, style: processedStyle, pointerEvents, ...pointerEventsCaptureProps },
    children,
  );
};

export const Text = ({
  children,
  style,
  numberOfLines: _numberOfLines,
  ...props
}: { children?: React.ReactNode; style?: unknown; numberOfLines?: number } & Record<
  string,
  unknown
>) => {
  // styleプロップを処理（配列の場合はマージ）
  const processedStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  // numberOfLinesはDOM要素では無視（React Native専用プロップ）
  // DOM要素ではCSSのline-clampを使用するが、テストでは無視してOK
  return React.createElement("span", { ...props, style: processedStyle }, children);
};

export const Pressable = ({
  children,
  onPress,
  style,
  ...props
}: { children?: React.ReactNode; onPress?: (event?: unknown) => void; style?: unknown } & Record<
  string,
  unknown
>) => {
  // styleプロップを処理（関数の場合は実行結果を使用）
  let processedStyle = style;
  if (typeof style === "function") {
    processedStyle = style({ pressed: false });
  } else if (Array.isArray(style)) {
    processedStyle = Object.assign({}, ...style.filter(Boolean));
  }
  return React.createElement(
    "button",
    {
      ...props,
      style: processedStyle,
      // 実機 RN のレスポンダシステムは「最も深いタッチ対象」がタッチを専有し、
      // 親の Pressable へバブリングしない (jsdom の DOM click イベントは既定でバブリングする
      // ため、これまでは Pressable のネストが実機と異なる挙動を示していた=モックの嘘)。
      // ここで stopPropagation() してから onPress へイベントを転送することで、
      // 実機同様「最も内側の Pressable だけが反応する」挙動を再現する。
      // 転送を忘れるとイベント引数に依存するプロダクションコード
      // (例: PracticeLogDetail.tsx の `onPress={(e) => { e.stopPropagation(); ... }}`)
      // が `e` を受け取れず壊れるため、必ず `onPress(e)` の形で転送すること。
      onClick: (event: unknown) => {
        (event as { stopPropagation?: () => void })?.stopPropagation?.();
        onPress?.(event);
      },
    },
    children,
  );
};

export const ScrollView = ({
  children,
  ...props
}: { children?: React.ReactNode } & Record<string, unknown>) =>
  React.createElement("div", { ...props, style: { overflow: "auto" } }, children);

// KeyboardAvoidingView API
// behavior/keyboardVerticalOffset は DOM に反映しても意味を持たないため、
// Switch の data-value と同じ流儀で data 属性として素通しし、テストから検証できるようにする。
export const KeyboardAvoidingView = ({
  children,
  style,
  behavior,
  keyboardVerticalOffset,
  ...props
}: {
  children?: React.ReactNode;
  style?: unknown;
  behavior?: string;
  keyboardVerticalOffset?: number;
} & Record<string, unknown>) => {
  const processedStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  return React.createElement(
    "div",
    {
      ...props,
      style: processedStyle,
      "data-behavior": behavior,
      "data-keyboard-vertical-offset": keyboardVerticalOffset,
    },
    children,
  );
};

export const FlatList = ({
  data,
  renderItem,
  keyExtractor,
  ...props
}: {
  data?: unknown[];
  renderItem?: ({ item, index }: { item: unknown; index: number }) => React.ReactNode;
  keyExtractor?: (item: unknown, index: number) => string | number;
  children?: React.ReactNode;
} & Record<string, unknown>) => {
  const items = data?.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : index;
    return renderItem ? React.createElement("div", { key }, renderItem({ item, index })) : null;
  });
  return React.createElement("div", props, items);
};

export const ActivityIndicator = ({ ...props }: Record<string, unknown>) =>
  React.createElement("div", props, "Loading...");

export const RefreshControl = ({ ...props }: Record<string, unknown>) =>
  React.createElement("div", props);

export const Image = ({
  source,
  ...props
}: { source?: { uri?: string } | string } & Record<string, unknown>) => {
  const src = typeof source === "string" ? source : source?.uri;
  return React.createElement("img", { ...props, src });
};

// testID は RN 側のプロップ名なので、そのまま spread すると DOM 属性 `testid` になり
// testing-library の getByTestId (既定で data-testid を見る) から引けない。
// TextInput だけ data-testid に変換する。
//
// 【重要】この変換を View / Pressable / Text にも広げてはいけない。
// それらには testID 付きの本番要素が既に多数あり、`queryByTestId(...).toBeNull()` を
// 期待する既存テスト (PracticeTabFormScreen.practiceScopeRowWipe / CompetitionTabFormScreen 等)
// が「見つからないから null」で通っている。変換を広げると要素が見つかるようになり、
// それらが一斉に赤くなる (= 現状それらのアサーションは空振りしている、という別課題)。
export const TextInput = ({ testID, ...props }: Record<string, unknown>) =>
  React.createElement("input", {
    type: "text",
    ...props,
    ...(typeof testID === "string" ? { "data-testid": testID } : {}),
  });

// Switch API
// value/onValueChange のみを DOM の button + data 属性で観察可能にする。
// AdminViewToggle.test.tsx は既にファイルローカルで同等のモックを定義しているため、
// そちらは vi.mock の巻き上げにより本モックを上書きし続ける（衝突なし）。
export const Switch = ({
  value,
  onValueChange,
  accessibilityRole,
  accessibilityLabel,
  trackColor,
  thumbColor,
  disabled,
  ...props
}: {
  value?: boolean;
  onValueChange?: (next: boolean) => void;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  trackColor?: { false: string; true: string };
  thumbColor?: string;
  disabled?: boolean;
} & Record<string, unknown>) =>
  React.createElement("button", {
    ...props,
    role: accessibilityRole,
    "aria-label": accessibilityLabel,
    "data-value": String(value),
    "data-track-color": trackColor ? JSON.stringify(trackColor) : undefined,
    "data-thumb-color": thumbColor,
    disabled,
    onClick: () => onValueChange?.(!value),
  });

// Modal 同時マウント検出レジストリ
// ネイティブの <Modal> はそれぞれ独立したウィンドウ (iOS では UIViewController の
// モーダル提示) を持つため、2つの <Modal> の「表示中」区間が重なると実機では
// 提示が壊れる (例: SlideUpModal ベースの TagSelectModal がまだ閉じアニメーション中に
// TagManageModal を提示しようとして失敗する不具合)。jsdom は複数ウィンドウの提示競合を
// 再現できないため、代わりに「visible=true として実際に描画されている区間」を
// mount/unmount イベントとして記録し、テスト側で区間の重なり・順序を検証できるようにする。
// (このレジストリを参照しない既存テストの挙動には一切影響しない = 後方互換)
export interface ModalMountEvent {
  seq: number;
  type: "mount" | "unmount";
  id: string;
  props: Record<string, unknown>;
}

let modalMountEventSeq = 0;

export const __modalMountRegistry: {
  mounted: Map<string, Record<string, unknown>>;
  events: ModalMountEvent[];
} = { mounted: new Map(), events: [] };

/** テストの beforeEach 等で呼び出し、前のテストの記録を持ち越さないようにする。 */
export function __resetModalMountRegistry(): void {
  __modalMountRegistry.mounted.clear();
  __modalMountRegistry.events = [];
  modalMountEventSeq = 0;
}

// Modal API
// React Native の <Modal visible> は visible=false のとき内容を描画しない。
// テストではこの挙動を再現し、visible=true のときのみ children を描画する。
// 加えて、visible=true になっている区間を __modalMountRegistry に記録する
// (props は登録用の分類にのみ使う。DOM への反映は従来どおり素通し)。
export const Modal = ({
  children,
  visible = true,
  ...props
}: { children?: React.ReactNode; visible?: boolean } & Record<string, unknown>) => {
  const id = React.useId();
  const propsRef = React.useRef(props);
  propsRef.current = props;

  React.useEffect(() => {
    if (!visible) return undefined;
    __modalMountRegistry.mounted.set(id, propsRef.current);
    __modalMountRegistry.events.push({
      seq: ++modalMountEventSeq,
      type: "mount",
      id,
      props: propsRef.current,
    });
    return () => {
      __modalMountRegistry.mounted.delete(id);
      __modalMountRegistry.events.push({
        seq: ++modalMountEventSeq,
        type: "unmount",
        id,
        props: propsRef.current,
      });
    };
  }, [visible, id]);

  if (!visible) return null;
  return React.createElement("div", props, children);
};

// Animated API
// transform: [{ translateY: AnimatedValue }] のような RN 固有のスタイルは DOM に渡せないため
// Animated.View では transform を落として描画する。
class AnimatedValue {
  _value: number;
  constructor(value: number) {
    this._value = value;
  }
  setValue(value: number) {
    this._value = value;
  }
  getValue() {
    return this._value;
  }
}

const AnimatedView = ({
  children,
  style,
  ...props
}: { children?: React.ReactNode; style?: unknown } & Record<string, unknown>) => {
  const flattened = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : ((style ?? {}) as Record<string, unknown>);
  const { transform: _transform, ...domStyle } = flattened as Record<string, unknown>;
  return React.createElement("div", { ...props, style: domStyle }, children);
};

export const Animated = {
  View: AnimatedView,
  Value: AnimatedValue,
  spring: (_value: unknown, _config: unknown) => ({ start: vi.fn(), stop: vi.fn() }),
  timing: (_value: unknown, _config: unknown) => ({ start: vi.fn(), stop: vi.fn() }),
};

// PanResponder API
// パンハンドラは DOM イベントに対応付けられないため空オブジェクトを返す。
// 生成時の設定は `__config` として公開し、テストからジェスチャーを直接駆動できるようにする。
export interface MockPanResponderConfig {
  onStartShouldSetPanResponder?: (...args: unknown[]) => boolean;
  onMoveShouldSetPanResponder?: (event: unknown, gesture: MockGestureState) => boolean;
  onPanResponderMove?: (event: unknown, gesture: MockGestureState) => void;
  onPanResponderRelease?: (event: unknown, gesture: MockGestureState) => void;
  onPanResponderTerminate?: (event: unknown, gesture: MockGestureState) => void;
}

export interface MockGestureState {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
}

export const PanResponder = {
  create: (config: MockPanResponderConfig) => ({
    panHandlers: {},
    __config: config,
  }),
};

// StyleSheet API
// React NativeのStyleSheetは数値や文字列のスタイルを返すが、
// DOM要素ではオブジェクト形式が必要なため、変換を行う
export const StyleSheet = {
  create: <T extends Record<string, Record<string, unknown>>>(styles: T): T => {
    // スタイルオブジェクトをそのまま返す（DOM要素でも動作するように）
    const result: Record<string, Record<string, unknown>> = {};
    Object.keys(styles).forEach((key) => {
      const style = styles[key]!; // key は Object.keys(styles) から得た既存キーなので必ず存在
      if (typeof style === "object" && style !== null) {
        // ネストされたスタイルオブジェクトをフラット化
        result[key] = { ...style };
      } else {
        result[key] = style;
      }
    });
    return result as T;
  },
  flatten: <T>(style: T): T => {
    // スタイルをフラット化（DOM要素用に変換）
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.filter(Boolean)) as T;
    }
    return style;
  },
  absoluteFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  absoluteFillObject: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hairlineWidth: 1,
};

// Platform API
export const Platform = {
  OS: "web" as const,
  select: <T>(obj: { web?: T; default?: T }): T | undefined => obj.web ?? obj.default,
};

// PixelRatio API (useKeyboardAvoidingBehavior の Dynamic Island 補正計算が参照する)
export const PixelRatio = {
  get: () => 3,
};

// Alert API
export const Alert = {
  alert: vi.fn(),
  prompt: vi.fn(),
};

// AppState (@tanstack/react-query focusManager 等が参照)
export const AppState = {
  currentState: "active" as const,
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  removeEventListener: vi.fn(),
};

// デフォルトエクスポート（React Nativeのデフォルトエクスポートパターンに対応）
const ReactNative = {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Switch,
  StyleSheet,
  Platform,
  PixelRatio,
  Alert,
  AppState,
  Animated,
  PanResponder,
};

export default ReactNative;
