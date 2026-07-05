/**
 * Sprint Contract: 種目名 i18n 化 (W-2/W-3/W-4/W-6 + GUARD)
 *
 * Phase B: QA 実装済みテスト (Developer 実装後)
 *
 * Reviewer TR-1/TR-2/AI-1 指摘を受けてトートロジー解消:
 * - ローカル再実装を削除し、実関数を import して検証する
 * - canStyleRelay / styleIdToCodeKey / buildSwimStyleLabel / nameJpToCodeKey
 *   を "@/utils/swimStyle" から直接 import
 * - STYLE_KEY_MAP は mobile 環境でテスト不可のため messages.json の逆引きで間接確認
 *
 * ============================================================================
 * Verification Checklist との対応
 * ============================================================================
 * [V-MK-01] practice.styles キーが 5 言語に存在する
 * [V-MK-02] practice.styleAbbrev キーが 5 言語に存在する
 * [V-MK-03] en.json の practice.styles.* に日本語が含まれない
 * [V-MK-04] en.json の practice.styleAbbrev.* に日本語が含まれない
 * [V-MK-05] 5 言語間のキー対称性
 * [V-W2/W3]  canStyleRelay() が style コードキー × 距離で判定する
 * [V-W3b]    styleIdToCodeKey() が ID 範囲を正しく変換する
 * [V-W4b]    buildSwimStyleLabel() が ja/en で正しいスペーシングで組み立てる
 * [V-W6b]    nameJpToCodeKey() が日本語 name_jp から CodeKey を推定する
 * [V-GUARD]  swimStyle.ts の未知入力に対するフォールバック動作
 * [V-MOBILE] STYLE_KEY_MAP 構造の間接確認 (messages.json 逆引き)
 */

import { describe, it, expect } from "vitest";
import {
  canStyleRelay,
  styleIdToCodeKey,
  buildSwimStyleLabel,
  nameJpToCodeKey,
  type StyleCodeKey,
} from "../../utils/swimStyle";

import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import koMessages from "../../../shared/messages/ko.json";
import zhMessages from "../../../shared/messages/zh.json";
import deMessages from "../../../shared/messages/de.json";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    // Hiragana / Katakana / CJK Unified Ideographs
    return /[぀-ゟ゠-ヿ一-鿿]/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(containsJapanese);
  }
  return false;
}

const STYLE_CODE_KEYS: StyleCodeKey[] = ["Fr", "Ba", "Br", "Fly", "IM"];

const ALL_LOCALES = [
  { name: "ja", messages: jaMessages as unknown as Record<string, unknown> },
  { name: "en", messages: enMessages as unknown as Record<string, unknown> },
  { name: "ko", messages: koMessages as unknown as Record<string, unknown> },
  { name: "zh", messages: zhMessages as unknown as Record<string, unknown> },
  { name: "de", messages: deMessages as unknown as Record<string, unknown> },
] as const;

// ---------------------------------------------------------------------------
// [V-MK-01] practice.styles キーが 5 言語すべてに存在する
// ---------------------------------------------------------------------------

describe("[V-MK-01] practice.styles キーが 5 言語に存在する", () => {
  for (const { name, messages } of ALL_LOCALES) {
    for (const key of STYLE_CODE_KEYS) {
      it(`${name}.json に "practice.styles.${key}" が存在する`, () => {
        const keys = flattenKeys(messages);
        expect(keys).toContain(`practice.styles.${key}`);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// [V-MK-02] practice.styleAbbrev キーが 5 言語すべてに存在する
// ---------------------------------------------------------------------------

describe("[V-MK-02] practice.styleAbbrev キーが 5 言語に存在する", () => {
  for (const { name, messages } of ALL_LOCALES) {
    for (const key of STYLE_CODE_KEYS) {
      it(`${name}.json に "practice.styleAbbrev.${key}" が存在する`, () => {
        const keys = flattenKeys(messages);
        expect(keys).toContain(`practice.styleAbbrev.${key}`);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// [V-MK-03] en.json の practice.styles.* に日本語が含まれない
// ---------------------------------------------------------------------------

describe("[V-MK-03] en.json の practice.styles.* に日本語が含まれない", () => {
  for (const key of STYLE_CODE_KEYS) {
    it(`en.json の "practice.styles.${key}" に日本語が含まれない`, () => {
      const value = getNestedValue(
        enMessages as unknown as Record<string, unknown>,
        `practice.styles.${key}`,
      );
      expect(containsJapanese(value)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-MK-04] en.json の practice.styleAbbrev.* に日本語が含まれない
// ---------------------------------------------------------------------------

describe("[V-MK-04] en.json の practice.styleAbbrev.* に日本語が含まれない", () => {
  for (const key of STYLE_CODE_KEYS) {
    it(`en.json の "practice.styleAbbrev.${key}" に日本語が含まれない`, () => {
      const value = getNestedValue(
        enMessages as unknown as Record<string, unknown>,
        `practice.styleAbbrev.${key}`,
      );
      expect(containsJapanese(value)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-MK-05] 5 言語間のキー対称性 (ja 基準)
// ---------------------------------------------------------------------------

describe("[V-MK-05] practice.styles / practice.styleAbbrev の 5 言語キー対称性", () => {
  const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
  const styleKeys = jaKeys.filter(
    (k) => k.startsWith("practice.styles.") || k.startsWith("practice.styleAbbrev."),
  );

  for (const { name, messages } of ALL_LOCALES.filter((l) => l.name !== "ja")) {
    it(`${name}.json の practice.styles / practice.styleAbbrev キーが ja と一致する`, () => {
      const localeKeys = new Set(flattenKeys(messages));
      const missing = styleKeys.filter((k) => !localeKeys.has(k));
      expect(missing, `${name}.json に以下のキーが欠損:\n${missing.join("\n")}`).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-W2/W3] canStyleRelay() — styleIdToCodeKey × 距離でリレー可否を判定
// 旧実装: nameJp.includes("自由形") → en ロケールで "Freestyle" にマッチせず破綻。
// 新実装: canStyleRelay(styleId, distance) は名前文字列を参照しない。
// ---------------------------------------------------------------------------

describe("[V-W2/W3] canStyleRelay() がコードキー × 距離でリレー可否を判定する", () => {
  // 自由形 (Fr): 25/50/100/200m = リレー可
  it("Fr × 25m → true (id=1: 25m 自由形)", () => {
    expect(canStyleRelay(1, 25)).toBe(true);
  });

  it("Fr × 50m → true (id=2: 50m 自由形)", () => {
    expect(canStyleRelay(2, 50)).toBe(true);
  });

  it("Fr × 100m → true", () => {
    expect(canStyleRelay(3, 100)).toBe(true);
  });

  it("Fr × 200m → true", () => {
    expect(canStyleRelay(4, 200)).toBe(true);
  });

  it("Fr × 400m → false (400m はリレー不可距離)", () => {
    expect(canStyleRelay(5, 400)).toBe(false);
  });

  it("Fr × 800m → false", () => {
    expect(canStyleRelay(6, 800)).toBe(false);
  });

  // 平泳ぎ (Br): 25/50/100m = リレー可
  it("Br × 25m → true (id=8: 25m 平泳ぎ)", () => {
    expect(canStyleRelay(8, 25)).toBe(true);
  });

  it("Br × 50m → true", () => {
    expect(canStyleRelay(9, 50)).toBe(true);
  });

  it("Br × 100m → true", () => {
    expect(canStyleRelay(10, 100)).toBe(true);
  });

  it("Br × 200m → false (200m 平泳ぎはリレー不可)", () => {
    expect(canStyleRelay(11, 200)).toBe(false);
  });

  // バタフライ (Fly): 25/50/100m = リレー可
  it("Fly × 25m → true (id=16: 25m バタフライ)", () => {
    expect(canStyleRelay(16, 25)).toBe(true);
  });

  it("Fly × 50m → true", () => {
    expect(canStyleRelay(17, 50)).toBe(true);
  });

  it("Fly × 100m → true", () => {
    expect(canStyleRelay(18, 100)).toBe(true);
  });

  it("Fly × 200m → false", () => {
    expect(canStyleRelay(19, 200)).toBe(false);
  });

  // 背泳ぎ (Ba): リレー不可
  it("Ba × 50m → false (背泳ぎはリレー不可)", () => {
    expect(canStyleRelay(13, 50)).toBe(false);
  });

  it("Ba × 100m → false", () => {
    expect(canStyleRelay(14, 100)).toBe(false);
  });

  // 個人メドレー (IM): リレー不可
  it("IM × 100m → false (個人メドレーはリレー不可)", () => {
    expect(canStyleRelay(20, 100)).toBe(false);
  });

  it("IM × 200m → false", () => {
    expect(canStyleRelay(21, 200)).toBe(false);
  });

  // 未知の style_id
  it("未知の style_id=99 → false", () => {
    expect(canStyleRelay(99, 50)).toBe(false);
  });

  // 文字列 style_id (StyleChipSelector は string を渡すケースがある)
  it("文字列 '2' (Fr, 50m) → true", () => {
    expect(canStyleRelay("2", 50)).toBe(true);
  });

  it("文字列 '13' (Ba, 50m) → false", () => {
    expect(canStyleRelay("13", 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-W3b] styleIdToCodeKey() — ID → CodeKey 変換
// ---------------------------------------------------------------------------

describe("[V-W3b] styleIdToCodeKey() が ID 範囲を正しく CodeKey に変換する", () => {
  it("id 1 → Fr (25m 自由形)", () => {
    expect(styleIdToCodeKey(1)).toBe("Fr");
  });

  it("id 7 → Fr (1500m 自由形)", () => {
    expect(styleIdToCodeKey(7)).toBe("Fr");
  });

  it("id 8 → Br (25m 平泳ぎ)", () => {
    expect(styleIdToCodeKey(8)).toBe("Br");
  });

  it("id 11 → Br (200m 平泳ぎ)", () => {
    expect(styleIdToCodeKey(11)).toBe("Br");
  });

  it("id 12 → Ba (25m 背泳ぎ)", () => {
    expect(styleIdToCodeKey(12)).toBe("Ba");
  });

  it("id 15 → Ba (200m 背泳ぎ)", () => {
    expect(styleIdToCodeKey(15)).toBe("Ba");
  });

  it("id 16 → Fly (25m バタフライ)", () => {
    expect(styleIdToCodeKey(16)).toBe("Fly");
  });

  it("id 19 → Fly (200m バタフライ)", () => {
    expect(styleIdToCodeKey(19)).toBe("Fly");
  });

  it("id 20 → IM (100m 個人メドレー)", () => {
    expect(styleIdToCodeKey(20)).toBe("IM");
  });

  it("id 22 → IM (400m 個人メドレー)", () => {
    expect(styleIdToCodeKey(22)).toBe("IM");
  });

  it("id 0 → null (範囲外)", () => {
    expect(styleIdToCodeKey(0)).toBeNull();
  });

  it("id 23 → null (範囲外)", () => {
    expect(styleIdToCodeKey(23)).toBeNull();
  });

  it("文字列 '2' → Fr", () => {
    expect(styleIdToCodeKey("2")).toBe("Fr");
  });
});

// ---------------------------------------------------------------------------
// [V-W4b] buildSwimStyleLabel() — ja/en でスペーシングが異なる
// ---------------------------------------------------------------------------

describe("[V-W4b] buildSwimStyleLabel() が locale ごとに正しいラベルを組み立てる", () => {
  it("ja: 100m + '自由形' → '100m自由形' (スペースなし)", () => {
    expect(buildSwimStyleLabel(100, "自由形", "ja")).toBe("100m自由形");
  });

  it("en: 100m + 'Freestyle' → '100m Freestyle' (スペースあり)", () => {
    expect(buildSwimStyleLabel(100, "Freestyle", "en")).toBe("100m Freestyle");
  });

  it("ko: 100m + '자유형' → '100m 자유형' (スペースあり)", () => {
    expect(buildSwimStyleLabel(100, "자유형", "ko")).toBe("100m 자유형");
  });

  it("zh: 50m + '自由泳' → '50m 自由泳' (スペースあり)", () => {
    expect(buildSwimStyleLabel(50, "自由泳", "zh")).toBe("50m 自由泳");
  });

  it("de: 50m + 'Freistil' → '50m Freistil' (スペースあり)", () => {
    expect(buildSwimStyleLabel(50, "Freistil", "de")).toBe("50m Freistil");
  });

  it("ja: 50m + 'バタフライ' → '50mバタフライ'", () => {
    expect(buildSwimStyleLabel(50, "バタフライ", "ja")).toBe("50mバタフライ");
  });
});

// ---------------------------------------------------------------------------
// [V-W6b] nameJpToCodeKey() — 日本語 name_jp から CodeKey を推定する
// ---------------------------------------------------------------------------

describe("[V-W6b] nameJpToCodeKey() が日本語 name_jp から CodeKey を推定する", () => {
  it("'100m自由形' → Fr", () => {
    expect(nameJpToCodeKey("100m自由形")).toBe("Fr");
  });

  it("'50m 自由形' (スペースあり) → Fr", () => {
    expect(nameJpToCodeKey("50m 自由形")).toBe("Fr");
  });

  it("'200m背泳ぎ' → Ba", () => {
    expect(nameJpToCodeKey("200m背泳ぎ")).toBe("Ba");
  });

  it("'100m平泳ぎ' → Br", () => {
    expect(nameJpToCodeKey("100m平泳ぎ")).toBe("Br");
  });

  it("'50mバタフライ' → Fly", () => {
    expect(nameJpToCodeKey("50mバタフライ")).toBe("Fly");
  });

  it("'200m個人メドレー' → IM", () => {
    expect(nameJpToCodeKey("200m個人メドレー")).toBe("IM");
  });

  it("未知の文字列 'unknown stroke' → null", () => {
    expect(nameJpToCodeKey("unknown stroke")).toBeNull();
  });

  it("空文字 '' → null", () => {
    expect(nameJpToCodeKey("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// [V-GUARD] ガードレール: canStyleRelay は nameJp 文字列に依存しない (ロケール非依存)
// ---------------------------------------------------------------------------

describe("[V-GUARD] canStyleRelay はロケールの nameJp 文字列に依存しない", () => {
  it("en ロケールで nameJp='Freestyle' になっても style_id=2 × 50m は true", () => {
    // canStyleRelay(styleId, distance) は nameJp を受け取らない
    // → en ロケールになっても判定結果が変わらないことを確認
    expect(canStyleRelay(2, 50)).toBe(true);
  });

  it("ko ロケールで nameJp='자유형' になっても style_id=2 × 50m は true", () => {
    expect(canStyleRelay(2, 50)).toBe(true);
  });

  it("en ロケールで nameJp='Backstroke' になっても style_id=13 × 50m は false", () => {
    expect(canStyleRelay(13, 50)).toBe(false);
  });

  it("styleIdToCodeKey は文字列名を参照せず ID のみで CodeKey を返す", () => {
    expect(styleIdToCodeKey(2)).toBe("Fr");
    expect(styleIdToCodeKey(13)).toBe("Ba");
    expect(styleIdToCodeKey(17)).toBe("Fly");
  });
});

// ---------------------------------------------------------------------------
// [V-MOBILE] STYLE_KEY_MAP 構造の間接確認
// mobile/utils/styleName.ts は RN 環境のため web テストでは import 不可。
// jp 名 → StyleAbbrev マッピングを messages.json の逆引きで確認する。
// ---------------------------------------------------------------------------

describe("[V-MOBILE] STYLE_KEY_MAP の逆引き確認 (ja messages × styleAbbrev)", () => {
  it("ja の practice.styleAbbrev.Fr = '自由形' (STYLE_KEY_MAP の 自由形→Fr と整合する)", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Fr",
    );
    expect(value).toBe("自由形");
  });

  it("ja の practice.styleAbbrev.Ba = '背泳ぎ'", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Ba",
    );
    expect(value).toBe("背泳ぎ");
  });

  it("ja の practice.styleAbbrev.Br = '平泳ぎ'", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Br",
    );
    expect(value).toBe("平泳ぎ");
  });

  it("ja の practice.styleAbbrev.Fly = 'バタフライ'", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Fly",
    );
    expect(value).toBe("バタフライ");
  });

  it("ja の practice.styleAbbrev.IM = '個人メドレー'", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.IM",
    );
    expect(value).toBe("個人メドレー");
  });

  it("en の practice.styleAbbrev.Fr = 'Fr' (略称は言語非依存)", () => {
    const value = getNestedValue(
      enMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Fr",
    );
    expect(value).toBe("Fr");
  });

  it("ko の practice.styleAbbrev.Fr = 'Fr'", () => {
    const value = getNestedValue(
      koMessages as unknown as Record<string, unknown>,
      "practice.styleAbbrev.Fr",
    );
    expect(value).toBe("Fr");
  });
});
