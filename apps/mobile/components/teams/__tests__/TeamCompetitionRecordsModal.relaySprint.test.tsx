/**
 * TeamCompetitionRecordsModal (mobile) — Sprint Contract「チーム大会タブ 記録一覧モーダル改修」
 *
 * 既存の `TeamCompetitionRecordsModal.test.tsx` は現行実装 (個人/リレーを is_relaying で
 * 独立採番するグルーピング。`apps/mobile/utils/teamCompetitionRecords.ts`) を対象にしている。
 * 本ファイルは今回のスプリントで変わる部分 (SC1〜SC6) のみを対象にした新規テストで、
 * 既存ファイルとは独立に追加する。
 *
 * 実装未着手の時点でこのテストは失敗する。それが期待動作 (テストを緩めない)。
 *
 * 検証観点は web 版 (TeamCompetitionRecordsModal.relaySprint.test.tsx) と同一の
 * Sprint Contract に基づく (SC8: web/mobile パリティ)。
 *
 * [SC5 (2026-09-21 ユーザー指示変更で確定)] 種目内の全記録のタイムが一律で青+太字
 * (#2563EB / fontWeight "700") になる。1位も2位以降も出し分けない。
 * [変更B (2026-09-21)] mobile は据え置き: Best バッジはスプリットトグルと同じ行の
 * 右端のまま (web だけタイムと同じ行に変更された。SC8 の意図的な例外)。
 * SC1-b (splits 0件でもバッジは出る) は mobile では引き続き要検証。
 * SC6 (アバター表示) は Avatar 実装詳細までは厳密に assert しない
 * (クラッシュしないこと・表示されることまでを検証する)。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
    pool_type: 0,
    note: null,
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

vi.mock("@/components/records/BestTimeBadge", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.bestTimeBadgeSpy(props);
    return React.createElement("span", { "data-testid": "best-badge-stub" });
  },
}));

vi.mock("@/components/records/LapTimeDisplay", () => ({
  LapTimeDisplay: () => React.createElement("div", { "data-testid": "lap-time-display" }),
}));

vi.mock("@apps/shared/api/teams/relayRecords", () => ({
  TeamRelayRecordsAPI: { getByCompetition: mocks.getByCompetition },
}));

import { TeamCompetitionRecordsModal } from "../TeamCompetitionRecordsModal";

function renderModal(props: Partial<React.ComponentProps<typeof TeamCompetitionRecordsModal>> = {}) {
  return render(
    <TeamCompetitionRecordsModal
      visible
      onClose={vi.fn()}
      competitionId={props.competitionId ?? "comp-1"}
      competitionTitle={props.competitionTitle ?? "テスト大会"}
    />,
  );
}

describe("TeamCompetitionRecordsModal (mobile) — relay grouping & best badge sprint", () => {
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
          // PM 追加裁定その3: 本モーダルからは compact を渡す (密なリスト行向け)。
          compact: true,
        }),
      );
      const calledUserIds = mocks.bestTimeBadgeSpy.mock.calls.map((call) => call[0]?.userId);
      expect(calledUserIds).not.toContain("logged-in-user");
    });

    it("[2026-09-21 pool_type修正] Best バッジには record.pool_type が渡る (competition.pool_type にフォールバックしない)", async () => {
      // 大会は短水路 (0)、記録自身は長水路 (1) — 意図的に食い違わせることで、
      // どちらの値が読まれても同じ結果になる罠 (legCount バグと同型) を避ける。
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow({ pool_type: 0 }),
        records: [
          recordRow({
            id: "rec-ind-a",
            user_id: "member-a",
            time: 30.11,
            pool_type: 1,
            users: { name: "個人選手A" },
          }),
        ],
      });

      renderModal();
      await screen.findByText("個人選手A");

      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: "rec-ind-a", poolType: 1 }),
      );
      const calledPoolTypes = mocks.bestTimeBadgeSpy.mock.calls.map((call) => call[0]?.poolType);
      expect(calledPoolTypes).not.toContain(0);
    });
  });

  describe("[V-03/SC3] リレー第1泳者の行が個人種目一覧に混入しない (現行バグの回帰防止)", () => {
    it("relay_records の leg0 と record_id が一致する records 行は個人一覧から除外される", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
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

      await screen.findByText("個人選手A");
      expect(screen.queryByText("リレー第一泳者B")).toBeNull();
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

      await screen.findByText("リレー第一泳者B");
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
    it("折りたたみ時は個別レグの名前が出ず、種目ラベルが1回だけ出る", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const labels = await screen.findAllByText(RELAY_EVENT_LABEL);
      expect(labels).toHaveLength(1);
      expect(screen.queryByText("泳者D")).toBeNull();
    });

    it("展開すると各レグの名前と Best バッジが現れる (裁定3の props で判定される)", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      fireEvent.click(teamRowLabel);

      await screen.findByText("リレー第一泳者B");
      expect(screen.getByText("泳者D")).toBeDefined();
      expect(screen.getByText("泳者E")).toBeDefined();

      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "member-b",
          recordId: "rec-leg0",
          styleId: STYLE.id,
          isRelaying: true,
          // PM 追加裁定その3: 本モーダルの Best バッジは3系統すべて (個人種目行・
          // 孤立リレー行・グルーピング済みリレーのレグ行) で compact になる。
          compact: true,
        }),
      );

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

    it("[確定バグ1] legCount が異なる2チームが同一種目 (relayKind+legDistance) に混在すると、各チームが自分の legCount でラベル表示される", async () => {
      const teamA = makeRelayRecordWithLegs({ id: "relay-team-a", teamId: "team-a", totalTime: 120.0 });
      const teamB = makeRelayRecordWithLegs({
        id: "relay-team-b",
        teamId: "team-b",
        totalTime: 118.2,
        legCount: 3,
        legs: [
          {
            id: "legb-0",
            legIndex: 0,
            userId: "member-x",
            styleId: STYLE.id,
            legTime: 30.0,
            reactionTime: null,
            recordId: "rec-legb0",
            userName: "選手X",
            profileImagePath: null,
            styleNameJp: "自由形",
            styleDistance: 50,
          },
          {
            id: "legb-1",
            legIndex: 1,
            userId: "member-y",
            styleId: STYLE.id,
            legTime: 29.0,
            reactionTime: null,
            recordId: "rec-legb1",
            userName: "選手Y",
            profileImagePath: null,
            styleNameJp: "自由形",
            styleDistance: 50,
          },
          {
            id: "legb-2",
            legIndex: 2,
            userId: "member-z",
            styleId: STYLE.id,
            legTime: 29.2,
            reactionTime: null,
            recordId: "rec-legb2",
            userName: "選手Z",
            profileImagePath: null,
            styleNameJp: "自由形",
            styleDistance: 50,
          },
        ],
      });
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([teamA, teamB]);

      renderModal();

      // 4人編成のチームAは "50m×4 フリーリレー"、3人編成のチームBは "50m×3 フリーリレー"。
      // 【確定バグ1・修正済み】かつて groupRelayRecordsByEvent がグループ単位で legCount を
      // 1つに固定していたため、両チームが同じ legCount のラベルになる回帰があった。
      // `RelayEventGroup` から `legCount` フィールド自体が削除され、呼び出し元が
      // `team.legCount` を読むよう修正済み。回帰防止のためこのテストを固定する。
      await waitFor(() => expect(screen.queryAllByText(/フリーリレー$/).length).toBeGreaterThan(0));
      expect(screen.queryAllByText("50m×4 フリーリレー")).toHaveLength(1);
      expect(screen.queryAllByText("50m×3 フリーリレー")).toHaveLength(1);
    });
  });

  describe("[Boundary] relay_record_legs.user_id / record_id が null でもクラッシュしない", () => {
    it("null レグを含む relay_records を展開してもエラーにならず表示できる", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();

      const teamRowLabel = await screen.findByText(RELAY_EVENT_LABEL);
      expect(() => fireEvent.click(teamRowLabel)).not.toThrow();
      await waitFor(() => expect(screen.getByText("リレー第一泳者B")).toBeDefined());
    });
  });

  describe("[SC5] 種目内の全記録のタイムが一律で青+太字になる (1位も2位以降も、厳密一致)", () => {
    it("2件の個人記録がどちらも #2563EB / fontWeight 700 を持つ", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-fast", user_id: "member-a", time: 25.0, users: { name: "選手速い" } }),
          recordRow({ id: "rec-slow", user_id: "member-b", time: 30.0, users: { name: "選手遅い" } }),
        ],
      });

      renderModal();
      await screen.findByText("選手速い");

      const fastTime = screen.getByText("25.00") as HTMLElement;
      const slowTime = screen.getByText("30.00") as HTMLElement;
      // 旧仕様 (1位のみ強調) への逆行防止: 2位の記録側にも同じ色・太さが付いていること
      for (const el of [fastTime, slowTime]) {
        expect(el.style.color).toBe("rgb(37, 99, 235)"); // #2563EB
        expect(el.style.fontWeight).toBe("700");
      }
    });

    it("タイム表示に赤 (#DC2626) は使われない", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-fast", user_id: "member-a", time: 25.0, users: { name: "選手速い" } }),
        ],
      });

      renderModal();
      const fastTime = (await screen.findByText("25.00")) as HTMLElement;
      expect(fastTime.style.color).not.toBe("rgb(220, 38, 38)"); // #DC2626
    });

    it("リレー折りたたみ行の総合タイムも同じ青+太字トークンを持つ", async () => {
      mocks.supabase = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.getByCompetition.mockResolvedValue([makeRelayRecordWithLegs()]);

      renderModal();
      await screen.findByText(RELAY_EVENT_LABEL);

      const totalTime = screen.getByText("2:00.00") as HTMLElement; // totalTime: 120.0 秒
      expect(totalTime.style.color).toBe("rgb(37, 99, 235)");
      expect(totalTime.style.fontWeight).toBe("700");
    });
  });

  describe("[SC1-b] mobile: splits が0件でも Best バッジは表示される (スプリットトグルと同じ行の右端)", () => {
    it("split_times が空でも Best バッジが呼ばれる (メタ行自体が省略されない)", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({
            id: "rec-nosplits",
            user_id: "member-a",
            time: 30.11,
            users: { name: "スプリット無し選手" },
            split_times: [],
          }),
        ],
      });

      renderModal();
      await screen.findByText("スプリット無し選手");

      expect(mocks.bestTimeBadgeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ recordId: "rec-nosplits", compact: true }),
      );
      // スプリットトグル (「スプリットタイム」文言) 自体は出ない
      expect(screen.queryByText(/スプリットタイム/)).toBeNull();
    });
  });

  describe("[SC9] 種目見出しの件数はリレーレグ除外後の可視行数と一致する", () => {
    it("relay_records にグルーピングされたレグを除いた可視行数が見出しに表示される", async () => {
      mocks.supabase = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [
          recordRow({ id: "rec-ind-a", user_id: "member-a", time: 30.11, users: { name: "個人選手A" } }),
          recordRow({ id: "rec-ind-f", user_id: "member-f", time: 32.0, users: { name: "個人選手F" } }),
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

      // common.listToolbar.itemCount = "{count}件" (web のような括弧はmobileには無い)
      expect(screen.getByText("2件")).toBeDefined();
    });
  });
});
