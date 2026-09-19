/**
 * web AdminControls の「泳者 / 非泳者」セグメントコントロール
 *
 * 対象: apps/web/components/member-detail/AdminControls.tsx
 *
 * ## 仕様変更の経緯
 * Phase A 時点では「泳者として登録しない」チェックボックス
 * (`data-testid="team-member-swimmer-checkbox"`) を想定していたが、
 * ユーザー指示により既存の「ユーザー / 管理者」権限セグメントと同じ見た目・
 * 同じ実装パターンの「泳者 / 非泳者」2ボタンセグメントコントロールに変更された。
 * このファイルはチェックボックス前提の旧テスト (V-07-*) をセグメント仕様に更新したもの。
 *
 * ## data-testid の実測結果 (AdminControls.tsx を直接読んで確認)
 *   - コンテナ: data-testid="team-member-swimmer-toggle"
 *   - 「泳者」ボタン: data-testid="team-member-swimmer-swimmer-button"
 *   - 「非泳者」ボタン: data-testid="team-member-swimmer-nonswimmer-button"
 *   - info アイコン: buttonTestId="team-member-swimmer-info-icon"
 *     (`WaPointsInfoTooltip` 経由。aria-label は `ariaLabel` prop で
 *     `teams.nonSwimmer.infoAriaLabel` を明示上書きしている)
 * チェックボックスの data-testid は実装から完全に削除されている。
 *
 * ## 確認ダイアログについて
 * `AdminControls` 自体は確認ダイアログを持たない (押すと即座に
 * `onSwimmerStatusChange` を呼ぶだけ)。確認ダイアログの gating は
 * 呼び出し元の `MemberDetailModal.tsx` (`handleSwimmerStatusChangeClick` /
 * `SwimmerStatusChangeModal`) が担うため、その検証は同ディレクトリの
 * `__tests__/components/team/MemberDetailModalSwimmerCheckboxGating.test.tsx` に置く。
 *
 * Sprint Contract 検証観点:
 *   [V-07-01] is_swimmer=true のとき「泳者」がアクティブ表示、「非泳者」は非アクティブ
 *   [V-07-02] is_swimmer=false のとき「非泳者」がアクティブ表示、「泳者」は非アクティブ
 *   [V-07-03] 「非泳者」ボタンをクリックすると onSwimmerStatusChange(false) が呼ばれる
 *             (泳者→非泳者)
 *   [V-07-03] 「泳者」ボタンをクリックすると onSwimmerStatusChange(true) が呼ばれる
 *             (非泳者→泳者)
 *   [V-07-04] ラベル文言が teams.nonSwimmer.segmentSwimmer / segmentNonSwimmer と一致する
 *   [V-07-05] info アイコンに teams.nonSwimmer.infoAriaLabel の aria-label が付与されている
 *
 * モック方針: next-intl は NextIntlClientProvider + 実メッセージ JSON を使う
 * (手書き useTranslations モックは複数 namespace 呼び出しで食い違う実績があるため)。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import { AdminControls } from "@/components/member-detail/AdminControls";
import type { MemberDetail } from "@/types/member-detail";

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<MemberDetail> = {}): MemberDetail => ({
  id: "member-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: "user-1", name: "テスト太郎" },
  ...overrides,
});

const NON_SWIMMER = (
  jaMessages as {
    teams: {
      nonSwimmer: {
        segmentSwimmer: string;
        segmentNonSwimmer: string;
        infoAriaLabel: string;
      };
    };
  }
).teams.nonSwimmer;

describe("AdminControls - 泳者/非泳者セグメント", () => {
  it("[V-07-01] is_swimmer=true のとき「泳者」がアクティブ表示、「非泳者」は非アクティブ", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: true })}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const swimmerButton = screen.getByTestId("team-member-swimmer-swimmer-button");
    const nonSwimmerButton = screen.getByTestId("team-member-swimmer-nonswimmer-button");
    expect(swimmerButton).toHaveClass("bg-white", "text-gray-900", "shadow-sm");
    expect(nonSwimmerButton).not.toHaveClass("bg-yellow-100", "shadow-sm");
  });

  it("[V-07-02] is_swimmer=false のとき「非泳者」がアクティブ表示、「泳者」は非アクティブ", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: false })}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const swimmerButton = screen.getByTestId("team-member-swimmer-swimmer-button");
    const nonSwimmerButton = screen.getByTestId("team-member-swimmer-nonswimmer-button");
    expect(nonSwimmerButton).toHaveClass("bg-yellow-100", "text-yellow-800", "shadow-sm");
    expect(swimmerButton).not.toHaveClass("bg-white", "shadow-sm");
  });

  it("[V-07-03] 「非泳者」ボタンをクリックすると onSwimmerStatusChange(false) が呼ばれる (泳者→非泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: true })}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByTestId("team-member-swimmer-nonswimmer-button"));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(false);
  });

  it("[V-07-03] 「泳者」ボタンをクリックすると onSwimmerStatusChange(true) が呼ばれる (非泳者→泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: false })}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByTestId("team-member-swimmer-swimmer-button"));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(true);
  });

  it("[V-07-04] ラベル文言が teams.nonSwimmer.segmentSwimmer / segmentNonSwimmer と一致する", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember()}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("team-member-swimmer-swimmer-button")).toHaveTextContent(
      NON_SWIMMER.segmentSwimmer,
    );
    expect(screen.getByTestId("team-member-swimmer-nonswimmer-button")).toHaveTextContent(
      NON_SWIMMER.segmentNonSwimmer,
    );
  });

  it("[V-07-05] info アイコンに teams.nonSwimmer.infoAriaLabel の aria-label が付与されている", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember()}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const infoButton = screen.getByTestId("team-member-swimmer-info-icon");
    expect(infoButton).toHaveAttribute("aria-label", NON_SWIMMER.infoAriaLabel);
  });
});
