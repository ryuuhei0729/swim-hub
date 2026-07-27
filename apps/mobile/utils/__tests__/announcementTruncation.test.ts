/**
 * announcementTruncation 純関数テスト (Sprint Contract: お知らせ本文の全文表示/省略)
 *
 * 背景: TeamAnnouncementsSection の AnnouncementItem (L175〜) は
 * `numberOfLines={2}` で本文を常に2行に切り詰めている。`onTextLayout` で
 * 実際の行数を検出し、2行を超える場合のみ「…全文を表示」/「省略」トグルを出す。
 *
 * 【なぜ純関数として切り出すか】
 * apps/mobile/__mocks__/react-native.ts の `Text` モックは `numberOfLines` を
 * 単に無視し、`onTextLayout` を DOM 要素にそのまま渡すだけで実際には発火させない
 * (jsdom は実レイアウトを計算しないため)。そのため `onTextLayout` に依存する
 * 切り詰め検出そのものは vitest では検証できず、Expo Go / シミュレータでの
 * 実機確認が必須になる (Verification Checklist [V-M5] 参照)。
 *
 * 一方で「検出済みの行数からトグル表示可否・numberOfLines 値・ボタンラベルを
 * どう決めるか」は DOM/RN に依存しない純粋な状態遷移であり、ここを
 * `apps/mobile/utils/announcementTruncation.ts` に抽出すれば実機に依存せず
 * 単体テストできる。Developer は AnnouncementItem からこのロジックを呼び出す
 * 形で実装することを推奨する (QA からの提案)。
 *
 * Sprint Contract 検証観点:
 *   [V-M1] 行数が numberOfLines 上限 (2) を超える場合、isTruncated=true
 *   [V-M2] 行数が上限以下の場合、isTruncated=false (トグル非表示)
 *   [V-M3] isExpanded=true のとき numberOfLines は undefined (全文表示)
 *   [V-M4] isExpanded=false かつ isTruncated=true のときのみトグルを表示する
 *          (isTruncated=false なら isExpanded に関わらずトグルを表示しない)
 *   [V-M5 相当・回帰防止] 展開後 (numberOfLines=undefined) に onTextLayout が
 *          再発火し行数が変わっても、一度 true になった isTruncated が
 *          false に化けてトグルが消えないこと (resolveIsTruncated は
 *          「今回の計測」と「これまでの検出結果」の OR を取ることで防止する)
 *
 * NOTE: `announcementTruncation.ts` は本スプリント未実装のため、本テストは
 * モジュール解決エラーで意図的に赤くなる (Developer 実装のガイドとして機能する)。
 *
 * --- Phase B 再々検証 (レイアウトジャンク根治のための構造変更後) 追記 ---
 * 当初、AnnouncementItem は可視 (クランプ) Text 自身を計測し、`isTruncated` を
 * 「今回の計測 OR これまでの検出結果」の OR ラチェットで保持する設計だった。
 * その後の構造変更で、可視 Text は常にクランプしたまま、別の非表示 (フロー外)
 * Text が毎回ノークランプで content を再描画して計測するようになった。この新設計では
 * content が変わるたびに計測用 Text 自体が再レイアウトされて `onTextLayout` が
 * 再発火するため、呼び出し側 (AnnouncementItem) は実際には
 * `resolveIsTruncated({ ..., wasTruncated: false })` と **常に false を渡す**
 * 形に変わっている (OR ラチェットは現在の呼び出し箇所では使われていない)。
 *
 * `resolveIsTruncated` 自体のシグネチャ・OR 挙動は変更されていないため、
 * 以下のテストは「純関数としての入出力仕様」を検証するものであり、
 * `AnnouncementItem` の `useEffect([announcement.content])` による
 * `isExpanded` リセットや、計測用 Text の再レイアウト配線そのものを
 * 検証するものではない。この配線 (content 変更時に計測用 Text が実際に
 * 再判定するか) は `onTextLayout` が jsdom で発火しないため自動検証不能であり、
 * Verification Checklist の [V-M5]〜[V-M7] (Expo Go / シミュレータでの実機確認)
 * に委ねる。見せかけの回帰保護を装うテスト名は使わない。
 */

import { describe, it, expect } from "vitest";
import {
  resolveIsTruncated,
  resolveNumberOfLines,
  shouldShowToggle,
} from "../announcementTruncation";

const MAX_LINES = 2;

describe("announcementTruncation", () => {
  describe("resolveIsTruncated", () => {
    it("[V-M1] 実測行数が上限を超える場合 true を返す", () => {
      expect(resolveIsTruncated({ measuredLines: 3, maxLines: MAX_LINES, wasTruncated: false })).toBe(
        true,
      );
    });

    it("[V-M2] 実測行数が上限以下の場合 false を返す", () => {
      expect(resolveIsTruncated({ measuredLines: 2, maxLines: MAX_LINES, wasTruncated: false })).toBe(
        false,
      );
    });

    it("wasTruncated=true が渡された場合、実測行数が上限以下でも true を維持する (OR 仕様そのままの入出力確認。現在の呼び出し箇所は常に wasTruncated=false を渡すため、この分岐は現状の AnnouncementItem からは到達しないが、関数の公開契約として固定する)", () => {
      expect(resolveIsTruncated({ measuredLines: 1, maxLines: MAX_LINES, wasTruncated: true })).toBe(
        true,
      );
    });

    it("wasTruncated=false かつ実測行数が上限以下のとき false を返す (現在の AnnouncementItem の呼び出し方 = 常に wasTruncated:false の入出力仕様。content 変更時に計測用 Text が実際に再判定するかどうかの配線自体はこのテストの対象外 — onTextLayout は jsdom で発火しないため自動検証不能。実機確認は Verification Checklist [V-M5]〜[V-M7] を参照)", () => {
      expect(
        resolveIsTruncated({ measuredLines: 1, maxLines: MAX_LINES, wasTruncated: false }),
      ).toBe(false);
    });
  });

  describe("resolveNumberOfLines", () => {
    it("[V-M3] isExpanded=true のとき undefined (全文表示)", () => {
      expect(resolveNumberOfLines({ isExpanded: true, maxLines: MAX_LINES })).toBeUndefined();
    });

    it("isExpanded=false のとき maxLines を返す", () => {
      expect(resolveNumberOfLines({ isExpanded: false, maxLines: MAX_LINES })).toBe(MAX_LINES);
    });
  });

  describe("shouldShowToggle", () => {
    it("[V-M4] isTruncated=true かつ isExpanded=false のとき true", () => {
      expect(shouldShowToggle({ isTruncated: true, isExpanded: false })).toBe(true);
    });

    it("[V-M4] isTruncated=true かつ isExpanded=true (展開中) のとき true (「省略」を出すため)", () => {
      expect(shouldShowToggle({ isTruncated: true, isExpanded: true })).toBe(true);
    });

    it("[V-M4] isTruncated=false のとき isExpanded に関わらず false", () => {
      expect(shouldShowToggle({ isTruncated: false, isExpanded: false })).toBe(false);
      expect(shouldShowToggle({ isTruncated: false, isExpanded: true })).toBe(false);
    });
  });
});
