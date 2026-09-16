/**
 * Issue #49 QA テスト (Phase A スケルトン): MemberDetailModal の非泳者チェックボックス表示ゲート
 *
 * Sprint Contract 検証観点:
 *   受け入れ基準「一般メンバー (非管理者) にはチェックボックスが表示されない」の
 *   呼び出し元レベルでの検証。既存の役割変更 UI (AdminControls) と同じ
 *   `isCurrentUserAdmin && member.user_id !== currentUserId` ゲートに相乗りする設計を想定し、
 *   このゲート条件自体が壊れていないことを固定する
 *   (MemberDetailModalGenderWiring.test.tsx と同じ「呼び出し元レベルの配線」防衛パターン)。
 *
 *   [V-08-01] isCurrentUserAdmin=false のとき、非泳者チェックボックスは表示されない
 *   [V-08-02] isCurrentUserAdmin=true だが自分自身を見ているとき、表示されない
 *             (自分の役割を自分で変更できないのと同じ理由で、自分の泳者区分も
 *              自分では変更できない設計を維持する)
 *   [V-08-03] isCurrentUserAdmin=true かつ他人を見ているときは表示される (正のコントロール)
 *
 * モック方針: MemberDetailModalGenderWiring.test.tsx の supabase モック
 * (records テーブルへの select().eq().order() を最小限スタブ) をそのまま踏襲する。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import type { MemberDetail } from "@/types/member-detail";

function buildSupabaseMock() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "records") {
        throw new Error(`[test mock] unexpected table: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      };
    }),
  };
}

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: buildSupabaseMock() }),
}));

import MemberDetailModal from "@/components/team/MemberDetailModal";

const MESSAGES = jaMessages as unknown as AbstractIntlMessages;

const buildMember = (overrides: Partial<MemberDetail> = {}): MemberDetail => ({
  id: "member-1",
  user_id: "user-2",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  users: { id: "user-2", name: "テスト太郎" },
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

describe("MemberDetailModal - 非泳者チェックボックスの表示ゲート", () => {
  it("[V-08-01] 非管理者にはチェックボックスが表示されない", () => {
    renderModal({
      member: buildMember(),
      currentUserId: "admin-1",
      isCurrentUserAdmin: false,
    });

    expect(screen.queryByTestId("team-member-swimmer-checkbox")).not.toBeInTheDocument();
  });

  it("[V-08-02] 管理者でも自分自身を見ているときは表示されない", () => {
    const self = buildMember({ user_id: "admin-1" });
    renderModal({
      member: self,
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    expect(screen.queryByTestId("team-member-swimmer-checkbox")).not.toBeInTheDocument();
  });

  it("[V-08-03] 管理者が他人を見ているときは表示される (正のコントロール)", () => {
    renderModal({
      member: buildMember({ user_id: "user-2" }),
      currentUserId: "admin-1",
      isCurrentUserAdmin: true,
    });

    expect(screen.getByTestId("team-member-swimmer-checkbox")).toBeInTheDocument();
  });
});
