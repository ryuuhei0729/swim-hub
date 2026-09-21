/**
 * BestTimeBadge (web) — Sprint Contract D1: `userId?: string` prop 追加
 *
 * 対象: apps/web/components/ui/BestTimeBadge.tsx
 * Success Criteria 1 (SPRINT_CONTRACT.md):
 *   「他メンバーの記録でも、その人の userId で判定される
 *    (ログインユーザーの記録で判定していないこと)」
 *
 * 過去の事故 (MEMORY.md「クエリ引数を捨てるモックはスコープを検証不能にする」) を踏まえ、
 * useListBestCandidatesQuery に渡される実引数 (userId) を必ず検証する。
 * 「バッジが表示されたかどうか」だけを見るテストは、ログインユーザーの id で
 * 判定していても見た目上は区別がつかないため、スコープ漏れを検出できない。
 */

import { render } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useListBestCandidatesQuery: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useListBestCandidatesQuery: mocks.useListBestCandidatesQuery,
}));

import BestTimeBadge from "@/components/ui/BestTimeBadge";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const defaultProps = {
  recordId: "record-1",
  styleId: 1,
  currentTime: 55.0,
  recordDate: "2026-07-01",
  poolType: 0,
  isRelaying: false,
};

describe("BestTimeBadge userId prop (web, D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
  });

  it("[SC1] userId prop が指定されたとき、ログインユーザーではなくその userId でクエリする", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "logged-in-user" }, supabase: {} });

    renderWithIntl(<BestTimeBadge {...defaultProps} userId="other-member" />);

    expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "other-member" }),
    );
    // ログインユーザーの id が紛れ込んでいないことも明示的に確認する
    const calledOptions = mocks.useListBestCandidatesQuery.mock.calls[0]![1] as { userId?: string };
    expect(calledOptions.userId).not.toBe("logged-in-user");
  });

  it("[後方互換] userId prop が未指定のとき、現行どおりログインユーザーの id にフォールバックする", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "logged-in-user" }, supabase: {} });

    renderWithIntl(<BestTimeBadge {...defaultProps} />);

    expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "logged-in-user" }),
    );
  });

  it("userId prop も未認証も無いときはフェッチしない (判定不能は非表示)", () => {
    mocks.useAuth.mockReturnValue({ user: null, supabase: {} });

    renderWithIntl(<BestTimeBadge {...defaultProps} />);

    expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ enabled: false }),
    );
  });

  it("[境界] userId prop が空文字のときは非表示側に倒す (存在しないユーザーとして誤って判定しない)", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "logged-in-user" }, supabase: {} });

    renderWithIntl(<BestTimeBadge {...defaultProps} userId="" />);

    const calledOptions = mocks.useListBestCandidatesQuery.mock.calls[0]![1] as {
      userId?: string;
      enabled?: boolean;
    };
    // 空文字はログインユーザーへのフォールバックにもならず、かつ enabled=false になること
    // (space: "" || fallback だとログインユーザーに化けて SC1 の趣旨に反するため、
    //  "" のまま enabled=false に倒れることを検証する)
    expect(calledOptions.userId).not.toBe("logged-in-user");
    expect(calledOptions.enabled).toBe(false);
  });
});
