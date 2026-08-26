/**
 * WaPointsCompareButton コンポーネントテスト
 *
 * Sprint Contract 検証観点:
 *   [V-15] info マーク hover/クリックで説明 (infoTooltip) が表示される
 *   [V-16 補助] ボタンクリックで onClick が呼ばれる (モーダルを開く配線の起点)
 *
 * モック方針: next-intl は NextIntlClientProvider + 実メッセージ JSON を使う。
 * 期待するツールチップ本文は ja.json から書き出した実文字列をハードコードして assert する
 * (実装/コンポーネントの t() 呼び出し結果を期待値生成に使わない = トートロジー回避)。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi } from "vitest";

import { WaPointsCompareButton } from "../../../components/team/member-management/components/WaPointsCompareButton";
import jaMessages from "@apps/shared/messages/ja.json";

// ja.json teams.waPointsCompare.infoTooltip の実文字列 (このテストファイル作成時点でハードコード)
const EXPECTED_JA_TOOLTIP_TEXT =
  "WAポイントは World Aquatics（世界水泳連盟）の公式ポイント制度です。世界記録級の基準タイムを1000点とし、「1000×(基準タイム÷記録)³」で算出します。種目やコースが異なっても泳力を比較できる指標です。";

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("WaPointsCompareButton", () => {
  it("[V-16 補助] メインボタンをクリックすると onClick がちょうど1回呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithLocale(<WaPointsCompareButton onClick={onClick} />);

    await user.click(screen.getByTestId("team-wa-points-button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("メインボタンの表示文言が「WAポイントで比較」である", () => {
    renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "WAポイントで比較" })).toBeInTheDocument();
  });

  describe("[V-15] info マークの説明表示", () => {
    it("info ボタンの aria-label が「WAポイントとは」である", () => {
      renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
      expect(screen.getByTestId("team-wa-points-info-button")).toHaveAttribute(
        "aria-label",
        "WAポイントとは",
      );
    });

    it("デスクトップ用ツールチップ (hover 対象) は常にDOM上に存在し、実際の説明文を含む", () => {
      renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
      // hover の CSS 制御 (group-hover) 自体は jsdom では検証できないため、
      // 「hover 対象の要素が実際に存在し、正しい説明文を持つ」ことを保証する。
      const tooltips = screen.getAllByRole("tooltip");
      expect(tooltips).toHaveLength(1);
      expect(tooltips[0]).toHaveTextContent(EXPECTED_JA_TOOLTIP_TEXT);
    });

    it("info ボタンをクリックするとモバイル用ツールチップが追加表示され、再クリックで消える", async () => {
      const user = userEvent.setup();
      renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);

      const infoButton = screen.getByTestId("team-wa-points-info-button");

      // 初期状態: デスクトップ用の1件のみ (CSSで非表示だがDOM上には存在)
      expect(screen.getAllByRole("tooltip")).toHaveLength(1);

      await user.click(infoButton);
      // クリック後: デスクトップ用 + モバイル用トグルの2件になる
      const tooltipsAfterClick = screen.getAllByRole("tooltip");
      expect(tooltipsAfterClick).toHaveLength(2);
      expect(tooltipsAfterClick.some((el) => el.textContent === EXPECTED_JA_TOOLTIP_TEXT)).toBe(true);

      await user.click(infoButton);
      // 再クリックでモバイル用トグルは消え、デスクトップ用の1件のみに戻る
      expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    });
  });
});
