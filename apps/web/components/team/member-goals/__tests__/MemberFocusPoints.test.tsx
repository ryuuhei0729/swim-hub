/**
 * 管理者「目標」タブ (web) の、選んだメンバーのフォーカスポイント欄
 * - rpc(get_team_member_focus_points, {p_team_id, p_member_id}) だけを呼び、書き込みはしない
 * - 取り組み中は番号付きで並べ、身についたものは折りたたむ
 * - 0件・読み込み中・エラー (生のエラー文を出さず再試行できる)
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import MemberFocusPoints from "../MemberFocusPoints";
import type { TeamMemberFocusPoint } from "@apps/shared/types/focusPoint";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: { rpc: h.rpc, from: h.from } }),
}));

const point = (over: Partial<TeamMemberFocusPoint> & { id: string }): TeamMemberFocusPoint => ({
  title: "右手の入水を遠くに",
  note: null,
  status: "active",
  mastered_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        <MemberFocusPoints teamId="team-1" memberId="member-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.rpc.mockReset();
  h.from.mockReset();
});

describe("MemberFocusPoints", () => {
  it("選んだメンバーのフォーカスポイントを RPC で読み、書き込みはしない", async () => {
    h.rpc.mockResolvedValue({
      data: [
        point({ id: "a", title: "腰を浮かせる", note: "コーチに言われた" }),
        point({ id: "b", title: "キックとプルのタイミング" }),
        point({ id: "m", title: "ストリームライン", status: "mastered", mastered_at: "2026-10-01T00:00:00Z" }),
      ],
      error: null,
    });
    renderSection();

    expect(await screen.findByText("腰を浮かせる")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("get_team_member_focus_points", {
      p_team_id: "team-1",
      p_member_id: "member-1",
    });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.from).not.toHaveBeenCalled();

    expect(screen.getByText("コーチに言われた")).toBeInTheDocument();
    expect(screen.getByText("取り組み中 2")).toBeInTheDocument();
    // 身についたものは閉じた <details> に入れておき、見出しで開く
    const details = screen.getByText("ストリームライン").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("身についた（1）"));
    expect(details.open).toBe(true);
  });

  it("0件なら「まだありません」を出す", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    renderSection();
    expect(await screen.findByText("フォーカスポイントはまだありません")).toBeInTheDocument();
  });

  it("読み込み中は status のスケルトンを出す", () => {
    h.rpc.mockReturnValue(new Promise(() => {}));
    renderSection();
    expect(screen.getByRole("status", { name: "フォーカスポイント" })).toBeInTheDocument();
  });

  it("取得に失敗したら、生のエラー文を出さずに汎用文言と再試行を出す", async () => {
    h.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "not an approved active admin of the team" },
    });
    renderSection();
    expect(await screen.findByRole("alert")).toHaveTextContent("フォーカスポイントを読み込めませんでした");
    expect(screen.queryByText(/not an approved/)).toBeNull();

    h.rpc.mockResolvedValueOnce({ data: [point({ id: "a", title: "腰を浮かせる" })], error: null });
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(screen.getByText("腰を浮かせる")).toBeInTheDocument());
  });
});
