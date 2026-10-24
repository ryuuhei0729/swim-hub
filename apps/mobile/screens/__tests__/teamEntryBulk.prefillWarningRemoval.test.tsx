// TeamEntryBulkFormScreen — 「ベストタイムのまま未編集です」注意文言の完全撤去 検証
//
// Sprint Contract (Phase A, PM承認済み。2026-09-21 コーディネーターによる範囲拡大反映) 検証観点:
//   - 行内の警告文言 (旧 styles.prefillWarningText ブロック) が描画されない
//   - 確認モーダルの各カテゴリ (新規/更新/削除/変更なし) 行に付く " ⚠️" も描画されない
//   - TeamEntryBulkFormScreen.tsx のソースに isPrefillUntouched の参照が0件になる
//     (import 文も含む。entryDiff.ts 本体と apps/web は変更対象外)
//
// 【トートロジー回避の方針 (コーディネーター指示)】
// 「⚠️ が出ない」だけを assert すると、行そのものが描画されていない場合にも
// 同じ理由で green になってしまう (行が消えている方が重大な regression なのに
// 検出できない)。そのため各テストは必ず
//   (a) 対象の行が実際に描画されていること (選手名・種目名・タイムが読めること)
//   (b) その行のテキストに "⚠️" が含まれないこと
// の両方を同一アサーション対象に対して行う。

import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createWrapper, harness } from "./teamEntryBulkScreenHarness";
import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

const styleFree = {
  id: 3,
  name_jp: "自由形100m",
  name: "Freestyle",
  style: "fr",
  distance: 100,
};
const styleBreast = {
  id: 9,
  name_jp: "平泳ぎ50m",
  name: "Breaststroke",
  style: "br",
  distance: 50,
};
const styleBack = {
  id: 5,
  name_jp: "背泳ぎ50m",
  name: "Backstroke",
  style: "ba",
  distance: 50,
};


describe("TeamEntryBulkFormScreen — 未編集プリフィル警告の完全撤去", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    harness.getStyles.mockResolvedValue([styleFree, styleBreast, styleBack]);
    harness.getBestTimesForUsers.mockResolvedValue(new Map());
    harness.createBulkEntries.mockResolvedValue([]);
    harness.updateEntry.mockResolvedValue({});
    harness.deleteBulkEntries.mockResolvedValue(undefined);

    harness.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0, date: "2999-01-01", entry_status: "open" },
      error: null,
    };
    harness.responses["select:entries"] = {
      data: [
        {
          id: "entry-X",
          user_id: "user-1",
          style_id: 3,
          entry_time: 60.5,
          note: null,
          users: { id: "user-1", name: "選手A" },
        },
      ],
      error: null,
    };
  });

  /**
   * 選手Aに新しい行を1件追加し、ベストタイムが存在する種目 (背泳ぎ, id=5) を選択して
   * 自動プリフィル (isPrefillUntouched が true になる状態) を発生させる共通操作。
   */
  async function addRowAndTriggerUntouchedPrefill() {
    fireEvent.click(screen.getByText("種目を追加"));

    const placeholderButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.textContent === "種目を選択");
    fireEvent.click(placeholderButtons[placeholderButtons.length - 1]!); // 新規行は必ず未選択状態で追加される

    const backOptions = await screen.findAllByText(/背泳ぎ/);
    fireEvent.click(backOptions[backOptions.length - 1]!.closest("button") ?? backOptions[backOptions.length - 1]!);
  }

  it(
    "ベストタイムが自動プリフィルされた行に、行内警告文言 (⚠️ ベストタイムのまま未編集です)" +
      "が表示されない（行自体・プリフィルされたタイムが実際に描画されていることと対で確認する）",
    async () => {
      harness.getBestTimesForUsers.mockResolvedValue(
        new Map([
          [
            "user-1",
            [
              {
                id: "best-back",
                time: 45.0,
                created_at: "2025-01-01T00:00:00Z",
                pool_type: 0,
                is_relaying: false,
                style_id: 5,
                style: { name_jp: "背泳ぎ50m", distance: 50 },
              },
            ],
          ],
        ]),
      );

      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });
      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      await addRowAndTriggerUntouchedPrefill();

      // (a) 行が実際にプリフィルされて描画されていること
      await waitFor(() => {
        expect(screen.getByDisplayValue("45.00")).toBeDefined();
      });

      // (b) 旧警告文言が画面上のどこにも存在しないこと
      expect(screen.queryByText(/ベストタイムのまま未編集/)).toBeNull();
      expect(screen.queryByText("⚠️ ベストタイムのまま未編集です")).toBeNull();
    },
  );

  it(
    "確認モーダルの『新規』カテゴリで、未編集プリフィル行が選手名・種目名・タイムを含む" +
      "テキストで正しく表示され (区切り文字「・」と矢印「→」が壊れていない)、" +
      "⚠️ は付与されない（人間の意図: ⚠️ 除去の副作用でカテゴリ行のテキスト構築自体が" +
      "壊れていないかを、行が描画されていることの確認と対で見る）",
    async () => {
      harness.getBestTimesForUsers.mockResolvedValue(
        new Map([
          [
            "user-1",
            [
              {
                id: "best-back",
                time: 45.0,
                created_at: "2025-01-01T00:00:00Z",
                pool_type: 0,
                is_relaying: false,
                style_id: 5,
                style: { name_jp: "背泳ぎ50m", distance: 50 },
              },
            ],
          ],
        ]),
      );

      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });
      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      await addRowAndTriggerUntouchedPrefill();
      await waitFor(() => {
        expect(screen.getByDisplayValue("45.00")).toBeDefined();
      });

      fireEvent.click(screen.getByText("まとめて登録"));
      // ここでは確認モーダルの表示内容だけを検証する。「確定」を押すと保存が完了し
      // isSaved=true → navigation.goBack() が発火してモーダルが閉じてしまうため、
      // 「確定」ボタンの出現確認より後に押してはいけない (押す前に内容を検証する)。
      await screen.findByText("確定");

      // 新規カテゴリの見出しに (1) が付く = 新規行が1件、正しく分類されている
      const categoryHeading = await screen.findByText("新規 (1)");
      expect(categoryHeading).toBeDefined();

      // カテゴリ内の行テキストに選手名・種目名・タイム・区切り文字が含まれ、⚠️ を含まない
      const rowText = await screen.findByText((content) => {
        // localizedStyleName() は style.style ("ba") 優先で abbrev を解決し、
        // distance を先頭に置いた "50m背泳ぎ" 形式で返す (name_jp の見た目とは異なる。
        // 実測: ピッカーの選択肢・確認モーダルの両方でこの表記になる)
        return content.includes("選手A") && content.includes("50m背泳ぎ") && content.includes("45.00");
      });
      expect(rowText.textContent ?? "").toContain("・");
      expect(rowText.textContent ?? "").toContain("→");
      expect(rowText.textContent ?? "").not.toContain("⚠️");
    },
  );

  it(
    "TeamEntryBulkFormScreen.tsx のソースコードに isPrefillUntouched への参照が0件になる" +
      "（人間の意図: import 文だけ消して呼び出しが残る/呼び出しだけ消してimportが残る、" +
      "どちらの半端な削除も検出する。entryDiff.ts 本体は対象外なので別ファイルを見ない）",
    () => {
      const source = readFileSync(
        path.resolve(__dirname, "../TeamEntryBulkFormScreen.tsx"),
        "utf-8",
      );
      const occurrences = source.match(/isPrefillUntouched/g) ?? [];
      expect(occurrences).toHaveLength(0);
    },
  );
});
