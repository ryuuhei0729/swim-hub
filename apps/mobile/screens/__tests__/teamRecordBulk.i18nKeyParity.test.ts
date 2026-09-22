// =============================================================================
// teamRecordBulk.i18nKeyParity.test.ts
// [Sprint Contract Phase A スケルトン] 新規 i18n キーが ja/en/ko/zh/de の
// 5言語すべてに存在すること (1言語でも欠けたら FAIL)。
// =============================================================================
//
// このスプリントで追加される新規キーの正確な名前は Developer の実装依存
// (例: 「n本目を追加」ボタン・選手0人の空状態の文言等) のため、Phase A の
// 時点では個別キー名をハードコードしない。代わりに `teams.record` 名前空間
// (このスプリントで新規キーが追加される namespace) 全体のキー集合を
// ja.json を基準に他4言語と再帰的に突き合わせ、キー集合が完全一致することを
// 検証する。この方式なら Developer がどんなキー名を選んでも、
// 「一部の言語にだけ追加し忘れる」を漏れなく検出できる。
//
// 実行時点でのベースライン確認 (Phase A・実装前に実測済み):
//   teams.record / common の両名前空間は現状 ja/en/ko/zh/de で完全一致している
//   (2026-09-22 時点)。したがってこのテストは実装前は green のままであり、
//   このスプリントで新規キーの追加漏れが発生した場合にのみ red になる
//   (= 無関係な既存ドリフトを誤って拾わない)。
//
// トートロジー防止メモ: 「ja.json のキー数と一致するか」という数値比較ではなく、
// キー名そのものの集合差分 (missing / extra) を出す。数だけ合わせて中身が
// ずれているケース (例: 片方が誤字キーを追加し、もう片方が正しいキーを追加して
// 数だけ帳尻が合う) を見逃さないため。

import { describe, expect, it } from "vitest";
import ja from "@apps/shared/messages/ja.json";
import en from "@apps/shared/messages/en.json";
import ko from "@apps/shared/messages/ko.json";
import zh from "@apps/shared/messages/zh.json";
import de from "@apps/shared/messages/de.json";

type MessageTree = { [key: string]: MessageTree | string };

/** ネストしたメッセージオブジェクトを "a.b.c" 形式のキー集合に平坦化する */
function flattenKeys(tree: MessageTree, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") {
      for (const nested of flattenKeys(value as MessageTree, path)) {
        keys.add(nested);
      }
    } else {
      keys.add(path);
    }
  }
  return keys;
}

const LOCALES: Array<{ name: string; tree: MessageTree }> = [
  { name: "en", tree: en as unknown as MessageTree },
  { name: "ko", tree: ko as unknown as MessageTree },
  { name: "zh", tree: zh as unknown as MessageTree },
  { name: "de", tree: de as unknown as MessageTree },
];

// このスプリントで新規キーが追加される想定の名前空間。
// #6 の確認ダイアログで common.discardTitle/discardMessage を再利用するのか
// 専用キーを新設するのかは Developer の設計次第のため、common も対象に含める。
const NAMESPACES_TO_CHECK: Array<{ label: string; path: string[] }> = [
  { label: "teams.record", path: ["teams", "record"] },
  { label: "common", path: ["common"] },
];

function getNamespace(tree: MessageTree, path: string[]): MessageTree {
  let current: MessageTree | string = tree;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`namespace path ${path.join(".")} did not resolve to an object`);
    }
    const next: MessageTree | string | undefined = current[segment];
    if (next === undefined) {
      throw new Error(`namespace segment "${segment}" not found in path ${path.join(".")}`);
    }
    current = next;
  }
  if (typeof current !== "object" || current === null) {
    throw new Error(`namespace path ${path.join(".")} did not resolve to an object`);
  }
  return current;
}

describe("i18n キーパリティ (teams.record / common) — ja を基準に5言語で一致すること", () => {
  for (const { label, path } of NAMESPACES_TO_CHECK) {
    const jaNamespace = getNamespace(ja as unknown as MessageTree, path);
    const jaKeys = flattenKeys(jaNamespace, label);

    for (const { name, tree } of LOCALES) {
      it(`${label}: ${name}.json に ja.json と同じキー集合が存在する (欠落キーが無い)`, () => {
        const localeNamespace = getNamespace(tree, path);
        const localeKeys = flattenKeys(localeNamespace, label);

        const missing = [...jaKeys].filter((k) => !localeKeys.has(k)).sort();
        expect(missing, `${name}.json に不足しているキー: ${missing.join(", ")}`).toEqual([]);
      });

      // 【Reviewer指摘対応】欠落キー (missing) だけでなく、ja.json には無いのに
      // 他言語にだけ存在する余剰キー (extra) も検出する。片手落ちのまま放置すると、
      // 誤字キーの追加や削除漏れ (例: ja だけリネームして他言語の旧キーが残る) を
      // 見逃す。
      it(`${label}: ${name}.json に ja.json に無い余剰キーが無い`, () => {
        const localeNamespace = getNamespace(tree, path);
        const localeKeys = flattenKeys(localeNamespace, label);

        const extra = [...localeKeys].filter((k) => !jaKeys.has(k)).sort();
        expect(extra, `${name}.json にのみ存在する余剰キー: ${extra.join(", ")}`).toEqual([]);
      });
    }
  }
});
