// QA Phase A: テンプレート適用の非破壊マージ契約テスト。
//
// 【重要 (Reviewer Critical, Phase B で追記)】
// 本ファイルは applyTemplateToMenuAt という **テスト内だけの独自再実装** を検証しており、
// TeamPracticeLogBulkFormScreen.tsx の実際の handleTemplateSelect を一度も呼び出さない。
// そのため本ファイル単体では D-5 (テンプレート非破壊マージ) の回帰保護には**ならない**
// (将来 handleTemplateSelect が `{...menu, ...template}` のような丸ごと上書きに書き換えられても、
// このファイルは無関係に green のまま通り続ける)。
// 仕様の言語化 (Developer向けの契約提示) としての価値のみを持つドキュメントとして残す。
// D-5 の実際の回帰保護は
// screens/__tests__/TeamPracticeLogBulkFormScreen.uiParity.test.tsx の [V-10] セクション
// (実画面 render → 実際のテンプレート選択導線 → 保存 RPC ペイロード検証) が担う。
//
// Planner/PM が指摘した最重要の設計判断:
//   個人側 (PracticeTabFormScreen.handleTemplateSelect) は `setMenus([templateMenu])` で
//   メニュー配列を丸ごと置換する。bulk 画面は複数メニューカードが並び、各カードが
//   targetUserIds (対象メンバー) と times (入力済みタイム) を持つため、個人側の実装を
//   そのままコピーすると「他カードの対象メンバーと入力済みタイムが消える」。
//   → bulk 版は当該カードのフィールドのみ上書きし、targetUserIds/times/videoAssets は
//     全メニューで保持する設計でなければならない。
//
// このファイルは、まだ実装されていない applyTemplateToMenuAt の「あるべき契約」を
// 先に固定する (TDD)。Developer は本ファイルの期待値を満たす形で実装すること
// (関数名・シグネチャ自体を厳密に一致させる必要はないが、screens/TeamPracticeLogBulkFormScreen.tsx
// の handleTemplateSelect 相当のロジックが下記契約を満たすことを Phase B で
// TeamPracticeLogBulkFormScreen.uiParity.test.tsx から統合的に検証する)。
//
// 【トートロジー防止】期待値は手計算で固定する。参照実装 applyTemplateToMenuAt はここでの
// 「正解」の定義そのものであり、プロダクションコードの複製ではない
// (プロダオション側はまだ存在しない = Phase A の時点)。
//
// 【ミューテーション実証】naiveReplaceAll (= 個人側と同じ setMenus([templateMenu]) 相当) を
// 併記し、同一テストケースに適用すると red になることを確認する。これにより
// 「他カードの非破壊」という契約がテストとして意味を持つ (=ガードを外すと本当に落ちる) ことを
// 実証する。

import { describe, it, expect } from "vitest";

interface Menu {
  id: string;
  style: string;
  swimCategory: "Swim" | "Pull" | "Kick";
  distance: number | "";
  reps: number | "";
  sets: number | "";
  circleMin: number | "";
  circleSec: number | "";
  note: string;
  tagIds: string[];
  targetUserIds: string[];
  times: Record<string, unknown>;
  videoAssets: Record<string, unknown>;
}

interface Template {
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  distance: number;
  rep_count: number;
  set_count: number;
  circle: number | null;
  note: string | null;
  tag_ids: string[];
}

function templateToMenuFields(template: Template) {
  const circle = template.circle || 0;
  return {
    style: template.style,
    swimCategory: template.swim_category,
    distance: template.distance,
    reps: template.rep_count,
    sets: template.set_count,
    circleMin: Math.floor(circle / 60),
    circleSec: circle % 60,
    note: template.note || "",
    tagIds: template.tag_ids,
  };
}

/**
 * あるべき実装 (契約) — 対象メニューのフィールドのみ上書きし、
 * targetUserIds/times/videoAssets は対象メニュー自身も含めて全メニューで保持する。
 */
function applyTemplateToMenuAt(menus: Menu[], targetId: string, template: Template): Menu[] {
  const fields = templateToMenuFields(template);
  return menus.map((menu) => (menu.id === targetId ? { ...menu, ...fields } : menu));
}

/**
 * 【ミューテーション対象】個人側 handleTemplateSelect と同型の「丸ごと置換」実装。
 * bulk 画面にそのまま移植すると発生する回帰を再現するための比較対象であり、
 * 本番コードではない (Phase A 時点では本番実装自体が存在しない)。
 */
function naiveReplaceAllLikePersonalScreen(
  _menus: Menu[],
  targetId: string,
  template: Template,
): Menu[] {
  const fields = templateToMenuFields(template);
  return [
    {
      id: targetId,
      ...fields,
      targetUserIds: [],
      times: {},
      videoAssets: {},
    },
  ];
}

function makeMenu(overrides: Partial<Menu>): Menu {
  return {
    id: "menu-1",
    style: "Fr",
    swimCategory: "Swim",
    distance: 100,
    reps: 4,
    sets: 1,
    circleMin: 1,
    circleSec: 30,
    note: "",
    tagIds: [],
    targetUserIds: [],
    times: {},
    videoAssets: {},
    ...overrides,
  };
}

const template: Template = {
  style: "Ba",
  swim_category: "Kick",
  distance: 50,
  rep_count: 8,
  set_count: 2,
  circle: 105,
  note: "テンプレ備考",
  tag_ids: ["tag-x"],
};

describe("[templateMergeContract] テンプレート適用は当該カードのみ上書きし他カードを保持する", () => {
  it("対象メニューのフィールドがテンプレート値に上書きされる", () => {
    const menus = [
      makeMenu({ id: "menu-1", targetUserIds: ["u-a"], times: { "u-a": ["t1"] } }),
      makeMenu({ id: "menu-2", targetUserIds: ["u-b"], times: { "u-b": ["t2"] } }),
    ];
    const result = applyTemplateToMenuAt(menus, "menu-1", template);
    const target = result.find((m) => m.id === "menu-1")!;
    expect(target.style).toBe("Ba");
    expect(target.swimCategory).toBe("Kick");
    expect(target.distance).toBe(50);
    expect(target.reps).toBe(8);
    expect(target.sets).toBe(2);
    expect(target.circleMin).toBe(1); // 105 / 60 = 1
    expect(target.circleSec).toBe(45); // 105 % 60 = 45
    expect(target.note).toBe("テンプレ備考");
    expect(target.tagIds).toEqual(["tag-x"]);
  });

  it("対象メニュー自身の targetUserIds/times/videoAssets は変更されない", () => {
    const menus = [
      makeMenu({
        id: "menu-1",
        targetUserIds: ["u-a", "u-b"],
        times: { "u-a": ["9:99"] },
        videoAssets: { "u-a": { uri: "file://a.mp4" } },
      }),
    ];
    const result = applyTemplateToMenuAt(menus, "menu-1", template);
    expect(result).toHaveLength(1);
    expect(result[0]!.targetUserIds).toEqual(["u-a", "u-b"]);
    expect(result[0]!.times).toEqual({ "u-a": ["9:99"] });
    expect(result[0]!.videoAssets).toEqual({ "u-a": { uri: "file://a.mp4" } });
  });

  it("他メニューはフィールド・targetUserIds・times とも一切変更されない", () => {
    const untouched = makeMenu({
      id: "menu-2",
      style: "Fly",
      targetUserIds: ["u-c", "u-d"],
      times: { "u-c": ["1:00"], "u-d": ["1:05"] },
      videoAssets: { "u-d": { uri: "file://d.mp4" } },
    });
    const menus = [makeMenu({ id: "menu-1", targetUserIds: ["u-a"] }), untouched];
    const result = applyTemplateToMenuAt(menus, "menu-1", template);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.id === "menu-2")).toEqual(untouched);
  });

  it("メニュー数自体が変化しない (3枚 → 3枚のまま)", () => {
    const menus = [
      makeMenu({ id: "menu-1" }),
      makeMenu({ id: "menu-2" }),
      makeMenu({ id: "menu-3" }),
    ];
    const result = applyTemplateToMenuAt(menus, "menu-2", template);
    expect(result.map((m) => m.id)).toEqual(["menu-1", "menu-2", "menu-3"]);
  });

  // ---- ミューテーション実証: 個人側と同型の「丸ごと置換」は上記契約に違反し red になる ----
  it("[ミューテーション実証] 丸ごと置換 (個人側と同型) に差し替えると、他メニュー保持の契約が壊れる", () => {
    const untouched = makeMenu({
      id: "menu-2",
      targetUserIds: ["u-c", "u-d"],
      times: { "u-c": ["1:00"] },
    });
    const menus = [makeMenu({ id: "menu-1", targetUserIds: ["u-a"] }), untouched];

    const result = naiveReplaceAllLikePersonalScreen(menus, "menu-1", template);

    // 契約 (「他メニューはフィールド・targetUserIds・times とも一切変更されない」) を
    // naiveReplaceAllLikePersonalScreen に適用すると満たせないことを確認する。
    // メニュー数が1枚に潰れる時点で、契約 (2枚のまま) は既に破綻している。
    expect(result).toHaveLength(1);
    expect(result.map((m) => m.id)).not.toEqual(["menu-1", "menu-2"]);
  });

  it("[ミューテーション実証] 丸ごと置換は対象メニュー自身の targetUserIds も消してしまう", () => {
    const menus = [
      makeMenu({ id: "menu-1", targetUserIds: ["u-a", "u-b"], times: { "u-a": ["9:99"] } }),
    ];
    const result = naiveReplaceAllLikePersonalScreen(menus, "menu-1", template);
    // 契約は targetUserIds=["u-a","u-b"] の保持を要求するが、丸ごと置換は [] にしてしまう。
    expect(result[0]!.targetUserIds).not.toEqual(["u-a", "u-b"]);
    expect(result[0]!.targetUserIds).toEqual([]);
  });
});
