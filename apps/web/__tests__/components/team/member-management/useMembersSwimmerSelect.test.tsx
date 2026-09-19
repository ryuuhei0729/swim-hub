/**
 * Issue #49 QA テスト (Phase B 追加): useMembers.ts が is_swimmer を実際に select しているか
 *
 * PM指摘の構造的リスク: `swimmerFilter.ts` の `is_swimmer` は optional であり、
 * どこかの select() 句が is_swimmer を取り忘れると全員 undefined になり
 * `!== false` が真になって非泳者が候補に出続ける (型エラー・実行時エラーは出ない)。
 *
 * このテストは実際に呼び出される .select() の**引数文字列そのもの**を記録して確認する
 * (クエリ引数を捨てないモック。eqCalls/selectCalls として記録する)。
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

function buildQueryArgSpySupabase(data: unknown[]) {
  const selectCalls: string[] = [];
  const eqCalls: Array<{ column: string; value: unknown }> = [];

  const chain: Record<string, unknown> = {
    select: vi.fn((cols: string) => {
      selectCalls.push(cols);
      return chain;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return chain;
    }),
    order: vi.fn(() => Promise.resolve({ data, error: null })),
  };

  return {
    client: { from: vi.fn(() => chain) },
    selectCalls,
    eqCalls,
  };
}

describe("useMembers - is_swimmer の select 漏れ検出 (PM指摘の構造的リスク)", () => {
  it("team_memberships の select 句の文字列に is_swimmer が含まれる", async () => {
    const { client, selectCalls } = buildQueryArgSpySupabase([]);

    const { result } = renderHook(() => useMembers("team-1", client as never), { wrapper });

    await act(async () => {
      await result.current.loadMembers();
    });

    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0]).toContain("is_swimmer");
  });

  it("select 句には status/is_active の絞り込み対象カラムは残っている (select 漏れ検出ロジック自体の健全性チェック)", async () => {
    const { client, eqCalls } = buildQueryArgSpySupabase([]);

    const { result } = renderHook(() => useMembers("team-1", client as never), { wrapper });

    await act(async () => {
      await result.current.loadMembers();
    });

    expect(eqCalls).toContainEqual({ column: "team_id", value: "team-1" });
    expect(eqCalls).toContainEqual({ column: "status", value: "approved" });
    expect(eqCalls).toContainEqual({ column: "is_active", value: true });
  });
});
