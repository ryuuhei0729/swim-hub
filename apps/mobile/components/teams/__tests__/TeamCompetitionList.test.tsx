/**
 * TeamCompetitionList コンポーネント テスト
 *
 * Sprint 2 Phase B QA 検証
 *
 * 検証観点:
 * [S2-V-05] isLoading 時にローディング表示が出る
 * [S2-V-06] isError 時にエラー表示が出る
 * [S2-V-07] 大会が 0 件のとき空状態表示
 * [S2-V-08] 大会リストが表示される (タイトル / 場所)
 * [S2-V-09] isAdmin=true のとき追加ボタン・navigate が呼ばれる
 * [S2-V-10] isAdmin=false のとき追加ボタンが表示されない
 *
 * ---------------------------------------------------------------------
 * Sprint Contract 追加検証観点 (管理者代理入力 導線再編 + entry_status 表示派生):
 * [SC-1] admin 時、ボタン行は「記録代理入力」「エントリー代理入力」の2個のみ。「エントリー」ボタンは無い
 * [SC-2] admin 時、entry_status バッジをタップすると受付状況モーダルが開く
 * [SC-3] 非 admin 時のボタン構成/ラベル/遷移先は変更前と完全一致 (entryButton 経由でモーダルを開く)
 * [SC-4] 過去日なら DB 値(before/open)によらずバッジは「受付終了」
 * [SC-6] 今日は過去扱いしない (DB 値のまま)
 * [SC-8] 上記の日付派生は admin/非 admin 共通
 * [SC-9] 過去日大会でセルフエントリー導線 (handleSelfEntry) が発火しない
 *
 * 日付は `new Date()` からの相対 (subDays/addDays) で生成し、固定日付をハードコードしない
 * (テスト実行日に依存して壊れることを防ぐ)。
 *
 * ---------------------------------------------------------------------
 * 【重要: 期待値の反転について】(ユーザー報告バグ修正スプリント, PM確定方針)
 * 上記 [SC-5 配線確認] / [SC-9] は元々「過去日でもエントリーボタン/バッジが表示され
 * クリック可能」ことを固定していた。しかし新しい Sprint Contract の方針は逆で、
 * 「過去の大会 (昨日以前 = date < today、既存の純粋関数 isCompetitionDateInPast と
 * 完全一致) では非adminの『エントリー』ボタンを非表示にし、adminの entry_status
 * バッジは表示は残すがタップ不可 (Pressable→View に降格) にする」。
 * 以下の2つの describe ブロックはこの反転後の期待値に合わせて全面的に書き換えている
 * (ブロック名は元の [SC-5]/[SC-9] 番号を維持しつつ [REVISED] を付す)。
 * 実装前の現時点ではこれらは RED になる想定。
 *
 * [V-11] 過去日 + 非admin: 「エントリー」ボタンは存在しない (押せないので自己エントリー
 *        導線 handleSelfEntry も物理的に発火し得ない。モーダル自体が一度も開かれない)
 * [V-12] 過去日 + admin: entry_status バッジはラベル表示は残るが role=button ではない
 *        (タップしても受付状況モーダルは一度も開かれない)
 * [V-13][境界値] 今日/未来日は従来通り表示・クリック可能 (今日は過去扱いしない)
 *
 * なお「past date + entryStatus='closed' を渡されたモーダルが自己エントリー導線を
 * 出さない」という防御の二重化 (defense-in-depth) は、このコンポーネントではなく
 * TeamCompetitionEntryModal.test.tsx 側で entryStatus prop 単体として検証済み
 * (entry_status !== 'open' なら「種目をエントリー」導線が出ない)。本ファイルでは
 * 「そもそも導線 (ボタン/タップ可能なバッジ) 自体が過去日には存在しない」という
 * 一段目のガードのみを検証する (二重に同じ主張をしてトートロジー化するのを避ける)。
 */

import React from "react";
import { Text, Pressable } from "react-native";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";
import jaMessages from "@apps/shared/messages/ja.json";

// 固定日付ハードコード禁止 (SC-4/SC-6): 実行時の「今日」からの相対で past/today/future を導出する
const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 5), "yyyy-MM-dd");
const TODAY_DATE = format(NOW, "yyyy-MM-dd");
const FUTURE_DATE = format(addDays(NOW, 5), "yyyy-MM-dd");

// ja.json の実データを直接テンプレート解決する (vitest.setup.ts の tMock と同じ方式)。
// 期待文字列を丸ごとハードコードせず、キーが指すテンプレートに実値を当てはめて算出することで
// 「翻訳内容が変わっても追随するが、キー自体が消えたら resolveJaKey が undefined を投げて
// テストが落ちる」形にする。
function resolveJaKey(key: string): string {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      throw new Error(`ja.json に ${key} が存在しない`);
    }
  }
  if (typeof cur !== "string") throw new Error(`ja.json の ${key} は文字列ではない`);
  return cur;
}

function interpolateJa(key: string, values: Record<string, string>): string {
  const template = resolveJaKey(key);
  return template.replace(/\{(\w+)\}/g, (_m, name) => values[name] ?? `{${name}}`);
}

const mocks = vi.hoisted(() => ({
  useTeamCompetitionsQuery: vi.fn(),
  useDeleteTeamCompetitionMutation: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
  // モーダルが描画する子コンポーネントを差し替えて、TeamCompetitionList 単体の
  // 「エントリーボタン押下でモーダルが開く」挙動だけを検証する。
  // (モーダル本体の検証は TeamCompetitionEntryModal.test.tsx)
  entryModalSpy: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: mocks.navigate })),
}));

// モーダルはスタブ化: props を記録するだけ。visible のときだけ testID を描画する。
vi.mock("../TeamCompetitionEntryModal", () => ({
  TeamCompetitionEntryModal: (props: Record<string, unknown>) => {
    mocks.entryModalSpy(props);
    if (!props.visible) return null;
    // #7: 実モーダルは onSelfEntry に「モーダル内の現在 status (楽観的更新後)」を渡す。
    // ここではモーダルの現在 status として prop の entryStatus を転送して同セマンティクスを再現する
    // (dead-click 防止ガードが現在 status で判定されることを検証可能にする)。
    const currentStatus = props.entryStatus;
    return React.createElement(
      Pressable,
      {
        accessibilityRole: "button",
        accessibilityLabel: "modal-self-entry",
        onPress: () => (props.onSelfEntry as (s: unknown) => void)(currentStatus),
      },
      React.createElement(Text, null, "ENTRY_MODAL_OPEN"),
    );
  },
}));

import { TeamCompetitionList } from "../TeamCompetitionList";

// Reviewer Test Review 指摘 (Phase 5b): デフォルト日付が "2026-06-15" のハードコードだと
// 実行日 (本セッション起動時点で既に 2026-08-19) より過去になっており、entry_status 系の
// 新規テストが date を省略して書かれると resolveEntryStatus の過去日判定に巻き込まれて
// 実行日依存で壊れる地雷になる。デフォルトを相対未来日 (FUTURE_DATE) に変更する。
// 影響確認: 本ファイル内で `date` を明示指定していない makeCompetition() 呼び出しは
// タイトル文字列表示 / entryButton・recordButton 表示のみを検証しており、entry_status
// 由来の表示 (バッジ文言等) には一切依存していないため非退行 (実測: 全 138 -> 147 テスト green)。
const makeCompetition = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  user_id: "user-1",
  team_id: "team-1",
  date: FUTURE_DATE,
  title: "春季大会",
  place: "○○プール",
  pool_type: 1,
  note: null,
  end_date: null,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  image_paths: [],
  ...overrides,
});

const makeMutationMock = () => ({
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  isPending: false,
});

describe("TeamCompetitionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamCompetitionMutation.mockReturnValue(makeMutationMock());
  });

  // [S2-V-05] ローディング
  it("isLoading=true のときリスト表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryByText("春季大会")).toBeNull();
  });

  // [S2-V-06] エラー状態
  it("isError=true のときエラーメッセージが表示される", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "大会取得エラー" },
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("大会取得エラー")).toBeDefined();
  });

  // [S2-V-07] 空状態
  it("competitions が空のとき大会タイトルが表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryAllByText("春季大会")).toHaveLength(0);
  });

  // [S2-V-08] リスト表示
  it("competitions が存在するとき大会タイトルが表示される", () => {
    const comp = makeCompetition({ title: "夏季招待大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.getByText("夏季招待大会")).toBeDefined();
  });

  // [S2-V-09] isAdmin=true: 追加ボタンが表示され navigate が呼ばれる
  it("isAdmin=true で追加ボタンを押すと CompetitionForm + teamId で navigate される", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionForm",
      expect.objectContaining({ teamId: "team-1" }),
    );
  });

  // [S2-V-10] isAdmin=false: 追加ボタンがない
  it("isAdmin=false のとき追加ボタンが表示されない", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  // isAdmin=true で編集ボタンを押すと { competitionId, date, teamId } で navigate される
  it("isAdmin=true で編集ボタンを押すと CompetitionForm + { competitionId, date, teamId } で navigate される", () => {
    const comp = makeCompetition({ id: "c-edit", title: "編集対象大会", date: "2026-08-10" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const buttons = screen.getAllByRole("button");
    // buttons[0] = ヘッダー追加, buttons[1] = 編集, buttons[2] = 削除
    fireEvent.click(buttons[1]);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionForm",
      expect.objectContaining({
        competitionId: "c-edit",
        date: "2026-08-10",
        teamId: "team-1",
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Sprint 3 検証: [S3-V-B1] エントリー/記録ボタンが存在し teamId で遷移する
  // -----------------------------------------------------------------------

  // [S3-V-B1] エントリーボタンが表示される
  it("[S3-V-B1] 大会がある場合、エントリーボタンが表示される", () => {
    const comp = makeCompetition({ title: "冬季大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.entryButton = 'エントリー'
    expect(screen.getByText("エントリー")).toBeDefined();
  });

  // [S3-V-B1] 記録ボタンが表示される
  it("[S3-V-B1] 大会がある場合、記録ボタンが表示される", () => {
    const comp = makeCompetition({ title: "冬季大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.recordButton = '記録'
    expect(screen.getByText("記録")).toBeDefined();
  });

  // 仕様変更 (Web パリティ + Sprint Contract SC-3): 非 admin はエントリーボタンが従来通り
  // 直接 EntryForm へ遷移せず、受付状況管理モーダルを開く (この挙動は今回のスプリントでも不変)。
  // 【注意】admin 時はこのボタン自体が廃止され entry_status バッジのタップに置き換わる ([SC-1]/[SC-2] で別途検証)。
  // このテストは元々 isAdmin={true} で書かれていたが、新仕様では admin に「エントリー」ボタンは
  // 存在しないため必ず破壊される。QA が Sprint Contract のリスク欄に基づき isAdmin={false} (非 admin
  // フロー) に書き換えた。
  it("[SC-3] 非 admin: エントリーボタンを押すと受付状況モーダルが開き、対象大会の props が渡る", () => {
    const comp = makeCompetition({
      id: "c-ent",
      date: FUTURE_DATE,
      title: "秋季大会",
      entry_status: "open",
    });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-ent" isAdmin={false} />);

    // 押下前はモーダル未表示
    expect(screen.queryByText("ENTRY_MODAL_OPEN")).toBeNull();

    const entryButton = screen.getByRole("button", { name: "エントリー" });
    fireEvent.click(entryButton);

    // モーダルが開く (visible=true で testID が描画される)
    expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined();

    // 直接 EntryForm へ navigate していないこと (旧挙動の回帰防止)
    expect(mocks.navigate).not.toHaveBeenCalledWith("EntryForm", expect.anything());

    // 正しい props がモーダルへ渡されること (非 admin なので isAdmin: false)
    expect(mocks.entryModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        competitionId: "c-ent",
        competitionTitle: "秋季大会",
        teamId: "team-ent",
        entryStatus: "open",
        isAdmin: false,
      }),
    );
  });

  // [V-06 / Sprint Contract] モーダル内「種目をエントリー」(onSelfEntry) で EntryForm へ遷移する (セルフエントリー機能維持)
  it("モーダルの onSelfEntry で EntryForm に { competitionId, date, teamId } で navigate される", () => {
    // #7: セルフエントリー導線は entry_status === "open" のときのみ有効。
    // 受付中の大会でのみ EntryForm へ遷移できることを検証する。
    const comp = makeCompetition({
      id: "c-self",
      date: FUTURE_DATE,
      title: "秋季大会",
      entry_status: "open",
    });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-self" isAdmin={false} />);

    fireEvent.click(screen.getByRole("button", { name: "エントリー" }));
    // モーダル内のセルフエントリー導線を押下 (スタブの onSelfEntry を発火)
    fireEvent.click(screen.getByText("ENTRY_MODAL_OPEN"));

    expect(mocks.navigate).toHaveBeenCalledWith(
      "EntryForm",
      expect.objectContaining({
        competitionId: "c-self",
        date: FUTURE_DATE,
        teamId: "team-self",
      }),
    );
  });

  // [#7 dead-click 防止] 現在 status が "open" でないときは onSelfEntry が発火しても navigate しない
  it("entry_status が closed のとき onSelfEntry が発火しても EntryForm へ navigate しない", () => {
    const comp = makeCompetition({
      id: "c-closed",
      date: FUTURE_DATE,
      title: "受付終了大会",
      entry_status: "closed",
    });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-self" isAdmin={false} />);

    fireEvent.click(screen.getByRole("button", { name: "エントリー" }));
    fireEvent.click(screen.getByText("ENTRY_MODAL_OPEN"));

    // 現在 status (closed) でガードされ、navigate は呼ばれない
    expect(mocks.navigate).not.toHaveBeenCalledWith("EntryForm", expect.anything());
  });

  // entry_status が null/未定義でもモーダルへ "before" 相当で渡る (安全表示)
  // 日付は明示的に未来日を指定する (デフォルト fixture 日付は過去になり得るため、
  // resolveEntryStatus の過去日派生と混同しないよう SC-8 の「デフォルト値」側面のみを検証する)
  it("entry_status が未指定のときモーダルへ entryStatus='before' が渡る", () => {
    const comp = makeCompetition({
      id: "c-null",
      title: "状態なし大会",
      date: FUTURE_DATE,
      entry_status: undefined,
    });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-null" isAdmin={false} />);
    fireEvent.click(screen.getByRole("button", { name: "エントリー" }));

    expect(mocks.entryModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ entryStatus: "before" }),
    );
  });

  // [S3-V-B1 / W-01] 記録ボタン押下で CompetitionTabForm(initialTab:"record") + { competitionId, date, teamId } で navigate される。
  // バグ修正 (2026-08-01): RecordLogForm は recordId 未指定だと既存レコードを検索せず
  // 重複作成を招くため、useDayDetailHandlers.handleEditRecord と同じ CompetitionTabForm
  // (competitionId 指定で既存レコードを読み込み編集対象にする) に統一された。
  // 旧挙動 (RecordLogForm 直遷移) への回帰防止のため、RecordLogForm が呼ばれないことも検証する。
  it("[S3-V-B1 / W-01] 記録ボタンを押すと CompetitionTabForm に { competitionId, date, teamId, initialTab: 'record' } で navigate される (重複レコード作成バグの回帰防止)", () => {
    const comp = makeCompetition({ id: "c-rec", date: "2026-10-15", title: "選手権大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-rec" isAdmin={false} />);

    const recordButton = screen.getByRole("button", { name: "記録" });
    fireEvent.click(recordButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionTabForm",
      expect.objectContaining({
        competitionId: "c-rec",
        date: "2026-10-15",
        teamId: "team-rec",
        initialTab: "record",
      }),
    );

    // 回帰防止: recordId 未指定のブランクフォーム (RecordLogForm) には遷移しないこと
    // (既存レコードを無視した重複作成バグの再発防止)
    expect(mocks.navigate).not.toHaveBeenCalledWith("RecordLogForm", expect.anything());
  });

  // -----------------------------------------------------------------------
  // Sprint Contract: 管理者代理入力 導線再編 + entry_status 表示派生
  // -----------------------------------------------------------------------

  describe("[SC-1] admin 時のボタン構成", () => {
    it("「エントリー」ボタンは存在せず、「記録代理入力」「エントリー代理入力」の2個のみ存在する", () => {
      const comp = makeCompetition({ id: "c-admin-btns", date: FUTURE_DATE, title: "管理者大会" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

      // 旧「エントリー」ボタンは admin では廃止される (queryBy で非存在を確認)
      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      // 旧「記録」ボタンも admin では「記録代理入力」に置き換わる
      expect(screen.queryByRole("button", { name: "記録" })).toBeNull();

      // 新設の2ボタンが厳密一致で存在する
      expect(screen.getByRole("button", { name: "記録代理入力" })).toBeDefined();
      expect(screen.getByRole("button", { name: "エントリー代理入力" })).toBeDefined();
    });
  });

  describe("[SC-2] admin 時、entry_status バッジのタップでモーダルが開く", () => {
    it("バッジ (受付中) をタップすると受付状況モーダルが開き、admin として props が渡る", () => {
      const comp = makeCompetition({
        id: "c-badge-open",
        date: FUTURE_DATE,
        title: "バッジ大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-badge" isAdmin={true} />);

      expect(screen.queryByText("ENTRY_MODAL_OPEN")).toBeNull();

      // ja.json: teams.competitions.entryStatus.open = '受付中' — バッジのラベルそのものがタップ対象
      const badge = screen.getByRole("button", { name: "受付中" });
      fireEvent.click(badge);

      expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined();
      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: true,
          competitionId: "c-badge-open",
          teamId: "team-badge",
          entryStatus: "open",
          isAdmin: true,
        }),
      );

      // 回帰ガード: バッジは編集用の外側 Pressable (onEdit) の子要素にネストしてはならない。
      // ネストすると (テストハーネスの Pressable→<button> 変換により) クリックイベントが
      // 外側の onPress にもバブリングし、意図せず CompetitionForm への編集画面遷移が発火する。
      expect(mocks.navigate).not.toHaveBeenCalledWith("CompetitionForm", expect.anything());
    });

    it("entry_status が未指定 (falsy) でも admin は必ずタップ可能なバッジ導線を持つ (防御的要件)", () => {
      // Boundary Cases: 「entry_status が falsy な fixture でバッジ非描画のとき、
      // admin のモーダル導線が消える → 要対処」への回帰防止。
      const comp = makeCompetition({
        id: "c-badge-null",
        date: FUTURE_DATE,
        title: "状態なし大会",
        entry_status: undefined,
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-badge-null" isAdmin={true} />);

      // resolveEntryStatus の既定値 'before' → ja.json: '受付前'
      const badge = screen.getByRole("button", { name: "受付前" });
      fireEvent.click(badge);

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, entryStatus: "before", isAdmin: true }),
      );
    });
  });

  describe("[SC-3] 非 admin 時のバッジは非 Pressable (タップしても何も起きない)", () => {
    it("バッジがラベルとして表示されるが role=button ではない", () => {
      const comp = makeCompetition({
        id: "c-badge-nonadmin",
        date: FUTURE_DATE,
        title: "非管理者大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

      // ラベル自体は表示される (表示は admin/非 admin 共通 = SC-8)
      expect(screen.getByText("受付中")).toBeDefined();
      // だが button ロールとしては存在しない (タップ導線ではない)
      expect(screen.queryByRole("button", { name: "受付中" })).toBeNull();
    });
  });

  describe("[SC-4][SC-6][SC-8] entry_status バッジの日付派生 (admin/非 admin 共通)", () => {
    it.each([true, false])(
      "過去日なら DB=open でもバッジは「受付終了」と表示される (isAdmin=%s)",
      (isAdmin) => {
        const comp = makeCompetition({
          id: "c-past-open",
          date: PAST_DATE,
          title: "過去大会オープン",
          entry_status: "open",
        });
        mocks.useTeamCompetitionsQuery.mockReturnValue({
          data: [comp],
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        });

        render(<TeamCompetitionList teamId="team-past" isAdmin={isAdmin} />);

        expect(screen.getByText("受付終了")).toBeDefined();
        // DB 値そのままの表示 (受付中) は出ないこと
        expect(screen.queryByText("受付中")).toBeNull();
      },
    );

    it("過去日なら DB=before でもバッジは「受付終了」と表示される", () => {
      const comp = makeCompetition({
        id: "c-past-before",
        date: PAST_DATE,
        title: "過去大会未受付",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-past2" isAdmin={false} />);

      expect(screen.getByText("受付終了")).toBeDefined();
      expect(screen.queryByText("受付前")).toBeNull();
    });

    it("今日は過去扱いしない: DB=open のままバッジは「受付中」と表示される", () => {
      const comp = makeCompetition({
        id: "c-today-open",
        date: TODAY_DATE,
        title: "本日大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-today" isAdmin={false} />);

      expect(screen.getByText("受付中")).toBeDefined();
      expect(screen.queryByText("受付終了")).toBeNull();
    });

    it("今日は過去扱いしない: DB=before のままバッジは「受付前」と表示される", () => {
      const comp = makeCompetition({
        id: "c-today-before",
        date: TODAY_DATE,
        title: "本日大会2",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-today2" isAdmin={false} />);

      expect(screen.getByText("受付前")).toBeDefined();
      expect(screen.queryByText("受付終了")).toBeNull();
    });
  });

  describe("[SC-5 REVISED][V-11] 過去日 + 非admin: エントリーボタンが存在しない", () => {
    it("[V-11] 過去日の大会では「エントリー」ボタンが表示されない (旧[SC-5]の逆: 押せないので isPastDate 配線先のモーダル自体が開かない)", () => {
      const comp = makeCompetition({
        id: "c-ispast-true",
        date: PAST_DATE,
        title: "過去大会isPastDate",
        entry_status: "closed",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-ip1" isAdmin={false} />);

      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      // 記録ボタンはこのスプリントの対象外 (スコープ外への副作用がないことの回帰ガード)
      expect(screen.getByRole("button", { name: "記録" })).toBeDefined();
      expect(mocks.entryModalSpy).not.toHaveBeenCalled();
    });

    it("[境界値] 未来日の大会では「エントリー」ボタンが表示され、タップするとモーダルへ isPastDate が真ではない (false/undefined) 値で渡る (非退行)", () => {
      const comp = makeCompetition({
        id: "c-ispast-false",
        date: FUTURE_DATE,
        title: "未来大会isPastDate",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-ip2" isAdmin={false} />);
      fireEvent.click(screen.getByRole("button", { name: "エントリー" }));

      const calls = mocks.entryModalSpy.mock.calls;
      const lastCall = calls[calls.length - 1][0] as Record<string, unknown>;
      expect(lastCall.isPastDate).toBeFalsy();
    });

    it("[境界値] 今日の大会では「エントリー」ボタンが表示される (今日は過去扱いしない)", () => {
      const comp = makeCompetition({
        id: "c-ispast-today",
        date: TODAY_DATE,
        title: "本日大会isPastDate",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-ip3" isAdmin={false} />);

      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    });
  });

  describe("[SC-9 REVISED][V-12] 過去日 + admin: entry_status バッジがタップ不可 (View に降格)", () => {
    it("[V-12] 過去日大会のバッジはラベル「受付終了」を表示するが role=button ではなく、タップしてもモーダルは一度も開かれない (旧[SC-9]の逆)", () => {
      const comp = makeCompetition({
        id: "c-past-self-admin",
        date: PAST_DATE,
        title: "過去大会セルフ管理者",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-past-self-admin" isAdmin={true} />);

      // ラベル自体 (派生後の '受付終了') は表示される (SC-4/SC-8 と非退行)
      expect(screen.getByText("受付終了")).toBeDefined();
      // だが button ロールとしては存在しない (SC-3 の非adminと同じ非インタラクティブ表示に揃う)
      expect(screen.queryByRole("button", { name: "受付終了" })).toBeNull();
      expect(mocks.entryModalSpy).not.toHaveBeenCalled();
    });

    it("[境界値] 未来日大会の admin バッジは引き続きタップ可能で受付状況モーダルが開く (非退行、[SC-2]と同一観点の日付境界版)", () => {
      const comp = makeCompetition({
        id: "c-future-admin-badge",
        date: FUTURE_DATE,
        title: "未来大会管理者バッジ",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-future-admin" isAdmin={true} />);

      const badge = screen.getByRole("button", { name: "受付中" });
      fireEvent.click(badge);

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entryStatus: "open", isAdmin: true }),
      );
    });

    it("[境界値] 今日の大会の admin バッジは引き続きタップ可能 (今日は過去扱いしない)", () => {
      const comp = makeCompetition({
        id: "c-today-admin-badge",
        date: TODAY_DATE,
        title: "本日大会管理者バッジ",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-today-admin" isAdmin={true} />);

      const badge = screen.getByRole("button", { name: "受付中" });
      fireEvent.click(badge);

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entryStatus: "open", isAdmin: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Reviewer Critical C-2 再評価 (Phase 5b): admin バッジの chevron-down / hitSlop / aria
  //
  // 【重要な前提】このテストハーネス (__mocks__/react-native.ts の Pressable) は
  // accessibilityLabel を aria-label に変換せず、React の非標準 DOM 属性として
  // 素通しする (小文字化されて `accessibilitylabel="..."` になる)。そのため
  // testing-library の getByRole(..., {name}) はこの属性を一切見ない
  // (accessible name は可視テキストの内容から計算される)。Developer の
  // 「テストハーネスの Pressable モックは accessibilityLabel を aria-label に変換
  // しないので既存テストは無影響」という報告は実測で真である
  // (apps/mobile/components/teams/__tests__/__probe4.test.tsx 相当で確認済み、
  // 検証用ファイルのため削除済み)。
  //
  // つまり既存の name ベースのテストは accessibilityLabel の値を一切ピン止めしていない
  // (badge の accessible name は Text の可視テキスト "受付中" 等のみで決まる)。
  // これでは C-2 の aria キー配線に回帰があっても検出できないため、生 DOM 属性
  // (`accessibilitylabel`) を直接読む形で新たにピン止めする。
  // -----------------------------------------------------------------------
  describe("[C-2 再評価] admin entry_status バッジの chevron-down / hitSlop / aria", () => {
    it("admin バッジの accessibilitylabel 属性が entryStatusChangeAria テンプレートに実ステータスを当てはめた文字列になる", () => {
      const comp = makeCompetition({
        id: "c-aria",
        date: FUTURE_DATE,
        title: "aria大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-aria" isAdmin={true} />);

      const badge = screen.getByText("受付中").closest("button");
      expect(badge, "admin バッジが button として見つからない").not.toBeNull();

      const expected = interpolateJa("teams.mobile.teamCompetitionList.entryStatusChangeAria", {
        status: "受付中",
      });
      expect((badge as HTMLButtonElement).getAttribute("accessibilitylabel")).toBe(expected);
    });

    it("admin バッジに chevron-down アイコンが表示される", () => {
      const comp = makeCompetition({
        id: "c-chevron",
        date: FUTURE_DATE,
        title: "chevron大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-chevron" isAdmin={true} />);

      const badge = screen.getByText("受付前").closest("button");
      expect(badge?.querySelector('[data-testid="icon-chevron-down"]')).not.toBeNull();
    });

    it("admin バッジに hitSlop が渡っている (オブジェクト prop が DOM 属性として存在すること自体で検出。値の中身までは検証不可)", () => {
      const comp = makeCompetition({
        id: "c-hitslop",
        date: FUTURE_DATE,
        title: "hitSlop大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-hitslop" isAdmin={true} />);

      const badge = screen.getByText("受付前").closest("button");
      // React はオブジェクト prop を DOM 属性化するとき String(value) するため
      // 常に "[object Object]" になる。値の中身 (top/bottom/left/right) はこの経路では
      // 検証できないが、「hitSlop prop 自体が渡っているか (undefined でないか)」は
      // 属性の有無で判別できる (mutation テストで確認済み: 除去すると属性ごと消える)。
      expect(badge?.getAttribute("hitslop")).not.toBeNull();
    });

    it("非 admin バッジには role=button が付かず、accessibilitylabel 属性も chevron-down アイコンも無い (SC-3 非退行)", () => {
      const comp = makeCompetition({
        id: "c-nonadmin-badge",
        date: FUTURE_DATE,
        title: "非管理者badge大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-nonadmin-badge" isAdmin={false} />);

      // button ロールとしては存在しない (SC-3 で既に検証済みだが C-2 追加要素も含め再確認)
      expect(screen.queryByRole("button", { name: "受付中" })).toBeNull();

      // ラベルテキストの直近コンテナ (バッジの View 自体) を見ても button ではなく、
      // chevron-down も無く、accessibilitylabel 属性も持たない。
      // 【注意】非 admin の entryButton/recordButton 自体は元々 accessibilityLabel を
      // 持つため (旧仕様から不変)、document 全体に対して属性の非存在を assert すると
      // 無関係な既存ボタンまで拾って誤検知する。バッジのコンテナ要素だけをスコープにする。
      const labelEl = screen.getByText("受付中");
      const badgeContainer = labelEl.parentElement;
      expect(badgeContainer?.tagName.toLowerCase()).not.toBe("button");
      expect(badgeContainer?.getAttribute("accessibilitylabel")).toBeNull();
      expect(badgeContainer?.querySelector('[data-testid="icon-chevron-down"]')).toBeNull();
    });
  });
});
