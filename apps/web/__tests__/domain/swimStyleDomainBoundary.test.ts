/**
 * 種目マスタードメイン (SwimStyle) と 練習ログドメイン (SWIM_STYLES) の収束テスト
 *
 * Sprint Contract: GitHub Issue #13 (種目略称ケーシング統一, 人間裁定で全要件実施に拡大)
 *
 * 設計変更履歴 (重要):
 *   当初の縮小版 Contract では、種目マスタードメイン(小文字) と 練習ログドメイン
 *   (タイトルケース) は「別ドメインなので排他であるべき」という設計だった。
 *   しかし人間が Issue #13 の全要件実施を選択し、`styles.style` の DB CHECK 制約と
 *   `SwimStyle` 型がタイトルケースへ移行されたため、**2つのドメインは同一の
 *   canonical 集合を共有する(収束する)のが正しい設計**に変わった。
 *   このファイルはその収束を assert する。排他性を assert する旧テストのまま
 *   残すと、正しい実装 (収束) に対して赤くなり、Developer が実装を「排他を保つ」
 *   方向に緩めてしまうリスクがある (このスプリントの本来の目的を破壊する)。
 *
 * 検証観点:
 *   [V-3-01] 種目マスタードメイン (`SWIM_STYLES`, apps/shared/types/common.ts) の
 *            値集合と、練習ログドメイン (`SWIM_STYLES`,
 *            apps/web/components/forms/practice-log/types.ts) の値集合が
 *            (順序を問わず) 完全に一致する
 *   [V-3-02] 両ドメインの値はすべてタイトルケースである (旧小文字 canonical への
 *            先祖返りを検知する)
 *
 * scanner との関係 (3リポ手動同期):
 *   scanner の `SwimStroke` (swimhub-scanner/apps/shared/types/api.ts) は
 *   既にタイトルケース (`"Fr"|"Br"|"Ba"|"Fly"|"IM"`) であり、今回の移行後の
 *   swim-hub の canonical と一致する。ただし scanner は独立した git リポジトリで
 *   跨リポ CI が存在しないため、この一致を自動テストで保証することはできない
 *   (前スプリントの `tsconfig-canonical.test.ts` と同じ制約)。3リポ間の一致は
 *   人間が値を変更する際に手動で3ファイルを同期することに依存する:
 *     - swim-hub/apps/shared/types/common.ts (SWIM_STYLES, このファイルが参照)
 *     - swimhub-scanner/apps/shared/types/api.ts (SwimStroke)
 *     - (timer は種目コードを扱わないため対象外)
 *
 * トートロジー防止メモ:
 *   両方とも本物の実装からの import であり、期待値をハードコードで重複定義していない。
 *   「値が一致するか」という判定ロジック自体はどちらのプロダクションコードにも
 *   存在しない汎用の集合比較であり、プロダクションロジックの再実装ではない。
 */
import { describe, expect, it } from "vitest";
import { SWIM_STYLES as MASTER_SWIM_STYLES } from "@apps/shared/types/common";
import { SWIM_STYLES as PRACTICE_LOG_SWIM_STYLES } from "@/components/forms/practice-log/types";

describe("種目マスタードメイン と 練習ログドメイン の収束 (web)", () => {
  const masterValues = [...MASTER_SWIM_STYLES];
  const practiceLogValues = PRACTICE_LOG_SWIM_STYLES.map((s) => s.value);

  it("[V-3-01] 2つのドメインの値集合が(順序を問わず)完全に一致する", () => {
    expect([...practiceLogValues].sort()).toEqual([...masterValues].sort());
  });

  it("[V-3-02] 両ドメインの値はすべてタイトルケース(先頭大文字)である", () => {
    for (const v of [...masterValues, ...practiceLogValues]) {
      expect(v, `"${v}" はタイトルケースでない`).not.toBe(v.toLowerCase());
      expect(v[0], `"${v}" の先頭文字が大文字でない`).toBe(v[0]?.toUpperCase());
    }
  });

  it("[V-3-03] ちょうど5要素(fr/br/ba/fly/imの5泳法)である", () => {
    expect(masterValues).toHaveLength(5);
    expect(practiceLogValues).toHaveLength(5);
  });
});
