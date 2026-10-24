/**
 * BestTimesTable (マイページ / メンバー詳細 のベストタイム表) 「比較指標プルダウン」機能テスト
 *
 * Sprint Contract: WAポイント固定だった比較指標を、①WAポイント ②日本記録ポイント
 * ③年齢別ポイント の3択プルダウンに変更する。対象はマイページ (components/profile) と
 * メンバー詳細 (components/member-detail) の2画面で、契約・期待値は共通。
 * 2画面を describe.each で同じテストに通す。違うのは data-testid の接頭辞
 * (`best-times-*` / `member-detail-best-times-*`) と、説明文の i18n キーの位置
 * (`mypage.bestTimesTable.*` / `teams.memberDetail.bestTimesTable.*`) だけ。
 *
 * このファイルは比較指標プルダウンのみを対象にする。WAポイントトグル自体の挙動は各画面の
 * `BestTimesTable.test.tsx`、info アイコンの基本挙動は `BestTimesTable.infoIcon.test.tsx` が担当する。
 *
 * ## インターフェース契約 (以下 `<prefix>` は上記の接頭辞)
 * - props に `ageCategory?: AgeCategory | null` を追加 (親が resolveAgeCategory() 済みの
 *   区分だけを渡す。生の birthday はテーブルに渡さない)
 * - 既存の `data-testid="<prefix>-wa-points-toggle"` (aria-pressed) は不変。この既存トグルは
 *   「ポイント表示モードのON/OFF」のみを担い、比較指標プルダウンとは独立している (back-compat)
 * - ポイント表示モードON時のみ `data-testid="<prefix>-compare-metric-select"` の `<select>` が
 *   描画される。option の value は "wa"/"nr"/"age"。初期値は常に "wa"
 * - **ja ロケールでは3つの option (wa/nr/age) が存在する。ja 以外では
 *   プルダウン UI 自体を表示しない** (`queryByTestId` が null であることのみを検証する。
 *   「option を1つに絞る」案は不採用)
 * - metric="age" のときのみ `data-testid="<prefix>-age-category-select"` が追加描画される。
 *   option の value は "unset"/"elementary"/"juniorHigh"/"highSchool"/"university"/"general"。
 *   初期値は ageCategory プロップ (非nullならその値、nullなら"unset")。ユーザーは自由に変更できる
 * - metric="nr" のセル計算は getBestDomesticPointsForCandidates(candidates, "general", ...) 相当
 *   (「日本記録ポイント」= category="general" のショートカット。別テーブル・別経路は無い)
 * - metric="age" かつ選択中の区分が "unset" のセルは常に「—」
 * - **info アイコンは既存の `<prefix>-wa-points-info-button` (WA トグル専用) とは別に、
 *   比較指標プルダウン用の新規アイコン `data-testid="<prefix>-compare-metric-info-button"` を
 *   1つだけ追加する。内容は metric 選択に応じて動的に変わるのではなく、WA/日本記録/年齢別の
 *   3指標の説明を1つのツールチップ内に静的に列挙する固定コンテンツである**
 *
 * ## モック方針
 * next-intl は NextIntlClientProvider + 実メッセージ JSON を使う (既存テストと同方針)。
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * 得点の期待値は `node -e` で P=floor(1000*(B/T)^3) を独立に計算したハードコード値。
 * base time は apps/shared/utils/waPoints.ts の BASE_TIME_TABLE の実数値:
 *   WA(SCM男子Fr100)=44.84 / 日本記録(同)=46.22 / 高校記録(同)=47.07 / 中学記録(同)=48.35
 * 比較指標説明アイコンの本文は完全一致で pin せず「非空である」「metric切替で内容が変わらない
 * (静的である)」「既存WA専用アイコンとは別要素である」という構造的な条件のみ検証する。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import ProfileBestTimesTable, { type BestTime } from "../../components/profile/BestTimesTable";
import { BestTimesTable as MemberDetailBestTimesTable } from "../../components/member-detail/BestTimesTable";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";

type Locale = "ja" | "en";
const MESSAGES: Record<Locale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
};

// AgeCategory は apps/shared/utils/domesticRecords.ts (未実装) の型のため、ここではリテラルの
// 文字列 union として直接使う (import すると未実装時に本ファイル全体が import 解決エラーで
// 全滅してしまい、[V-CM] 系の意図を持つ failure と区別できなくなるため)。
type AgeCategoryLiteral = "elementary" | "juniorHigh" | "highSchool" | "university" | "general";

type TableComponent = (props: {
  bestTimes: BestTime[];
  gender?: number;
  ageCategory?: AgeCategoryLiteral | null;
}) => React.ReactElement | null;

// 2画面は同じ契約。違いは data-testid の接頭辞と、説明文の i18n キーの位置だけ
const VARIANTS = [
  {
    screen: "profile (マイページ)",
    Table: ProfileBestTimesTable as TableComponent,
    prefix: "best-times",
    messagesKey: "mypage.bestTimesTable",
    tableMessages: jaMessages.mypage.bestTimesTable,
  },
  {
    screen: "member-detail (メンバー詳細)",
    // member-detail 版の BestTime 型は profile 版と別定義だが、テーブルが読むフィールドは同じ
    Table: MemberDetailBestTimesTable as unknown as TableComponent,
    prefix: "member-detail-best-times",
    messagesKey: "teams.memberDetail.bestTimesTable",
    tableMessages: jaMessages.teams.memberDetail.bestTimesTable,
  },
];

describe.each(VARIANTS)("BestTimesTable $screen", ({ Table, prefix, messagesKey, tableMessages }) => {
  function renderWithLocale(
    bestTimes: BestTime[],
    props: { gender?: number; ageCategory?: AgeCategoryLiteral | null } = { gender: 0 },
    locale: Locale = "ja",
  ) {
    return render(
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {/* ageCategory は Sprint Contract で追加予定の新規 prop。スプレッド経由のため
            未実装時点でも excess-property-check には掛からず tsc は通る (実行時に
            import 解決エラー等で落ちるのは domesticRecords.ts 側の未実装のみ)。 */}
        <Table bestTimes={bestTimes} {...props} />
      </NextIntlClientProvider>,
    );
  }

  function buildBestTime(overrides: Partial<BestTime> = {}): BestTime {
    return {
      id: "record-1",
      time: 60.0,
      created_at: "2020-01-01T00:00:00.000Z",
      pool_type: 0,
      is_relaying: false,
      style: { name_jp: "100m自由形", distance: 100 },
      competition: { title: "テスト大会", date: "2020-01-01" },
      ...overrides,
    };
  }

  // select の現在値取得専用ヘルパー。testing-library の getByTestId は HTMLElement を返すため、
  // userEvent.selectOptions にはそのまま渡し (RecordForm.test.tsx 等の既存慣例と同じ)、
  // .value を読みたい箇所だけ unknown 経由でキャストする
  // (HTMLElement -> HTMLSelectElement の直接キャストは本リポジトリの型構成では
  // 「型が十分重ならない」エラーになるため)。
  function selectValue(el: HTMLElement): string {
    return (el as unknown as HTMLSelectElement).value;
  }

  const getToggle = () => screen.getByTestId(`${prefix}-wa-points-toggle`);
  const queryMetricSelect = () => screen.queryByTestId(`${prefix}-compare-metric-select`);
  const getMetricSelect = () => screen.getByTestId(`${prefix}-compare-metric-select`);
  const queryAgeCategorySelect = () => screen.queryByTestId(`${prefix}-age-category-select`);
  const getAgeCategorySelect = () => screen.getByTestId(`${prefix}-age-category-select`);
  const getCell = () => screen.getByTestId(`${prefix}-cell-Fr-100`);

  describe("[V-CM-01] 比較指標プルダウン: ポイント表示モードOFF時は描画されない", () => {
    it("初期状態 (モードOFF) では compare-metric-select が存在しない", async () => {
      renderWithLocale([buildBestTime()]);
      expect(queryMetricSelect()).not.toBeInTheDocument();
    });

    it("トグルをONにすると compare-metric-select が現れる", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());
      expect(queryMetricSelect()).toBeInTheDocument();
    });
  });

  describe("[V-CM-02] 比較指標プルダウン: ja ロケールでは3択、初期値は常に「wa」", () => {
    it("option が wa/nr/age の3つ存在する", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()], { gender: 0 }, "ja");
      await user.click(getToggle());

      const select = getMetricSelect();
      const options = within(select).getAllByRole("option") as HTMLOptionElement[];
      const values = options.map((o) => o.value).sort();
      expect(values).toEqual(["age", "nr", "wa"]);
    });

    it("初期選択値は常に 'wa' である (既存の「トグルを押すとWA点数が出る」前提を壊さない)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());
      expect(selectValue(getMetricSelect())).toBe("wa");
    });
  });

  describe("[V-CM-03] 比較指標プルダウン: ja 以外のロケールではプルダウン UI 自体を表示しない", () => {
    it("en ロケール: ポイント表示モードをONにしても compare-metric-select は存在しない (現行のWAトグルのみのまま)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()], { gender: 0 }, "en");
      await user.click(getToggle());

      expect(queryMetricSelect()).toBeNull();
    });

    it("en ロケール: compare-metric-info-button (新設の指標説明アイコン) も表示されない", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()], { gender: 0 }, "en");
      await user.click(getToggle());

      expect(screen.queryByTestId(`${prefix}-compare-metric-info-button`)).toBeNull();
    });
  });

  describe("[V-CM-04] 比較指標プルダウン: 指標を切り替えるとセルの点数が変わる", () => {
    it("自由形100m(短水路)男子T=50.00: wa=721点 -> nr(日本記録)=789点 に変わる", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], { gender: 0 });
      await user.click(getToggle());

      expect(getCell().textContent).toContain("721");

      await user.selectOptions(getMetricSelect(), "nr");
      expect(getCell().textContent).toContain("789");
      expect(getCell().textContent).not.toContain("721");
    });
  });

  describe("[V-CM-05] 比較指標プルダウン: 年齢別ポイント選択時の自動判定区分と手動変更", () => {
    it("ageCategory='highSchool' プロップを渡すと、age-category-select の初期選択値が 'highSchool' になる", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], {
        gender: 0,
        ageCategory: "highSchool",
      });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");

      expect(selectValue(getAgeCategorySelect())).toBe("highSchool");
      // 自由形100m(短水路)男子T=50.00, 高校記録base=47.07 -> 834点
      expect(getCell().textContent).toContain("834");
    });

    it("age-category-select は手動で別の区分に変更できる (juniorHighへ変更するとセルが904点になる)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], {
        gender: 0,
        ageCategory: "highSchool",
      });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");
      expect(getCell().textContent).toContain("834");

      await user.selectOptions(getAgeCategorySelect(), "juniorHigh");
      expect(selectValue(getAgeCategorySelect())).toBe("juniorHigh");
      expect(getCell().textContent).toContain("904");
      expect(getCell().textContent).not.toContain("834");
    });
  });

  describe("[V-CM-06] 比較指標プルダウン: birthdayが無く区分が自動判定できない場合", () => {
    it("ageCategory=null のとき、age-category-select の初期値は「未設定」(value='unset') であり、セルは「—」", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], { gender: 0, ageCategory: null });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");

      expect(selectValue(getAgeCategorySelect())).toBe("unset");
      expect(getCell().textContent).toContain("—");
    });

    it("未設定の状態からユーザーが手動で区分を選ぶと、セルに点数が表示される (手動変更は可能)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], { gender: 0, ageCategory: null });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");
      expect(getCell().textContent).toContain("—");

      await user.selectOptions(getAgeCategorySelect(), "highSchool");
      expect(getCell().textContent).toContain("834");
    });

    it("ageCategory プロップ自体が渡されない (undefined) 場合も未設定と同様に扱われ、例外を投げない", () => {
      expect(() => renderWithLocale([buildBestTime()], { gender: 0 })).not.toThrow();
    });
  });

  describe("[V-CM-07] 比較指標プルダウン: 既存のWAトグル自体はプルダウン操作の影響を受けない (back-compat)", () => {
    it("compare-metric-select を操作しても、トグルの aria-pressed は変化しない", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");

      await user.selectOptions(getMetricSelect(), "nr");
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");

      await user.selectOptions(getMetricSelect(), "age");
      expect(getToggle()).toHaveAttribute("aria-pressed", "true");
    });

    it("トグルをOFFに戻すと compare-metric-select / age-category-select は消える", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()], { gender: 0, ageCategory: "highSchool" });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");
      expect(queryAgeCategorySelect()).toBeInTheDocument();

      await user.click(getToggle());
      expect(queryMetricSelect()).not.toBeInTheDocument();
      expect(queryAgeCategorySelect()).not.toBeInTheDocument();
    });
  });

  describe("[V-CM-08] 比較指標の説明アイコン: 新設の compare-metric-info-button は1つの静的な説明を持つ", () => {
    it("ポイント表示モードOFF時は compare-metric-info-button が存在しない (compare-metric-select と同じ表示条件)", () => {
      renderWithLocale([buildBestTime()]);
      expect(screen.queryByTestId(`${prefix}-compare-metric-info-button`)).not.toBeInTheDocument();
    });

    it(`ポイント表示モードONにすると compare-metric-info-button が現れ、既存の ${prefix}-wa-points-info-button とは別要素である`, async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const newIcon = screen.getByTestId(`${prefix}-compare-metric-info-button`);
      const existingWaIcon = screen.getByTestId(`${prefix}-wa-points-info-button`);
      expect(newIcon).toBeInTheDocument();
      expect(existingWaIcon).toBeInTheDocument();
      expect(newIcon).not.toBe(existingWaIcon);
    });

    // 実測: 「モバイル用ツールチップをクリックで開いてから getAllByRole("tooltip") を
    // 連結比較する」測り方は、userEvent.selectOptions がフォーカスを select に移すことで
    // 既存の (正しい・変更禁止の) onBlur={() => setShowInfo(false)} が発火し、モバイル用が閉じて
    // 要素数が変わってしまう (3→2)。これは「開閉状態」を測ってしまっているだけで、
    // 「説明文の内容」を測っていない。
    // → 常設のデスクトップ用ツールチップ (aria-describedby が指す要素。クリック不要で常時DOM上に
    //   存在し、モバイル用と同じ resolvedTooltipText を描画する) を直接参照することで、
    //   開閉状態に依存せず「内容」だけを比較する。
    function getCompareMetricInfoTooltipText(): string {
      const infoButton = screen.getByTestId(`${prefix}-compare-metric-info-button`);
      const describedById = infoButton.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      const tooltipEl = document.getElementById(describedById as string);
      expect(tooltipEl).not.toBeNull();
      return tooltipEl?.textContent ?? "";
    }

    it("compare-metric-info-button のツールチップは非空である (クリック不要、常設のデスクトップ用要素を直接参照)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      expect(getCompareMetricInfoTooltipText().length).toBeGreaterThan(0);
    });

    it("指標(select)を wa -> nr -> age と切り替えても、compare-metric-info-button のツールチップ本文は変化しない (静的コンテンツであることの確認)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const textWhenWa = getCompareMetricInfoTooltipText();

      await user.selectOptions(getMetricSelect(), "nr");
      const textWhenNr = getCompareMetricInfoTooltipText();

      await user.selectOptions(getMetricSelect(), "age");
      const textWhenAge = getCompareMetricInfoTooltipText();

      expect(textWhenWa.length).toBeGreaterThan(0);
      expect(textWhenNr).toBe(textWhenWa);
      expect(textWhenAge).toBe(textWhenWa);
    });

    // 追記 (文言変更スプリント): 当初 best-times-wa-points-info-button は
    // teams.waPointsCompare.infoTooltip (WA専用の説明) にフォールバックしており、本テストは
    // それを back-compat として固定していた。しかしプルダウンで「日本記録基準」を選んでいても
    // WA の説明が出てしまう不整合だったため、比較指標プルダウンの新設に合わせて
    // mypage.bestTimesTable.pointsInfo (どの基準でも通用する算出式の一般的な説明) を明示的に
    // 渡すよう配線し直された。back-compat の前提そのものが変わったため、期待を反転させる。
    it(`${prefix}-wa-points-info-button の説明文は ${messagesKey}.pointsInfo (基準非依存の汎用説明) であり、teams.waPointsCompare.infoTooltip (WA専用) は表示されない`, async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const tooltips = screen.getAllByRole("tooltip");
      const hasPointsInfoText = tooltips.some(
        (t) => t.textContent === tableMessages.pointsInfo,
      );
      const hasWaOnlyText = tooltips.some(
        (t) => t.textContent === jaMessages.teams.waPointsCompare.infoTooltip,
      );
      expect(hasPointsInfoText).toBe(true);
      expect(hasWaOnlyText).toBe(false);
    });
  });

  describe("[V-CM-10] 比較指標の説明アイコン: ツールチップの改行が改行文字として保持されている (whitespace-pre-line 前提のレンダリング検証)", () => {
    // V-CM-08 と同じ理由・同じ手法 (常設のデスクトップ用ツールチップを aria-describedby 経由で
    // 直接参照する。クリック/hover 状態に依存しない)。
    //
    // 注意: ここで検証できるのは「テキストノードとして \n が保持されていること」
    // (=データが壊れていないこと) までである。`whitespace-pre-line` (CSS の white-space)
    // が実際に画面上で改行として描画されるかどうかは、jsdom が CSS を解釈しないため
    // (本リポジトリの vitest.config.ts は css: true を設定していない) コンポーネントテストでは
    // 原理的に検証できない。視覚的な改行描画の確認は Playwright 実ブラウザ検証(Phase B の別項目)
    // が担う。クラス名 (`whitespace-pre-line`) 自体を pin しないのは、Tailwind の実装詳細に
    // 依存させないため。
    function getCompareMetricInfoTooltipText(): string {
      const infoButton = screen.getByTestId(`${prefix}-compare-metric-info-button`);
      const describedById = infoButton.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      const tooltipEl = document.getElementById(describedById as string);
      expect(tooltipEl).not.toBeNull();
      return tooltipEl?.textContent ?? "";
    }

    it("ツールチップの textContent を \\n で分割すると正確に3行になる (ja)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const text = getCompareMetricInfoTooltipText();
      const lines = text.split("\n");
      expect(lines.length).toBe(3);
      for (const line of lines) {
        expect(line.length).toBeGreaterThan(0);
      }
    });

    it(`ツールチップの3行が、i18nメッセージ (${messagesKey}.compareMetricInfo, golden source) の対応行とそれぞれ一致する`, async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const expectedLines = (
        tableMessages.compareMetricInfo as string
      ).split("\n");
      expect(expectedLines.length).toBe(3);

      const actualLines = getCompareMetricInfoTooltipText().split("\n");
      expect(actualLines).toEqual(expectedLines);
    });

    it("各行の先頭がプルダウンの選択肢ラベル (compareMetric.wa/nr/age) と一致する (用語ドリフトの回帰ガード。コンポーネント側からの確認)", async () => {
      const user = userEvent.setup();
      renderWithLocale([buildBestTime()]);
      await user.click(getToggle());

      const lines = getCompareMetricInfoTooltipText().split("\n");
      const select = getMetricSelect();
      const options = within(select).getAllByRole("option") as HTMLOptionElement[];
      const labelByValue = new Map(options.map((o) => [o.value, o.textContent ?? ""]));

      expect(lines[0]?.startsWith(labelByValue.get("wa") ?? "\0")).toBe(true);
      expect(lines[1]?.startsWith(labelByValue.get("nr") ?? "\0")).toBe(true);
      expect(lines[2]?.startsWith(labelByValue.get("age") ?? "\0")).toBe(true);
    });
  });

  describe("[V-CM-09] 年齢区分セレクトの ageCategory prop 追従 (Reviewer Critical 回帰テスト)", () => {
    // 修正前の実装は `useState(ageCategory ?? null)` で mount 時に一度しか prop を読まず、
    // 以後 prop が変わってもセレクトが古い値のまま固まっていた (生年月日を後から設定しても
    // 「未設定」に固まり点数が永久に「—」になるバグ)。この回帰テストは以下の2点を両方
    // 検証することで、3値設計 (undefined/null/AgeCategory) が正しく効いていることを保証する。
    // 1. ユーザー未操作の間は prop の変化に追従する
    // 2. ユーザーが一度手動操作したら、以後 prop が変わっても手動選択を維持する

    it("ユーザー未操作の間は ageCategory prop の変化 (null -> university) にセレクト値とセルが追従する", async () => {
      const user = userEvent.setup();
      const view = renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], {
        gender: 0,
        ageCategory: null,
      });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");

      expect(selectValue(getAgeCategorySelect())).toBe("unset");
      expect(getCell().textContent).toContain("—");

      view.rerender(
        <NextIntlClientProvider locale="ja" messages={MESSAGES.ja}>
          <Table
            bestTimes={[buildBestTime({ time: 50.0, pool_type: 0 })]}
            gender={0}
            ageCategory="university"
          />
        </NextIntlClientProvider>,
      );

      expect(selectValue(getAgeCategorySelect())).toBe("university");
      // 自由形100m(短水路)男子T=50.00, 学生記録base=46.72 -> 815点
      expect(getCell().textContent).toContain("815");
    });

    it("ユーザーが手動で区分を選んだ後は、prop が変化しても手動選択値を維持する (以後追従しない)", async () => {
      const user = userEvent.setup();
      const view = renderWithLocale([buildBestTime({ time: 50.0, pool_type: 0 })], {
        gender: 0,
        ageCategory: "highSchool",
      });
      await user.click(getToggle());
      await user.selectOptions(getMetricSelect(), "age");
      expect(selectValue(getAgeCategorySelect())).toBe("highSchool");

      // ユーザーが手動で juniorHigh へ変更
      await user.selectOptions(getAgeCategorySelect(), "juniorHigh");
      expect(selectValue(getAgeCategorySelect())).toBe("juniorHigh");
      expect(getCell().textContent).toContain("904");

      // prop側 (呼び出し元の自動判定結果) が別の値に変わっても、手動選択が優先されて維持される
      view.rerender(
        <NextIntlClientProvider locale="ja" messages={MESSAGES.ja}>
          <Table
            bestTimes={[buildBestTime({ time: 50.0, pool_type: 0 })]}
            gender={0}
            ageCategory="university"
          />
        </NextIntlClientProvider>,
      );

      expect(selectValue(getAgeCategorySelect())).toBe("juniorHigh");
      expect(getCell().textContent).toContain("904");
      expect(getCell().textContent).not.toContain("815");
    });
  });
});
