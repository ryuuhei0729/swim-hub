/**
 * web MemberDetailModal の泳者/非泳者セグメント — 表示ゲート + 確認ダイアログ経由フロー
 *
 * ## 仕様変更の経緯
 * Phase A 時点では「泳者として登録しない」チェックボックス
 * (`data-testid="team-member-swimmer-checkbox"`) を想定していたが、ユーザー指示により
 * 「泳者 / 非泳者」の2ボタンセグメントコントロールに変更された。あわせて
 * `SwimmerStatusChangeModal` による確認ダイアログを経由する仕様になった
 * (`apps/web/components/team/MemberDetailModal.tsx` の `handleSwimmerStatusChangeClick` /
 * `confirmSwimmerStatusChange` を実測して確認)。
 *
 * ## data-testid の実測結果
 * セグメントのコンテナ: `team-member-swimmer-toggle`。個別ボタンは
 * `team-member-swimmer-swimmer-button` / `team-member-swimmer-nonswimmer-button`。
 * チェックボックスの data-testid は実装から完全に削除されている。
 *
 * Sprint Contract 検証観点:
 *   [V-08-01] 非管理者にはセグメント (AdminControls 自体) が表示されない
 *   [V-08-02] 管理者でも自分自身を見ているときは表示されない
 *   [V-08-03] 管理者が他人を見ているときは表示される (正のコントロール)
 *   [V-08-04] セグメントを押しただけ (確認前) では updateSwimmerStatus (team_memberships の
 *             update) が呼ばれない
 *   [V-08-05] 確認ダイアログで「変更する」を押すと isSwimmer=false で更新される (泳者→非泳者)
 *   [V-08-06] 確認ダイアログで「変更する」を押すと isSwimmer=true で更新される
 *             (非泳者→泳者、V-08-05 と逆方向)
 *   [V-08-07] 確認ダイアログで「キャンセル」を押すと更新されず、セグメントの表示も変わらない
 *
 * モック方針: supabase クライアントの `team_memberships` / `records` テーブルへの呼び出しを
 * 実際に受け取り、`.eq()` / `.update()` に渡された引数を記録して検証する (クエリ条件を
 * 握り潰す不良モックを避ける)。`requireTeamAdmin` (`apps/shared/api/auth-utils.ts`) が
 * `auth.getUser()` → `team_memberships.select("role").eq(...).eq(...).eq(...).eq(...).single()`
 * を呼ぶため、汎用のチェイン可能スタブを用意する。
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import type { MemberDetail } from "@/types/member-detail";

// ---------------------------------------------------------------------------
// supabase モック
// ---------------------------------------------------------------------------
type UpdateCall = { table: string; payload: Record<string, unknown>; eqCalls: Array<[string, unknown]> };

let updateCalls: UpdateCall[] = [];

// select().eq().eq()... .single() / .order() のいずれでも終端できる汎用チェイン。
// eq() は自分自身を返し続けるため、呼び出し回数に依存しない。
function makeReadChain(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function buildSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "admin-1" } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "records") {
        return {
          select: vi.fn(() => makeReadChain({ data: [], error: null })),
        };
      }
      if (table === "team_memberships") {
        return {
          // requireTeamAdmin: select("role").eq(team_id).eq(user_id).eq(is_active).eq(role).single()
          // 常に admin membership が見つかったことにする (このテストは
          // isCurrentUserAdmin=true のシナリオのみを扱う)
          select: vi.fn(() => makeReadChain({ data: { role: "admin" }, error: null })),
          // updateSwimmerStatus: update({is_swimmer}).eq(team_id).eq(user_id).select().single()
          update: vi.fn((payload: Record<string, unknown>) => {
            const eqCalls: Array<[string, unknown]> = [];
            const chain = {
              eq: vi.fn((column: string, value: unknown) => {
                eqCalls.push([column, value]);
                return chain;
              }),
              select: vi.fn(() => chain),
              single: vi.fn(() => {
                updateCalls.push({ table, payload, eqCalls: [...eqCalls] });
                return Promise.resolve({ data: { id: "membership-1", ...payload }, error: null });
              }),
            };
            return chain;
          }),
        };
      }
      throw new Error(`[test mock] unexpected table: ${table}`);
    }),
  };
}

let currentSupabaseMock: ReturnType<typeof buildSupabaseMock>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: currentSupabaseMock }),
}));

import MemberDetailModal from "@/components/team/MemberDetailModal";

const MESSAGES = jaMessages as unknown as AbstractIntlMessages;
const NON_SWIMMER = (
  jaMessages as {
    teams: {
      nonSwimmer: {
        confirmMessageToNonSwimmer: string;
        confirmMessageToSwimmer: string;
      };
    };
  }
).teams.nonSwimmer;
const MEMBER_NAME = "テスト太郎";

const buildMember = (overrides: Partial<MemberDetail> = {}): MemberDetail => ({
  id: "member-1",
  user_id: "user-2",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: "user-2", name: MEMBER_NAME },
  ...overrides,
});

function renderModal(props: {
  member: MemberDetail;
  currentUserId: string;
  isCurrentUserAdmin: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="ja" messages={MESSAGES}>
      <MemberDetailModal
        isOpen={true}
        onClose={vi.fn()}
        member={props.member}
        teamId="team-1"
        currentUserId={props.currentUserId}
        isCurrentUserAdmin={props.isCurrentUserAdmin}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  updateCalls = [];
  currentSupabaseMock = buildSupabaseMock();
});

describe("MemberDetailModal - 泳者/非泳者セグメントの表示ゲート", () => {
  it("[V-08-01] 非管理者にはセグメントが表示されない", () => {
    renderModal({
      member: buildMember(),
      currentUserId: "admin-1",
      isCurrentUserAdmin: false,
    });

    expect(screen.queryByTestId("team-member-swimmer-toggle")).not.toBeInTheDocument();
  });

  it("[V-08-02] 管理者でも自分自身を見ているときは表示されない", () => {
    const self = buildMember({ user_id: "admin-1" });
    renderModal({
      member: self,
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    expect(screen.queryByTestId("team-member-swimmer-toggle")).not.toBeInTheDocument();
  });

  it("[V-08-03] 管理者が他人を見ているときは表示される (正のコントロール)", () => {
    renderModal({
      member: buildMember({ user_id: "user-2" }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    expect(screen.getByTestId("team-member-swimmer-toggle")).toBeInTheDocument();
  });
});

describe("[V-08] MemberDetailModal - 泳者設定は確認ダイアログを経由して初めて更新される", () => {
  it("[V-08-04] 「非泳者」ボタンを押しただけ(確認前)では team_memberships の update が呼ばれない", async () => {
    const user = userEvent.setup();
    renderModal({
      member: buildMember({ is_swimmer: true }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    await user.click(screen.getByTestId("team-member-swimmer-nonswimmer-button"));

    // 確認ダイアログ (SwimmerStatusChangeModal) が出ていること
    expect(
      screen.getByText(NON_SWIMMER.confirmMessageToNonSwimmer.replace("{name}", MEMBER_NAME)),
    ).toBeInTheDocument();
    // まだ update は呼ばれていない
    expect(updateCalls).toHaveLength(0);
  });

  it("[V-08-05] 確認ダイアログで「変更する」を押すと is_swimmer=false で更新される (泳者→非泳者)", async () => {
    const user = userEvent.setup();
    renderModal({
      member: buildMember({ is_swimmer: true }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    await user.click(screen.getByTestId("team-member-swimmer-nonswimmer-button"));
    await user.click(screen.getByRole("button", { name: "変更する" }));

    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(updateCalls[0]?.payload).toEqual({ is_swimmer: false });
    expect(updateCalls[0]?.eqCalls).toEqual([
      ["team_id", "team-1"],
      ["user_id", "user-2"],
    ]);

    // 表示側も更新後の状態 (非泳者アクティブ) に切り替わる
    await waitFor(() => {
      expect(screen.getByTestId("team-member-swimmer-nonswimmer-button")).toHaveClass("bg-yellow-100");
    });
  });

  it("[V-08-06] 確認ダイアログで「変更する」を押すと is_swimmer=true で更新される (非泳者→泳者、逆方向)", async () => {
    const user = userEvent.setup();
    renderModal({
      member: buildMember({ is_swimmer: false }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    await user.click(screen.getByTestId("team-member-swimmer-swimmer-button"));
    await user.click(screen.getByRole("button", { name: "変更する" }));

    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(updateCalls[0]?.payload).toEqual({ is_swimmer: true });
  });

  it("[V-08-07] 確認ダイアログで「キャンセル」を押すと更新されず、セグメントの表示も変わらない", async () => {
    const user = userEvent.setup();
    renderModal({
      member: buildMember({ is_swimmer: true }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    await user.click(screen.getByTestId("team-member-swimmer-nonswimmer-button"));
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(updateCalls).toHaveLength(0);
    expect(screen.getByTestId("team-member-swimmer-swimmer-button")).toHaveClass("bg-white");
  });
});
