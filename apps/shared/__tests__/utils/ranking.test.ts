// =============================================================================
// ranking.test.ts — 順位付与 / 個人ベスト畳み込み (QA Sprint Contract Phase B)
// =============================================================================
//
// 対象: apps/shared/utils/ranking.ts
//   - assignCompetitionRanks: 同着は同順位・次順位は件数分スキップ (1,2,2,4)
//
// ⚠️ `dedupeToPersonalBest` は Phase B レビューで**削除された**。
//    プロダクションからの呼び出し元がゼロで、かつ tie-break が RPC
//    (`time → competition_date → record_id`) と違う「入力順先勝ち」だったため、
//    RPC の並びを変えた瞬間に静かに乖離する第2実装だった。
//    畳み込みの検証は RPC 側 (supabase/tests/11_..._rpc.test.sql の V-DB-47) に一本化。
//
// Sprint Contract 検証観点:
//   [V-11] 同着が無い場合は 1..n の連番
//   [V-12] 同着は同順位で、次の順位は同着件数分スキップする (日本水泳連盟表記)
//   [V-13] 3連続同着・先頭同着・末尾同着の各境界で順位が崩れない
//   [V-14] 入力の順序を変えない (RPC の ORDER BY が唯一の並び順の定義元)
//   [V-15] 同着判定は厳密一致。BEST_EPSILON (0.005) のような近似は使わない
//   [V-16] (更新) 畳み込みは RPC の責務。クライアントは畳まず全行に順位を付ける
//   [V-17] 空配列・1件・0秒・負数などの境界で落ちない
//
// トートロジー防止: 期待順位はプロダクションの関数を通さず、テストの入力表に
// 「タイム列」と「期待順位列」を人間が手で並べて書く。

import { describe, it, expect } from "vitest";
import { assignCompetitionRanks } from "../../utils/ranking";

/** テスト用の最小行。id は期待値の部分文字列にならない語 (member-alpha 等) を使う。 */
interface Row {
  id: string;
  userId: string;
  time: number;
}

function row(id: string, userId: string, time: number): Row {
  return { id, userId, time };
}

const times = (rows: ReadonlyArray<{ time: number }>) => rows.map((r) => r.time);

describe("assignCompetitionRanks", () => {
  // [V-11]
  it("[V-11] 同着が無ければ 1 から連番で順位が付く", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 28.44),
        row("rec-charlie", "u-charlie", 29.07),
        row("rec-delta", "u-delta", 31.55),
        row("rec-echo", "u-echo", 33.02),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  // [V-12] 中核: 1, 2, 2, 4 (3位は欠番)
  it("[V-12] 2位が同着なら次は 4 位になる (3 位は欠番)", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 28.44),
        row("rec-charlie", "u-charlie", 28.44),
        row("rec-delta", "u-delta", 29.07),
        row("rec-echo", "u-echo", 30.18),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5]);
  });

  // [V-13] 境界: 3連続同着 / 先頭同着 / 末尾同着 / 全件同着
  it("[V-13] 3連続同着なら次は 4 位 (2位と3位が欠番)", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 27.31),
        row("rec-charlie", "u-charlie", 27.31),
        row("rec-delta", "u-delta", 29.07),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it("[V-13] 末尾が同着でも最後まで同順位が付く", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 28.44),
        row("rec-charlie", "u-charlie", 33.02),
        row("rec-delta", "u-delta", 33.02),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 3]);
  });

  it("[V-13] 全件同着なら全員 1 位", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 30.5),
        row("rec-bravo", "u-bravo", 30.5),
        row("rec-charlie", "u-charlie", 30.5),
        row("rec-delta", "u-delta", 30.5),
        row("rec-echo", "u-echo", 30.5),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 1, 1]);
  });

  it("[V-13] 同着グループが2組あっても後続の順位が正しくスキップする", () => {
    // タイム:  27.31 27.31 | 28.44 | 29.07 29.07 29.07 | 30.18
    // 期待順位:   1     1  |   3   |   4     4     4   |   7
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 27.31),
        row("rec-charlie", "u-charlie", 28.44),
        row("rec-delta", "u-delta", 29.07),
        row("rec-echo", "u-echo", 29.07),
        row("rec-foxtrot", "u-foxtrot", 29.07),
        row("rec-golf", "u-golf", 30.18),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 4, 4, 4, 7]);
  });

  // [V-14] 並べ替えないこと。RPC の ORDER BY が唯一の並び順の定義元なので、
  // ここで勝手にソートされると「順位」と「表示順」が食い違って表が嘘になる。
  it("[V-14] 入力の並び順をそのまま保つ (関数内で並べ替えない)", () => {
    const input = [
      row("rec-alpha", "u-alpha", 27.31),
      row("rec-bravo", "u-bravo", 28.44),
      row("rec-charlie", "u-charlie", 29.07),
    ];

    const ranked = assignCompetitionRanks(input, (r) => r.time);

    expect(ranked.map((r) => r.id)).toEqual(["rec-alpha", "rec-bravo", "rec-charlie"]);
    expect(times(ranked)).toEqual([27.31, 28.44, 29.07]);
  });

  it("[V-14] 入力配列を破壊しない (元の配列の要素に rank が生えない)", () => {
    const input = [row("rec-alpha", "u-alpha", 27.31), row("rec-bravo", "u-bravo", 28.44)];

    assignCompetitionRanks(input, (r) => r.time);

    expect(input.map((r) => Object.hasOwn(r, "rank"))).toEqual([false, false]);
  });

  it("元の行のフィールドは rank 付与後も保持される", () => {
    const ranked = assignCompetitionRanks([row("rec-alpha", "u-alpha", 27.31)], (r) => r.time);

    expect(ranked[0]).toEqual({ id: "rec-alpha", userId: "u-alpha", time: 27.31, rank: 1 });
  });

  // [V-15] BEST_EPSILON (0.005) を順位判定に使うと 27.31 と 27.315 が同着になる。
  // DB のタイム列は numeric(10,2) なので厳密一致でよい、という契約を pin する。
  it("[V-15] 0.01 秒差は同着にしない (厳密一致で判定する)", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", 27.31),
        row("rec-bravo", "u-bravo", 27.32),
        row("rec-charlie", "u-charlie", 27.33),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("[V-15] 0.004 秒差 (BEST_EPSILON 未満) でも同着にしない", () => {
    const ranked = assignCompetitionRanks(
      [row("rec-alpha", "u-alpha", 27.31), row("rec-bravo", "u-bravo", 27.314)],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  // [V-17] 境界値
  it("[V-17] 空配列は空配列を返す", () => {
    expect(assignCompetitionRanks([], (r: Row) => r.time)).toEqual([]);
  });

  it("[V-17] 1件だけなら 1 位", () => {
    const ranked = assignCompetitionRanks([row("rec-alpha", "u-alpha", 27.31)], (r) => r.time);
    expect(ranked.map((r) => r.rank)).toEqual([1]);
  });

  it("[V-17] タイム 0 や負数でも順位判定が壊れない (異常データでも落ちない)", () => {
    const ranked = assignCompetitionRanks(
      [
        row("rec-alpha", "u-alpha", -1),
        row("rec-bravo", "u-bravo", 0),
        row("rec-charlie", "u-charlie", 0),
        row("rec-delta", "u-delta", 27.31),
      ],
      (r) => r.time,
    );

    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });
});
// =============================================================================
// [V-16 更新] `dedupeToPersonalBest` は削除された
//
// Phase B レビューで「プロダクションからの呼び出し元がゼロ」かつ
// 「tie-break が RPC と異なる (RPC は time → competition_date → record_id、
// あちらは入力順先勝ち)」ことが確定し、RPC の並びを変えた瞬間に静かに乖離する
// 第2実装だったため撤去された。よって畳み込みのテストはここには無い。
//
// 「1メンバー1行」の担保は RPC 側の `p_aggregation='personalBest'` に一本化され、
// supabase/tests/11_team_record_rankings_rpc.test.sql の V-DB-47a/b/c が
// 実 DB で検証している (personalBest で 2 行 / allRaces で 4 行 /
// 同一メンバーが 2 行以上出ない)。
//
// クライアント側に残る責務は「RPC が返した並びへ順位を付けるだけ」なので、
// 下のテストは **RPC が既に畳んで返した結果を模した fixture** に対して
// `assignCompetitionRanks` を掛ける形にしている。
// =============================================================================

describe("RPC が personalBest で畳んで返した結果への順位付与", () => {
  it("1メンバー1行に畳まれた結果でも同着スキップが成立する (1, 1, 3)", () => {
    // RPC が p_aggregation='personalBest' で返す形。
    // 同一 userId は現れず、time 昇順で並んでいる (ORDER BY time, competition_date, record_id)
    const foldedByRpc = [
      row("rec-alpha-best", "u-alpha", 27.31),
      row("rec-bravo-best", "u-bravo", 27.31),
      row("rec-charlie-best", "u-charlie", 28.44),
    ];

    const ranked = assignCompetitionRanks(foldedByRpc, (r) => r.time);

    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["rec-alpha-best", 1],
      ["rec-bravo-best", 1],
      ["rec-charlie-best", 3],
    ]);
  });

  it("クライアント側で userId の重複を畳む処理は残っていない (同一 userId が来たらそのまま2行になる)", () => {
    // RPC が allRaces で返した結果をそのまま渡した場合。
    // クライアントが勝手に畳むと「allRaces を選んだのに1行しか出ない」退行になるため、
    // 畳まずに全行へ順位を付けるのが正しい
    const allRacesFromRpc = [
      row("rec-alpha-race1", "u-alpha", 27.31),
      row("rec-alpha-race2", "u-alpha", 28.44),
      row("rec-bravo-race1", "u-bravo", 28.44),
    ];

    const ranked = assignCompetitionRanks(allRacesFromRpc, (r) => r.time);

    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["rec-alpha-race1", 1],
      ["rec-alpha-race2", 2],
      ["rec-bravo-race1", 2],
    ]);
  });
});
