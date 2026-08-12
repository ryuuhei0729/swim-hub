/**
 * コード規約: 種目定数のローカル再定義禁止 (Sprint Contract 仕様 #8)
 *
 * 実測 (2026-08-11, Phase A): 再発事例が実在する。
 *   `apps/web/app/[locale]/(authenticated)/bulk-besttime/_client/BulkBestTimeClient.tsx:42-64`
 *   が `STYLES: StyleDefinition[] = [...]` として、正規定義
 *   `apps/shared/utils/swimStyles.ts` を使わず種目マスターをローカル再定義している。
 *
 * 実測 (2026-08-12, Phase B) による方針の精緻化:
 *   entries機能のUIは RecordClient.tsx (承認済み前例) と同じ「DBから取得した
 *   Style[] (id/name_jp/distance が既に結合済み) をそのままセレクトボックスに
 *   列挙する」パターンを採用している (`EntriesDataLoader.tsx` が `styles` テーブルを
 *   fetch → `EntriesClient.tsx` の `<select>` がそれを列挙するだけ)。この構成では
 *   `swimStyles.ts` の `STYLES`/`DISTANCES`/`isInvalidCombination` を import する
 *   **必要がそもそも無い** (DBの正規データを直接使っているため、クライアント側の
 *   ID→種目名 マッピングを別途持つ必要が無い)。
 *   したがって「import していること」を機械的に要求するのは誤った一般化であり、
 *   RecordClient.tsx (承認済み前例) も同様に import していない。
 *   実際にテストすべき人間の意図は「BulkBestTimeClient.tsx と同じ、ハードコードされた
 *   種目マスター配列のローカル再定義が無いこと」である。このテストはその意図に絞る。
 *
 * apps/web/utils/swimStyle.ts (EntriesClient.tsx が import している) は本機能のための
 * 新規ファイルではなく、既存の ID範囲→i18nコードキー 変換ヘルパー
 * (StyleChipSelector 等で既に使われている pre-existing utility) であり、
 * STYLES 配列のような種目マスターデータそのものの再定義ではないため対象外とする。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// 本機能で新設・変更された、種目データを扱う可能性のあるファイル
const TARGET_FILES = [
  "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient.tsx",
  "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader.tsx",
  "apps/web/components/team/MemberSelectModal.tsx",
  "apps/web/components/team/entry/EntryBulkConfirmModal.tsx",
  "apps/mobile/screens/TeamEntryBulkFormScreen.tsx",
];

// BulkBestTimeClient.tsx の再発パターン: 日本語種目名を3つ以上含む配列リテラル
const STYLE_NAMES = ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"];

function countStyleNameLiteralsInArrayContext(source: string): number {
  // "STYLES" または "styles" という識別子への配列代入 (= [ ... ]) を大まかに検出し、
  // その中に日本語種目名が3つ以上ハードコードされていないかを確認する簡易ヒューリスティック。
  const arrayLiteralMatches =
    source.match(/(?:const|let)\s+\w*[Ss]tyle\w*\s*[:=][^;]*\[[^\]]*\]/g) ?? [];
  let maxNamesInOneLiteral = 0;
  for (const literal of arrayLiteralMatches) {
    const count = STYLE_NAMES.filter((name) => literal.includes(name)).length;
    maxNamesInOneLiteral = Math.max(maxNamesInOneLiteral, count);
  }
  return maxNamesInOneLiteral;
}

describe("entries機能 — 種目マスターのローカル再定義禁止 (Sprint Contract 仕様#8)", () => {
  it.each(TARGET_FILES)(
    "%s は BulkBestTimeClient.tsx と同種の『日本語種目名3つ以上を含むローカル配列』を" +
      "定義していない (人間の意図: 再発防止。人間がSprint Contractで明示的にFAIL条件と" +
      "定めた項目)",
    (relativePath) => {
      const fullPath = path.join(REPO_ROOT, relativePath);
      const source = readFileSync(fullPath, "utf-8");
      const maxNames = countStyleNameLiteralsInArrayContext(source);
      expect(
        maxNames,
        `${relativePath} に日本語種目名を${maxNames}個含むローカル配列が見つかった`,
      ).toBeLessThan(3);
    },
  );

  it(
    "EntriesDataLoader.tsx は種目マスターを `styles` テーブルから取得している " +
      "(人間の意図: DB正規データを直接使うRecordDataLoader.tsx と同じ承認済みパターンを" +
      "踏襲していること。クライアント側でのマスター重複保持を避ける)",
    () => {
      const fullPath = path.join(
        REPO_ROOT,
        "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_server/EntriesDataLoader.tsx",
      );
      const source = readFileSync(fullPath, "utf-8");
      expect(source).toMatch(/\.from\(\s*["']styles["']\s*\)/);
    },
  );

  it(
    "entries機能がタイム表示に formatTimeBest を ( `apps/shared/utils/time.ts` から) 使っている" +
      "（人間の意図: タイム表示『分:秒.コンマ秒』統一というドメイン品質基準の遵守を" +
      "機械的に確認する）",
    () => {
      const webClientPath = path.join(
        REPO_ROOT,
        "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient.tsx",
      );
      const mobileScreenPath = path.join(
        REPO_ROOT,
        "apps/mobile/screens/TeamEntryBulkFormScreen.tsx",
      );

      for (const filePath of [webClientPath, mobileScreenPath]) {
        const source = readFileSync(filePath, "utf-8");
        expect(source, `${filePath} が formatTimeBest を import していない`).toMatch(
          /formatTimeBest/,
        );
      }
    },
  );

  it(
    "entries機能の入力パースは parseTimeFlexible を直接呼ぶか、内部で parseTimeFlexible を" +
      "使う shared entryDiff (diffEntryRows/toEntryInsert/toEntryUpdate) 経由のいずれかで" +
      "行われている（人間の意図: タイム文字列→秒数変換のロジックをファイルごとに再発明しない。" +
      "実測 (2026-08-12): EntriesClient.tsx は parseTimeFlexible を直接importせず、" +
      "shared entryDiff の diffEntryRows/toEntryInsert 経由でのみ変換している構成に" +
      "変わったため、どちらの経路でも合格とする）",
    () => {
      const webClientPath = path.join(
        REPO_ROOT,
        "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient.tsx",
      );
      const mobileScreenPath = path.join(
        REPO_ROOT,
        "apps/mobile/screens/TeamEntryBulkFormScreen.tsx",
      );

      for (const filePath of [webClientPath, mobileScreenPath]) {
        const source = readFileSync(filePath, "utf-8");
        const usesDirectParse = /parseTimeFlexible/.test(source);
        const usesSharedDiffConversion = /diffEntryRows|toEntryInsert|toEntryUpdate/.test(source);
        expect(
          usesDirectParse || usesSharedDiffConversion,
          `${filePath} がタイム文字列→秒数変換の既存ロジック (parseTimeFlexible もしくは entryDiff) を経由していない`,
        ).toBe(true);
      }
    },
  );
});
