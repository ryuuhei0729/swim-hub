/**
 * PracticeClient テスト
 *
 * /practice 履歴タブの一覧本体。詳細モーダル (PracticeDetailModal) と
 * タブモーダル (PracticeTabModal) は既に個別にテスト済みの再利用コンポーネントのため
 * 薄いスタブに差し替え、PracticeClient 自身が持つ「配線」ロジック
 * (行クリック→詳細モーダル open、編集→タブモーダル open、カスケード削除判定) を検証する。
 *
 * 2026-07-23 Sprint (day-level 化) 再検証: 1練習ログ=1カード(log-level)から
 * 1練習日(=1 practice)=1カード(day-level)に刷新されたことに伴い、
 * 「同一 practice に複数ログを持たせて複数カードを期待する」前提のテストを全面的に
 * day-level 前提に書き換えた(Web Developer 申し送り: 旧版はここで14件 FAIL していた)。
 * distance/circle/style/avgTime のソートプリセットは廃止されたため、それらに依存する
 * テストは date/place の2列に置き換えた。tags の ANY-log-exists 判定・draft/apply の
 * 深い検証は `PracticeClient.filterSort.test.tsx` に分離した(このファイルは配線の非退行に集中する)。
 *
 * 2026-07-28 更新 (C-3: 全ログ展開): 上記の「day-level カードは先頭ログのみ表示」は
 * ユーザー判断（「1つの練習に2つの練習ログが登録されていた場合、どちらも表示させたい」）
 * により撤回され、1カード内で practice_logs 全件を表示する方式に変わった。
 * [V-WP-01/02] のうち「1 practice = 1 カード」は不変(day-level のカード単位は維持)だが、
 * 「先頭ログのみ表示」の部分は反転したため、該当テストを全ログ表示前提に書き換えた。
 *
 * Sprint Contract 検証観点:
 *   [V-W-P01] 行クリックで詳細モーダルが開き、正しい practiceId/date が渡る
 *   [V-W-P07] シェアボタンのクリックは行クリック(詳細モーダルopen)を発火させない (stopPropagation)
 *   [V-W-P09] 一覧行に旧来のインライン編集/削除ボタンは存在しない (共有アクションはシェアボタンのみ)
 *   [V-W-P05] 練習ログを削除し、同じ practice の残りログが 0 件になった場合、
 *             親 practice も自動的にカスケード削除される
 *   [V-W-P06] 練習ログを削除しても同じ practice に他のログが残る場合、親 practice は削除されない
 *   [V-W-P02] 詳細モーダルの onEditPractice から PracticeTabModal の practice タブが開く
 *   [V-W-P03] 詳細モーダルの onOpenPracticeLogTab から PracticeTabModal の practiceLog タブが開く
 *   [V-WP-01] day-level カード化: 1 practice = 1 カード
 *   [V-26] 1カード内に practice_logs 全件(先頭ログ以外も含む)が表示される
 *   [V-WP-04] ソートプリセットは date/place の4択のみ(distance/circle/style/avgTime は表示されない)
 *   [store リーク回帰] usePracticeStore は Dashboard/practice/competition の3画面で共有される
 *             module-level singleton。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeWithLogs, PracticeTag, Style } from "@apps/shared/types";
import { usePracticeStore } from "@/stores/practice/practiceStore";

// -----------------------------------------------------------------------
// vi.hoisted — モック関数の巻き上げ対策
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  usePracticesQuery: vi.fn(),
  deletePracticeLogMutateAsync: vi.fn(),
  deletePracticeMutateAsync: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: mocks.usePracticesQuery,
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({
    mutateAsync: mocks.deletePracticeMutateAsync,
    isPending: false,
  }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeLogMutation: () => ({
    mutateAsync: mocks.deletePracticeLogMutateAsync,
    isPending: false,
  }),
  useCreatePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/forms/PracticeTabModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    initialTab?: string;
    editingPracticeId?: string | null;
  }) =>
    props.isOpen ? (
      <div data-testid="practice-tab-modal-stub">
        <span data-testid="tab-initial-tab">{props.initialTab}</span>
        <span data-testid="tab-editing-id">{props.editingPracticeId ?? ""}</span>
      </div>
    ) : null,
}));

vi.mock("@/app/[locale]/(authenticated)/practice/_components/PracticeDetailModal", () => ({
  __esModule: true,
  default: (props: {
    isOpen: boolean;
    practiceId: string;
    date: string;
    onEditPractice: () => void;
    onOpenPracticeLogTab: () => void;
    onDeletePracticeLog: (logId: string) => void;
    onClose: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="practice-detail-modal-stub">
        <span data-testid="detail-practice-id">{props.practiceId}</span>
        <span data-testid="detail-date">{props.date}</span>
        <button onClick={() => props.onEditPractice()}>詳細から編集</button>
        <button onClick={() => props.onOpenPracticeLogTab()}>詳細からログ編集</button>
        <button onClick={() => props.onDeletePracticeLog("log-a")}>ログAを削除</button>
        <button onClick={() => props.onDeletePracticeLog("log-b")}>ログBを削除</button>
        <button onClick={() => props.onClose()}>詳細を閉じる</button>
      </div>
    ) : null,
}));

import PracticeClient from "../PracticeClient";

const makePractice = (overrides: Partial<PracticeWithLogs> = {}): PracticeWithLogs =>
  ({
    id: "practice-1",
    user_id: "user-1",
    date: "2026-07-01",
    title: null,
    place: "市民プール",
    note: null,
    team_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    practice_logs: [
      {
        id: "log-a",
        user_id: "user-1",
        practice_id: "practice-1",
        style: "Fr",
        swim_category: "Swim",
        rep_count: 4,
        set_count: 1,
        distance: 100,
        circle: 90,
        note: null,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        practice_times: [],
        practice_log_tags: [],
      },
      {
        id: "log-b",
        user_id: "user-1",
        practice_id: "practice-1",
        style: "Br",
        swim_category: "Swim",
        rep_count: 2,
        set_count: 1,
        distance: 50,
        circle: 60,
        note: null,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
        practice_times: [],
        practice_log_tags: [],
      },
    ],
    ...overrides,
  }) as PracticeWithLogs;

const renderClient = (practices: PracticeWithLogs[], tags: PracticeTag[] = []) => {
  mocks.usePracticesQuery.mockReturnValue({
    data: practices,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <PracticeClient styles={[] as Style[]} tags={tags} />
    </NextIntlClientProvider>,
  );
};

// day-level カードの行取得ヘルパー: PracticeCard は role="button" + aria-label
// ("練習詳細を表示(07/01 市民プール Fr)" のように個体情報付きの動的文言)を持つ
const getCardRows = (): HTMLElement[] => screen.queryAllByRole("button", { name: /^練習詳細を表示\(/ });

// 絞り込みシートの「場所」グループには各場所と同じ文字列のチップが並ぶため、
// シートが開いたまま(または閉じるアニメーション中)の状態で screen.getByText(place) を
// 使うと二重ヒットする。カード行(role="button" + aria-label)側のみに絞って場所の
// 有無を判定する(CompetitionClient.filterSort.test.tsx の cardHasTitle と同型)。
const cardHasPlace = (place: string): boolean =>
  getCardRows().some((row) => row.textContent?.includes(place));

describe("PracticeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ダッシュボードと共有の zustand ストアをテスト間でリセット
    usePracticeStore.getState().closeTabModal();
    usePracticeStore.getState().resetFilter();
    usePracticeStore.setState({ availableTags: [] });
  });

  it(
    "[V-WP-01][2026-08-01 log-level 化] 1 practice に2件のログがあると、カードは2枚に" +
      "分かれて描画され、それぞれのログの内容が別々のカードに表示される",
    () => {
      renderClient([makePractice()]);

      const cards = getCardRows();
      expect(cards).toHaveLength(2);
      expect(cards.filter((card) => card.textContent?.includes("100m × 4本 × 1セット"))).toHaveLength(1);
      expect(cards.filter((card) => card.textContent?.includes("50m × 2本 × 1セット"))).toHaveLength(1);
    },
  );

  it("[V-W-P08] 詳細モーダルを閉じると非表示になり、選択状態がリセットされる", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    await user.click(getCardRows()[0]);
    expect(screen.getByTestId("practice-detail-modal-stub")).toBeInTheDocument();

    await user.click(screen.getByText("詳細を閉じる"));
    expect(screen.queryByTestId("practice-detail-modal-stub")).not.toBeInTheDocument();
  });

  it("[V-W-P01] 行をクリックすると詳細モーダルが開き、正しい practiceId/date が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    expect(screen.queryByTestId("practice-detail-modal-stub")).not.toBeInTheDocument();

    await user.click(getCardRows()[0]);

    const modal = screen.getByTestId("practice-detail-modal-stub");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("detail-practice-id")).toHaveTextContent("practice-1");
    expect(screen.getByTestId("detail-date")).toHaveTextContent("2026-07-01");
  });

  it("[V-W-P07] 一覧行にシェアボタンが存在しない", () => {
    renderClient([makePractice()]);

    expect(screen.queryByText("シェア")).not.toBeInTheDocument();
  });

  it("[V-W-P09] 一覧行に旧来のインライン編集・削除ボタンが存在しない", () => {
    renderClient([makePractice()]);

    expect(screen.queryByRole("button", { name: /^編集$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^削除$/ })).not.toBeInTheDocument();
  });

  it("[V-W-P06] 残りログが1件以上ある場合、ログ削除しても親 practice は削除されない", async () => {
    const user = userEvent.setup();
    mocks.deletePracticeLogMutateAsync.mockResolvedValue(undefined);
    renderClient([makePractice()]);

    await user.click(getCardRows()[0]);
    await user.click(screen.getByText("ログAを削除"));

    await waitFor(() => {
      expect(mocks.deletePracticeLogMutateAsync).toHaveBeenCalledWith("log-a");
    });
    // log-b が残っているのでカスケード削除は発火しない
    expect(mocks.deletePracticeMutateAsync).not.toHaveBeenCalled();
  });

  it("[V-W-P05] 残りログが0件になる場合、親 practice がカスケード削除される", async () => {
    const user = userEvent.setup();
    mocks.deletePracticeLogMutateAsync.mockResolvedValue(undefined);
    mocks.deletePracticeMutateAsync.mockResolvedValue(undefined);

    const singleLogPractice = makePractice({
      practice_logs: [
        {
          id: "log-a",
          user_id: "user-1",
          practice_id: "practice-1",
          style: "Fr",
          swim_category: "Swim",
          rep_count: 4,
          set_count: 1,
          distance: 100,
          circle: 90,
          note: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          practice_times: [],
          practice_log_tags: [],
        },
      ],
    });

    renderClient([singleLogPractice]);

    await user.click(getCardRows()[0]);
    await user.click(screen.getByText("ログAを削除"));

    await waitFor(() => {
      expect(mocks.deletePracticeMutateAsync).toHaveBeenCalledWith("practice-1");
    });
  });

  it("[V-W-P02] 詳細モーダルの編集導線から PracticeTabModal の practice タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    await user.click(getCardRows()[0]);
    await user.click(screen.getByText("詳細から編集"));

    const tabModal = screen.getByTestId("practice-tab-modal-stub");
    expect(tabModal).toBeInTheDocument();
    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("practice");
    expect(screen.getByTestId("tab-editing-id")).toHaveTextContent("practice-1");
  });

  it("[V-W-P03] 詳細モーダルのログ編集導線から PracticeTabModal の practiceLog タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    await user.click(getCardRows()[0]);
    await user.click(screen.getByText("詳細からログ編集"));

    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("practiceLog");
  });

  it("練習記録が0件のとき空状態が表示される", () => {
    renderClient([]);
    expect(screen.getByText("練習記録がありません")).toBeInTheDocument();
  });

  describe("不正な練習日付でもクラッシュせず「-」表示になる", () => {
    it("practice.date が不正な文字列でもクラッシュせず、日付欄が「-」表示になる", async () => {
      const invalidDatePractice = makePractice({ date: "invalid-date-string" });

      expect(() => renderClient([invalidDatePractice])).not.toThrow();

      expect(screen.getByText(/100m × 4本 × 1セット/)).toBeInTheDocument();
      const cards = getCardRows();
      expect(cards[0].textContent).toContain("-");
    });
  });

  describe("store リーク回帰 (usePracticeStore は3画面共有の singleton)", () => {
    it("他画面が TabModal を開いたまま残した状態でマウントしても、mount 時に closeAll され TabModal は開かない", () => {
      usePracticeStore.setState({
        isOpen: true,
        activeTab: "practiceLog",
        editingPracticeId: "leaked-from-other-page",
        selectedDate: new Date("2026-01-01"),
      });
      expect(usePracticeStore.getState().isOpen).toBe(true);

      renderClient([makePractice()]);

      expect(screen.queryByTestId("practice-tab-modal-stub")).not.toBeInTheDocument();
      expect(usePracticeStore.getState().isOpen).toBe(false);
      expect(usePracticeStore.getState().activeTab).toBe("practice");
      expect(usePracticeStore.getState().editingPracticeId).toBeNull();
    });

    it("この画面で TabModal を開いたままアンマウントすると、離脱時に closeAll され状態がリークしない", async () => {
      const user = userEvent.setup();
      const { unmount } = renderClient([makePractice()]);

      await user.click(getCardRows()[0]);
      await user.click(screen.getByText("詳細から編集"));
      expect(screen.getByTestId("practice-tab-modal-stub")).toBeInTheDocument();
      expect(usePracticeStore.getState().isOpen).toBe(true);

      unmount();

      expect(usePracticeStore.getState().isOpen).toBe(false);
      expect(usePracticeStore.getState().editingPracticeId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // カラムソート機能 (2026-07-23 Sprint 再検証: day-level 化により distance/circle/style/
  // avgTime のプリセットが廃止され、date/place の4択のみになった)
  // ---------------------------------------------------------------------------
  describe("[V-WP-04/05/06 再検証] カラムソート(day-level, date/placeのみ)", () => {
    const makeSingleLogPracticeDay = (overrides: {
      id: string;
      date: string;
      place: string | null;
    }): PracticeWithLogs =>
      makePractice({
        id: overrides.id,
        date: overrides.date,
        place: overrides.place,
        practice_logs: [
          {
            id: `${overrides.id}-log`,
            user_id: "user-1",
            practice_id: overrides.id,
            style: "Fr",
            swim_category: "Swim",
            rep_count: 4,
            set_count: 1,
            distance: 100,
            circle: 60,
            note: null,
            created_at: `${overrides.date}T00:00:00Z`,
            updated_at: `${overrides.date}T00:00:00Z`,
            practice_times: [],
            practice_log_tags: [],
          },
        ],
      });

    it("[V-WP-04] 並べ替えシートに date/place の4項目のみが表示され、旧 distance/circle/style/avgTime のプリセットは表示されない", async () => {
      const user = userEvent.setup();
      renderClient([makeSingleLogPracticeDay({ id: "p1", date: "2026-01-01", place: "テストプール" })]);

      await user.click(screen.getByRole("button", { name: "並べ替え" }));

      const dialog = screen.getByRole("dialog");
      expect(screen.getByRole("button", { name: "日付(新しい順)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "日付(古い順)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "場所(昇順)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "場所(降順)" })).toBeInTheDocument();

      expect(dialog).not.toHaveTextContent("距離(昇順)");
      expect(dialog).not.toHaveTextContent("サークル(昇順)");
      expect(dialog).not.toHaveTextContent("種目(昇順)");
      expect(dialog).not.toHaveTextContent("平均タイム");
    });

    it("[V-WP-05] 「場所(昇順)」を選択すると一覧が place 昇順に再描画される", async () => {
      const user = userEvent.setup();
      const practiceA = makeSingleLogPracticeDay({ id: "p-a", date: "2026-01-01", place: "Aプール" });
      const practiceB = makeSingleLogPracticeDay({ id: "p-b", date: "2026-02-01", place: "Bプール" });
      renderClient([practiceB, practiceA]);

      // 既定(日付新しい順)では2月のBプールが先
      let rows = getCardRows();
      expect(rows[0].textContent).toContain("Bプール");

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "場所(昇順)" }));

      rows = getCardRows();
      expect(rows[0].textContent).toContain("Aプール");
      expect(rows[1].textContent).toContain("Bプール");
    });

    it("[V-WP-06] place が未設定(null)の日は、場所ソートの昇順・降順いずれでも末尾固定される", async () => {
      const user = userEvent.setup();
      const withPlace = makeSingleLogPracticeDay({ id: "p-has", date: "2026-01-01", place: "設定済みプール" });
      const withoutPlace = makeSingleLogPracticeDay({ id: "p-none", date: "2026-01-02", place: null });
      renderClient([withPlace, withoutPlace]);

      // place が未設定の場合、PracticeCard は場所の <span> 自体を描画しない(aria-label の
      // 内部表現でのみ "-" になる)。そのため可視テキストではなく、どちらの practice が
      // 末尾に来ているか(date で判別)を確認する。
      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "場所(昇順)" }));
      let rows = getCardRows();
      expect(rows[rows.length - 1].textContent).toContain("2026/01/02"); // place=null の日
      expect(rows[0].textContent).toContain("2026/01/01");

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "場所(降順)" }));
      rows = getCardRows();
      expect(rows[rows.length - 1].textContent).toContain("2026/01/02"); // desc でも末尾のまま
      expect(rows[0].textContent).toContain("2026/01/01");
    });

    it("並べ替えプリセット選択で displayCount が20にリセットされ、もっと見るボタンが再度表示される", async () => {
      const user = userEvent.setup();
      const practices = Array.from({ length: 25 }, (_, i) =>
        makeSingleLogPracticeDay({
          id: `practice-${i}`,
          date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          place: `プール${i}`,
        }),
      );

      renderClient(practices);

      expect(getCardRows()).toHaveLength(20);
      expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "もっと見る" }));
      expect(getCardRows()).toHaveLength(25);
      expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "場所(昇順)" }));

      await waitFor(() => {
        expect(getCardRows()).toHaveLength(20);
      });
      expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
    });

    it("プリセット選択で実際の sortColumn/sortOrder が反映され、シートを再度開くと選択中のプリセットにチェックマークが表示される", async () => {
      const user = userEvent.setup();
      const practiceA = makeSingleLogPracticeDay({ id: "practice-a", date: "2026-01-01", place: "Aプール" });
      const practiceB = makeSingleLogPracticeDay({ id: "practice-b", date: "2026-02-01", place: "Bプール" });

      renderClient([practiceA, practiceB]);

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      const dateDescRow = screen.getByRole("button", { name: "日付(新しい順)" });
      expect(dateDescRow.querySelector("svg")).toBeInTheDocument();
      const placeDescRowInitial = screen.getByRole("button", { name: "場所(降順)" });
      expect(placeDescRowInitial.querySelector("svg")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "場所(降順)" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      let rows = getCardRows();
      expect(rows[0].textContent).toContain("Bプール");
      expect(rows[1].textContent).toContain("Aプール");

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      expect(screen.getByRole("button", { name: "場所(降順)" }).querySelector("svg")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "日付(新しい順)" }).querySelector("svg")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "場所(昇順)" }));
      rows = getCardRows();
      expect(rows[0].textContent).toContain("Aプール");
      expect(rows[1].textContent).toContain("Bプール");
    });
  });

  // ---------------------------------------------------------------------------
  // タグフィルター(複数選択時はAND)。各 practice は1ログのみのため、day-level 化後も
  // 「1ログ内でAND」の判定と結果は log-level 時代と同一になる(day-level 固有の
  // OR-exists across logs の検証は PracticeClient.filterSort.test.tsx に分離)
  // ---------------------------------------------------------------------------
  describe("タグフィルター(複数選択時は AND、単一ログ practice での非退行)", () => {
    const tagA: PracticeTag = {
      id: "tag-a",
      user_id: "user-1",
      name: "タグA",
      color: "#111111",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const tagB: PracticeTag = {
      id: "tag-b",
      user_id: "user-1",
      name: "タグB",
      color: "#222222",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const makeTaggedPractice = (overrides: {
      id: string;
      place: string;
      style: string;
      tags: PracticeTag[];
    }): PracticeWithLogs =>
      makePractice({
        id: overrides.id,
        date: "2026-01-01",
        place: overrides.place,
        practice_logs: [
          {
            id: `${overrides.id}-log`,
            user_id: "user-1",
            practice_id: overrides.id,
            style: overrides.style,
            swim_category: "Swim",
            rep_count: 4,
            set_count: 1,
            distance: 100,
            circle: 60,
            note: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            practice_times: [],
            practice_log_tags: overrides.tags.map((tag) => ({
              practice_tag_id: tag.id,
              practice_tags: tag,
            })),
          },
        ],
      });

    const clickTagFilterButton = async (
      user: ReturnType<typeof userEvent.setup>,
      tagName: string,
    ) => {
      if (!screen.queryByRole("dialog")) {
        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      }
      await user.click(screen.getByRole("button", { name: tagName }));
    };

    it("[AND] タグA・タグBの両方を選択して適用すると、両方を持つ日のみ表示され、片方だけの日は除外される", async () => {
      const user = userEvent.setup();
      const practiceOnlyA = makeTaggedPractice({
        id: "practice-only-a",
        place: "プールOnlyA",
        style: "Fr",
        tags: [tagA],
      });
      const practiceOnlyB = makeTaggedPractice({
        id: "practice-only-b",
        place: "プールOnlyB",
        style: "Fr",
        tags: [tagB],
      });
      const practiceBoth = makeTaggedPractice({
        id: "practice-both",
        place: "プールBoth",
        style: "Fr",
        tags: [tagA, tagB],
      });

      renderClient([practiceOnlyA, practiceOnlyB, practiceBoth], [tagA, tagB]);

      expect(cardHasPlace("プールOnlyA")).toBe(true);
      expect(cardHasPlace("プールOnlyB")).toBe(true);
      expect(cardHasPlace("プールBoth")).toBe(true);

      await clickTagFilterButton(user, "タグA");
      await clickTagFilterButton(user, "タグB");
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("プールBoth")).toBe(true);
      expect(cardHasPlace("プールOnlyA")).toBe(false);
      expect(cardHasPlace("プールOnlyB")).toBe(false);
    });

    it("[単一選択] タグを1つだけ選択して適用した場合は、そのタグを持つ日が従来どおり表示される", async () => {
      const user = userEvent.setup();
      const practiceOnlyA = makeTaggedPractice({
        id: "practice-only-a",
        place: "プールOnlyA",
        style: "Fr",
        tags: [tagA],
      });
      const practiceOnlyB = makeTaggedPractice({
        id: "practice-only-b",
        place: "プールOnlyB",
        style: "Fr",
        tags: [tagB],
      });
      const practiceBoth = makeTaggedPractice({
        id: "practice-both",
        place: "プールBoth",
        style: "Fr",
        tags: [tagA, tagB],
      });

      renderClient([practiceOnlyA, practiceOnlyB, practiceBoth], [tagA, tagB]);

      await clickTagFilterButton(user, "タグA");
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("プールOnlyA")).toBe(true);
      expect(cardHasPlace("プールBoth")).toBe(true);
      expect(cardHasPlace("プールOnlyB")).toBe(false);
    });

    it("[カラム間AND] タグ(AND)と場所フィルターを併用すると、両条件を満たす日のみ表示される", async () => {
      const user = userEvent.setup();
      const comboAtPoolX = makeTaggedPractice({
        id: "practice-combo-x",
        place: "プールX",
        style: "Fr",
        tags: [tagA, tagB],
      });
      const comboAtPoolY = makeTaggedPractice({
        id: "practice-combo-y",
        place: "プールY",
        style: "Fr",
        tags: [tagA, tagB],
      });

      renderClient([comboAtPoolX, comboAtPoolY], [tagA, tagB]);

      await clickTagFilterButton(user, "タグA");
      await clickTagFilterButton(user, "タグB");
      await user.click(screen.getByRole("button", { name: "プールX" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("プールX")).toBe(true);
      expect(cardHasPlace("プールY")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 絞り込みチップのトグル解除(single グループ: 種目)
  // day-level 化により、1 practice=1カード=先頭ログのみ表示となったため、旧テスト
  // (「1つの practice に Fr/Br 2ログを持たせ、フィルタで片方の“行”が消える」)は
  // 前提が成立しない(2件目のログはフィルタ前から非表示のため)。
  // 種目フィルタは ANY-log-match(その日のいずれかのログが一致すれば日全体を表示)なので、
  // 「異なる種目の日を2つ用意し、種目フィルタでどちらかの日が非表示になる」形に書き換える。
  // ---------------------------------------------------------------------------
  describe("絞り込みチップのトグル解除(single グループ: 種目、day-level)", () => {
    const makeStylePractice = (id: string, place: string, style: string): PracticeWithLogs =>
      makePractice({
        id,
        date: "2026-01-01",
        place,
        practice_logs: [
          {
            id: `${id}-log`,
            user_id: "user-1",
            practice_id: id,
            style,
            swim_category: "Swim",
            rep_count: 4,
            set_count: 1,
            distance: 100,
            circle: 60,
            note: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            practice_times: [],
            practice_log_tags: [],
          },
        ],
      });

    it("種目チップを選択して適用→再選択して適用で未選択に戻り、一覧が全件表示に戻る", async () => {
      const user = userEvent.setup();
      const freestyleDay = makeStylePractice("p-fr", "自由形プール", "Fr");
      const breastDay = makeStylePractice("p-br", "平泳ぎプール", "Br");
      renderClient([freestyleDay, breastDay]);

      expect(cardHasPlace("自由形プール")).toBe(true);
      expect(cardHasPlace("平泳ぎプール")).toBe(true);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("自由形プール")).toBe(true);
      expect(cardHasPlace("平泳ぎプール")).toBe(false);

      // 絞り込みを再度開き、選択中の「自由形」チップを再クリック(トグル解除)して適用
      await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("自由形プール")).toBe(true);
      expect(cardHasPlace("平泳ぎプール")).toBe(true);
    });
  });

  describe("スマホ幅調整: 一覧セクションの全幅化(rounded-none)+左右paddingゼロ+カード間隔縮小(大会タブとのパリティ)", () => {
    it("一覧セクションのラッパーが rounded-none sm:rounded-lg を持つ(スマホ幅で角丸を無くし全幅に見せる)", async () => {
      renderClient([makePractice()]);

      const [card] = getCardRows();
      const sectionWrapper = card.closest(".rounded-none");
      expect(sectionWrapper).not.toBeNull();
      expect(sectionWrapper?.className).toContain("rounded-none");
      expect(sectionWrapper?.className).toContain("sm:rounded-lg");
    });

    it(
      "内側のカードリストラッパーが px-0 sm:px-6(スマホ幅で左右paddingゼロ=全幅)・" +
        "space-y-2 sm:space-y-3(カード間隔をスマホ幅で縮小)を持つ",
      () => {
        renderClient([makePractice()]);

        const [card] = getCardRows();
        const listWrapper = card.parentElement;
        expect(listWrapper?.className).toContain("px-0");
        expect(listWrapper?.className).toContain("sm:px-6");
        expect(listWrapper?.className).toContain("space-y-2");
        expect(listWrapper?.className).toContain("sm:space-y-3");
      },
    );
  });
});
