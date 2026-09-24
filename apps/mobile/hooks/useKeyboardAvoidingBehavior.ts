import { Platform, PixelRatio } from "react-native";
import { useSafeInsets } from "@/hooks/useSafeInsets";

/**
 * iOS ネイティブヘッダー (headerLargeTitle 無効のコンパクト形態、非モーダル提示) の高さ。
 * `@react-navigation/native-stack` の内部実装 (`@react-navigation/elements` の
 * `getDefaultHeaderHeight`) と同じ値 (iPhone: 44pt / iPad: 50pt)。
 *
 * 本アプリは `orientation: "portrait"` 固定 (app.json) のため landscape 分岐は考慮しない。
 * `@react-navigation/elements` を直接 import しない理由は `useKeyboardAvoidingBehavior` の
 * JSDoc を参照。
 */
const IOS_COMPACT_HEADER_HEIGHT = 44;
const IOS_COMPACT_HEADER_HEIGHT_PAD = 50;

/**
 * Dynamic Island 搭載機 (iPhone 14 Pro 以降) ではノッチ機種と異なり、safe area top inset が
 * 実際のステータスバー高さより大きい (Dynamic Island のセンサーハウジング分を含むため)。
 * react-navigation の `getDefaultHeaderHeight`
 * (`@react-navigation/elements/src/Header/getDefaultHeaderHeight.tsx`) はこれを
 * `topInset > 50` で検出し、`topInset - (5 + 1 / PixelRatio.get())` で実際のステータスバー
 * 高さに補正してからヘッダー高さに加算している。ここで同じ補正をしないと、
 * Dynamic Island 機で `keyboardVerticalOffset` が約5.3pt 過大になり、フッターとキーボードの
 * 間に余分な空白が残る (機能は壊れないが react-navigation の実際の計算と一致しない)。
 */
function getIOSStatusBarHeight(topInset: number): number {
  const hasDynamicIsland = topInset > 50;
  return hasDynamicIsland ? topInset - (5 + 1 / PixelRatio.get()) : topInset;
}

export interface KeyboardAvoidingBehaviorConfig {
  behavior: "padding" | undefined;
  keyboardVerticalOffset: number;
}

/**
 * KeyboardAvoidingView の `behavior` / `keyboardVerticalOffset` を決定する唯一の定義元。
 *
 * ## 診断結果 (PracticeTabFormScreen 他、根本原因)
 *
 * このアプリのフォーム画面は `MainStack` (native-stack) で `headerShown: true` の
 * ネイティブヘッダー付きで push される。RN の `KeyboardAvoidingView`
 * (`behavior="padding"`) は `onLayout` で得た自身のフレーム座標 (immediate parent 基準の
 * ローカル座標。native-stack の画面コンテンツ領域はネイティブヘッダーの下から始まるため
 * ローカル原点 (0,0) は画面上端ではなくヘッダー下端になる) と、キーボードの `screenY`
 * (画面全体基準の絶対座標) を突き合わせて paddingBottom を計算する
 * (`react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js` の
 * `_relativeKeyboardHeight`: `frame.y + frame.height - (keyboardFrame.screenY -
 * keyboardVerticalOffset)`)。`keyboardVerticalOffset` を渡さない場合、この計算は
 * ネイティブヘッダーの高さぶんだけ paddingBottom を過小評価し続けるため、画面最下部の
 * フッター (「前に戻る」「保存して終了」等) がちょうどヘッダー高さぶんキーボードに
 * 隠れたままになる。
 *
 * react-navigation 公式のヘッダー付き画面向け回避策は `@react-navigation/elements` の
 * `useHeaderHeight()` だが、そのパッケージのバレル import (`./lib/module/index.js`) は
 * 内部で戻るボタンの `.png` アセットを静的 import しており、本リポジトリの vitest
 * (jsdom + Node ESM ローダー) 環境では `Unknown file extension ".png"` でモジュール解決
 * 自体が失敗することを実測済み。既存の16フォーム画面テスト + モーダルテストが道連れで
 * 壊れるため採用しない。代わりに `IOS_COMPACT_HEADER_HEIGHT(_PAD)` を直接計算する。
 *
 * ## Android
 *
 * Sprint #31 (2026-07-18) で確定した方針 (`behavior=undefined` で
 * `AndroidManifest.xml` の `windowSoftInputMode(adjustResize)` に委譲、Hermes 環境の
 * 高さ計算ズレ回避) を維持する。ここでは変更しない。
 *
 * @param hasNativeHeader この KeyboardAvoidingView がネイティブヘッダー
 * (`headerShown: true` な画面) の直下にあるか。`<Modal>` 配下 (CenterModal/SlideUpModal
 * 等、独立したネイティブウィンドウでヘッダーを持たない) では false を渡すこと。既定 true。
 */
export function useKeyboardAvoidingBehavior(
  hasNativeHeader: boolean = true,
): KeyboardAvoidingBehaviorConfig {
  const insets = useSafeInsets();

  if (Platform.OS !== "ios") {
    return { behavior: undefined, keyboardVerticalOffset: 0 };
  }

  if (!hasNativeHeader) {
    return { behavior: "padding", keyboardVerticalOffset: 0 };
  }

  const headerHeight =
    (Platform.isPad ? IOS_COMPACT_HEADER_HEIGHT_PAD : IOS_COMPACT_HEADER_HEIGHT) +
    getIOSStatusBarHeight(insets.top);

  return { behavior: "padding", keyboardVerticalOffset: headerHeight };
}
