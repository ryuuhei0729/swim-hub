/**
 * 種目マスタードメイン (SwimStyle) と 練習ログドメイン (SWIM_STYLES) の収束テスト (mobile)
 *
 * web 側の apps/web/__tests__/domain/swimStyleDomainBoundary.test.ts と同一の意図を
 * mobile が実際に使うローカル定数 (apps/mobile/utils/formatters.ts の SWIM_STYLES) に
 * 対して検証する。設計変更の経緯・scanner との3リポ手動同期の注記は web 側テストの
 * コメントを参照。
 *
 * 検証観点:
 *   [V-3-01m] 種目マスタードメインの値集合と mobile 練習ログドメインの値集合が
 *             (順序を問わず) 完全に一致する
 *   [V-3-02m] 両ドメインの値はすべてタイトルケースである
 */
import { describe, expect, it } from "vitest";
import { SWIM_STYLES as MASTER_SWIM_STYLES } from "@apps/shared/types/common";
import { SWIM_STYLES as MOBILE_PRACTICE_LOG_SWIM_STYLES } from "@/utils/formatters";

describe("種目マスタードメイン と 練習ログドメイン の収束 (mobile)", () => {
  const masterValues = [...MASTER_SWIM_STYLES];
  const practiceLogValues = MOBILE_PRACTICE_LOG_SWIM_STYLES.map((s) => s.value);

  it("[V-3-01m] 2つのドメインの値集合が(順序を問わず)完全に一致する", () => {
    expect([...practiceLogValues].sort()).toEqual([...masterValues].sort());
  });

  it("[V-3-02m] 両ドメインの値はすべてタイトルケース(先頭大文字)である", () => {
    for (const v of [...masterValues, ...practiceLogValues]) {
      expect(v, `"${v}" はタイトルケースでない`).not.toBe(v.toLowerCase());
      expect(v[0], `"${v}" の先頭文字が大文字でない`).toBe(v[0]?.toUpperCase());
    }
  });

  it("[V-3-03m] ちょうど5要素(fr/br/ba/fly/imの5泳法)である", () => {
    expect(masterValues).toHaveLength(5);
    expect(practiceLogValues).toHaveLength(5);
  });
});
