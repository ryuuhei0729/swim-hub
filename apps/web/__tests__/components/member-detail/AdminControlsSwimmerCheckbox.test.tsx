/**
 * Issue #49 QA テスト (Phase A スケルトン): AdminControls の「泳者として登録しない」チェックボックス
 *
 * 対象: apps/web/components/member-detail/AdminControls.tsx
 *   (Phase A 時点では未実装。チェックボックス + info アイコンを追加する契約)
 *
 * Sprint Contract 検証観点:
 *   [V-07-01] member.is_swimmer !== false のとき、チェックボックスは未チェック
 *             (ラベルの意味「登録しない」と DB 値 is_swimmer が反転する関係を正しく
 *              表示側でも反転させているかの確認)
 *   [V-07-02] member.is_swimmer === false のとき、チェックボックスはチェック済み
 *   [V-07-03] チェックボックスをクリックすると onSwimmerStatusChange が
 *             「新しい is_swimmer 値」(現在の反転) で呼ばれる
 *   [V-07-04] info アイコンに aria-label (teams.nonSwimmer.infoAriaLabel) が付与されている
 *   [V-07-05] info アイコンのツールチップ本文が teams.nonSwimmer.infoText と一致する
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させたインターフェース):
 *   interface AdminControlsProps {
 *     member: MemberDetail;  // MemberDetail.is_swimmer: boolean を追加
 *     isRemoving: boolean;
 *     onRoleChangeClick: (newRole: "admin" | "user") => void;
 *     onRemoveMember: () => void;
 *     onSwimmerStatusChange: (isSwimmer: boolean) => void; // 新規
 *   }
 *   チェックボックス data-testid="team-member-swimmer-checkbox"
 *   ラベルテキスト = t("teams.nonSwimmer.checkboxLabel") (root i18n namespace "teams" 前提。
 *     apps/shared/messages の teams.nonSwimmer.* を直接参照する。既存の
 *     teams.memberDetail.adminControls とは別の共通名前空間である点に注意)
 *
 * モック方針: next-intl は NextIntlClientProvider + 実メッセージ JSON を使う
 * (手書き useTranslations モックは複数 namespace 呼び出しで食い違う実績があるため)。
 * MemberDetail 型は Phase A 時点で is_swimmer を持たないため、テストの fixture 型は
 * `MemberDetail & { is_swimmer: boolean }` にキャストする (実装後に型エラーが消える)。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import { AdminControls } from "@/components/member-detail/AdminControls";
import type { MemberDetail } from "@/types/member-detail";

type MemberDetailWithSwimmer = MemberDetail & { is_swimmer: boolean };

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<MemberDetailWithSwimmer> = {}): MemberDetailWithSwimmer => ({
  id: "member-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: "user-1", name: "テスト太郎" },
  ...overrides,
});

describe("AdminControls - 非泳者チェックボックス", () => {
  it("[V-07-01] is_swimmer=true のメンバーはチェックボックスが未チェック", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: true }) as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByTestId("team-member-swimmer-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("[V-07-02] is_swimmer=false のメンバーはチェックボックスがチェック済み", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: false }) as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const checkbox = screen.getByTestId("team-member-swimmer-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("[V-07-03] 未チェック状態でクリックすると onSwimmerStatusChange(false) が呼ばれる (泳者→非泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: true }) as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByTestId("team-member-swimmer-checkbox"));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(false);
  });

  it("[V-07-03] チェック済み状態でクリックすると onSwimmerStatusChange(true) が呼ばれる (非泳者→泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    renderWithLocale(
      <AdminControls
        member={buildMember({ is_swimmer: false }) as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByTestId("team-member-swimmer-checkbox"));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(true);
  });

  it("[V-07-04] チェックボックスのラベルが teams.nonSwimmer.checkboxLabel と一致する", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember() as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText((jaMessages as { teams: { nonSwimmer: { checkboxLabel: string } } }).teams.nonSwimmer
        .checkboxLabel),
    ).toBeInTheDocument();
  });

  it("[V-07-05] info アイコンに teams.nonSwimmer.infoAriaLabel の aria-label が付与されている", () => {
    renderWithLocale(
      <AdminControls
        member={buildMember() as unknown as MemberDetail}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const expectedAriaLabel = (jaMessages as { teams: { nonSwimmer: { infoAriaLabel: string } } }).teams
      .nonSwimmer.infoAriaLabel;
    expect(screen.getByRole("button", { name: expectedAriaLabel })).toBeInTheDocument();
  });
});
