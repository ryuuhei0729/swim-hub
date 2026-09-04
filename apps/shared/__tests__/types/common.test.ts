/**
 * apps/shared/types/common.ts の SWIM_STYLES / SwimStyle 整合性テスト
 *
 * Sprint Contract: GitHub Issue #13 (種目略称ケーシング統一, 人間裁定で全要件実施に拡大)
 *
 * 設計変更履歴 (重要):
 *   当初の縮小版 Contract では `SWIM_STYLES` / `isSwimStyle` は「他ファイルからの参照が
 *   0件のデッドコード」として削除する予定だった。しかし人間が Issue #13 の全要件実施を
 *   選択したことでケーシング統一そのものが実施されることになり、PM の設計変更により
 *   **`SWIM_STYLES` を削除せず、種目マスタードメインの唯一の定義元 (canonical) に
 *   格上げする**方針に変わった:
 *     export const SWIM_STYLES = ["Fr", "Br", "Ba", "Fly", "IM"] as const;
 *     export type SwimStyle = (typeof SWIM_STYLES)[number];
 *   `isSwimStyle` も削除せず、`SWIM_STYLES` から導出する実用的な型ガードに書き換わる
 *   (DB 読み取り値の実行時検証に使えるため、もうデッドコードではない)。
 *   このファイルの旧 [V-0-A] (削除されたことを assert) は実装と逆になったため、
 *   「定数と型が構造的に一致しており乖離が起こり得ないか」を検証する内容に置き換えた。
 *
 * Sprint Contract 検証観点:
 *   [V-0-A] `SWIM_STYLES` が canonical として存在し、値がタイトルケースであること
 *           (実行時に検証可能)
 *   [V-0-B] `isSwimStyle` が `SWIM_STYLES` の全要素を受理し、旧小文字値 ("fr" 等) と
 *           canonical 外の値を拒否すること (実行時に意味のある検証)
 *   [V-0-C] `SwimStyle` 型が `SWIM_STYLES` から構造的に導出されていること
 *           (型レベルのみ検証可能。下記「型レベル検証について」を参照)
 *   [V-0-D] `SwimStyle` の値集合が DB `styles_style_check` CHECK 制約の**最新**の
 *           定義と一致する (migration が CHECK 制約を再定義した場合も追従する)
 *
 * 型レベル検証について (実行時では検証不能なことの明記):
 *   `type SwimStyle = (typeof SWIM_STYLES)[number]` は型レベルの関係であり、
 *   実行時の assert では「型が定数から導出されているか」を検証できない
 *   (実行時には型情報自体が消えている)。これを実行時テストで無理に確認しようとすると、
 *   「SWIM_STYLES の値を読んで期待値を作り、SwimStyle 型の値のはずのものと比較する」
 *   という自己言及的なトートロジーにしかならず、「通ったから安全」という誤った安心を
 *   作ってしまう。
 *   そこで [V-0-C] は下記の `Equal<X, Y>` (相互代入可能性ベースの型完全一致チェック)
 *   を使った**型レベルの検証**に倒す。`SwimStyle` が `(typeof SWIM_STYLES)[number]` の
 *   構造的エイリアスでなくなった場合 (例: 独立したリテラルユニオンとして再定義され、
 *   将来どちらかの値だけが変更された場合)、このファイル自体が `tsc --noEmit` で
 *   コンパイルエラーになる。CI Audit の tsc ゲートがこの型チェックを実行することで
 *   ガードとして機能する (vitest の通常実行 (esbuild) は型チェックをしないため、
 *   `vitest run` 単体を green にすることは安全の証明にならない。必ず `tsc --noEmit`
 *   もあわせて実行すること)。
 *
 * トートロジー防止メモ:
 *   [V-0-A]/[V-0-B] は common.ts の本物の export を import して検証しており、
 *   期待値をプロダクションコードから独立してハードコードしている
 *   (SWIM_STYLES の実際の値を機械的にコピーしていない)。
 *   [V-0-D] は本物の migration SQL ファイル群のテキストと本物の `SWIM_STYLES` を
 *   比較しており、期待値をハードコードで重複定義していない。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SWIM_STYLES, isSwimStyle, type SwimStyle } from "../../types/common";
import type { Stroke } from "../../utils/racePace/types";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

/** styles_style_check CHECK 制約の ARRAY[...] リテラルから種目コードの値集合を抽出する */
function extractStylesStyleCheckValues(sql: string): string[] | null {
  const constraintMatch = sql.match(
    /CONSTRAINT\s+"styles_style_check"\s+CHECK\s*\(\("style"\s*=\s*ANY\s*\(ARRAY\[([^\]]*)\]\)\)\)/,
  );
  if (!constraintMatch || !constraintMatch[1]) return null;
  const literalMatches = constraintMatch[1].match(/'([A-Za-z]+)'::"text"/g) ?? [];
  return literalMatches.map((m) => {
    const inner = m.match(/'([A-Za-z]+)'/);
    if (!inner || !inner[1]) throw new Error(`予期しないリテラル形式: ${m}`);
    return inner[1];
  });
}

/**
 * `supabase/migrations/` 配下を時系列順(ファイル名がタイムスタンプ接頭辞のため
 * 文字列ソート=時系列順)に走査し、styles_style_check の CHECK 制約定義を
 * 含むすべての migration を発見順に返す。
 *
 * なぜ最新のみを使うか: CHECK 制約は `ALTER TABLE ... DROP CONSTRAINT ...
 * ADD CONSTRAINT ...` で後続 migration により再定義されうる (実際、Issue #13 の
 * 移行 migration がこれを行う)。最初に見つかった (=最古の) 定義だけを見ると、
 * 再定義後も古い制約を読み続けて静かに誤判定する。
 */
function findLatestStylesStyleCheckDefinition(): { file: string; values: string[] } {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // ファイル名がタイムスタンプ接頭辞のため文字列ソート=時系列順

  let latest: { file: string; values: string[] } | null = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const values = extractStylesStyleCheckValues(sql);
    if (values) {
      latest = { file, values }; // 時系列順に上書きしていくので最後に残るのが最新
    }
  }
  if (!latest) {
    throw new Error(
      "styles_style_check CHECK 制約がどの migration にも見つからなかった。" +
        "migration ファイルの命名規則や制約の書式が変わった可能性があるため、" +
        "このテスト自体 (findLatestStylesStyleCheckDefinition の正規表現) を見直すこと。",
    );
  }
  return latest;
}

describe("[V-0-A] SWIM_STYLES は canonical (種目マスタードメインの唯一の定義元)", () => {
  it("SWIM_STYLES はちょうど5要素のタイトルケース値である", () => {
    expect([...SWIM_STYLES].sort()).toEqual(["Ba", "Br", "Fly", "Fr", "IM"]);
  });

  it("SWIM_STYLES の全要素がタイトルケース(先頭大文字)である", () => {
    for (const v of SWIM_STYLES) {
      expect(v, `"${v}" はタイトルケースでない`).not.toBe(v.toLowerCase());
    }
  });
});

describe("[V-0-B] isSwimStyle は SWIM_STYLES から導出された実用的な型ガードである", () => {
  it("SWIM_STYLES の全要素を受理する", () => {
    for (const v of SWIM_STYLES) {
      expect(isSwimStyle(v), `canonical値 "${v}" が受理されない`).toBe(true);
    }
  });

  it("旧小文字値 (移行前 canonical) を拒否する", () => {
    for (const v of ["fr", "br", "ba", "fly", "im"]) {
      expect(isSwimStyle(v), `旧小文字値 "${v}" が誤って受理された`).toBe(false);
    }
  });

  it("canonical外の任意の値を拒否する", () => {
    expect(isSwimStyle("FR")).toBe(false); // 全大文字は canonical でない
    expect(isSwimStyle("freestyle")).toBe(false);
    expect(isSwimStyle("")).toBe(false);
    expect(isSwimStyle(null)).toBe(false);
    expect(isSwimStyle(undefined)).toBe(false);
    expect(isSwimStyle(123)).toBe(false);
  });
});

describe("[V-0-D] SwimStyle の値集合が DB CHECK 制約の最新定義と一致する", () => {
  it("styles_style_check の最新定義 (再定義があれば追従) が SWIM_STYLES と一致する", () => {
    const { values: dbValues, file } = findLatestStylesStyleCheckDefinition();

    expect(
      [...dbValues].sort(),
      `最新の定義元 (${file}) の CHECK 制約値が SWIM_STYLES と一致しない`,
    ).toEqual([...SWIM_STYLES].sort());
  });

  it("styles_style_check の最新定義はちょうど5件である", () => {
    const { values: dbValues } = findLatestStylesStyleCheckDefinition();
    expect(dbValues).toHaveLength(5);
  });
});

// =============================================================================
// [V-0-C] 型レベル検証 (実行時テストではなく tsc --noEmit のコンパイルで検証される)
// =============================================================================
// 相互代入可能性ベースの型完全一致チェック (type-testing で広く使われる定番の実装)。
// X と Y が構造的に完全一致するときのみ true 型になる。
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

// SwimStyle が SWIM_STYLES から構造的に導出されていること。
// SwimStyle が独立したリテラルユニオンとして再定義され、SWIM_STYLES の値と
// 将来ズレた場合、この行が `tsc --noEmit` でコンパイルエラーになる。
type _SwimStyleIsDerivedFromCanonical = Expect<Equal<SwimStyle, (typeof SWIM_STYLES)[number]>>;

// racePace/types.ts の Stroke が独立したリテラルとして再導入されていないこと
// (SwimStyle の型エイリアスのままであること) の型レベル回帰ガード。
type _StrokeIsAliasOfSwimStyle = Expect<Equal<Stroke, SwimStyle>>;

describe("[V-0-C] 型レベル検証はコンパイル時にのみ意味を持つ (実行時テストでは検証不能)", () => {
  it("このファイルが tsc --noEmit を通過すること自体が [V-0-C] の証明である (プレースホルダ)", () => {
    // 上記の type _SwimStyleIsDerivedFromCanonical / _StrokeIsAliasOfSwimStyle が
    // 型不一致になった場合、この it() に到達する前に `tsc --noEmit` がコンパイル
    // エラーで失敗する。vitest 単体 (esbuild, 型チェックなし) はこの型不一致を
    // 検出できないため、CI では必ず tsc --noEmit もあわせて実行すること。
    expect(true).toBe(true);
  });
});
