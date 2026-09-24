/**
 * mobile AdminControls の「泳者 / 非泳者」セグメントコントロール
 *
 * 対象: apps/mobile/components/teams/member-detail/AdminControls.tsx
 *
 * ## 仕様変更の経緯
 * Phase A 時点では `<Switch>` (accessibilityRole="switch") を想定していたが、
 * ユーザー指示により web と同じ「泳者 / 非泳者」の2ボタンセグメントコントロールに
 * 変更された (既存の「ユーザー / 管理者」権限セグメントと同一の実装パターン)。
 * このファイルは `<Switch>` 前提の旧テスト (V-12-*) をセグメント仕様に更新したもの。
 *
 * ## data-testid / testID の実測結果
 * `AdminControls.tsx` は権限セグメント・泳者セグメントのいずれの `<Pressable>` にも
 * `testID` を付与していない (`WaPointsInfoTooltip` の呼び出しにも testID を渡していない)。
 * 判別できる手がかりはボタン内の `<Text>` の文言のみのため、本テストは
 * `screen.getByText(...)` でラベル文言から `<button>` (Pressable の DOM モック) を
 * 辿って取得する。info アイコンは `accessibilityLabel` が DOM モック上
 * `accessibilitylabel` 属性としてそのまま転記されるため、それで取得する
 * (`__mocks__/react-native.ts` の testID→data-testid 変換は TextInput 限定で、
 * Pressable/View/Text には広げてはいけない制約があるため)。
 *
 * ## 確認ダイアログについて
 * このコンポーネント自体は確認ダイアログを持たない (web の AdminControls.tsx と同型:
 * ボタン押下で即座に onSwimmerStatusChange を呼ぶだけ)。確認ダイアログの gating は
 * 呼び出し元の `MemberDetailModal.tsx` (`handleSwimmerStatusChange`) が担うため、
 * その検証は同ディレクトリの `MemberDetailModal.swimmerStatusConfirm.test.tsx` に置く。
 *
 * Sprint Contract 検証観点:
 *   [V-12-01] is_swimmer=true のとき「泳者」がアクティブ表示、「非泳者」は非アクティブ
 *   [V-12-02] is_swimmer=false のとき「非泳者」がアクティブ表示、「泳者」は非アクティブ
 *   [V-12-03] 「非泳者」を押すと onSwimmerStatusChange(false) が呼ばれる (泳者→非泳者)
 *   [V-12-03] 「泳者」を押すと onSwimmerStatusChange(true) が呼ばれる (非泳者→泳者)
 *   [V-12-04] info アイコンをタップすると teams.nonSwimmer.infoText の説明が表示される
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

const NON_SWIMMER = ja as {
  teams: { nonSwimmer: { segmentSwimmer: string; segmentNonSwimmer: string; infoAriaLabel: string; infoText: string } };
};
const segmentSwimmerLabel = NON_SWIMMER.teams.nonSwimmer.segmentSwimmer;
const segmentNonSwimmerLabel = NON_SWIMMER.teams.nonSwimmer.segmentNonSwimmer;

function renderControls(overrides: Partial<MemberWithSwimmer>, onSwimmerStatusChange = vi.fn()) {
  render(
    <AdminControls
      member={buildMember(overrides) as unknown as TeamMembershipWithUser}
      isRemoving={false}
      onRoleChangeClick={vi.fn()}
      onRemoveMember={vi.fn()}
      onSwimmerStatusChange={onSwimmerStatusChange}
    />,
  );
  return { onSwimmerStatusChange };
}

function getSegmentButtons() {
  const swimmerButton = screen.getByText(segmentSwimmerLabel).closest("button") as HTMLButtonElement;
  const nonSwimmerButton = screen
    .getByText(segmentNonSwimmerLabel)
    .closest("button") as HTMLButtonElement;
  return { swimmerButton, nonSwimmerButton };
}

describe("mobile AdminControls - 泳者/非泳者セグメント", () => {
  it("[V-12-01] is_swimmer=true のとき「泳者」がアクティブ(白背景)、「非泳者」は非アクティブ", () => {
    renderControls({ is_swimmer: true });

    const { swimmerButton, nonSwimmerButton } = getSegmentButtons();
    expect(swimmerButton.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(nonSwimmerButton.style.backgroundColor).toBe("");
  });

  it("[V-12-02] is_swimmer=false のとき「非泳者」がアクティブ(黄背景)、「泳者」は非アクティブ", () => {
    renderControls({ is_swimmer: false });

    const { swimmerButton, nonSwimmerButton } = getSegmentButtons();
    expect(nonSwimmerButton.style.backgroundColor).toBe("rgb(254, 249, 195)");
    expect(swimmerButton.style.backgroundColor).toBe("");
  });

  it("[V-12-03] 「非泳者」を押すと onSwimmerStatusChange(false) が呼ばれる (泳者→非泳者)", () => {
    const { onSwimmerStatusChange } = renderControls({ is_swimmer: true });

    const { nonSwimmerButton } = getSegmentButtons();
    fireEvent.click(nonSwimmerButton);

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(false);
  });

  it("[V-12-03] 「泳者」を押すと onSwimmerStatusChange(true) が呼ばれる (非泳者→泳者)", () => {
    const { onSwimmerStatusChange } = renderControls({ is_swimmer: false });

    const { swimmerButton } = getSegmentButtons();
    fireEvent.click(swimmerButton);

    expect(onSwimmerStatusChange).toHaveBeenCalledTimes(1);
    expect(onSwimmerStatusChange).toHaveBeenCalledWith(true);
  });

  it("[V-12-04] info アイコンをタップすると teams.nonSwimmer.infoText の説明が表示される", () => {
    const infoAriaLabel = NON_SWIMMER.teams.nonSwimmer.infoAriaLabel;
    const infoText = NON_SWIMMER.teams.nonSwimmer.infoText;

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

    const infoButton = container.querySelector(
      `[accessibilitylabel="${infoAriaLabel}"]`,
    ) as HTMLElement;
    expect(infoButton).toBeTruthy();
    fireEvent.click(infoButton);

    expect(screen.getByText(infoText)).not.toBeNull();
  });
});
