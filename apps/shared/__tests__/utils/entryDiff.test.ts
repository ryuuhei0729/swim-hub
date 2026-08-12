/**
 * entryDiff — 管理者代理一括入力の「差分確認ステップ」純粋関数テスト
 *
 * Sprint Contract 由来の要件 (人間が確定した仕様 #1, #8):
 *   保存前に新規/更新/削除/変更なしの4分類を計算し、差分保存
 *   （触った行だけ書き込む。全置換禁止）を実現する純粋関数。
 *
 * 実装 (2026-08-12実測): `apps/shared/utils/entryDiff.ts`
 *   - diffEntryRows / classifyEntryRow / findDuplicateMemberStylePairs /
 *     toEntryInsert / toEntryUpdate / isPrefillUntouched
 *
 * 各テストが検証する「人間の意図」をコメントで明示する（トートロジー回避の自己申告）。
 * Reviewer からの申し送り（既存行の種目付け替え・スタイル未選択への回帰・
 * 全削除フロー・浮動小数点境界値）を優先的にカバーする。
 */

import { describe, expect, it } from "vitest";
import {
  classifyEntryRow,
  diffEntryRows,
  findDuplicateMemberStylePairs,
  isPrefillUntouched,
  partitionConflictingDeletes,
  toEntryInsert,
  toEntryUpdate,
  type ExistingEntryRow,
} from "../../utils/entryDiff";
import type { EntryDraftRow } from "../../types/team-entry";

function makeExisting(overrides: Partial<ExistingEntryRow> = {}): ExistingEntryRow {
  return {
    id: "existing-1",
    user_id: "user-1",
    style_id: 3,
    entry_time: 60.5,
    note: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<EntryDraftRow> = {}): EntryDraftRow {
  return {
    localId: "row-1",
    existingEntryId: null,
    targetUserId: "user-1",
    targetUserName: "選手A",
    styleId: 3,
    entryTimeInput: "1:00.50",
    note: "",
    prefillSource: null,
    prefilledInput: null,
    ...overrides,
  };
}

describe("classifyEntryRow", () => {
  it(
    "existingEntryId が無い行は 'new' に分類される" +
      "（人間の意図: 新規追加分を差分リストで見落とさないこと）",
    () => {
      const row = makeDraft({ existingEntryId: null });
      expect(classifyEntryRow(row, new Map())).toBe("new");
    },
  );

  it(
    "existingEntryId があり entry_time が変わっている場合は 'updated' に分類される" +
      "（人間の意図: Sprint Contract 仕様#1 の核心。管理者が『何をいくつからいくつに" +
      "変更するのか』を確認する前提となる分類）",
    () => {
      const existing = makeExisting({ id: "e-1", entry_time: 60.5 });
      const row = makeDraft({ existingEntryId: "e-1", entryTimeInput: "1:05.00" });
      const kind = classifyEntryRow(row, new Map([["e-1", existing]]));
      expect(kind).toBe("updated");
    },
  );

  it(
    "existingEntryId があり値が完全に一致する場合は 'unchanged' に分類される" +
      "（人間の意図: 触っていない行を差分保存の対象から除外できること）",
    () => {
      const existing = makeExisting({ id: "e-1", style_id: 3, entry_time: 60.5, note: null });
      const row = makeDraft({ existingEntryId: "e-1", styleId: 3, entryTimeInput: "1:00.50", note: "" });
      expect(classifyEntryRow(row, new Map([["e-1", existing]]))).toBe("unchanged");
    },
  );

  it(
    "existingEntryId があるが style_id だけが変わっている場合 (種目付け替え) は " +
      "'updated' に分類される（人間の意図: Reviewer申し送り#1『既存行の種目付け替え』。" +
      "entry_time が同じでも style_id の変化だけで差分を検出できないと、" +
      "種目付け替え保存が『変更なし』として握り潰されてしまう）",
    () => {
      const existing = makeExisting({ id: "e-1", style_id: 3, entry_time: 60.5 });
      const row = makeDraft({ existingEntryId: "e-1", styleId: 9, entryTimeInput: "1:00.50" });
      expect(classifyEntryRow(row, new Map([["e-1", existing]]))).toBe("updated");
    },
  );

  it(
    "existingEntryId が指定されているが Map に対応する行が存在しない場合は " +
      "防御的に 'new' として扱われる（人間の意図: スナップショットとの不整合" +
      "（同時編集で既に削除された行など）でクラッシュしないこと）",
    () => {
      const row = makeDraft({ existingEntryId: "missing-id" });
      expect(classifyEntryRow(row, new Map())).toBe("new");
    },
  );
});

describe("diffEntryRows", () => {
  it(
    "新規行 (existingEntryId なし) は toCreate に入り、EntryInsert 形式で teamId/competitionId が" +
      "セットされる（人間の意図: 一括作成APIに渡せる形になっていること）",
    () => {
      const row = makeDraft({ existingEntryId: null, styleId: 3, entryTimeInput: "1:00.50" });
      const diff = diffEntryRows([], [row], "comp-1", "team-1");

      expect(diff.toCreate).toHaveLength(1);
      expect(diff.toCreate[0]).toMatchObject({
        team_id: "team-1",
        competition_id: "comp-1",
        user_id: "user-1",
        style_id: 3,
      });
      expect(diff.toUpdate).toHaveLength(0);
      expect(diff.toDelete).toHaveLength(0);
    },
  );

  it(
    "既存行の entry_time を変更すると toUpdate に { id, patch } が入る" +
      "（人間の意図: 差分保存＝触った行だけを更新APIに渡せる形にすること）",
    () => {
      const existing = makeExisting({ id: "e-1", entry_time: 60.5 });
      const row = makeDraft({ existingEntryId: "e-1", entryTimeInput: "1:10.00" });
      const diff = diffEntryRows([existing], [row], "comp-1", "team-1");

      expect(diff.toUpdate).toHaveLength(1);
      expect(diff.toUpdate[0].id).toBe("e-1");
      expect(diff.toUpdate[0].patch.entry_time).toBeCloseTo(70.0, 5);
      expect(diff.toCreate).toHaveLength(0);
      expect(diff.toDelete).toHaveLength(0);
    },
  );

  it(
    "既存行の style_id だけを付け替えて保存すると、元の既存行1件だけが 'updated' に入り、" +
      "『別の既存行が破壊される』『旧行が幽霊として残留する』のいずれも起きない" +
      "（人間の意図: Reviewer Critical#1 の再発防止。選手が2種目 (X, Y) にエントリー済みの" +
      "状態でXをYに付け替えても、Yの既存エントリーが不当に上書きされず、Xの行が" +
      "削除対象として正しく検出されること）",
    () => {
      const existingX = makeExisting({ id: "e-X", style_id: 3, entry_time: 60.5 });
      const existingY = makeExisting({ id: "e-Y", style_id: 9, entry_time: 40.0 });
      // X の行だけを Y に付け替える（Yの既存行はフォーム上に残さない= 削除対象になる）
      const rowXtoY = makeDraft({ existingEntryId: "e-X", styleId: 9, entryTimeInput: "1:00.50" });

      const diff = diffEntryRows([existingX, existingY], [rowXtoY], "comp-1", "team-1");

      // e-X は style_id 変更で updated 1件のみ
      expect(diff.toUpdate).toEqual([
        { id: "e-X", patch: expect.objectContaining({ style_id: 9 }) },
      ]);
      // e-Y はフォーム上に対応行が無いため削除対象 (幽霊残留にならない)
      expect(diff.toDelete).toEqual(["e-Y"]);
      expect(diff.toCreate).toHaveLength(0);
    },
  );

  it(
    "既存行の style を未選択 ('') に戻した場合、その既存行は toDelete に入る" +
      "（人間の意図: Reviewer Critical#2 の観点。『種目未選択に戻した既存行が" +
      "4分類のどこにも表示されないまま削除される』という不整合を防ぐため、" +
      "diffEntryRows 自体の計算結果としては明確に toDelete に現れることを固定する。" +
      "この結果を確認モーダルに正しく反映するのは呼び出し側 [EntriesClient/" +
      "TeamEntryBulkFormScreen] の責務であり、それは別途 [V-07][V-02] で検証する）",
    () => {
      const existing = makeExisting({ id: "e-1", style_id: 3, entry_time: 60.5 });
      const clearedRow = makeDraft({ existingEntryId: "e-1", styleId: "", entryTimeInput: "" });

      const diff = diffEntryRows([existing], [clearedRow], "comp-1", "team-1");

      expect(diff.toDelete).toEqual(["e-1"]);
      expect(diff.toCreate).toHaveLength(0);
      expect(diff.toUpdate).toHaveLength(0);
    },
  );

  it(
    "既存エントリーが複数ある状態で current を空配列にする（全削除保存）と、" +
      "既存の全件が toDelete に入る（人間の意図: Reviewer Critical#3 の観点。" +
      "mobile 側の handleOpenConfirm が validDraftRows.length===0 でブロックする" +
      "実装だと、この『全削除して保存』が UI から到達不能になる。diffEntryRows 自体は" +
      "全削除を正しく計算できることを固定し、呼び出し側のブロック条件が" +
      "over-restrictive であることを問題として切り出す）",
    () => {
      const existing1 = makeExisting({ id: "e-1", style_id: 3 });
      const existing2 = makeExisting({ id: "e-2", style_id: 9, user_id: "user-2" });

      const diff = diffEntryRows([existing1, existing2], [], "comp-1", "team-1");

      expect(diff.toDelete.sort()).toEqual(["e-1", "e-2"]);
      expect(diff.toCreate).toHaveLength(0);
      expect(diff.toUpdate).toHaveLength(0);
    },
  );

  it(
    "existing/current が両方空配列のとき、4分類すべてが空になる（人間の意図: 境界値。" +
      "大会に選手が誰もエントリーしていない初期状態でクラッシュしないこと）",
    () => {
      const diff = diffEntryRows([], [], "comp-1", "team-1");
      expect(diff).toEqual({ toCreate: [], toUpdate: [], toDelete: [], unchanged: [] });
    },
  );

  it(
    "entryTimeInput が空文字の新規行は entry_time: null として toCreate に入る" +
      "（人間の意図: タイム未入力＝エントリーのみ先行登録というユースケースを壊さない）",
    () => {
      const row = makeDraft({ existingEntryId: null, entryTimeInput: "" });
      const diff = diffEntryRows([], [row], "comp-1", "team-1");
      expect(diff.toCreate[0].entry_time).toBeNull();
    },
  );

  it(
    "浮動小数点の代表値 (65.23 / 120.07 / 599.99) は parseTimeFlexible → " +
      "entry_time のround-tripで既存値と等価判定される（人間の意図: Reviewer実測で" +
      "『ビット一致・誤検出は再現せず』と確認済みの値を回帰テストとして固定する。" +
      "浮動小数点比較のズレで『変更なし』の行が誤って 'updated' 扱いになると、" +
      "差分確認モーダルに無関係な行が紛れ込み、管理者の確認作業を妨げる)",
    () => {
      const cases: Array<{ seconds: number; input: string }> = [
        { seconds: 65.23, input: "1:05.23" },
        { seconds: 120.07, input: "2:00.07" },
        { seconds: 599.99, input: "9:59.99" },
      ];

      for (const { seconds, input } of cases) {
        const existing = makeExisting({ id: "e-1", entry_time: seconds });
        const row = makeDraft({ existingEntryId: "e-1", entryTimeInput: input });
        const kind = classifyEntryRow(row, new Map([["e-1", existing]]));
        expect(kind).toBe("unchanged");
      }
    },
  );
});

describe("partitionConflictingDeletes (W3: 種目付け替え + 削除の同時保存でUNIQUE制約違反を防ぐ)", () => {
  it(
    "既存行Xの種目を、削除対象になる既存行Yの種目に付け替えるとき、Yのidは " +
      "'conflicting' に分類される（人間の意図: PM指示W3の核心。この削除を後回しにすると、" +
      "Xの更新(自然キーがYと衝突)がUNIQUE制約違反で失敗する。conflicting側は先行削除" +
      "すべき対象として区別できること）",
    () => {
      const existingX = makeExisting({ id: "e-X", style_id: 3, entry_time: 60.5 });
      const existingY = makeExisting({ id: "e-Y", style_id: 9, entry_time: 40.0 });
      const rowXtoY = makeDraft({ existingEntryId: "e-X", styleId: 9, entryTimeInput: "1:00.50" });

      const diff = diffEntryRows([existingX, existingY], [rowXtoY], "comp-1", "team-1");
      const { conflicting, safe } = partitionConflictingDeletes(
        diff,
        [existingX, existingY],
        [rowXtoY],
      );

      expect(conflicting).toEqual(["e-Y"]);
      expect(safe).toEqual([]);
    },
  );

  it(
    "自然キーが衝突しない通常の削除は 'safe' に分類される（人間の意図: 無関係な削除を" +
      "conflicting側に誤分類して不要な先行削除クエリを増やさないこと）",
    () => {
      const existingX = makeExisting({ id: "e-X", style_id: 3 });
      const existingZ = makeExisting({ id: "e-Z", style_id: 13, user_id: "user-2" });
      // existingZ に対応する draft 行が無い (単純な削除、自然キーの衝突相手も無い)
      const diff = diffEntryRows([existingX, existingZ], [makeDraft({ existingEntryId: "e-X" })], "comp-1", "team-1");
      const { conflicting, safe } = partitionConflictingDeletes(
        diff,
        [existingX, existingZ],
        [makeDraft({ existingEntryId: "e-X" })],
      );

      expect(safe).toEqual(["e-Z"]);
      expect(conflicting).toEqual([]);
    },
  );

  it(
    "toCreate (新規行) の自然キーと衝突する削除も 'conflicting' に分類される（人間の意図: " +
      "種目付け替えは既存行の更新だけでなく、新規追加行との衝突でも同じ問題が起こりうる。" +
      "toUpdate だけでなく toCreate も衝突判定の対象にすること）",
    () => {
      const existingY = makeExisting({ id: "e-Y", style_id: 9, user_id: "user-1" });
      const newRow = makeDraft({
        localId: "new-1",
        existingEntryId: null,
        targetUserId: "user-1",
        styleId: 9,
        entryTimeInput: "1:00.00",
      });
      // existingY に対応する draft 行が current に無い → toDelete に入る一方、
      // newRow が同じ自然キー (user-1, style9) で toCreate に入る
      const diff = diffEntryRows([existingY], [newRow], "comp-1", "team-1");
      const { conflicting } = partitionConflictingDeletes(diff, [existingY], [newRow]);

      expect(conflicting).toEqual(["e-Y"]);
    },
  );
});

describe(
  "web/mobile 共通ロジックの一致性検証 (PM指示: 同じ入力 → 同じ4分類であること)",
  () => {
    it(
      "styleId が未選択 ('') の行を含む配列をそのまま渡す (web方式) のと、事前に" +
        "styleId!=='' でフィルタした配列を渡す (mobile方式、validDraftRowsに相当) のとで、" +
        "diffEntryRows の結果が完全に一致する（人間の意図: App Developer申し送り。" +
        "mobileはvalidDraftRowsで事前フィルタしてから渡しており、shared側も内部で" +
        "同じスキップを行うため『二重フィルタ』になっている。挙動が本当に同一であることを" +
        "shared側のテストとして固定し、将来 diffEntryRows の内部実装が変わっても" +
        "web/mobileの結果不一致を機械的に検出できるようにする）",
      () => {
        const existing = [
          makeExisting({ id: "e-1", user_id: "user-1", style_id: 3, entry_time: 60.5 }),
          makeExisting({ id: "e-2", user_id: "user-2", style_id: 9, entry_time: 40.0 }),
        ];
        const fullRows: EntryDraftRow[] = [
          // 更新される既存行
          makeDraft({ localId: "r1", existingEntryId: "e-1", targetUserId: "user-1", styleId: 3, entryTimeInput: "1:02.00" }),
          // 種目未選択のまま追加された空行 (webはこれをそのまま配列に含めて渡す)
          makeDraft({ localId: "r2", existingEntryId: null, targetUserId: "user-1", styleId: "" }),
          // 新規作成される行
          makeDraft({ localId: "r3", existingEntryId: null, targetUserId: "user-3", styleId: 13, entryTimeInput: "0:35.00" }),
        ];
        // mobile方式: styleId !== "" で事前フィルタした配列 (validDraftRows相当)
        const filteredRows = fullRows.filter((r) => r.styleId !== "");

        const diffWebStyle = diffEntryRows(existing, fullRows, "comp-1", "team-1");
        const diffMobileStyle = diffEntryRows(existing, filteredRows, "comp-1", "team-1");

        expect(diffWebStyle).toEqual(diffMobileStyle);
      },
    );
  },
);

describe("findDuplicateMemberStylePairs", () => {
  it(
    "同一選手・同一種目の行が2件あると両方が重複として検出される" +
      "（人間の意図: 仕様#7『重複行は入力時点でエラー + 保存ボタン disabled』の" +
      "判定材料そのもの）",
    () => {
      const rowA = makeDraft({ localId: "r1", targetUserId: "user-1", styleId: 3 });
      const rowB = makeDraft({ localId: "r2", targetUserId: "user-1", styleId: 3 });
      const duplicates = findDuplicateMemberStylePairs([rowA, rowB]);
      expect(duplicates.has("user-1:3")).toBe(true);
      expect(duplicates.size).toBe(1);
    },
  );

  it(
    "同一選手でも種目が異なれば重複にならない（人間の意図: " +
      "『1選手あたりの種目数上限なし』（仕様#4）を重複検出が誤って妨げないこと）",
    () => {
      const rowA = makeDraft({ localId: "r1", targetUserId: "user-1", styleId: 3 });
      const rowB = makeDraft({ localId: "r2", targetUserId: "user-1", styleId: 9 });
      expect(findDuplicateMemberStylePairs([rowA, rowB]).size).toBe(0);
    },
  );

  it(
    "styleId が未選択 ('') の行は重複判定の対象外になる（人間の意図: " +
      "新規追加した空行が既存行と誤って重複判定されないこと）",
    () => {
      const rowA = makeDraft({ localId: "r1", targetUserId: "user-1", styleId: "" });
      const rowB = makeDraft({ localId: "r2", targetUserId: "user-1", styleId: "" });
      expect(findDuplicateMemberStylePairs([rowA, rowB]).size).toBe(0);
    },
  );
});

describe("isPrefillUntouched", () => {
  it(
    "prefillSource: 'bestTime' かつ entryTimeInput が prefilledInput と一致する行は true" +
      "（人間の意図: 仕様#4『ベストタイムのまま未編集の行を⚠️で明示』の判定条件そのもの）",
    () => {
      const row = makeDraft({ prefillSource: "bestTime", prefilledInput: "1:00.50", entryTimeInput: "1:00.50" });
      expect(isPrefillUntouched(row)).toBe(true);
    },
  );

  it(
    "プリフィル後に値を編集した行（entryTimeInput が prefilledInput と異なる）は false" +
      "（人間の意図: 編集済みの値を誤って『未編集』として警告し続けないこと）",
    () => {
      const row = makeDraft({ prefillSource: "bestTime", prefilledInput: "1:00.50", entryTimeInput: "1:02.00" });
      expect(isPrefillUntouched(row)).toBe(false);
    },
  );

  it(
    "プリフィルされていない行 (prefillSource: null) は false" +
      "（人間の意図: 手動入力の行に無関係な警告を出さないこと）",
    () => {
      const row = makeDraft({ prefillSource: null, prefilledInput: null, entryTimeInput: "1:00.50" });
      expect(isPrefillUntouched(row)).toBe(false);
    },
  );

  it(
    "更新対象の既存行に対して『流用』ボタンでベストタイムを再適用した場合も true になる" +
      "（人間の意図: Reviewer Critical#4 の観点。⚠️警告は新規作成行だけでなく、既存行の" +
      "更新にも同じ判定ロジックが適用されるべきこと。isPrefillUntouched 自体は" +
      "existingEntryId の有無を見ないため新規/更新のどちらでも同じ結果を返すことを固定する）",
    () => {
      const updatedExistingRow = makeDraft({
        existingEntryId: "e-1",
        prefillSource: "bestTime",
        prefilledInput: "1:05.00",
        entryTimeInput: "1:05.00",
      });
      expect(isPrefillUntouched(updatedExistingRow)).toBe(true);
    },
  );
});

describe("toEntryInsert / toEntryUpdate", () => {
  it(
    "toEntryInsert は is_relaying: false を常に固定する（人間の意図: 仕様#3『リレーは" +
      "スコープ外 (is_relaying false 固定)』。呼び出し側の入力に関わらずリレー扱いに" +
      "ならないこと）",
    () => {
      const row = makeDraft({ existingEntryId: null });
      const insert = toEntryInsert(row, "comp-1", "team-1");
      expect(insert.is_relaying).toBe(false);
    },
  );

  it(
    "toEntryUpdate は note が空文字のとき null に正規化する（人間の意図: DBの note カラムが" +
      "空文字と null を区別して重複判定してしまう事故を防ぐ、既存 EntryAPI と同じ規約）",
    () => {
      const row = makeDraft({ note: "" });
      expect(toEntryUpdate(row).note).toBeNull();
    },
  );

  it(
    "99999999.99 のような桁上限付近の値でも例外を投げずに変換できる" +
      "（人間の意図: Reviewer申し送り。numeric(10,2) の桁上限付近に型ガードが無いため、" +
      "回帰観点として固定する。実際にDBに保存可能かはPostgres側の制約であり、" +
      "ここでは純粋関数がクラッシュしないことのみを保証する）",
    () => {
      const row = makeDraft({ entryTimeInput: "99999999.99" });
      expect(() => toEntryInsert(row, "comp-1", "team-1")).not.toThrow();
    },
  );
});
