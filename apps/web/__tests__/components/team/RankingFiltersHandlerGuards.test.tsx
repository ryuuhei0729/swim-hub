/**
 * RankingFilters — 選択肢集合が「そのモードのものだけ」であること
 *
 * 対象: apps/web/components/team/rankings/RankingFilters.tsx
 *
 * ここで固定するのは **ユーザーに見える契約**である:
 *   個人モードの性別は 男子/女子 の2択 (混合を描かない) /
 *   リレーは3択 / 距離はマスターに実在するものだけ /
 *   距離が1つも無い種目のピルを作らない / 正規の選択は通る
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🚨 **`RankingFilters` のハンドラ内 allowlist は実行時の防御になっていない。**
 *
 * `RankingFilterState` は型としては
 * `{event: {mode:"individual"}, genderCategory: "mixed"}` を作れるので、
 * 「不整合な状態が表現不能」を担保しているのは
 *   ② `resolveRankingEventChange` の正規化   (`rankingEventAxis.test.ts` [V-EA-04])
 *   ③ `toRankingQueryTarget` の再正規化       (`rankingEventAxis.test.ts` [V-EA-05])
 * の2層である (どちらもプロダクションを書き換えるミューテーションで
 * 独立に赤を実証済み)。
 *
 * ハンドラの allowlist に**範囲外の値が到達する経路が無い**理由は
 * `./FilterRadioGroup.tsx` の1行に閉じている:
 *
 *     onChange={() => onChange(option.value)}
 *
 * **引数を取らないクロージャ**なので event を一度も読まず、描画時の
 * `option.value` をそのまま渡す。よって DOM の `input.value` を書き換えて
 * 範囲外の値を注入しても、ハンドラには**描画時の値**しか届かない。
 *
 * QA 実測 (`onChange` を `(e) => onChange(e.target.value)` に書き換える
 * ミューテーションとの対比):
 *
 *     原本 (引数なしクロージャ)      → handler received: ["female"]  (注入が無効)
 *     e.target.value を読む形に変更  → handler received: []          (注入が届き allowlist が弾く)
 *
 * ⚠️ これは **React のバージョンに依存しない局所の事実**である。
 *    「controlled input の onChange には JSX 宣言値しか来ない」という規則は
 *    React 19 に存在しない (`e.target.value` は生きた DOM プロパティを読む)。
 *    QA が最初にそう書いたのは誤りだった。
 *
 * このため「範囲外の値を注入して弾かれるか」を assert するテストは
 * **allowlist の有無と無関係に必ず緑になる**。実際に Reviewer 指定の
 * ミューテーション (`allowed` を `RELAY_RANKING_GENDER_VALUES` 固定にする) を
 * 当てても注入版テストは 12/12 緑のまま通ったので、そのファイルは破棄した。
 *
 * ⚠️ **allowlist の形をソース文字列で固定するテストも置かない。**
 *    偽陽性 (挙動を変えないリファクタ — 変数名変更 / 三項の順序反転 / 整形 /
 *    ヘルパー抽出 — で赤くなる) と偽陰性 (`allowed.find(...)` を
 *    `allowed.at(0)` に変えても / `if (!next) return;` を消しても文字列が残れば緑)
 *    を同時に持ち、守るべき挙動も無いため。
 *
 * ⚠️ 申し送り: ハンドラの検証を挙動で守りたいなら、allowlist を
 *    **shared の純関数として切り出す**必要がある
 *    (例: `parseRankingGenderValue(mode, value): RelayRankingGenderFilter | null`)。
 *    そうすれば②③と同じ形でミューテーション実証できる。
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import type { RankingFilterState } from "@apps/shared/utils/rankingEventAxis";
import type { RankingStyleGroup } from "@apps/shared/utils/rankingStyleAxis";
import RankingFilters from "@/components/team/rankings/RankingFilters";

/** styles マスター由来の選択肢 (実 DB の styleId を使う)。Fr は 50/100/200 だけ */
const GROUPS: RankingStyleGroup[] = [
  {
    style: "Fr",
    distances: [
      { distance: 50, styleId: 2 },
      { distance: 100, styleId: 3 },
      { distance: 200, styleId: 4 },
    ],
  },
  {
    style: "Br",
    distances: [
      { distance: 100, styleId: 10 },
      { distance: 200, styleId: 11 },
    ],
  },
];

const INDIVIDUAL_STATE: RankingFilterState = {
  event: { mode: "individual", style: "Fr" },
  distance: 100,
  poolType: 1,
  genderCategory: "male",
  scope: "teamCompetitions",  // 第2弾で追加された2軸。既定は 通算 + 各自のベスト (リテラルで書く)
  period: { kind: "allTime" },
  aggregation: "personalBest",
};

const RELAY_STATE: RankingFilterState = {
  event: { mode: "relay", relayKind: "free" },
  distance: 100,
  poolType: 1,
  genderCategory: "male",
  scope: "teamCompetitions",  // 第2弾で追加された2軸。既定は 通算 + 各自のベスト (リテラルで書く)
  period: { kind: "allTime" },
  aggregation: "personalBest",
};

function renderFilters(state: RankingFilterState) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider
      locale="ja"
      messages={messages as unknown as AbstractIntlMessages}
      timeZone="Asia/Tokyo"
    >
      <RankingFilters groups={GROUPS} state={state} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

/** そのグループの radio の value を DOM 順に返す */
function optionValues(name: string): string[] {
  return Array.from(
    screen.getByTestId(name).querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).map((input) => input.value);
}

/** 選択肢を選ぶ (label 経由 = 実ユーザーと同じ経路) */
function choose(name: string, value: string) {
  const input = screen.getByTestId(`${name}-option-${value}`);
  const label = document.querySelector(`label[for="${input.getAttribute("id")}"]`);
  if (!label) throw new Error(`label[for] が無い (${name} / ${value})`);
  fireEvent.click(label);
}

describe("RankingFilters: そのモードの選択肢集合しか描かない (層①の観測可能部分)", () => {
  it("🚨 個人モードの性別は male / female の 2 択で mixed を描かない", () => {
    renderFilters(INDIVIDUAL_STATE);
    // mixed の radio が存在しない = 個人の表に mixed が入る経路が UI に無い
    expect(optionValues("team-rankings-gender")).toEqual(["male", "female"]);
    expect(screen.queryByTestId("team-rankings-gender-option-mixed")).toBeNull();
  });

  it("リレーモードの性別は male / female / mixed の 3 択", () => {
    renderFilters(RELAY_STATE);
    expect(optionValues("team-rankings-gender")).toEqual(["male", "female", "mixed"]);
  });

  it("🚨 距離はマスターに実在するものだけを描く (静的な [25..1500] を並べない)", () => {
    renderFilters(INDIVIDUAL_STATE);
    // GROUPS の Fr は 50/100/200 のみ。25m や 1500m の radio は存在しない
    expect(optionValues("team-rankings-distance")).toEqual(["50", "100", "200"]);
    expect(screen.queryByTestId("team-rankings-distance-option-1500")).toBeNull();
    expect(screen.queryByTestId("team-rankings-distance-option-25")).toBeNull();
  });

  it("🚨 リレーモードの距離は RELAY_EVENTS 由来で 400m を描かない", () => {
    // `RELAY_STATE` は長水路 (poolType=1) なので `25m × 4` も落ちる ([V-P2-61])
    renderFilters(RELAY_STATE);
    expect(optionValues("team-rankings-distance")).toEqual(["50", "100", "200"]);
    expect(screen.queryByTestId("team-rankings-distance-option-400")).toBeNull();
    expect(screen.queryByTestId("team-rankings-distance-option-25")).toBeNull();
  });

  it("🚨 短水路のリレーでは 25m が現れる (400m は水路に関係なく出ない)", () => {
    // 上のテストが「25 も 400 も常に無い」実装でも緑になるので対で置く。
    // 25m は**水路で落ちている**、400m は**リレー種目に存在しない**で理由が違う
    renderFilters({ ...RELAY_STATE, poolType: 0 });
    expect(optionValues("team-rankings-distance")).toEqual(["25", "50", "100", "200"]);
    expect(screen.queryByTestId("team-rankings-distance-option-400")).toBeNull();
  });

  it("🚨 種目に距離が1つも無いものは描かない (押しても何も起きないピルを作らない)", () => {
    // GROUPS には Ba / Fly / IM が無い
    renderFilters(INDIVIDUAL_STATE);
    expect(optionValues("team-rankings-event")).toEqual(["Fr", "Br", "relay:free", "relay:medley"]);
  });

  it("正規の選択は通る (何でも弾いているわけではない)", () => {
    const { onChange } = renderFilters(INDIVIDUAL_STATE);

    choose("team-rankings-gender", "female");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ genderCategory: "female" });

    choose("team-rankings-distance", "200");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ distance: 200 });

    choose("team-rankings-event", "Br");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({
      event: { mode: "individual", style: "Br" },
    });

    choose("team-rankings-pool-type", "0");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ poolType: 0 });

    choose("team-rankings-scope", "allCompetitions");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ scope: "allCompetitions" });
  });

  it("リレーモードで mixed を選べる (混合リレーは実在の種目区分)", () => {
    const { onChange } = renderFilters(RELAY_STATE);
    choose("team-rankings-gender", "mixed");
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ genderCategory: "mixed" });
  });
});

/**
 * [V-P2-72] 🚨 長水路で距離を1つも持たない種目のピルを出さない
 *
 * ⚠️ **このフィクスチャは web と mobile の両方に通す。**
 *    25m 専用種目は現マスターに存在しないので、fixture を入れないと
 *    **両プラットフォームとも緑のまま**になる。W-1 (web が `poolType` を
 *    渡していなかった) が Reviewer のレビューまで生き残った理由がこれで、
 *    片方だけに通すともう片方の同型の退行を見逃す。
 *    対になる mobile 側: `apps/mobile/components/teams/rankings/__tests__/
 *    RankingFilterSheet.test.tsx` の同名 describe。
 *
 * 「押しても何も起きないピル」を作らないための判定で、
 * `getRankingDistanceChoices(groups, choice.selection, state.poolType).length > 0`
 * が唯一の定義元 (ピルを出す条件と押せる条件を同じ関数から導く)。
 */
describe("[V-P2-72] 長水路で 25m しか持たない種目のピルを出さない", () => {
  /** `Fly` が 25m だけを持つマスター。対照に `Ba` は 25/50 を持つ */
  const ONLY_25_FLY: RankingStyleGroup[] = [
    { style: "Fr", distances: [{ distance: 50, styleId: 2 }, { distance: 100, styleId: 3 }] },
    { style: "Ba", distances: [{ distance: 25, styleId: 13 }, { distance: 50, styleId: 14 }] },
    { style: "Fly", distances: [{ distance: 25, styleId: 17 }] },
  ];

  function renderWith(poolType: 0 | 1) {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider
        locale="ja"
        messages={messages as unknown as AbstractIntlMessages}
        timeZone="Asia/Tokyo"
      >
        <RankingFilters
          groups={ONLY_25_FLY}
          state={{ ...INDIVIDUAL_STATE, poolType, distance: poolType === 1 ? 50 : 25 }}
          onChange={onChange}
        />
      </NextIntlClientProvider>,
    );
    return { onChange };
  }

  it("🚨 長水路では Fly のピルが出ない", () => {
    renderWith(1);

    expect(optionValues("team-rankings-event")).toEqual([
      "Fr",
      "Ba",
      "relay:free",
      "relay:medley",
    ]);
    expect(screen.queryByTestId("team-rankings-event-option-Fly")).toBeNull();
  });

  it("🚨 短水路では Fly のピルが出る (水路が理由であることの対照)", () => {
    renderWith(0);

    expect(optionValues("team-rankings-event")).toEqual([
      "Fr",
      "Ba",
      "Fly",
      "relay:free",
      "relay:medley",
    ]);
    expect(screen.getByTestId("team-rankings-event-option-Fly")).toBeInTheDocument();
  });

  it("🚨 長水路でも Ba のピルは残る (「25m を持つ種目を落とす」実装への退行を検出)", () => {
    // `Ba` は 25m も持つが 50m も持つので長水路でも選べる。
    // 「25m を持つ種目を落とす」と誤実装すると Ba も消える
    renderWith(1);

    expect(screen.getByTestId("team-rankings-event-option-Ba")).toBeInTheDocument();
  });

  it("リレーのピルは水路に関係なく出る (リレーは styles に依存しない)", () => {
    for (const poolType of [0, 1] as const) {
      const view = render(
        <NextIntlClientProvider
          locale="ja"
          messages={messages as unknown as AbstractIntlMessages}
          timeZone="Asia/Tokyo"
        >
          <RankingFilters
            groups={ONLY_25_FLY}
            state={{ ...INDIVIDUAL_STATE, poolType, distance: poolType === 1 ? 50 : 25 }}
            onChange={vi.fn()}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId("team-rankings-event-option-relay:free")).toBeInTheDocument();
      expect(screen.getByTestId("team-rankings-event-option-relay:medley")).toBeInTheDocument();
      view.unmount();
    }
  });
});
