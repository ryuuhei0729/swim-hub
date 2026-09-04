/**
 * BestTimesTable (マイページ ベストタイム表) WAポイント info アイコン追加テスト
 *
 * Sprint Contract (このスプリント): 「WAポイントのボタンに information アイコンをつけて
 * ください。マイページにも」— 既存の WAポイント表示トグル
 * (`data-testid="best-times-wa-points-toggle"`) の隣に、共有コンポーネント
 * `apps/web/components/ui/WaPointsInfoTooltip.tsx` (D-1) 経由で info アイコンを追加する (D-3)。
 *
 * このファイルは D-3 の新規追加分のみを対象にする。トグル自体の既存挙動
 * (V-TOGGLE/V-D1〜V-D5/V-BASE/V-REG 等) は既存
 * `apps/web/__tests__/components/profile/BestTimesTable.test.tsx` が担当し、
 * 本スプリントで無変更・無編集のまま green であることを別途確認済み。
 *
 * Sprint Contract 検証観点:
 *   [V-ICON-03] info アイコンが存在し、aria-label="WAポイントとは" で取得できる
 *               (data-testid="best-times-wa-points-info-button")
 *   [V-ICON-04] ツールチップの文言が実際の teams.waPointsCompare.infoTooltip の
 *               翻訳文と一致する (トートロジー回避のため、算出式を含む全文比較)
 *   [V-ICON-05] info アイコンをクリックするとツールチップが開き、再クリックで閉じる
 *   [V-ICON-06] info アイコンの onBlur でツールチップが閉じる
 *   [V-ICON-07] info アイコンのクリックが WAポイント表示トグル自体
 *               (data-testid="best-times-wa-points-toggle", aria-pressed) を
 *               発火させない (アイコンはトグルボタンの上に絶対配置されるため、
 *               ヒットエリアの重なり・イベント伝播が最も起きやすい実バグ)
 *   [V-ICON-08] Tab で info アイコンにフォーカスできる (デスクトップの hover/focus-within
 *               表示切替そのものは CSS 制御のため jsdom では検証不能。BLOCKED)
 *
 * ## モック方針
 * next-intl は NextIntlClientProvider + 実メッセージ JSON を使う
 * (apps/web/__tests__/components/profile/BestTimesTable.test.tsx と同方針)
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * ツールチップ本文は ja.json から書き出した実文字列をハードコードして assert する。
 * 「WAポイント」のような短い部分文字列は使わない — トグルボタンのラベル
 * (`waPointsToggle` = 「WAポイント表示」) にも同じ文字列が含まれ、アイコンが無くても
 * 通ってしまうため。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect } from "vitest";

import BestTimesTable, { type BestTime } from "../../../components/profile/BestTimesTable";
import jaMessages from "@apps/shared/messages/ja.json";

// ja.json teams.waPointsCompare.infoTooltip の実文字列 (このテスト作成時点でハードコード)
const EXPECTED_JA_TOOLTIP_TEXT =
  "WAポイントは World Aquatics（世界水泳連盟）の公式ポイント制度です。世界記録級の基準タイムを1000点とし、「1000×(基準タイム÷記録)³」で算出します。種目やコースが異なっても泳力を比較できる指標です。";

function renderWithLocale(bestTimes: BestTime[], props: { gender?: number } = { gender: 0 }) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      <BestTimesTable bestTimes={bestTimes} {...props} />
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

const getInfoButton = () => screen.getByTestId("best-times-wa-points-info-button");
const getToggle = () => screen.getByTestId("best-times-wa-points-toggle");

describe("[V-ICON-03] マイページ: WAポイントトグルに info アイコンが存在する", () => {
  it("data-testid='best-times-wa-points-info-button' が存在し、aria-label='WAポイントとは' を持つ", () => {
    renderWithLocale([buildBestTime()]);
    expect(getInfoButton()).toHaveAttribute("aria-label", "WAポイントとは");
  });

  it("WAポイントモードOFF/ONどちらでも info アイコンは常に存在する (条件付き描画によるレイアウトシフト禁止)", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime()]);
    expect(getInfoButton()).toBeInTheDocument();

    await user.click(getToggle());
    expect(getInfoButton()).toBeInTheDocument();
  });
});

describe("[V-ICON-04] マイページ: info ツールチップの文言が実際の翻訳文と一致する", () => {
  it("role='tooltip' の要素が1件存在し、算出式を含む実際の infoTooltip 全文を表示する", () => {
    renderWithLocale([buildBestTime()]);
    const tooltips = screen.getAllByRole("tooltip");
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0]).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);
  });

  it("トグルボタン自身の文言 ('WAポイント表示') とは異なる、説明文特有の内容を含む (短い部分文字列によるトートロジー回避の確認)", () => {
    renderWithLocale([buildBestTime()]);
    // role="tooltip" は前のテストと同様に1件のみ存在する前提
    const tooltip = screen.getAllByRole("tooltip")[0]!;
    // トグルのラベルには絶対に出てこない、算出式パート
    expect(tooltip.textContent).toContain("1000×(基準タイム÷記録)³");
    expect(getToggle().textContent).not.toContain("1000×(基準タイム÷記録)³");
  });
});

describe("[V-ICON-05] マイページ: info アイコンのタップ開閉トグル", () => {
  it("初期状態ではモバイル用ツールチップは存在しない (role=tooltip は1件のみ)", () => {
    renderWithLocale([buildBestTime()]);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("info アイコンをクリックするとツールチップが2件になり、再クリックで1件に戻る", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime()]);

    await user.click(getInfoButton());
    const tooltipsAfterClick = screen.getAllByRole("tooltip");
    expect(tooltipsAfterClick).toHaveLength(2);
    expect(tooltipsAfterClick.some((el) => el.textContent === EXPECTED_JA_TOOLTIP_TEXT)).toBe(
      true,
    );

    await user.click(getInfoButton());
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });
});

describe("[V-ICON-06] マイページ: info アイコンの onBlur でツールチップが閉じる", () => {
  it("クリックで開いた状態から blur すると、モバイル用ツールチップが消える", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime()]);

    await user.click(getInfoButton());
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);

    fireEvent.blur(getInfoButton());
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });
});

describe("[V-ICON-07] マイページ: info アイコンのクリックが WAポイント表示トグル自体を発火させない", () => {
  it("info アイコンをクリックしても aria-pressed の値が変化しない (トグル誤作動が起きていないことの実証)", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime({ time: 54.97, pool_type: 0 })]);

    expect(getToggle()).toHaveAttribute("aria-pressed", "false");

    await user.click(getInfoButton());
    expect(getToggle()).toHaveAttribute("aria-pressed", "false");

    await user.click(getInfoButton());
    expect(getToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("info アイコンを複数回クリックしても、時間表示セルの内容 (WAポイント表示に切り替わっていないこと) が変化しない", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);
    const cell = screen.getByTestId("best-times-cell-Fr-100");
    const before = cell.textContent;

    await user.click(getInfoButton());
    await user.click(getInfoButton());
    await user.click(getInfoButton());

    expect(cell.textContent).toBe(before);
    // トグルが誤って発火していればWAポイント表示 ("542") に化けているはず
    expect(cell.textContent).not.toContain("542");
  });

  it("(差分確認) 実際にトグルボタン自身をクリックした場合は aria-pressed が変化する (info アイコンとの挙動差の対照)", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime({ time: 54.97, pool_type: 0 })]);

    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("[V-ICON-08] マイページ: info アイコンへの Tab フォーカス", () => {
  it("Tab で info アイコンにフォーカスできる (デスクトップの hover/focus-within による実際の表示切替は CSS 制御のため jsdom では検証不能。実ブラウザ検証は BLOCKED)", async () => {
    const user = userEvent.setup();
    renderWithLocale([buildBestTime()]);

    // Tabs -> トグルボタン -> info アイコン -> チェックボックス の順でフォーカスが移動する想定。
    // 具体的な移動先要素数に依存しないよう、info アイコンに到達するまで Tab し続ける。
    let reachedInfoButton = false;
    for (let i = 0; i < 10; i++) {
      await user.tab();
      if (document.activeElement === getInfoButton()) {
        reachedInfoButton = true;
        break;
      }
    }
    expect(reachedInfoButton).toBe(true);
    // デスクトップ用ツールチップ要素自体は常時DOM上に存在し、正しい説明文を持つ
    expect(screen.getAllByRole("tooltip")[0]).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);
  });
});
