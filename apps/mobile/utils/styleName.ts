// =============================================================================
// 種目名のロケール対応ヘルパー
// =============================================================================
// DB の Style.name_jp は「50m 自由形」のように距離を含むことに注意。
// ja では「50m 自由形」を、en では「50m Fr」(公式略称) を返す。

import type { TFunction } from "i18next";

type StyleAbbrev = "Fr" | "Ba" | "Br" | "Fly" | "IM";

const CODE_TO_ABBREV: Record<string, StyleAbbrev> = {
  fr: "Fr",
  ba: "Ba",
  br: "Br",
  fly: "Fly",
  im: "IM",
};

const JP_PART_TO_ABBREV: Record<string, StyleAbbrev> = {
  自由形: "Fr",
  背泳ぎ: "Ba",
  平泳ぎ: "Br",
  バタフライ: "Fly",
  個人メドレー: "IM",
};

/**
 * 種目の日本語名 → practice.styleAbbrev.* 翻訳キーのマッピング。
 * BestTimesTable のヘッダー表示で t(`practice.styleAbbrev.${STYLE_KEY_MAP[style]}`) に使う。
 * DB 照合キー (STYLES 配列の日本語値) は変更しないこと。
 */
export const STYLE_KEY_MAP: Record<string, StyleAbbrev> = JP_PART_TO_ABBREV;

export interface StyleLike {
  style?: string | null;
  name_jp?: string | null;
  name?: string | null;
  distance?: number | null;
}

interface ParsedStyleString {
  distance: number;
  abbrev: StyleAbbrev;
  /** "50m_自由形" のような距離と種目の間の区切り (空文字や " ") */
  separator: string;
}

function parseStyleString(s: string): ParsedStyleString | null {
  const match = s.match(/^(\d+)m(\s*)(.+)$/);
  if (!match) return null;
  const distance = Number(match[1]);
  const separator = match[2];
  const jpPart = match[3].trim();
  const abbrev = JP_PART_TO_ABBREV[jpPart];
  return abbrev ? { distance, abbrev, separator } : null;
}

function styleAbbrevOf(input: StyleLike): StyleAbbrev | undefined {
  if (input.style) {
    const a = CODE_TO_ABBREV[input.style.toLowerCase()];
    if (a) return a;
  }
  if (input.name_jp) {
    const parsed = parseStyleString(input.name_jp);
    if (parsed) return parsed.abbrev;
    const direct = JP_PART_TO_ABBREV[input.name_jp];
    if (direct) return direct;
  }
  return undefined;
}

/**
 * Style オブジェクト・文字列のいずれを与えても、現在のロケールに合わせた
 * 種目名を返す。`50m 自由形` のような距離付き文字列はロケール側でも
 * `50m Fr` の形で返す。解決できない場合は入力をそのまま返す。
 */
export function localizedStyleName(
  input: StyleLike | string | null | undefined,
  t: TFunction,
): string {
  if (input == null) return "";

  if (typeof input === "string") {
    const parsed = parseStyleString(input);
    if (parsed) {
      return `${parsed.distance}m${parsed.separator}${t(`practice.styleAbbrev.${parsed.abbrev}`)}`;
    }
    const direct = JP_PART_TO_ABBREV[input] ?? CODE_TO_ABBREV[input.toLowerCase()];
    return direct ? t(`practice.styleAbbrev.${direct}`) : input;
  }

  const abbrev = styleAbbrevOf(input);
  if (!abbrev) return input.name_jp ?? input.name ?? "";

  // 距離付きの name_jp ("50m 自由形" 等) があればその区切り方を保持する。
  if (input.name_jp) {
    const parsed = parseStyleString(input.name_jp);
    if (parsed) {
      return `${parsed.distance}m${parsed.separator}${t(`practice.styleAbbrev.${abbrev}`)}`;
    }
  }

  const stylePart = t(`practice.styleAbbrev.${abbrev}`);
  return typeof input.distance === "number" ? `${input.distance}m${stylePart}` : stylePart;
}
