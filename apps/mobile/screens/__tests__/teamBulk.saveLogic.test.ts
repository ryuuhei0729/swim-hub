// QA Phase B: チーム代理入力の保存補助ロジックの観点検証。
// 画面内インラインの (a) リレー split の leg 変換 (b) 練習動画 logId 突き合わせキー を
// 同等の純粋関数として再現し、境界・曖昧性を明示的に検証する。
// 注: 実装コードをコピーした assertion (トートロジー) を避けるため、期待値は手計算で固定する。
import { describe, it, expect } from "vitest";
import { getRelayLegBoundaries } from "../teamRecordBulk/relayEvents";

// ---- (a) リレー split の leg 変換 (TeamRecordBulkFormScreen handleSubmit より) ----
// relaySplitTimes(全体距離) を各 leg の保存用 split(leg内距離) に変換する。
function convertRelaySplitsForLeg(
  relayEventId: Parameters<typeof getRelayLegBoundaries>[0],
  legIdx: number,
  relaySplits: { distance: number; splitTime: number }[],
): { distance: number; splitTime: number }[] {
  const legBoundaries = getRelayLegBoundaries(relayEventId);
  const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1]!; // legBoundaries は呼び出し元で常に legIdx と対応する長さを持つ設計
  const legHigh = legBoundaries[legIdx]!; // 同上
  return relaySplits
    .filter((st) => st.distance > legLow && st.distance <= legHigh)
    .map((st) => ({ ...st, distance: legIdx === 0 ? st.distance : st.distance - legLow }));
}

describe("[saveLogic] リレー split → leg 変換", () => {
  const splits4x100 = [
    { distance: 100, splitTime: 57.0 }, // leg0
    { distance: 200, splitTime: 115.5 }, // leg1
    { distance: 300, splitTime: 173.0 }, // leg2
    { distance: 400, splitTime: 230.0 }, // leg3
  ];

  it("leg0: (0,100] の split を全体距離のまま保存 (offset 0)", () => {
    expect(convertRelaySplitsForLeg("relay_4x100_free", 0, splits4x100)).toEqual([
      { distance: 100, splitTime: 57.0 },
    ]);
  });

  it("leg1: (100,200] の split を leg内距離 (=100) に変換", () => {
    expect(convertRelaySplitsForLeg("relay_4x100_free", 1, splits4x100)).toEqual([
      { distance: 100, splitTime: 115.5 },
    ]);
  });

  it("leg3: (300,400] の split を leg内距離 (=100) に変換", () => {
    expect(convertRelaySplitsForLeg("relay_4x100_free", 3, splits4x100)).toEqual([
      { distance: 100, splitTime: 230.0 },
    ]);
  });

  it("leg境界の片側開区間: distance === legLow は除外、distance === legHigh は含む", () => {
    // leg1 の境界は (100, 200]。distance=100 は除外、distance=200 は含む。
    const boundary = [
      { distance: 100, splitTime: 57.0 },
      { distance: 200, splitTime: 115.5 },
    ];
    expect(convertRelaySplitsForLeg("relay_4x100_free", 1, boundary)).toEqual([
      { distance: 100, splitTime: 115.5 },
    ]);
  });

  it("4x200 leg2: (400,600] → leg内距離 (-400)", () => {
    const s = [{ distance: 425, splitTime: 250.0 }, { distance: 600, splitTime: 347.0 }];
    expect(convertRelaySplitsForLeg("relay_4x200_free", 2, s)).toEqual([
      { distance: 25, splitTime: 250.0 },
      { distance: 200, splitTime: 347.0 },
    ]);
  });
});

// ---- (b) 練習動画 logId 突き合わせ (W-1: index 突合) ----
//
// !!! 重要 / W-c (Reviewer 指摘への対応) !!!
//   以下の buildLogsDataOrder / resolveVideoAttachments は
//   TeamPracticeLogBulkFormScreen.handleSubmit の **並行再実装 (parallel reimplementation)**
//   である。画面実コードがエクスポートする純粋関数ではないため、これらのテストは
//   「画面の反復順そのもの」を直接検証するものではない。画面側の反復が
//   (for menu → for member) から (for member → for menu) 等に変わっても、ここでは捕捉できない。
//
//   本来の理想は handleSubmit 内の 2 つの反復ロジック (logsData 構築 / 動画→logId 突合) を
//   1 つの純粋関数に抽出し、それを直接テストすること。これは実コードのテスタビリティ向上
//   (リファクタ) を伴うため QA(Evaluator) の範囲外であり、App Developer への依頼事項として
//   報告する (PM 報告参照)。
//
//   QA(Evaluator) の範囲で可能な補強として、本ファイルでは:
//   (1) 「logsData 構築順」と「動画突合順」を 1 本の共有イテレータ iterateMenuMembers() に
//       統合し、両者が同一順序を共有する不変条件を再実装側で構造的に強制する。
//       (旧版は build/resolve で同じ for ループを 2 箇所に複製しており、一方だけ書き換えても
//        テストが緑のまま通る危険があった。共有化によりこの自己矛盾を排除する。)
//   (2) 「build 順 === resolve が消費する flatIndex 順」を明示的に突合するテストを追加し、
//       2 経路の順序一致 (= W-1 の核心) を不変条件として固定する。
//   期待値は画面実装をコピーせず手計算で固定する (トートロジー回避)。

interface Member {
  user_id: string;
}
interface Menu {
  targetUserIds: string[];
  // user_id → 動画あり?
  videoFor: string[];
}

// build と resolve が共有する唯一の反復順序。
// 画面側 handleSubmit の `for (menu) { for (member of members.filter(targetUserIds)) }` を
// 1 箇所に集約。build/resolve はこの順序を共有するため、片方だけ順序が変わる自己矛盾を排除。
function* iterateMenuMembers(
  menus: Menu[],
  members: Member[],
): Generator<{ menu: Menu; member: Member; flatIndex: number }> {
  let flatIndex = 0;
  for (const menu of menus) {
    const targetMembers = members.filter((m) => menu.targetUserIds.includes(m.user_id));
    for (const member of targetMembers) {
      yield { menu, member, flatIndex };
      flatIndex += 1;
    }
  }
}

// logsData 構築順 (= RPC へ渡す順 = 返却される log_ids の順) を user_id 列で表現
function buildLogsDataOrder(menus: Menu[], members: Member[]): string[] {
  const order: string[] = [];
  for (const { member } of iterateMenuMembers(menus, members)) {
    order.push(member.user_id);
  }
  return order;
}

// 動画添付の解決: flatIndex を logsData と同一順で進め、各メニュー×メンバーに log_ids[flatIndex] を割当。
// 動画のあるメンバーについて (memberUserId, resolvedLogId|null) を返す。
function resolveVideoAttachments(
  menus: Menu[],
  members: Member[],
  logIds: (string | undefined)[],
): Array<{ user: string; logId: string | null }> {
  const out: Array<{ user: string; logId: string | null }> = [];
  for (const { menu, member, flatIndex } of iterateMenuMembers(menus, members)) {
    const logId = logIds[flatIndex];
    if (!menu.videoFor.includes(member.user_id)) continue;
    out.push({ user: member.user_id, logId: logId ?? null });
  }
  return out;
}

describe("[saveLogic] 練習動画 log_ids index 突合 (W-1)", () => {
  // members の並び順が targetUserIds の選択順ではなく members 配列順で確定することを固定
  const members: Member[] = [
    { user_id: "u-alice" },
    { user_id: "u-bob" },
    { user_id: "u-carol" },
  ];

  it("logsData 構築順は members 配列順 (targetUserIds の指定順ではない)", () => {
    // targetUserIds を carol, alice の順で指定しても members 順 (alice→carol) になる
    const menus: Menu[] = [{ targetUserIds: ["u-carol", "u-alice"], videoFor: [] }];
    expect(buildLogsDataOrder(menus, members)).toEqual(["u-alice", "u-carol"]);
  });

  it("複数メニュー: logsData 構築順と動画突合の flatIndex が完全一致し、各動画が正しい人に付く", () => {
    // menu0: alice, bob (bob に動画) / menu1: alice, carol (carol に動画)
    const menus: Menu[] = [
      { targetUserIds: ["u-alice", "u-bob"], videoFor: ["u-bob"] },
      { targetUserIds: ["u-alice", "u-carol"], videoFor: ["u-carol"] },
    ];
    // logsData 順: alice(0), bob(1), alice(2), carol(3)
    expect(buildLogsDataOrder(menus, members)).toEqual([
      "u-alice",
      "u-bob",
      "u-alice",
      "u-carol",
    ]);
    // RPC が挿入順で返す log_ids
    const logIds = ["L0", "L1", "L2", "L3"];
    // bob は index1 → L1、carol は index3 → L3 に付くべき (手計算)
    expect(resolveVideoAttachments(menus, members, logIds)).toEqual([
      { user: "u-bob", logId: "L1" },
      { user: "u-carol", logId: "L3" },
    ]);
  });

  it("動画なしメンバーが混在しても index がズレない", () => {
    // menu0: alice(動画なし), bob(動画あり), carol(動画なし)
    const menus: Menu[] = [
      { targetUserIds: ["u-alice", "u-bob", "u-carol"], videoFor: ["u-bob"] },
    ];
    const logIds = ["L0", "L1", "L2"];
    // bob は logsData の index1 = L1 (alice をスキップしても flatIndex は進む)
    expect(resolveVideoAttachments(menus, members, logIds)).toEqual([
      { user: "u-bob", logId: "L1" },
    ]);
  });

  it("同一構成メニューを複数メンバー: 各動画が別人に付かない", () => {
    // 同一構成 (同 distance/reps 等) を alice と bob に。両者に動画。
    const menus: Menu[] = [
      { targetUserIds: ["u-alice", "u-bob"], videoFor: ["u-alice", "u-bob"] },
    ];
    const logIds = ["LA", "LB"];
    expect(resolveVideoAttachments(menus, members, logIds)).toEqual([
      { user: "u-alice", logId: "LA" },
      { user: "u-bob", logId: "LB" },
    ]);
  });

  it("log_ids 長不足 (要求 < 動画数): 不足分は logId=null で集約 (握りつぶさない)", () => {
    const menus: Menu[] = [
      { targetUserIds: ["u-alice", "u-bob"], videoFor: ["u-alice", "u-bob"] },
    ];
    // RPC が 1 件しか返さない異常系
    const logIds = ["LA"];
    expect(resolveVideoAttachments(menus, members, logIds)).toEqual([
      { user: "u-alice", logId: "LA" },
      { user: "u-bob", logId: null }, // null → 呼び出し側で videoErrors に集約される
    ]);
  });

  it("動画0件: 突合結果は空 (エラーなし、ループ空回り)", () => {
    const menus: Menu[] = [{ targetUserIds: ["u-alice", "u-bob"], videoFor: [] }];
    expect(resolveVideoAttachments(menus, members, ["L0", "L1"])).toEqual([]);
  });

  // ---- W-c 補強: build 順 と resolve の flatIndex 消費順の不変条件を固定 ----
  // W-1 の核心は「logsData を作る順序」と「動画→logId を解決する順序」が完全一致すること。
  // 両経路が同一の反復順を共有していなければ、log_ids[flatIndex] が別人の logId を指し
  // 別人へ誤添付される。ここでは build が生成する user_id 列を「正解の flatIndex→user_id 写像」
  // とし、resolve が各動画に割り当てた logId が「その flatIndex 位置の人」のものであることを
  // 突合する。期待値は手計算で固定する。
  it("[不変条件] resolve が割り当てる logId は build 順の同一 flatIndex 位置の人に対応する", () => {
    const menus: Menu[] = [
      { targetUserIds: ["u-carol", "u-bob"], videoFor: ["u-bob"] }, // 指定順は carol,bob だが members 順で bob→carol... 実際は members 配列順
      { targetUserIds: ["u-alice"], videoFor: ["u-alice"] },
    ];
    // build 順 (members 配列順 alice<bob<carol で filter): menu0 → bob(0),carol(1) / menu1 → alice(2)
    const buildOrder = buildLogsDataOrder(menus, members);
    expect(buildOrder).toEqual(["u-bob", "u-carol", "u-alice"]);

    // RPC が挿入順で返す log_ids。flatIndex i の log_ids[i] は buildOrder[i] の人のログ。
    const logIds = ["LB0", "LC1", "LA2"];

    // resolve: bob(flatIndex0)→LB0、alice(flatIndex2)→LA2 (carol は動画なし)
    const resolved = resolveVideoAttachments(menus, members, logIds);

    // 不変条件: 各 resolved の (user, logId) が buildOrder/logIds の同一 index 対応に矛盾しない
    for (const { user, logId } of resolved) {
      const idx = logIds.indexOf(logId as string);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(buildOrder[idx]).toBe(user); // logId の出所(index)の人 === 添付先の人
    }
    expect(resolved).toEqual([
      { user: "u-bob", logId: "LB0" },
      { user: "u-alice", logId: "LA2" },
    ]);
  });
});
