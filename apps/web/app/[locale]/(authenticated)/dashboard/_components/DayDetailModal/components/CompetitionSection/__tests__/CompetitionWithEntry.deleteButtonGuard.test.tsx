/**
 * CompetitionWithEntry (エントリー済み・未記録の大会カード) 削除ボタンの
 * team_id ガード (Sprint Contract D3 / SC1)
 *
 * Sprint Contract 検証観点:
 *   [V-W-E01] isTeamCompetition=true のとき削除ボタンが描画されない
 *   [V-W-E02] isTeamCompetition=false (個人大会) のときは削除ボタンが描画される
 *             (V-W-E01 のセレクタが機能することの証明)
 *   [V-W-E03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで
 *             削除ボタンが描画される (デフォルト値の意味を固定するリグレッションガード)
 */

import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { CompetitionWithEntry } from "../CompetitionWithEntry";
import type { CompetitionWithEntryProps } from "../../../types";

function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => chain,
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function createFakeSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: () => makeChain({ data: [], error: null }),
  };
}

let fakeSupabase: ReturnType<typeof createFakeSupabase>;

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const renderWithIntl = (props: Partial<CompetitionWithEntryProps>) => {
  fakeSupabase = createFakeSupabase();

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionWithEntry
        entryId="entry-1"
        competitionId="comp-1"
        competitionName="テスト大会"
        styleName="100m自由形"
        onEditCompetition={vi.fn()}
        onDeleteCompetition={vi.fn()}
        onEditEntry={vi.fn()}
        onDeleteEntry={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
};

describe("CompetitionWithEntry 削除ボタンの isTeamCompetition ガード", () => {
  it("[V-W-E01] isTeamCompetition=true のとき削除ボタンが描画されない", async () => {
    renderWithIntl({ isTeamCompetition: true });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("delete-competition-button")).toBeNull();
  });

  it("[V-W-E02] isTeamCompetition=false (個人大会) のとき削除ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamCompetition: false });

    await waitFor(() => {
      expect(screen.getByTestId("delete-competition-button")).toBeInTheDocument();
    });
  });

  it("[V-W-E03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで削除ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("delete-competition-button")).toBeInTheDocument();
    });
  });
});
