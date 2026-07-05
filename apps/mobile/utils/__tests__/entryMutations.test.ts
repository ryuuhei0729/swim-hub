/**
 * entryMutations — resolveEntryMutations 単体テスト
 *
 * Sprint Contract 検証観点 (Critical C-1 / C-2 解消):
 * - C-1: セルフエントリー保存の衝突解決でデータ損失が起きないこと
 * - C-2: 実装 (resolveEntryMutations) を import して検証し、トートロジー (実装の再実装) を避ける
 *
 * 注意: このテストは実装をローカルに再定義しない。
 *       期待値はすべて「あるべき結果」を手で記述する (実装からのコピーではない)。
 */

import { describe, it, expect } from "vitest";
import { resolveEntryMutations } from "../entryMutations";
import type {
  ResolveFormEntry,
  ResolveExistingEntry,
} from "../entryMutations";

// テスト用ヘルパー (表示文字列ではなく確定値でフォーム行を作る)
const form = (
  formId: string,
  styleId: number,
  entryTime: number | null = null,
  note: string | null = null,
): ResolveFormEntry => ({ formId, styleId, entryTime, note });

const existing = (id: string, styleId: number): ResolveExistingEntry => ({
  id,
  styleId,
});

// 種目 style_id の定数 (Fr=1, Br=2 とする / 値は任意だがテスト内で固定)
const FR = 1;
const BR = 2;
const FLY = 3;

describe("resolveEntryMutations — C-1 種目変更によるデータ損失防止", () => {
  it("[C-1] A(Fr)/B(Br) で A の種目を Br に変更 → B を A の編集値で update / A を delete / create なし / 行重複なし", () => {
    // 既存: A=uuidA(Fr), B=uuidB(Br)
    const existingEntries = [existing("uuidA", FR), existing("uuidB", BR)];

    // フォーム上: A の行を Br に変更し、A の編集値 (time=70.0, note="Aの編集") を入力。
    // B の行はフォームから消えた (A が B の種目を奪った) 想定。
    const formEntries = [form("uuidA", BR, 70.0, "Aの編集")];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    // updates: Br の DB id (uuidB) に対して A の編集値が入る。1件のみ。
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toEqual({
      id: "uuidB",
      styleId: BR,
      entryTime: 70.0,
      note: "Aの編集",
    });

    // creates は空 (Br は既存があるため create しない)
    expect(result.creates).toEqual([]);

    // deletes: フォームに残らなかった uuidA のみ
    expect(result.deletes).toEqual(["uuidA"]);

    // 行重複なし: update の id 集合と delete の id 集合が互いに素
    const updateIds = result.updates.map((u) => u.id);
    expect(updateIds).not.toContain("uuidA");
    expect(result.deletes).not.toContain("uuidB");

    // B の旧値で上書きされていないことの確認 (entryTime が A の編集値であること)
    expect(result.updates[0].entryTime).toBe(70.0);
    expect(result.updates[0].note).toBe("Aの編集");
  });

  it("[C-1 swap] A(Fr)↔B(Br) のスワップ → 重複・損失なし、各 DB id は一度ずつ update、delete なし", () => {
    // 既存: uuidA=Fr, uuidB=Br
    const existingEntries = [existing("uuidA", FR), existing("uuidB", BR)];

    // フォーム: A の行を Br に、B の行を Fr に入れ替える。
    const formEntries = [
      form("uuidA", BR, 70.0, "A→Br"),
      form("uuidB", FR, 60.0, "B→Fr"),
    ];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    // Br の既存 id=uuidB を A の値で update、Fr の既存 id=uuidA を B の値で update。
    expect(result.updates).toHaveLength(2);

    const byId = Object.fromEntries(result.updates.map((u) => [u.id, u]));
    // Fr (styleId=1) は uuidA、B→Fr の値
    expect(byId["uuidA"]).toEqual({
      id: "uuidA",
      styleId: FR,
      entryTime: 60.0,
      note: "B→Fr",
    });
    // Br (styleId=2) は uuidB、A→Br の値
    expect(byId["uuidB"]).toEqual({
      id: "uuidB",
      styleId: BR,
      entryTime: 70.0,
      note: "A→Br",
    });

    // 各 id は一度ずつだけ update (二重 update なし)
    const ids = result.updates.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);

    // create も delete も無い (両 style とも既存があり、消えた style もない)
    expect(result.creates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("resolveEntryMutations — 同一 style の集約", () => {
  it("同一 style を 2 行入力 → 1 つに集約 (後勝ち)。既存なしなら create 1 件のみ", () => {
    const formEntries = [
      form("1", FR, 30.0, "1行目"),
      form("2", FR, 31.0, "2行目"),
    ];

    const result = resolveEntryMutations(formEntries, [], false);

    // 集約により create は 1 件、最後の行の値が採用される
    expect(result.creates).toHaveLength(1);
    expect(result.creates[0]).toEqual({
      styleId: FR,
      entryTime: 31.0,
      note: "2行目",
    });
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  it("同一 style を 2 行入力 + 既存あり → update 1 件のみ (後勝ち、二重 update なし)", () => {
    const existingEntries = [existing("uuidFr", FR)];
    const formEntries = [
      form("uuidFr", FR, 30.0, "古い"),
      form("dup", FR, 31.0, "新しい"),
    ];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toEqual({
      id: "uuidFr",
      styleId: FR,
      entryTime: 31.0,
      note: "新しい",
    });
    expect(result.creates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("resolveEntryMutations — 新規モード (isEditMode=false)", () => {
  it("新規モードで同一 style の既存あり → update に振替され、delete は発生しない", () => {
    // 新規作成フローでも UNIQUE 制約のため既存があれば update する (web 準拠)
    const existingEntries = [existing("uuidFr", FR), existing("uuidBr", BR)];
    // フォームは Fr のみ (Br はフォームに無い)
    const formEntries = [form("1", FR, 28.5, "新規だが既存あり")];

    const result = resolveEntryMutations(formEntries, existingEntries, false);

    // Fr は既存があるので update
    expect(result.updates).toEqual([
      { id: "uuidFr", styleId: FR, entryTime: 28.5, note: "新規だが既存あり" },
    ]);
    // create は無い
    expect(result.creates).toEqual([]);
    // 新規モードなので、フォームに無い Br の既存があっても delete しない
    expect(result.deletes).toEqual([]);
  });

  it("新規モードで既存なし → create のみ、delete なし", () => {
    const formEntries = [form("1", FR, 28.5, null), form("2", BR, 40.0, null)];

    const result = resolveEntryMutations(formEntries, [], false);

    expect(result.creates).toHaveLength(2);
    expect(result.creates).toEqual([
      { styleId: FR, entryTime: 28.5, note: null },
      { styleId: BR, entryTime: 40.0, note: null },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });
});

describe("resolveEntryMutations — 削除 (編集モードのみ)", () => {
  it("[編集モード] フォームから消えた既存 style → delete される", () => {
    const existingEntries = [existing("uuidFr", FR), existing("uuidBr", BR)];
    // フォームには Fr のみ残し、Br は消えた
    const formEntries = [form("uuidFr", FR, 30.0, null)];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    expect(result.updates).toEqual([
      { id: "uuidFr", styleId: FR, entryTime: 30.0, note: null },
    ]);
    expect(result.creates).toEqual([]);
    expect(result.deletes).toEqual(["uuidBr"]);
  });

  it("[編集モード] 全 style がフォームから消えた → 全件 delete、create/update なし", () => {
    const existingEntries = [existing("uuidFr", FR), existing("uuidBr", BR)];
    const result = resolveEntryMutations([], existingEntries, true);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual(["uuidFr", "uuidBr"]);
  });

  it("[新規モード] フォームから消えた既存 style があっても delete しない", () => {
    const existingEntries = [existing("uuidFr", FR), existing("uuidBr", BR)];
    const formEntries = [form("uuidFr", FR, 30.0, null)];

    const result = resolveEntryMutations(formEntries, existingEntries, false);

    expect(result.deletes).toEqual([]);
    expect(result.updates).toEqual([
      { id: "uuidFr", styleId: FR, entryTime: 30.0, note: null },
    ]);
  });
});

describe("resolveEntryMutations — 無効 style の無視", () => {
  it("styleId が 0 / 負数 / 非整数 / NaN の行は無視される", () => {
    const formEntries = [
      form("a", 0, 30.0, null), // 0
      form("b", -1, 30.0, null), // 負数
      form("c", 1.5, 30.0, null), // 非整数
      form("d", NaN, 30.0, null), // NaN
      form("e", FLY, 45.0, "有効"), // 有効
    ];

    const result = resolveEntryMutations(formEntries, [], false);

    // 有効な FLY のみ create
    expect(result.creates).toEqual([
      { styleId: FLY, entryTime: 45.0, note: "有効" },
    ]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual([]);
  });

  it("無効 style の既存エントリーは (編集モードで) フォームに対応行が無いため delete される", () => {
    // 既存 Fr があり、フォームには無効行のみ → Fr はフォームから消えた扱い
    const existingEntries = [existing("uuidFr", FR)];
    const formEntries = [form("a", 0, 30.0, null)];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.deletes).toEqual(["uuidFr"]);
  });
});

describe("resolveEntryMutations — 不変条件 (create/update/delete が互いに素)", () => {
  it("update に使った DB id は delete に含まれない (二重処理なし)", () => {
    const existingEntries = [
      existing("u1", FR),
      existing("u2", BR),
      existing("u3", FLY),
    ];
    // Fr と Br は残す (update)、Fly は消す (delete)
    const formEntries = [form("u1", FR, 30, null), form("u2", BR, 40, null)];

    const result = resolveEntryMutations(formEntries, existingEntries, true);

    const updateIds = new Set(result.updates.map((u) => u.id));
    const deleteIds = new Set(result.deletes);

    // 互いに素
    for (const id of updateIds) {
      expect(deleteIds.has(id)).toBe(false);
    }
    // update id は一意
    expect(result.updates.map((u) => u.id).length).toBe(updateIds.size);
    // 残らなかった u3 のみ delete
    expect(result.deletes).toEqual(["u3"]);
  });
});
