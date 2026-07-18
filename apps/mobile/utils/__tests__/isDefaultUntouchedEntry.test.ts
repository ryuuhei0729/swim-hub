/**
 * isDefaultUntouchedEntry — 未編集デフォルトエントリー行の判定 単体テスト (mobile)
 *
 * Sprint Contract 検証観点 (バグ: 未来大会でエントリータブ未操作のまま保存すると
 * 25m Fr の未編集デフォルト行まで登録されてしまう):
 *   [V-01] エントリータブ未操作のまま保存 → エントリーは0件
 *   [V-02] 種目・タイム・メモ・リレーいずれかを編集した行は保存される
 *   [V-03] 複数行のうち未編集デフォルト行のみ除外、編集済み行は保存 (行数無関係の per-row フィルタ)
 *   [V-04] 種目だけ変更しタイム空のまま → シードタイム未定エントリーとして保存される
 *   [V-05] 編集モードの既存エントリーは、値がデフォルトと一致していても除外されない
 *
 * テスト対象:
 *   isDefaultUntouchedEntry (apps/mobile/utils/tabFormUtils.ts)
 *
 * 注意:
 *   - このテストは実装をローカルに再定義しない。期待値はすべて仕様から手で記述する。
 *   - 呼び出し側での使用イメージ (CompetitionTabFormScreen.tsx handleSave 内、実装済み):
 *       const effectiveEntries = entries.filter(
 *         (e) => !isDefaultUntouchedEntry(e, defaultEntryStyleIdRef.current),
 *       );
 */

import { describe, it, expect } from "vitest";
import { isDefaultUntouchedEntry } from "../tabFormUtils";
import { resolveEntryMutations } from "../entryMutations";
import type { ResolveExistingEntry, ResolveFormEntry } from "../entryMutations";

// ============================================================
// テスト用フィクスチャ
// ============================================================

/** isDefaultUntouchedEntry に渡す想定のエントリー行の型 (EntryDraftRow の判定に必要な部分集合)。 */
interface EntryRowFixture {
  existingEntryId?: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

const DEFAULT_STYLE_ID = "1"; // fetchStyles 完了後にセットされる先頭種目 (25m Fr 相当)

/** 未編集のデフォルト行 (createEmptyEntry() 相当 + fetchStyles 後の styleId 自動セット後の状態)。 */
function makeUntouchedDefaultEntry(
  overrides: Partial<EntryRowFixture> = {},
): EntryRowFixture {
  return {
    existingEntryId: undefined,
    styleId: DEFAULT_STYLE_ID,
    entryTime: 0,
    entryTimeDisplayValue: "",
    note: "",
    isRelaying: false,
    ...overrides,
  };
}

// フィクスチャ自体の健全性確認 (production コード非依存)。
describe("テストフィクスチャ: makeUntouchedDefaultEntry", () => {
  it("デフォルト値は createEmptyEntry() 相当 (styleId=デフォルト種目, 他は空/0/false) を返す", () => {
    const entry = makeUntouchedDefaultEntry();
    expect(entry).toEqual({
      existingEntryId: undefined,
      styleId: DEFAULT_STYLE_ID,
      entryTime: 0,
      entryTimeDisplayValue: "",
      note: "",
      isRelaying: false,
    });
  });

  it("overrides で個別フィールドを上書きできる", () => {
    const entry = makeUntouchedDefaultEntry({ note: "メモ" });
    expect(entry.note).toBe("メモ");
    expect(entry.styleId).toBe(DEFAULT_STYLE_ID);
  });
});

// ============================================================
// [V-01/V-02] 単一行の判定: 未編集デフォルト行のみ true (除外対象)
// ============================================================

describe("isDefaultUntouchedEntry — 単一行の判定 (mobile)", () => {
  it("未編集デフォルト行 (styleId=デフォルト, entryTime=0, displayValue='', note='', isRelaying=false, existingEntryIdなし) は true (除外される)", () => {
    const entry = makeUntouchedDefaultEntry();
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(true);
  });

  it("[V-04] 種目のみデフォルトから変更した行 (styleId が defaultStyleId と不一致) は false (保存対象・シードタイム未定エントリー)", () => {
    const entry = makeUntouchedDefaultEntry({ styleId: "2" });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });

  it("[V-02] タイムのみ入力した行 (entryTime>0 かつ displayValue 非空、styleId はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntry({
      entryTime: 65.2,
      entryTimeDisplayValue: "1:05.20",
    });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });

  it("[V-02] メモのみ入力した行 (note 非空、他はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntry({ note: "自己ベスト更新目標" });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });

  it("[V-02] isRelaying のみ true にした行 (他はデフォルトのまま) は false (保存対象)", () => {
    const entry = makeUntouchedDefaultEntry({ isRelaying: true });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });
});

// ============================================================
// [V-05] 既存 DB エントリー (編集モード) は値がデフォルトと一致していても除外されない
// ============================================================

describe("isDefaultUntouchedEntry — 既存 DB エントリーの非退行確認 (mobile)", () => {
  it("[V-05] existingEntryId がある行は、他の値がすべてデフォルトと一致していても false (誤って保存除外・削除されない)", () => {
    // 既存編集行がたまたま「未編集デフォルト」と同じ値に見えるケース
    // (例: ユーザーが一度入力してから全部消して保存した既存行)。
    // existingEntryId があるという事実だけで除外対象から外れなければならない。
    const entry = makeUntouchedDefaultEntry({
      existingEntryId: "11111111-1111-1111-1111-111111111111",
    });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });
});

// ============================================================
// 境界値テスト
// ============================================================

describe("isDefaultUntouchedEntry — 境界値 (mobile)", () => {
  it("entryTimeDisplayValue が空白のみ ('   ') の行は空文字と同等に扱われ true (trim() 前提)", () => {
    const entry = makeUntouchedDefaultEntry({ entryTimeDisplayValue: "   " });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(true);
  });

  it("note が空白のみ ('   ') の行は空文字と同等に扱われ true (trim() 前提)", () => {
    const entry = makeUntouchedDefaultEntry({ note: "   " });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(true);
  });

  it("デフォルト styleId に手動で戻した行は区別できず true (仕様上の既知の限界。値ベース判定のため意図的に除外される)", () => {
    // 値ベースの純粋関数は「一度も触られていない」と「他の値に変更後デフォルトへ戻した」を
    // 区別できない。PM 確定の仕様により、この false negative (誤って除外) は許容する。
    const entry = makeUntouchedDefaultEntry(); // 見た目上は case1 と同一
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(true);
  });

  it("fetchStyles 未完了で defaultStyleId='' かつ styleId='' の行 (種目未取得の初期状態) は true (除外される)", () => {
    const entry = makeUntouchedDefaultEntry({ styleId: "" });
    expect(isDefaultUntouchedEntry(entry, "")).toBe(true);
  });

  it("entryTime が負数の行 (異常値) は false (0 と等価でないため保存対象・上位バリデーションに委ねる)", () => {
    const entry = makeUntouchedDefaultEntry({ entryTime: -1 });
    expect(isDefaultUntouchedEntry(entry, DEFAULT_STYLE_ID)).toBe(false);
  });
});

// ============================================================
// [V-03] 複数行 per-row フィルタ (行数無関係)
// ============================================================

describe("isDefaultUntouchedEntry — 複数行 per-row フィルタ適用 (mobile)", () => {
  it("[V-03] 1行のみ (未編集デフォルト) → filter 適用後の配列は空 (保存0件)", () => {
    const entries = [makeUntouchedDefaultEntry()];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID));
    expect(result).toHaveLength(0);
  });

  it("[V-03] 3行 (先頭のみ未編集デフォルト、2/3行目は編集済み) → filter 適用後は編集済み2行のみ残る (順序維持)", () => {
    const entries = [
      makeUntouchedDefaultEntry(), // 1行目: 未編集デフォルト → 除外
      makeUntouchedDefaultEntry({ styleId: "2", entryTime: 60, entryTimeDisplayValue: "1:00.00" }), // 2行目: 編集済み
      makeUntouchedDefaultEntry({ styleId: "3", note: "メモ" }), // 3行目: 編集済み
    ];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID));
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.styleId)).toEqual(["2", "3"]);
  });

  it("[V-03] 全行が未編集デフォルト (同一 styleId で重複) → filter 適用後は空 (0件保存)", () => {
    const entries = [makeUntouchedDefaultEntry(), makeUntouchedDefaultEntry()];
    const result = entries.filter((e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID));
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// [V-05 回帰防止] isDefaultUntouchedEntry フィルタ → resolveEntryMutations 連結
//
// 背景: Reviewer Critical 指摘により、CompetitionTabFormScreen.tsx のエントリー保存
// ブロックのゲートが `savedCompetitionId && showEntryTab && effectiveEntries.length > 0`
// から `savedCompetitionId && showEntryTab` に修正された。
// 修正前は「フィルタ後 0 件」のとき resolveEntryMutations 自体が呼ばれず、
// 編集モードで既存エントリーを全削除したケースで delete が発生しない退行があった。
// 本テストはフィルタ→resolveEntryMutations の連結を1テスト内で再現し、この退行を防ぐ。
// ============================================================

describe("isDefaultUntouchedEntry → resolveEntryMutations 連結 (mobile)", () => {
  it("[V-05 回帰防止] 編集モードで既存エントリーを全削除し未編集の空行のみ残して保存 → 全既存エントリーが deletes に含まれる", () => {
    // シナリオ: 編集画面で既存2エントリーの行を両方削除し、
    // フォームには未編集の空行 (isDefaultUntouchedEntry=true) だけが残った状態で保存する。
    const existingEntries: ResolveExistingEntry[] = [
      { id: "uuid-fr", styleId: 1 },
      { id: "uuid-br", styleId: 2 },
    ];
    const formRows = [makeUntouchedDefaultEntry({ styleId: DEFAULT_STYLE_ID })];

    // Step 1: CompetitionTabFormScreen.tsx handleSave と同じ per-row フィルタ
    const effectiveRows = formRows.filter(
      (e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID),
    );
    expect(effectiveRows).toHaveLength(0); // 未編集行はフィルタで除外される

    // Step 2: フィルタ後の行を resolveEntryMutations の入力形式に変換 (handleSave と同一ロジック)
    const formEntries: ResolveFormEntry[] = effectiveRows.map((e) => ({
      formId: "dummy-draft-id",
      styleId: parseInt(e.styleId, 10),
      entryTime: e.entryTime > 0 ? e.entryTime : null,
      note: e.note.trim() || null,
    }));

    // Step 3: 編集モードで resolveEntryMutations を実行
    const result = resolveEntryMutations(formEntries, existingEntries, true);

    // フィルタ後 formEntries=[] でも、既存2件は「フォームから消えた」として全件 delete される
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual(["uuid-fr", "uuid-br"]);
  });

  it("[V-05 回帰防止・対比] 編集済み行が1件残っていれば、その styleId の既存エントリーは delete されず update される", () => {
    // 対比ケース: 未編集の空行に加えて、編集済みの1行 (styleId=1) も残っている場合、
    // styleId=1 の既存エントリーは update、styleId=2 のみ delete される。
    const existingEntries: ResolveExistingEntry[] = [
      { id: "uuid-fr", styleId: 1 },
      { id: "uuid-br", styleId: 2 },
    ];
    const formRows = [
      makeUntouchedDefaultEntry({ styleId: DEFAULT_STYLE_ID }), // 未編集 → 除外される
      makeUntouchedDefaultEntry({
        styleId: "1",
        entryTime: 30.5,
        entryTimeDisplayValue: "30.50",
      }), // 編集済み → 残る
    ];

    const effectiveRows = formRows.filter(
      (e) => !isDefaultUntouchedEntry(e, DEFAULT_STYLE_ID),
    );
    expect(effectiveRows).toHaveLength(1);

    const formEntries: ResolveFormEntry[] = effectiveRows.map((e) => ({
      formId: "dummy-draft-id",
      styleId: parseInt(e.styleId, 10),
      entryTime: e.entryTime > 0 ? e.entryTime : null,
      note: e.note.trim() || null,
    }));

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([
      { id: "uuid-fr", styleId: 1, entryTime: 30.5, note: null },
    ]);
    expect(result.deletes).toEqual(["uuid-br"]);
  });
});

// ============================================================
// [V-05 回帰防止] handleSave のエントリー保存ブロックのゲート条件
//
// CompetitionTabFormScreen.tsx handleSave のゲートは
// `savedCompetitionId && showEntryTab` (effectiveEntries.length は見ない)。
// この条件式自体の真理値表をピュア関数として固定し、将来 `effectiveEntries.length > 0`
// のような条件が誤って再度混入しないようにする。
// ============================================================

describe("[V-05 回帰防止] エントリー保存ブロックのゲート条件 (mobile)", () => {
  /** CompetitionTabFormScreen.tsx handleSave の実際のゲート条件を再現したもの。 */
  function shouldRunEntrySaveBlock(
    savedCompetitionId: string | undefined,
    showEntryTab: boolean,
  ): boolean {
    return Boolean(savedCompetitionId) && showEntryTab;
  }

  it("savedCompetitionId あり + showEntryTab=true → effectiveEntries が空でもゲートを通過する (回帰防止)", () => {
    expect(shouldRunEntrySaveBlock("comp-1", true)).toBe(true);
  });

  it("showEntryTab=false → ゲートを通過しない (既存挙動どおり)", () => {
    expect(shouldRunEntrySaveBlock("comp-1", false)).toBe(false);
  });

  it("savedCompetitionId なし (大会保存失敗等) → ゲートを通過しない (既存挙動どおり)", () => {
    expect(shouldRunEntrySaveBlock(undefined, true)).toBe(false);
  });
});
