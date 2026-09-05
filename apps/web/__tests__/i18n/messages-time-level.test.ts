/**
 * `/[locale]/time-level` 新規ページ i18n キー網羅テスト
 *
 * ## 実装先行に関する注記 (PM 報告済み)
 * 本来 Phase A (Sprint Contract 確定) の時点ではキーは未実装のはずだったが、QA が
 * VERIFIED_DATA.md/Sprint Contract を精査中に、並行セッションによる実装
 * (`apps/shared/utils/regionalStandardTimes.ts` / `apps/web/app/[locale]/(unauthenticated)/time-level/`
 * / `apps/shared/messages/*.json` の `timeLevel.*` キー / `lib/supabase-auth/middleware.ts`
 * への `/time-level` 追加) が既に完了していることを検出した。
 * 本テストは QA が独自設計した仮の名前空間案 (`genderOptions.male` 等のネスト構造) ではなく
 * **実際に実装された** キー名 (`genderMale`/`genderFemale` のフラット構造、水路ラベルは
 * 新規キーを増やさず既存の `common.poolTypeShort`/`common.poolTypeLong` を再利用) を
 * 正としてピン留めする。詳細は QA 報告の「残論点」を参照。
 *
 * 一般的なキー構造の完全一致・翻訳漏れ(日本語リーク)検出は
 * `apps/shared/__tests__/messages-coverage.test.ts` (5言語版) が担う既存の safety net。
 * 本テストはそれとは独立に「timeLevel 機能が必要とする正確なキー名」を
 * 5言語 (ja/en/de/ko/zh) 全てで固定する、この機能専用のピン留めテストである
 * (D9: 既存 messages.test.ts は ja/en 間のみの検証で zh/ko/de は対象外のため)。
 *
 * Sprint Contract 検証観点:
 *   [V-I01] timeLevel 配下の必須キーが ja/en/de/ko/zh の5言語すべてに
 *           空でない文字列として存在する
 *   [V-I02] en.json の値に日本語文字が含まれない (翻訳漏れ検出)
 *   [V-I03] common.poolTypeShort / common.poolTypeLong (既存キーの再利用) が
 *           5言語で存在する (timeLevel 専用の重複キーを新設していないことの確認)
 *   [V-I04] D10 (独自算出の注記) に対応する tochu.note / toko.note が
 *           「公式制度ではない」旨を示す語を含む
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import deMessages from "../../../shared/messages/de.json";
import koMessages from "../../../shared/messages/ko.json";
import zhMessages from "../../../shared/messages/zh.json";

function getValue(obj: Record<string, unknown>, dottedKey: string): unknown {
  const parts = dottedKey.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

// 実装済みの `timeLevel.*` 名前空間の必須キー (実測で確定)。
const REQUIRED_KEYS = [
  "timeLevel.metaTitle",
  "timeLevel.metaDesc",
  "timeLevel.title",
  "timeLevel.description",
  "timeLevel.genderLabel",
  "timeLevel.genderMale",
  "timeLevel.genderFemale",
  "timeLevel.poolTypeLabel",
  "timeLevel.styleLabel",
  "timeLevel.distanceLabel",
  "timeLevel.timeLabel",
  "timeLevel.timePlaceholder",
  "timeLevel.invalidTimeFormat",
  "timeLevel.emptyEnterTime", // D7: タイム未入力/不正値時の空状態文言
  "timeLevel.noStandardTime", // 種目・距離の基準タイムが無い場合の空状態
  "timeLevel.lcmOnly", // 短水路選択時の都中/都高の空状態 (長水路専用)
  "timeLevel.pointsUnit",
  "timeLevel.baseTimeLabel",
  "timeLevel.cleared",
  "timeLevel.notCleared",
  "timeLevel.wa.title",
  "timeLevel.tochu.title",
  "timeLevel.tochu.note", // D10: 独自算出であることの注記
  "timeLevel.toko.title",
  "timeLevel.toko.note", // D10: 独自算出であることの注記
];

const LOCALES: Array<{ name: string; messages: Record<string, unknown> }> = [
  { name: "ja", messages: jaMessages },
  { name: "en", messages: enMessages },
  { name: "de", messages: deMessages },
  { name: "ko", messages: koMessages },
  { name: "zh", messages: zhMessages },
];

describe("[V-I01] /time-level の i18n キー (5言語パリティ)", () => {
  for (const { name, messages } of LOCALES) {
    it.each(REQUIRED_KEYS)(`[V-I01] ${name}.json に %s が空でない文字列として存在する`, (key) => {
      const value = getValue(messages, key);
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    });
  }
});

describe("[V-I02] en.json の値に日本語文字が含まれない (翻訳漏れ検出、この機能分のみのローカルチェック)", () => {
  it("REQUIRED_KEYS の全キーについて en.json の値が日本語を含まない", () => {
    const jaLeakRegex = /[ぁ-んァ-ヶー一-龯]/;
    for (const key of REQUIRED_KEYS) {
      const value = getValue(enMessages, key);
      expect(typeof value === "string" && jaLeakRegex.test(value)).toBe(false);
    }
  });
});

describe("[V-I03] 水路ラベルは既存 common.poolTypeShort/poolTypeLong を再利用する (重複キー新設防止)", () => {
  it.each(LOCALES.map(({ name }) => name))(
    "%s.json に common.poolTypeShort / common.poolTypeLong が存在する",
    (name) => {
      const { messages } = LOCALES.find((l) => l.name === name)!;
      expect(typeof getValue(messages, "common.poolTypeShort")).toBe("string");
      expect(typeof getValue(messages, "common.poolTypeLong")).toBe("string");
    },
  );

  it("timeLevel 名前空間に poolTypeShort/poolTypeLong 相当の重複キーを新設していない", () => {
    const timeLevelKeys = Object.keys(jaMessages.timeLevel as Record<string, unknown>);
    expect(timeLevelKeys).not.toContain("poolTypeShort");
    expect(timeLevelKeys).not.toContain("poolTypeLong");
    expect(timeLevelKeys).not.toContain("poolTypeOptions");
  });
});

describe("[V-I04] D10: 都中/都高ポイントが公式制度ではないことを示す注記が5言語に存在する", () => {
  it("ja.json の tochu.note / toko.note が「公式」ではないことを明示する語を含む", () => {
    const tochuNote = getValue(jaMessages, "timeLevel.tochu.note") as string;
    const tokoNote = getValue(jaMessages, "timeLevel.toko.note") as string;
    expect(tochuNote).toContain("公式");
    expect(tochuNote).toContain("独自");
    expect(tokoNote).toContain("公式");
    expect(tokoNote).toContain("独自");
  });

  it.each(["en", "de", "ko", "zh"])("%s.json の tochu.note / toko.note が空でない文字列である", (name) => {
    const { messages } = LOCALES.find((l) => l.name === name)!;
    const tochuNote = getValue(messages, "timeLevel.tochu.note");
    const tokoNote = getValue(messages, "timeLevel.toko.note");
    expect(typeof tochuNote).toBe("string");
    expect((tochuNote as string).length).toBeGreaterThan(20); // 短すぎる=注記が骨抜きになっていないか
    expect(typeof tokoNote).toBe("string");
    expect((tokoNote as string).length).toBeGreaterThan(20);
  });
});
