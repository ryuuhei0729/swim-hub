/**
 * TeamCompetitions — 過去大会のエントリーボタン非表示 (Sprint Contract V-01〜V-08)
 *
 * ユーザー報告: チーム詳細画面「大会」タブで、過去の大会カードの「エントリー」ボタンを
 * 押すと「大会が見つかりません」エラーモーダルが出る。
 *
 * PM 確定方針: 過去の大会 (昨日以前 = `date < today`) では「エントリー」ボタンを
 * 非表示にする (web / mobile 両方)。判定は既存の純粋関数
 * `isCompetitionDateInPast` (`packages/shared/utils/date.ts`) を使う
 * (`date < today` で true。今日・未来・null・無効な日付は false)。
 *
 * このテストは TeamCompetitions.tsx (apps/web/components/team/TeamCompetitions.tsx:731-738
 * 付近) の「エントリー」ボタンのみを対象とする。「大会が見つかりません」エラー自体の真因
 * (recordApi.getCompetitions() の個人スコープ問題) は
 * TeamCompetitionEntryModalOtherAdminCompetition.test.tsx で別途検証する。
 *
 * 【swimhub-tasks #60 / #112 (2026-11-28) で仕様変更】
 * mobile (apps/mobile/components/teams/TeamCompetitionList.tsx) と同じ出し分けにした:
 *   - 明日以降の大会: 「エントリー」だけ (管理者も同じ)
 *   - 今日・過去の大会 (と不正な日付): 「記録」だけ
 *     (利用者ビューは「自分の記録を追加」、管理者ビューは「記録入力」= 代理入力)
 *   - 管理者ビューには「自分の記録を追加」を出さない
 * 判定は isEntryTabVisible (未来のみ true)。今日・不正値・null の扱いが変わったケース
 * ([V-02][V-04][V-05][SC19]) は新仕様に合わせて書き換えている。
 */

import React from "react";
import { renderWithI18n as render, screen } from "@/__tests__/helpers/teamQueryTestUtils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays, format, subDays } from "date-fns";

// 固定日付ハードコード禁止: 実行日からの相対で past/today/future を導出する
const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 1), "yyyy-MM-dd"); // 昨日 (過去)
const TODAY_DATE = format(NOW, "yyyy-MM-dd"); // 今日 (過去に含めない境界値)
const FUTURE_DATE = format(addDays(NOW, 1), "yyyy-MM-dd"); // 明日 (未来)
const INVALID_DATE = "not-a-date"; // 不正フォーマット (境界値)

// 本人の目標バッジ用フック (React Query)。この画面テストの関心外なので「目標なし」で固定する
// (QueryClientProvider を持たないテストで useQuery が落ちるのを避ける)
vi.mock("@apps/shared/hooks/queries/goalTargets");

vi.mock("@/i18n/navigation");

const mocks = vi.hoisted(() => ({
  entryModalSpy: vi.fn(),
}));

// TeamCompetitionEntryModal の中身はこのテストの関心事ではない。
// 「ボタンが押されて isOpen: true で呼ばれたか」の配線だけを spy で捕捉する。
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.entryModalSpy(props);
    return props.isOpen ? <div data-testid="entry-modal-stub" /> : null;
  },
}));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));

function buildCompetitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "competition-1",
    user_id: "member-1",
    team_id: "team-1",
    title: "対象大会",
    date: TODAY_DATE,
    place: "県営プール",
    pool_type: 0,
    entry_status: "open",
    note: null,
    created_at: "2026-07-20T00:00:00Z",
    created_by: "member-1",
    users: { name: "選手A" },
    created_by_user: null,
    records: [],
    entries: [],
    ...overrides,
  };
}

function buildSupabaseMock(rows: ReturnType<typeof buildCompetitionRow>[]) {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

// 大会カードと操作は予定タブ (TeamSchedule) と同じ useTeamCompetitionActions。一覧の取得はテスト用の描画側
import { TeamCompetitions } from "@/__tests__/utils/teamScheduleCardRenderers";

describe("TeamCompetitions — 過去大会のエントリーボタン非表示", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({
      user: { id: "member-1" },
      supabase: buildSupabaseMock([]),
    }));
  });

  it("[V-01] 過去日 (昨日) の大会ではエントリーボタンが表示されない", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: PAST_DATE, title: "過去大会V01" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V01");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
  });

  it("[境界値 V-02] 今日の大会ではエントリーボタンを出さず「自分の記録を追加」を出す", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: TODAY_DATE, title: "本日大会V02" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("本日大会V02");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "自分の記録を追加" })).toBeDefined();
  });

  it("[境界値 V-03] 明日の大会ではエントリーボタンが表示される", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: FUTURE_DATE, title: "明日大会V03" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("明日大会V03");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    // 明日以降の大会は記録の導線を出さない
    expect(screen.queryByRole("button", { name: "自分の記録を追加" })).toBeNull();
  });

  // 【解消済み・履歴メモ】Phase A の QA 実測時点では TeamCompetitions.tsx:651 の
  // `format(new Date(competition.date + "T00:00:00"), ...)` が isValid() チェック無しで
  // 呼ばれており (CLAUDE.md ルール#3 違反)、不正/null な date で
  // RangeError: Invalid time value を投げてコンポーネント全体がクラッシュしていた
  // (Critical として報告済み)。Phase B で Web Dev が isValid() ガードを追加済みで、
  // 現在この V-04/V-05 は GREEN (QA 実測で確認済み)。`competitions.date` は DB スキーマ上
  // `date NOT NULL` (initial_schema.sql:666) で実運用データでは到達不能なケースだが、
  // 防御的な境界値として引き続き検証する。
  it("[境界値 V-04] date が不正フォーマットの場合はエントリーボタンを出さず記録の導線に倒す (isEntryTabVisible=false)", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: INVALID_DATE, title: "不正日付大会V04" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("不正日付大会V04");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "自分の記録を追加" })).toBeDefined();
  });

  it("[境界値 V-05] date が null (防御的: 型はstringだが実データ異常を想定) の場合はエントリーボタンを出さない", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: null, title: "日付なし大会V05" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("日付なし大会V05");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
  });

  // 【swimhub-tasks #60 で再変更】以前は admin だけ過去日でも「エントリー」を出していた (R9) が、
  // mobile に合わせて admin も「明日以降はエントリー、今日・過去は記録入力」の出し分けにした。
  // 管理者ビューには「自分の記録を追加」も出さない (#112)。
  it("[SC19] admin: 過去日は「記録入力」だけを出す (エントリー・自分の記録を追加は出さない)", async () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([
        buildCompetitionRow({ date: PAST_DATE, title: "過去大会admin" }),
      ]),
    }));
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("過去大会admin");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "記録入力" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "自分の記録を追加" })).toBeNull();
  });

  it("admin: 今日の大会も「記録入力」だけを出す", async () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([
        buildCompetitionRow({ date: TODAY_DATE, title: "本日大会admin" }),
      ]),
    }));
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("本日大会admin");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "記録入力" })).toBeDefined();
  });

  it("admin: 明日以降の大会は「エントリー」だけを出す (記録入力・自分の記録を追加は出さない)", async () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([
        buildCompetitionRow({ date: FUTURE_DATE, title: "明日大会admin" }),
      ]),
    }));
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("明日大会admin");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "記録入力" })).toBeNull();
    expect(screen.queryByRole("button", { name: "自分の記録を追加" })).toBeNull();
  });

  it("[SC20] 非admin: 過去日では「エントリー」ボタンが表示されない (従来どおり)", async () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({
      user: { id: "member-1" },
      supabase: buildSupabaseMock([
        buildCompetitionRow({ date: PAST_DATE, title: "過去大会非admin" }),
      ]),
    }));
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会非admin");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
  });

  it("[V-07] 過去日で「自分の記録を追加」ボタンは引き続き表示される (エントリーボタンのみが対象)", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: PAST_DATE, title: "過去大会V07" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V07");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "自分の記録を追加" })).toBeDefined();
  });

  it("[V-08] 過去日ではエントリーボタンが押せないため、エントリー管理モーダルは一度も開かれない", async () => {
    vi.mocked(useAuth).mockReturnValue(
      buildAuthContext({
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: PAST_DATE, title: "過去大会V08" }),
        ]),
      }),
    );
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V08");
    expect(screen.queryByTestId("entry-modal-stub")).toBeNull();
    // モーダルは showEntryModal && selectedCompetition のときのみ条件付きレンダリングされる
    // (TeamCompetitions.tsx:869) ため、ボタンが押せなければ一度もマウントされない
    expect(mocks.entryModalSpy).not.toHaveBeenCalled();
  });
});
