/**
 * CompetitionDetails: 記録1件表示 (targetRecordId) と記録削除前の確認ダイアログ
 *
 * 2026-11-28 に mobile に揃えた仕様 (swimhub-tasks #77 / #79):
 *   - 大会記録の一覧カードから開いたとき (targetRecordId 指定) は押した記録1件だけを表示し、
 *     同じ大会の他種目の記録は出さない。未指定 (ダッシュボードの日別詳細) はその大会の記録をすべて出す
 *   - 記録の削除ボタンを押したら、すぐ削除せず確認ダイアログを出す。キャンセルなら削除しない
 *
 * フェイク Supabase は CompetitionDetails.test.tsx と同じ select() 引数ディスパッチ方式。
 */

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/__tests__/helpers/dashboardQueryTestUtils";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { CompetitionDetails } from "../CompetitionDetails";
import type { CompetitionDetailsProps } from "../../../types";

// -----------------------------------------------------------------------
// フェイク Supabase クライアント
// -----------------------------------------------------------------------
// CompetitionDetails は3つの独立したフェッチを行う:
//   1. competitions.select("image_paths").eq("id", ...).single()
//   2. records.select(`*, style:styles(*), competition:competitions(*), split_times(*)`).eq("competition_id", ...)
//   3. (各記録行ごと) split_times.select("*").eq("record_id", ...).order(...)  (RecordSplitTimes)
//      records.select(...).eq(...)...lt(...).order(...).limit(1) (RecordBestBadge → getPreviousBestTime、2系統)
// select() の引数文字列で判別してレスポンスを出し分ける。
function makeChain(result: { data: unknown; error: null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gt: () => chain,
    lt: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => chain,
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

function createFakeSupabase(recordRows: unknown[]) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    from: (table: string) => {
      if (table === "competitions") {
        return makeChain({ data: { image_paths: [] }, error: null });
      }
      if (table === "split_times") {
        return makeChain({ data: [], error: null });
      }
      if (table === "records") {
        return {
          select: (selectStr: string) => {
            // CompetitionDetails 自身の記録一覧フェッチ(style:styles(*) を含む select)
            if (typeof selectStr === "string" && selectStr.includes("style:styles")) {
              return makeChain({ data: recordRows, error: null });
            }
            // RecordBestBadge(getPreviousBestTime)の2系統のサブクエリ。
            // 空配列を返し「初記録」相当にして、この種目表示テストの対象外にする。
            return makeChain({ data: [], error: null });
          },
        };
      }
      return makeChain({ data: [], error: null });
    },
  };
}

let fakeSupabase: ReturnType<typeof createFakeSupabase>;

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: fakeSupabase }),
}));

const renderWithIntl = (props: Partial<CompetitionDetailsProps>, recordRows: unknown[]) => {
  fakeSupabase = createFakeSupabase(recordRows);

  return renderWithQueryClient(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionDetails
        competitionId="comp-1"
        competitionName="テスト大会"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddRecord={vi.fn()}
        onEditRecord={vi.fn()}
        onDeleteRecord={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
};

const makeRecordRow = (overrides: Record<string, unknown> = {}) => ({
  id: "record-1",
  competition_id: "comp-1",
  style_id: 20, // 20-22 = 個人メドレー (IM)
  time: 150.25,
  video_path: null,
  video_thumbnail_path: null,
  note: null,
  is_relaying: false,
  reaction_time: null,
  competition: {
    id: "comp-1",
    title: "テスト大会",
    date: "2026-07-01",
    place: "テストプール",
    pool_type: 0,
  },
  style: {
    id: 20,
    name_jp: "200m個人メドレー",
    distance: 200,
  },
  split_times: [],
  ...overrides,
});

const TWO_RECORDS = [
  makeRecordRow({ id: "record-1", time: 150.25 }),
  makeRecordRow({
    id: "record-2",
    style_id: 2,
    time: 25.5,
    style: { id: 2, name_jp: "50m自由形", distance: 50 },
  }),
];

describe("CompetitionDetails - 記録1件表示 (targetRecordId)", () => {
  it("targetRecordId を渡すと、その記録だけが表示され同じ大会の他の記録は出ない", async () => {
    renderWithIntl({ targetRecordId: "record-2" }, TWO_RECORDS);

    await waitFor(() => {
      expect(screen.getAllByTestId("record-time-display")).toHaveLength(1);
    });
    expect(screen.getByText("50mFr")).toBeInTheDocument();
    expect(screen.queryByText("200mIM")).not.toBeInTheDocument();
  });

  it("targetRecordId を渡さない (ダッシュボードの日別詳細) ときは大会の記録がすべて表示される", async () => {
    renderWithIntl({}, TWO_RECORDS);

    await waitFor(() => {
      expect(screen.getAllByTestId("record-time-display")).toHaveLength(2);
    });
  });
});

describe("CompetitionDetails - 記録削除前の確認ダイアログ", () => {
  it("削除ボタンを押しただけでは削除されず、確認ダイアログが出る。キャンセルすると削除されない", async () => {
    const user = userEvent.setup();
    const onDeleteRecord = vi.fn();
    renderWithIntl({ onDeleteRecord }, [makeRecordRow()]);

    await user.click(await screen.findByTestId("delete-record-button"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/この大会記録を削除しますか/)).toBeInTheDocument();
    expect(onDeleteRecord).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDeleteRecord).not.toHaveBeenCalled();
  });

  it("確認ダイアログで削除を押すと、その記録の ID で onDeleteRecord が呼ばれる", async () => {
    const user = userEvent.setup();
    const onDeleteRecord = vi.fn();
    renderWithIntl({ onDeleteRecord }, [makeRecordRow({ id: "record-xyz" })]);

    await user.click(await screen.findByTestId("delete-record-button"));
    await user.click(screen.getByTestId("confirm-dialog-confirm-button"));

    expect(onDeleteRecord).toHaveBeenCalledTimes(1);
    expect(onDeleteRecord).toHaveBeenCalledWith("record-xyz");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
