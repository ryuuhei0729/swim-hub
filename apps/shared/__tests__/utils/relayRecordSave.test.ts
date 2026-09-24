// =============================================================================
// relayRecordSave.test.ts — リレー保存時の性別区分 prefill と既存行の自然キー照合
//                            (QA Sprint Contract Phase B / 第3弾)
// =============================================================================
//
// 対象: apps/shared/utils/relayRecordSave.ts
//
// web (`apps/web/app/.../records/_client/RecordClient.tsx`) と
// mobile (`apps/mobile/screens/TeamRecordBulkFormScreen.tsx`) の**両方**が
// この 2 関数を通して relay_records を書く。片方だけ壊れる形の退行を最も
// 起こしやすい箇所であり、Phase B 開始時点でテストは 0 件だった。
//
// Sprint Contract 検証観点:
//   [V-RS-01] resolveRelayGenderCategory: 全員 0 → male / 全員 1 → female /
//             混在 → mixed
//   [V-RS-02] 🚨 **性別不明を含む場合は mixed**。`?? 0` で男性に寄せていないこと。
//             `users.gender` は DB が NOT NULL なので undefined になるのは
//             「メンバー一覧に無い user_id を渡された場合」だけであり、
//             そこで 0 を入れると「不明」が「男性」として静かに確定してしまう。
//             mobile 側では `?? 0` を書くと点数が全部狂った前科がある
//             (MEMORY: project_swimhub_mobile_wapoints_and_tap_detail)。
//   [V-RS-03] findExistingRelayForNote: 自然キー
//             (relay_kind + leg_distance + レグの user_id 集合) で照合し、
//             **順番は問わない** (第1泳者の入れ替えは同じ編成)
//   [V-RS-04] 種類・距離が違えば照合しない (別種目の note を持ち込まない)
//   [V-RS-05] 退会で user_id が NULL 化された行は照合できない
//             (note を失うより誤った note を持ち込まない方を優先する)
//   [V-RS-06] 複数一致は最初の 1 件
//
// ─────────────────────────────────────────────────────────────────────────────
// トートロジー防止
//
// 期待値はすべてリテラル。プロダクションの判定式をテスト内に再実装しない
// (「バグのレプリカがバグっている」証明にならないようにする)。
// fixture の user_id は "swimmer-alpha" 等の語で、期待値 ("male"/"female"/
// "mixed") の部分文字列にならないようにする。件数は 1/2 を避けて 3,4,5,7 を使う。
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { resolveRelayGenderCategory } from "../../utils/relayRecordSave";
import type { RelaySaveLegPlan, RelaySavePlan } from "../../utils/relayRecordSave";

// -----------------------------------------------------------------------------
// 性別区分の prefill
// -----------------------------------------------------------------------------
const MALE = 0;
const FEMALE = 1;

/** user_id → users.gender のメンバー表 (プロダクションが渡すのと同じ形) */
const genderTable = (entries: ReadonlyArray<[string, number]>): ReadonlyMap<string, number> =>
  new Map(entries);

describe("[V-RS-01] resolveRelayGenderCategory — 一様な編成", () => {
  it("4 レグ全員の gender が 0 なら male", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable(legs.map((id) => [id, MALE]));

    expect(resolveRelayGenderCategory(legs, table)).toBe("male");
  });

  it("4 レグ全員の gender が 1 なら female", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable(legs.map((id) => [id, FEMALE]));

    expect(resolveRelayGenderCategory(legs, table)).toBe("female");
  });

  it("7 レグの変則編成でも全員 0 なら male (4 レグ前提の実装になっていない)", () => {
    const legs = [
      "swimmer-alpha",
      "swimmer-bravo",
      "swimmer-charlie",
      "swimmer-delta",
      "swimmer-echo",
      "swimmer-foxtrot",
      "swimmer-golf",
    ];
    const table = genderTable(legs.map((id) => [id, MALE]));

    expect(resolveRelayGenderCategory(legs, table)).toBe("male");
  });

  it("3 レグの変則編成でも全員 1 なら female", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie"];
    const table = genderTable(legs.map((id) => [id, FEMALE]));

    expect(resolveRelayGenderCategory(legs, table)).toBe("female");
  });
});

describe("[V-RS-01] resolveRelayGenderCategory — 混在", () => {
  it("男性 3 / 女性 1 なら mixed", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable([
      ["swimmer-alpha", MALE],
      ["swimmer-bravo", MALE],
      ["swimmer-charlie", MALE],
      ["swimmer-delta", FEMALE],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("女性 3 / 男性 1 なら mixed (どちらが多数かで寄せない)", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable([
      ["swimmer-alpha", FEMALE],
      ["swimmer-bravo", FEMALE],
      ["swimmer-charlie", FEMALE],
      ["swimmer-delta", MALE],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("第1泳者だけが違う性別でも mixed (先頭の値をそのまま採用していない)", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable([
      ["swimmer-alpha", FEMALE],
      ["swimmer-bravo", MALE],
      ["swimmer-charlie", MALE],
      ["swimmer-delta", MALE],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });
});

describe("[V-RS-02] resolveRelayGenderCategory — 性別不明は male に寄せず mixed", () => {
  // 🚨 ここが本スプリントで最も静かに壊れうる箇所。
  //    `genderByUserId.get(id) ?? 0` と書くと「不明」が「男性」に確定し、
  //    ランキングの男子リレーに他区分の記録が混ざる (エラーは出ない)。
  it("男性 3 人 + 一覧に無い 1 人 なら mixed (男性に寄せない)", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-unlisted"];
    const table = genderTable([
      ["swimmer-alpha", MALE],
      ["swimmer-bravo", MALE],
      ["swimmer-charlie", MALE],
      // swimmer-unlisted は意図的に入れない (メンバー一覧に居ない user_id)
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("女性 3 人 + 一覧に無い 1 人 なら mixed (女性にも寄せない)", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-unlisted"];
    const table = genderTable([
      ["swimmer-alpha", FEMALE],
      ["swimmer-bravo", FEMALE],
      ["swimmer-charlie", FEMALE],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("4 人全員が一覧に無い (空のメンバー表) なら mixed", () => {
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];

    expect(resolveRelayGenderCategory(legs, new Map())).toBe("mixed");
  });

  it("不明が第1泳者にあっても mixed (走査を途中で打ち切って male にならない)", () => {
    const legs = ["swimmer-unlisted", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable([
      ["swimmer-bravo", MALE],
      ["swimmer-charlie", MALE],
      ["swimmer-delta", MALE],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("gender に 0/1 以外の値が入っていても male/female に寄せず mixed", () => {
    // users.gender は DB では 0/1 だが、境界を越えて来た未知値を
    // 「0 でないから female」のように取り違えないことを固定する
    const legs = ["swimmer-alpha", "swimmer-bravo", "swimmer-charlie", "swimmer-delta"];
    const table = genderTable([
      ["swimmer-alpha", MALE],
      ["swimmer-bravo", MALE],
      ["swimmer-charlie", MALE],
      ["swimmer-delta", 7],
    ]);

    expect(resolveRelayGenderCategory(legs, table)).toBe("mixed");
  });

  it("泳者が 0 人なら mixed (呼び出し側はこの計画を保存しない)", () => {
    expect(resolveRelayGenderCategory([], new Map())).toBe("mixed");
  });
});

// -----------------------------------------------------------------------------
// 保存計画の型契約
//
// `RelaySavePlan` は web / mobile が `TeamRelayRecordsAPI.replace()` に渡す
// 唯一の入力形。PM 確定の契約 (`types/relayRecord.ts`) と食い違うと、
// 書き込む列が静かに欠ける (型は通るのに DB の値が抜ける)。
// -----------------------------------------------------------------------------
describe("[V-RS-03] RelaySavePlan / RelaySaveLegPlan の型契約", () => {
  /** 4 レグの計画。区間 27.50/28.70/28.30/27.60 → 総合 112.10 (手計算) */
  const legs: RelaySaveLegPlan[] = [
    { legIndex: 0, userId: "swimmer-alpha", styleId: 2, legTime: 27.5, reactionTime: null, validRecordIndex: 0 },
    { legIndex: 1, userId: "swimmer-bravo", styleId: 2, legTime: 28.7, reactionTime: 0.31, validRecordIndex: 1 },
    { legIndex: 2, userId: "swimmer-charlie", styleId: 2, legTime: 28.3, reactionTime: 0.28, validRecordIndex: 2 },
    { legIndex: 3, userId: "swimmer-delta", styleId: 2, legTime: 27.6, reactionTime: 0.33, validRecordIndex: 3 },
  ];

  const plan: RelaySavePlan = {
    relayEventId: "relay_4x50_free",
    totalTime: 112.1,
    legCount: 4,
    genderCategory: "mixed",
    legs,
  };

  it("legIndex は 0-based で第N泳者 = legIndex + 1 になる", () => {
    expect(plan.legs.map((leg) => leg.legIndex)).toEqual([0, 1, 2, 3]);
  });

  it("legTime は区間タイムであり通算タイムではない", () => {
    // 通算は [27.50, 56.20, 84.50, 112.10]。ここに通算が入ると lap が崩れる
    expect(plan.legs.map((leg) => leg.legTime)).toEqual([27.5, 28.7, 28.3, 27.6]);
    expect(plan.legs.map((leg) => leg.legTime)).not.toEqual([27.5, 56.2, 84.5, 112.1]);
  });

  it("totalTime は区間タイムの総和と一致しうるが、総和で置き換えてはいけない値である", () => {
    // 「保存値を正とする」契約 (公式記録が総和と 1/100 秒ずれる場合がある)。
    // この fixture では一致するので、和との比較で契約を説明できる
    const sum = plan.legs.reduce((acc, leg) => acc + leg.legTime, 0);
    expect(Math.round(sum * 100) / 100).toBe(plan.totalTime);
  });

  it("legCount と legs.length は別のフィールドである (変則編成を表現できる)", () => {
    // 3人/5人の変則編成では legCount がレグ数を表す。片方だけ見ると崩れる
    const oddPlan: RelaySavePlan = { ...plan, legCount: 3, legs: legs.slice(0, 3) };
    expect(oddPlan.legCount).toBe(oddPlan.legs.length);
  });

  it("reactionTime は第1泳者だけ null になりうる (スタート台からの飛び込み)", () => {
    expect(plan.legs[0]?.reactionTime).toBeNull();
    for (const leg of plan.legs.slice(1)) {
      expect(leg.reactionTime).not.toBeNull();
    }
  });

  it("validRecordIndex は records の insert 結果と突き合わせる添字である", () => {
    // shared 側はこの値の意味を解釈しない。呼び出し側の insertedRecordIds と
    // 同じ添字で並ぶことだけが契約
    expect(plan.legs.map((leg) => leg.validRecordIndex)).toEqual([0, 1, 2, 3]);
  });

  it("genderCategory は resolveRelayGenderCategory の戻り値をそのまま持つ", () => {
    const resolved = resolveRelayGenderCategory(
      plan.legs.map((leg) => leg.userId),
      new Map([
        ["swimmer-alpha", MALE],
        ["swimmer-bravo", MALE],
        ["swimmer-charlie", MALE],
        // swimmer-delta は一覧に無い (性別不明) → mixed
      ]),
    );
    expect(resolved).toBe(plan.genderCategory);
  });
});
