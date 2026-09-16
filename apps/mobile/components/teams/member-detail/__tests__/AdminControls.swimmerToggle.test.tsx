/**
 * Issue #49 QA テスト (Phase A スケルトン): mobile AdminControls の非泳者トグル
 *
 * 対象: apps/mobile/components/teams/member-detail/AdminControls.tsx
 *   (Phase A 時点では未実装)
 *
 * Sprint Contract 検証観点 (web AdminControlsSwimmerCheckbox.test.tsx と同一仕様のパリティ):
 *   [V-12-01] member.is_swimmer !== false のとき、トグルは OFF
 *   [V-12-02] member.is_swimmer === false のとき、トグルは ON
 *   [V-12-03] トグル操作で onSwimmerStatusChange が反転後の値で呼ばれる
 *   [V-12-04] info アイコンをタップすると teams.nonSwimmer.infoText の説明が表示される
 *             (web はホバー、app はタップ。CenterModal 系のダイアログを想定)
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させたインターフェース):
 *   interface AdminControlsProps {
 *     member: TeamMembershipWithUser; // is_swimmer: boolean を持つ (shared TeamMembership 拡張)
 *     isRemoving: boolean;
 *     onRoleChangeClick: (newRole: "admin" | "user") => void;
 *     onRemoveMember: () => void;
 *     onSwimmerStatusChange: (isSwimmer: boolean) => void; // 新規
 *   }
 *   非泳者トグルは既存の includeRelaying (TeamMemberList.tsx) と同じ RN <Switch> パターンで実装する
 *   (accessibilityRole="switch", accessibilityLabel = t("teams.nonSwimmer.checkboxLabel"))。
 *   `apps/mobile/__mocks__/react-native.ts` の Switch モックは testID を data-testid に
 *   変換しないため、本テストは screen.getByRole("switch", { name: ... }) で取得する
 *   (View/Pressable/Text の testID 変換は既存の "変換を広げてはいけない" 制約に従う)。
 *
 * i18n: apps/mobile/vitest.setup.ts のグローバル react-i18next モックが実際の ja.json を
 * 解決するため、next-intl のような手書きモックは不要 (テスト対象キー: teams.nonSwimmer.*)。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import ja from "@apps/shared/messages/ja.json";

import { AdminControls } from "../AdminControls";

type MemberWithSwimmer = TeamMembershipWithUser & { is_swimmer: boolean };

const buildMember = (overrides: Partial<MemberWithSwimmer> = {}): MemberWithSwimmer =>
  ({
    id: "member-1",
    user_id: "user-1",
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    is_swimmer: true,
    users: { id: "user-1", name: "テスト太郎" },
    ...overrides,
  }) as unknown as MemberWithSwimmer;

const checkboxLabel = (ja as { teams: { nonSwimmer: { checkboxLabel: string } } }).teams.nonSwimmer
  .checkboxLabel;

describe("mobile AdminControls - 非泳者トグル", () => {
  it("[V-12-01] is_swimmer=true のときトグルは OFF", () => {
    render(
      <AdminControls
        member={buildMember({ is_swimmer: true }) as unknown as TeamMembershipWithUser}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("switch", { name: checkboxLabel });
    expect(toggle.getAttribute("data-value")).toBe("false");
  });

  it("[V-12-02] is_swimmer=false のときトグルは ON", () => {
    render(
      <AdminControls
        member={buildMember({ is_swimmer: false }) as unknown as TeamMembershipWithUser}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("switch", { name: checkboxLabel });
    expect(toggle.getAttribute("data-value")).toBe("true");
  });

  it("[V-12-03] OFF から操作すると onSwimmerStatusChange(false) が呼ばれる (泳者→非泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    render(
      <AdminControls
        member={buildMember({ is_swimmer: true }) as unknown as TeamMembershipWithUser}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByRole("switch", { name: checkboxLabel }));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(false);
  });

  it("[V-12-03] ON から操作すると onSwimmerStatusChange(true) が呼ばれる (非泳者→泳者)", async () => {
    const user = userEvent.setup();
    const onSwimmerStatusChange = vi.fn();

    render(
      <AdminControls
        member={buildMember({ is_swimmer: false }) as unknown as TeamMembershipWithUser}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={onSwimmerStatusChange}
      />,
    );

    await user.click(screen.getByRole("switch", { name: checkboxLabel }));

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(true);
  });

  it("[V-12-04] info アイコンをタップすると teams.nonSwimmer.infoText の説明が表示される (Phase B 追加)", () => {
    const infoAriaLabel = (ja as { teams: { nonSwimmer: { infoAriaLabel: string } } }).teams.nonSwimmer
      .infoAriaLabel;
    const infoText = (ja as { teams: { nonSwimmer: { infoText: string } } }).teams.nonSwimmer.infoText;

    const { container } = render(
      <AdminControls
        member={buildMember({ is_swimmer: true }) as unknown as TeamMembershipWithUser}
        isRemoving={false}
        onRoleChangeClick={vi.fn()}
        onRemoveMember={vi.fn()}
        onSwimmerStatusChange={vi.fn()}
      />,
    );

    // タップ前は説明文が (CenterModal 非表示のため) 存在しない
    expect(screen.queryByText(infoText)).toBeNull();

    // Pressable の testID 変換はこのリポジトリの react-native モックでは行われない
    // (TextInput 限定) ため、accessibilityLabel が素通しされた DOM 属性
    // (小文字化される: accessibilitylabel) で対象を絞り込む
    // (MyPageScreen.waPointsInfoIcon.test.tsx と同じ手法)。
    const infoButton = container.querySelector(`[accessibilitylabel="${infoAriaLabel}"]`) as HTMLElement;
    expect(infoButton).toBeTruthy();
    fireEvent.click(infoButton);

    expect(screen.getByText(infoText)).not.toBeNull();
  });
});
