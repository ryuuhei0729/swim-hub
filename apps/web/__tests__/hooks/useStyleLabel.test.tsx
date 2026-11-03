import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const locale = vi.hoisted(() => ({ value: "en" }));
vi.mock("next-intl", () => ({
  useLocale: () => locale.value,
  useTranslations: () => (key: string) =>
    ({ Fr: locale.value === "ja" ? "自由形" : "Freestyle", Br: locale.value === "ja" ? "平泳ぎ" : "Breaststroke" })[key] ?? key,
}));

import { useStyleLabel } from "@/hooks/useStyleLabel";

describe("useStyleLabel", () => {
  it("styles の行 (style コード・距離あり) をロケールの泳法名で組み立てる", () => {
    locale.value = "en";
    const { result } = renderHook(() => useStyleLabel());
    expect(result.current({ id: 2, style: "fr", distance: 100, name_jp: "100m自由形" })).toBe("100m Freestyle");
  });

  it("name_jp だけの style (目標一覧) でも距離・泳法を読み取って翻訳する", () => {
    locale.value = "en";
    const { result } = renderHook(() => useStyleLabel());
    expect(result.current({ name_jp: "100m平泳ぎ" })).toBe("100m Breaststroke");
  });

  it("ja は距離と泳法名を詰めて出す", () => {
    locale.value = "ja";
    const { result } = renderHook(() => useStyleLabel());
    expect(result.current({ name_jp: "50m自由形" })).toBe("50m自由形");
  });

  it("泳法・距離を特定できなければ name_jp のまま、style が無ければ null", () => {
    locale.value = "en";
    const { result } = renderHook(() => useStyleLabel());
    expect(result.current({ name_jp: "リレー" })).toBe("リレー");
    expect(result.current(undefined)).toBeNull();
  });
});
