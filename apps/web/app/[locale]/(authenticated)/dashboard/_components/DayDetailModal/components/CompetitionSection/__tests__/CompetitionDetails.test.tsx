/**
 * CompetitionDetails テスト
 *
 * 2026-07-22 Sprint: ダッシュボード日別詳細モーダルの大会記録種目名を
 * CompetitionRecordCard(大会履歴一覧カード)と統一。`localizedStyleAbbrev`が
 * shared `formatStyleAbbrev` に委譲され、スマホ幅(sm未満)で「200mIM」形式の
 * ロケール非依存略称を表示するようになった。`localizedStyleLabel`(フル名、
 * sm以上)は無変更。
 *
 * Sprint Contract 検証観点:
 *   - スマホ幅用 <span className="sm:hidden"> に略称("200mIM"形式)が表示される
 *   - デスクトップ用 <span className="hidden sm:inline"> にフル名(name_jp相当の
 *     "距離m+泳法名"表記)が表示される
 *   - 両 span が同時に DOM に存在する(CompetitionRecordCard と同じ責務分担パターン)
 *
 * このコンポーネントは競技会/記録/スプリットタイムの3系統の非同期 Supabase フェッチが
 * カスケードする(CompetitionDetails 自身 → 各記録行の RecordSplitTimes / RecordBestBadge)
 * ため、フェイクの Supabase クライアントで select() の引数文字列から呼び出し元を
 * 判別してレスポンスを出し分けている。DayDetailModal.deduplication.test.ts 同様、
 * このコンポーネント群は実装コードの完全な単体テストが無い領域だが、今回は
 * select() 引数ディスパッチ方式のフェイク Supabase で実際にマウント・非同期解決まで
 * 通すことができたため、実コンポーネントの実描画で検証する。
 */

import { render, screen, waitFor } from "@testing-library/react";
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

  return render(
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

describe("CompetitionDetails - 種目名の略称/フル名2span表示", () => {
  it("スマホ幅用span(sm:hidden)に略称「200mIM」が表示される", async () => {
    renderWithIntl({}, [makeRecordRow()]);

    await waitFor(() => {
      expect(screen.getByText("200mIM")).toBeInTheDocument();
    });
    const abbrevSpan = screen.getByText("200mIM");
    expect(abbrevSpan.className).toContain("sm:hidden");
  });

  it("デスクトップ用span(hidden sm:inline)にフル名「200m個人メドレー」が表示される", async () => {
    renderWithIntl({}, [makeRecordRow()]);

    await waitFor(() => {
      expect(screen.getByText("200m個人メドレー")).toBeInTheDocument();
    });
    const fullSpan = screen.getByText("200m個人メドレー");
    expect(fullSpan.className).toContain("hidden");
    expect(fullSpan.className).toContain("sm:inline");
  });

  it("略称とフル名は別テキストとして両方同時にDOMに存在する(CompetitionRecordCardと同じ責務分担)", async () => {
    renderWithIntl({}, [makeRecordRow()]);

    await waitFor(() => {
      expect(screen.getByText("200mIM")).toBeInTheDocument();
    });
    // 両方が同時に存在し、互いを兼ねない(別要素)ことを確認する
    const abbrevSpan = screen.getByText("200mIM");
    const fullSpan = screen.getByText("200m個人メドレー");
    expect(abbrevSpan).not.toBe(fullSpan);
  });

  it("自由形(style_id=1〜7)でも「50mFr」形式の略称になる(5泳法網羅の代表ケース)", async () => {
    renderWithIntl(
      {},
      [
        makeRecordRow({
          id: "record-2",
          style_id: 2,
          style: { id: 2, name_jp: "50m自由形", distance: 50 },
        }),
      ],
    );

    await waitFor(() => {
      expect(screen.getByText("50mFr")).toBeInTheDocument();
    });
    expect(screen.getByText("50m自由形")).toBeInTheDocument();
  });
});
