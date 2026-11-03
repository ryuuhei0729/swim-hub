"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toStyleCode } from "@apps/shared/utils/swimStyles";
import { buildSwimStyleLabel, nameJpToCodeKey, styleIdToCodeKey } from "@/utils/swimStyle";

interface StyleLike {
  id?: number | null;
  style?: string | null;
  name_jp?: string | null;
  distance?: number | null;
}

/**
 * 種目 (styles の行) を現在のロケールの「距離 + 泳法名」にする関数を返す。
 * ja: "100m自由形", en: "100m Freestyle"。
 * DB の name_jp を直接出すと全ロケールで日本語になるため、表示はこれを通す
 * (mobile の localizedStyleName に相当)。泳法・距離を特定できなければ name_jp をそのまま返す。
 */
export function useStyleLabel(): (style: StyleLike | null | undefined) => string | null {
  const locale = useLocale();
  const tStyles = useTranslations("practice.styles");

  return useCallback(
    (style) => {
      if (!style) return null;
      const code =
        (style.style ? toStyleCode(style.style) : null) ??
        (style.id != null ? styleIdToCodeKey(style.id) : null) ??
        (style.name_jp ? nameJpToCodeKey(style.name_jp) : null);
      // 一覧 (useGoalsQuery) の style は name_jp だけなので、距離は "100m自由形" の先頭から読む
      const distance =
        typeof style.distance === "number"
          ? style.distance
          : Number(style.name_jp?.match(/^(\d+)m/)?.[1] ?? NaN);
      if (!code || !Number.isFinite(distance)) return style.name_jp ?? null;
      return buildSwimStyleLabel(distance, tStyles(code), locale);
    },
    [locale, tStyles],
  );
}
