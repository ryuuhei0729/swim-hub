/**
 * `/[locale]/time-level` ページ コンポーネントテスト (TimeLevelClient)
 *
 * ## 実装先行に関する注記 (PM 報告済み)
 * `app/[locale]/(unauthenticated)/time-level/page.tsx` は async Server Component
 * (`params: Promise<{ locale: string }>` を取り、`next-intl/server` の
 * `getTranslations` を使用) であり、実際の操作対象 UI は子の
 * `_client/TimeLevelClient.tsx` (Client Component) に切り出されている。
 * そのため本テストは Server Component である page.tsx ではなく、実際に
 * インタラクションを持つ `TimeLevelClient` を直接レンダリングして検証する
 * (`PracticeClient.tsx` 等、既存のページテストと同じ方針)。
 *
 * data-testid は実装に `time-level-time-input` (タイム入力欄) のみが付与されている。
 * 性別/水路はトグルボタン (`role="group"` + `aria-label` + ボタンのテキスト)、
 * 種目/距離は `<label htmlFor>` 付き `<select>` (`getByLabelText` で取得可能)、
 * 3つの結果カードは `CardTitle` (h3見出し) のテキストで判別する。
 * 本ファイルはテスト専用メッセージ (TEST_MESSAGES) を使い、見出し・ラベル・
 * 空状態文言に一意なマーカー文字列を割り当てることで、実際の翻訳文言の変更に
 * 影響されずに DOM 構造を検証できるようにしている。
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * 入力タイムは意図的に各基準タイムと「ちょうど一致」させ (D4 境界値: 1000点+cleared)、
 * calculateWaPoints/evaluateStandardTime の3乗式をテスト内に再実装しない。
 * 基準タイムの数値自体は VERIFIED_DATA.md セクション4 および waPoints.ts の
 * 実数値 (regionalStandardTimes.test.ts と同一のデータソース) から独立に転記した。
 *
 * Sprint Contract 検証観点:
 *   [V-P01] gender=男子/poolType=長水路/Fr/200 で time="2:15.09" (都高男子200Fr基準ちょうど、
 *           D1: .09終端は原典表記のまま) → 都高カードが1000点+突破ラベル
 *   [V-P02] gender=男子/poolType=長水路/Fr/100 で time="1:06.00" (都中男子100Fr基準ちょうど)
 *           → 都中カードが1000点+突破ラベル。同時に WA カードも独立して結果が出る
 *           (0点にはならない。D6独立判定要件)
 *   [V-P03] 短水路選択時、都中/都高は「長水路専用」の空状態になり、WA は通常どおり結果が出る
 *   [V-P04] 男子800m自由形(長水路): WA は結果が出て、都中/都高は「基準タイムなし」になる
 *   [V-P05] 男子1500m自由形(長水路): 都中/都高は結果が出て、WA は「基準タイムなし」になる
 *           (V-P04 と逆方向、D6独立判定要件の両方向)
 *   [V-P06] タイム未入力 → 3カードとも「タイムを入力してください」の空状態になり、
 *           "0" 等の得点は一切表示されない (D7)
 *   [V-P07] 不正なタイム文字列 ("abc") → V-P06 と同じ扱いになる
 *   [V-P08] 性別を 男子→女子 に切り替えたとき、選択中の距離が無効になるケース
 *           (男子Fr1500 → 女子) だけ距離がリセットされ、有効な距離に変わる
 *           (PM訂正: 発火するのはこの1ケースのみ)
 *   [V-P09] 性別を 男子→女子 に切り替えても、選択中の距離が両性別で有効なケース
 *           (男子Fr400 → 女子) では距離が変わらない (余計なリセットをしていないことの証明)
 *   [V-P10] D10: 都中/都高カードに独自算出であることの注記が表示される
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect } from "vitest";

import TimeLevelClient from "../../../app/[locale]/(unauthenticated)/time-level/_client/TimeLevelClient";

// テスト専用メッセージ (実 messages/*.json とは独立。翻訳内容の正しさは
// messages-time-level.test.ts が担当する)。TimeLevelClient は
// "timeLevel" / "practice" / "common" の3namespaceを参照する。
const TEST_MESSAGES = {
  timeLevel: {
    genderLabel: "GENDER_LABEL",
    genderMale: "MALE_MARK",
    genderFemale: "FEMALE_MARK",
    poolTypeLabel: "POOL_TYPE_LABEL",
    styleLabel: "STYLE_LABEL",
    distanceLabel: "DISTANCE_LABEL",
    timeLabel: "TIME_LABEL",
    timePlaceholder: "TIME_PLACEHOLDER",
    invalidTimeFormat: "INVALID_TIME_MARK",
    emptyEnterTime: "EMPTY_TIME_MARK",
    noStandardTime: "NO_STANDARD_MARK",
    lcmOnly: "LCM_ONLY_MARK",
    pointsUnit: "PTS",
    baseTimeLabel: "BASE_TIME_LABEL",
    cleared: "CLEARED_MARK",
    notCleared: "NOT_CLEARED_MARK",
    wa: { title: "WA_TITLE_MARK" },
    tochu: { title: "TOCHU_TITLE_MARK", note: "TOCHU_NOTE_MARK 独自 換算" },
    toko: { title: "TOKO_TITLE_MARK", note: "TOKO_NOTE_MARK 独自 換算" },
  },
  practice: {
    styles: { Fr: "FR_STYLE", Ba: "BA_STYLE", Br: "BR_STYLE", Fly: "FLY_STYLE", IM: "IM_STYLE" },
  },
  common: {
    poolTypeShort: "SHORT_COURSE_MARK",
    poolTypeLong: "LONG_COURSE_MARK",
  },
} as unknown as AbstractIntlMessages;

const renderClient = () =>
  render(
    <NextIntlClientProvider locale="ja" messages={TEST_MESSAGES}>
      <TimeLevelClient />
    </NextIntlClientProvider>,
  );

function getGenderGroup() {
  return screen.getByRole("group", { name: "GENDER_LABEL" });
}
function getPoolTypeGroup() {
  return screen.getByRole("group", { name: "POOL_TYPE_LABEL" });
}

function selectGender(gender: "male" | "female") {
  const group = getGenderGroup();
  fireEvent.click(within(group).getByRole("button", { name: gender === "male" ? "MALE_MARK" : "FEMALE_MARK" }));
}

function selectPoolType(poolType: "short" | "long") {
  const group = getPoolTypeGroup();
  fireEvent.click(
    within(group).getByRole("button", { name: poolType === "short" ? "SHORT_COURSE_MARK" : "LONG_COURSE_MARK" }),
  );
}

function selectStyle(style: "Fr" | "Ba" | "Br" | "Fly" | "IM") {
  const select = screen.getByLabelText("STYLE_LABEL") as unknown as HTMLSelectElement;
  fireEvent.change(select, { target: { value: style } });
}

function selectDistance(distance: number) {
  const select = screen.getByLabelText("DISTANCE_LABEL") as unknown as HTMLSelectElement;
  fireEvent.change(select, { target: { value: String(distance) } });
}

function typeTime(value: string) {
  const input = screen.getByTestId("time-level-time-input");
  fireEvent.change(input, { target: { value } });
}

function setEvent(gender: "male" | "female", poolType: "short" | "long", style: "Fr" | "Ba" | "Br" | "Fly" | "IM", distance: number) {
  selectGender(gender);
  selectPoolType(poolType);
  selectStyle(style);
  selectDistance(distance);
}

// タイトル見出し (h3) から、そのカードの祖先要素 (Card = className に "rounded-lg" を含む div) を取得する
function getCardByTitle(titleMark: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: titleMark });
  const card = heading.closest(".rounded-lg");
  if (!card) throw new Error(`card container not found for heading "${titleMark}"`);
  return card as HTMLElement;
}

describe("[V-P01] 都高 200m自由形(男子・長水路) 基準タイムちょうど (D1: .09終端)", () => {
  it('time="2:15.09" (135.09秒) で都高カードが1000点・突破ラベルになる', () => {
    renderClient();
    setEvent("male", "long", "Fr", 200);
    typeTime("2:15.09");

    const tokoCard = getCardByTitle("TOKO_TITLE_MARK");
    expect(tokoCard).toHaveTextContent("1000");
    expect(tokoCard).toHaveTextContent("CLEARED_MARK");
    expect(tokoCard).not.toHaveTextContent("NO_STANDARD_MARK");
  });
});

describe("[V-P02] 都中 100m自由形(男子・長水路) 基準タイムちょうど + 3指標の独立計算", () => {
  it('time="1:06.00" (66秒) で都中カードが1000点・突破ラベルになり、WAも独立して結果が出る', () => {
    renderClient();
    setEvent("male", "long", "Fr", 100);
    typeTime("1:06.00");

    const tochuCard = getCardByTitle("TOCHU_TITLE_MARK");
    expect(tochuCard).toHaveTextContent("1000");
    expect(tochuCard).toHaveTextContent("CLEARED_MARK");

    // WA (base=46.4) は66秒だと未達だが、「結果が出ない」わけではない
    // (空状態にはならず、独立して計算された正の数値が出る。0点でもない)
    const waCard = getCardByTitle("WA_TITLE_MARK");
    expect(waCard).not.toHaveTextContent("EMPTY_TIME_MARK");
    expect(waCard).not.toHaveTextContent("NO_STANDARD_MARK");
    expect(waCard).toHaveTextContent(`PTS`);
    expect(waCard).not.toHaveTextContent(/\b0\s*PTS/);
  });
});

describe("[V-P03] 短水路選択時、都中/都高は長水路専用の空状態になる (WAは通常どおり)", () => {
  it("短水路 + Fr100 + 有効なタイムでも都中/都高は LCM_ONLY_MARK になる", () => {
    renderClient();
    setEvent("male", "short", "Fr", 100);
    typeTime("46.40"); // WA 短水路男子100Fr基準 (44.84) には届かないが有効なタイム

    expect(getCardByTitle("TOCHU_TITLE_MARK")).toHaveTextContent("LCM_ONLY_MARK");
    expect(getCardByTitle("TOKO_TITLE_MARK")).toHaveTextContent("LCM_ONLY_MARK");

    // WA は短水路でも長水路でも成立する指標なので、結果が出る
    const waCard = getCardByTitle("WA_TITLE_MARK");
    expect(waCard).not.toHaveTextContent("EMPTY_TIME_MARK");
    expect(waCard).not.toHaveTextContent("LCM_ONLY_MARK");
  });
});

describe("[V-P04][V-P05] 3指標の独立判定: 男子800m自由形 と 1500m自由形 (長水路)", () => {
  it("[V-P04] 男子800m自由形(長水路): WAは結果が出て、都中/都高は基準タイムなしになる", () => {
    renderClient();
    setEvent("male", "long", "Fr", 800);
    typeTime("7:32.12"); // WA男子800Fr長水路の基準タイムちょうど (452.12秒)

    const waCard = getCardByTitle("WA_TITLE_MARK");
    expect(waCard).toHaveTextContent("1000");

    expect(getCardByTitle("TOCHU_TITLE_MARK")).toHaveTextContent("NO_STANDARD_MARK");
    expect(getCardByTitle("TOKO_TITLE_MARK")).toHaveTextContent("NO_STANDARD_MARK");
  });

  it("[V-P05] 男子1500m自由形(長水路): 都中/都高は結果が出て、WAは基準タイムなしになる", () => {
    renderClient();
    setEvent("male", "long", "Fr", 1500);
    typeTime("19:00.00"); // 都中男子1500Fr基準タイムちょうど (1140秒)

    const tochuCard = getCardByTitle("TOCHU_TITLE_MARK");
    expect(tochuCard).toHaveTextContent("1000");
    expect(tochuCard).toHaveTextContent("CLEARED_MARK");

    // 都高 (基準1052.69秒) に対し1140秒は未突破だが、基準タイム自体は存在するので
    // 空状態にはならず結果が出る
    const tokoCard = getCardByTitle("TOKO_TITLE_MARK");
    expect(tokoCard).not.toHaveTextContent("NO_STANDARD_MARK");
    expect(tokoCard).toHaveTextContent("NOT_CLEARED_MARK");

    expect(getCardByTitle("WA_TITLE_MARK")).toHaveTextContent("NO_STANDARD_MARK");
  });
});

describe("[V-P06][V-P07] D7: タイム未入力/不正値のとき0点を表示しない", () => {
  it("[V-P06] タイム未入力 → 3カードとも emptyEnterTime の空状態になり、得点は一切表示されない", () => {
    renderClient();
    setEvent("male", "long", "Fr", 100); // 都中/都高/WAいずれも基準タイムが存在する組合せ
    typeTime("");

    expect(getCardByTitle("WA_TITLE_MARK")).toHaveTextContent("EMPTY_TIME_MARK");
    expect(getCardByTitle("TOCHU_TITLE_MARK")).toHaveTextContent("EMPTY_TIME_MARK");
    expect(getCardByTitle("TOKO_TITLE_MARK")).toHaveTextContent("EMPTY_TIME_MARK");

    expect(getCardByTitle("WA_TITLE_MARK")).not.toHaveTextContent("PTS");
  });

  it('[V-P07] 不正なタイム文字列 "abc" → V-P06 と同じ扱いになる (0点フォールバックが漏れ出ない)', () => {
    renderClient();
    setEvent("male", "long", "Fr", 100);
    typeTime("abc");

    expect(getCardByTitle("WA_TITLE_MARK")).toHaveTextContent("EMPTY_TIME_MARK");
    expect(getCardByTitle("WA_TITLE_MARK")).not.toHaveTextContent("PTS");
  });
});

describe("[V-P08][V-P09] 性別切替による距離リセット (PM訂正反映: 発火は男子Fr1500→女子のみ)", () => {
  it("[V-P08] 男子+Fr+1500 → 女子に切替: 1500は女子に存在しないため有効な距離にリセットされる", () => {
    renderClient();
    setEvent("male", "long", "Fr", 1500);
    expect((screen.getByLabelText("DISTANCE_LABEL") as unknown as HTMLSelectElement).value).toBe("1500");

    selectGender("female");

    const distanceValue = (screen.getByLabelText("DISTANCE_LABEL") as unknown as HTMLSelectElement).value;
    expect(distanceValue).not.toBe("1500");
    expect(["50", "100", "200", "400", "800"]).toContain(distanceValue);
  });

  it("[V-P09] 男子+Fr+400 → 女子に切替: 400は両性別に存在するため距離は変化しない (余計なリセット無し)", () => {
    renderClient();
    setEvent("male", "long", "Fr", 400);

    selectGender("female");

    const distanceValue = (screen.getByLabelText("DISTANCE_LABEL") as unknown as HTMLSelectElement).value;
    expect(distanceValue).toBe("400");
  });
});

describe("[V-P10] D10: 都中/都高カードに独自算出であることの注記が表示される", () => {
  it("都中/都高カードにそれぞれの note マーカーが表示され、WAカードには表示されない", () => {
    renderClient();
    expect(getCardByTitle("TOCHU_TITLE_MARK")).toHaveTextContent("TOCHU_NOTE_MARK");
    expect(getCardByTitle("TOKO_TITLE_MARK")).toHaveTextContent("TOKO_NOTE_MARK");
    expect(getCardByTitle("WA_TITLE_MARK")).not.toHaveTextContent("NOTE_MARK");
  });
});
