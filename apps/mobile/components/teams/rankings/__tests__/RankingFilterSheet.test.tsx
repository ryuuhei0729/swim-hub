/**
 * RankingFilterSheet (mobile) — QA Sprint Contract Phase B
 *
 * 対象: apps/mobile/components/teams/rankings/RankingFilterSheet.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-M10] ドラフト/適用方式: チップ操作では親へコミットせず、「適用」で初めて渡す
 *   [V-M11] 種目/距離の選択肢は styles マスター由来 (25m×4種目 と 1500mFr を落とさない)。
 *           水路/性別/対象の並び順は shared の 1 箇所に集約された順序に従う
 *           (水路 = 短水路→長水路、性別 = **男子→女子**、対象 = 狭い→広い)
 *           第3弾でユーザー依頼により「男女すべて」を廃止し男子を既定にした。
 *           ja のラベルは競技表記に合わせて「男子 / 女子」(旧「男性 / 女性」)
 *   [V-M12] 種目を変えると同距離を維持し、無ければその種目の最短距離に落ちる
 *           (web の RankingFilters と同じ shared 関数を使っているか)
 *   [V-M13] 単一選択チップは必ず 1 つ選択された状態を保つ (再タップで未選択に戻らない)
 *   [V-M14] allCompetitions を選ぶとドラフト上で注意書きが出る
 *   [V-M15] キャンセルでは適用されず、開き直すと適用中の条件に戻る
 *
 * トートロジー防止: 期待 styleId は `buildRankingStyleGroups` の戻り値からではなく、
 * ローカル実 DB (public.styles) の実測 id をテスト側に手書きして突き合わせる。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RankingFilterSheet } from "../RankingFilterSheet";
import { buildRankingStyleGroups } from "@apps/shared/utils/rankingStyleAxis";
import type { RankingStyleGroup } from "@apps/shared/utils/rankingStyleAxis";
import type { Style, SwimStyle } from "@apps/shared/types";
import type {
  RankingFilterState,
  RankingPeriodChoice,
} from "@apps/shared/utils/rankingEventAxis";

// ---------------------------------------------------------------------------
// styles マスター (ローカル実 DB の public.styles 22 行の実測値。
// 実 DB 側の裏付けは supabase/tests/11_team_record_rankings_rpc.test.sql V-DB-40)
// ---------------------------------------------------------------------------
const RAW_STYLES: ReadonlyArray<[number, string, number]> = [
  [1, "Fr", 25],
  [2, "Fr", 50],
  [3, "Fr", 100],
  [4, "Fr", 200],
  [5, "Fr", 400],
  [6, "Fr", 800],
  [7, "Fr", 1500],
  [8, "Br", 25],
  [9, "Br", 50],
  [10, "Br", 100],
  [11, "Br", 200],
  [12, "Ba", 25],
  [13, "Ba", 50],
  [14, "Ba", 100],
  [15, "Ba", 200],
  [16, "Fly", 25],
  [17, "Fly", 50],
  [18, "Fly", 100],
  [19, "Fly", 200],
  [20, "IM", 100],
  [21, "IM", 200],
  [22, "IM", 400],
];

const STYLE_ROWS: Style[] = RAW_STYLES.map(([id, style, distance]) => ({
  id,
  name: `db-name-${id}`,
  name_jp: `db-name-jp-${id}`,
  style: style as SwimStyle,
  distance,
}));

const STYLE_GROUPS = buildRankingStyleGroups(STYLE_ROWS);

/**
 * ⚠️ **prop は `filters: TeamRankingFilters` から
 *    `filterState: RankingFilterState` に変わった (2026-09-08 の種目軸統合)。**
 *
 * 統合前は個人種目用の条件オブジェクト (`styleId` を持つ) をそのまま渡していたが、
 * 統合後は「個人5種目 + リレー2種類」を1つの state で表すので
 *   - 種目は `event` (`{mode:"individual",style}` / `{mode:"relay",relayKind}`)
 *   - 距離は `distance` (個人は `styles.distance` / リレーは**1レグ距離**)
 *   - 性別はリレーの語彙 (`male`/`female`/`mixed`) で保持し、個人へ切り替えた
 *     時点で `toIndividualGender` が正規化する
 * になった。`styleId` はシートが持たず、RPC 条件に射影する時点で引く。
 *
 * 既定値はリテラルで書く (`buildDefaultRankingFilterState` の出力を fixture に
 * 使うと「関数が自分と一致する」assert になる)。
 */
function filterState(overrides: Partial<RankingFilterState> = {}): RankingFilterState {
  return {
    event: { mode: "individual", style: "Fr" },
    // ⚠️ 第2弾 (要望4) で既定距離が 100m → 50m
    distance: 50,
    poolType: 1,
    genderCategory: "male",
    scope: "teamCompetitions",
    // 第2弾の2軸。既定は 通算 + 各自のベスト
    period: { kind: "allTime" },
    aggregation: "personalBest",
    ...overrides,
  };
}

/**
 * 期間の選択肢。**`buildRankingPeriodChoices()` の出力を使わない** —
 * それを fixture にすると「関数が自分と一致する」assert になる。
 * 通算 + 直近5年度 (降順) をリテラルで書き、基準年度も固定する。
 *
 * ⚠️ シートは `parseRankingPeriodValue(value, periodChoices)` で
 *    **渡された配列そのもの**から逆引きする設計なので、ここに無い年度
 *    (例 `fy:2019`) はシート経由では選べない。その観点は別テストで見る。
 */
const PERIOD_CHOICES: RankingPeriodChoice[] = [
  { value: "allTime", period: { kind: "allTime" } },
  { value: "fy:2026", period: { kind: "fiscalYear", year: 2026 } },
  { value: "fy:2025", period: { kind: "fiscalYear", year: 2025 } },
  { value: "fy:2024", period: { kind: "fiscalYear", year: 2024 } },
  { value: "fy:2023", period: { kind: "fiscalYear", year: 2023 } },
  { value: "fy:2022", period: { kind: "fiscalYear", year: 2022 } },
];

type SheetProps = React.ComponentProps<typeof RankingFilterSheet>;

/**
 * `onApply` / `onClose` は必ず `vi.fn()` (= Mock) にする。
 * `props.onApply ?? vi.fn()` のままだと型がユニオンになり `.mock` を参照できない。
 */
function renderSheet(
  props: Partial<Omit<SheetProps, "onApply" | "onClose">> & {
    onApply?: Mock;
    onClose?: Mock;
  } = {},
) {
  const onApply: Mock = props.onApply ?? vi.fn();
  const onClose: Mock = props.onClose ?? vi.fn();
  const result = render(
    <RankingFilterSheet
      visible={props.visible ?? true}
      onClose={onClose}
      filterState={props.filterState ?? filterState()}
      periodChoices={props.periodChoices ?? PERIOD_CHOICES}
      styleGroups={props.styleGroups ?? STYLE_GROUPS}
      onApply={onApply}
    />,
  );
  return { ...result, onApply, onClose };
}

const chip = (label: string) => screen.getByRole("button", { name: label });

/**
 * 選択中チップの判定。
 *
 * `accessibilityState={{ selected }}` は RN の API であり、
 * `apps/mobile/__mocks__/react-native.ts` の Pressable は props をそのまま
 * `<button>` に流すため DOM の aria-selected にはならない (React が未知 prop として捨てる)。
 * jsdom で観測できるのはインライン style に落ちた `chipSelected`
 * (backgroundColor: "#2563EB") だけなので、そこで判定する。
 */
const SELECTED_CHIP_BACKGROUND = "rgb(37, 99, 235)"; // #2563EB
const isSelected = (label: string) => chip(label).style.backgroundColor === SELECTED_CHIP_BACKGROUND;

/** フッターの「キャンセル」「適用」を除いた、選択中チップのラベル一覧 */
const FOOTER_LABELS = ["キャンセル", "適用", "閉じる"];
const selectedChipLabels = () =>
  screen
    .getAllByRole("button")
    .filter((node) => !FOOTER_LABELS.includes(node.textContent ?? ""))
    .filter((node) => node.style.backgroundColor === SELECTED_CHIP_BACKGROUND)
    .map((node) => node.textContent);

describe("RankingFilterSheet (mobile)", () => {
  // -------------------------------------------------------------------------
  // [V-M11] 選択肢の網羅性
  // -------------------------------------------------------------------------
  it("[V-M11] 種目チップは canonical 5 種目", () => {
    renderSheet();

    for (const label of ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"]) {
      expect(chip(label)).toBeTruthy();
    }
  });

  it("[V-M11] 🚨 長水路 (既定) の Fr 距離チップは 6 件で 25m を含まない", () => {
    renderSheet();

    const distanceLabels = screen
      .getAllByRole("button")
      .map((node) => node.textContent ?? "")
      .filter((text) => /^\d+m$/.test(text));

    expect(distanceLabels).toEqual(["50m", "100m", "200m", "400m", "800m", "1500m"]);
  });

  it("[V-M11] 個人メドレーに切り替えると距離チップは 3 件になる (25m/50m/800m は無い)", () => {
    renderSheet();

    fireEvent.click(chip("個人メドレー"));

    const distanceLabels = screen
      .getAllByRole("button")
      .map((node) => node.textContent ?? "")
      .filter((text) => /^\d+m$/.test(text));

    expect(distanceLabels).toEqual(["100m", "200m", "400m"]);
  });

  // ---------------------------------------------------------------------------
  // 選択肢の並び順 (shared の RANKING_POOL_TYPE_VALUES / RANKING_GENDER_VALUES に集約)
  //
  // 以前は web と mobile がそれぞれ配列を持ち、**既に順序が乖離**していた
  // (web: 0/1・all/male/female、mobile: 1/0・male/female/all)。
  // shared の1箇所に寄せた上で、並び順は次の根拠で確定した:
  //
  //   水路 = 短水路(0) → 長水路(1)
  //     既定値は長水路だが、リストの先頭である必要はない (既定は選択状態で示される)。
  //     「種目 × 距離 × 水路でタイムを比較する」最も近い既存画面
  //     `/time-level` (`TimeLevelClient.tsx:176` が poolType === 0、`:187` が === 1)
  //     が短水路を先に描画しており、画面間で並びを揃える方が上位。
  //
  //   性別 = 男子 → 女子 (「男女すべて」は廃止)
  //     `all` は DB 値ではない (絞り込まないことを意味する) ため先頭。
  //     以降は `users.gender` の canonical な数値順 (male=0 → female=1)。
  //
  // ⚠️ 期待値は shared の定数を import せずリテラルで直書きする
  //    (import するとトートロジーになり、定数を書き換えた瞬間にテストも一緒に動く)。
  //    並びを pin する価値は残るので、shared から読まなくなったら赤くなるべき。
  // ---------------------------------------------------------------------------
  it("[V-M11] 水路チップは 短水路 → 長水路 の順 (既存 /time-level の描画順と一致)", () => {
    renderSheet();

    const poolLabels = screen
      .getAllByRole("button")
      .map((node) => node.textContent ?? "")
      .filter((text) => text === "長水路" || text === "短水路");

    expect(poolLabels).toEqual(["短水路", "長水路"]);
  });

  it("[V-M11] 並びが変わっても既定の選択は長水路のまま (先頭 = 既定ではない)", () => {
    renderSheet();

    // 短水路が先頭に描画されるが、選択されているのは既定の長水路
    expect(isSelected("長水路")).toBe(true);
    expect(isSelected("短水路")).toBe(false);
  });

  it("[V-M11] 性別チップは 男子 → 女子 の2択 (「男女すべて」は廃止)", () => {
    renderSheet();

    const genderLabels = screen
      .getAllByRole("button")
      .map((node) => node.textContent ?? "")
      .filter((text) => ["男子", "女子", "男女すべて", "男性", "女性"].includes(text));

    // 廃止した「男女すべて」も、旧ラベルの「男性 / 女性」も出ない
    expect(genderLabels).toEqual(["男子", "女子"]);
  });

  it("[V-M11] 対象大会チップは 狭い → 広い の順 (露出が広い allCompetitions を後ろに置く)", () => {
    renderSheet();

    const scopeLabels = screen
      .getAllByRole("button")
      .map((node) => node.textContent ?? "")
      .filter((text) => ["チームの大会", "すべての大会"].includes(text));

    expect(scopeLabels).toEqual(["チームの大会", "すべての大会"]);
  });

  it("[V-M11] 対象大会チップは チームの大会 / すべての大会 の 2 つ", () => {
    renderSheet();

    expect(chip("チームの大会")).toBeTruthy();
    expect(chip("すべての大会")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // [V-M10] ドラフト/適用
  // -------------------------------------------------------------------------
  it("[V-M10] チップを押しただけでは onApply が呼ばれない", () => {
    const { onApply } = renderSheet();

    fireEvent.click(chip("短水路"));
    fireEvent.click(chip("女子"));
    fireEvent.click(chip("すべての大会"));

    expect(onApply).not.toHaveBeenCalled();
  });

  it("[V-M10] 「適用」を押したときにドラフト全体が一度だけ親へ渡る", () => {
    const { onApply } = renderSheet();

    fireEvent.click(chip("短水路"));
    fireEvent.click(chip("女子"));
    fireEvent.click(chip("すべての大会"));
    fireEvent.click(chip("平泳ぎ"));
    fireEvent.click(chip("適用"));

    expect(onApply).toHaveBeenCalledTimes(1);
    // ⚠️ 渡るのは `RankingFilterState`。**`styleId` は持たない**
    //    (RPC 条件への射影は `toRankingQueryTarget` の担当)。
    //    厳密一致で見るので、余計な軸が復活したらここが落ちる。
    //    第2弾で `period` / `aggregation` が state の軸になったので、
    //    触っていない2軸が既定のまま**そのまま持ち越される**ことも同時に固定する
    expect(onApply).toHaveBeenCalledWith({
      // Fr 50m → 平泳ぎ は 50m が存在するので維持
      event: { mode: "individual", style: "Br" },
      distance: 50,
      poolType: 0,
      // 個人種目でもリレーの語彙で保持する (mixed は個人へ切り替えた時点で正規化)
      genderCategory: "female",
      scope: "allCompetitions",
      // 触っていない2軸は既定のまま持ち越す (ドラフトが軸を落とさない)
      period: { kind: "allTime" },
      aggregation: "personalBest",
    });
  });

  it("[V-M15] 「キャンセル」では onApply が呼ばれず onClose だけが呼ばれる", () => {
    const { onApply, onClose } = renderSheet();

    fireEvent.click(chip("短水路"));
    fireEvent.click(chip("キャンセル"));

    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-M15] 開き直すと適用中の条件でドラフトが作り直される (前回の未適用操作が残らない)", () => {
    const { rerender } = renderSheet();

    fireEvent.click(chip("短水路"));
    expect(isSelected("短水路")).toBe(true);

    // 閉じる → 開き直す
    rerender(
      <RankingFilterSheet
        visible={false}
        onClose={vi.fn()}
        filterState={filterState()}
        periodChoices={PERIOD_CHOICES}
        styleGroups={STYLE_GROUPS}
        onApply={vi.fn()}
      />,
    );
    rerender(
      <RankingFilterSheet
        visible={true}
        onClose={vi.fn()}
        filterState={filterState()}
        periodChoices={PERIOD_CHOICES}
        styleGroups={STYLE_GROUPS}
        onApply={vi.fn()}
      />,
    );

    expect(isSelected("長水路")).toBe(true);
    expect(isSelected("短水路")).toBe(false);
  });

  it("[V-M15] 開いている最中に親が再レンダーしてもドラフトを巻き戻さない", () => {
    const { rerender } = renderSheet();

    fireEvent.click(chip("女子"));
    expect(isSelected("女子")).toBe(true);

    // visible=true のまま親が再レンダー (別の state 更新で起こりうる)
    rerender(
      <RankingFilterSheet
        visible={true}
        onClose={vi.fn()}
        filterState={filterState()}
        periodChoices={PERIOD_CHOICES}
        styleGroups={STYLE_GROUPS}
        onApply={vi.fn()}
      />,
    );

    expect(isSelected("女子")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // [V-M12] 種目変更時の距離の引き継ぎ (web と同じ挙動であること)
  // -------------------------------------------------------------------------
  it("[V-M12] 自由形 400m から平泳ぎに変えると 400m が無いので長水路の最短 50m になる", () => {
    const { onApply } = renderSheet({ filterState: filterState({ distance: 400 }) }); // Fr 400m

    fireEvent.click(chip("平泳ぎ"));
    fireEvent.click(chip("適用"));

    // 統合後の onApply は `RankingFilterState`。`styleId` は持たず、
    // 「種目 + 距離」で表す (styleId への射影は RPC 条件を作る時点)
    // ⚠️ 長水路では 25m が選択肢に無いので最短は 50m ([V-P2-61])
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      event: { mode: "individual", style: "Br" },
      distance: 50,
    });
    expect(isSelected("50m")).toBe(true);
  });

  it("[V-M12] 自由形 200m から背泳ぎに変えると同距離を維持する (styleId 15)", () => {
    const { onApply } = renderSheet({ filterState: filterState({ distance: 200 }) }); // Fr 200m

    fireEvent.click(chip("背泳ぎ"));
    fireEvent.click(chip("適用"));

    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      event: { mode: "individual", style: "Ba" },
      distance: 200,
    });
  });

  it("[V-M12] 距離チップを押すと同じ種目内で距離だけが切り替わる (Fr 1500m)", () => {
    const { onApply } = renderSheet();

    fireEvent.click(chip("1500m"));
    fireEvent.click(chip("適用"));

    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      event: { mode: "individual", style: "Fr" },
      distance: 1500,
    });
  });

  // -------------------------------------------------------------------------
  // [V-M13] 単一選択の維持
  // -------------------------------------------------------------------------
  it("[V-M13] 選択中のチップを再タップしても未選択にならない (必ず 1 つ選ばれている)", () => {
    const { onApply } = renderSheet();

    expect(isSelected("長水路")).toBe(true);
    fireEvent.click(chip("長水路"));
    expect(isSelected("長水路")).toBe(true);

    fireEvent.click(chip("適用"));
    expect(onApply.mock.calls[0]?.[0]).toMatchObject({ poolType: 1 });
  });

  it("[V-M13] 各グループで選択中チップはちょうど 1 つ", () => {
    renderSheet();

    // 🚨 順序は PM 裁定 (2026-09-09 の要望2 で差し替え):
    //    期間 → 性別 → 水路 → 種目 → 距離 → 対象 → 集計 の 7 グループ。
    //    `対象` と `集計` はどちらも個人種目限定なので末尾に隣接させてある
    //    (リレーで末尾2つが一緒に消え、中央に穴が空かない)
    expect(selectedChipLabels()).toEqual([
      "通算",
      "男子",
      "長水路",
      "自由形",
      "50m",
      "チームの大会",
      "各自のベスト",
    ]);
  });

  it("[V-M13] 絞り込みを変えても選択中チップの数は 7 つのまま", () => {
    renderSheet();

    fireEvent.click(chip("個人メドレー"));
    fireEvent.click(chip("女子"));
    fireEvent.click(chip("すべての大会"));
    fireEvent.click(chip("2025年度"));
    fireEvent.click(chip("全レース"));

    expect(selectedChipLabels()).toEqual([
      "2025年度",
      "女子",
      "長水路",
      "個人メドレー",
      "100m",
      "すべての大会",
      "全レース",
    ]);
  });

  // -------------------------------------------------------------------------
  // [V-M14] 露出拡大の注意書き
  // -------------------------------------------------------------------------
  it("[V-M14] すべての大会を選ぶとドラフト上で注意書きが出る (既定では出ない)", () => {
    renderSheet();

    const note = "メンバーが他チームや個人で出場した大会の記録も含みます。";
    expect(screen.queryByText(note)).toBeNull();

    fireEvent.click(chip("すべての大会"));

    expect(screen.getByText(note)).toBeTruthy();
  });

  it("[V-M14] チームの大会に戻すと注意書きが消える", () => {
    renderSheet({ filterState: filterState({ scope: "allCompetitions" }) });

    const note = "メンバーが他チームや個人で出場した大会の記録も含みます。";
    expect(screen.getByText(note)).toBeTruthy();

    fireEvent.click(chip("チームの大会"));

    expect(screen.queryByText(note)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 異常系
  // -------------------------------------------------------------------------
  // ⚠️ **この項目は subject が変わった (2026-09-08)。**
  //    旧: `styleId` がマスターに無いとき種目/距離チップを出さない。
  //    シートは `styleId` を受け取らなくなったので、同じ懸念
  //    (「マスターが使えないときシートが空白にならない」) を
  //    **styles マスターが空のケース**で見る。web の
  //    `TeamRankings.test.tsx [V-03b]` と対になる。
  it("🚨 styles マスターが空でもリレーのチップだけで成立する (シートが空白にならない)", () => {
    const { onApply } = renderSheet({
      styleGroups: [],
      filterState: filterState({ event: { mode: "relay", relayKind: "free" } }),
    });

    // 個人種目のチップは出ない (押しても距離が無いチップを作らない)
    expect(screen.queryByRole("button", { name: "自由形" })).toBeNull();
    expect(screen.queryByRole("button", { name: "個人メドレー" })).toBeNull();
    // リレーのチップは出る
    expect(chip("フリーリレー")).toBeTruthy();
    expect(chip("メドレーリレー")).toBeTruthy();
    // 他の軸も操作できる
    fireEvent.click(chip("短水路"));
    fireEvent.click(chip("適用"));

    expect(onApply.mock.calls[0]?.[0]).toMatchObject({
      event: { mode: "relay", relayKind: "free" },
      poolType: 0,
    });
  });

  it("🚨 styles が正常なときは個人種目のチップが出る (上の項目がトートロジーでない)", () => {
    renderSheet();

    expect(chip("自由形")).toBeTruthy();
    expect(chip("個人メドレー")).toBeTruthy();
  });

  it("visible=false のときはチップを描画しない", () => {
    renderSheet({ visible: false });

    expect(screen.queryByRole("button", { name: "自由形" })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-M16] 🚨 種目チップは 1 radiogroup / 視覚2行。他グループは1行のまま
  //
  // web 側 (`FilterRadioGroup` の `optionRows`) と対になる観点。
  // ChipGroup を2つに割ると radiogroup が2つになり、「7択のうち1つ」という
  // 排他選択の意味論が支援技術に伝わらなくなる。
  //
  // ⚠️ `accessibilityRole` は RN の API で、`__mocks__/react-native.ts` の View は
  //    props をそのまま div に流すため DOM 属性 `accessibilityrole` として観測できる
  //    (`role` にはならないので `getByRole("radiogroup")` では取れない)。
  // -------------------------------------------------------------------------
  // ⚠️ mobile の tsconfig は `downlevelIteration` を持たないので NodeList を
  //    スプレッドできない。`Array.from` を使う
  const radiogroups = () =>
    Array.from(document.querySelectorAll('[accessibilityrole="radiogroup"]'));

  /**
   * 種目グループの位置。順序は PM 裁定で
   * `期間 → 性別 → 水路 → 種目 → 距離 → 対象 → 集計` なので **4 番目 (index 3)**。
   * ⚠️ 添字を直書きせず定数にしておく — 並びが変わったときに
   *    直す場所を1つにするため (前回は index 0 決め打ちで3件同時に落ちた)。
   */
  const EVENT_GROUP_INDEX = 3;
  const chipsIn = (group: Element) =>
    Array.from(group.querySelectorAll('[accessibilityrole="radio"]')).map(
      (node) => node.textContent ?? "",
    );

  it("[V-M16] 個人種目のときグループは 7 つ (種目/距離/水路/性別/期間/対象/集計)", () => {
    renderSheet();
    expect(radiogroups()).toHaveLength(7);
  });

  it("[V-M16] 🚨 種目は radiogroup 1つに 7 チップで、行 View が 2 本ある", () => {
    renderSheet();

    const eventGroup = radiogroups()[EVENT_GROUP_INDEX];
    expect(eventGroup, "種目グループが無い").toBeTruthy();

    // 7択が1つの radiogroup に入っている
    expect(chipsIn(eventGroup!)).toEqual([
      "自由形",
      "平泳ぎ",
      "背泳ぎ",
      "バタフライ",
      "個人メドレー",
      "フリーリレー",
      "メドレーリレー",
    ]);

    // 行は 2 本。**入れ子の radiogroup は無い** (割っていない)
    expect(eventGroup!.querySelectorAll('[accessibilityrole="radiogroup"]')).toHaveLength(0);
    const rows = Array.from(eventGroup!.children);
    expect(rows).toHaveLength(2);
    expect(chipsIn(rows[0]!)).toEqual([
      "自由形",
      "平泳ぎ",
      "背泳ぎ",
      "バタフライ",
      "個人メドレー",
    ]);
    expect(chipsIn(rows[1]!)).toEqual(["フリーリレー", "メドレーリレー"]);
  });

  it("[V-M16] 🚨 種目以外の 6 グループは 1 行のまま (行分割は任意パラメータ)", () => {
    renderSheet();

    // 種目 (index 3) 以外はすべて 1 行
    for (const [index, group] of Array.from(radiogroups().entries())) {
      if (index === EVENT_GROUP_INDEX) continue;
      expect(group.children, `${index} 番目のグループが 2 行以上ある`).toHaveLength(1);
    }
  });

  it("[V-M16] 個人種目が1つも無いときリレーだけの 1 行になる (空行を描かない)", () => {
    renderSheet({
      styleGroups: [],
      filterState: filterState({ event: { mode: "relay", relayKind: "free" } }),
    });

    // 個人種目が 0 件のときは種目グループの位置が前に詰まる可能性があるので、
    // 添字ではなく**リレーのチップを含むグループ**を探す
    const eventGroup = radiogroups().find((g) =>
      Array.from(g.querySelectorAll('[accessibilityrole="radio"]')).some(
        (node) => node.textContent === "フリーリレー",
      ),
    );
    const rows = Array.from(eventGroup!.children);
    // 空の個人行は描かれない
    expect(rows).toHaveLength(1);
    expect(chipsIn(rows[0]!)).toEqual(["フリーリレー", "メドレーリレー"]);
  });

  it("🚨 [V-M16] リレーでは 対象 と 集計 が**同時に**消えて 5 グループになる", () => {
    renderSheet({ filterState: filterState({ event: { mode: "relay", relayKind: "free" } }) });

    // 種目 / 距離 / 水路 / 性別区分 / 期間 の 5 つ
    expect(radiogroups()).toHaveLength(5);
    // 🚨 片方だけ消える実装だと中央に穴が空く。両方が消えていることを対で見る
    expect(screen.queryByRole("button", { name: "すべての大会" })).toBeNull();
    expect(screen.queryByRole("button", { name: "チームの大会" })).toBeNull();
    expect(screen.queryByRole("button", { name: "各自のベスト" })).toBeNull();
    expect(screen.queryByRole("button", { name: "全レース" })).toBeNull();
    // 🚨 `期間` は両モードに出る軸なので**残る** (3つまとめて消す退行の検出)
    expect(chip("通算")).toBeTruthy();
    expect(chip("2026年度")).toBeTruthy();
    // 性別区分は3択になる
    expect(chip("混合")).toBeTruthy();
  });


  // -------------------------------------------------------------------------
  // [V-P2-72] 🚨 長水路で距離を1つも持たない種目のチップを出さない
  //
  // ⚠️ **web と同じフィクスチャを通している。** 25m 専用種目は現マスターに
  //    存在しないので、fixture を入れないと**両プラットフォームとも緑のまま**に
  //    なる (W-1 が Reviewer のレビューまで生き残った理由)。
  //    対になる web 側: `apps/web/__tests__/components/team/
  //    RankingFiltersHandlerGuards.test.tsx` の同名 describe。
  //
  // ⚠️ mobile は**draft** で判定する (`draft.poolType`)。シートを開いている間に
  //    水路チップを押すと、その場で種目チップが増減する必要がある
  //    (適用済み state で判定すると、押した水路が反映されない)。
  // -------------------------------------------------------------------------
  describe("[V-P2-72] 長水路で 25m しか持たない種目のチップを出さない", () => {
    /** `Fly` が 25m だけを持つマスター。対照に `Ba` は 25/50 を持つ (web と同一) */
    const ONLY_25_FLY: RankingStyleGroup[] = [
      { style: "Fr", distances: [{ distance: 50, styleId: 2 }, { distance: 100, styleId: 3 }] },
      { style: "Ba", distances: [{ distance: 25, styleId: 13 }, { distance: 50, styleId: 14 }] },
      { style: "Fly", distances: [{ distance: 25, styleId: 17 }] },
    ];

    it("🚨 長水路では バタフライ のチップが出ない", () => {
      renderSheet({
        styleGroups: ONLY_25_FLY,
        filterState: filterState({ poolType: 1, distance: 50 }),
      });

      expect(screen.queryByRole("button", { name: "バタフライ" })).toBeNull();
      expect(chip("自由形")).toBeTruthy();
      expect(chip("背泳ぎ")).toBeTruthy();
    });

    it("🚨 短水路では バタフライ のチップが出る (水路が理由であることの対照)", () => {
      renderSheet({
        styleGroups: ONLY_25_FLY,
        filterState: filterState({ poolType: 0, distance: 25 }),
      });

      expect(chip("バタフライ")).toBeTruthy();
    });

    it("🚨 長水路でも 背泳ぎ は残る (「25m を持つ種目を落とす」実装への退行を検出)", () => {
      renderSheet({
        styleGroups: ONLY_25_FLY,
        filterState: filterState({ poolType: 1, distance: 50 }),
      });

      expect(chip("背泳ぎ")).toBeTruthy();
    });

    it("🚨 draft で判定する — シート内で長水路を押すと バタフライ が消える", () => {
      // ⚠️ **適用済み state で判定すると、押した水路がその場で反映されない。**
      //    シートを閉じて開き直すまで「選べない種目」が押せる状態が残る
      renderSheet({
        styleGroups: ONLY_25_FLY,
        filterState: filterState({ poolType: 0, distance: 25 }),
      });
      expect(chip("バタフライ")).toBeTruthy();

      fireEvent.click(chip("長水路"));

      expect(screen.queryByRole("button", { name: "バタフライ" })).toBeNull();
      // 逆方向も: 短水路に戻すと復活する
      fireEvent.click(chip("短水路"));
      expect(chip("バタフライ")).toBeTruthy();
    });

    it("リレーのチップは水路に関係なく出る (リレーは styles に依存しない)", () => {
      renderSheet({
        styleGroups: ONLY_25_FLY,
        filterState: filterState({ poolType: 1, distance: 50 }),
      });

      expect(chip("フリーリレー")).toBeTruthy();
      expect(chip("メドレーリレー")).toBeTruthy();
    });
  });

});
