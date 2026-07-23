/**
 * PracticeClient テスト
 *
 * /practice 履歴タブの一覧本体。詳細モーダル (PracticeDetailModal) と
 * タブモーダル (PracticeTabModal) は既に個別にテスト済みの再利用コンポーネントのため
 * 薄いスタブに差し替え、PracticeClient 自身が持つ「配線」ロジック
 * (行クリック→詳細モーダル open、編集→タブモーダル open、カスケード削除判定) を検証する。
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
 *   [store リーク回帰] usePracticeStore は Dashboard/practice/competition の3画面で共有される
 *             module-level singleton。他画面で TabModal を開いたまま /practice に遷移してきた
 *             場合に isOpen=true 等が残っていないか (mount 時 closeAll)、逆にこの画面で開いたまま
 *             離脱した場合に閉じ忘れないか (unmount 時 closeAll) を検証する。
 *             ※ beforeEach の強制リセットに頼らず、各テスト内で明示的に「他画面が残した状態」を
 *             再現してから mount することがポイント (beforeEach の後に敢えて汚す)。
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

describe("PracticeClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ダッシュボードと共有の zustand ストアをテスト間でリセット
    usePracticeStore.getState().closeTabModal();
    usePracticeStore.getState().resetFilter();
    usePracticeStore.setState({ availableTags: [] });
  });

  it("[V-W-P08] 詳細モーダルを閉じると非表示になり、選択状態がリセットされる", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    // カード化(2026-07-22 Sprint)により種目("Fr")は circle 表示と同じ <div> 内で
    // 複数テキストノードに分割されるため exact match できない。行を一意に特定できる
    // 距離フォーマット文言(i18n 単一呼び出しで単一テキストノードになる)でクリックする。
    await user.click(screen.getByText("100m × 4本 × 1セット"));
    expect(screen.getByTestId("practice-detail-modal-stub")).toBeInTheDocument();

    await user.click(screen.getByText("詳細を閉じる"));
    expect(screen.queryByTestId("practice-detail-modal-stub")).not.toBeInTheDocument();
  });

  it("[V-W-P01] 行をクリックすると詳細モーダルが開き、正しい practiceId/date が渡る", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    expect(screen.queryByTestId("practice-detail-modal-stub")).not.toBeInTheDocument();

    await user.click(screen.getByText("100m × 4本 × 1セット"));

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

    await user.click(screen.getByText("100m × 4本 × 1セット"));
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

    // ログが1件だけの practice にして、削除後に残り0件になるケースを再現
    // スタブは固定で "log-a" を削除する導線しか持たないため、practice 側にも
    // ログを id="log-a" の1件だけ持たせ、削除後の残りログが実際に0件になる
    // ケースを正確に再現する
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

    await user.click(screen.getByText("100m × 4本 × 1セット"));
    await user.click(screen.getByText("ログAを削除"));

    await waitFor(() => {
      expect(mocks.deletePracticeMutateAsync).toHaveBeenCalledWith("practice-1");
    });
  });

  it("[V-W-P02] 詳細モーダルの編集導線から PracticeTabModal の practice タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    await user.click(screen.getByText("100m × 4本 × 1セット"));
    await user.click(screen.getByText("詳細から編集"));

    const tabModal = screen.getByTestId("practice-tab-modal-stub");
    expect(tabModal).toBeInTheDocument();
    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("practice");
    expect(screen.getByTestId("tab-editing-id")).toHaveTextContent("practice-1");
  });

  it("[V-W-P03] 詳細モーダルのログ編集導線から PracticeTabModal の practiceLog タブが開く", async () => {
    const user = userEvent.setup();
    renderClient([makePractice()]);

    await user.click(screen.getByText("100m × 4本 × 1セット"));
    await user.click(screen.getByText("詳細からログ編集"));

    expect(screen.getByTestId("tab-initial-tab")).toHaveTextContent("practiceLog");
  });

  it("練習記録が0件のとき空状態が表示される", () => {
    renderClient([]);
    expect(screen.getByText("練習記録がありません")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Critical 2 実証(2026-07-22 修正): PracticeLogCard の日付 format に isValid()
  // ガードが入り、不正な日付文字列でもクラッシュせず "-" 表示になる。
  // ---------------------------------------------------------------------------
  describe("Critical 2 実証: 不正な練習日付でもクラッシュせず「-」表示になる", () => {
    it("practice.date が不正な文字列でもクラッシュせず、日付欄が「-」表示になる", async () => {
      const invalidDatePractice = makePractice({ date: "invalid-date-string" });

      expect(() => renderClient([invalidDatePractice])).not.toThrow();

      // 距離フォーマット等は正常に描画され、カードがクラッシュしていないこと
      expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
      // 日付欄は不正日付を "-" にフォールバックする(isValid ガード)
      const cards = screen.getAllByRole("button", { name: /^練習詳細を表示\(/ });
      expect(cards[0].textContent).toContain("-");
    });
  });

  describe("store リーク回帰 (usePracticeStore は3画面共有の singleton)", () => {
    it("他画面が TabModal を開いたまま残した状態でマウントしても、mount 時に closeAll され TabModal は開かない", () => {
      // beforeEach 実行後に、あえて「他画面 (dashboard 等) が残した」状態を再現する。
      // beforeEach の closeTabModal() 呼び出しに検証結果を依存させないための明示的な汚染。
      usePracticeStore.setState({
        isOpen: true,
        activeTab: "practiceLog",
        editingPracticeId: "leaked-from-other-page",
        selectedDate: new Date("2026-01-01"),
      });
      expect(usePracticeStore.getState().isOpen).toBe(true); // 前提条件の確認

      renderClient([makePractice()]);

      // mount 時の useLayoutEffect による closeAll() で、他画面由来の isOpen/activeTab/
      // editingPracticeId がリセットされ、TabModal が意図せず開いた状態で描画されないこと
      expect(screen.queryByTestId("practice-tab-modal-stub")).not.toBeInTheDocument();
      expect(usePracticeStore.getState().isOpen).toBe(false);
      expect(usePracticeStore.getState().activeTab).toBe("practice");
      expect(usePracticeStore.getState().editingPracticeId).toBeNull();
    });

    it("この画面で TabModal を開いたままアンマウントすると、離脱時に closeAll され状態がリークしない", async () => {
      const user = userEvent.setup();
      const { unmount } = renderClient([makePractice()]);

      // この画面内で詳細→編集導線から TabModal を開く
      await user.click(screen.getByText("100m × 4本 × 1セット"));
      await user.click(screen.getByText("詳細から編集"));
      expect(screen.getByTestId("practice-tab-modal-stub")).toBeInTheDocument();
      expect(usePracticeStore.getState().isOpen).toBe(true);

      unmount();

      // アンマウント時の useLayoutEffect クリーンアップで closeAll() が呼ばれ、
      // 他画面 (dashboard/competition) に isOpen=true 等がリークしないこと
      expect(usePracticeStore.getState().isOpen).toBe(false);
      expect(usePracticeStore.getState().editingPracticeId).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // カラムソート機能 (2026-07-22 Sprint 再検証: テーブル/Pagination/モバイルセレクト廃止
  // → カード + SortBottomSheet + もっと見る(displayCount) に全面刷新)
  // 再検証観点: Critical 2 (距離ソートの桁あふれ) が新カードUIでも効いているか、
  // ページング1リセットの仕様が「もっと見るのdisplayCount 20リセット」に置き換わったこと、
  // 旧モバイルセレクトの代わりに SortBottomSheet のプリセット選択チェック表示が
  // 実際の sortColumn/sortOrder を反映することを確認する。
  // ---------------------------------------------------------------------------
  describe("[V-W-PSF 再検証] カラムソート(カード + SortBottomSheet)", () => {
    const makeSingleLogPractice = (overrides: {
      id: string;
      date: string;
      place: string;
      distance: number;
      repCount: number;
      setCount: number;
      style: string;
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
            style: overrides.style,
            swim_category: "Swim",
            rep_count: overrides.repCount,
            set_count: overrides.setCount,
            distance: overrides.distance,
            circle: 60,
            note: null,
            created_at: `${overrides.date}T00:00:00Z`,
            updated_at: `${overrides.date}T00:00:00Z`,
            practice_times: [],
            practice_log_tags: [],
          },
        ],
      });

    // カード一覧の行取得ヘルパー: PracticeLogCard は role="button" + aria-label を持つ。
    // (2026-07-22 Warning3対応: t("client.viewDetailAriaLabelWithInfo", {date, place, style}) =
    // "練習詳細を表示(07/01 市民プール Fr)" のように個体情報付きの動的文言になったため
    // 前方一致の正規表現で取得する。
    const getCardRows = (): HTMLElement[] =>
      screen.getAllByRole("button", { name: /^練習詳細を表示\(/ });

    it(
      "[Critical 2 再検証] 距離ヘッダークリックで、rep_count が極端に大きい行でも" +
        "distance を primary key として正しくソートされる(桁あふれしない)",
      async () => {
        const user = userEvent.setup();
        // rep_count=999 という大きな値を持たせても、distance(100) が distance(101) より
        // 優先されて先に来ることを確認する(distance*1000+rep_count のような数値合成だと
        // 100*1000+999=100999 > 101*1000+0=101000 は成立しないため一見問題なさそうに見えるが、
        // rep_count や set_count に更に大きな値が入ると容易に逆転しうる。タプル比較なら
        // distance の大小だけで確定するため、桁の選び方に依存しない)
        const practiceLow = makeSingleLogPractice({
          id: "practice-low",
          date: "2026-01-01",
          place: "低距離プール",
          distance: 100,
          repCount: 999,
          setCount: 9,
          style: "Fr",
        });
        const practiceHigh = makeSingleLogPractice({
          id: "practice-high",
          date: "2026-02-01",
          place: "高距離プール",
          distance: 101,
          repCount: 0,
          setCount: 0,
          style: "Br",
        });

        renderClient([practiceLow, practiceHigh]);

        // 前提条件: 既定順(日付降順)では高距離プール(2月)が先
        let rows = getCardRows();
        expect(rows[0].textContent).toContain("高距離プール");
        expect(rows[1].textContent).toContain("低距離プール");

        // SortBottomSheet を開き「距離(昇順)」プリセットを選択する
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        await user.click(screen.getByRole("button", { name: "距離(昇順)" }));

        rows = getCardRows();
        expect(rows[0].textContent, "distance=100 の行が distance=101 より先に来ていない").toContain(
          "低距離プール",
        );
        expect(rows[1].textContent).toContain("高距離プール");
      },
    );

    it(
      "[Critical 3 再検証・displayCount版] 並べ替えプリセット選択で displayCount が20にリセットされ、" +
        "もっと見るボタンが再度表示される",
      async () => {
        const user = userEvent.setup();
        const practices = Array.from({ length: 25 }, (_, i) =>
          makeSingleLogPractice({
            id: `practice-${i}`,
            date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
            place: `プール${i}`,
            distance: 100,
            repCount: 4,
            setCount: 1,
            style: "Fr",
          }),
        );

        renderClient(practices);

        // 初期表示は20件、「もっと見る」ボタンが表示される
        expect(getCardRows()).toHaveLength(20);
        expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();

        // もっと見るを押して40件(=25件全件)表示にする
        await user.click(screen.getByRole("button", { name: "もっと見る" }));
        expect(getCardRows()).toHaveLength(25);
        expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();

        // 並べ替えプリセットを選択(ソート変更) → displayCount が20にリセットされる
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        await user.click(screen.getByRole("button", { name: "場所(昇順)" }));

        await waitFor(() => {
          expect(getCardRows()).toHaveLength(20);
        });
        expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
      },
    );

    it(
      "[Warning 再検証・SortBottomSheet版] プリセット選択で実際の sortColumn/sortOrder が反映され、" +
        "シートを再度開くと選択中のプリセットにチェックマークが表示される(旧モバイルセレクトの代替検証)",
      async () => {
        const user = userEvent.setup();
        const practiceA = makeSingleLogPractice({
          id: "practice-a",
          date: "2026-01-01",
          place: "Aプール",
          distance: 50,
          repCount: 4,
          setCount: 1,
          style: "Fr",
        });
        const practiceB = makeSingleLogPractice({
          id: "practice-b",
          date: "2026-02-01",
          place: "Bプール",
          distance: 200,
          repCount: 2,
          setCount: 1,
          style: "Br",
        });

        renderClient([practiceA, practiceB]);

        // 初期状態: シートを開くと既定の「日付(新しい順)」にチェックマーク(svg)が付いている
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        const dateDescRow = screen.getByRole("button", { name: "日付(新しい順)" });
        expect(dateDescRow.querySelector("svg")).toBeInTheDocument();
        const distanceDescRowInitial = screen.getByRole("button", { name: "距離(降順)" });
        expect(distanceDescRowInitial.querySelector("svg")).not.toBeInTheDocument();

        // 「距離(降順)」を選択(即時反映・シートは閉じるモーション(300ms)後に unmount される)
        await user.click(screen.getByRole("button", { name: "距離(降順)" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        // 並び順に実際に反映されている(distance=200 の Bプールが先)
        let rows = getCardRows();
        expect(rows[0].textContent).toContain("Bプール");
        expect(rows[1].textContent).toContain("Aプール");

        // シートを再度開くと「距離(降順)」にチェックマークが移動し、「日付(新しい順)」は外れている
        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        expect(screen.getByRole("button", { name: "距離(降順)" }).querySelector("svg")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "日付(新しい順)" }).querySelector("svg")).not.toBeInTheDocument();

        // 「距離(昇順)」を選び直すと並び順も反転する
        await user.click(screen.getByRole("button", { name: "距離(昇順)" }));
        rows = getCardRows();
        expect(rows[0].textContent).toContain("Aプール"); // distance=50 が先(昇順)
        expect(rows[1].textContent).toContain("Bプール"); // distance=200 が後
      },
    );
  });

  // ---------------------------------------------------------------------------
  // タグフィルター (OR → AND 変更の回帰防止テスト)
  // 変更点: filteredPracticeLogs のタグ条件が `selectedTagIds.some(...)` (OR) から
  // `selectedTagIds.every((tagId) => logTagIds.includes(tagId))` (AND) に変更された。
  // 「選択した全タグを持つログのみ表示」になる。場所/種目とのカラム間 AND は従来どおり。
  // 以前この挙動(複数タグ選択時の絞り込み)を検証するテストは存在しなかった。
  // ---------------------------------------------------------------------------
  describe("タグフィルター(複数選択時は AND)", () => {
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

    // makePractice のデフォルトログ(Fr/Br)を使わず、タグ構成を明示した単一ログの
    // practice を組み立てるヘルパー(place/style で行を識別する)
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

    // 2026-07-22 Sprint(Warning2対応): 常時表示のタグピル行は撤去され、タグ絞り込みは
    // FilterBottomSheet の「タグ」グループのチップに一本化された。シートが閉じていれば
    // 「絞り込み」ボタン(絞り込み件数バッジが付くと "絞り込み1" 等になるため正規表現で
    // 部分一致させる)で開いてからチップ(tag.name)をクリックする。multi グループは
    // クリックのたびに即時反映されるがシートは自動で閉じない仕様のため、複数タグを
    // 連続選択する場合は2回目以降は開いたままチップだけクリックすればよい。
    const clickTagFilterButton = async (
      user: ReturnType<typeof userEvent.setup>,
      tagName: string,
    ) => {
      if (!screen.queryByRole("dialog")) {
        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      }
      await user.click(screen.getByRole("button", { name: tagName }));
    };

    // FilterBottomSheet は選択後も開いたままなので(適用ボタンなし即時反映の仕様)、
    // シート内の「場所」グループのチップ(place 値と同じテキスト)とカード本体の place
    // テキストが重複しないよう、絞り込み結果を確認する前に必ず「閉じる」を押して
    // 閉じてから(waitFor で unmount を待って)アサーションする(各テスト内でインライン化)。

    // カード化(2026-07-22 Sprint)によりテーブル/モバイルカードの二重描画は解消されたため、
    // 表示有無は screen.queryByText/getByText を直接使う(place はカード内で単一テキスト
    // ノードとして描画されるため exact match で一意に検索できる)。

    it("[AND] タグA・タグBの両方を選択すると、両方を持つログのみ表示され、片方だけのログは除外される", async () => {
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

      // 前提: フィルタ前は3件とも表示される
      expect(screen.getByText(/プールOnlyA/)).toBeInTheDocument();
      expect(screen.getByText(/プールOnlyB/)).toBeInTheDocument();
      expect(screen.getByText(/プールBoth/)).toBeInTheDocument();

      // タグA・タグB を両方選択
      await clickTagFilterButton(user, "タグA");
      await clickTagFilterButton(user, "タグB");
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // 両方のタグを持つ "プールBoth" のみ表示され、片方だけの行は除外される(AND)
      expect(screen.getByText(/プールBoth/)).toBeInTheDocument();
      expect(screen.queryByText(/プールOnlyA/)).not.toBeInTheDocument();
      expect(screen.queryByText(/プールOnlyB/)).not.toBeInTheDocument();
    });

    it("[単一選択] タグを1つだけ選択した場合は、そのタグを持つログが従来どおり表示される(単一選択はOR/AND同値)", async () => {
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

      // タグA のみ選択
      await clickTagFilterButton(user, "タグA");
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // タグA を持つ "プールOnlyA" と "プールBoth" は表示され、タグA を持たない "プールOnlyB" は除外される
      expect(screen.getByText(/プールOnlyA/)).toBeInTheDocument();
      expect(screen.getByText(/プールBoth/)).toBeInTheDocument();
      expect(screen.queryByText(/プールOnlyB/)).not.toBeInTheDocument();
    });

    it("[カラム間AND] タグ(AND)と場所フィルターを併用すると、両条件を満たす行のみ表示される", async () => {
      const user = userEvent.setup();
      // 両方のタグを持つログを異なる場所に2件用意する
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

      // タグA・タグBを両方選択(タグ内AND) → まだ両方の場所が表示される
      await clickTagFilterButton(user, "タグA");
      await clickTagFilterButton(user, "タグB");
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(screen.getByText(/プールX/)).toBeInTheDocument();
      expect(screen.getByText(/プールY/)).toBeInTheDocument();

      // 場所フィルターで「プールX」のみを選択(カラム間AND)。FilterBottomSheet を再度開き、
      // 「場所」グループのチップ(プールX)をクリックする(ColumnFilterDropdown 廃止に伴う置換)。
      // タグが2件アクティブなため絞り込みボタンのアクセシブルネームは件数バッジ込みで
      // "絞り込み1" になる。正規表現で部分一致させる。
      await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      await user.click(screen.getByRole("button", { name: "プールX" }));
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // タグ(AND)を満たし、かつ場所がプールXの行のみ表示される
      expect(screen.getByText(/プールX/)).toBeInTheDocument();
      expect(screen.queryByText(/プールY/)).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 絞り込みチップのトグル解除(2026-07-22 追加修正: FilterBottomSheet.tsx のみ変更)
  // single グループ(種目)で選択中のチップを再クリックすると未選択(=すべて)に戻り、
  // 一覧が全件表示に戻ることを実データのフィルタリングまで通して検証する。
  // ---------------------------------------------------------------------------
  describe("絞り込みチップのトグル解除(single グループ: 種目)", () => {
    it("種目チップを選択→再クリックで未選択に戻り、一覧が全件表示に戻る", async () => {
      const user = userEvent.setup();
      // デフォルトの makePractice() は Fr(100m×4本×1セット) / Br(50m×2本×1セット) の
      // 2ログを持つ単一 practice
      renderClient([makePractice()]);

      // 前提: 絞り込み前は2ログとも表示される
      expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
      expect(screen.getByText("50m × 2本 × 1セット")).toBeInTheDocument();

      // 「絞り込み」を開いて「自由形」チップを選択する
      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // 自由形(Fr)のみに絞り込まれる
      expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
      expect(screen.queryByText("50m × 2本 × 1セット")).not.toBeInTheDocument();

      // 絞り込みを再度開き、選択中の「自由形」チップを再クリック(トグル解除)
      await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "閉じる" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // 未選択(=すべて)に戻り、一覧が全件表示に戻る
      expect(screen.getByText("100m × 4本 × 1セット")).toBeInTheDocument();
      expect(screen.getByText("50m × 2本 × 1セット")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // スマホ幅調整(2026-07-22 Sprint: 大会一覧とのパリティ)
  // 一覧セクションの全幅化+カード間隔縮小(CompetitionClient.tsx と同一パターン)
  // ---------------------------------------------------------------------------
  describe("スマホ幅調整: 一覧セクションの全幅化(rounded-none)+左右paddingゼロ+カード間隔縮小(大会タブとのパリティ)", () => {
    it("一覧セクションのラッパーが rounded-none sm:rounded-lg を持つ(スマホ幅で角丸を無くし全幅に見せる)", async () => {
      renderClient([makePractice()]);

      // makePractice() は Fr/Br の2ログを持つため、ログ単位でカードが2枚描画される。
      // どちらも同一の一覧セクション配下にあるため先頭の1枚で検証すれば十分。
      const [card] = screen.getAllByRole("button", { name: /^練習詳細を表示\(/ });
      // 一覧セクションのラッパー(bg-white rounded-none sm:rounded-lg shadow)を辿る。
      // カードの祖先要素から rounded-none を持つ要素を探す。
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

        const [card] = screen.getAllByRole("button", { name: /^練習詳細を表示\(/ });
        const listWrapper = card.parentElement;
        expect(listWrapper?.className).toContain("px-0");
        expect(listWrapper?.className).toContain("sm:px-6");
        expect(listWrapper?.className).toContain("space-y-2");
        expect(listWrapper?.className).toContain("sm:space-y-3");
      },
    );
  });
});
