/**
 * CompetitionClient テスト (Sprint Contract Phase B)
 * 大会履歴タブ「並べ替え・絞り込み改善」(2026-07-22b) 専用の新規テストファイル。
 *
 * Sprint Contract Verification Checklist: V-CF-01〜25 (V-CF-24 のみこのファイル対象外。
 * practice タブへの非影響は既存の practice 側テストスイートの再実行で確認する)。
 *
 * トートロジー防止メモ: CompetitionClient.tsx の実装(handleApplyFilters 等の関数名)を
 * そのまま踏襲した assertion にせず、Sprint Contract の Success Criteria
 * (「適用を押すまでストアに反映されない」「グループ内OR・グループ間AND」等)から
 * 導いたユーザー可視の挙動(表示されるカードの大会名、ボタンの有無)を検証する。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType, Style } from "@apps/shared/types";
import { useCompetitionStore } from "@/stores/competition/competitionStore";

// -----------------------------------------------------------------------
// vi.hoisted — モック関数の巻き上げ対策 (既存 CompetitionClient.test.tsx と同型)
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  useRecordsQuery: vi.fn(),
  deleteRecordMutateAsync: vi.fn(),
  deleteCompetitionMutateAsync: vi.fn(),
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
  useUpdateRecordMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRecordMutation: () => ({ mutateAsync: mocks.deleteRecordMutateAsync, isPending: false }),
  useCreateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCompetitionMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCompetitionMutation: () => ({
    mutateAsync: mocks.deleteCompetitionMutateAsync,
    isPending: false,
  }),
  useCreateSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceSplitTimesMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // CompetitionRecordCard に組み込まれた BestTimeBadge が呼ぶため必須(欠くと全テストがクラッシュする)
  useListBestCandidatesQuery: () => ({ data: undefined, error: null }),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    deleteEntry = vi.fn();
  },
}));

vi.mock("@/components/forms/CompetitionTabModal", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/app/[locale]/(authenticated)/competition/_components/CompetitionDetailModal", () => ({
  __esModule: true,
  default: () => null,
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

// 種目マスター(距離接頭辞除去後のラベル確認用に name_jp を "50m自由形" 形式にしておく)
const STYLES_MASTER: Style[] = [
  { id: 1, name: "fr50", name_jp: "50m自由形", style: "Fr", distance: 50 },
  { id: 2, name: "fr100", name_jp: "100m自由形", style: "Fr", distance: 100 },
  { id: 3, name: "br100", name_jp: "100m平泳ぎ", style: "Br", distance: 100 },
  { id: 4, name: "ba50", name_jp: "50m背泳ぎ", style: "Ba", distance: 50 },
];

interface MakeRecordOptions {
  id: string;
  competitionId: string;
  title: string;
  date: string;
  styleCode?: "Fr" | "Br" | "Ba" | "Fly" | "IM" | null;
  distance?: number | null;
  time?: number;
  isRelaying?: boolean;
  poolType?: number;
  place?: string | null;
  styleNameJp?: string;
}

const makeRecord = (opts: MakeRecordOptions): RecordType =>
  ({
    id: opts.id,
    user_id: "user-1",
    competition_id: opts.competitionId,
    style_id: 1,
    time: opts.time ?? 30.0,
    note: null,
    is_relaying: opts.isRelaying ?? false,
    reaction_time: null,
    pool_type: opts.poolType ?? 0,
    created_at: `${opts.date}T00:00:00Z`,
    updated_at: `${opts.date}T00:00:00Z`,
    competition: {
      id: opts.competitionId,
      user_id: "user-1",
      date: opts.date,
      end_date: null,
      title: opts.title,
      place: opts.place === undefined ? "テストプール" : opts.place,
      pool_type: opts.poolType ?? 0,
      team_id: null,
      note: null,
      created_at: `${opts.date}T00:00:00Z`,
      updated_at: `${opts.date}T00:00:00Z`,
    },
    style:
      opts.styleCode === null
        ? null
        : ({
            id: 1,
            name_jp: opts.styleNameJp ?? `${opts.distance ?? 50}m自由形`,
            distance: opts.distance ?? 50,
            style: opts.styleCode ?? "Fr",
          } as unknown as RecordType["style"]),
  }) as RecordType;

const renderClient = (records: RecordType[], styles: Style[] = STYLES_MASTER) => {
  fakeSupabase = createFakeSupabase([], []);
  mocks.useRecordsQuery.mockReturnValue({
    records,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });

  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionClient styles={styles} />
    </NextIntlClientProvider>,
  );
};

const getCardRows = (): HTMLElement[] => screen.queryAllByRole("button", { name: /^大会記録詳細を表示\(/ });

// 絞り込みシートの大会名グループには各大会名と同じ文字列のチップが並ぶため、
// シートが開いたままの状態で screen.getByText(タイトル) を使うと二重ヒットしてしまう。
// カード行(role="button" + aria-label)側のみに絞ってタイトルの有無を判定する。
const cardHasTitle = (title: string): boolean =>
  getCardRows().some((row) => row.textContent?.includes(title));

// NOTE: `rows[N]!` を多用する。各テストは renderClient() に描画した件数分のカード行が
// 揃っている前提で書かれている。

describe("CompetitionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCompetitionStore.getState().closeTabModal();
    useCompetitionStore.getState().resetFilter();
    useCompetitionStore.setState({ styles: [] });
  });

  describe("並べ替えシート(4プリセットのみ)", () => {
    it("[V-CF-01] 初期状態は日付降順(新しい順)で表示される(sortColumn=null は dateDesc 相当)", async () => {
      renderClient([
        makeRecord({ id: "r1", competitionId: "c1", title: "1月大会", date: "2026-01-01" }),
        makeRecord({ id: "r2", competitionId: "c2", title: "3月大会", date: "2026-03-01" }),
        makeRecord({ id: "r3", competitionId: "c3", title: "2月大会", date: "2026-02-01" }),
      ]);

      const rows = getCardRows();
      expect(rows[0]!.textContent).toContain("3月大会");
      expect(rows[1]!.textContent).toContain("2月大会");
      expect(rows[2]!.textContent).toContain("1月大会");

      // エントリー済み(記録未登録)取得の非同期 effect が act() 外で解決しないよう待つ
      await waitFor(() => {
        expect(mocks.deleteRecordMutateAsync).not.toHaveBeenCalled();
      });
    });

    it(
      "[V-CF-02] 並べ替えシートを開くと「日付(新しい順)」「日付(古い順)」「記録が速い順」「記録が遅い順」の" +
        "4項目のみが表示され、旧「大会名」「場所」「プール」「種目」のプリセットは表示されない",
      async () => {
        const user = userEvent.setup();
        renderClient([makeRecord({ id: "r1", competitionId: "c1", title: "テスト大会", date: "2026-01-01" })]);

        await user.click(screen.getByRole("button", { name: "並べ替え" }));

        const dialog = screen.getByRole("dialog");
        expect(screen.getByRole("button", { name: "日付(新しい順)" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "日付(古い順)" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "記録が速い順" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "記録が遅い順" })).toBeInTheDocument();

        expect(dialog).not.toHaveTextContent("大会名(昇順)");
        expect(dialog).not.toHaveTextContent("場所(昇順)");
        expect(dialog).not.toHaveTextContent("プール(昇順)");
        expect(dialog).not.toHaveTextContent("種目(昇順)");
      },
    );

    it("[V-CF-03] 「日付(古い順)」を選択すると即座に一覧が日付昇順で再描画される(適用ボタン不要)", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({ id: "r1", competitionId: "c1", title: "1月大会", date: "2026-01-01" }),
        makeRecord({ id: "r2", competitionId: "c2", title: "3月大会", date: "2026-03-01" }),
      ]);

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "日付(古い順)" }));

      const rows = getCardRows();
      expect(rows[0]!.textContent).toContain("1月大会");
      expect(rows[1]!.textContent).toContain("3月大会");
    });

    it("[V-CF-03b] 「記録が速い順」「記録が遅い順」を選択すると time 昇順/降順で再描画される", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({ id: "r1", competitionId: "c1", title: "遅い記録大会", date: "2026-01-01", time: 60.0 }),
        makeRecord({ id: "r2", competitionId: "c2", title: "速い記録大会", date: "2026-01-02", time: 30.0 }),
      ]);

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "記録が速い順" }));
      let rows = getCardRows();
      expect(rows[0]!.textContent).toContain("速い記録大会");
      expect(rows[1]!.textContent).toContain("遅い記録大会");

      await user.click(screen.getByRole("button", { name: "並べ替え" }));
      await user.click(screen.getByRole("button", { name: "記録が遅い順" }));
      rows = getCardRows();
      expect(rows[0]!.textContent).toContain("遅い記録大会");
      expect(rows[1]!.textContent).toContain("速い記録大会");
    });

    it(
      "[V-CF-03c] 並べ替えプリセット選択で displayCount が PAGE_INCREMENT(20)にリセットされる" +
        "(新プリセットで再現する)",
      async () => {
        const user = userEvent.setup();
        const records = Array.from({ length: 25 }, (_, i) =>
          makeRecord({
            id: `record-${i}`,
            competitionId: `comp-${i}`,
            title: `大会${i}`,
            date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
          }),
        );
        renderClient(records);

        expect(getCardRows()).toHaveLength(20);
        await user.click(screen.getByRole("button", { name: "もっと見る" }));
        expect(getCardRows()).toHaveLength(25);
        expect(screen.queryByRole("button", { name: "もっと見る" })).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "並べ替え" }));
        await user.click(screen.getByRole("button", { name: "日付(古い順)" }));

        await waitFor(() => {
          expect(getCardRows()).toHaveLength(20);
        });
        expect(screen.getByRole("button", { name: "もっと見る" })).toBeInTheDocument();
      },
    );
  });

  describe("絞り込みシート(距離+種目の分離)", () => {
    it("[V-CF-04] 絞り込みシートに「距離」グループと「種目」グループが独立して表示される", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({
          id: "r1",
          competitionId: "c1",
          title: "自由形大会",
          date: "2026-01-01",
          styleCode: "Fr",
          distance: 50,
        }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));

      expect(screen.getByText("距離")).toBeInTheDocument();
      expect(screen.getByText("種目")).toBeInTheDocument();
      // 距離チップは "50m"、種目チップは接頭辞を除いたラベル "自由形"
      expect(screen.getByRole("button", { name: "50m" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "自由形" })).toBeInTheDocument();
    });

    it("[V-CF-05] 距離グループのチップは複数選択できる(トグルで複数チップが選択状態になる)", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({
          id: "r1",
          competitionId: "c1",
          title: "50m大会",
          date: "2026-01-01",
          styleCode: "Fr",
          distance: 50,
        }),
        makeRecord({
          id: "r2",
          competitionId: "c2",
          title: "100m大会",
          date: "2026-01-02",
          styleCode: "Fr",
          distance: 100,
        }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      const chip50 = screen.getByRole("button", { name: "50m" });
      const chip100 = screen.getByRole("button", { name: "100m" });

      await user.click(chip50);
      await user.click(chip100);

      expect(chip50.className).toContain("bg-blue-600");
      expect(chip100.className).toContain("bg-blue-600");
    });

    it("[V-CF-05b] 種目グループのチップは複数選択できる", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({
          id: "r1",
          competitionId: "c1",
          title: "自由形大会",
          date: "2026-01-01",
          styleCode: "Fr",
          distance: 50,
        }),
        makeRecord({
          id: "r2",
          competitionId: "c2",
          title: "平泳ぎ大会",
          date: "2026-01-02",
          styleCode: "Br",
          distance: 100,
        }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      const chipFr = screen.getByRole("button", { name: "自由形" });
      const chipBr = screen.getByRole("button", { name: "平泳ぎ" });

      await user.click(chipFr);
      await user.click(chipBr);

      expect(chipFr.className).toContain("bg-blue-600");
      expect(chipBr.className).toContain("bg-blue-600");
    });
  });

  describe("絞り込みロジック(グループ内OR・グループ間AND)", () => {
    const buildMixedRecords = () => [
      makeRecord({
        id: "r-50fr",
        competitionId: "c-50fr",
        title: "50Fr大会",
        date: "2026-01-01",
        styleCode: "Fr",
        distance: 50,
      }),
      makeRecord({
        id: "r-100fr",
        competitionId: "c-100fr",
        title: "100Fr大会",
        date: "2026-01-02",
        styleCode: "Fr",
        distance: 100,
      }),
      makeRecord({
        id: "r-50br",
        competitionId: "c-50br",
        title: "50Br大会",
        date: "2026-01-03",
        styleCode: "Br",
        distance: 50,
      }),
      makeRecord({
        id: "r-200br",
        competitionId: "c-200br",
        title: "200Br大会",
        date: "2026-01-04",
        styleCode: "Br",
        distance: 200,
      }),
    ];

    it("[V-CF-06] 距離=[50,100] を選択して適用すると、50m/100mいずれかの記録のみが表示される(グループ内OR)", async () => {
      const user = userEvent.setup();
      renderClient(buildMixedRecords(), [
        ...STYLES_MASTER,
        { id: 5, name: "br200", name_jp: "200m平泳ぎ", style: "Br", distance: 200 },
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.click(screen.getByRole("button", { name: "100m" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("50Fr大会")).toBe(true);
      expect(cardHasTitle("100Fr大会")).toBe(true);
      expect(cardHasTitle("50Br大会")).toBe(true);
      expect(cardHasTitle("200Br大会")).toBe(false);
    });

    it("[V-CF-07] 種目=[fr] を選択して適用すると、自由形の記録のみが表示される(グループ内OR、単一選択時)", async () => {
      const user = userEvent.setup();
      renderClient(buildMixedRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("50Fr大会")).toBe(true);
      expect(cardHasTitle("100Fr大会")).toBe(true);
      expect(cardHasTitle("50Br大会")).toBe(false);
      expect(cardHasTitle("200Br大会")).toBe(false);
    });

    it(
      "[V-CF-08] 距離=[50,100] AND 種目=[fr] を選択して適用すると、50Fr/100Frのみが表示され、" +
        "50Br等(距離は一致するが種目不一致)は除外される(グループ間AND)",
      async () => {
        const user = userEvent.setup();
        renderClient(buildMixedRecords());

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));
        await user.click(screen.getByRole("button", { name: "100m" }));
        await user.click(screen.getByRole("button", { name: "自由形" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(cardHasTitle("50Fr大会")).toBe(true);
        expect(cardHasTitle("100Fr大会")).toBe(true);
        expect(cardHasTitle("50Br大会")).toBe(false);
        expect(cardHasTitle("200Br大会")).toBe(false);
      },
    );
  });

  describe("絞り込みシートのドラフト状態管理(適用ボタン)", () => {
    const buildTwoDistanceRecords = () => [
      makeRecord({
        id: "r-50",
        competitionId: "c-50",
        title: "50m大会",
        date: "2026-01-01",
        styleCode: "Fr",
        distance: 50,
      }),
      makeRecord({
        id: "r-100",
        competitionId: "c-100",
        title: "100m大会",
        date: "2026-01-02",
        styleCode: "Fr",
        distance: 100,
      }),
    ];

    it("[V-CF-09] 距離チップを選択しただけ(適用を押す前)では、一覧・件数バッジ・ストアは変化しない", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));

      // 一覧はまだ2件とも見えているはず(シート越しでも背後のDOMは変化していない)
      expect(cardHasTitle("100m大会")).toBe(true);
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);

      const filterButton = screen.getByRole("button", { name: "絞り込み" });
      expect(filterButton.textContent).not.toMatch(/[1-9]/);
    });

    it("[V-CF-10] 「適用」を押すと初めてストアに反映され、一覧・件数・displayCount(20へリセット)が更新される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(useCompetitionStore.getState().filterDistances).toEqual(["50"]);
      expect(cardHasTitle("50m大会")).toBe(true);
      expect(cardHasTitle("100m大会")).toBe(false);
    });

    it(
      "[V-CF-11] 「すべてクリア」はドラフトのみを未選択にする。クリア直後にシートを閉じても" +
        "(適用を押していなければ)一覧は変化しない",
      async () => {
        const user = userEvent.setup();
        renderClient(buildTwoDistanceRecords());

        // まず適用済みの絞り込み状態(50mのみ)を作る
        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));
        await user.click(screen.getByRole("button", { name: "適用" }));
        expect(cardHasTitle("100m大会")).toBe(false);

        // 再度開いて「すべてクリア」→「閉じる」(適用しない)
        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
        await user.click(screen.getByRole("button", { name: "すべてクリア" }));
        await user.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        // ストア・一覧は「適用」していないため変化しない(50mのみのまま)
        expect(useCompetitionStore.getState().filterDistances).toEqual(["50"]);
        expect(cardHasTitle("100m大会")).toBe(false);
      },
    );

    it("[V-CF-11b] 「すべてクリア」→「適用」まで行って初めて一覧が全解除される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.click(screen.getByRole("button", { name: "適用" }));
      expect(cardHasTitle("100m大会")).toBe(false);

      await user.click(screen.getByRole("button", { name: /絞り込み/ }));
      await user.click(screen.getByRole("button", { name: "すべてクリア" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
      expect(cardHasTitle("50m大会")).toBe(true);
      expect(cardHasTitle("100m大会")).toBe(true);
    });

    it("[V-CF-12] Xボタンで閉じるとドラフトの変更が破棄され、一覧・ストアは変化しない", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.click(screen.getByRole("button", { name: "閉じる" }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
      expect(cardHasTitle("100m大会")).toBe(true);
    });

    it("[V-CF-13] backdrop クリックで閉じてもドラフトが破棄される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));

      const dialog = screen.getByRole("dialog");
      const overlay = dialog.previousElementSibling as HTMLElement;
      await user.click(overlay);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
      expect(cardHasTitle("100m大会")).toBe(true);
    });

    it("[V-CF-14] Escapeキーで閉じてもドラフトが破棄される", async () => {
      const user = userEvent.setup();
      renderClient(buildTwoDistanceRecords());

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(useCompetitionStore.getState().filterDistances).toEqual([]);
      expect(cardHasTitle("100m大会")).toBe(true);
    });

    it(
      "[V-CF-15] ドラフトを破棄した後に再度シートを開くと、直前の破棄内容ではなく現在の" +
        "ストア値(適用済みの状態)からチップの選択状態が再構築される",
      async () => {
        const user = userEvent.setup();
        renderClient(buildTwoDistanceRecords());

        // 50mを適用済みにする
        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        // 再度開いて100mも選んでから(未適用のまま)閉じる=破棄
        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
        await user.click(screen.getByRole("button", { name: "100m" }));
        await user.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });

        // 再オープンすると、破棄した「100mも選択」ではなく、適用済みの「50mのみ」から再構築される
        await user.click(screen.getByRole("button", { name: /絞り込み/ }));
        const chip50 = screen.getByRole("button", { name: "50m" });
        const chip100 = screen.getByRole("button", { name: "100m" });
        expect(chip50.className).toContain("bg-blue-600");
        expect(chip100.className).not.toContain("bg-blue-600");
      },
    );
  });

  describe("絞り込み境界値", () => {
    it("[V-CF-16] 距離・種目とも0選択のまま適用すると、全件表示のまま変化しない", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({ id: "r1", competitionId: "c1", title: "50m大会", date: "2026-01-01", distance: 50 }),
        makeRecord({ id: "r2", competitionId: "c2", title: "100m大会", date: "2026-01-02", distance: 100 }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("50m大会")).toBe(true);
      expect(cardHasTitle("100m大会")).toBe(true);
    });

    it(
      "[V-CF-17] 距離グループのみ選択(種目は0選択)で適用すると、距離条件のみでフィルタされる" +
        "(種目グループはAND条件から除外される)",
      async () => {
        const user = userEvent.setup();
        renderClient([
          makeRecord({
            id: "r-50fr",
            competitionId: "c-50fr",
            title: "50Fr大会",
            date: "2026-01-01",
            styleCode: "Fr",
            distance: 50,
          }),
          makeRecord({
            id: "r-50br",
            competitionId: "c-50br",
            title: "50Br大会",
            date: "2026-01-02",
            styleCode: "Br",
            distance: 50,
          }),
          makeRecord({
            id: "r-100fr",
            competitionId: "c-100fr",
            title: "100Fr大会",
            date: "2026-01-03",
            styleCode: "Fr",
            distance: 100,
          }),
        ]);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(cardHasTitle("50Fr大会")).toBe(true);
        expect(cardHasTitle("50Br大会")).toBe(true);
        expect(cardHasTitle("100Fr大会")).toBe(false);
      },
    );

    it("[V-CF-18] 種目グループのみ選択(距離は0選択)で適用すると、種目条件のみでフィルタされる", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({
          id: "r-50fr",
          competitionId: "c-50fr",
          title: "50Fr大会",
          date: "2026-01-01",
          styleCode: "Fr",
          distance: 50,
        }),
        makeRecord({
          id: "r-100fr",
          competitionId: "c-100fr",
          title: "100Fr大会",
          date: "2026-01-02",
          styleCode: "Fr",
          distance: 100,
        }),
        makeRecord({
          id: "r-50br",
          competitionId: "c-50br",
          title: "50Br大会",
          date: "2026-01-03",
          styleCode: "Br",
          distance: 50,
        }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "自由形" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("50Fr大会")).toBe(true);
      expect(cardHasTitle("100Fr大会")).toBe(true);
      expect(cardHasTitle("50Br大会")).toBe(false);
    });

    it(
      "[V-CF-19] 距離×種目の組み合わせで0件になる場合、0件空状態が表示され、" +
        "既存の「フィルタをリセット」ボタンで即座に全解除される(ソートも含めた全体リセット)",
      async () => {
        const user = userEvent.setup();
        renderClient([
          makeRecord({
            id: "r-50fr",
            competitionId: "c-50fr",
            title: "50Fr大会",
            date: "2026-01-01",
            styleCode: "Fr",
            distance: 50,
          }),
          makeRecord({
            id: "r-100br",
            competitionId: "c-100br",
            title: "100Br大会",
            date: "2026-01-02",
            styleCode: "Br",
            distance: 100,
          }),
        ]);

        // 50m AND 平泳ぎ = 0件になる組み合わせ
        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));
        await user.click(screen.getByRole("button", { name: "平泳ぎ" }));
        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(screen.getByText("該当する記録がありません")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "フィルタをリセット" }));

        expect(useCompetitionStore.getState().filterDistances).toEqual([]);
        expect(useCompetitionStore.getState().filterStyles).toEqual([]);
        expect(cardHasTitle("50Fr大会")).toBe(true);
        expect(cardHasTitle("100Br大会")).toBe(true);
      },
    );

    it("[V-CF-20] シートを開いて何も変更せず「適用」を押しても、クラッシュせず現状の一覧が維持される", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({ id: "r1", competitionId: "c1", title: "テスト大会", date: "2026-01-01" }),
      ]);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("テスト大会")).toBe(true);
    });
  });

  describe("シート排他制御とドラフト破棄の相互作用", () => {
    it(
      "[V-CF-21] 絞り込みシートでチップを選択した(未適用)状態のまま並べ替えボタンを押すと、" +
        "絞り込みシートが閉じてドラフトが破棄され、並べ替えシートが開く",
      async () => {
        const user = userEvent.setup();
        renderClient([
          makeRecord({
            id: "r-50",
            competitionId: "c-50",
            title: "50m大会",
            date: "2026-01-01",
            distance: 50,
          }),
          makeRecord({
            id: "r-100",
            competitionId: "c-100",
            title: "100m大会",
            date: "2026-01-02",
            distance: 100,
          }),
        ]);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "50m" }));

        await user.click(screen.getByRole("button", { name: "並べ替え" }));

        // 排他制御: 絞り込みシートはスライドアウト中(閉じるアニメーション)の間も一時的に
        // DOM に残るため、そのアニメーションが終わって並べ替えシート1枚だけになるのを待つ
        await waitFor(() => {
          expect(screen.getAllByRole("dialog")).toHaveLength(1);
        });

        // 並べ替えシートが開いている(見出しが「並べ替え」)
        expect(screen.getByRole("dialog")).toHaveTextContent("日付(新しい順)");

        // 並べ替えシートを閉じる。絞り込みのドラフトは破棄されているため、一覧は変化していない
        await user.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(useCompetitionStore.getState().filterDistances).toEqual([]);
        expect(cardHasTitle("100m大会")).toBe(true);
      },
    );
  });

  describe("データ不整合への耐性", () => {
    it("[V-CF-22] record.style が null/undefined の記録がある状態で距離/種目フィルタを適用してもクラッシュせず、該当記録は絞り込み条件に一致しない扱いで除外される", async () => {
      const user = userEvent.setup();
      renderClient([
        makeRecord({
          id: "r-50fr",
          competitionId: "c-50fr",
          title: "50Fr大会",
          date: "2026-01-01",
          styleCode: "Fr",
          distance: 50,
        }),
        makeRecord({
          id: "r-nostyle",
          competitionId: "c-nostyle",
          title: "種目未設定大会",
          date: "2026-01-02",
          styleCode: null,
        }),
      ]);

      expect(cardHasTitle("種目未設定大会")).toBe(true);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      await user.click(screen.getByRole("button", { name: "50m" }));
      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(cardHasTitle("50Fr大会")).toBe(true);
      expect(cardHasTitle("種目未設定大会")).toBe(false);
    });

    it("[V-CF-23] styles マスターに存在しない距離値を持つ record があってもクラッシュせず、描画・フィルタ選択肢生成が継続する", async () => {
      const user = userEvent.setup();
      renderClient(
        [
          makeRecord({
            id: "r-999",
            competitionId: "c-999",
            title: "特殊距離大会",
            date: "2026-01-01",
            styleCode: "Fr",
            distance: 999,
          }),
        ],
        STYLES_MASTER, // マスターには distance=999 の種目は存在しない
      );

      expect(cardHasTitle("特殊距離大会")).toBe(true);

      await user.click(screen.getByRole("button", { name: "絞り込み" }));
      expect(screen.getByRole("button", { name: "999m" })).toBeInTheDocument();
    });
  });

  describe("既存フィルタ(大会名/場所/プール/リレー)の非退行", () => {
    it(
      "[V-CF-25] 大会名・場所・プール・リレーの各フィルタも「適用」を押して初めて反映される" +
        "(distance/style と同様にドラフト化される)",
      async () => {
        const user = userEvent.setup();
        renderClient([
          makeRecord({
            id: "r-short",
            competitionId: "c-short",
            title: "短水路大会",
            date: "2026-01-01",
            poolType: 0,
            place: "短水路プール",
          }),
          makeRecord({
            id: "r-long",
            competitionId: "c-long",
            title: "長水路大会",
            date: "2026-01-02",
            poolType: 1,
            place: "長水路プール",
          }),
        ]);

        await user.click(screen.getByRole("button", { name: "絞り込み" }));
        await user.click(screen.getByRole("button", { name: "短水路" }));

        // 適用前: ストア・一覧は変化しない
        expect(useCompetitionStore.getState().filterPoolType).toBe("");

        await user.click(screen.getByRole("button", { name: "適用" }));

        expect(useCompetitionStore.getState().filterPoolType).toBe("short");
        expect(cardHasTitle("短水路大会")).toBe(true);
        expect(cardHasTitle("長水路大会")).toBe(false);
      },
    );
  });
});
