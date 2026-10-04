import { useWindowDimensions } from "react-native";
import { useSafeInsets } from "@/hooks/useSafeInsets";

/** CenterModal のオーバーレイ padding (上下20ずつ) */
const OVERLAY_VERTICAL_PADDING = 40;

/**
 * CenterModal のカードをシステムバー (ステータスバー・3ボタンナビ) の裏に潜らせない最大高さ。
 * RN Modal は edge-to-edge の Android でも insets を自動回避しないため、自分で差し引く。
 */
export function useCenterModalMaxHeight(): number {
  const { height } = useWindowDimensions();
  const insets = useSafeInsets();
  return height - insets.top - insets.bottom - OVERLAY_VERTICAL_PADDING;
}
