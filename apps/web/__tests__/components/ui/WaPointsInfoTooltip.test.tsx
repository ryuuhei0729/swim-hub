/**
 * WaPointsInfoTooltip (共有 info アイコン + ツールチップ) 単体テスト
 *
 * Sprint Contract: 「WAポイントのボタンに info アイコンをつけてください」の D-1。
 * `apps/web/components/team/member-management/components/WaPointsCompareButton.tsx` に
 * 元々あった info アイコン実装を `apps/web/components/ui/WaPointsInfoTooltip.tsx` に
 * 切り出し、マイページ / メンバー詳細モーダルからも共用する。
 *
 * Sprint Contract 検証観点:
 *   [V-ICON-15] 共有コンポーネントが props (`buttonTestId` / `tooltipTestId`) から
 *               data-testid を導出し、`teams.waPointsCompare.infoAriaLabel` /
 *               `infoTooltip` を内部で解決して表示する。呼び出し元ごとに独立した
 *               data-testid を持てる (同じコンポーネントを複数箇所で使っても衝突しない)
 *   [V-ICON-16] 新規 i18n キーを追加せず、既存 `teams.waPointsCompare` 名前空間の
 *               既存キー (10個) のみで完結する (回帰ガード)
 *   [V-ICON-ARIA] info ボタンの aria-describedby が、実在するツールチップ要素の id を
 *               指し、その要素が期待する説明文を含む (id 文字列の存在確認だけで終わらせず、
 *               参照先の実体まで検証する)。同一ページに複数インスタンスがあっても
 *               useId 由来の id が衝突しないことも検証する (CodeRabbit 指摘の回帰テスト)
 *
 * ## モック方針
 * next-intl は NextIntlClientProvider + 実メッセージ JSON を使う
 * (WaPointsCompareButton.test.tsx と同方針。手書き useTranslations モックはしない)
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * ツールチップ本文は ja.json / en.json から書き出した実文字列をハードコードして assert する。
 * 実装側の t() 呼び出し結果を期待値生成に使わない。
 *
 * ## jsdom の限界 (実ブラウザでのみ検証可能な範囲)
 * デスクトップの hover / focus-within による表示切り替えは CSS (`group-hover`,
 * `group-focus-within`) で制御されており、jsdom はレイアウト・CSS 疑似クラスの
 * 実際の表示計算を行わない。本テストは「hover/focus 対象の要素が実際に DOM 上に
 * 存在し、正しい aria-label / 説明文を持つこと」までを保証する。
 * 実際に hover で表示され、モーダル/画面外にはみ出さないかは Playwright での
 * 実ブラウザ検証が必要 (Phase B, 本レポート作成時点では BLOCKED)。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect } from "vitest";

import { WaPointsInfoTooltip } from "../../../components/ui/WaPointsInfoTooltip";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";

// ja.json teams.waPointsCompare.infoTooltip の実文字列 (このテスト作成時点でハードコード)
const EXPECTED_JA_TOOLTIP_TEXT =
  "WAポイントは World Aquatics（世界水泳連盟）の公式ポイント制度です。世界記録級の基準タイムを1000点とし、「1000×(基準タイム÷記録)³」で算出します。種目やコースが異なっても泳力を比較できる指標です。";

const EXPECTED_EN_TOOLTIP_TEXT =
  "WA Points is World Aquatics' official points system. A world-record-level base time is set to 1000 points, calculated as \"1000 x (base time / your time)^3\", letting you compare swimming performance across events and courses.";

type Locale = "ja" | "en";
const MESSAGES: Record<Locale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
};

const renderWithLocale = (
  ui: React.ReactElement,
  locale: Locale = "ja",
) =>
  render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("[V-ICON-15] WaPointsInfoTooltip: props から data-testid を導出する", () => {
  it("buttonTestId に渡した値がそのまま info ボタンの data-testid になる", () => {
    renderWithLocale(<WaPointsInfoTooltip buttonTestId="custom-info-button" />);
    expect(screen.getByTestId("custom-info-button")).toBeInTheDocument();
  });

  it("tooltipTestId を渡すと、デスクトップ用ツールチップの data-testid になる", () => {
    renderWithLocale(
      <WaPointsInfoTooltip buttonTestId="custom-info-button" tooltipTestId="custom-info-tooltip" />,
    );
    const tooltip = screen.getByTestId("custom-info-tooltip");
    expect(tooltip).toHaveAttribute("role", "tooltip");
  });

  it("同じコンポーネントを異なる buttonTestId で2箇所に描画しても、それぞれ独立して取得できる (呼び出し元間の衝突がない)", () => {
    renderWithLocale(
      <div>
        <WaPointsInfoTooltip buttonTestId="info-a" tooltipTestId="tooltip-a" />
        <WaPointsInfoTooltip buttonTestId="info-b" tooltipTestId="tooltip-b" />
      </div>,
    );
    expect(screen.getByTestId("info-a")).toBeInTheDocument();
    expect(screen.getByTestId("info-b")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-a")).toBeInTheDocument();
    expect(screen.getByTestId("tooltip-b")).toBeInTheDocument();
  });
});

describe("[V-ICON-15] WaPointsInfoTooltip: teams.waPointsCompare の翻訳を内部で解決する", () => {
  it("aria-label が teams.waPointsCompare.infoAriaLabel の実際の訳文 (ja)", () => {
    renderWithLocale(<WaPointsInfoTooltip buttonTestId="info-button" />);
    expect(screen.getByTestId("info-button")).toHaveAttribute("aria-label", "WAポイントとは");
  });

  it("ツールチップ本文が teams.waPointsCompare.infoTooltip の実際の訳文と一致する (ja、算出式を含む十分な長さの全文比較でトートロジー回避)", () => {
    renderWithLocale(
      <WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />,
    );
    expect(screen.getByTestId("info-tooltip")).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);
  });

  it("ツールチップ本文が teams.waPointsCompare.infoTooltip の実際の訳文と一致する (en)", () => {
    renderWithLocale(
      <WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />,
      "en",
    );
    expect(screen.getByTestId("info-tooltip")).toHaveTextContent(EXPECTED_EN_TOOLTIP_TEXT);
  });

  it("[V-ICON-16] 新規 i18n キーは追加されていない (teams.waPointsCompare は既存10キーのみ)", () => {
    const KNOWN_KEYS = [
      "buttonLabel",
      "infoAriaLabel",
      "infoTooltip",
      "modalTitle",
      "rankLabel",
      "pointsLabel",
      "styleLabel",
      "courseShort",
      "courseLong",
      "empty",
    ];
    expect(Object.keys(jaMessages.teams.waPointsCompare).sort()).toEqual(KNOWN_KEYS.sort());
    expect(Object.keys(enMessages.teams.waPointsCompare).sort()).toEqual(KNOWN_KEYS.sort());
  });
});

describe("[V-ICON-15] WaPointsInfoTooltip: モバイルタップ開閉 + onBlur", () => {
  it("info ボタンをクリックするとモバイル用ツールチップが追加表示され、再クリックで消える", async () => {
    const user = userEvent.setup();
    renderWithLocale(<WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />);

    const infoButton = screen.getByTestId("info-button");

    // 初期状態: デスクトップ用の1件のみ (CSSで非表示だがDOM上には存在)
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);

    await user.click(infoButton);
    const tooltipsAfterClick = screen.getAllByRole("tooltip");
    expect(tooltipsAfterClick).toHaveLength(2);
    expect(
      tooltipsAfterClick.some((el) => el.textContent === EXPECTED_JA_TOOLTIP_TEXT),
    ).toBe(true);

    await user.click(infoButton);
    // 再クリックでモバイル用トグルは消え、デスクトップ用の1件のみに戻る (否定 assert)
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("info ボタンにフォーカス後 blur すると、開いていたモバイル用ツールチップが閉じる", async () => {
    const user = userEvent.setup();
    renderWithLocale(<WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />);
    const infoButton = screen.getByTestId("info-button");

    await user.click(infoButton);
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);

    fireEvent.blur(infoButton);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("Tab で info ボタンにフォーカスできる (デスクトップの hover/focus-within による実際の表示切替は CSS 制御のため jsdom では検証不能。BLOCKED: 実ブラウザ検証待ち)", async () => {
    const user = userEvent.setup();
    renderWithLocale(<WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />);

    await user.tab();
    expect(screen.getByTestId("info-button")).toHaveFocus();
    // デスクトップ用ツールチップ要素自体は常時DOM上に存在し、正しい説明文を持つ
    // (表示/非表示自体は group-focus-within の CSS 制御であり、jsdom では検証できない)
    expect(screen.getByTestId("info-tooltip")).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);
  });
});

describe("[V-ICON-ARIA] WaPointsInfoTooltip: aria-describedby の参照先実体", () => {
  it("aria-describedby が指す id を持つ要素が実在し、期待する説明文を含む", () => {
    renderWithLocale(
      <WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />,
    );

    const infoButton = screen.getByTestId("info-button");
    const describedById = infoButton.getAttribute("aria-describedby");

    // id 文字列が存在するだけでなく、その id を持つ要素が実際に DOM 上にあることを確認する
    expect(describedById).toBeTruthy();
    const describedElement = document.getElementById(describedById as string);
    expect(describedElement).not.toBeNull();
    expect(describedElement).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);

    // 参照先は role="tooltip" のデスクトップ用ツールチップ (data-testid で渡した要素) と同一である
    expect(describedElement).toBe(screen.getByTestId("info-tooltip"));
  });

  it("同一ページに複数インスタンスをレンダリングしても、aria-describedby の参照先 id が衝突しない", () => {
    renderWithLocale(
      <div>
        <WaPointsInfoTooltip buttonTestId="info-a" tooltipTestId="tooltip-a" />
        <WaPointsInfoTooltip buttonTestId="info-b" tooltipTestId="tooltip-b" />
      </div>,
    );

    const buttonA = screen.getByTestId("info-a");
    const buttonB = screen.getByTestId("info-b");
    const describedByA = buttonA.getAttribute("aria-describedby");
    const describedByB = buttonB.getAttribute("aria-describedby");

    expect(describedByA).toBeTruthy();
    expect(describedByB).toBeTruthy();
    // id が衝突すると同じ文字列になる。ここが壊れると参照先が別インスタンスになる
    expect(describedByA).not.toBe(describedByB);

    const elementA = document.getElementById(describedByA as string);
    const elementB = document.getElementById(describedByB as string);

    // それぞれの参照先が自分自身のツールチップであり、相手のツールチップではないこと
    expect(elementA).toBe(screen.getByTestId("tooltip-a"));
    expect(elementB).toBe(screen.getByTestId("tooltip-b"));
    expect(elementA).not.toBe(elementB);
  });

  it("aria-describedby はデスクトップ用ツールチップ (常時マウント) を指し、モバイルタップ開閉の有無に関わらず参照が保たれる", async () => {
    const user = userEvent.setup();
    renderWithLocale(
      <WaPointsInfoTooltip buttonTestId="info-button" tooltipTestId="info-tooltip" />,
    );

    const infoButton = screen.getByTestId("info-button");
    const describedById = infoButton.getAttribute("aria-describedby");

    await user.click(infoButton);
    // モバイル用ツールチップが追加された後も、参照先の id 自体は変わらない
    expect(infoButton.getAttribute("aria-describedby")).toBe(describedById);
    expect(document.getElementById(describedById as string)).toBe(screen.getByTestId("info-tooltip"));
  });
});
