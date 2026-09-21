/**
 * CompetitionClient — allowParentUpdate の導出 (Sprint Contract 2 SC1/SC4)
 *
 * /competition 履歴タブは dashboard の getEditingDataTeamId とは別に、
 * 選択中の record.competition.team_id から直接 allowParentUpdate を導出する
 * (`!selection.record.competition?.team_id == null` 相当の三項演算子)。
 * 導出ロジックが dashboard と異なる独立した経路のため、専用のテストで
 * 「チーム大会 (team_id あり) は編集不可 / 個人大会 (team_id なし) は編集可」を
 * 直接検証する。CompetitionClient.test.tsx 本体 (配線ロジック中心) とは
 * 責務を分けて別ファイルに置く。
 *
 * トートロジー防止メモ: 期待値は Sprint Contract 2 (SC1: チーム大会は個人画面から
 * 編集不可 / SC4: 個人大会は従来どおり編集可能) の記述から導出したものであり、
 * 実装の三項演算子をそのままコピーしたものではない。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType, Style } from "@apps/shared/types";
import { useCompetitionStore } from "@/stores/competition/competitionStore";

const mocks = vi.hoisted(() => ({
  useRecordsQuery: vi.fn(),
}));

function createFakeSupabase() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      Promise.resolve(resolve({ data: [], error: null })),
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: () => chain,
  };
}

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: createFakeSupabase() }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useRecordsQuery: mocks.useRecordsQuery,
  useCreateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useListBestCandidatesQuery: () => ({ data: undefined, error: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    deleteEntry = vi.fn();
  },
}));

// CompetitionTabModal.allowParentUpdate.test.tsx (実コンポーネント単体) とは別に、
// ここでは CompetitionClient が「どの値を渡すか」の配線だけを見たいのでスタブ化する。
vi.mock("@/components/forms/CompetitionTabModal", () => ({
  __esModule: true,
  default: (props: { isOpen: boolean; allowParentUpdate?: boolean }) =>
    props.isOpen ? (
      <div data-testid="competition-tab-modal-stub">
        <span data-testid="tab-allow-parent-update">{String(props.allowParentUpdate)}</span>
      </div>
    ) : null,
}));

vi.mock("@/app/[locale]/(authenticated)/competition/_components/CompetitionDetailModal", () => ({
  __esModule: true,
  default: (props: { isOpen: boolean; onEditCompetition: () => void; onClose: () => void }) =>
    props.isOpen ? (
      <div data-testid="competition-detail-modal-stub">
        <button onClick={() => props.onEditCompetition()}>詳細から大会編集</button>
        <button onClick={() => props.onClose()}>詳細を閉じる</button>
      </div>
    ) : null,
}));

vi.mock("@/app/[locale]/(authenticated)/competition/_components/RecordDetailModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/components/forms/RecordLogForm", () => ({
  __esModule: true,
  default: () => null,
}));

import CompetitionClient from "../CompetitionClient";

const makeRecord = (overrides: Partial<RecordType> = {}): RecordType =>
  ({
    id: "record-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: {
      id: "comp-1",
      user_id: "user-1",
      date: "2026-07-01",
      end_date: null,
      title: "テスト大会",
      place: "テストプール",
      pool_type: 0,
      team_id: null,
      note: null,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    style: { id: 2, name_jp: "50m自由形", distance: 50 } as unknown as RecordType["style"],
    ...overrides,
  }) as RecordType;

const renderClient = (records: RecordType[]) => {
  mocks.useRecordsQuery.mockReturnValue({
    records,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionClient styles={[] as Style[]} />
    </NextIntlClientProvider>,
  );
};

describe("CompetitionClient allowParentUpdate 導出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  it("[SC1] チーム大会 (team_id あり) の記録行を編集しようとすると allowParentUpdate=false が渡る", async () => {
    const user = userEvent.setup();
    const base = makeRecord();
    renderClient([
      makeRecord({
        competition: {
          ...(base.competition as NonNullable<typeof base.competition>),
          team_id: "team-abc",
        },
      }),
    ]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会編集"));

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("false");
  });

  it("[SC4 / 非退行] 個人大会 (team_id なし) の記録行を編集すると allowParentUpdate=true が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]); // competition.team_id: null (デフォルト)

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会編集"));

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
    });
    expect(screen.getByTestId("tab-allow-parent-update")).toHaveTextContent("true");
  });
});
