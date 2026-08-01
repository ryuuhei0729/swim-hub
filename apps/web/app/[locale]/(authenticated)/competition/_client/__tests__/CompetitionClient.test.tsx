/**
 * CompetitionClient テスト
 *
 * /competition 履歴タブの一覧本体。詳細モーダル (CompetitionDetailModal) と
 * タブモーダル (CompetitionTabModal) は既に個別にテスト済みの再利用コンポーネントのため
 * 薄いスタブに差し替え、CompetitionClient 自身が持つ「配線」ロジック
 * (行クリック→詳細モーダルopen(mode=record)、エントリー済みセクション→詳細モーダルopen(mode=entry)、
 * 記録の即時削除、大会/エントリー削除の委譲) を検証する。
 *
 * Sprint Contract 検証観点:
 *   [V-W-C01] 記録行クリックで詳細モーダルが mode="record" で開く
 *   [V-W-C05] エントリー済み（記録未登録）セクションが表示され、クリックで mode="entry" が開く
 *   [V-W-C07] 記録の削除は deleteRecordMutation を確認なしで直接呼ぶ
 *   [V-W-C08] 大会削除・エントリー削除は各々のミューテーションに委譲される
 *   [V-W-C02/03] 詳細モーダルの編集導線から CompetitionTabModal の competition/record タブが開く
 *   [store リーク回帰] useCompetitionStore は Dashboard/practice/competition の3画面で共有される
 *             module-level singleton。他画面で TabModal を開いたまま /competition に遷移してきた
 *             場合に isOpen=true 等が残っていないか (mount 時 closeAll)、逆にこの画面で開いたまま
 *             離脱した場合に閉じ忘れないか (unmount 時 closeAll) を検証する。
 *             ※ beforeEach の強制リセットに頼らず、各テスト内で明示的に「他画面が残した状態」を
 *             再現してから mount することがポイント。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType, Style } from "@apps/shared/types";
import { useCompetitionStore } from "@/stores/competition/competitionStore";

// -----------------------------------------------------------------------
// vi.hoisted — モック関数の巻き上げ対策
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  useRecordsQuery: vi.fn(),
  deleteRecordMutateAsync: vi.fn(),
  deleteCompetitionMutateAsync: vi.fn(),
  updateRecordMutateAsync: vi.fn(),
  replaceSplitTimesMutateAsync: vi.fn(),
  entryApiDeleteEntry: vi.fn(),
}));

// 大会一覧の useEffect (entryOnlyItems 取得) 用の最小 fake supabase クライアント。
// from(table).select().eq() のチェーンを thenable として実装する。
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
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
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
  useUpdateRecordMutation: () => ({
    mutateAsync: mocks.updateRecordMutateAsync,
    isPending: false,
  }),
  useDeleteRecordMutation: () => ({
    mutateAsync: mocks.deleteRecordMutateAsync,
    isPending: false,
  }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({
    mutateAsync: mocks.deleteCompetitionMutateAsync,
    isPending: false,
  }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({
    mutateAsync: mocks.replaceSplitTimesMutateAsync,
    isPending: false,
  }),
  // 2026-07-22 Sprint: CompetitionRecordCard に組み込まれた BestTimeBadge が
  // useListBestCandidatesQuery を呼ぶため、このモジュール全体モックに追加しないと
  // 全テストが "No export is defined" でクラッシュする。既定はロード中相当(data未解決)
  // にしてバッジを非表示のままにし、既存の情報表示テストと干渉しないようにする。
  useListBestCandidatesQuery: () => ({ data: undefined, error: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    deleteEntry = mocks.entryApiDeleteEntry;
  },
}));

vi.mock("@/components/forms/CompetitionTabModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    initialTab?: string;
    editingCompetitionId?: string | null;
  }) =>
    props.isOpen ? (
      <div data-testid="competition-tab-modal-stub">
        <span data-testid="tab-initial-tab">{props.initialTab}</span>
        <span data-testid="tab-editing-id">{props.editingCompetitionId ?? ""}</span>
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

vi.mock("@/components/forms/RecordLogForm", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    competitionId: string;
    editData?: { id?: string } | null;
    onSubmit: (dataList: unknown[]) => Promise<void>;
    onClose: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="record-log-form-stub">
        <span data-testid="record-log-form-competition-id">{props.competitionId}</span>
        <span data-testid="record-log-form-editing-id">{props.editData?.id ?? ""}</span>
        <button
          onClick={() =>
            props.onSubmit([
              {
                styleId: "2",
                time: 31.0,
                isRelaying: false,
                splitTimes: [],
                note: "",
                reactionTime: "",
              },
            ])
          }
        >
          単体レコードを保存
        </button>
        <button onClick={() => props.onClose()}>単体編集を閉じる</button>
      </div>
    ) : null,
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

const renderClient = (records: RecordType[], entries: unknown[] = [], recordRows: unknown[] = []) => {
  fakeSupabase = createFakeSupabase(entries, recordRows);
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

describe("CompetitionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  it("詳細モーダルを閉じると非表示になり、選択状態がリセットされる", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    await user.click(screen.getByText("テスト大会"));
    expect(screen.getByTestId("competition-detail-modal-stub")).toBeInTheDocument();

    await user.click(screen.getByText("詳細を閉じる"));
    expect(screen.queryByTestId("competition-detail-modal-stub")).not.toBeInTheDocument();
  });

  it("[V-W-C01] 記録行クリックで詳細モーダルが mode=record で開く", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    expect(screen.queryByTestId("competition-detail-modal-stub")).not.toBeInTheDocument();

    await user.click(screen.getByText("テスト大会"));

    expect(screen.getByTestId("competition-detail-modal-stub")).toBeInTheDocument();
    expect(screen.getByTestId("detail-mode")).toHaveTextContent("record");
    expect(screen.getByTestId("detail-competition-id")).toHaveTextContent("comp-1");
  });

  it("[V-W-C07] 記録削除は確認なしで即時に deleteRecordMutation が呼ばれる", async () => {
    const user = userEvent.setup();
    mocks.deleteRecordMutateAsync.mockResolvedValue(undefined);
    renderClient([makeRecord()]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から記録削除"));

    await waitFor(() => {
      expect(mocks.deleteRecordMutateAsync).toHaveBeenCalledWith("record-1");
    });
  });

  it("[V-W-C08] 大会削除は deleteCompetitionMutation に委譲される", async () => {
    const user = userEvent.setup();
    mocks.deleteCompetitionMutateAsync.mockResolvedValue(undefined);
    renderClient([makeRecord()]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会削除"));

    await waitFor(() => {
      expect(mocks.deleteCompetitionMutateAsync).toHaveBeenCalledWith("comp-1");
    });
  });

  it("[V-W-C02] 詳細モーダルの大会編集導線から CompetitionTabModal の competition タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から大会編集"));

    expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("competition");
    expect(screen.getByTestId("tab-editing-id")).toHaveTextContent("comp-1");
  });

  it("[V-W-C03] 詳細モーダルの記録編集導線から CompetitionTabModal の record タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makeRecord()]);

    await user.click(screen.getByText("テスト大会"));
    await user.click(screen.getByText("詳細から記録編集"));

    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("record");
  });

  it("[V-W-C05] エントリー済み（記録未登録）セクションが表示され、クリックで mode=entry が開く", async () => {
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
          title: "未記録大会",
          date: "2026-07-05",
          place: "第二プール",
          pool_type: 0,
          team_id: null,
          team: null,
        },
      },
    ];

    renderClient([], entryRows, []);

    await waitFor(() => {
      expect(screen.getByText("エントリー済み（記録未登録）")).toBeInTheDocument();
    });
    expect(screen.getByText("未記録大会")).toBeInTheDocument();

    await user.click(screen.getByText("未記録大会"));

    expect(screen.getByTestId("competition-detail-modal-stub")).toBeInTheDocument();
    expect(screen.getByTestId("detail-mode")).toHaveTextContent("entry");
    expect(screen.getByTestId("detail-competition-id")).toHaveTextContent("comp-2");
  });

  it("[V-W-C05] 既に記録がある大会はエントリー済みセクションから除外される", async () => {
    const entryRows = [
      {
        id: "entry-1",
        style_id: 2,
        entry_time: 32.0,
        competition_id: "comp-1",
        style: { id: 2, name_jp: "50m自由形" },
        competition: {
          id: "comp-1",
          title: "記録済み大会",
          date: "2026-07-01",
          place: "テストプール",
          pool_type: 0,
          team_id: null,
          team: null,
        },
      },
    ];
    const recordedRows = [{ competition_id: "comp-1" }];

    renderClient([makeRecord()], entryRows, recordedRows);

    await waitFor(() => {
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
    });
    expect(screen.queryByText("エントリー済み（記録未登録）")).not.toBeInTheDocument();
  });

  it("大会記録が0件のとき空状態が表示される", async () => {
    renderClient([]);
    expect(screen.getByText("大会記録がありません")).toBeInTheDocument();
    // エントリー済みアイテム取得の非同期 effect が act() 外で解決しないよう待つ
    await waitFor(() => {
      expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("store リーク回帰 (useCompetitionStore は3画面共有の singleton)", () => {
    it("他画面が TabModal を開いたまま残した状態でマウントしても、mount 時に closeAll され TabModal は開かない", async () => {
      // beforeEach 実行後に、あえて「他画面 (dashboard 等) が残した」状態を再現する。
      useCompetitionStore.setState({
        isOpen: true,
        activeTab: "entry",
        editingCompetitionId: "leaked-from-other-page",
        selectedDate: new Date("2026-01-01"),
      });
      expect(useCompetitionStore.getState().isOpen).toBe(true); // 前提条件の確認

      renderClient([makeRecord()]);

      // mount 時の useLayoutEffect による closeAll() で、他画面由来の isOpen/activeTab/
      // editingCompetitionId がリセットされ、TabModal が意図せず開いた状態で描画されないこと
      expect(screen.queryByTestId("competition-tab-modal-stub")).not.toBeInTheDocument();
      expect(useCompetitionStore.getState().isOpen).toBe(false);
      expect(useCompetitionStore.getState().activeTab).toBe("competition");
      expect(useCompetitionStore.getState().editingCompetitionId).toBeNull();

      // entryOnlyItems 取得の非同期 effect が act() 外で解決しないよう待つ
      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });

    it("この画面で TabModal を開いたままアンマウントすると、離脱時に closeAll され状態がリークしない", async () => {
      const user = userEvent.setup();
      const { unmount } = renderClient([makeRecord()]);

      await user.click(screen.getByText("テスト大会"));
      await user.click(screen.getByText("詳細から大会編集"));
      expect(screen.getByTestId("competition-tab-modal-stub")).toBeInTheDocument();
      expect(useCompetitionStore.getState().isOpen).toBe(true);

      unmount();

      // アンマウント時の useLayoutEffect クリーンアップで closeAll() が呼ばれ、
      // 他画面 (dashboard/practice) に isOpen=true 等がリークしないこと
      expect(useCompetitionStore.getState().isOpen).toBe(false);
      expect(useCompetitionStore.getState().editingCompetitionId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Critical 2 実証(2026-07-22 修正): CompetitionRecordCard の日付 format に
  // isValid() ガードが入り、不正な日付文字列でもクラッシュせず "-" 表示になる。
  // ---------------------------------------------------------------------------
  describe("Critical 2 実証: 不正な大会日付でもクラッシュせず「-」表示になる", () => {
    it("competition.date が不正な文字列でもクラッシュせず、日付欄が「-」表示になる", async () => {
      expect(() =>
        renderClient([
          makeRecord({
            competition: {
              id: "comp-1",
              user_id: "user-1",
              date: "invalid-date-string",
              end_date: null,
              title: "テスト大会",
              place: "テストプール",
              pool_type: 0,
              team_id: null,
              note: null,
              created_at: "2026-07-01T00:00:00Z",
              updated_at: "2026-07-01T00:00:00Z",
            } as RecordType["competition"],
          }),
        ]),
      ).not.toThrow();

      // 大会名・記録セクション自体は正常に描画され、カードがクラッシュしていないこと
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
      // 日付欄は不正日付を "-" にフォールバックする(isValid ガード)
      const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
      expect(card.textContent).toContain("-");

      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // スマホ幅調整(2026-07-22 Sprint): 一覧セクションの全幅化+カード間隔縮小
  // ---------------------------------------------------------------------------
  describe("スマホ幅調整: 一覧セクションの全幅化(rounded-none)+左右paddingゼロ+カード間隔縮小", () => {
    it("一覧セクションのラッパーが rounded-none sm:rounded-lg を持つ(スマホ幅で角丸を無くし全幅に見せる)", async () => {
      renderClient([makeRecord()]);

      const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
      // 一覧セクションのラッパー(bg-white rounded-none sm:rounded-lg shadow)を辿る。
      // カードの祖先要素から rounded-none を持つ要素を探す。
      const sectionWrapper = card.closest(".rounded-none");
      expect(sectionWrapper).not.toBeNull();
      expect(sectionWrapper?.className).toContain("rounded-none");
      expect(sectionWrapper?.className).toContain("sm:rounded-lg");

      // エントリー済みアイテム取得の非同期 effect が act() 外で解決しないよう待つ
      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });

    it(
      "内側のカードリストラッパーが px-0 sm:px-6(スマホ幅で左右paddingゼロ=全幅)・" +
        "space-y-2 sm:space-y-3(カード間隔をスマホ幅で縮小)を持つ",
      async () => {
        renderClient([makeRecord()]);

        const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
        const listWrapper = card.parentElement;
        expect(listWrapper?.className).toContain("px-0");
        expect(listWrapper?.className).toContain("sm:px-6");
        expect(listWrapper?.className).toContain("space-y-2");
        expect(listWrapper?.className).toContain("sm:space-y-3");

        await waitFor(() => {
          expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
        });
      },
    );
  });

  // ---------------------------------------------------------------------------
  // 大会未紐付けレコード（一括ベストタイム入力等。record.competition が null）分岐
  // ---------------------------------------------------------------------------
  describe("大会未紐付けレコード（一括入力）の分岐", () => {
    it("record.competition が null の行はグレー表示になり、大会名位置に「(一括入力)」と表示される", async () => {
      renderClient([makeRecord({ competition: null, competition_id: null })]);

      const bulkCell = screen.getByText("(一括入力)");
      expect(bulkCell).toBeInTheDocument();
      expect(bulkCell.className).toContain("text-gray-400");

      // 通常の大会名テキストは表示されない
      expect(screen.queryByText("テスト大会")).not.toBeInTheDocument();

      // エントリー済みアイテム取得の非同期 effect が act() 外で解決しないよう待つ
      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });

    it("大会紐付けレコードの行は通常表示 (グレーではない) のまま退行しない", async () => {
      renderClient([makeRecord()]); // competition あり (デフォルトの makeRecord)

      const nameCell = screen.getByText("テスト大会");
      expect(nameCell.className).toContain("text-gray-900");
      expect(nameCell.className).not.toContain("text-gray-400");

      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });

    it("[分岐] record.competition が null の行をクリックすると RecordDetailModal が開く (CompetitionDetailModal ではない)", async () => {
      const user = userEvent.setup();
      renderClient([makeRecord({ competition: null, competition_id: null })]);

      await user.click(screen.getByText("(一括入力)"));

      expect(screen.getByTestId("record-standalone-modal-stub")).toBeInTheDocument();
      expect(screen.getByTestId("standalone-record-id")).toHaveTextContent("record-1");
      expect(screen.queryByTestId("competition-detail-modal-stub")).not.toBeInTheDocument();
    });

    it("[非退行] 大会紐付けレコードの行は引き続き CompetitionDetailModal (mode=record) が開く", async () => {
      const user = userEvent.setup();
      renderClient([makeRecord()]); // competition あり

      await user.click(screen.getByText("テスト大会"));

      expect(screen.getByTestId("competition-detail-modal-stub")).toBeInTheDocument();
      expect(screen.getByTestId("detail-mode")).toHaveTextContent("record");
      expect(screen.queryByTestId("record-standalone-modal-stub")).not.toBeInTheDocument();
    });

    it("[編集] 単体詳細モーダルの編集ボタンから RecordLogForm が開き、competitionId=\"\" が渡される", async () => {
      const user = userEvent.setup();
      renderClient([makeRecord({ competition: null, competition_id: null })]);

      await user.click(screen.getByText("(一括入力)"));
      await user.click(screen.getByText("単体レコードを編集"));

      const formStub = screen.getByTestId("record-log-form-stub");
      expect(formStub).toBeInTheDocument();
      expect(screen.getByTestId("record-log-form-competition-id")).toHaveTextContent("");
      expect(screen.getByTestId("record-log-form-editing-id")).toHaveTextContent("record-1");
    });

    it("[保存] RecordLogForm の保存で updateRecordMutation が呼ばれ、split times も置き換えられる", async () => {
      const user = userEvent.setup();
      mocks.updateRecordMutateAsync.mockResolvedValue({ id: "record-1" });
      mocks.replaceSplitTimesMutateAsync.mockResolvedValue([]);
      renderClient([makeRecord({ competition: null, competition_id: null })]);

      await user.click(screen.getByText("(一括入力)"));
      await user.click(screen.getByText("単体レコードを編集"));
      await user.click(screen.getByText("単体レコードを保存"));

      await waitFor(() => {
        expect(mocks.updateRecordMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "record-1",
            updates: expect.objectContaining({ style_id: 2, time: 31.0 }),
          }),
        );
      });
      expect(mocks.replaceSplitTimesMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: "record-1" }),
      );
    });

    it("[削除] 単体詳細モーダルの削除ボタンから deleteRecordMutation が呼ばれる (DeleteConfirmModal は RecordDetailModal 側で完結)", async () => {
      const user = userEvent.setup();
      mocks.deleteRecordMutateAsync.mockResolvedValue(undefined);
      renderClient([makeRecord({ competition: null, competition_id: null })]);

      await user.click(screen.getByText("(一括入力)"));
      await user.click(screen.getByText("単体レコードを削除"));

      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).toHaveBeenCalledWith("record-1");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // カラムソート機能 (2026-07-22 Sprint 再検証: テーブル/Pagination 廃止
  // → カード + SortBottomSheet + もっと見る(displayCount) に全面刷新)
  // 再検証観点: Critical 1 (種目ソート機能不全) が新カードUIでも効いているか、
  // ページング1リセットの仕様が「もっと見るのdisplayCount 20リセット」に置き換わったことを確認する。
  // ---------------------------------------------------------------------------
  describe("[V-W-CSF-07/10 再検証] カラムソート(カード + SortBottomSheet)", () => {
    // 大会記録カードの行取得ヘルパー: CompetitionRecordCard は role="button" + aria-label
    // (2026-07-22 Warning3対応: t("client.viewDetailAriaLabelWithInfo", {date, name}) =
    // "大会記録詳細を表示(07/01 テスト大会)" のように個体情報(日付+大会名)付きの動的文言に
    // なったため完全一致ではなく前方一致の正規表現で取得する。エントリー済み(記録未登録)
    // セクションは個体情報なしの旧 t("client.viewDetailAriaLabel")="大会記録詳細を表示"
    // (括弧なし)のままのため、"(" を含む前方一致にして誤ってヒットしないようにする。
    const getCardRows = (): HTMLElement[] =>
      screen.getAllByRole("button", { name: /^大会記録詳細を表示\(/ });
    const makeCompetitionRecord = (
      overrides: Partial<RecordType> & {
        competitionOverrides?: Partial<RecordType["competition"]>;
      } = {},
    ): RecordType => {
      const { competitionOverrides, ...recordOverrides } = overrides;
      return makeRecord({
        competition: {
          id: recordOverrides.competition_id || "comp-1",
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
          ...competitionOverrides,
        } as RecordType["competition"],
        ...recordOverrides,
      });
    };

    it(
      "[Critical 1 再検証・4プリセット版] 「種目(昇順)」プリセット廃止に伴い、" +
        "「記録が速い順」プリセットで日付降順の既定表示から記録(タイム)昇順へ正しく並び替わる" +
        "(旧テストは stroke 境界跨ぎの種目ソート検証だったが、種目ソート自体が本スプリントで廃止されたため、" +
        "4プリセットに残る time 軸のソートで同種の「既定順→別プリセットへの並び替えが正しく効く」ことを検証する)",
      async () => {
        const user = userEvent.setup();
        // 既定順(日付降順)では平泳ぎ大会(2月, 後日程・タイムは遅い)が先、自由形大会(1月・タイムは速い)が後になるようにする
        const freestyleRecord = makeCompetitionRecord({
          id: "record-fr",
          competition_id: "comp-fr",
          style_id: 7,
          time: 30.0,
          style: { id: 7, name_jp: "1500m自由形", distance: 1500 } as unknown as RecordType["style"],
          competitionOverrides: { id: "comp-fr", date: "2026-01-01", title: "自由形大会" },
        });
        const breaststrokeRecord = makeCompetitionRecord({
          id: "record-br",
          competition_id: "comp-br",
          style_id: 10,
          time: 90.0,
          style: { id: 10, name_jp: "100m平泳ぎ", distance: 100 } as unknown as RecordType["style"],
          competitionOverrides: { id: "comp-br", date: "2026-02-01", title: "平泳ぎ大会" },
        });

        renderClient([freestyleRecord, breaststrokeRecord]);

        // 前提条件: 既定順(日付降順)では平泳ぎ大会(2月)が先
        let rows = getCardRows();
        expect(rows[0].textContent).toContain("平泳ぎ大会");
        expect(rows[1].textContent).toContain("自由形大会");

        // SortBottomSheet を開き「記録が速い順」プリセットを選択する(旧「種目(昇順)」は廃止済み)
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        await user.click(screen.getByRole("button", { name: "記録が速い順" }));

        rows = getCardRows();
        expect(rows[0].textContent, "タイムが速い自由形大会がタイムが遅い平泳ぎ大会より先に来ていない").toContain(
          "自由形大会",
        );
        expect(rows[1].textContent).toContain("平泳ぎ大会");
      },
    );

    it(
      "[Critical 3 再検証・displayCount版] 並べ替えプリセット選択で displayCount が20にリセットされ、" +
        "もっと見るボタンが再度表示される",
      async () => {
        const user = userEvent.setup();
        const records = Array.from({ length: 25 }, (_, i) =>
          makeCompetitionRecord({
            id: `record-${i}`,
            competition_id: `comp-${i}`,
            competitionOverrides: {
              id: `comp-${i}`,
              date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
              title: `大会${i}`,
            },
          }),
        );

        renderClient(records);

        // 初期表示は20件、「もっと見る」ボタンが表示される
        expect(getCardRows()).toHaveLength(20);
        expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();

        // もっと見るを押して40件(=25件全件)表示にする
        await user.click(screen.getByRole("button", { name: "もっと見る" }));
        expect(getCardRows()).toHaveLength(25);
        expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();

        // 記録が速い順プリセットを選択(ソート変更) → displayCount が20にリセットされる
        // (旧「大会名(昇順)」は本スプリントで廃止されたため、残る4プリセットの1つで代替する)
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        await user.click(screen.getByRole("button", { name: "記録が速い順" }));

        await waitFor(() => {
          expect(getCardRows()).toHaveLength(20);
        });
        expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
      },
    );

    // 境界値(V-38/V-39/V-40): 絞り込み後の総件数と displayCount(20) の大小関係で
    // 「もっと見る」ボタンの表示有無が正しく切り替わることを確認する
    it.each([
      [19, false],
      [20, false],
      [21, true],
    ])(
      "絞り込み後の総件数が%i件のとき、もっと見るボタンの表示は%sになる",
      async (count, shouldShowButton) => {
        const records = Array.from({ length: count }, (_, i) =>
          makeCompetitionRecord({
            id: `record-${i}`,
            competition_id: `comp-${i}`,
            competitionOverrides: {
              id: `comp-${i}`,
              date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
              title: `大会${i}`,
            },
          }),
        );

        renderClient(records);

        expect(getCardRows()).toHaveLength(Math.min(count, 20));
        if (shouldShowButton) {
          expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
        } else {
          expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();
        }

        // エントリー済みアイテム取得の非同期 effect が act() 外で解決しないよう待つ
        await waitFor(() => {
          expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
        });
      },
    );
  });

  // ---------------------------------------------------------------------------
  // 絞り込みチップのトグル解除(2026-07-22 追加修正: FilterBottomSheet.tsx のみ変更)
  // single グループ(プール/種目/リレー)で選択中のチップを再クリックすると
  // 未選択(=すべて)に戻り、一覧が全件表示に戻ることを実データのフィルタリングまで
  // 通して検証する(FilterBottomSheet 単体テストは別ファイルで onChange 呼び出し
  // 引数のみ検証済みのため、ここでは Client 側の実フィルタリングロジックとの結線を確認する)。
  // ---------------------------------------------------------------------------
  describe("絞り込みチップのトグル解除(single グループ: プール)", () => {
    it("プールチップを選択→適用→再クリック→適用で未選択に戻り、一覧が全件表示に戻る(2026-07-22b: シートのドラフト化に伴い「適用」を挟む)", async () => {
      const user = userEvent.setup();
      const shortPoolRecord = makeRecord({
        id: "record-short",
        competition_id: "comp-short",
        pool_type: 0,
        competition: {
          id: "comp-short",
          user_id: "user-1",
          date: "2026-07-01",
          end_date: null,
          title: "短水路大会",
          place: "短水路プール",
          pool_type: 0,
          team_id: null,
          note: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
        } as RecordType["competition"],
      });
      const longPoolRecord = makeRecord({
        id: "record-long",
        competition_id: "comp-long",
        pool_type: 1,
        competition: {
          id: "comp-long",
          user_id: "user-1",
          date: "2026-06-01",
          end_date: null,
          title: "長水路大会",
          place: "長水路プール",
          pool_type: 1,
          team_id: null,
          note: null,
          created_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-06-01T00:00:00Z",
        } as RecordType["competition"],
      });

      renderClient([shortPoolRecord, longPoolRecord]);

      // 前提: 絞り込み前は2件とも表示される
      expect(screen.getByText("短水路大会")).toBeInTheDocument();
      expect(screen.getByText("長水路大会")).toBeInTheDocument();

      // 「絞り込み」を開いて「短水路」チップを選択し、「適用」で確定する(シートはドラフト化
      // されているため、「閉じる」だけではストアに反映されない)。大会名フィルタグループの
      // チップにも各大会名(例: "短水路大会")が表示されるため、絞り込み結果を確認する
      // 前に必ずシートを閉じてからテキストの有無を判定する(重複マッチ回避)。
      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "短水路" }));
      await user.click(screen.getByRole("button", { name: "適用" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // 短水路のみに絞り込まれる
      expect(screen.getByText("短水路大会")).toBeInTheDocument();
      expect(screen.queryByText("長水路大会")).not.toBeInTheDocument();

      // 絞り込みを再度開き、選択中の「短水路」チップを再クリック(トグル解除)→「適用」で確定する
      await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      await user.click(screen.getByRole("button", { name: "短水路" }));
      await user.click(screen.getByRole("button", { name: "適用" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // 未選択(=すべて)に戻り、一覧が全件表示に戻る
      expect(screen.getByText("短水路大会")).toBeInTheDocument();
      expect(screen.getByText("長水路大会")).toBeInTheDocument();

      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });
  });
});
