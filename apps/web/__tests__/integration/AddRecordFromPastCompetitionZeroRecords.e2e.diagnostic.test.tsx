/**
 * 診断テスト (E2E に近い結線・実装ではない): ユーザーが確定させた再現条件で
 * 「記録を追加」ボタンの押下から大会タブモーダルの初期タブ選択までを、
 * モックを supabase 以外すべて排して通す。
 *
 * 確定した再現条件 (ユーザー本人の言葉):
 *   - その日に大会だけがある (エントリーも記録も無い = DayDetailModal の
 *     competitionItems 経路。entries/recordItems は空)
 *   - レースレコードが0件 (CompetitionDetails 自身の内部 fetch が actualRecords=[]
 *     を返し、actualRecords.length === 0 の「大会記録を追加」プレースホルダ
 *     ボタン (CompetitionDetails.tsx:431-437) が出る)
 *   - 押すのは大会カード内の「記録を追加」
 *   - 開いた画面は既存大会の値が入っている (editingCompetitionId が効いている
 *     = 新規作成フォームではない)
 *   - なのに大会タブが選択されている
 *   - 個人大会・チーム大会の両方で発生
 *
 * 接続範囲 (実物を使う):
 *   DayDetailModal (実物) → CompetitionDetails (実物、actualRecords=0件になる
 *   よう supabase をモック) → 「記録を追加」ボタンを実際に click →
 *   onAddRecord (実 useCalendarHandlers) → competitionStore (実物) →
 *   FormModals.tsx と同じ配線の CompetitionTabModal (実物)
 *
 * DayDetailModal 自体の open/close も、CalendarView.tsx の実際のパターン
 * (`{showDayDetail && selectedDate && <DayDetailModal .../>}`) を再現し、
 * onClose によって DayDetailModal (および内部の CompetitionDetails) が
 * 実際にアンマウントされることまで含めて検証する (PM 疑問点1)。
 *
 * PM 疑問点2 (見た目の検証): aria-selected だけでなく、実際にどのタブの
 * パネル内容が DOM に出ているかも確認する (「大会」タブの日付/場所入力欄 vs
 * 「レースレコード」タブの種目選択 UI)。
 */

import React from "react";
import { act } from "react";
import { renderWithI18n } from "../utils/render";
import { screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useCalendarHandlers } from "../../app/[locale]/(authenticated)/dashboard/_hooks/useCalendarHandlers";
import type { CalendarItem } from "@apps/shared/types/ui";

// DayDetailModal は useCalendarColorSettingsQuery (react-query) を使うため、
// 実物の QueryClientProvider で包む (react-query 自体はモックしない)。
function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderWithI18n(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));
vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));
vi.mock("@/lib/video-upload-client", () => ({
  uploadVideoClient: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@apps/shared/api", () => ({
  EntryAPI: class {
    createPersonalEntry = vi.fn();
    createTeamEntry = vi.fn();
    updateEntry = vi.fn();
  },
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
    uploadCompetitionImage = vi.fn();
    deleteCompetitionImage = vi.fn();
  },
}));
// RecordAPI (DayDetailModal.tsx が import する getPreviousBestTime 等) は
// CompetitionDetails の子 (RecordBestBadge) が使うが、records=0件のこのシナリオ
// では記録行自体が無いため実際には呼ばれない想定。念のためスタブ化する。
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getPreviousBestTime = vi.fn().mockResolvedValue(null);
  },
}));

let currentSupabase: { from: ReturnType<typeof vi.fn>; auth: { getUser: ReturnType<typeof vi.fn> } };
vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, subscription: null, supabase: currentSupabase }),
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";
import DayDetailModal from "@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/DayDetailModal";

/** CompetitionDetails (実物) が内部で行う fetch 群と、useCalendarHandlers.onAddRecord
 * の fetch を、テーブル名/select文字列で振り分けて解決する汎用チェーン。
 * competitions: 大会本体 (image_paths select と、onAddRecord の
 *   entry_status/team_id/date/title/place/pool_type select の両方をカバー)
 * records: 常に空配列 (= actualRecords.length === 0 のシナリオを固定する)
 * split_times 等その他: 空配列
 */
function makeFakeSupabase(fixture: {
  team_id: string | null;
  date: string;
  title: string;
  place: string;
  pool_type: number;
  entry_status: string;
}) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    is: () => chain,
    lt: () => chain,
    neq: () => chain,
    limit: () => chain,
    single: () =>
      new Promise((resolve) => {
        // onAddRecord の await を確実に非同期にし、onClose の同期処理が先に完走する
        // ことを保証する (CompetitionDetails.tsx の onClick パターンの実際の非同期性を模す)。
        setTimeout(
          () =>
            resolve({
              data: {
                entry_status: fixture.entry_status,
                team_id: fixture.team_id,
                date: fixture.date,
                title: fixture.title,
                place: fixture.place,
                pool_type: fixture.pool_type,
                image_paths: [],
              },
              error: null,
            }),
          0,
        );
      }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return {
    from: vi.fn(() => chain),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  };
}

/** FormModals.tsx の大会タブモーダル部分だけを模した最小ハーネス (前回の診断テストと同型)。 */
function CompetitionTabModalHarness() {
  const isOpen = useCompetitionStore((s) => s.isOpen);
  const activeTab = useCompetitionStore((s) => s.activeTab);
  const editingData = useCompetitionStore((s) => s.editingData);
  const editingCompetitionId = useCompetitionStore((s) => s.editingCompetitionId);
  const selectedDate = useCompetitionStore((s) => s.selectedDate);
  const entryLocked = useCompetitionStore((s) => s.entryLocked);
  const closeTabModal = useCompetitionStore((s) => s.closeTabModal);

  return (
    <CompetitionTabModal
      isOpen={isOpen}
      onClose={closeTabModal}
      onSave={vi.fn()}
      selectedDate={selectedDate ?? new Date()}
      editingData={editingData}
      editingCompetitionId={editingCompetitionId}
      styles={[]}
      isLoading={false}
      initialTab={activeTab}
      entryLocked={entryLocked}
    />
  );
}

/** DashboardClient.tsx / CalendarView.tsx の実配線を模した最小ハーネス。
 * FormModals (ここでは CompetitionTabModalHarness) は CalendarView/DayDetailModal の
 * 兄弟であり、showDayDetail の状態遷移とは独立にマウントされ続ける (本番と同型)。
 * openCompetitionTabModal は useCalendarHandlers に渡す実引数として
 * competitionStore.openTabModal をそのまま使う (DashboardClient.tsx:90 と同型)。 */
function DashboardHarness({ item }: { item: CalendarItem }) {
  const [showDayDetail, setShowDayDetail] = React.useState(true);
  const openCompetitionTabModal = useCompetitionStore((s) => s.openTabModal);
  const setEditingData = useCompetitionStore((s) => s.setEditingData);

  const { onAddRecord, onEditRecord, onDeleteRecord } = useCalendarHandlers({
    supabase: currentSupabase as unknown as Parameters<typeof useCalendarHandlers>[0]["supabase"],
    openPracticeTabModal: vi.fn(),
    openCompetitionTabModal,
    openEntryLogForm: vi.fn(),
    openRecordLogForm: vi.fn(),
    setSelectedDate: vi.fn(),
    setEditingData,
    setCompetitionEditingData: vi.fn(),
    handleDeleteItem: vi.fn(),
    refreshCalendar: vi.fn(),
  });

  return (
    <div>
      {/* CalendarView.tsx:335-341 と同型: onClose は showDayDetail を false にするだけ
          (setSelectedDate(null) は本テストの検証観点外のため省略)。 */}
      {showDayDetail && (
        <DayDetailModal
          isOpen={showDayDetail}
          onClose={() => setShowDayDetail(false)}
          date={new Date(item.date)}
          entries={[item]}
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          onDeleteRecord={onDeleteRecord}
        />
      )}
      {/* FormModals.tsx は CalendarView.tsx の子ではなく DashboardClient.tsx の直接の子
          (兄弟)。showDayDetail の変化と無関係に常にマウントされ続ける。 */}
      <CompetitionTabModalHarness />
    </div>
  );
}

function makeCompetitionItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "comp-past-1",
    type: "competition",
    date: "2020-01-01",
    title: "個人の過去大会",
    place: "",
    metadata: {},
    ...overrides,
  } as CalendarItem;
}

/**
 * DayDetailModal には同じ文言「大会記録を追加」のボタンが2箇所ある:
 *   1. entries.length > 0 のとき常に出る下部の「記録を追加」クイックアクション
 *      (data-testid="add-record-button"。押すと onAddItem?.(date, "record") =
 *      新規の空大会作成フォームを開く。ユーザーが言う「大会カード内」ではない)
 *   2. CompetitionDetails 自身が records=0 件のときに描画するプレースホルダ
 *      (data-testid 無し。onAddRecord?.({ competitionId }); onClose?.(); を呼ぶ。
 *      これがユーザーの言う「大会カード内の記録を追加」)
 * findByText だけでは前者に誤って一致しうるため、data-testid="add-record-button"
 * を持たない方 (= カード内側) を明示的に選ぶ。
 */
async function findCardAddRecordButton(): Promise<HTMLElement> {
  return waitFor(() => {
    const candidates = screen.getAllByText("大会記録を追加");
    const button = candidates
      .map((el) => el.closest("button"))
      .find((btn): btn is HTMLButtonElement => !!btn && !btn.hasAttribute("data-testid"));
    if (!button) throw new Error("カード内の「大会記録を追加」ボタンが見つからない");
    return button;
  });
}

describe("診断E2E: 大会だけ・記録0件の過去大会で「記録を追加」を押したときの初期タブ", () => {
  beforeEach(() => {
    useCompetitionStore.getState().closeTabModal();
  });

  it(
    "[診断E2E-個人] 個人の過去大会・記録0件で大会カード内の「記録を追加」を押すと、" +
      "DayDetailModal が閉じた後も大会タブモーダルは「レースレコード」タブの内容で開く",
    async () => {
      currentSupabase = makeFakeSupabase({
        team_id: null,
        date: "2020-01-01",
        title: "個人の過去大会",
        place: "",
        pool_type: 0,
        entry_status: "before",
      }) as unknown as typeof currentSupabase;

      render(<DashboardHarness item={makeCompetitionItem()} />);

      // CompetitionDetails 自身の内部 fetch が完了し、records=0件の
      // プレースホルダボタンが表示されるまで待つ。
      const addRecordButton = await findCardAddRecordButton();

      await act(async () => {
        addRecordButton.click();
      });

      // DayDetailModal (および内部の CompetitionDetails) が実際にアンマウントされたことを確認する
      // (PM 疑問点1: onClose によるアンマウントが競合しないか)。
      await waitFor(() => {
        expect(screen.queryByText("大会記録を追加")).toBeNull();
      });

      // 大会タブモーダルが開き、既存大会の値 (editingCompetitionId 経由) で
      // 初期化されていることを確認する (新規作成フォームではないこと)。
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "大会" })).toBeInTheDocument();
      });

      const recordTab = screen.getByRole("tab", { name: "レースレコード" });
      const competitionTab = screen.getByRole("tab", { name: "大会" });

      // aria-selected だけでなく、実際にどちらのタブの内容が DOM に出ているかも見る
      // (PM 疑問点2: 見た目が大会タブのままではないか)。
      // 大会タブのパネルには「開催日」ラベル、レコードタブには種目選択 UI が出る想定。
      const recordLogStub = screen.queryByTestId("record-log-entry-stub");

      expect(recordTab.getAttribute("aria-selected")).toBe("true");
      expect(competitionTab.getAttribute("aria-selected")).toBe("false");
      expect(recordLogStub).not.toBeNull();
      expect(useCompetitionStore.getState().activeTab).toBe("record");
      expect(useCompetitionStore.getState().editingCompetitionId).toBe("comp-past-1");
    },
  );

  it(
    "[診断E2E-チーム] チームの過去大会・記録0件で大会カード内の「記録を追加」を押しても、" +
      "同様に「レースレコード」タブの内容で開く",
    async () => {
      currentSupabase = makeFakeSupabase({
        team_id: "team-1",
        date: "2020-01-01",
        title: "チームの過去大会",
        place: "",
        pool_type: 0,
        entry_status: "closed",
      }) as unknown as typeof currentSupabase;

      render(
        <DashboardHarness
          item={makeCompetitionItem({
            id: "comp-past-team-1",
            type: "team_competition",
            title: "チームの過去大会",
          })}
        />,
      );

      const addRecordButton = await findCardAddRecordButton();

      await act(async () => {
        addRecordButton.click();
      });

      await waitFor(() => {
        expect(screen.queryByText("大会記録を追加")).toBeNull();
      });

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "大会" })).toBeInTheDocument();
      });

      const recordTab = screen.getByRole("tab", { name: "レースレコード" });
      const competitionTab = screen.getByRole("tab", { name: "大会" });
      const recordLogStub = screen.queryByTestId("record-log-entry-stub");

      expect(recordTab.getAttribute("aria-selected")).toBe("true");
      expect(competitionTab.getAttribute("aria-selected")).toBe("false");
      expect(recordLogStub).not.toBeNull();
      expect(useCompetitionStore.getState().activeTab).toBe("record");
      expect(useCompetitionStore.getState().editingCompetitionId).toBe("comp-past-team-1");
    },
  );
});
