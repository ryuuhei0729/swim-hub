/**
 * CompetitionClient — editingData ビルダー (buildCompetitionEditingData) の
 * pool_type 伝搬テスト (Sprint Contract D-5 #1 / V-2)
 *
 * D-1 (CompetitionTabModal 自身が competitionId から DB 再取得する) が最終的な
 * 正しさを保証するため、このファイルは「あくまで初回描画用の暫定値」として
 * pool_type が正しく渡っているかを検証する first-paint 契約テスト。
 * (D-1 が無効化された場合の第二の防衛線でもある)
 *
 * 対象: handleEditCompetition / handleOpenRecordTab / handleOpenEntryTab の
 * 3経路すべてが internal `buildCompetitionEditingData` を経由する
 * (Ground Truth 実測: CompetitionClient.tsx:811-822 の3入口)。
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
  deleteRecordMutateAsync: vi.fn(),
  deleteCompetitionMutateAsync: vi.fn(),
  updateRecordMutateAsync: vi.fn(),
  replaceSplitTimesMutateAsync: vi.fn(),
  entryApiDeleteEntry: vi.fn(),
}));

function createFakeSupabase(entries: unknown[] = [], records: unknown[] = []) {
  const builder = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      then: (resolve: (v: { data: unknown; error: null }) => void) => {
        if (table === "entries") return Promise.resolve(resolve({ data: entries, error: null }));
        if (table === "records") return Promise.resolve(resolve({ data: records, error: null }));
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    };
    return chain;
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: builder,
  };
}

let fakeSupabase = createFakeSupabase();

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useRecordsQuery: mocks.useRecordsQuery,
  useCreateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecordMutation: () => ({ mutateAsync: mocks.updateRecordMutateAsync, isPending: false }),
  useDeleteRecordMutation: () => ({ mutateAsync: mocks.deleteRecordMutateAsync, isPending: false }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({ mutateAsync: mocks.deleteCompetitionMutateAsync, isPending: false }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: mocks.replaceSplitTimesMutateAsync, isPending: false }),
  useListBestCandidatesQuery: () => ({ data: undefined, error: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    deleteEntry = mocks.entryApiDeleteEntry;
  },
}));

// pool_type を含む editingData 全体を可視化するスタブ (V-2 の直接検証用)
vi.mock("@/components/forms/CompetitionTabModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    initialTab?: string;
    editingCompetitionId?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editingData?: any;
  }) =>
    props.isOpen ? (
      <div data-testid="competition-tab-modal-stub">
        <span data-testid="tab-initial-tab">{props.initialTab}</span>
        <span data-testid="tab-editing-id">{props.editingCompetitionId ?? ""}</span>
        <span data-testid="tab-editing-data-pool-type">
          {props.editingData?.pool_type === undefined ? "undefined" : String(props.editingData.pool_type)}
        </span>
      </div>
    ) : null,
}));

vi.mock("@/app/[locale]/(authenticated)/competition/_components/CompetitionDetailModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    mode: "record" | "entry";
    competitionId: string;
    onEditCompetition: () => void;
    onOpenRecordTab: () => void;
    onOpenEntryTab?: () => void;
    onDeleteCompetition: () => void;
    onDeleteRecord: (recordId: string) => void;
    onDeleteEntry?: (entryId: string) => void;
    onClose: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="competition-detail-modal-stub">
        <button onClick={() => props.onEditCompetition()}>詳細から大会編集</button>
        <button onClick={() => props.onOpenRecordTab()}>詳細から記録編集</button>
        <button onClick={() => props.onOpenEntryTab?.()}>詳細からエントリー編集</button>
        <button onClick={() => props.onDeleteCompetition()}>詳細から大会削除</button>
        <button onClick={() => props.onDeleteRecord("record-1")}>詳細から記録削除</button>
        <button onClick={() => props.onDeleteEntry?.("entry-1")}>詳細からエントリー削除</button>
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
    pool_type: 1,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: {
      id: "comp-1",
      user_id: "user-1",
      date: "2026-07-01",
      end_date: null,
      title: "県大会(長水路)",
      place: "テストプール",
      pool_type: 1,
      team_id: null,
      note: null,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-01T00:00:00Z",
    },
    style: { id: 2, name_jp: "50m自由形", distance: 50 } as unknown as RecordType["style"],
    ...overrides,
  }) as RecordType;

const renderClient = (records: RecordType[], entries: unknown[] = [], recordRows: unknown[] = []) => {
  fakeSupabase = createFakeSupabase(entries, recordRows);
  mocks.useRecordsQuery.mockReturnValue({ records, isLoading: false, error: null, refetch: vi.fn() });

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionClient styles={[] as Style[]} />
    </NextIntlClientProvider>,
  );
};

describe("CompetitionClient — buildCompetitionEditingData の pool_type 伝搬 (D-5 #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  it("[V-2] mode=record: 詳細モーダルの大会編集導線 (handleEditCompetition) が長水路(1)を editingData に含めて渡す", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    await user.click(screen.getByText("県大会(長水路)"));
    await user.click(screen.getByText("詳細から大会編集"));

    expect(screen.getByTestId("tab-editing-data-pool-type")).toHaveTextContent("1");
  });

  it("[V-2] mode=record: 記録タブ導線 (handleOpenRecordTab) も長水路(1)を editingData に含める", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    await user.click(screen.getByText("県大会(長水路)"));
    await user.click(screen.getByText("詳細から記録編集"));

    expect(screen.getByTestId("tab-editing-data-pool-type")).toHaveTextContent("1");
  });

  it("[V-2] mode=entry: エントリー編集導線 (handleOpenEntryTab) が entryOnlyItem.poolType を editingData に含める", async () => {
    const user = userEvent.setup();
    const entryRows = [
      {
        id: "entry-1",
        style_id: 2,
        entry_time: 32.0,
        competition_id: "comp-2",
        style: { id: 2, name_jp: "50m自由形" },
        competition: {
          id: "comp-2",
          title: "未記録大会(長水路)",
          date: "2026-07-05",
          place: "第二プール",
          pool_type: 1,
          team_id: null,
          team: null,
        },
      },
    ];
    renderClient([], entryRows, []);

    await waitFor(() => {
      expect(screen.getByText("未記録大会(長水路)")).toBeInTheDocument();
    });
    await user.click(screen.getByText("未記録大会(長水路)"));
    await user.click(screen.getByText("詳細からエントリー編集"));

    expect(screen.getByTestId("tab-editing-data-pool-type")).toHaveTextContent("1");
  });
});
