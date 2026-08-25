/**
 * TeamCompetitions — 過去大会のエントリーボタン非表示 (Sprint Contract V-01〜V-08)
 *
 * ユーザー報告: チーム詳細画面「大会」タブで、過去の大会カードの「エントリー」ボタンを
 * 押すと「大会が見つかりません」エラーモーダルが出る。
 *
 * PM 確定方針: 過去の大会 (昨日以前 = `date < today`) では「エントリー」ボタンを
 * 非表示にする (web / mobile 両方)。判定は既存の純粋関数
 * `isCompetitionDateInPast` (`apps/shared/utils/date.ts`) を使う
 * (`date < today` で true。今日・未来・null・無効な日付は false)。
 *
 * このテストは TeamCompetitions.tsx (apps/web/components/team/TeamCompetitions.tsx:731-738
 * 付近) の「エントリー」ボタンのみを対象とする。「大会が見つかりません」エラー自体の真因
 * (recordApi.getCompetitions() の個人スコープ問題) は
 * TeamCompetitionEntryModalOtherAdminCompetition.test.tsx で別途検証する。
 *
 * 実装前の現時点では isCompetitionDateInPast によるガードが存在しないため、
 * 過去日を隠す系のテスト ([V-01][V-06][V-07]) は RED になる想定。
 * 今日/未来/不正値でボタンが出続けるテスト ([V-02][V-03][V-04][V-05]) は
 * 現行実装でもガード無しで無条件表示のため GREEN のまま (回帰防止の非退行ケース)。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays, format, subDays } from "date-fns";

// 固定日付ハードコード禁止: 実行日からの相対で past/today/future を導出する
const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 1), "yyyy-MM-dd"); // 昨日 (過去)
const TODAY_DATE = format(NOW, "yyyy-MM-dd"); // 今日 (過去に含めない境界値)
const FUTURE_DATE = format(addDays(NOW, 1), "yyyy-MM-dd"); // 明日 (未来)
const INVALID_DATE = "not-a-date"; // 不正フォーマット (境界値)

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

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

let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions — 過去大会のエントリーボタン非表示", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseMock([]),
    };
  });

  it("[V-01] 過去日 (昨日) の大会ではエントリーボタンが表示されない", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: PAST_DATE, title: "過去大会V01" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V01");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
  });

  it("[境界値 V-02] 今日の大会ではエントリーボタンが表示される (今日は過去に含めない)", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: TODAY_DATE, title: "本日大会V02" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("本日大会V02");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
  });

  it("[境界値 V-03] 明日の大会ではエントリーボタンが表示される", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: FUTURE_DATE, title: "明日大会V03" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("明日大会V03");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
  });

  // 【解消済み・履歴メモ】Phase A の QA 実測時点では TeamCompetitions.tsx:651 の
  // `format(new Date(competition.date + "T00:00:00"), ...)` が isValid() チェック無しで
  // 呼ばれており (CLAUDE.md ルール#3 違反)、不正/null な date で
  // RangeError: Invalid time value を投げてコンポーネント全体がクラッシュしていた
  // (Critical として報告済み)。Phase B で Web Dev が isValid() ガードを追加済みで、
  // 現在この V-04/V-05 は GREEN (QA 実測で確認済み)。`competitions.date` は DB スキーマ上
  // `date NOT NULL` (initial_schema.sql:666) で実運用データでは到達不能なケースだが、
  // 防御的な境界値として引き続き検証する。
  it("[境界値 V-04] date が不正フォーマットの場合はエントリーボタンが表示される (isCompetitionDateInPast=false)", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: INVALID_DATE, title: "不正日付大会V04" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("不正日付大会V04");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
  });

  it("[境界値 V-05] date が null (防御的: 型はstringだが実データ異常を想定) の場合はエントリーボタンが表示される", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: null, title: "日付なし大会V05" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("日付なし大会V05");
    expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
  });

  it("[V-06] admin でも過去日ならエントリーボタンは表示されない (isAdmin に関わらずガードが効く)", async () => {
    currentAuthMock = {
      user: { id: "admin-1" },
      supabase: buildSupabaseMock([
        buildCompetitionRow({ date: PAST_DATE, title: "過去大会admin" }),
      ]),
    };
    render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

    await screen.findByText("過去大会admin");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();

    // 非退行: スコープ外の admin 専用ボタンは過去日でも消えない
    expect(screen.getByRole("button", { name: "記録入力" })).toBeDefined();
    expect(screen.getByRole("button", { name: "エントリー入力" })).toBeDefined();
  });

  it("[V-07] 過去日で「自分の記録を追加」ボタンは引き続き表示される (エントリーボタンのみが対象)", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: PAST_DATE, title: "過去大会V07" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V07");
    expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
    expect(screen.getByRole("button", { name: "自分の記録を追加" })).toBeDefined();
  });

  it("[V-08] 過去日ではエントリーボタンが押せないため、エントリー管理モーダルは一度も開かれない", async () => {
    currentAuthMock.supabase = buildSupabaseMock([
      buildCompetitionRow({ date: PAST_DATE, title: "過去大会V08" }),
    ]);
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

    await screen.findByText("過去大会V08");
    expect(screen.queryByTestId("entry-modal-stub")).toBeNull();
    // モーダルは showEntryModal && selectedCompetition のときのみ条件付きレンダリングされる
    // (TeamCompetitions.tsx:869) ため、ボタンが押せなければ一度もマウントされない
    expect(mocks.entryModalSpy).not.toHaveBeenCalled();
  });
});
