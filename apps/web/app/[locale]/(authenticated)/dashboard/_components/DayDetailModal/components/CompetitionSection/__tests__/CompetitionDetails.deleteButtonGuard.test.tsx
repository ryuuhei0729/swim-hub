/**
 * CompetitionDetails 削除ボタンの team_id ガード (Sprint Contract D3 / SC1)
 *
 * 背景: チーム大会 (team_id IS NOT NULL) は個人画面 (dashboard/大会タブ/練習タブ) から
 * 削除不可にする。管理者判定は使わず isTeamCompetition (= team_id の有無) のみで
 * 削除ボタンの表示可否を決める (PM 裁定: admin であっても個人画面からは削除不可)。
 *
 * Sprint Contract 検証観点:
 *   [V-W-C01] isTeamCompetition=true のとき削除ボタン(data-testid="delete-competition-button")
 *             が描画されない
 *   [V-W-C02] isTeamCompetition=false (個人大会) のときは従来通り削除ボタンが描画される
 *             (V-W-C01 のセレクタが「常にヒットしない」壊れたクエリでないことの証明)
 *   [V-W-C03] isTeamCompetition を省略 (デフォルト値) したときは個人大会として扱われ、
 *             削除ボタンは描画される (デフォルト値の意味を固定するリグレッションガード)
 *
 * トートロジー防止メモ: 期待値は Sprint Contract D3/SC1 の文言から導出したものであり、
 * CompetitionDetails.tsx の実装 diff をコピーしたものではない。
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
      // records / split_times ともに空配列でよい (削除ボタンの表示可否には無関係)
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

describe("CompetitionDetails 削除ボタンの isTeamCompetition ガード", () => {
  it("[V-W-C01] isTeamCompetition=true のとき削除ボタンが描画されない", async () => {
    renderWithIntl({ isTeamCompetition: true });

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("delete-competition-button")).toBeNull();
  });

  it("[V-W-C02] isTeamCompetition=false (個人大会) のとき削除ボタンが描画される (セレクタの健全性確認)", async () => {
    renderWithIntl({ isTeamCompetition: false });

    await waitFor(() => {
      expect(screen.getByTestId("delete-competition-button")).toBeInTheDocument();
    });
  });

  it("[V-W-C03] isTeamCompetition 省略時 (デフォルト値) は個人大会扱いで削除ボタンが描画される", async () => {
    renderWithIntl({});

    await waitFor(() => {
      expect(screen.getByTestId("delete-competition-button")).toBeInTheDocument();
    });
  });
});
