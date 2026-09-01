/**
 * WaPointsCompareButton (チーム > メンバータブ) DOM 契約 pin テスト
 *
 * ## 目的
 * 本スプリントで `WaPointsCompareButton.tsx` は info アイコン部分を共有コンポーネント
 * `apps/web/components/ui/WaPointsInfoTooltip.tsx` に切り出すリファクタを受ける。
 * 既存 `WaPointsCompareButton.test.tsx` は無変更のまま green であることを別途確認済みだが、
 * その既存テストは `role="tooltip"` の全件取得 (`getAllByRole("tooltip")`) 経由でのみ
 * ツールチップを検証しており、`data-testid="team-wa-points-info-tooltip"` という
 * 具体的な testid 自体は一度も直接 assert していない (info ボタン側の testid は
 * 既存テストで getByTestId により暗黙に pin されているが、ツールチップ側は違う)。
 *
 * リファクタで `WaPointsInfoTooltip` に `tooltipTestId` を渡し忘れる、または
 * 別の値に変えてしまうという回帰が起きても、既存テストの role ベースの assertion では
 * 検知できない。このファイルはそのギャップを塞ぐ「リファクタ前の契約」の pin テストである。
 *
 * Sprint Contract 検証観点:
 *   [V-ICON-02] data-testid="team-wa-points-info-button" / "team-wa-points-info-tooltip"
 *               の両方が、リファクタ後も無変更で存在する
 *
 * ## モック方針
 * next-intl は NextIntlClientProvider + 実メッセージ JSON を使う。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi } from "vitest";

import { WaPointsCompareButton } from "../../../components/team/member-management/components/WaPointsCompareButton";
import jaMessages from "@apps/shared/messages/ja.json";

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("[V-ICON-02] WaPointsCompareButton の info アイコン data-testid 契約 (リファクタ前 pin)", () => {
  it('data-testid="team-wa-points-info-button" が存在する', () => {
    renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
    expect(screen.getByTestId("team-wa-points-info-button")).toBeInTheDocument();
  });

  it('data-testid="team-wa-points-info-tooltip" が存在し、role="tooltip" を持つ', () => {
    renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
    const tooltip = screen.getByTestId("team-wa-points-info-tooltip");
    expect(tooltip).toHaveAttribute("role", "tooltip");
  });

  it('data-testid="team-wa-points-info-tooltip" の要素が、まさに aria-label="WAポイントとは" を持つボタンに対応する説明文を表示している', () => {
    renderWithLocale(<WaPointsCompareButton onClick={vi.fn()} />);
    expect(screen.getByTestId("team-wa-points-info-button")).toHaveAttribute(
      "aria-label",
      "WAポイントとは",
    );
    expect(screen.getByTestId("team-wa-points-info-tooltip").textContent).toContain(
      "World Aquatics",
    );
  });
});
