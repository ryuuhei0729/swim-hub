/**
 * useMembers.memberSort.test.tsx — メンバー一覧の年上順ソート検証
 *
 * Sprint Contract [並び順スプリント]:
 *   - useMembers.ts::loadMembers() は年上順（生年月日昇順、未設定は末尾）で members を返す
 *   - `.order("role", …)` は廃止済み（管理者を先頭にする旧仕様は復活しない）
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 *
 * モックのチェーンは「実際に呼ばれた終端メソッドが何であっても await した瞬間の
 * レスポンスを返す」thenable として実装する。production 側が `.order()` を
 * 呼ばなくなったことで、`.order()` を終端メソッドとして固定するモックだと
 * data が undefined になり0件表示になる (実際に GroupMemberListModal.test.tsx で
 * 踏んだ故障モードと同型)。同じ罠を再現しないための設計。
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import jaMessages from "@apps/shared/messages/ja.json";
import { useMembers } from "../../../../components/team/member-management/hooks/useMembers";
import { renderHook, act } from "@testing-library/react";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

function buildThenableSupabase(data: unknown[]) {
  const selectCalls: string[] = [];
  const orderCalls: string[] = [];

  const chain: Record<string, unknown> = {
    select: vi.fn((cols: string) => {
      selectCalls.push(cols);
      return chain;
    }),
    eq: vi.fn(() => chain),
    order: vi.fn((col: string) => {
      orderCalls.push(col);
      return chain;
    }),
    then: (
      onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error: null }).then(onFulfilled, onRejected),
  };

  return {
    client: { from: vi.fn(() => chain) },
    selectCalls,
    orderCalls,
  };
}

const memberRow = (userId: string, name: string, birthday: string | null, role = "user") => ({
  id: `membership-${userId}`,
  user_id: userId,
  role,
  is_active: true,
  status: "approved",
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: userId, name, gender: 0, birthday, bio: "", profile_image_path: null },
});

describe("useMembers - 年上順ソート", () => {
  it("select() に渡す文字列に birthday が含まれる（未select化の検出）", async () => {
    const { client, selectCalls } = buildThenableSupabase([]);

    const { result } = renderHook(() => useMembers("team-1", client as never), { wrapper });
    await act(async () => {
      await result.current.loadMembers();
    });

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]).toContain("birthday");
  });

  it("年上順（生年月日昇順）で members が返る。管理者でも先頭固定にはならない", async () => {
    const younger = memberRow("u-younger", "ジロウ", "2012-04-01", "admin");
    const older = memberRow("u-older", "タロウ", "2008-04-01", "user");
    const noBirthday = memberRow("u-none", "サブロウ", null, "user");
    // 望ましい並びと異なる順で DB から返す
    const { client } = buildThenableSupabase([younger, older, noBirthday]);

    const { result } = renderHook(() => useMembers("team-1", client as never), { wrapper });
    await act(async () => {
      await result.current.loadMembers();
    });

    expect(result.current.members.map((m) => m.user_id)).toEqual(["u-older", "u-younger", "u-none"]);
  });

  it("`.order(\"role\", …)` を呼ばない（管理者を先頭にする旧仕様が復活していないことの確認）", async () => {
    const { client, orderCalls } = buildThenableSupabase([]);

    const { result } = renderHook(() => useMembers("team-1", client as never), { wrapper });
    await act(async () => {
      await result.current.loadMembers();
    });

    expect(orderCalls).not.toContain("role");
  });
});
