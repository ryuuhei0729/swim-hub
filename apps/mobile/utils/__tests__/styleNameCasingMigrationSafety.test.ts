/**
 * styleName.ts (localizedStyleName) の種目略称ケーシング移行安全性テスト
 *
 * PM 実測 (2026-09-01): `apps/mobile/utils/styleName.ts:57,85` の
 * `CODE_TO_ABBREV[input.style.toLowerCase()]` は「小文字前提の正規化」の1つとして
 * 移行リスクの監視対象に挙げられた。
 *
 * 実測更新 (2026-09-02): その後 Developer が styleName.ts のローカル変換表を廃し、
 * canonical 定義元である `toStyleCode()` (apps/shared/utils/swimStyles.ts) に委譲する
 * 設計へリファクタした。さらに Reviewer 指摘 (High: 大小無視マッチが "FR" (フリーリレー
 * 略称) を "Fr" (自由形) に潰す) を受け、`toStyleCode()` 自体が
 *   ① canonical との完全一致 (大小区別あり)
 *   ② legacy バグが書き込んだ「厳密な全小文字」のみ救済
 * の2段構造に絞り込まれた。したがって、当初の想定 (「移行の影響を受けない」) は
 * 誤りだったことが判明している: 全大文字・混在ケーシングの入力は、以前は
 * (ローカル `.toLowerCase()` により) 解決できていたが、現在は非対応 (undefined) になり、
 * `localizedStyleName` は name_jp/name へのフォールバック(無ければ空文字)に落ちる。
 * legacy な「厳密な全小文字」のカバレッジ(移行窓の防御として必須)は残しつつ、
 * 全大文字を「正しく解決する」と期待していた回帰ガードは新契約に合わせて反転させる。
 */
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import { localizedStyleName } from "../styleName";

function resolveKey(key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}
const t = ((key: string) => resolveKey(key) ?? key) as unknown as TFunction;

describe("localizedStyleName — 種目コードのケーシング非依存 (移行安全性の回帰ガード)", () => {
  it("[V-MIG-04] DB canonical (移行後想定: タイトルケース 'Fr') を正しく解決する", () => {
    expect(localizedStyleName({ style: "Fr", distance: 100 }, t)).toBe("100m自由形");
  });

  it("[V-MIG-04] 旧小文字値 ('fr' 等、移行前canonical/レガシーデータ) も正しく解決する", () => {
    expect(localizedStyleName({ style: "fr", distance: 50 }, t)).toBe("50m自由形");
    expect(localizedStyleName({ style: "br", distance: 100 }, t)).toBe("100m平泳ぎ");
  });

  // PM 裁定 (2026-09-02, Issue #13 High対応): 全大文字は "FR"(フリーリレー略称)との
  // 衝突を避けるため非対応になった。name_jp フォールバックが無い場合は空文字を
  // 返す(誤って別種目の名前に化けるより安全な劣化)。
  it("[新契約] 全大文字('FR'等)はフリーリレー略称との衝突を避けるため正規化されず、name_jp フォールバックも無い場合は空文字になる", () => {
    expect(localizedStyleName({ style: "FR", distance: 100 }, t)).toBe("");
  });

  it("[新契約] 全大文字でも name_jp があればそちらにフォールバックする(無言で自由形に化けない)", () => {
    expect(localizedStyleName({ style: "FR", distance: 100, name_jp: "100mフリーリレー" }, t)).toBe(
      "100mフリーリレー",
    );
  });

  it("[V-MIG-04] 未知の値は入力をそのまま返す(誤って空文字や例外にならない)", () => {
    expect(localizedStyleName({ style: "unknown", name_jp: "謎の種目" }, t)).toBe("謎の種目");
  });
});
