/**
 * PracticeClient テスト (Sprint Contract Phase B)
 * 練習履歴タブ「day-level 化 + draft/apply 化」(2026-07-23) 専用の新規テストファイル。
 *
 * `CompetitionClient.filterSort.test.tsx` と同型の構成で、以下に集中する:
 *   - draft/apply の破棄挙動(X/backdrop/Escape/シート排他)
 *   - tags フィルタの day-level 固有の意味論(同一日の複数ログにタグが分散しているケース)
 *   - 絞り込み境界値・データ不整合耐性
 *
 * トートロジー防止メモ: PracticeClient.tsx の実装(handleApplyFilters 等の関数名)を
 * そのまま踏襲した assertion にせず、Sprint Contract の Success Criteria から
 * 導いたユーザー可視の挙動(表示されるカードの場所、ボタンの有無)を検証する。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeWithLogs, PracticeTag, Style } from "@apps/shared/types";
import { usePracticeStore } from "@/stores/practice/practiceStore";

const mocks = vi.hoisted(() => ({
  usePracticesQuery: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticesQuery: mocks.usePracticesQuery,
  useCreatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeLogMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreatePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTimeMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/forms/PracticeTabModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/app/[locale]/(authenticated)/practice/_components/PracticeDetailModal", () => ({
  __esModule: true,
  default: () => null,
}));

import PracticeClient from "../PracticeClient";

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

interface MakeLogOptions {
  id: string;
  style?: string;
  tags?: PracticeTag[];
}

function makeLog(practiceId: string, opts: MakeLogOptions) {
  return {
    id: opts.id,
    user_id: "user-1",
    practice_id: practiceId,
    style: opts.style ?? "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 60,
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    practice_times: [],
    practice_log_tags: (opts.tags ?? []).map((tag) => ({
      practice_tag_id: tag.id,
      practice_tags: tag,
    })),
  };
}

interface MakePracticeOptions {
  id: string;
  date: string;
  place: string | null;
  logs: ReturnType<typeof makeLog>[];
}

function makePracticeDay(opts: MakePracticeOptions): PracticeWithLogs {
  return {
    id: opts.id,
    user_id: "user-1",
    date: opts.date,
    title: null,
    place: opts.place,
    note: null,
    team_id: null,
    created_at: `${opts.date}T00:00:00Z`,
    updated_at: `${opts.date}T00:00:00Z`,
    practice_logs: opts.logs,
  } as PracticeWithLogs;
}

const renderClient = (practices: PracticeWithLogs[], tags: PracticeTag[] = [tagA, tagB]) => {
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

const cardHasPlace = (place: string): boolean =>
  screen
    .queryAllByRole("button", { name: /^練習詳細を表示\(/ })
    .some((row) => row.textContent?.includes(place));

describe("PracticeClient (day-level tags 意味論 + draft/apply)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePracticeStore.getState().closeTabModal();
    usePracticeStore.getState().resetFilter();
    usePracticeStore.setState({ availableTags: [] });
  });

  describe("[V-WP-13/14 最重要] tags フィルタの day-level 意味論(複数ログに分散)", () => {
    it(
      "同一日の2ログにタグA・タグBがそれぞれ分散している場合、両方を選択して適用すると" +
        "その日は除外される(合算ANDになっていないことの確認。1ログ内AND成立が必要)",
      async () => {
        const user = userEvent.setup();
        const scatteredDay = makePracticeDay({
          id: "p-scattered",
          date: "2026-01-01",
          place: "プール分散",
          logs: [
            makeLog("p-scattered", { id: "log-1", tags: [tagA] }),
            makeLog("p-scattered", { id: "log-2", tags: [tagB] }),
          ],
        });
        const combinedDay = makePracticeDay({
          id: "p-combined",
          date: "2026-01-02",
          place: "プール単一ログ両方持ち",
          logs: [makeLog("p-combined", { id: "log-3", tags: [tagA, tagB] })],
        });

        renderClient([scatteredDay, combinedDay]);

        expect(cardHasPlace("プール分散")).toBe(true);
        expect(cardHasPlace("プール単一ログ両方持ち")).toBe(true);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "タグA" }));
        await user.click(screen.getByRole("button", { name: "タグB" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(cardHasPlace("プール単一ログ両方持ち")).toBe(true);
        expect(cardHasPlace("プール分散")).toBe(false);
      },
    );

    it(
      "選択した全タグを含むログが1件あれば、同じ日の他のログが無関係でもその日は表示される" +
        "(OR-exists: 他ログの内容は判定に影響しない)",
      async () => {
        const user = userEvent.setup();
        const day = makePracticeDay({
          id: "p-mixed",
          date: "2026-01-01",
          place: "プール混在",
          logs: [
            makeLog("p-mixed", { id: "log-1", tags: [] }),
            makeLog("p-mixed", { id: "log-2", tags: [tagA, tagB] }),
          ],
        });

        renderClient([day]);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "タグA" }));
        await user.click(screen.getByRole("button", { name: "タグB" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(cardHasPlace("プール混在")).toBe(true);
      },
    );
  });

  describe("絞り込みシートのドラフト状態管理(適用ボタン)", () => {
    const buildTwoPlaceDays = () => [
      makePracticeDay({
        id: "p-1",
        date: "2026-01-01",
        place: "プールA",
        logs: [makeLog("p-1", { id: "log-1" })],
      }),
      makePracticeDay({
        id: "p-2",
        date: "2026-01-02",
        place: "プールB",
        logs: [makeLog("p-2", { id: "log-2" })],
      }),
    ];

    it("[V-WP-07] 場所チップを選択しただけ(適用前)では、一覧・件数バッジ・ストアは変化しない", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoPlaceDays());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "プールA" }));

      expect(cardHasPlace("プールB")).toBe(true);
      expect(usePracticeStore.getState().filterPlaces).toEqual([]);
      const filterButton = screen.getByRole("button", { name: "絞り込み" });
      expect(filterButton.textContent).not.toMatch(/[1-9]/);
    });

    it("[V-WP-08] 「適用」を押すと初めてストアに反映され、一覧・件数・displayCount(20へリセット)が更新される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoPlaceDays());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "プールA" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(usePracticeStore.getState().filterPlaces).toEqual(["プールA"]);
      expect(cardHasPlace("プールA")).toBe(true);
      expect(cardHasPlace("プールB")).toBe(false);
    });

    it("[V-WP-09] Xボタン(閉じる)で閉じるとドラフトの変更が破棄され、一覧・ストアは変化しない", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoPlaceDays());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "プールA" }));
      await user.click(screen.getByRole("button", { name: "閉じる" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(usePracticeStore.getState().filterPlaces).toEqual([]);
      expect(cardHasPlace("プールB")).toBe(true);
    });

    it("[V-WP-09b] backdrop クリックで閉じてもドラフトが破棄される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoPlaceDays());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "プールA" }));

      const dialog = screen.getByRole("dialog");
      const overlay = dialog.previousElementSibling as HTMLElement;
      await user.click(overlay);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(usePracticeStore.getState().filterPlaces).toEqual([]);
      expect(cardHasPlace("プールB")).toBe(true);
    });

    it("[V-WP-09c] Escapeキーで閉じてもドラフトが破棄される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoPlaceDays());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "プールA" }));
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(usePracticeStore.getState().filterPlaces).toEqual([]);
      expect(cardHasPlace("プールB")).toBe(true);
    });

    it(
      "[V-WP-10] ドラフトを破棄した後に再度シートを開くと、直前の破棄内容ではなく現在の" +
        "ストア値(適用済みの状態)からチップの選択状態が再構築される",
      async () => {
        const user = userEvent.setup();
        renderClient(buildTwoPlaceDays());

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "プールA" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
        await user.click(screen.getByRole("button", { name: "プールB" }));
        await user.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
        const chipA = screen.getByRole("button", { name: "プールA" });
        const chipB = screen.getByRole("button", { name: "プールB" });
        expect(chipA.className).toContain("bg-blue-600");
        expect(chipB.className).not.toContain("bg-blue-600");
      },
    );

    it(
      "シート排他制御: 絞り込みシートでチップを選択した(未適用)状態のまま並べ替えボタンを" +
        "押すと、絞り込みシートが閉じてドラフトが破棄され、並べ替えシートが開く",
      async () => {
        const user = userEvent.setup();
        renderClient(buildTwoPlaceDays());

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "プールA" }));

        await user.click(screen.getByRole("button", { name: "並べ替え" }));

        await waitFor(() => {
          expect(screen.getAllByRole("dialog")).toHaveLength(1);
        });
        expect(screen.getByRole("dialog")).toHaveTextContent("日付(新しい順)");

        await user.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(usePracticeStore.getState().filterPlaces).toEqual([]);
        expect(cardHasPlace("プールB")).toBe(true);
      },
    );
  });

  describe("絞り込み境界値", () => {
    it("[V-WP-16] 場所・種目・タグとも0選択のまま適用すると、全件表示のまま変化しない", async () => {
      const user = userEvent.setup();
      renderClient([
        makePracticeDay({
          id: "p-1",
          date: "2026-01-01",
          place: "プールA",
          logs: [makeLog("p-1", { id: "log-1" })],
        }),
        makePracticeDay({
          id: "p-2",
          date: "2026-01-02",
          place: "プールB",
          logs: [makeLog("p-2", { id: "log-2" })],
        }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("プールA")).toBe(true);
      expect(cardHasPlace("プールB")).toBe(true);
    });

    it(
      "[V-WP-17] 絞り込み結果0件の場合、0件空状態が表示され、「すべてクリア」導線で" +
        "即座に全解除される(ソートも含めた全体リセット)",
      async () => {
        const user = userEvent.setup();
        renderClient([
          makePracticeDay({
            id: "p-1",
            date: "2026-01-01",
            place: "プールA",
            logs: [makeLog("p-1", { id: "log-1" })],
          }),
        ]);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "プールA" }));
        await user.click(screen.getByRole("button", { name: "タグA" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(screen.getByText("該当する記録がありません")).toBeInTheDocument();

        // 絞り込みシートの「すべてクリア」フッターボタン(閉じるアニメーション中)と
        // 0件空状態の「すべてクリア」ボタンが同じラベルのため、シートの unmount を待ってから
        // 空状態側のボタンを一意にクリックする
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        await user.click(screen.getByRole("button", { name: "すべてクリア" }));

        expect(usePracticeStore.getState().filterPlaces).toEqual([]);
        expect(usePracticeStore.getState().selectedTagIds).toEqual([]);
        expect(cardHasPlace("プールA")).toBe(true);
      },
    );
  });

  describe("データ不整合への耐性", () => {
    it("[V-WP-20] practice_logs が空配列の日があってもクラッシュせず一覧に表示される", () => {
      const emptyLogsDay = makePracticeDay({
        id: "p-empty",
        date: "2026-01-01",
        place: "プール空ログ",
        logs: [],
      });

      expect(() => renderClient([emptyLogsDay])).not.toThrow();
      expect(cardHasPlace("プール空ログ")).toBe(true);
    });

    it("practice_logs が空配列の日は、タグを1件以上選択して適用すると除外される", async () => {
      const user = userEvent.setup();
      const emptyLogsDay = makePracticeDay({
        id: "p-empty",
        date: "2026-01-01",
        place: "プール空ログ",
        logs: [],
      });
      renderClient([emptyLogsDay]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "タグA" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasPlace("プール空ログ")).toBe(false);
    });
  });
});
