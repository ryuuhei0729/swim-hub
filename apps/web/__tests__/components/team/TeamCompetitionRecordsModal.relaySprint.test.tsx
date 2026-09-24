/**
 * TeamCompetitionRecordsModal (web) — Sprint Contract「チーム大会タブ 記録一覧モーダル改修」
 *
 * 既存の `TeamCompetitionRecordsModal.test.ts` は `buildDisplaySplits` の純関数テストのみで
 * 現行コンポーネント (個人/リレーを is_relaying で単純 filter する旧実装) を対象にしている。
 * 本ファイルは今回のスプリントで変わる部分 (SC1〜SC6) のみを対象にした新規テストで、
 * 既存ファイルとは独立に追加する (既存テストは split 機能が変わらない限り生き続ける)。
 *
 * 実装未着手の時点でこのテストは失敗する。それが期待動作 (テストを緩めない)。
 *
 * 検証観点 (Verification Checklist):
 *   [V-01/SC1] 個人種目行の Best バッジは「その記録の持ち主の userId」で判定される
 *              (ログインユーザーの id が紛れ込んでいないこと)
 *   [V-03/SC3] リレー第1泳者 (is_relaying=false) の行が、relay_records に組まれている場合
 *              個人種目一覧に混入しない (現行バグの回帰防止)
 *   [V-04/SC4] relay_records に紐づかない is_relaying 行は消えず表示され続ける (厳密一致)
 *   [V-02] relay_records に載っているリレーはレグ個別行ではなく1チーム=1行で表示され、
 *          展開すると各泳者が見える
 *   [SC5 (2026-09-21 ユーザー指示変更で確定)] 種目内の全記録のタイムが一律で
 *          `text-blue-600 font-bold` になる (1位も2位以降も出し分けない)。
 *          赤 (`text-red-600`) はタイム表示に使われない (陰性チェックはテーブル内にスコープする。
 *          `({N}件)` 見出しバッジは `text-blue-600` のみで `font-bold` を伴わないため、
 *          `.text-blue-600.font-bold` の組み合わせ selector で自然に除外される)
 *   [変更B (2026-09-21)] web のみ: Best バッジはタイムと同じ行・すぐ隣に表示される
 *          (`inline-flex items-center gap-1.5` の中に time span と並ぶ)。mobile は
 *          スプリットトグル行の右端のまま据え置き (SC8 の意図的な例外)
 *   [SC9] 種目見出しの件数 `({N}件)` はリレーレグ除外後の可視行数と一致する
 *   [Boundary] relay_record_legs.user_id/record_id が null でもクラッシュしない
 *   [Boundary] 同一大会・同一種目に2チーム → 別行として分離される
 *
 * SC6 のアバター表示は Avatar.tsx の実装詳細 (フォールバック文言等) までは厳密に
 * assert しない (クラッシュしないこと・表示されることまでを検証する)。
 *
 * トートロジー防止: BestTimeBadge / TeamRelayRecordsAPI をスタブ化し、
 * モーダルが「正しい引数を渡しているか」を props スパイで検証する
 * (バッジ自体の内部ロジックは BestTimeBadge.userIdProp.test.tsx で別途検証済み)。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";

interface QueryResponse<T> {
  data: T;
  error: { message: string } | null;
}

interface ChainableBuilder<T> {
  select: (cols: string) => ChainableBuilder<T>;
  eq: (column: string, value: unknown) => ChainableBuilder<T>;
  order: (column: string, opts: { ascending: boolean }) => ChainableBuilder<T>;
  single: () => Promise<QueryResponse<T>>;
  then: <TResult1 = QueryResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
}

function makeQueryBuilder<T>(response: QueryResponse<T>) {
  const builder: ChainableBuilder<T> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(response)),
    then: (onfulfilled, onrejected) => Promise.resolve(response).then(onfulfilled, onrejected),
  };
  return builder;
}

function makeSupabaseMock(options: {
  competition: Record<string, unknown> | null;
  records: Array<Record<string, unknown>>;
}) {
  const compBuilder = makeQueryBuilder({ data: options.competition, error: null });
  const recordsBuilder = makeQueryBuilder({ data: options.records, error: null });
  const from = vi.fn((table: string) => {
    if (table === "competitions") return compBuilder;
    if (table === "records") return recordsBuilder;
    throw new Error(`makeSupabaseMock: 未対応テーブル ${table}`);
  });
  return { from } as unknown as Record<string, unknown>;
}

const STYLE = { id: 30, name_jp: "自由形", name: "Fr", style: "Fr", distance: 50 };

/** SC2 の折りたたみ行ラベル。teams.ranking.relay.eventLabel = "{distance}m×{legCount} {kind}" */
const RELAY_EVENT_LABEL = "50m×4 フリーリレー";

function makeRelayRecordWithLegs(overrides: Record<string, unknown> = {}) {
  return {
    id: "relay-1",
    teamId: "team-1",
    competitionId: "comp-relay",
    relayKind: "free",
    legDistance: 50,
    legCount: 4,
    poolType: 0,
    genderCategory: "mixed",
    totalTime: 120.0,
    createdAt: null,
    legs: [
      {
        id: "leg-0",
        legIndex: 0,
        userId: "member-b",
        styleId: STYLE.id,
        legTime: 28.5,
        reactionTime: 0.65,
        recordId: "rec-leg0",
        userName: "リレー第一泳者B",
        profileImagePath: null,
        styleNameJp: "自由形",
        styleDistance: 50,
      },
      {
        id: "leg-1",
        legIndex: 1,
        userId: "member-d",
        styleId: STYLE.id,
        legTime: 31.0,
        reactionTime: null,
        recordId: "rec-leg1",
        userName: "泳者D",
        profileImagePath: null,
        styleNameJp: "自由形",
        styleDistance: 50,
      },
      {
        id: "leg-2",
        legIndex: 2,
        userId: null,
        styleId: STYLE.id,
        legTime: 31.5,
        reactionTime: null,
        recordId: null,
        userName: null,
        profileImagePath: null,
        styleNameJp: "自由形",
        styleDistance: 50,
      },
      {
        id: "leg-3",
        legIndex: 3,
        userId: "member-e",
        styleId: STYLE.id,
        legTime: 29.0,
        reactionTime: null,
        recordId: "rec-leg3",
        userName: "泳者E",
        profileImagePath: null,
        styleNameJp: "自由形",
        styleDistance: 50,
      },
    ],
    ...overrides,
  };
}

function baseCompetitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "comp-1",
    title: "テスト大会",
    date: "2026-09-01",
    place: null,
    pool_type: 0,
    note: null,
    ...overrides,
  };
}

function recordRow(overrides: Record<string, unknown>) {
  return {
    id: "rec-default",
    user_id: "u-default",
    style_id: STYLE.id,
    time: 30,
    reaction_time: null,
    is_relaying: false,
    note: null,
    pool_type: 0,
    users: { name: "選手" },
    styles: STYLE,
    split_times: [],
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  bestTimeBadgeSpy: vi.fn(),
  getByCompetition: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: { id: "logged-in-user" } })),
}));

vi.mock("@/components/ui/BestTimeBadge", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.bestTimeBadgeSpy(props);
    return React.createElement("span", { "data-testid": "best-badge-stub" });
  },
}));

vi.mock("@apps/shared/api/teams/relayRecords", () => ({
  TeamRelayRecordsAPI: { getByCompetition: mocks.getByCompetition },
}));

import TeamCompetitionRecordsModal from "../../../components/team/TeamCompetitionRecordsModal";

function renderModal(props: Partial<React.ComponentProps<typeof TeamCompetitionRecordsModal>> = {}) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TeamCompetitionRecordsModal
        isOpen
        onClose={vi.fn()}
        competitionId={props.competitionId ?? "comp-1"}
        competitionTitle={props.competitionTitle ?? "テスト大会"}
      />
    </NextIntlClientProvider>,
  );
}

describe("TeamCompetitionRecordsModal (web) — relay grouping & best badge sprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByCompetition.mockResolvedValue([]);
  });

  describe("[V-01/SC1] Best バッジは記録の持ち主の userId で判定される", () => {
    it("個人種目行の BestTimeBadge に、ログインユーザーではなくその記録の user_id が渡る", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
        ],
      });

      renderModal();

      await screen.findByText("個人選手A");

      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          recordId: "rec-ind-a",
          userId: "member-a",
          isRelaying: false,
        }),
      );
      const calledUserIds = mocks.bestTimeBadgeSpy.mock.calls.map((call) => call[0]?.userId);
      expect(calledUserIds).not.toContain("logged-in-user");
    });
  });

  describe("[V-03/SC3] リレー第1泳者の行が個人種目一覧に混入しない (現行バグの回帰防止)", () => {
    it("relay_records の leg0 と record_id が一致する records 行は個人一覧から除外される", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
          // relay_records leg0 の recordId ("rec-leg0") と一致する = グルーピング対象の幽霊行
          recordRow({
            id: "rec-leg0",
            user_id: "member-b",
            time: 28.5,
            is_relaying: false,
            users: { name: "リレー第一泳者B" },
          }),
          // leg1/leg3 (is_relaying=true) も relay_records に組まれている想定
          recordRow({
            id: "rec-leg1",
            user_id: "member-d",
            time: 31.0,
            is_relaying: true,
            users: { name: "泳者D" },
          }),
          recordRow({
            id: "rec-leg3",
            user_id: "member-e",
            time: 29.0,
            is_relaying: true,
            users: { name: "泳者E" },
          }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      await screen.findByText("個人選手A");
      // 折りたたみ状態 (展開前) のまま検証する
      expect(screen.queryByText("リレー第一泳者B")).toBeNull();
      expect(screen.queryByText("泳者D")).toBeNull();
      expect(screen.queryByText("泳者E")).toBeNull();
    });

    it("展開するとグルーピングされた第1泳者の名前が team 行の中に見つかる (消えたのではなく移動しただけ)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({
            id: "rec-leg0",
            user_id: "member-b",
            time: 28.5,
            is_relaying: false,
            users: { name: "リレー第一泳者B" },
          }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      fireEvent.click(teamRowLabel);

      // 実装は「第1泳者 / 氏名」を1つの <span> にまとめて表示するため (第N泳者ラベルとの
      // 結合表示)、氏名だけの完全一致では見つからない。部分一致で探す。
      await screen.findByText("リレー第一泳者B", { exact: false });
    });
  });

  describe("[V-04/SC4] relay_records に紐づかない is_relaying 行は消えず表示され続ける", () => {
    it("孤立した is_relaying=true 行がちょうど1件、そのまま表示される (厳密一致)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({
            id: "rec-orphan",
            user_id: "member-c",
            time: 45.0,
            is_relaying: true,
            users: { name: "孤立リレー選手C" },
          }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([]);

      renderModal();

      const matches = await screen.findAllByText("孤立リレー選手C");
      expect(matches).toHaveLength(1);
    });
  });

  describe("[V-02] relay_records のリレーは1チーム=1行で表示され、展開すると各泳者の区間タイムが見える", () => {
    it("折りたたみ時は個別レグの名前が出ず、種目ラベル (teams.ranking.relay.eventLabel) が1回だけ出る", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const labels = await screen.findAllByText(RELAY_EVENT_LABEL);
      expect(labels).toHaveLength(1);
      expect(screen.queryByText("泳者D")).toBeNull();
    });

    it("展開すると4名のレグ (userId が null のレグを除き3名) の名前と Best バッジが現れる", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      fireEvent.click(teamRowLabel);

      // 実装は「第N泳者 / 氏名」を1つの <span> にまとめて表示するため部分一致で探す。
      await screen.findByText("リレー第一泳者B", { exact: false });
      expect(screen.getByText("泳者D", { exact: false })).toBeDefined();
      expect(screen.getByText("泳者E", { exact: false })).toBeDefined();

      // 裁定3: レグ行の Best バッジは isRelaying=true, styleId=leg.styleId, userId=leg.userId,
      // recordId=leg.recordId で判定する
      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "member-b",
          recordId: "rec-leg0",
          styleId: STYLE.id,
          isRelaying: true,
        }),
      );
      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "member-d",
          recordId: "rec-leg1",
          isRelaying: true,
        }),
      );

      // userId が null のレグ (leg2) では Best バッジを呼ばない、または null userId で呼ばない
      const calledUserIds = mocks.bestTimeBadgeSpy.mock.calls.map((call) => call[0]?.userId);
      expect(calledUserIds).not.toContain(null);
      expect(calledUserIds).not.toContain(undefined);
    });

    it("[Boundary] 同一大会・同一種目に2チーム登録されていても行が分離される", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([
        makeRelayRecordWithLegs({ id: "relay-team-a", teamId: "team-a", totalTime: 120.0 }),
        makeRelayRecordWithLegs({ id: "relay-team-b", teamId: "team-b", totalTime: 118.2 }),
      ]);

      renderModal();

      const labels = await screen.findAllByText(RELAY_EVENT_LABEL);
      expect(labels).toHaveLength(2);
    });
  });

  describe("[SC5] 種目内の全記録のタイムが一律で青+太字になる (1位も2位以降も、厳密一致)", () => {
    it("2件の個人記録がどちらも text-blue-600 font-bold を持つ (件数は厳密一致)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-fast", user_id: "member-a", time: 25.0, users: { name: "選手速い" } }),
          recordRow({ id: "rec-slow", user_id: "member-b", time: 30.0, users: { name: "選手遅い" } }),
        ],
      });

      const { container } = renderModal();
      await screen.findByText("選手速い");

      // `.text-blue-600.font-bold` の組み合わせ selector を使う: 種目見出しの件数バッジ
      // ({N}件) は `text-sm text-blue-600` のみで font-bold を伴わないため、
      // 広い正規表現 (/text-blue-600/) と違い誤検知しない。
      const blueBoldTimes = container.querySelectorAll("span.text-blue-600.font-bold");
      expect(blueBoldTimes).toHaveLength(2);

      // 旧仕様 (1位のみ強調) への逆行防止: 2位の記録側にも同じクラスが付いていること
      const slowerRow = screen.getByText("選手遅い").closest("tr");
      expect(slowerRow?.querySelector("span.text-blue-600.font-bold")).not.toBeNull();
    });

    it("タイム表示に赤 (text-red-600) は使われない (陰性チェックはテーブル内にスコープ)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-fast", user_id: "member-a", time: 25.0, users: { name: "選手速い" } }),
          recordRow({ id: "rec-slow", user_id: "member-b", time: 30.0, users: { name: "選手遅い" } }),
        ],
      });

      const { container } = renderModal();
      await screen.findByText("選手速い");

      // error 表示 (loadError) の text-red-600 は現役のため、コンテナ全体ではなく
      // 記録テーブル (table) 内だけを対象に陰性チェックする。
      const tables = container.querySelectorAll("table");
      for (const table of tables) {
        expect(table.querySelectorAll(".text-red-600")).toHaveLength(0);
      }
    });

    it("リレー折りたたみ行の総合タイムも同じ青+太字トークンを持つ", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      const { container } = renderModal();
      await screen.findByText(RELAY_EVENT_LABEL);

      // チーム総合タイムは <td> 自体に class が付く (span ラップではない実装のため、
      // td.text-blue-600.font-bold で検証する)。
      const totalTimeCell = container.querySelector("td.text-blue-600.font-bold");
      expect(totalTimeCell).not.toBeNull();
    });
  });

  describe("[変更B] web: Best バッジはタイムと同じ行・すぐ隣に表示される (mobile は据え置き)", () => {
    it("個人種目行で、タイムと BestTimeBadge が同じインラインコンテナに同居する", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
        ],
      });

      const { container } = renderModal();
      await screen.findByText("個人選手A");

      const timeSpan = container.querySelector("span.text-blue-600.font-bold");
      expect(timeSpan).not.toBeNull();
      const inlineRow = timeSpan!.closest(".inline-flex");
      expect(inlineRow).not.toBeNull();
      expect(inlineRow!.querySelector('[data-testid="best-badge-stub"]')).not.toBeNull();
    });

    it("Best バッジには compact: true が渡る (個人種目行・リレーレグ行の両方)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();
      await screen.findByText("個人選手A");
      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: "rec-ind-a", compact: true }),
      );

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      fireEvent.click(teamRowLabel);
      await screen.findByText("リレー第一泳者B", { exact: false });
      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: "rec-leg0", compact: true }),
      );
    });
  });

  describe("[SC9] 種目見出しの件数はリレーレグ除外後の可視行数と一致する", () => {
    it("relay_records にグルーピングされたレグを除いた可視行数が見出しに表示される", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
          recordRow({ id: "rec-ind-f", user_id: "member-f", time: 32.0, users: { name: "個人選手F" } }),
          // relay_records にグルーピングされる (leg0/leg1) → 個人一覧から除外され、
          // 見出しの件数にも含まれない
          recordRow({
            id: "rec-leg0",
            user_id: "member-b",
            time: 28.5,
            is_relaying: false,
            users: { name: "リレー第一泳者B" },
          }),
          recordRow({
            id: "rec-leg1",
            user_id: "member-d",
            time: 31.0,
            is_relaying: true,
            users: { name: "泳者D" },
          }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();
      await screen.findByText("個人選手A");

      // 可視行数 = 個人2件 (rec-ind-a, rec-ind-f)。レグ扱いの2件は数えない (ゴーストカウント防止)。
      expect(screen.getByText("(2件)")).toBeDefined();
    });

    it("可視行数が0になる種目カードは表示されない (全記録がリレーレグとして除外される場合)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({
            id: "rec-leg0",
            user_id: "member-b",
            time: 28.5,
            is_relaying: false,
            users: { name: "リレー第一泳者B" },
          }),
          recordRow({
            id: "rec-leg1",
            user_id: "member-d",
            time: 31.0,
            is_relaying: true,
            users: { name: "泳者D" },
          }),
          recordRow({
            id: "rec-leg3",
            user_id: "member-e",
            time: 29.0,
            is_relaying: true,
            users: { name: "泳者E" },
          }),
        ],
      });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();
      // リレーのグループブロックは表示される (折りたたみ行として)
      await screen.findByText(RELAY_EVENT_LABEL);
      // 「自由形」の個人種目カード見出しは、可視行数が0のため出ない
      expect(screen.queryByText("自由形")).toBeNull();
    });
  });

  describe("[Boundary] relay_record_legs.user_id / record_id が null でもクラッシュしない", () => {
    it("null レグを含む relay_records を展開してもエラーにならず表示できる", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      expect(() => fireEvent.click(teamRowLabel)).not.toThrow();
      await waitFor(() =>
        expect(screen.getByText("リレー第一泳者B", { exact: false })).toBeDefined(),
      );
    });
  });
});
