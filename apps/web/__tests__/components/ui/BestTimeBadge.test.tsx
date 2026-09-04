/**
 * BestTimeBadge テスト(web 一覧用・2026-07-22 Sprint 新規)
 *
 * web components/ui/BestTimeBadge.tsx は従来デッドコード(参照元ゼロ)だったが、
 * 今回 CompetitionRecordCard に組み込まれ、3状態(初/Best-/Best+)を常時表示する
 * コンポーネントとして全面改修された(showDiff prop 廃止)。
 *
 * Sprint Contract 検証観点:
 *   - 候補は (userId, styleId, isRelaying, poolType) グループ単位の共有キャッシュ
 *     クエリ (useListBestCandidatesQuery) で一括取得し、computeListPreviousBest
 *     (shared、純関数テストは shared 側)で「記録日時点の過去ベスト」を判定する
 *   - shared getBestBadgeState で3状態("初"/amber、"Best-X.XX"・"Best±0.00"/amber、
 *     "Best+X.XX"/red)を判定し常時表示する(2026-07-22: best の配色を blue→amber に変更、
 *     first と同色になったためラベル文言("初" vs "Best±X.XX")で区別する)。
 *     「Best」「±」はASCII固定・i18nされない。「初」のみ common.bestBadge.first でi18n
 *   - time<=0・styleId/recordDate欠落・未認証・ロード中・エラー時は非表示
 *   - 同一グループの複数バッジでフェッチが1回に集約される(N+1回避)
 *
 * トートロジー防止メモ: shared getBestBadgeState/computeListPreviousBest の実装を
 * そのまま踏襲せず、「グループ単位でどう判定されるべきか」という仕様から導いた
 * 期待値(表示テキスト・色クラス・フェッチ回数)を検証する。
 */

import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import type { ListBestCandidates } from "@apps/shared/api/records";

// -----------------------------------------------------------------------
// vi.hoisted — モック関数の巻き上げ対策
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useListBestCandidatesQuery: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useListBestCandidatesQuery: mocks.useListBestCandidatesQuery,
}));

import BestTimeBadge from "@/components/ui/BestTimeBadge";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const candidates = (partial: Partial<ListBestCandidates> = {}): ListBestCandidates => ({
  competitionRows: [],
  bulkRows: [],
  ...partial,
});

const defaultProps = {
  recordId: "record-1",
  styleId: 1,
  currentTime: 55.0,
  recordDate: "2026-07-01",
  poolType: 0,
  isRelaying: false,
};

describe("BestTimeBadge (web 一覧用・3状態常時表示)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: "user-1" }, supabase: {} });
  });

  describe("3状態の常時表示", () => {
    it("過去記録が無いとき「初」バッジ(amber)が表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      const badge = screen.getByText("初");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-amber-600");
    });

    it("過去ベストより速いとき「Best-X.XX」バッジ(amber、2026-07-22 色変更: blue→amber)が表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 60.0, date: "2026-06-01" }] }),
        error: null,
      });
      // currentTime=55.0, previousBest=60.0 → 改善5.0
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      const badge = screen.getByText("Best-5.00");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-amber-600");
    });

    it(
      "過去ベストと完全同値のとき「Best±0.00」バッジ(amber、悪化ではなくベスト扱い。" +
        "2026-07-22 色変更: blue→amber)が表示される",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({
          data: candidates({ competitionRows: [{ id: "other-1", time: 55.0, date: "2026-06-01" }] }),
          error: null,
        });
        renderWithIntl(<BestTimeBadge {...defaultProps} />);

        const badge = screen.getByText("Best±0.00");
        expect(badge).toBeInTheDocument();
        expect(badge.className).toContain("text-amber-600");
      },
    );

    it("過去ベストより遅いとき「Best+X.XX」バッジ(red)が表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 50.0, date: "2026-06-01" }] }),
        error: null,
      });
      // currentTime=55.0, previousBest=50.0 → 悪化5.0
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      const badge = screen.getByText("Best+5.00");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-red-600");
    });

    it("EPSILON(0.005)以内の悪化は「Best±0.00」扱い(ベスト/amber。2026-07-22 色変更: blue→amber)になる", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 55.0, date: "2026-06-01" }] }),
        error: null,
      });
      renderWithIntl(<BestTimeBadge {...defaultProps} currentTime={55.004} />);

      const badge = screen.getByText("Best±0.00");
      expect(badge.className).toContain("text-amber-600");
    });

    it(
      "「初」と「Best±X.XX」は同じ amber 系配色になったため、色ではなくラベル文言で" +
        "両者を区別できることを確認する(初記録と改善済みベストの誤認防止)",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
        renderWithIntl(<BestTimeBadge {...defaultProps} />);

        const firstBadge = screen.getByText("初");
        expect(firstBadge.className).toContain("text-amber-600");
        // 「初」自体は "Best" 接頭辞を持たない(ラベル文言で区別可能)
        expect(firstBadge.textContent).not.toMatch(/^Best/);
      },
    );

    it("EPSILON をわずかに超える悪化は「Best+0.01」(遅い/赤)になる", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 55.0, date: "2026-06-01" }] }),
        error: null,
      });
      renderWithIntl(<BestTimeBadge {...defaultProps} currentTime={55.01} />);

      const badge = screen.getByText("Best+0.01");
      expect(badge.className).toContain("text-red-600");
    });

    it("「Best」「±」はASCII固定でロケール非依存(enでも同じ接頭辞)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 60.0, date: "2026-06-01" }] }),
        error: null,
      });
      render(
        <NextIntlClientProvider locale="en" messages={enMessages as unknown as AbstractIntlMessages}>
          <BestTimeBadge {...defaultProps} />
        </NextIntlClientProvider>,
      );

      expect(screen.getByText("Best-5.00")).toBeInTheDocument();
    });
  });

  describe("非表示条件", () => {
    it("time=0(無記録)のとき非表示になる(候補データが揃っていても)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
      renderWithIntl(<BestTimeBadge {...defaultProps} currentTime={0} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Best[-+±]/)).not.toBeInTheDocument();
    });

    it("styleId が無いとき非表示になり、フェッチも行われない", () => {
      renderWithIntl(<BestTimeBadge {...defaultProps} styleId={undefined} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ enabled: false }),
      );
    });

    it("recordDate が無いとき非表示になり、フェッチも行われない", () => {
      renderWithIntl(<BestTimeBadge {...defaultProps} recordDate={null} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ enabled: false }),
      );
    });

    it("未認証のとき非表示になり、フェッチも行われない", () => {
      mocks.useAuth.mockReturnValue({ user: null, supabase: {} });
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ enabled: false }),
      );
    });

    it("ロード中(候補データ未解決)のとき非表示になる", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Best[-+±]/)).not.toBeInTheDocument();
    });

    it("クエリエラー時は console.error を呼び、非表示のままになる", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("DB error");
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error });

      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith("ベストタイムチェックエラー:", error);
      });
      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Best[-+±]/)).not.toBeInTheDocument();

      consoleSpy.mockRestore();
    });
  });

  describe("time-aware境界(computeListPreviousBest との結線)", () => {
    it("自分自身の記録は候補から除外される(id一致)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({
          competitionRows: [{ id: "record-1", time: 40.0, date: "2026-06-01" }], // 自分自身
        }),
        error: null,
      });
      // 自分自身しか候補が無い → 除外後は初記録扱い
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      expect(screen.getByText("初")).toBeInTheDocument();
    });

    it("記録日以降(同日含む)の大会候補は過去ベストの計算から除外される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({
          competitionRows: [{ id: "other-1", time: 50.0, date: "2026-07-01" }], // recordDate と同日
        }),
        error: null,
      });
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      // 同日候補は除外されるため初記録扱い
      expect(screen.getByText("初")).toBeInTheDocument();
    });

    it("一括登録候補は created_at が recordDate 以降だと除外される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({
          bulkRows: [{ id: "other-1", time: 50.0, created_at: "2026-07-01T00:00:00.000Z" }],
        }),
        error: null,
      });
      renderWithIntl(<BestTimeBadge {...defaultProps} />);

      expect(screen.getByText("初")).toBeInTheDocument();
    });
  });

  describe("N+1回避(グループ共有クエリ)", () => {
    it("同一グループ(userId, styleId, isRelaying, poolType)の複数バッジでフェッチが1回に集約される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({ competitionRows: [{ id: "other-1", time: 55.0, date: "2026-06-01" }] }),
        error: null,
      });

      renderWithIntl(
        <>
          <BestTimeBadge {...defaultProps} recordId="record-1" currentTime={50.0} />
          <BestTimeBadge {...defaultProps} recordId="record-2" currentTime={60.0} />
        </>,
      );

      // record-1: 50.0 - 55.0 = -5.0(改善) → Best-5.00 / record-2: 60.0-55.0=+5.0(悪化) → Best+5.00
      expect(screen.getByText("Best-5.00")).toBeInTheDocument();
      expect(screen.getByText("Best+5.00")).toBeInTheDocument();
      // フック自体は各コンポーネントインスタンスで呼ばれるが、同一グループキーを渡していることを
      // 確認する(実際のキャッシュ共有は react-query 側の責務であり、shared側の
      // useListBestCandidatesQuery のテストで検証済み。ここでは呼び出し引数の一致を確認する)
      expect(mocks.useListBestCandidatesQuery).toHaveBeenCalledTimes(2);
      // 直前の toHaveBeenCalledTimes(2) で calls[0]/calls[1] の存在を確認済み
      const [, firstCallOptions] = mocks.useListBestCandidatesQuery.mock.calls[0]!;
      const [, secondCallOptions] = mocks.useListBestCandidatesQuery.mock.calls[1]!;
      expect(firstCallOptions).toMatchObject({
        userId: "user-1",
        styleId: 1,
        isRelaying: false,
        poolType: 0,
      });
      expect(secondCallOptions).toMatchObject({
        userId: "user-1",
        styleId: 1,
        isRelaying: false,
        poolType: 0,
      });
    });
  });
});
