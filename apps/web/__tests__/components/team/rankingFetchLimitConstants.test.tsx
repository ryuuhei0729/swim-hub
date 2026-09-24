// =============================================================================
// 🚨 取得上限の定数の**取り違え**を検出する ([V-P2-44b])
//
// 対象:
//   apps/web/components/team/rankings/TeamRankings.tsx       … TEAM_RANKING_FETCH_LIMIT
//   apps/web/components/team/rankings/TeamRelayRankings.tsx  … TEAM_RELAY_RANKING_FETCH_LIMIT
//
// ## なぜ専用ファイルが必要か
//
// 2つの定数は**どちらも 500** なので、リレー側が個人種目の定数を読んでいても
// **通常操作では観測差がゼロ**で、実定数 (500) を使うテストは全部緑のまま通る。
// W-4 で Reviewer が指摘した「観測差ゼロで通る定石リファクタ」と同型。
//
// そこで**2つの定数に別の値をモック**して、取り違えを観測可能にする:
//
//   個人 = 12 / リレー = 7
//
//   個人側が **7** を読んでいたら → 11 行で注記が出てしまう → 「11 行では出ない」が赤
//   リレー側が **12** を読んでいたら → 7 行で注記が出ない   → 「7 行で出る」が赤
//
// **両方向を検出できる。**
//
// ⚠️ このモックは `p_limit` にも効く (API 層が同じ定数を渡す) ので、
//    引数の期待値を持つ既存ファイルと**同居させられない**。専用ファイルにする。
//
// ⚠️ 小さい値にするのは「重いから」ではない (500 行の行オブジェクトは軽量で、
//    実定数のテストは別途 `TeamRankings.test.tsx` / `TeamRelayRankings.test.tsx`
//    に置いてある)。**2つの定数を区別可能にする**のが目的。
// =============================================================================

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import { buildDefaultRelayRankingFilters } from "@apps/shared/utils/relayRankingAxis";
import TeamRankings from "@/components/team/rankings/TeamRankings";
import TeamRelayRankings from "@/components/team/rankings/TeamRelayRankings";

// ⚠️ **`vi.hoisted` を使うこと。** `vi.mock` のファクトリは宣言より上へ
//    ホイストされるので、素の `const` を参照すると
//    `ReferenceError: Cannot access 'INDIVIDUAL_LIMIT' before initialization`
//    で**ファイルごと collect に失敗する** (実測: Tests no tests)。
const limits = vi.hoisted(() => ({ individual: 12, relay: 7 }));
const INDIVIDUAL_LIMIT = limits.individual;
const RELAY_LIMIT = limits.relay;

vi.mock("@apps/shared/api/teams/rankings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@apps/shared/api/teams/rankings")>()),
  TEAM_RANKING_FETCH_LIMIT: limits.individual,
}));

vi.mock("@apps/shared/api/teams/relayRankings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@apps/shared/api/teams/relayRankings")>()),
  TEAM_RELAY_RANKING_FETCH_LIMIT: limits.relay,
}));

vi.mock("@/lib/image-url", () => ({ getSignedImageUrl: vi.fn().mockResolvedValue(null) }));

const mocks = vi.hoisted(() => ({ supabase: { current: null as unknown } }));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: mocks.supabase.current, user: { id: "usr-limit-1" } }),
}));

const TEAM_ID = "team-limit";

/** styles マスター (Fr 50/100 だけあれば既定が成立する) */
const STYLE_ROWS = [
  { id: 2, style: "Fr", distance: 50 },
  { id: 3, style: "Fr", distance: 100 },
];

function individualRow(index: number) {
  return {
    record_id: `rec-${index}`,
    user_id: `usr-${index}`,
    display_name: `QA Limit ${index}`,
    time: 25 + index / 100,
    style_id: 2,
    style: "Fr",
    distance: 50,
    pool_type: 1,
    gender: 0,
    competition_id: `cmp-${index}`,
    competition_title: "QA 記録会",
    competition_date: "2026-06-01",
    record_created_at: "2026-06-02T00:00:00Z",
  };
}

function relayRow(index: number) {
  return {
    relay_record_id: `rr-${index}`,
    relay_kind: "free",
    leg_distance: 100,
    leg_count: 4,
    pool_type: 1,
    gender_category: "male",
    total_time: 200 + index / 100,
    competition_id: `cmp-${index}`,
    competition_title: "QA 記録会",
    competition_date: "2026-06-01",
    relay_created_at: "2026-06-02T00:00:00Z",
    legs: [],
  };
}

function makeSupabase(rowCount: number) {
  const makeThenable = (result: { data: unknown; error: unknown; count?: number }) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "in", "is", "limit", "not", "ilike"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    builder.then = (
      onfulfilled?: ((value: typeof result) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table === "styles") return makeThenable({ data: STYLE_ROWS, error: null });
      if (table === "team_memberships")
        return makeThenable({ data: [{ user_id: "usr-limit-1" }], error: null });
      if (table === "records") return makeThenable({ data: null, error: null, count: 5 });
      if (table === "relay_records") return makeThenable({ data: null, error: null, count: 5 });
      return makeThenable({ data: [], error: null });
    }),
    rpc: vi.fn(async (name: string) => ({
      data:
        name === "get_team_relay_rankings"
          ? Array.from({ length: rowCount }, (_, index) => relayRow(index))
          : Array.from({ length: rowCount }, (_, index) => individualRow(index)),
      error: null,
    })),
  };
  return client as unknown as never;
}

function wrap(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const noteText = (limit: number) =>
  messages.teams.ranking.truncatedNote.replace("{limit}", String(limit));

describe("[V-P2-44b] 取得上限の定数を取り違えていない", () => {
  beforeEach(() => {
    mocks.supabase.current = null;
  });

  describe("個人種目は TEAM_RANKING_FETCH_LIMIT を読む", () => {
    it(`🚨 ${INDIVIDUAL_LIMIT} 件で注記が出て、文言の {limit} も ${INDIVIDUAL_LIMIT} になる`, async () => {
      mocks.supabase.current = makeSupabase(INDIVIDUAL_LIMIT);
      wrap(<TeamRankings teamId={TEAM_ID} />);

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-truncated-note")).toBeInTheDocument(),
      );
      // 🚨 リレーの定数 (7) を読んでいたら文言も 7 になる
      expect(screen.getByTestId("team-rankings-truncated-note").textContent).toBe(
        noteText(INDIVIDUAL_LIMIT),
      );
    });

    it(`🚨 ${INDIVIDUAL_LIMIT - 1} 件では出ない (リレーの定数 ${RELAY_LIMIT} を読んでいたら出てしまう)`, async () => {
      mocks.supabase.current = makeSupabase(INDIVIDUAL_LIMIT - 1);
      wrap(<TeamRankings teamId={TEAM_ID} />);

      await waitFor(() =>
        expect(screen.getByTestId("team-rankings-result-count")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-rankings-truncated-note")).toBeNull();
    });
  });

  describe("リレーは TEAM_RELAY_RANKING_FETCH_LIMIT を読む", () => {
    it(`🚨 ${RELAY_LIMIT} 件で注記が出て、文言の {limit} も ${RELAY_LIMIT} になる`, async () => {
      mocks.supabase.current = makeSupabase(RELAY_LIMIT);
      wrap(
        <TeamRelayRankings teamId={TEAM_ID} filters={buildDefaultRelayRankingFilters()} />,
      );

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-truncated-note")).toBeInTheDocument(),
      );
      // 🚨 個人種目の定数 (12) を読んでいたら 7 件では出ない
      expect(screen.getByTestId("team-relay-rankings-truncated-note").textContent).toBe(
        noteText(RELAY_LIMIT),
      );
    });

    it(`🚨 ${RELAY_LIMIT - 1} 件では出ない`, async () => {
      mocks.supabase.current = makeSupabase(RELAY_LIMIT - 1);
      wrap(
        <TeamRelayRankings teamId={TEAM_ID} filters={buildDefaultRelayRankingFilters()} />,
      );

      await waitFor(() =>
        expect(screen.getByTestId("team-relay-rankings-result-count")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("team-relay-rankings-truncated-note")).toBeNull();
    });
  });

  it("🚨 2つの定数が別の値としてモックされている (このファイルの前提)", () => {
    // ⚠️ モックが効いていないと両方 500 になり、上の4件すべてが
    //    「12 件でも 7 件でも注記が出ない」で赤になる。前提を明示しておく
    expect(INDIVIDUAL_LIMIT).not.toBe(RELAY_LIMIT);
  });
});
