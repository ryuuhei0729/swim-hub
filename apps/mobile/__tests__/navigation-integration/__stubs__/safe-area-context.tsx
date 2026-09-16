// react-native-safe-area-context の最小スタブ (jsdom 用)。
// 実体は .tsx ソース配布で node_modules 内の変換が必要になるため、
// インセット値だけを提供する薄いスタブに差し替える。
import React from "react";

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 750, height: 1334 };

export const SafeAreaProvider = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
export const SafeAreaView = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
export const SafeAreaInsetsContext = React.createContext(insets);
export const SafeAreaFrameContext = React.createContext(frame);
export const useSafeAreaInsets = () => insets;
export const useSafeAreaFrame = () => frame;
export const initialWindowMetrics = { insets, frame };
export const withSafeAreaInsets = <P,>(C: React.ComponentType<P>) => C;
