// =============================================================================
// MemberDetailModal.swimmerStatusConfirm.test.tsx
// =============================================================================
// mobile MemberDetailModal — 泳者設定変更の確認ダイアログ経由フロー
//
// `apps/mobile/components/teams/member-detail/MemberDetailModal.tsx` の
// `handleSwimmerStatusChange` は、`__mocks__/react-native.ts` が
// `Platform.OS` を常に "web" に固定しているため、テスト実行時は常に
// `window.confirm` 分岐を通る (実機の Alert.alert 分岐はこのテスト環境では
// 到達しない。Alert.alert 経路は Platform.OS を上書きしないと再現できない
// ため、本テストのスコープ外とする)。
//
// Sprint Contract 検証観点 (web `MemberDetailModalSwimmerCheckboxGating.test.tsx`
// と同一仕様のパリティ):
//   [V-13-01] セグメントを押しただけ (確認前) では mutateAsync が呼ばれない
//   [V-13-02] 確認ダイアログで確定すると、mutateAsync が新しい isSwimmer 値で呼ばれる
//             (非泳者側: false)
//   [V-13-03] 確認ダイアログで確定すると、mutateAsync が新しい isSwimmer 値で呼ばれる
//             (泳者側: true。V-13-02 と逆方向)
//   [V-13-04] 確認メッセージに対象メンバー名が補間されている (past incident:
//             補間漏れで "{name}さんを..." がそのまま出た不具合の再発防止)
//
// モック方針: `useUpdateSwimmerStatusMutation` を直接モックして `mutateAsync` の
// 呼び出しを検証する (`MemberDetailModal.waPointsGenderWiring.test.tsx` と同じ
// 手法)。supabase クライアントそのものはこの検証に不要なため空オブジェクトで足りる。
// window.confirm は vi.spyOn で戻り値を制御する (実装が持つ確認ゲートを迂回しない)。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import ja from "@apps/shared/messages/ja.json";

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, session: null }),
}));

const updateSwimmerStatusMutateAsync = vi.fn(() => Promise.resolve({}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSwimmerStatusMutation: () => ({
    mutateAsync: updateSwimmerStatusMutateAsync,
    isPending: false,
  }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({ data: [], isLoading: false, error: null }),
}));

import { MemberDetailModal } from "../MemberDetailModal";

const NON_SWIMMER = (ja as {
  teams: {
    nonSwimmer: {
      segmentSwimmer: string;
      segmentNonSwimmer: string;
      confirmMessageToNonSwimmer: string;
      confirmMessageToSwimmer: string;
    };
  };
}).teams.nonSwimmer;

const MEMBER_NAME = "テスト太郎";

const buildMember = (isSwimmer: boolean): TeamMembershipWithUser =>
  ({
    id: "m-1",
    team_id: "team-1",
    user_id: "u-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    is_swimmer: isSwimmer,
    users: { id: "u-1", name: MEMBER_NAME },
  }) as unknown as TeamMembershipWithUser;

function clickSegment(label: string) {
  const button = screen.getByText(label).closest("button") as HTMLButtonElement;
  fireEvent.click(button);
}

function spyOnConfirm(returnValue: boolean) {
  return vi.spyOn(window, "confirm").mockReturnValue(returnValue);
}

beforeEach(() => {
  updateSwimmerStatusMutateAsync.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("[V-13] mobile MemberDetailModal - 泳者設定は確認ダイアログを経由して初めて更新される", () => {
  it("[V-13-01] 「非泳者」を押しただけ(確認せず)では mutateAsync が呼ばれない", () => {
    const confirmSpy = spyOnConfirm(false);

    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(true)}
        currentUserId="admin-1"
        isCurrentUserAdmin={true}
      />,
    );

    clickSegment(NON_SWIMMER.segmentNonSwimmer);

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(updateSwimmerStatusMutateAsync).not.toHaveBeenCalled();
  });

  it("[V-13-04] 確認メッセージに対象メンバー名が補間されている (非泳者化)", () => {
    const confirmSpy = spyOnConfirm(false);

    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(true)}
        currentUserId="admin-1"
        isCurrentUserAdmin={true}
      />,
    );

    clickSegment(NON_SWIMMER.segmentNonSwimmer);

    const expectedMessage = NON_SWIMMER.confirmMessageToNonSwimmer.replace("{name}", MEMBER_NAME);
    expect(confirmSpy).toHaveBeenCalledWith(expectedMessage);
  });

  it("[V-13-02] 確認して「変更する」相当を選ぶと mutateAsync(isSwimmer=false) が呼ばれる (泳者→非泳者)", async () => {
    spyOnConfirm(true);

    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(true)}
        currentUserId="admin-1"
        isCurrentUserAdmin={true}
      />,
    );

    clickSegment(NON_SWIMMER.segmentNonSwimmer);

    await waitFor(() => {
      expect(updateSwimmerStatusMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(updateSwimmerStatusMutateAsync).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "u-1",
      isSwimmer: false,
    });
  });

  it("[V-13-03] 確認して「変更する」相当を選ぶと mutateAsync(isSwimmer=true) が呼ばれる (非泳者→泳者、逆方向)", async () => {
    spyOnConfirm(true);

    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(false)}
        currentUserId="admin-1"
        isCurrentUserAdmin={true}
      />,
    );

    clickSegment(NON_SWIMMER.segmentSwimmer);

    await waitFor(() => {
      expect(updateSwimmerStatusMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(updateSwimmerStatusMutateAsync).toHaveBeenCalledWith({
      teamId: "team-1",
      userId: "u-1",
      isSwimmer: true,
    });
  });
});
