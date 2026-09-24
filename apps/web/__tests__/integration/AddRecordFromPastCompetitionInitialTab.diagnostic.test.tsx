/**
 * 診断テスト: ダッシュボードの過去大会カードから「記録を追加」を押したとき、
 * 大会タブモーダルが「レースレコード」タブで開かず「大会」タブで開いてしまう、
 * というユーザー報告 (個人大会・チーム大会の両方で発生) の層別切り分け。
 *
 * PM 仮説 (L3): CompetitionDetails.tsx のボタンは
 *   onAddRecord?.({ competitionId }); onClose?.();
 * と同期的に連続して呼ぶ。onAddRecord は competitions テーブルを await するため、
 * 「onClose が先に完走し、openTabModal が後に走る」順序になる。この順序で
 * activeTab が失われないかを実測した。
 *
 * 【実測結果 (2026-09-19)】L1/L2/L3 いずれも正しく動作しており、本テストではこの
 * 経路のバグを再現できなかった:
 *   - L1: onAddRecord (useCalendarHandlers.ts) は過去日の個人/チーム大会いずれでも
 *     openCompetitionTabModal(..., "record") を呼ぶ (実測: harness ログで
 *     activeTab=record を確認)
 *   - L2: competitionStore.openTabModal が isOpen:true/activeTab:"record" を
 *     アトミックに set する (実測: store.getState().activeTab を複数時点で確認、
 *     一度も "competition" に戻らない)
 *   - L3: CompetitionTabModal は isOpen の false→true 遷移時に initialTab prop
 *     (= store の activeTab) を正しく自身の activeTab state に反映する
 *     (実測: aria-selected を+0/10/50/100msの複数時点で確認、常に record=true)
 *   - onClose (DayDetailModal を閉じる操作) と openTabModal は実際に独立した
 *     state ツリーであり、実行順序が入れ替わっても干渉しないことを確認した
 *     (静的読解の結論が実測でも裏付けられた)
 *
 * 【重要な経緯】このテストは最初 `initialTab` prop を CompetitionTabModal に
 * 渡し忘れており (ハーネスの実装ミス)、その状態では常に "competition" が
 * 表示され「バグを再現できた」ように見えた。しかし CompetitionTabModal.tsx:162
 * の `initialTab = "competition"` というデフォルト引数によるものだと判明し、
 * 修正後は再現しなくなった。「実測できた」と早合点せず、ハーネス自体が本番の
 * 配線 (FormModals.tsx が initialTab={competitionActiveTab} を渡す) を正しく
 * 再現できているかを疑うことの重要性を示す実例でもある。
 *
 * 【結論・次に調べるべきこと】ダッシュボードのカレンダー経由 (useCalendarHandlers
 * の onAddRecord → competitionStore → CompetitionTabModal) という、ユーザー報告
 * が示す最有力経路では原因を特定できなかった。次に調べるべきは:
 *   1. ユーザーが実際にクリックしているボタンが本当にこの経路か
 *      (ブラウザでの実機確認が必要。本セッションでは Playwright MCP が
 *      利用できず未検証)
 *   2. `/competition` (履歴タブ、CompetitionClient.tsx) 側に同種だが
 *      別実装の「記録を追加」導線が無いか
 *   3. 実ブラウザの React 開発モード (StrictMode 等) 固有の二重実行や、
 *      本テストでは再現していない別のタイミング要因
 */

import React from "react";
import { act } from "react";
import { renderWithI18n as render, screen, waitFor } from "../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import { useCalendarHandlers } from "../../app/[locale]/(authenticated)/dashboard/_hooks/useCalendarHandlers";

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

let currentSupabase: { from: ReturnType<typeof vi.fn> };
vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, subscription: null, supabase: currentSupabase }),
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

/** competitions テーブルへの select().eq().single() を、実際の非同期性を保ったまま模す
 * (setTimeout でマイクロタスクより長いタイムスライスを1つ挟み、CompetitionDetails.tsx
 * の onAddRecord?.(...); onClose?.(); という同期連続呼び出しの間に、実際に
 * onClose 側の同期処理が完全に完了してから onAddRecord の続きが走ることを保証する)。 */
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
    single: () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ data: fixture, error: null }), 0);
      }),
  };
  return { from: vi.fn(() => chain) };
}

/** FormModals.tsx の大会タブモーダル部分だけを模した最小ハーネス。
 * isOpen/activeTab/editingData 等を competitionStore から直接購読し、
 * CompetitionTabModal に渡す (本番と同じ配線)。 */
function CompetitionTabModalHarness() {
  const isOpen = useCompetitionStore((s) => s.isOpen);
  const activeTab = useCompetitionStore((s) => s.activeTab);
  const editingData = useCompetitionStore((s) => s.editingData);
  const editingCompetitionId = useCompetitionStore((s) => s.editingCompetitionId);
  const selectedDate = useCompetitionStore((s) => s.selectedDate);
  const entryLocked = useCompetitionStore((s) => s.entryLocked);
  const closeTabModal = useCompetitionStore((s) => s.closeTabModal);
  const openCompetitionTabModal = useCompetitionStore((s) => s.openTabModal);
  const setEditingData = useCompetitionStore((s) => s.setEditingData);

  const [dayDetailClosed, setDayDetailClosed] = React.useState(false);

  const { onAddRecord } = useCalendarHandlers({
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
      {/* CompetitionDetails.tsx の実際のボタン (onClick={() => { onAddRecord?.({ competitionId }); onClose?.(); }})
          と同一の同期連続呼び出しパターンを再現する。onClose 相当は DayDetailModal を閉じるだけで
          competitionStore には触れない (本番同様、setDayDetailClosed のみ)。 */}
      <button
        data-testid="add-record-button"
        onClick={() => {
          onAddRecord({ competitionId: "comp-past-1" });
          setDayDetailClosed(true);
        }}
      >
        記録を追加
      </button>
      <div data-testid="day-detail-closed-flag">{dayDetailClosed ? "closed" : "open"}</div>

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
    </div>
  );
}

describe("診断: 過去大会「記録を追加」→ タブモーダルの初期選択タブ", () => {
  beforeEach(() => {
    // 各テスト間で Zustand ストアをクリーンな状態に戻す
    useCompetitionStore.getState().closeTabModal();
  });

  it(
    "[診断-個人] 個人の過去大会 (team_id なし) で「記録を追加」を押すと、" +
      "「レースレコード」タブが選択された状態でモーダルが開く",
    async () => {
      currentSupabase = makeFakeSupabase({
        team_id: null,
        date: "2020-01-01",
        title: "個人の過去大会",
        place: "",
        pool_type: 0,
        entry_status: "before",
      }) as unknown as typeof currentSupabase;

      render(<CompetitionTabModalHarness />);

      await act(async () => {
        screen.getByTestId("add-record-button").click();
      });

      // onClose 相当 (DayDetailModal を閉じる操作) が先に完走していることを確認する
      // (PM 仮説の前提: onAddRecord の await より前に onClose 側の同期処理が終わっている)
      expect(screen.getByTestId("day-detail-closed-flag").textContent).toBe("closed");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "大会" })).toBeInTheDocument();
      });

      const recordTab = screen.getByRole("tab", { name: "レースレコード" });
      const competitionTab = screen.getByRole("tab", { name: "大会" });

      expect(recordTab.getAttribute("aria-selected")).toBe("true");
      expect(competitionTab.getAttribute("aria-selected")).toBe("false");
      expect(useCompetitionStore.getState().activeTab).toBe("record");
    },
  );

  it(
    "[診断-チーム] チームの過去大会 (team_id あり, entry_status=closed) で「記録を追加」を押すと、" +
      "「レースレコード」タブが選択された状態でモーダルが開く",
    async () => {
      currentSupabase = makeFakeSupabase({
        team_id: "team-1",
        date: "2020-01-01",
        title: "チームの過去大会",
        place: "",
        pool_type: 0,
        entry_status: "closed",
      }) as unknown as typeof currentSupabase;

      render(<CompetitionTabModalHarness />);

      await act(async () => {
        screen.getByTestId("add-record-button").click();
      });

      expect(screen.getByTestId("day-detail-closed-flag").textContent).toBe("closed");

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "大会" })).toBeInTheDocument();
      });

      const recordTab = screen.getByRole("tab", { name: "レースレコード" });
      const competitionTab = screen.getByRole("tab", { name: "大会" });

      expect(recordTab.getAttribute("aria-selected")).toBe("true");
      expect(competitionTab.getAttribute("aria-selected")).toBe("false");
    },
  );
});
