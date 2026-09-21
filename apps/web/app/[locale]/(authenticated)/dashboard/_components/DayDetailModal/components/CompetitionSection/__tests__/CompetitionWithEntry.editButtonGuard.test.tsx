/**
 * CompetitionWithEntry (エントリー済み・未記録の大会カード) 編集ボタンの
 * team_id ガード (Sprint Contract 2 / D3 / SC1)
 *
 * Sprint Contract 検証観点:
 *   [V-W-EE01] isTeamCompetition=true のとき編集ボタンが描画されない
 *   [V-W-EE02] isTeamCompetition=false (個人大会) のときは編集ボタンが描画される
 *              (V-W-EE01 のセレクタが機能することの証明)
 *   [V-W-EE03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで
 *              編集ボタンが描画される (デフォルト値の意味を固定するリグレッションガード)
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

describe("CompetitionWithEntry 編集ボタンの isTeamCompetition ガード", () => {
  it("[V-W-EE01] isTeamCompetition=true のとき編集ボタンが描画されない", async () => {
    renderWithIntl({ isTeamCompetition: true });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("edit-competition-button")).toBeNull();
    expect(screen.queryByTestId("delete-competition-button")).toBeNull();
  });

  it("[V-W-EE02] isTeamCompetition=false (個人大会) のとき編集ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamCompetition: false });

    await waitFor(() => {
      expect(screen.getByTestId("edit-competition-button")).toBeInTheDocument();
    });
  });

  it("[V-W-EE03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで編集ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("edit-competition-button")).toBeInTheDocument();
    });
  });
});
