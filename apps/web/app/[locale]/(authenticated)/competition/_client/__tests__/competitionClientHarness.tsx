// =============================================================================
// competitionClientHarness.tsx
// CompetitionClient を render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// ファイルごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   @/contexts                          user (user-1) / supabase (harness.supabase) / subscription: null
//   @apps/shared/hooks/queries/records  useRecordsQuery (harness.useRecordsQuery) と各 mutation。
//                                       記録の更新・削除、大会削除、スプリット置換の mutateAsync は harness に出す
//   @apps/shared/api/entries            EntryAPI.deleteEntry (harness.entryApiDeleteEntry)
//   CompetitionTabModal                 開いているときだけ、渡された props を data-testid="tab-*" で描画する
//   CompetitionDetailModal              開いているときだけ、mode・competitionId と各操作のボタンを描画する
//   RecordDetailModal                   開いているときだけ、record.id と編集・削除・閉じるボタンを描画する
//
// RecordLogForm は本物を通して検証するファイルがあるため、ここではモックしない。
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (__tests__/screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// CompetitionClient はこのファイルが import して renderClient で描画する。テストファイルで直接 import するときも
// このファイルより後に import する。

import { render } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import { vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType, Style } from "@apps/shared/types";
// vi.mock は import より前に巻き上げられるので、ここで import しても上のモックが効く
import CompetitionClient from "../CompetitionClient";

/** `from("entries")` と `from("records")` の select にそれぞれの行を返し、他のテーブルは空にする */
export function createFakeSupabase(entries: unknown[] = [], records: unknown[] = []) {
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
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: builder,
  };
}

const harness = vi.hoisted(() => ({
  supabase: null as unknown,
  useRecordsQuery: vi.fn(),
  updateRecordMutateAsync: vi.fn(),
  deleteRecordMutateAsync: vi.fn(),
  deleteCompetitionMutateAsync: vi.fn(),
  replaceSplitTimesMutateAsync: vi.fn(),
  entryApiDeleteEntry: vi.fn(),
}));

harness.supabase = createFakeSupabase();

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: harness.supabase, subscription: null }),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useRecordsQuery: harness.useRecordsQuery,
  useCreateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecordMutation: () => ({
    mutateAsync: harness.updateRecordMutateAsync,
    isPending: false,
    error: null,
  }),
  useDeleteRecordMutation: () => ({
    mutateAsync: harness.deleteRecordMutateAsync,
    isPending: false,
  }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({
    mutateAsync: harness.deleteCompetitionMutateAsync,
    isPending: false,
  }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({
    mutateAsync: harness.replaceSplitTimesMutateAsync,
    isPending: false,
    error: null,
  }),
  // CompetitionRecordCard に組み込まれた BestTimeBadge が呼ぶ。既定はロード中相当 (data 未解決) にして
  // バッジを非表示のままにし、情報表示のテストと干渉しないようにする。
  useListBestCandidatesQuery: () => ({ data: undefined, error: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    deleteEntry = harness.entryApiDeleteEntry;
  },
}));

vi.mock("@/components/forms/CompetitionTabModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    initialTab?: string;
    editingCompetitionId?: string | null;
    editingData?: { pool_type?: number | null };
    allowParentUpdate?: boolean;
  }) =>
    props.isOpen ? (
      <div data-testid="competition-tab-modal-stub">
        <span data-testid="tab-initial-tab">{props.initialTab}</span>
        <span data-testid="tab-editing-id">{props.editingCompetitionId ?? ""}</span>
        <span data-testid="tab-editing-data-pool-type">
          {props.editingData?.pool_type === undefined ? "undefined" : String(props.editingData.pool_type)}
        </span>
        <span data-testid="tab-allow-parent-update">{String(props.allowParentUpdate)}</span>
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
        <span data-testid="detail-mode">{props.mode}</span>
        <span data-testid="detail-competition-id">{props.competitionId}</span>
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
  default: (props: {
    isOpen: boolean;
    record: { id: string };
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="record-standalone-modal-stub">
        <span data-testid="standalone-record-id">{props.record.id}</span>
        <button onClick={() => props.onEdit()}>単体レコードを編集</button>
        <button onClick={() => props.onDelete()}>単体レコードを削除</button>
        <button onClick={() => props.onClose()}>単体詳細を閉じる</button>
      </div>
    ) : null,
}));

export { harness };

/** 大会 comp-1 (短水路) に紐づく 50m自由形の記録 */
export const makeRecord = (overrides: Partial<RecordType> = {}): RecordType =>
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

export function renderWithMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * useRecordsQuery が records を返す状態で CompetitionClient を描画する。
 * entries / recordRows は supabase の `from("entries")` / `from("records")` が返す行。
 */
export function renderClient(records: RecordType[], entries: unknown[] = [], recordRows: unknown[] = []) {
  harness.supabase = createFakeSupabase(entries, recordRows);
  setRecords(records);
  return renderWithMessages(<CompetitionClient styles={[] as Style[]} />);
}

export function setRecords(records: RecordType[]) {
  harness.useRecordsQuery.mockReturnValue({
    records,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}
