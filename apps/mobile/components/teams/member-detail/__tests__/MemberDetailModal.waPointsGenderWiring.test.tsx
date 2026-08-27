// =============================================================================
// MemberDetailModal.waPointsGenderWiring.test.tsx
// =============================================================================
// MemberDetailModal — gender 配線 (呼び出し元レベル) の防衛テスト
//
// web 版に実際にあった穴 (`apps/web/__tests__/components/team/
// MemberDetailModalGenderWiring.test.tsx` 参照) と同種の懸念を mobile 版
// `MemberDetailModal.tsx` (`<BestTimesTable bestTimes={bestTimes} gender={member.users.gender} />`)
// に対して検証する。BestTimesTable 単体テストは gender を直接 props として渡すため、
// MemberDetailModal が `member.users.gender` を握り潰さず配線しているかは別途必要。
//
// ## このテストが pin する挙動
// - [V-GENDER-WIRING-01] member.users.gender が undefined のとき、WAポイントモードに
//   切り替えてもセルは「—」のままで、男性基準の点数 (542) は出ない。
// - [V-GENDER-WIRING-02] member.users.gender = 1 (女性) のとき、男性基準の 542 ではなく
//   女性基準の 763 が表示される。
// - [V-GENDER-WIRING-03] member.users.gender = 0 (男性) を明示指定したときは 542 が
//   表示される (回帰確認)。
//
// ## 期待値の作成方法 (トートロジー回避)
// 542 / 763 は node -e で P = floor(1000 * (B/T)^3) を独立に計算したハードコード値
// (T=54.97, SCM 100m自由形: 男子base=44.84 / 女子base=50.25)。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import type { BestTime } from "@apps/shared/types/ui";

// `MemberDetailModal.tsx` は `SafeAreaView` を (react-native-safe-area-context ではなく)
// react-native 本体から import している。共有インフラの `__mocks__/react-native.ts` には
// SafeAreaView のスタブが無い (このコンポーネントの既存テストが今まで一件も無かったため
// 未発見だった) ため、このテストファイル内限定で最小スタブを追加する
// (`AdminViewToggle.test.tsx` の Switch ローカルスタブと同じ方式。共有モックは変更しない)。
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

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const FR100_RECORD: BestTime = {
  id: "rec-1",
  time: 54.97,
  created_at: "2020-01-01T00:00:00.000Z",
  pool_type: 0,
  is_relaying: false,
  style_id: 1,
  style: { name_jp: "100m自由形", distance: 100 },
  competition: { title: "テスト大会", date: "2020-01-01" },
};

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({
    data: [FR100_RECORD],
    isLoading: false,
    error: null,
  }),
}));

import { MemberDetailModal } from "../MemberDetailModal";

const buildMember = (gender: number | undefined): TeamMembershipWithUser =>
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
    users: { id: "u-1", name: "テスト太郎", gender, profile_image_path: null },
  }) as unknown as TeamMembershipWithUser;

describe("[V-GENDER-WIRING] MemberDetailModal は member.users.gender をそのまま BestTimesTable に配線する", () => {
  it("[V-GENDER-WIRING-01] gender が undefined のメンバーは、WAポイントモードでも「—」のままで 542 は出ない (`?? 0` フォールバック検出)", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(undefined)}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    await screen.findByText("54.97");
    fireEvent.click(screen.getByText("WAポイント表示"));

    await waitFor(() => {
      expect(screen.queryByText("542")).toBeNull();
    });
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-GENDER-WIRING-02] gender=1 (女性) のメンバーは、WAポイントモードで男性基準の 542 ではなく女性基準の 763 が表示される", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(1)}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    await screen.findByText("54.97");
    fireEvent.click(screen.getByText("WAポイント表示"));

    await waitFor(() => {
      expect(screen.getByText("763")).toBeTruthy();
    });
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[V-GENDER-WIRING-03] gender=0 (男性) を明示指定したメンバーは、WAポイントモードで 542 が表示される (回帰確認)", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember(0)}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    await screen.findByText("54.97");
    fireEvent.click(screen.getByText("WAポイント表示"));

    await waitFor(() => {
      expect(screen.getByText("542")).toBeTruthy();
    });
    expect(screen.queryByText("763")).toBeNull();
  });
});
