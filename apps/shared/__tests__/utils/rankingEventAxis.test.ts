// =============================================================================
// rankingEventAxis — 種目軸統合 (個人5種目 + リレー2種類 = 7択) の純関数
// =============================================================================
//
// 対象: apps/shared/utils/rankingEventAxis.ts
//
// このモジュールは 2026-09-08 の統合で新設され、**web と mobile の両方の
// 絞り込み UI が唯一の定義元として読む**。統合前は「個人種目 / リレー」の
// ビュー切替トグルがあり、条件オブジェクトもモードごとに別だった。
//
// Sprint Contract 検証観点 (PM 指示分を含む):
//   [V-EA-01] 7択の value ↔ selection が双射。並びは 個人5 (canonical) → リレー2
//   [V-EA-02] 距離の選択肢: 個人は styles マスター由来 (legCount=null) /
//             リレーは RELAY_EVENTS 由来 (legCount 付き)。UI に `× 4` を書かせない
//   [V-EA-03] 🚨 **styles マスターが空でも既定 state を返す (null にしない)。**
//             リレーへフォールバックする。統合前はリレーが別ビューだったので
//             styles の失敗は個人種目だけを止めたが、統合後に null を返すと
//             **無関係なマスターの失敗でランキングタブ全体が死ぬ**
//   [V-EA-04] モード切替の引き継ぎ: 距離は同値維持 / 無ければ正規化、
//             性別は mixed → 個人で男子に**正規化して state に書き戻す**、
//             scope はリレー中も保持
//   [V-EA-05] `toRankingQueryTarget` は `event.mode` 1点からモードを決める
//             (「個人を選んでいるのにリレーの条件」を表現できない)
//   [V-EA-06] `countActiveRankingFilterState` は**画面に出ていない軸を数えない**
//             (リレー中の scope 差分はバッジに含めない = 消せないバッジを作らない)
//   [V-EA-07] 往復: Fr 100m → relay:free → Fr が既定と完全一致する
//
// -----------------------------------------------------------------------------
// トートロジー防止
//
// 期待値はプロダクションの関数では作らない。7択の value・既定値・並び順は
// **リテラルで書く**。`buildDefaultRankingFilterState(...)` の結果同士を
// 比較すると「関数が自分と一致する」assert になる。
//
// fixture の値は実 DB の `public.styles` から取った実測値を使うが、
// 期待値側に fixture を使い回さない (fixture を変えると期待値も動く形にしない)。
// -----------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  RANKING_EVENT_CHOICES,
  RANKING_INDIVIDUAL_EVENT_CHOICES,
  RANKING_RELAY_EVENT_CHOICES,
  buildDefaultRankingFilterState,
  countActiveRankingFilterState,
  getRankingDistanceChoices,
  parseRankingEventValue,
  resolvePoolTypeChange,
  resolveRankingEventChange,
  toIndividualGender,
  toRankingEventValue,
  toRankingQueryTarget,
  type RankingFilterState,
} from "../../utils/rankingEventAxis";
import type { RankingStyleGroup } from "../../utils/rankingStyleAxis";

// -----------------------------------------------------------------------------
// fixture: styles マスター (ローカル実 DB の public.styles 22 行から抜粋)
// -----------------------------------------------------------------------------
// styleId は実 DB の値。Fr は 25〜1500 の 7 距離、Br は 25/50/100/200 の 4 距離、
// IM は 100/200/400 の 3 距離しかない (25m/50m/800m の個人メドレーは無い)。
const GROUPS: readonly RankingStyleGroup[] = [
  {
    style: "Fr",
    distances: [
      { distance: 25, styleId: 1 },
      { distance: 50, styleId: 2 },
      { distance: 100, styleId: 3 },
      { distance: 200, styleId: 4 },
      { distance: 400, styleId: 5 },
      { distance: 800, styleId: 6 },
      { distance: 1500, styleId: 7 },
    ],
  },
  {
    style: "Br",
    distances: [
      { distance: 25, styleId: 8 },
      { distance: 50, styleId: 9 },
      { distance: 100, styleId: 10 },
      { distance: 200, styleId: 11 },
    ],
  },
  {
    style: "Ba",
    distances: [
      { distance: 25, styleId: 13 },
      { distance: 50, styleId: 14 },
      { distance: 100, styleId: 15 },
      { distance: 200, styleId: 16 },
    ],
  },
  {
    style: "Fly",
    distances: [
      { distance: 25, styleId: 17 },
      { distance: 50, styleId: 18 },
      { distance: 100, styleId: 19 },
      { distance: 200, styleId: 20 },
    ],
  },
  {
    style: "IM",
    distances: [
      { distance: 100, styleId: 21 },
      { distance: 200, styleId: 22 },
      { distance: 400, styleId: 23 },
    ],
  },
];

/**
 * 既定 state をリテラルで書いたもの。関数の出力を期待値に使わないため。
 *
 * 第2弾で `period` / `aggregation` が追加された。既定は
 * **通算 (`allTime`) + 各自のベスト (`personalBest`)** で、こちらもリテラルで書く。
 */
const DEFAULT_INDIVIDUAL_STATE: RankingFilterState = {
  event: { mode: "individual", style: "Fr" },
  // ⚠️ 第2弾 (要望4) で既定距離が 100m → **50m** に変わった。
  //    実 DB では `Fr 50m = styles.id 2` (100m は 3)。
  distance: 50,
  poolType: 1,
  genderCategory: "male",
  scope: "teamCompetitions",
  period: { kind: "allTime" },
  aggregation: "personalBest",
};

/** styles マスターが空のときのフォールバック先。こちらもリテラル。 */
const DEFAULT_RELAY_STATE: RankingFilterState = {
  event: { mode: "relay", relayKind: "free" },
  // 🚨 **これは「個人の 50m と揃っていない不整合」ではない。揃えに来ないこと。**
  //    `distance` はリレーでは**1レグの距離**なので、100 は 4×100m
  //    (総距離 400m) のフリーリレーを指す。個人の `DEFAULT_DISTANCE = 50` は
  //    **レースの距離**で 50m 自由形。**別の量**であり数値を一致させる意味は無い
  //    (PM 裁定 2026-09-09。根拠は `relayRankingAxis.ts` の
  //     `DEFAULT_LEG_DISTANCE` の docstring と `rankingStyleAxis.ts` の
  //     `DEFAULT_DISTANCE` の docstring に相互参照で書かれている)。
  //
  //    ⚠️ ここを 50 にすると 4×50m (総距離 200m) = **距離が半分のレース**に
  //    変わる。この固定は「揃えようとする変更」を赤で止める計器である。
  //    なお通常フローではこの値は使われない — 個人 50m Fr からフリーリレーへ
  //    切り替えると `resolveRankingEventChange` が 50 を引き継ぐので 50m × 4 に
  //    なる。ここが効くのは **styles マスターが空のときのフォールバックだけ**。
  distance: 100,
  poolType: 1,
  genderCategory: "male",
  scope: "teamCompetitions",
  period: { kind: "allTime" },
  aggregation: "personalBest",
};

// =============================================================================
describe("[V-EA-01] 7択の value と selection", () => {
  it("value は 個人5種目 (canonical 順) → リレー2種類 の順に並ぶ", () => {
    expect(RANKING_EVENT_CHOICES.map((choice) => choice.value)).toEqual([
      "Fr",
      "Br",
      "Ba",
      "Fly",
      "IM",
      "relay:free",
      "relay:medley",
    ]);
  });

  it("個人とリレーの部分配列を連結すると全体になる (UI の2行分割の定義元)", () => {
    expect(RANKING_INDIVIDUAL_EVENT_CHOICES).toHaveLength(5);
    expect(RANKING_RELAY_EVENT_CHOICES).toHaveLength(2);
    expect([...RANKING_INDIVIDUAL_EVENT_CHOICES, ...RANKING_RELAY_EVENT_CHOICES]).toEqual(
      RANKING_EVENT_CHOICES,
    );
  });

  it("個人の選択肢は styles マスターに依存しない (canonical 5 種目をそのまま出す)", () => {
    // マスターに実在するかは距離軸の話。ここが空になると UI が種目ピルを
    // 出せなくなるので、選択肢そのものは静的定義から来ること
    expect(RANKING_INDIVIDUAL_EVENT_CHOICES.map((c) => c.value)).toEqual([
      "Fr",
      "Br",
      "Ba",
      "Fly",
      "IM",
    ]);
  });

  it("toRankingEventValue / parseRankingEventValue が双射 (7 → 7)", () => {
    const values = ["Fr", "Br", "Ba", "Fly", "IM", "relay:free", "relay:medley"] as const;

    for (const value of values) {
      const selection = parseRankingEventValue(value);
      expect(selection, `${value} がパースできない`).not.toBeNull();
      expect(toRankingEventValue(selection!)).toBe(value);
    }
    // 逆向きも: 7 つの selection が 7 つの異なる value になる
    expect(new Set(RANKING_EVENT_CHOICES.map((c) => toRankingEventValue(c.selection))).size).toBe(
      7,
    );
  });

  it("未知の value は null (as キャストで検証を迂回させない)", () => {
    for (const bad of ["", "fr", "FR", "relay", "relay:", "relay:mixed", "relay:Free", "IM "]) {
      expect(parseRankingEventValue(bad), `${JSON.stringify(bad)} が通った`).toBeNull();
    }
  });

  it("mode は value から一意に決まる ('relay:' 接頭辞だけが判定材料)", () => {
    expect(parseRankingEventValue("Fr")).toEqual({ mode: "individual", style: "Fr" });
    expect(parseRankingEventValue("relay:free")).toEqual({ mode: "relay", relayKind: "free" });
  });
});

// =============================================================================
describe("[V-EA-02] 距離の選択肢", () => {
  it("個人種目は styles マスター由来で legCount が null", () => {
    const choices = getRankingDistanceChoices(GROUPS, { mode: "individual", style: "Fr" }, 0);

    expect(choices.map((c) => c.distance)).toEqual([25, 50, 100, 200, 400, 800, 1500]);
    expect(choices.every((c) => c.legCount === null)).toBe(true);
  });

  it("個人メドレーは 100/200/400 の 3 件 (25m/50m/800m の個人メドレーは無い)", () => {
    const choices = getRankingDistanceChoices(GROUPS, { mode: "individual", style: "IM" }, 0);
    expect(choices.map((c) => c.distance)).toEqual([100, 200, 400]);
  });

  it("🚨 リレーは legCount を伴って返る (UI に `× 4` をハードコードさせない)", () => {
    const free = getRankingDistanceChoices(GROUPS, { mode: "relay", relayKind: "free" }, 0);

    expect(free).toEqual([
      { distance: 25, legCount: 4 },
      { distance: 50, legCount: 4 },
      { distance: 100, legCount: 4 },
      { distance: 200, legCount: 4 },
    ]);
    // legCount が null でない = ラベル側が「× n」を導出できる
    expect(free.every((c) => c.legCount !== null)).toBe(true);
  });

  it("メドレーリレーは 200m を持たない (種類で選択肢集合が違う)", () => {
    const medley = getRankingDistanceChoices(GROUPS, { mode: "relay", relayKind: "medley" }, 0);
    expect(medley.map((c) => c.distance)).toEqual([25, 50, 100]);
  });

  it("🚨 リレーの距離は groups が空でも返る (styles に依存していない)", () => {
    const choices = getRankingDistanceChoices([], { mode: "relay", relayKind: "free" }, 0);
    expect(choices.map((c) => c.distance)).toEqual([25, 50, 100, 200]);
  });

  // ---------------------------------------------------------------------------
  // [V-P2-61] 🚨 長水路 (poolType=1) では 25m を落とす
  //
  // **50m プールで 25m のレースは成立しない** (スタートとゴールが同じ壁になる)。
  // 個人種目の `25` もリレーの `25m × 4` も同じ理由で落ちる。
  //
  // ⚠️ 既存の [V-EA-02] は**短水路 (0) を明示して渡している**。第2弾で
  //    `poolType` 引数が増えたとき、既定引数にせず**必須**にしたので
  //    呼び出し漏れは tsc が捕まえる (実測: テスト側 8 箇所が赤くなった)。
  // ---------------------------------------------------------------------------
  it("🚨 長水路では個人種目の 25m が選択肢から消える", () => {
    const short = getRankingDistanceChoices(GROUPS, { mode: "individual", style: "Fr" }, 0);
    const long = getRankingDistanceChoices(GROUPS, { mode: "individual", style: "Fr" }, 1);

    expect(short.map((c) => c.distance)).toEqual([25, 50, 100, 200, 400, 800, 1500]);
    expect(long.map((c) => c.distance)).toEqual([50, 100, 200, 400, 800, 1500]);
    // 短水路と長水路の差はちょうど 25m の 1 件だけ (他の距離を巻き込んでいない)
    expect(short.length - long.length).toBe(1);
  });

  it("🚨 長水路ではリレーの `25m × 4` も消える (個人と同じ理由なので同じ挙動)", () => {
    const short = getRankingDistanceChoices(GROUPS, { mode: "relay", relayKind: "free" }, 0);
    const long = getRankingDistanceChoices(GROUPS, { mode: "relay", relayKind: "free" }, 1);

    expect(short.map((c) => c.distance)).toEqual([25, 50, 100, 200]);
    expect(long.map((c) => c.distance)).toEqual([50, 100, 200]);
    // legCount は残った選択肢でも保たれる (ラベルが `× 4` を出せる)
    expect(long.every((c) => c.legCount === 4)).toBe(true);
  });

  it("🚨 メドレーリレーも長水路で 25m が消える", () => {
    const long = getRankingDistanceChoices(GROUPS, { mode: "relay", relayKind: "medley" }, 1);
    expect(long.map((c) => c.distance)).toEqual([50, 100]);
  });

  it("長水路でも 25m 以外は落とさない (除外リストが広がっていない)", () => {
    // 否定形。`LONG_COURSE_EXCLUDED_DISTANCES` に別の距離が混ざると
    // 長水路で正当な種目が選べなくなる
    const long = getRankingDistanceChoices(GROUPS, { mode: "individual", style: "IM" }, 1);
    // IM は 100/200/400 で 25m を持たないので長水路でも短水路と同じ
    expect(long.map((c) => c.distance)).toEqual([100, 200, 400]);
  });

  it("🚨 長水路で 25m しか持たない種目は選択肢が空になる (押せないチップを作らせない材料)", () => {
    // App Dev が種目チップの実在判定にも水路を渡すようにした根拠 ([V-P2-72])。
    // この関数が空を返すことが「そのチップを出さない」判断の入力になる
    const only25: readonly RankingStyleGroup[] = [
      { style: "Fly", distances: [{ distance: 25, styleId: 17 }] },
    ];
    expect(getRankingDistanceChoices(only25, { mode: "individual", style: "Fly" }, 0)).toEqual([
      { distance: 25, legCount: null },
    ]);
    expect(getRankingDistanceChoices(only25, { mode: "individual", style: "Fly" }, 1)).toEqual([]);
  });

  it("groups に無い個人種目は空配列 (押しても何も起きないピルを作らせない)", () => {
    const onlyFr = GROUPS.filter((group) => group.style === "Fr");
    expect(getRankingDistanceChoices(onlyFr, { mode: "individual", style: "Ba" }, 0)).toEqual([]);
    expect(getRankingDistanceChoices([], { mode: "individual", style: "Fr" }, 0)).toEqual([]);
  });
});

// =============================================================================
describe("[V-EA-03] 既定 state と styles 失敗時のフォールバック", () => {
  it("styles が取れていれば 50m 自由形 / 長水路 / 男子 / チームの大会 / 通算 / 各自のベスト", () => {
    expect(buildDefaultRankingFilterState(GROUPS)).toEqual(DEFAULT_INDIVIDUAL_STATE);
  });

  it("🚨 styles マスターが空でも null を返さずリレーへフォールバックする", () => {
    // 統合後は種目軸が1つなので、ここで null を返すとタブ全体が死ぬ。
    // 到達経路は実在する: `styles` は authenticated に TRUNCATE 権限が付いており
    // TRUNCATE は RLS を通らないので RLS では防げない (第3弾で実測)
    const state = buildDefaultRankingFilterState([]);

    expect(state).toEqual(DEFAULT_RELAY_STATE);
    expect(state.event.mode).toBe("relay");
  });

  it("🚨 canonical 化できない種目しか無いマスターでもリレーへ倒れる", () => {
    // buildRankingStyleGroups が canonical 化に失敗した結果は「距離 0 件の
    // 種目」ではなく「その種目が groups に無い」形になるので、空 groups と
    // 同じ経路を通る
    const brokenGroups: readonly RankingStyleGroup[] = [{ style: "Fr", distances: [] }];
    const state = buildDefaultRankingFilterState(brokenGroups);

    expect(state.event.mode).toBe("relay");
    expect(state).toEqual(DEFAULT_RELAY_STATE);
  });

  it("フォールバック時も scope に既定が入る (個人種目が復活したときそのまま使える)", () => {
    expect(buildDefaultRankingFilterState([]).scope).toBe("teamCompetitions");
  });

  it("フォールバックした state でもリレーの問い合わせ条件が作れる (null にならない)", () => {
    const target = toRankingQueryTarget([], buildDefaultRankingFilterState([]));

    expect(target).not.toBeNull();
    expect(target?.mode).toBe("relay");
  });
});

// =============================================================================
describe("[V-EA-04] モード切替時の引き継ぎ", () => {
  const from = (overrides: Partial<RankingFilterState> = {}): RankingFilterState => ({
    ...DEFAULT_INDIVIDUAL_STATE,
    ...overrides,
  });

  it("Fr 100m → フリーリレー: 同じ 100m が選べるので維持される", () => {
    // 既定は 50m なので、この観点 (同距離の維持) を見るために 100m を明示する
    const next = resolveRankingEventChange(GROUPS, from({ distance: 100 }), {
      mode: "relay",
      relayKind: "free",
    });

    expect(next).not.toBeNull();
    expect(next!.event).toEqual({ mode: "relay", relayKind: "free" });
    expect(next!.distance).toBe(100);
  });

  it("フリーリレー 200m → メドレーリレー: 200m が無いので最短に落ちる", () => {
    // ⚠️ 既定は**長水路**なので 25m は選択肢に無く、最短は 50m になる。
    //    短水路なら 25m。水路で最短が変わることを対で固定する ([V-P2-61] の帰結)
    const longCourse = from({ event: { mode: "relay", relayKind: "free" }, distance: 200 });
    expect(
      resolveRankingEventChange(GROUPS, longCourse, { mode: "relay", relayKind: "medley" })!
        .distance,
    ).toBe(50);

    const shortCourse = from({
      event: { mode: "relay", relayKind: "free" },
      distance: 200,
      poolType: 0,
    });
    expect(
      resolveRankingEventChange(GROUPS, shortCourse, { mode: "relay", relayKind: "medley" })!
        .distance,
    ).toBe(25);
  });

  it("Fr 1500m → 個人メドレー: 1500m が無いので最短 (100m) に落ちる", () => {
    const state = from({ distance: 1500 });
    const next = resolveRankingEventChange(GROUPS, state, { mode: "individual", style: "IM" });

    expect(next!.distance).toBe(100);
  });

  it("🚨 混合 → 個人種目: mixed は state ごと男子に正規化される (表示だけ変えない)", () => {
    const state = from({
      event: { mode: "relay", relayKind: "medley" },
      genderCategory: "mixed",
    });
    const next = resolveRankingEventChange(GROUPS, state, { mode: "individual", style: "Fr" });

    // state に mixed を残したまま表示だけ男子にすると、画面に出ている条件と
    // 問い合わせている条件が食い違う
    expect(next!.genderCategory).toBe("male");
    // 問い合わせ条件側も男子
    const target = toRankingQueryTarget(GROUPS, next!);
    expect(target?.mode).toBe("individual");
    expect(target?.mode === "individual" && target.filters.gender).toBe("male");
  });

  it("女子 → 個人種目: 個人にも存在する値なので維持される (一律に既定へ潰さない)", () => {
    const state = from({
      event: { mode: "relay", relayKind: "free" },
      genderCategory: "female",
    });
    const next = resolveRankingEventChange(GROUPS, state, { mode: "individual", style: "Fr" });

    expect(next!.genderCategory).toBe("female");
  });

  it("🚨 scope はリレー表示中も保持され、個人に戻ると復元される", () => {
    const state = from({ scope: "allCompetitions" });
    const toRelay = resolveRankingEventChange(GROUPS, state, {
      mode: "relay",
      relayKind: "free",
    });
    expect(toRelay!.scope).toBe("allCompetitions");

    const backToIndividual = resolveRankingEventChange(GROUPS, toRelay!, {
      mode: "individual",
      style: "Fr",
    });
    expect(backToIndividual!.scope).toBe("allCompetitions");
  });

  it("水路は両モードで同じ軸なのでそのまま引き継がれる", () => {
    const state = from({ poolType: 0 });
    const next = resolveRankingEventChange(GROUPS, state, { mode: "relay", relayKind: "medley" });
    expect(next!.poolType).toBe(0);
  });

  it("距離が1つも無い種目への切り替えは null (切り替えを見送る)", () => {
    const onlyFr = GROUPS.filter((group) => group.style === "Fr");
    expect(
      resolveRankingEventChange(onlyFr, from(), { mode: "individual", style: "Ba" }),
    ).toBeNull();
  });

  it("🚨 長水路 × 25m 専用種目への切り替えも null (UI 経由では再現できない経路)", () => {
    // ⚠️ **UI テストでは原理的に再現できない。** W-1 の修正で、その水路に距離が
    //    1つも無い種目のピル/チップは**そもそも描かれなくなった**ので、
    //    ユーザー操作から `resolveRankingEventChange` に届く経路が無い。
    //    ここが null を返すことは shared の単体テストでしか固定できない
    //    (Reviewer の実測 E)。
    //
    //    ⚠️ この null を返さなくなると、呼び出し側が「距離が選択肢外の state」を
    //    受け取り、距離グループが未選択のまま RPC に 25m が飛ぶ。
    const onlyTwentyFiveFly: readonly RankingStyleGroup[] = [
      { style: "Fr", distances: [{ distance: 50, styleId: 2 }] },
      { style: "Fly", distances: [{ distance: 25, styleId: 17 }] },
    ];
    const longCourse: RankingFilterState = {
      ...DEFAULT_INDIVIDUAL_STATE,
      poolType: 1,
      distance: 50,
    };

    // 長水路では Fly の距離が 0 件なので切り替えを見送る
    expect(
      resolveRankingEventChange(onlyTwentyFiveFly, longCourse, { mode: "individual", style: "Fly" }),
    ).toBeNull();

    // 対照: 短水路なら 25m が有るので切り替わる (水路が理由であることの実証)
    const shortCourse: RankingFilterState = { ...longCourse, poolType: 0 };
    const next = resolveRankingEventChange(onlyTwentyFiveFly, shortCourse, {
      mode: "individual",
      style: "Fly",
    });
    expect(next).not.toBeNull();
    expect(next!.distance).toBe(25);
  });

  it("toIndividualGender は mixed だけを落とす (male/female は恒等)", () => {
    expect(toIndividualGender("male")).toBe("male");
    expect(toIndividualGender("female")).toBe("female");
    expect(toIndividualGender("mixed")).toBe("male");
  });
});

// =============================================================================
describe("[V-P2-74] 水路の切り替えは必ず成立する (行き止まりを作らない)", () => {
  // ---------------------------------------------------------------------------
  // 🚨 W-1 (押しても何も起きないピルを描かない) を直しても**残る別の穴**。
  //    W-1 は「出さない」、こちらは「**既に選択済みのものをどうするか**」。
  //    選択済みなら隠れないので、`resolvePoolTypeChange` が null を返して
  //    呼び出し側が切り替えを見送ると**水路のピルが押しても何も起きない**。
  //
  // ⚠️ 📌 **残債務の記録 (Reviewer 指摘 / 修正不要)**
  //    「`state.distance` は常に `getRankingDistanceChoices(state)` に含まれる」を
  //    **無条件の不変条件として書かないこと。** 穴が1つ残っている:
  //    `buildDefaultRankingFilterState` の `distance ?? axis.distance` と
  //    `resolvePoolTypeChange` の `fallbackDistance ?? fallback.distance` は、
  //    **マスターが退化した場合 (全種目が 25m のみ) に「その水路で選べない距離」を
  //    state に残しえる**。そのとき距離グループは未選択のまま RPC に 25m が飛ぶ。
  //    現マスター (25〜1500m) では到達不能なので修正しない。
  //    ⚠️ 無条件の不変条件として書くと、次の人がそれを前提に検証を省く。
  //
  // ⚠️ **正常な `styles` マスターではこの分岐に到達しない。** QA が実 DB を実測:
  //      Ba 25/50/100/200 / Br 25/50/100/200 / Fly 25/50/100/200
  //      Fr 25/50/100/200/400/800/1500 / IM 100/200/400
  //    **25m を持つ4種目はすべて 50m 以上も持つ**ので、長水路で距離 0 件になる
  //    種目が存在しない。到達するのは**マスターが部分的に欠けた状態**
  //    (`styles` は authenticated に TRUNCATE 権限があり、部分削除も可能) や
  //    将来マスターを編集した場合。**多層防御として正しいが、今日のユーザーに
  //    見える挙動ではない**ことを記録しておく。
  // ---------------------------------------------------------------------------

  /** `Fly` が 25m だけを持つ壊れたマスター。対照に `Ba` は 25/50 を持つ */
  const ONLY_25_FLY: readonly RankingStyleGroup[] = [
    { style: "Fr", distances: [{ distance: 50, styleId: 2 }, { distance: 100, styleId: 3 }] },
    { style: "Ba", distances: [{ distance: 25, styleId: 13 }, { distance: 50, styleId: 14 }] },
    { style: "Fly", distances: [{ distance: 25, styleId: 17 }] },
  ];

  const shortCourseFly: RankingFilterState = {
    event: { mode: "individual", style: "Fly" },
    distance: 25,
    poolType: 0,
    genderCategory: "female",
    scope: "allCompetitions",
    period: { kind: "fiscalYear", year: 2025 },
    aggregation: "allRaces",
  };

  it("🚨 25m しか持たない種目を選んで長水路へ切り替えると、水路が実際に変わる", () => {
    const next = resolvePoolTypeChange(ONLY_25_FLY, shortCourseFly, 1);

    // 行き止まりにならない = 水路が要求どおりになる
    expect(next.poolType).toBe(1);
  });

  it("🚨 [V-P2-74c] 倒れ先は既定 state の種目・距離である (種目を保たない)", () => {
    const next = resolvePoolTypeChange(ONLY_25_FLY, shortCourseFly, 1);

    // ⚠️ 「水路だけ変えて種目は保つ」実装だと **選べない Fly が選択状態で残る**。
    //    倒し先は `active` が条件不成立時に倒す先と同じ既定 state
    expect(next.event).toEqual({ mode: "individual", style: "Fr" });
    expect(next.distance).toBe(50);
    // 選べない距離が残っていない
    const allowed = getRankingDistanceChoices(ONLY_25_FLY, next.event, next.poolType).map(
      (choice) => choice.distance,
    );
    expect(allowed).toContain(next.distance);
    expect(allowed).not.toContain(25);
  });

  it("🚨 [V-P2-74c] 引き継がれる軸 (期間・性別・スコープ・集計) は保たれる", () => {
    const next = resolvePoolTypeChange(ONLY_25_FLY, shortCourseFly, 1);

    // 既定へ倒すのは**種目と距離だけ**。他の軸まで既定に戻すと
    // 「水路を押しただけで絞り込みが全部リセットされた」ように見える
    expect(next.genderCategory).toBe("female");
    expect(next.scope).toBe("allCompetitions");
    expect(next.period).toEqual({ kind: "fiscalYear", year: 2025 });
    expect(next.aggregation).toBe("allRaces");
  });

  it("🚨 [V-P2-74c] 「以前」バケットも引き継がれる (variant を落とさない)", () => {
    // `period` は3 variant あり、**`fiscalYearOrEarlier` が最も取り落としやすい**
    // (第2弾の追加要望で後から入った variant なので)。`fiscalYear` だけで
    // 見ていると、spread ではなく個別コピーする実装に変わったとき
    // 「以前」だけ既定に戻る退行を見逃す
    const state: RankingFilterState = {
      ...shortCourseFly,
      period: { kind: "fiscalYearOrEarlier", year: 2023 },
    };
    const next = resolvePoolTypeChange(ONLY_25_FLY, state, 1);

    expect(next.period).toEqual({ kind: "fiscalYearOrEarlier", year: 2023 });
    expect(next.poolType).toBe(1);
    // 種目は既定へ倒れる (この state でも倒れる側の挙動は変わらない)
    expect(next.event).toEqual({ mode: "individual", style: "Fr" });
  });

  it("🚨 選択肢集合そのものの対照 (倒れる/倒れないの根拠が距離0件かどうかである)", () => {
    // Reviewer の実測 F を固定する。**「常に既定へ倒す」退化実装だと
    // `Ba` の行が説明できなくなる**ので、3点を対で置く
    const choices = (style: "Fly" | "Ba", poolType: 0 | 1) =>
      getRankingDistanceChoices(ONLY_25_FLY, { mode: "individual", style }, poolType).map(
        (choice) => choice.distance,
      );

    expect(choices("Fly", 1), "Fly 長水路は 0 件 (だから種目ごと倒れる)").toEqual([]);
    expect(choices("Fly", 0), "Fly 短水路は 25m だけ").toEqual([25]);
    expect(choices("Ba", 1), "Ba 長水路は 50m が残る (だから種目は倒れない)").toEqual([50]);
  });

  it("その水路でも距離が残る種目なら、種目は変えずに距離だけ丸める", () => {
    // 否定形と対。上の3件が「常に既定へ倒す」実装でも緑になるので置く。
    // Ba は 25/50 を持つので長水路でも 50m が残り、種目は Ba のまま
    const state: RankingFilterState = {
      ...shortCourseFly,
      event: { mode: "individual", style: "Ba" },
      distance: 25,
    };
    const next = resolvePoolTypeChange(ONLY_25_FLY, state, 1);

    expect(next.event).toEqual({ mode: "individual", style: "Ba" });
    expect(next.distance).toBe(50);
    expect(next.poolType).toBe(1);
  });

  it("その水路でも同じ距離が選べるならそのまま維持する (不要な丸めをしない)", () => {
    const state: RankingFilterState = {
      ...shortCourseFly,
      event: { mode: "individual", style: "Fr" },
      distance: 100,
    };
    const next = resolvePoolTypeChange(ONLY_25_FLY, state, 1);

    expect(next.distance).toBe(100);
    expect(next.event).toEqual({ mode: "individual", style: "Fr" });
  });

  it("長水路 → 短水路 でも成立する (逆方向で選択肢が増えるだけ)", () => {
    const state: RankingFilterState = {
      ...shortCourseFly,
      event: { mode: "individual", style: "Ba" },
      distance: 50,
      poolType: 1,
    };
    const next = resolvePoolTypeChange(ONLY_25_FLY, state, 0);

    expect(next.poolType).toBe(0);
    // 50m は短水路にも有るので維持 (25m へ勝手に落とさない)
    expect(next.distance).toBe(50);
  });

  it("リレーでも水路の切り替えが成立する (25m × 4 から長水路へ)", () => {
    const state: RankingFilterState = {
      ...shortCourseFly,
      event: { mode: "relay", relayKind: "free" },
      distance: 25,
      poolType: 0,
    };
    const next = resolvePoolTypeChange(ONLY_25_FLY, state, 1);

    expect(next.poolType).toBe(1);
    // リレーの軸は静的定義なので種目は変わらず、距離だけ 50 に丸まる
    expect(next.event).toEqual({ mode: "relay", relayKind: "free" });
    expect(next.distance).toBe(50);
  });

  it("🚨 [V-P2-74b] 戻り値が non-nullable である (型 pin)", () => {
    // ⚠️ `RankingFilterState | null` に戻す変更が「呼び出し側は対応済み」と
    //    判断されて通ると**行き止まりが再導入される**。この代入は
    //    nullable に緩めた瞬間に `tsc --noEmit` が落ちる。
    //    `expectTypeOf` は使わない — このリポジトリの vitest は `typecheck` を
    //    有効にしていないので実行時に無音で通る (= 何も担保しない)。
    const pinned: RankingFilterState = resolvePoolTypeChange(ONLY_25_FLY, shortCourseFly, 1);

    // 型 pin の行が消されたら落ちるようにするための実行時センチネル
    expect(pinned.poolType).toBe(1);
  });
});

// =============================================================================
describe("[V-EA-05] toRankingQueryTarget はモードを event 1点から決める", () => {
  it("個人種目は styleId を引いて個人の条件を返す", () => {
    const target = toRankingQueryTarget(GROUPS, DEFAULT_INDIVIDUAL_STATE);

    expect(target?.mode).toBe("individual");
    if (target?.mode !== "individual") throw new Error("individual ではない");
    // 既定は Fr 50m = 実 DB の styleId 2 (100m は 3)
    expect(target.filters.styleId).toBe(2);
    expect(target.filters.poolType).toBe(1);
    expect(target.filters.gender).toBe("male");
    expect(target.filters.scope).toBe("teamCompetitions");
  });

  it("リレーは leg 距離と性別区分をそのまま条件にする", () => {
    const state: RankingFilterState = {
      event: { mode: "relay", relayKind: "medley" },
      distance: 50,
      poolType: 0,
      genderCategory: "mixed",
      scope: "allCompetitions",
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };
    const target = toRankingQueryTarget(GROUPS, state);

    expect(target?.mode).toBe("relay");
    if (target?.mode !== "relay") throw new Error("relay ではない");
    expect(target.filters.relayKind).toBe("medley");
    expect(target.filters.legDistance).toBe(50);
    expect(target.filters.poolType).toBe(0);
    expect(target.filters.genderCategory).toBe("mixed");
    // scope はリレーの RPC に無い軸なので条件に混ざらない
    expect(target.filters).not.toHaveProperty("scope");
  });

  it("🚨 個人を選んでいるのにリレーの条件、という組み合わせを作れない", () => {
    for (const choice of RANKING_EVENT_CHOICES) {
      const state: RankingFilterState = {
        ...DEFAULT_INDIVIDUAL_STATE,
        event: choice.selection,
        // リレーにしか無い距離を入れても mode は event から決まる
        distance: choice.selection.mode === "relay" ? 100 : 100,
      };
      const target = toRankingQueryTarget(GROUPS, state);
      expect(target?.mode, choice.value).toBe(choice.selection.mode);
    }
  });

  // -------------------------------------------------------------------------
  // 🚨 Reviewer 申し送り: 「不整合な状態が表現不能」は**型ではなくハンドラの検証**で
  //    担保されている。`RankingFilterState` は
  //    `{event: {mode:"individual"}, genderCategory: "mixed"}` を**型として作れる**。
  //    守っているのは3層:
  //      ① UI 各ハンドラのモード別 allowlist (`RankingFilters.tsx` / `RankingFilterSheet.tsx`)
  //      ② `resolveRankingEventChange` の正規化   ([V-EA-04] が担保)
  //      ③ `toRankingQueryTarget` の**再**正規化   (ここが担保)
  //    ③は②を通らずに state が作られた場合の最後の砦なので、
  //    ②のテストだけでは③を外しても緑のまま通る。**独立に固定する。**
  // -------------------------------------------------------------------------
  it("🚨 型としては作れる不整合な state (個人 + mixed) でも male に再正規化される", () => {
    // ②を通していない = 直接組み立てた state。実際の到達経路としては
    // 「永続化された古い条件を復元する」「別の画面から state を受け取る」がある
    const inconsistent: RankingFilterState = {
      event: { mode: "individual", style: "Fr" },
      distance: 100,
      poolType: 1,
      genderCategory: "mixed", // 個人種目に mixed は存在しない
      scope: "teamCompetitions",
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };

    const target = toRankingQueryTarget(GROUPS, inconsistent);
    expect(target?.mode).toBe("individual");
    if (target?.mode !== "individual") throw new Error("individual ではない");

    // RPC の条件に mixed が漏れない (漏れると `p_gender` が不正値になる)
    expect(target.filters.gender).toBe("male");
    expect(target.filters.gender).not.toBe("mixed");
  });

  it("🚨 女子 + 個人 の不整合でない組み合わせは潰さない (一律 male にしていない)", () => {
    // 上のテストが「常に male を返す」実装でも緑になるので、対で置く
    const consistent: RankingFilterState = {
      event: { mode: "individual", style: "Fr" },
      distance: 100,
      poolType: 1,
      genderCategory: "female",
      scope: "teamCompetitions",
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };

    const target = toRankingQueryTarget(GROUPS, consistent);
    if (target?.mode !== "individual") throw new Error("individual ではない");
    expect(target.filters.gender).toBe("female");
  });

  it("リレー側では mixed をそのまま通す (③の正規化が個人モードだけに効く)", () => {
    const relayMixed: RankingFilterState = {
      event: { mode: "relay", relayKind: "medley" },
      distance: 100,
      poolType: 1,
      genderCategory: "mixed",
      scope: "teamCompetitions",
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };

    const target = toRankingQueryTarget(GROUPS, relayMixed);
    if (target?.mode !== "relay") throw new Error("relay ではない");
    // 混合リレーは実在する種目区分なので潰してはいけない
    expect(target.filters.genderCategory).toBe("mixed");
  });

  it("個人種目で styleId が引けないときだけ null (リレーは null にならない)", () => {
    // (種目, 距離) の組がマスターに無い = データ異常
    const broken: RankingFilterState = { ...DEFAULT_INDIVIDUAL_STATE, distance: 333 };
    expect(toRankingQueryTarget(GROUPS, broken)).toBeNull();

    // リレーは静的定義由来なので groups が空でも返る
    const relay: RankingFilterState = {
      ...DEFAULT_RELAY_STATE,
      event: { mode: "relay", relayKind: "medley" },
    };
    expect(toRankingQueryTarget([], relay)).not.toBeNull();
  });
});

// =============================================================================
describe("[V-EA-06] countActiveRankingFilterState は画面に出ていない軸を数えない", () => {
  const defaults = DEFAULT_INDIVIDUAL_STATE;

  it("既定そのままなら 0", () => {
    expect(countActiveRankingFilterState(defaults, defaults)).toBe(0);
  });

  it("種目 / 距離 / 水路 / 性別 / スコープを変えるとそれぞれ 1 ずつ増える", () => {
    expect(
      countActiveRankingFilterState({ ...defaults, event: { mode: "individual", style: "Ba" } }, defaults),
    ).toBe(1);
    expect(countActiveRankingFilterState({ ...defaults, distance: 200 }, defaults)).toBe(1);
    expect(countActiveRankingFilterState({ ...defaults, poolType: 0 }, defaults)).toBe(1);
    expect(countActiveRankingFilterState({ ...defaults, genderCategory: "female" }, defaults)).toBe(
      1,
    );
    expect(countActiveRankingFilterState({ ...defaults, scope: "allCompetitions" }, defaults)).toBe(
      1,
    );
  });

  it("🚨 リレー表示中の scope 差分は数えない (消せないバッジを作らない)", () => {
    const relayWithScopeDiff: RankingFilterState = {
      event: { mode: "relay", relayKind: "free" },
      // 既定と同じ距離にする (距離が差分に数えられて件数が狂わないように)
      distance: 50,
      poolType: 1,
      genderCategory: "male",
      scope: "allCompetitions", // 既定と違うが、リレー中は絞り込みに出ていない
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };
    // 数えるのは種目 (Fr → relay:free) の 1 だけ
    expect(countActiveRankingFilterState(relayWithScopeDiff, defaults)).toBe(1);
  });

  it("リレー表示中の mixed は数える (画面に出ている軸なので)", () => {
    const relay: RankingFilterState = {
      event: { mode: "relay", relayKind: "free" },
      distance: 50,
      poolType: 1,
      genderCategory: "mixed",
      scope: "teamCompetitions",
      period: { kind: "allTime" },
      aggregation: "personalBest",
    };
    // 種目 1 + 性別区分 1
    expect(countActiveRankingFilterState(relay, defaults)).toBe(2);
  });

  it("個人種目では mixed が男子に正規化されてから比較される (差分に化けない)", () => {
    // 個人モードなのに state に mixed が残っている異常値。正規化後は既定と同値
    // なので性別の差分としては数えない (数えると消せないバッジになる)
    const state: RankingFilterState = { ...defaults, genderCategory: "mixed" };
    expect(countActiveRankingFilterState(state, defaults)).toBe(0);
  });

  it("リレー既定からの比較では scope が既定と違っても 0 のまま", () => {
    const relayDefaults = DEFAULT_RELAY_STATE;
    const state: RankingFilterState = { ...relayDefaults, scope: "allCompetitions" };
    expect(countActiveRankingFilterState(state, relayDefaults)).toBe(0);
  });
});

// =============================================================================
describe("[V-EA-07] モードをまたぐ往復", () => {
  it("Fr 50m → フリーリレー → Fr が既定と完全一致する", () => {
    const start = buildDefaultRankingFilterState(GROUPS);

    const toRelay = resolveRankingEventChange(GROUPS, start, {
      mode: "relay",
      relayKind: "free",
    });
    expect(toRelay).not.toBeNull();

    const back = resolveRankingEventChange(GROUPS, toRelay!, {
      mode: "individual",
      style: "Fr",
    });
    expect(back).not.toBeNull();

    // 期待値は関数の出力ではなくリテラル
    expect(back).toEqual(DEFAULT_INDIVIDUAL_STATE);
    expect(countActiveRankingFilterState(back!, start)).toBe(0);
  });

  it("メドレーリレー経由で戻ると距離が変わる (選んだ距離が維持されたまま戻る)", () => {
    // 往復が無条件に恒等ではないことも固定する。
    // ⚠️ 既定は長水路なので 25m は選べない。100m を選んで戻す形にする
    //    (25m を使うと「長水路で選べない距離」を作ってしまい観点が混ざる)
    const start = buildDefaultRankingFilterState(GROUPS);
    expect(start.distance).toBe(50);

    const medley = resolveRankingEventChange(GROUPS, start, {
      mode: "relay",
      relayKind: "medley",
    })!;
    // 50m は medley にも有るので維持される
    expect(medley.distance).toBe(50);

    const widened: RankingFilterState = { ...medley, distance: 100 };
    const back = resolveRankingEventChange(GROUPS, widened, {
      mode: "individual",
      style: "Fr",
    })!;

    expect(back.distance).toBe(100);
    expect(countActiveRankingFilterState(back, start)).toBe(1);
  });

  it("7択すべてを順に選んでも state が壊れない (距離が選択肢集合内に留まる)", () => {
    let state = buildDefaultRankingFilterState(GROUPS);

    for (const choice of RANKING_EVENT_CHOICES) {
      const next = resolveRankingEventChange(GROUPS, state, choice.selection);
      expect(next, `${choice.value} への切り替えが null`).not.toBeNull();
      state = next!;

      const allowed = getRankingDistanceChoices(GROUPS, state.event, state.poolType).map((c) => c.distance);
      expect(allowed, `${choice.value} の選択肢が空`).not.toEqual([]);
      expect(allowed, `${choice.value} で距離 ${state.distance} が選択肢外`).toContain(
        state.distance,
      );

      // 個人モードに mixed が残らない
      if (state.event.mode === "individual") {
        expect(state.genderCategory).not.toBe("mixed");
      }
    }
  });
});
