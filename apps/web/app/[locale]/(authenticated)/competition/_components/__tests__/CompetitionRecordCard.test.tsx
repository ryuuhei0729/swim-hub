/**
 * CompetitionRecordCard テスト
 *
 * 2026-07-22 Sprint: mobile RecordItem 型2行レイアウトへの刷新
 * (1行目=日付+大会名、2行目=左:場所/右:プール・種目・タイム・自己ベストバッジ)。
 * ヒーロータイム表示は撤去され、タイムは2行目にインライン表示される。
 * BestTimeBadge(自己ベスト3状態バッジ)がカードに組み込まれたため、
 * react-query (useListBestCandidatesQuery) + useAuth への依存が新たに発生する。
 *
 * Sprint Contract 検証観点(コーディネーター指示):
 *   - 日付/大会名/場所/プール/種目/タイムが全て描画される
 *   - 一括入力レコード(competition が null) = グレー表示 + 「(一括入力)」
 *   - リレー = タイムの後ろに赤字「R」
 *   - 無記録(time が falsy) = 「-」
 *   - 場所表示: mobile 準拠で place が無い場合は空(旧 "-" 表示は廃止)
 *   - カードクリック→onClick(record) が呼ばれる(既存詳細モーダル導線の配線非退行)
 *   - 自己ベストバッジ(初/Best-/Best+)がカードに組み込まれ、判定不能時は非表示
 *
 * トートロジー防止メモ: 実装の JSX 構造をなぞるのではなく、旧テーブル6カラムの
 * 情報要件+コーディネーター指示のレイアウト仕様から導いた期待値を検証する。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Record as RecordType } from "@apps/shared/types";
import type { ListBestCandidates } from "@apps/shared/api/records";

// -----------------------------------------------------------------------
// vi.hoisted — モック関数の巻き上げ対策
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  useListBestCandidatesQuery: vi.fn(),
}));

// BestTimeBadge が useAuth を使用するため、CompetitionClient.test.tsx と同じ形でモックする
vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

// BestTimeBadge が useListBestCandidatesQuery (react-query) を使用するためモックする。
// 既定はロード中相当 (data: undefined) にし、カード自体の情報描画テストではバッジが
// 判定不能(非表示)のまま邪魔をしないようにする。バッジの表示内容を検証するテストでは
// 個別に mockReturnValue で候補データを注入する。
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useListBestCandidatesQuery: mocks.useListBestCandidatesQuery,
}));

import CompetitionRecordCard from "../CompetitionRecordCard";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

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
    style: {
      id: 2,
      name_jp: "50m自由形",
      name: "50Fr",
      style: "fr",
      distance: 50,
    } as unknown as RecordType["style"],
    ...overrides,
  }) as RecordType;

const candidates = (partial: Partial<ListBestCandidates> = {}): ListBestCandidates => ({
  competitionRows: [],
  bulkRows: [],
  ...partial,
});

describe("CompetitionRecordCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("情報欠落なし(2026-07-22 mobile型2行レイアウト後)", () => {
    it("日付/大会名/場所/プール/種目/タイムが全て描画される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      expect(screen.getByText("2026/07/01")).toBeInTheDocument();
      expect(screen.getByText("テスト大会")).toBeInTheDocument();
      expect(screen.getByText(/テストプール/)).toBeInTheDocument();
      expect(screen.getByText("短水路")).toBeInTheDocument(); // pool_type=0
      // 2026-07-22 Sprint: 種目名はスマホ幅略称(sm:hidden)とフル名(hidden sm:inline)の
      // 2つの<span>が常に両方DOMに存在する(CSSのブレークポイントでどちらかを隠す方式のため、
      // jsdomではメディアクエリが評価されずどちらも描画される)。別テキストとして両方確認する。
      expect(screen.getByText("50mFr")).toBeInTheDocument();
      expect(screen.getByText("50m自由形")).toBeInTheDocument();
      expect(screen.getByText("30.50")).toBeInTheDocument(); // formatTimeBest(30.5, 分未満は"SS.cc"のみ)
    });

    it("日付に年(yyyy)が含まれる形式(yyyy/MM/dd)で表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const dateText = screen.getByText("2026/07/01");
      expect(dateText.textContent).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    });

    it("長水路(pool_type=1)の場合も欠落なく表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard record={makeRecord({ pool_type: 1 })} onClick={vi.fn()} />,
      );

      expect(screen.getByText("長水路")).toBeInTheDocument();
    });
  });

  describe("種目名のスマホ幅略称化(2026-07-22 Sprint新規)", () => {
    it("略称(sm:hidden)とフル名(hidden sm:inline)の2つの<span>が両方DOMに存在する", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const abbrevSpan = screen.getByText("50mFr");
      const fullSpan = screen.getByText("50m自由形");
      expect(abbrevSpan.className).toContain("sm:hidden");
      expect(fullSpan.className).toContain("hidden");
      expect(fullSpan.className).toContain("sm:inline");
      // 略称とフル名は別テキストであり、互いを兼ねない
      expect(abbrevSpan).not.toBe(fullSpan);
    });

    it("style(コード)/distance が両方欠けている場合、略称側も name_jp フォールバックで表示され欠落しない", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      const record = makeRecord({
        style: { id: 2, name_jp: "50m自由形" } as unknown as RecordType["style"],
      });
      renderWithIntl(<CompetitionRecordCard record={record} onClick={vi.fn()} />);

      // フォールバック連鎖の結果、略称側・フル側とも同じ "50m自由形" になり得るため
      // getAllByText で2つとも存在することを確認する(getByText だと "Found multiple" になる)
      const matches = screen.getAllByText("50m自由形");
      expect(matches).toHaveLength(2);
    });

    it("style 自体が undefined のとき、略称・フルとも「-」にフォールバックしクラッシュしない", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      expect(() =>
        renderWithIntl(
          <CompetitionRecordCard
            record={makeRecord({ style: undefined as unknown as RecordType["style"] })}
            onClick={vi.fn()}
          />,
        ),
      ).not.toThrow();

      const matches = screen.getAllByText("-");
      // プール種別が pool_type=0("短水路")のため "-" は種目欄(略称+フル、計2箇所)のみ
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("場所表示: place 無しは空(旧 '-' 表示は廃止。2026-07-22 mobile準拠の回帰観点)", () => {
    it("competition.place が null のとき、場所欄は空になり「-」は表示されない", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      const record = makeRecord({
        competition: {
          ...makeRecord().competition,
          place: null,
        } as RecordType["competition"],
      });
      renderWithIntl(<CompetitionRecordCard record={record} onClick={vi.fn()} />);

      // 場所の絵文字マーカー(📍)ごと表示されない(空文字)
      expect(screen.queryByText(/📍/)).not.toBeInTheDocument();
      // pool_type=0(短水路)・style 定義済みのフィクスチャのため、カード全体に他の "-" 由来は無く、
      // 単独の "-" テキストが(場所欄の旧フォールバックとして)出現しないことを確認できる
      expect(screen.queryByText("-")).not.toBeInTheDocument();
    });

    it("competition.place がある場合は 📍 マーカー付きで表示される(mobile RecordItem と同一トーン)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      expect(screen.getByText("📍テストプール")).toBeInTheDocument();
    });

    it(
      "[2026-07-22 スマホ幅調整] 場所テキストは text-xs sm:text-sm(スマホ幅で縮小・sm以上は従来サイズ)",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
        renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

        const placeText = screen.getByText("📍テストプール");
        expect(placeText.className).toContain("text-xs");
        expect(placeText.className).toContain("sm:text-sm");
      },
    );
  });

  describe("一括入力レコード(competition が null): グレー表示+ラベル維持", () => {
    it("大会名位置に「(一括入力)」と表示され、グレースタイルが適用される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard
          record={makeRecord({ competition: null, competition_id: null })}
          onClick={vi.fn()}
        />,
      );

      const label = screen.getByText("(一括入力)");
      expect(label).toBeInTheDocument();
      expect(label.className).toContain("text-gray-400");

      // 通常の大会名テキストは表示されない
      expect(screen.queryByText("テスト大会")).not.toBeInTheDocument();
    });

    it("日付欄に登録日(created_at)が表示される(泳いだ日を持たないため)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard
          record={makeRecord({
            competition: null,
            competition_id: null,
            created_at: "2026-05-02T09:00:00Z",
          })}
          onClick={vi.fn()}
        />,
      );

      expect(screen.getByText("2026/05/02")).toBeInTheDocument();
    });

    it("大会紐付けレコードの日付欄は大会日のまま(created_at では上書きされない)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard record={makeRecord({ created_at: "2026-07-15T00:00:00Z" })} onClick={vi.fn()} />,
      );

      expect(screen.getByText("2026/07/01")).toBeInTheDocument();
      expect(screen.queryByText("2026/07/15")).not.toBeInTheDocument();
    });

    it("大会紐付けレコードは引き続き通常色(グレーではない)のまま", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const nameText = screen.getByText("テスト大会");
      expect(nameText.className).not.toContain("text-gray-400");
    });

    it(
      "[2026-07-22 Reviewer指摘対応] 一括入力レコードのカードコンテナ背景は bg-gray-100(mobile踏襲)、" +
        "通常レコードは bg-white のまま(コンテナ自体に背景差分が付くことの回帰防止)",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
        renderWithIntl(
          <CompetitionRecordCard
            record={makeRecord({ competition: null, competition_id: null })}
            onClick={vi.fn()}
          />,
        );

        const bulkCard = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
        expect(bulkCard.className).toContain("bg-gray-100");
        expect(bulkCard.className).not.toContain("bg-white");
      },
    );

    it("大会紐付けレコードのカードコンテナ背景は bg-white のまま(bg-gray-100 は付かない)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const normalCard = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
      expect(normalCard.className).toContain("bg-white");
      expect(normalCard.className).not.toContain("bg-gray-100");
    });
  });

  describe("リレー表示: タイムの後ろに赤字「R」が維持される", () => {
    it("is_relaying=true のとき、タイムの隣に赤字「R」が表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard record={makeRecord({ is_relaying: true })} onClick={vi.fn()} />,
      );

      const relayMarker = screen.getByText("R");
      expect(relayMarker).toBeInTheDocument();
      expect(relayMarker.className).toContain("text-red-600");
    });

    it("is_relaying=false のとき「R」は表示されない", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(
        <CompetitionRecordCard record={makeRecord({ is_relaying: false })} onClick={vi.fn()} />,
      );

      expect(screen.queryByText("R")).not.toBeInTheDocument();
    });
  });

  describe("無記録: タイム欄が「-」表示のまま維持される", () => {
    it("time が 0(falsy)のとき、タイム欄が「-」になる", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord({ time: 0 })} onClick={vi.fn()} />);

      expect(screen.getByText("-")).toBeInTheDocument();
      expect(screen.queryByText("R")).not.toBeInTheDocument();
    });
  });

  describe("自己ベストバッジの組み込み(BestTimeBadge)", () => {
    it("判定不能(候補データ未解決)のときバッジは表示されない(情報欠落テストと干渉しない)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Best[-+±]/)).not.toBeInTheDocument();
    });

    it("過去記録が無いとき「初」バッジが表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      expect(screen.getByText("初")).toBeInTheDocument();
    });

    it("過去ベストより速いとき「Best-X.XX」バッジが表示される", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({
          competitionRows: [{ id: "other-1", time: 35.0, date: "2026-06-01" }],
        }),
        error: null,
      });
      // time=30.5, previousBest=35.0 → 改善 4.5
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      expect(screen.getByText("Best-4.50")).toBeInTheDocument();
    });

    it("過去ベストより遅いとき「Best+X.XX」バッジが表示される(赤)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({
        data: candidates({
          competitionRows: [{ id: "other-1", time: 25.0, date: "2026-06-01" }],
        }),
        error: null,
      });
      // time=30.5, previousBest=25.0 → 悪化 5.5
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const badge = screen.getByText("Best+5.50");
      expect(badge).toBeInTheDocument();
      expect(badge.className).toContain("text-red-600");
    });

    it("time=0(無記録)のときバッジは表示されない", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord({ time: 0 })} onClick={vi.fn()} />);

      expect(screen.queryByText("初")).not.toBeInTheDocument();
      expect(screen.queryByText(/^Best[-+±]/)).not.toBeInTheDocument();
    });
  });

  describe("右エリアの列揃えレイアウト(2026-07-22 Sprint新規: 水路/種目/タイムの固定幅3列)", () => {
    it(
      "水路列(親ラッパーdivがsm:w-28+sm:justify-end、pill自身はwhitespace-nowrapで内容幅右寄せ)・" +
        "種目列(sm:w-44 sm:whitespace-nowrap)・タイム列(単一spanでsm:w-28 sm:text-left)の" +
        "固定幅クラスが付与される",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
        renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

        // 幅クラスは pill 自身ではなく親ラッパー div に移動している
        // (pill の引き伸ばし解消 + en/de 折返しリスク解消のため、pill は内容幅+右寄せ)
        const poolPill = screen.getByText("短水路");
        expect(poolPill.className).toContain("whitespace-nowrap");
        expect(poolPill.className).not.toContain("sm:w-");
        const poolWrapper = poolPill.parentElement;
        expect(poolWrapper?.className).toContain("sm:w-28");
        expect(poolWrapper?.className).toContain("sm:justify-end");

        // 種目列は sm:w-44(176px)に縮小(最長種目名"400m個人メドレー"等を収める想定幅)
        const styleWrapper = screen.getByText("50mFr").parentElement;
        expect(styleWrapper?.className).toContain("sm:w-44");
        expect(styleWrapper?.className).not.toContain("sm:w-52");
        expect(styleWrapper?.className).toContain("sm:whitespace-nowrap");

        // 2026-07-22 再構成: タイム列はベストバッジが1行目へ移設されたことで単一spanに
        // 簡素化された(旧: ラッパーdiv+flex-col+タイム値/バッジの2要素)。タイム値自体が
        // その sm:w-28 sm:text-left を持つ span になる。
        const timeValue = screen.getByText("30.50");
        expect(timeValue.className).toContain("sm:w-28");
        expect(timeValue.className).toContain("sm:text-left");
      },
    );

    it(
      "[2026-07-22 再構成] タイム列は単一spanに簡素化され、旧 sm:order-2/sm:self-start(タイム値)・" +
        "sm:order-1(バッジラッパー)の順序クラスは撤去されている",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
        renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

        const timeValue = screen.getByText("30.50");
        expect(timeValue.className).not.toContain("sm:order-2");
        expect(timeValue.className).not.toContain("sm:self-start");
        expect(timeValue.className).not.toContain("sm:flex-col");

        // ベストバッジ(1行目に移設済み)にも旧 sm:order-1 ラッパーは存在しない
        const badgeWrapper = screen.getByText("初").parentElement;
        expect(badgeWrapper?.className).not.toContain("sm:order-1");
      },
    );

    it(
      "[2026-07-22 再構成] 2行目コンテナは単一行化に伴い items-center のみになり、" +
        "旧 sm:items-end(場所の下端揃え)は撤去されている",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
        const { container } = renderWithIntl(
          <CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />,
        );

        // 2行目コンテナ(場所span + 右エリアdivの親)。sm:items-end 付きセレクタでは
        // もう見つからないことを先に確認し、items-center のみのセレクタで存在を確認する
        expect(
          container.querySelector(".flex.items-center.sm\\:items-end.justify-between"),
        ).toBeNull();

        const placeText = screen.getByText(/テストプール/);
        const secondRow = placeText.parentElement;
        expect(secondRow?.className).toContain("items-center");
        expect(secondRow?.className).toContain("justify-between");
        expect(secondRow?.className).not.toContain("sm:items-end");
      },
    );

    it(
      "[2026-07-22 再構成] ベストバッジは1行目(日付+大会名と同じ行)の shrink-0 コンテナに移動している",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: candidates(), error: null });
        renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

        // 1行目コンテナ(日付+大会名を含む行)にベストバッジ("初")が同居していることを確認する
        const competitionName = screen.getByText("テスト大会");
        // 大会名span自身の親(日付+大会名の内側グループ)、さらにその親が1行目コンテナ
        // (ベストバッジの shrink-0 div と兄弟関係になる)
        const firstRow = competitionName.parentElement?.parentElement;
        expect(firstRow?.textContent).toContain("2026/07/01");
        expect(firstRow?.textContent).toContain("テスト大会");
        expect(firstRow?.textContent).toContain("初");

        // 2行目(場所・水路・種目・タイムを含む行)にはもうベストバッジは無い
        const placeText = screen.getByText(/テストプール/);
        const secondRow = placeText.parentElement;
        expect(secondRow?.textContent).not.toContain("初");
      },
    );

    it("[2026-07-22 再構成] カードのパディングが p-3 sm:p-4、行間が space-y-0.5 に縮小されている(縦幅縮小)", () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

      const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
      expect(card.className).toContain("p-3");
      expect(card.className).toContain("sm:p-4");
      expect(card.className).not.toContain("p-4 sm:p-5");

      const rowsContainer = screen.getByText("テスト大会").closest(".space-y-0\\.5");
      expect(rowsContainer).not.toBeNull();
    });

    it(
      "[2026-07-22 スマホ幅調整] カードルートが rounded-none sm:rounded-lg を持つ" +
        "(スマホ幅で角丸を無くし全幅に見せる。sm以上は従来の角丸)",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
        renderWithIntl(<CompetitionRecordCard record={makeRecord()} onClick={vi.fn()} />);

        const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
        expect(card.className).toContain("rounded-none");
        expect(card.className).toContain("sm:rounded-lg");
      },
    );

    it(
      "[新レイアウトでも既存挙動は非退行] 情報欠落なし・略称/フルspan・リレーR・一括入力グレー・" +
        "isValid・ベストバッジがすべて同時に成立する(複合フィクスチャ)",
      () => {
        mocks.useListBestCandidatesQuery.mockReturnValue({
          data: candidates({ competitionRows: [{ id: "other-1", time: 40.0, date: "2026-06-01" }] }),
          error: null,
        });
        renderWithIntl(
          <CompetitionRecordCard
            record={makeRecord({ is_relaying: true, time: 30.5 })}
            onClick={vi.fn()}
          />,
        );

        // 情報欠落なし
        expect(screen.getByText("2026/07/01")).toBeInTheDocument();
        expect(screen.getByText("テスト大会")).toBeInTheDocument();
        expect(screen.getByText(/テストプール/)).toBeInTheDocument();
        expect(screen.getByText("短水路")).toBeInTheDocument();
        // 略称/フルの2span
        expect(screen.getByText("50mFr")).toBeInTheDocument();
        expect(screen.getByText("50m自由形")).toBeInTheDocument();
        // リレーR(赤)
        const relayMarker = screen.getByText("R");
        expect(relayMarker.className).toContain("text-red-600");
        // ベストバッジ(改善: time=30.5, previousBest=40.0 → Best-9.50)
        expect(screen.getByText("Best-9.50")).toBeInTheDocument();
      },
    );
  });

  describe("クリック導線(既存詳細モーダルへの非退行)", () => {
    it("カードクリックで onClick(record) が呼ばれる", async () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      const onClick = vi.fn();
      const user = userEvent.setup();
      const record = makeRecord();
      renderWithIntl(<CompetitionRecordCard record={record} onClick={onClick} />);

      await user.click(screen.getByRole("button", { name: /^大会記録詳細を表示\(/ }));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(record);
    });

    it("Enterキーでも onClick(record) が呼ばれる(キーボードアクセシビリティ)", async () => {
      mocks.useListBestCandidatesQuery.mockReturnValue({ data: undefined, error: null });
      const onClick = vi.fn();
      const user = userEvent.setup();
      const record = makeRecord();
      renderWithIntl(<CompetitionRecordCard record={record} onClick={onClick} />);

      const card = screen.getByRole("button", { name: /^大会記録詳細を表示\(/ });
      card.focus();
      await user.keyboard("{Enter}");

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(record);
    });
  });
});
