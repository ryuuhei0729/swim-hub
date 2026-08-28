// =============================================================================
// MemberDetailModal.padding.test.tsx
// =============================================================================
// mobile UI フィードバック #6: Best time セクションと表は左右 padding なしで全幅、
// その上 (自己紹介〜管理者機能〜閉じるボタン) は既存どおり左右 padding を維持すること。
//
// ## jsdom での検証可能性について
// このリポジトリの `__mocks__/react-native.ts` は `View`/`Pressable` の `style` prop を
// そのまま DOM の `style` プロパティに渡す。`paddingHorizontal` は正式な CSS プロパティでは
// ないため、`getAttribute("style")` の文字列 (cssText) には出力されない (ブラウザの
// CSSStyleDeclaration が未知のプロパティを cssText に反映しないため) が、jsdom の
// CSSStyleDeclaration は expando プロパティとして値を保持するため `element.style
// .paddingHorizontal` で JS プロパティとして読み出すことはできる。
// これは「実際に画面上で左右に隙間が空くかどうか」という視覚的レイアウトの検証には
// ならない (react-native 本番では StyleSheet が paddingHorizontal を paddingLeft/Right に
// 展開して初めて視覚的に効くため、jsdom はそのネイティブ解決を再現しない)。
// ここで検証できるのは「本番コードのどの View に horizontalPadding 相当のスタイルオブジェクトが
// 適用されているか」という構造的な配線のみであり、実際の見た目は Playwright/実機で
// 別途確認する必要がある。
// =============================================================================

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import type { BestTime } from "@apps/shared/types/ui";

// MemberDetailModal.tsx は SafeAreaView を react-native 本体から import している。
// 共有インフラの __mocks__/react-native.ts には SafeAreaView のスタブが無いため、
// このテストファイル内限定で最小スタブを追加する
// (`MemberDetailModal.waPointsGenderWiring.test.tsx` と同じ方式)。
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

const buildMember = (): TeamMembershipWithUser =>
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
    users: { id: "u-1", name: "テスト太郎", gender: 0, profile_image_path: null },
  }) as unknown as TeamMembershipWithUser;

/** style.paddingHorizontal を JS プロパティとして直接読む (cssText には出ない。ヘッダ注記参照) */
function hasHorizontalPadding20(el: HTMLElement): boolean {
  return (el.style as unknown as Record<string, string>).paddingHorizontal === "20px";
}

/** 自分自身から上へ辿って、最初に paddingHorizontal:20px を持つ要素を探す */
function findNearestPadded(start: HTMLElement): HTMLElement | null {
  let cur: HTMLElement | null = start;
  while (cur) {
    if (hasHorizontalPadding20(cur)) return cur;
    cur = cur.parentElement;
  }
  return null;
}

/** 自分自身から上へ (root まで) 辿って、paddingHorizontal:20px を持つ要素が1つも無いか確認 */
function hasNoPaddedAncestor(start: HTMLElement): boolean {
  return findNearestPadded(start) === null;
}

describe("MemberDetailModal — Best time セクション/表の左右 padding 撤去 (mobile UI フィードバック #6)", () => {
  it("[V-PAD-01] 自己紹介 (ProfileSection) は左右 padding を維持している", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember()}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    const nameEl = await screen.findByText("テスト太郎");
    expect(findNearestPadded(nameEl)).not.toBeNull();
  });

  it("[V-PAD-02] Best time の見出し (アイコン+タイトル行) は左右 padding を維持している", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember()}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    const heading = await screen.findByText("Best Time");
    expect(findNearestPadded(heading)).not.toBeNull();
  });

  it("[V-PAD-03] Best time の表 (距離ヘッダーセル) は左右 padding を持つ祖先が無く、全幅で表示される", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember()}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    // BestTimesTable (teams/member-detail) の距離ヘッダーセル。データ有無に関わらず必ず描画される。
    const distanceHeader = await screen.findByText("距離");
    expect(hasNoPaddedAncestor(distanceHeader)).toBe(true);
  });

  it("[V-PAD-04] 閉じるボタンは左右 padding を維持している", async () => {
    render(
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={buildMember()}
        currentUserId="admin-1"
        isCurrentUserAdmin={false}
      />,
    );

    const closeButtons = await screen.findAllByText("閉じる");
    // フッターの閉じるボタン (ヘッダーの x アイコンではなくテキストボタン) を対象にする
    const footerClose = closeButtons.find((el) => el.tagName !== "svg");
    expect(footerClose).toBeTruthy();
    expect(findNearestPadded(footerClose as HTMLElement)).not.toBeNull();
  });
});
