/**
 * CompetitionDetails 編集ボタンの team_id ガード (Sprint Contract 2 / D3 / SC1)
 *
 * 削除ボタンと同一条件 (team_id の有無のみ。admin 判定は使わない) を編集ボタンにも
 * 付ける。PM 裁定: admin であっても個人画面からは編集不可。
 *
 * Sprint Contract 検証観点:
 *   [V-W-CE01] isTeamCompetition=true のとき編集ボタン(data-testid="edit-competition-button")
 *              が描画されない
 *   [V-W-CE02] isTeamCompetition=false (個人大会) のときは編集ボタンが描画される
 *              (V-W-CE01 のセレクタが機能することの証明)
 *   [V-W-CE03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで
 *              編集ボタンが描画される (デフォルト値の意味を固定するリグレッションガード)
 *
 * 削除ガード (CompetitionDetails.deleteButtonGuard.test.tsx) と対を成す。
 * 削除ボタンは isTeamCompetition=true でも常に非表示のままであることも合わせて確認し、
 * 編集ガード追加が削除ガードを壊していないことを非退行として担保する。
 */

import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { CompetitionDetails } from "../CompetitionDetails";
import type { CompetitionDetailsProps } from "../../../types";

function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gt: () => chain,
    lt: () => chain,
    is: () => chain,
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
    from: (table: string) => {
      if (table === "competitions") {
        return makeChain({ data: { image_paths: [] }, error: null });
      }
      return makeChain({ data: [], error: null });
    },
  };
}

let fakeSupabase: ReturnType<typeof createFakeSupabase>;

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

const renderWithIntl = (props: Partial<CompetitionDetailsProps>) => {
  fakeSupabase = createFakeSupabase();

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionDetails
        competitionId="comp-1"
        competitionName="テスト大会"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddRecord={vi.fn()}
        onEditRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
};

describe("CompetitionDetails 編集ボタンの isTeamCompetition ガード", () => {
  it("[V-W-CE01] isTeamCompetition=true のとき編集ボタンが描画されない", async () => {
    renderWithIntl({ isTeamCompetition: true });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("edit-competition-button")).toBeNull();
    // 削除ガード(Contract 1)への非退行確認: 引き続き非表示のまま
    expect(screen.queryByTestId("delete-competition-button")).toBeNull();
  });

  it("[V-W-CE02] isTeamCompetition=false (個人大会) のとき編集ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamCompetition: false });

    await waitFor(() => {
      expect(screen.getByTestId("edit-competition-button")).toBeInTheDocument();
    });
  });

  it("[V-W-CE03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで編集ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("edit-competition-button")).toBeInTheDocument();
    });
  });
});
