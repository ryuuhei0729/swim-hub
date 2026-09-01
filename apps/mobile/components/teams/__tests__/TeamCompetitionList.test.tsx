/**
 * TeamCompetitionList コンポーネント テスト
 *
 * ---------------------------------------------------------------------
 * Sprint Contract (mobile 管理者ビュー チーム大会タブ改修) 検証観点マッピング
 * ---------------------------------------------------------------------
 * [V-1]  place ありのカードで「{place} (25m)/(50m)」が1行に出て、独立した水路行が無い (D-1)
 * [V-2]  place なしのカードで「短水路 (25m)/長水路 (50m)」が droplet 行として残る (D-1)
 * [V-3]  pool_type=0→(25m) / pool_type=1→(50m) の向きが逆転していない (D-1)
 * [V-4]  過去大会は admin/非admin 問わず statusRow が丸ごと非表示になる (D-2)
 * [V-5]  今日・未来日は受付ステータスが表示される (境界値, D-2)
 * [V-6]  admin バッジタップで3択がカード上に展開する。RN Modal を新規ネストしない (D-3)
 * [V-7]  別ステータス選択で mutation が正しい値で呼ばれる。同一値選択は no-op (D-3)
 * [V-8]  保存中 (isPending) は選択操作をしても mutation が呼ばれない (二重送信防止, D-3)
 * [V-9]  編集/削除/記録代理入力/エントリー代理入力/ステータスプルダウンのタップでは
 *        記録一覧モーダルが開かない (5要素を個別に検証, D-4)
 * [V-10] admin がカード本体をタップすると記録一覧モーダルが開く (D-4)
 * [V-11] 非admin はカード本体タップで記録一覧モーダルが開かない (D-4)
 * [V-16] TeamPracticeList は本ファイルの対象外 (別ファイルで回帰確認、変更なしのはず)
 * [V-17] i18n 5言語パリティは `apps/shared/__tests__/messages-coverage.test.ts` の
 *        汎用キー構造一致テスト (V-01/V-01-ext) が担保する。今回のスプリントは既存キー
 *        (`teams.competitions.entryStatus.*` 等) の再利用のみで新規キーを増やさない前提。
 * [V-12]〜[V-15] は新規コンポーネント `TeamCompetitionRecordsModal.test.tsx` 側で検証する
 *        (このファイルでは「開く/開かない」の配線のみを検証し、モーダル内部は検証しない)。
 *
 * ---------------------------------------------------------------------
 * 【重要: 既存テストの矛盾と書き換えについて】(QA Phase A 棚卸し)
 * 旧 Sprint Contract (管理者代理入力 導線再編) 時点で書かれた以下のブロックは、
 * 今回の Sprint Contract (D-2/D-3) と正面から矛盾するため書き換えた:
 *
 * 1. 旧 [SC-4][SC-6][SC-8] のうち「過去日なら受付終了と *表示される*」を pin していた
 *    3ケース (旧 L649-668, L781-804 相当) → 新仕様は「過去日は statusRow を丸ごと
 *    描画しない」なので、「受付終了というテキスト自体が一切現れない」に反転した
 *    ([V-4] として書き換え)。旧仕様は「過去日でも DB 値を『受付終了』に強制表示する」
 *    だったが、新仕様は「そもそも表示しない」。今日/未来日の挙動 (表示される) は
 *    従来と変わらないためそのまま維持する ([V-5])。
 * 2. 旧 [SC-2] (admin バッジタップで TeamCompetitionEntryModal が開く, 旧 L528-596) と
 *    旧 [SC-9 REVISED] のうち未来日/今日で admin バッジタップ→モーダルが開くことを
 *    pin していた2ケース (旧 L806-829, L831-854) → 新仕様はバッジタップで
 *    「カード上の3択プルダウン」が展開し、TeamCompetitionEntryModal は一切開かない
 *    (D-3: 既存モーダルは非adminの「エントリー」ボタン経由の導線としてのみ残る)。
 *    [V-6]/[V-7]/[V-8] として全面的に書き換えた。
 *
 * 【変更していないもの】
 * - 非 admin の「エントリー」ボタン経由で TeamCompetitionEntryModal が開く一連のテスト
 *   (SC-3 本体、onSelfEntry 系) は D-3 で「非adminの導線として残す」と明記されているため
 *   無変更。
 * - [SC-5 REVISED][V-11](旧番号。今回の Sprint Contract の V-11 とは無関係な別番号なので
 *   混同注意) の非admin エントリーボタンの過去日非表示は、D-2 の対象 (statusRow) とは
 *   別の行 (entryRecordRow) であり、今回のスコープ外のため無変更。
 * - [C-2 再評価] の aria/chevron-down/hitSlop の構造検証は、バッジの見た目構造自体は
 *   D-3 で変わらない (タップ後の遷移先だけが変わる) ため無変更。
 * - [SC-1] admin ボタン構成 (記録代理入力/エントリー代理入力の2つのみ) も無変更。
 *
 * トートロジー防止: DOM に表示される文字列・要素の有無、外部 mock の呼び出し引数のみ
 * 検証する。日付は `new Date()` からの相対 (subDays/addDays) で生成し、固定日付を
 * ハードコードしない (テスト実行日に依存して壊れることを防ぐ)。
 */

import React from "react";
import { Text, Pressable, Alert } from "react-native";
import { __modalMountRegistry, __resetModalMountRegistry } from "../../../__mocks__/react-native";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";
import jaMessages from "@apps/shared/messages/ja.json";

// 固定日付ハードコード禁止: 実行時の「今日」からの相対で past/today/future を導出する
const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 5), "yyyy-MM-dd");
const TODAY_DATE = format(NOW, "yyyy-MM-dd");
const FUTURE_DATE = format(addDays(NOW, 5), "yyyy-MM-dd");

// ja.json の実データを直接テンプレート解決する (vitest.setup.ts の tMock と同じ方式)。
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
  useUpdateCompetitionMutation: vi.fn(),
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  supabase: {},
  // モーダルが描画する子コンポーネントを差し替えて、TeamCompetitionList 単体の
  // 「タップでモーダルが開く」配線だけを検証する (モーダル本体は各専用テストで検証)。
  entryModalSpy: vi.fn(),
  recordsModalSpy: vi.fn(),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamCompetitionsQuery: mocks.useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation: mocks.useDeleteTeamCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: mocks.useUpdateCompetitionMutation,
}));

vi.mock("@apps/shared/hooks/queries/keys", () => ({
  teamKeys: {
    competitions: (teamId: string) => ["teams", "detail", teamId, "competitions"],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.invalidateQueries })),
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

// D-4: 新規「記録一覧」モーダル。プロパティ名は Sprint Contract の記述 (competitionId,
// competitionTitle) と既存 TeamCompetitionEntryModal の命名慣習 (visible/onClose) から
// QA が仮定したもの。実装が異なる場合は Phase B で要修正 (この仮定自体もレビュー対象)。
vi.mock("../TeamCompetitionRecordsModal", () => ({
  TeamCompetitionRecordsModal: (props: Record<string, unknown>) => {
    mocks.recordsModalSpy(props);
    if (!props.visible) return null;
    return React.createElement(Text, null, "RECORDS_MODAL_OPEN");
  },
}));

import { TeamCompetitionList } from "../TeamCompetitionList";

// Reviewer Test Review 指摘 (Phase 5b): デフォルト日付が固定ハードコードだと実行日依存で
// 壊れる地雷になるため、デフォルトを相対未来日 (FUTURE_DATE) にしている。
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

// テキストが複数の子要素 (Text) に分割されて描画されていても、行コンテナの
// textContent が完全一致すれば拾えるようにするヘルパー (既存の
// TeamMemberList.test.tsx と同じ `textContent ===` 完全一致パターン)。
function queryRowsWithExactText(text: string): HTMLElement[] {
  return screen.queryAllByText((_content, element) => element?.textContent === text) as HTMLElement[];
}

describe("TeamCompetitionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamCompetitionMutation.mockReturnValue(makeMutationMock());
    mocks.useUpdateCompetitionMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    });
    mocks.mutateAsync.mockResolvedValue(undefined);
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
  // (D-4: 編集は編集アイコンに一本化されるが、アイコン自体の挙動は無変更)
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

    const editIcon = screen.getByTestId("icon-edit-2");
    const editButton = editIcon.closest("button");
    expect(editButton, "編集アイコンの button が見つからない").not.toBeNull();
    fireEvent.click(editButton as HTMLButtonElement);

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

  // 仕様変更 (Web パリティ): 非 admin はエントリーボタンを押すと受付状況管理モーダルが開く
  // (D-3 でもこの非 admin 導線は不変。admin のバッジ経由の導線のみ廃止される)。
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

    expect(mocks.navigate).not.toHaveBeenCalledWith("EntryForm", expect.anything());
  });

  // entry_status が null/未定義でもモーダルへ "before" 相当で渡る (安全表示)
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

    expect(mocks.navigate).not.toHaveBeenCalledWith("RecordLogForm", expect.anything());
  });

  // -----------------------------------------------------------------------
  // [SC-1] admin ボタン構成 (無変更)
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

      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      expect(screen.queryByRole("button", { name: "記録" })).toBeNull();

      expect(screen.getByRole("button", { name: "記録代理入力" })).toBeDefined();
      expect(screen.getByRole("button", { name: "エントリー代理入力" })).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // D-1 [V-1][V-2][V-3]: 大会カードの2行レイアウト (水路表示)
  // -----------------------------------------------------------------------

  describe("[Sprint Contract D-1][V-1][V-2][V-3] 大会カードの水路表示 (2行レイアウト)", () => {
    it("[V-1] place あり + pool_type=0(短水路) は「{place} (25m)」が1行に出て、独立した水路行(droplet)が存在しない", () => {
      const comp = makeCompetition({
        id: "c-layout-1",
        date: FUTURE_DATE,
        title: "レイアウト大会1",
        place: "○○プール",
        pool_type: 0,
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-layout1" isAdmin={false} />);

      expect(queryRowsWithExactText("○○プール (25m)").length).toBeGreaterThan(0);
      // 独立した droplet 行 (水路単独表示) は place ありのとき描画されない
      expect(screen.queryAllByTestId("icon-droplet")).toHaveLength(0);
      // map-pin は場所行として1つだけ
      expect(screen.queryAllByTestId("icon-map-pin")).toHaveLength(1);
    });

    it("[V-3] place あり + pool_type=1(長水路) は「{place} (50m)」になり、(25m) は出ない (逆転していないこと)", () => {
      const comp = makeCompetition({
        id: "c-layout-2",
        date: FUTURE_DATE,
        title: "レイアウト大会2",
        place: "△△プール",
        pool_type: 1,
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-layout2" isAdmin={false} />);

      expect(queryRowsWithExactText("△△プール (50m)").length).toBeGreaterThan(0);
      expect(queryRowsWithExactText("△△プール (25m)")).toHaveLength(0);
    });

    it("[V-2] place なし + pool_type=0(短水路) は「短水路 (25m)」が droplet 行として残る (情報が消えない)", () => {
      const comp = makeCompetition({
        id: "c-layout-3",
        date: FUTURE_DATE,
        title: "レイアウト大会3",
        place: null,
        pool_type: 0,
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-layout3" isAdmin={false} />);

      expect(queryRowsWithExactText("短水路 (25m)").length).toBeGreaterThan(0);
      expect(screen.queryAllByTestId("icon-droplet")).toHaveLength(1);
      expect(screen.queryAllByTestId("icon-map-pin")).toHaveLength(0);
    });

    it("[V-2][V-3] place なし + pool_type=1(長水路) は「長水路 (50m)」になる (逆転していないこと)", () => {
      const comp = makeCompetition({
        id: "c-layout-4",
        date: FUTURE_DATE,
        title: "レイアウト大会4",
        place: null,
        pool_type: 1,
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-layout4" isAdmin={false} />);

      expect(queryRowsWithExactText("長水路 (50m)").length).toBeGreaterThan(0);
      expect(queryRowsWithExactText("短水路 (50m)")).toHaveLength(0);
      expect(queryRowsWithExactText("長水路 (25m)")).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // D-2 [V-4][V-5]: 過去大会の受付ステータス完全非表示 + 今日/未来日の境界
  // -----------------------------------------------------------------------

  describe("[Sprint Contract D-2][V-4] 過去大会は受付ステータス行が完全に非表示 (admin/非 admin 共通)", () => {
    it.each([
      ["open", true],
      ["open", false],
      ["before", true],
      ["before", false],
      ["closed", true],
      ["closed", false],
    ] as const)(
      "DB entry_status=%s / isAdmin=%s でも過去日ならバッジ/ラベルが一切描画されない (旧仕様は「受付終了」表示を強制していたが、新仕様は行自体を描画しない)",
      (dbStatus, isAdmin) => {
        const comp = makeCompetition({
          id: `c-past-hide-${dbStatus}-${isAdmin}`,
          date: PAST_DATE,
          title: "過去大会非表示検証",
          entry_status: dbStatus,
        });
        mocks.useTeamCompetitionsQuery.mockReturnValue({
          data: [comp],
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        });

        render(<TeamCompetitionList teamId="team-past-hide" isAdmin={isAdmin} />);

        // 3ラベルいずれも一切表示されない (DB値に関わらず。表示自体が無い)
        expect(screen.queryByText("受付前")).toBeNull();
        expect(screen.queryByText("受付中")).toBeNull();
        expect(screen.queryByText("受付終了")).toBeNull();
        // タップ可能なプルダウン(chevron-down)も存在しない
        expect(screen.queryAllByTestId("icon-chevron-down")).toHaveLength(0);
      },
    );
  });

  describe("[Sprint Contract D-2][V-5][境界値] 今日・未来日は受付ステータスが表示される (今日は過去扱いしない)", () => {
    it("今日は過去扱いしない: DB=open のままバッジは「受付中」と表示される (非admin)", () => {
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

    it("今日は過去扱いしない: DB=before のままバッジは「受付前」と表示される (非admin)", () => {
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

    it("今日: admin バッジも表示され、タップでプルダウンが展開できる (D-3 とのクロスチェック)", () => {
      const comp = makeCompetition({
        id: "c-today-admin-visible",
        date: TODAY_DATE,
        title: "本日大会admin",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-today-admin2" isAdmin={true} />);

      expect(screen.getByText("受付中")).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "受付中" }));
      expect(screen.getAllByText("受付終了").length).toBeGreaterThan(0);
    });

    it("未来日: admin バッジも表示される", () => {
      const comp = makeCompetition({
        id: "c-future-admin-visible",
        date: FUTURE_DATE,
        title: "未来大会admin",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-future-admin2" isAdmin={true} />);

      expect(screen.getByText("受付前")).toBeDefined();
      expect(screen.queryAllByTestId("icon-chevron-down").length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 非 admin バッジの非インタラクティブ性 (無変更。future/today のみ該当。past は D-2 で行ごと消える)
  // -----------------------------------------------------------------------

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

      expect(screen.getByText("受付中")).toBeDefined();
      expect(screen.queryByRole("button", { name: "受付中" })).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // D-3 [V-6][V-7][V-8]: 受付ステータスをカード上のプルダウンに
  // -----------------------------------------------------------------------

  describe("[Sprint Contract D-3][V-6] admin バッジタップでカード上に3択プルダウンが展開する", () => {
    it("バッジ(受付中)をタップすると受付前/受付中/受付終了の3択が現れ、受付状況モーダル(TeamCompetitionEntryModal)は一度も開かない", () => {
      const comp = makeCompetition({
        id: "c-dropdown-1",
        date: FUTURE_DATE,
        title: "プルダウン大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-dropdown" isAdmin={true} />);

      // 展開前: 現在値以外の2ラベルは存在しない
      expect(screen.queryByText("受付前")).toBeNull();
      expect(screen.queryByText("受付終了")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "受付中" }));

      // 展開後: 3択すべてが表示される
      expect(screen.getAllByText("受付前").length).toBeGreaterThan(0);
      expect(screen.getAllByText("受付中").length).toBeGreaterThan(0);
      expect(screen.getAllByText("受付終了").length).toBeGreaterThan(0);

      // 受付状況モーダル (TeamCompetitionEntryModal) は admin 経由では廃止され、一度も開かない
      expect(screen.queryByText("ENTRY_MODAL_OPEN")).toBeNull();
      expect(mocks.entryModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
      // 回帰ガード: 誤ってバブリングして編集画面へ遷移していないこと
      expect(mocks.navigate).not.toHaveBeenCalledWith("CompetitionForm", expect.anything());
    });

    it("[技術要件] 3択プルダウンは新たな RN <Modal> をネストしない (__modalMountRegistry に新規 mount が記録されない)", () => {
      __resetModalMountRegistry();

      const comp = makeCompetition({
        id: "c-dropdown-modal-check",
        date: FUTURE_DATE,
        title: "モーダル検査大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-modal-check" isAdmin={true} />);
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));

      expect(__modalMountRegistry.events).toHaveLength(0);
    });
  });

  describe("[Sprint Contract D-3][V-7] 別ステータス選択で mutation が正しい値で呼ばれる。同一値の選択は no-op", () => {
    it("受付前→受付中を選ぶと確認 Alert が出て、OK 押下で mutation が { id, updates: { entry_status: 'open' } } で呼ばれる", () => {
      const comp = makeCompetition({
        id: "c-mut-1",
        date: FUTURE_DATE,
        title: "変更大会1",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-mut1" isAdmin={true} />);

      fireEvent.click(screen.getByRole("button", { name: "受付前" })); // 展開 (トリガー、この時点で一意)
      fireEvent.click(screen.getByRole("button", { name: "受付中" })); // 選択 (現在値と異なるため展開後も一意)

      expect(Alert.alert).toHaveBeenCalledTimes(1);
      const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const okButton = buttons.find((b) => b.onPress);
      expect(okButton, "確認ダイアログの OK 相当ボタンが見つからない").toBeDefined();
      okButton?.onPress?.();

      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        id: "c-mut-1",
        updates: { entry_status: "open" },
      });
    });

    it("同一値 (受付中→受付中) を選択しても確認 Alert も mutation も呼ばれない", () => {
      const comp = makeCompetition({
        id: "c-mut-noop",
        date: FUTURE_DATE,
        title: "noop大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-noop" isAdmin={true} />);

      // 展開前は唯一の一致 (トリガー自身) のはず。参照を保持しておき、
      // 展開後に「トリガー自身を誤って再クリックしてメニューを閉じてしまう」ことを避ける
      // (トリガーは再クリックでトグルして閉じるため、それを含めて全部クリックすると
      // 後続のクリックが無意味になり、no-op 崩れを検出できなくなる)。
      const trigger = screen.getByRole("button", { name: "受付中" });
      fireEvent.click(trigger); // 展開

      // 展開後に新たに現れた「受付中」要素 (トリガーとは別の DOM ノード = 選択肢自体) だけを
      // クリック対象にする。実装がトリガーを残す/隠すいずれの場合でも、新規要素があれば拾える。
      const afterExpand = screen.getAllByRole("button", { name: "受付中" });
      const optionCandidates = afterExpand.filter((el) => el !== trigger);
      expect(optionCandidates.length, "展開後に選択肢としての「受付中」要素が見つからない").toBeGreaterThan(0);
      optionCandidates.forEach((btn) => fireEvent.click(btn));

      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mocks.mutateAsync).not.toHaveBeenCalled();
    });

    it("確認ダイアログでキャンセルすると mutation は呼ばれない", () => {
      const comp = makeCompetition({
        id: "c-mut-cancel",
        date: FUTURE_DATE,
        title: "キャンセル大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-cancel" isAdmin={true} />);
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));
      fireEvent.click(screen.getByRole("button", { name: "受付終了" }));

      const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2] as Array<{
        text: string;
        style?: string;
        onPress?: () => void;
      }>;
      const cancelButton = buttons.find((b) => b.style === "cancel" || !b.onPress);
      expect(cancelButton).toBeDefined();
      cancelButton?.onPress?.();

      expect(mocks.mutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("[Sprint Contract D-3][V-8] 保存中(isPending)は選択操作をしても mutation が呼ばれない (二重送信防止・再入経路)", () => {
    // ---------------------------------------------------------------------
    // 【書き直しの経緯】(Reviewer 指摘への QA 対応)
    // 旧テストは isPending=true を「最初から固定」したモックで検証しており、
    // 「保存開始後は展開済みメニュー項目の disabled が効く」ことしか証明できなかった。
    // これは「保存中にバッジ本体を再タップしてメニューを開き直し、別ステータスを
    // 選び直す」再入経路 (バッジ本体の disabled ガード :257) を一度も突いていない。
    // ここでは isPending を固定値ではなく、deferred promise + 実 React state で
    // mutation の進行に応じて実際に変化させ、「保存開始 → 再タップ」という時系列を
    // 再現したうえで、2件目の mutation が発火しないことを検証する。
    // ---------------------------------------------------------------------

    // 実際の react-query の isPending 挙動 (mutateAsync 呼び出しで true になり、
    // resolve/reject で false に戻る) を模した、実 useState ベースの mutation モック。
    // 固定値ではなく本物の再レンダーを発生させる点が旧テストとの最大の違い。
    function useControllableMutation(spy: (args: unknown) => Promise<unknown>) {
      const [isPending, setIsPending] = React.useState(false);
      const mutateAsync = React.useCallback(
        (args: unknown) => {
          setIsPending(true);
          return spy(args).finally(() => setIsPending(false));
        },
        [spy],
      );
      return { mutateAsync, isPending };
    }

    function createDeferred<T = void>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    it("mutation 進行中 (isPending=true) にバッジを再タップしても、プルダウンは再展開せず2件目の mutation は発火しない", async () => {
      const deferred = createDeferred<void>();
      const mutateAsyncSpy = vi.fn(() => deferred.promise);
      mocks.useUpdateCompetitionMutation.mockImplementation(() =>
        useControllableMutation(mutateAsyncSpy),
      );

      const comp = makeCompetition({
        id: "c-reentry",
        date: FUTURE_DATE,
        title: "再入検証大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-reentry" isAdmin={true} />);

      // 1件目: 受付前→受付中を選択し、確認ダイアログでOKを押して mutation を開始する
      // (deferred が未 resolve のため、この mutation は「進行中」のまま保持される)。
      fireEvent.click(screen.getByRole("button", { name: "受付前" })); // 展開 (この時点で一意)
      fireEvent.click(screen.getByRole("button", { name: "受付中" })); // 選択 (展開後も一意)
      const firstButtons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0][2] as Array<{
        text: string;
        onPress?: () => void;
      }>;
      const firstOk = firstButtons.find((b) => b.onPress);
      expect(firstOk, "1件目の確認ダイアログの OK 相当ボタンが見つからない").toBeDefined();

      await act(async () => {
        firstOk?.onPress?.();
        // performStatusChange 内の setState (statusOverride/isStatusMenuOpen/isPending) と
        // mutateAsync 呼び出しによる isPending=true への再レンダーを反映させる。
        await Promise.resolve();
      });

      // mutation が実際に進行中になっている (isPending=true が再レンダーに反映済み)
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);
      // 楽観的表示は「受付中」に切り替わり、メニューは閉じている
      expect(screen.queryByText("受付前")).toBeNull();
      expect(screen.queryByText("受付終了")).toBeNull();

      // 再入試行: 保存中にバッジ (現在値ラベル「受付中」) を再タップし、
      // プルダウンを開き直して別ステータスを選ぼうとする。
      screen.getAllByRole("button", { name: "受付中" }).forEach((btn) => fireEvent.click(btn));

      // プルダウンが再展開されていないこと (バッジの disabled ガードが外れていれば
      // 「受付前」「受付終了」が選択肢として再び現れてしまう)
      expect(screen.queryByText("受付前")).toBeNull();
      expect(screen.queryByText("受付終了")).toBeNull();
      // 確認ダイアログも mutation も2件目は一切発火しない
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(mutateAsyncSpy).toHaveBeenCalledTimes(1);

      // 後片付け: pending を解消してテストを終える (unhandled rejection 防止)
      await act(async () => {
        deferred.resolve();
      });
    });
  });

  // -----------------------------------------------------------------------
  // [SC-5 REVISED] (旧番号。今回 Sprint Contract の V-11 とは別物なので注意)
  // 過去日 + 非admin: 「エントリー」ボタン (entryRecordRow, D-2/D-3 の対象外) は無変更
  // -----------------------------------------------------------------------

  describe("[SC-5 REVISED] 過去日 + 非admin: エントリーボタンが存在しない (statusRow とは別行, スコープ外で無変更)", () => {
    it("過去日の大会では「エントリー」ボタンが表示されない (押せないので isPastDate 配線先のモーダル自体が開かない)", () => {
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

  // -----------------------------------------------------------------------
  // D-4 [V-9][V-10][V-11]: カード本体タップで記録一覧モーダル (admin のみ)
  // -----------------------------------------------------------------------

  describe("[Sprint Contract D-4][V-10][V-11] カード本体タップで記録一覧モーダル (admin のみ)", () => {
    it("[V-10] admin がカード本体 (タイトル) をタップすると記録一覧モーダルが開き、対象大会の props が渡る", () => {
      const comp = makeCompetition({ id: "c-records-1", date: FUTURE_DATE, title: "記録一覧対象大会" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-records" isAdmin={true} />);

      expect(screen.queryByText("RECORDS_MODAL_OPEN")).toBeNull();

      const titleEl = screen.getByText("記録一覧対象大会");
      const cardButton = titleEl.closest("button");
      expect(cardButton, "カード本体の Pressable が button として見つからない").not.toBeNull();
      fireEvent.click(cardButton as HTMLButtonElement);

      expect(screen.getByText("RECORDS_MODAL_OPEN")).toBeDefined();
      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: true,
          competitionId: "c-records-1",
          competitionTitle: "記録一覧対象大会",
        }),
      );

      // 回帰ガード: 旧仕様の「カード本体タップ=編集画面遷移」はもう起きない
      expect(mocks.navigate).not.toHaveBeenCalledWith(
        "CompetitionForm",
        expect.objectContaining({ competitionId: "c-records-1" }),
      );
    });

    it("[V-11] 一般ビュー (isAdmin=false) ではカード本体をタップしても記録一覧モーダルが開かない", () => {
      const comp = makeCompetition({
        id: "c-records-nonadmin",
        date: FUTURE_DATE,
        title: "非管理者記録対象大会",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-records-na" isAdmin={false} />);

      const titleEl = screen.getByText("非管理者記録対象大会");
      const cardButton = titleEl.closest("button");
      expect(cardButton).not.toBeNull();
      fireEvent.click(cardButton as HTMLButtonElement);

      expect(screen.queryByText("RECORDS_MODAL_OPEN")).toBeNull();
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });

    it("記録0件でもカード本体はタップ可能 (一覧クエリは変更しない。カード自体のタップ可否のみ確認)", () => {
      const comp = makeCompetition({
        id: "c-records-alwaystap",
        date: FUTURE_DATE,
        title: "常時タップ大会",
        entry_status: "closed",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-alwaystap" isAdmin={true} />);
      const cardButton = screen.getByText("常時タップ大会").closest("button");
      fireEvent.click(cardButton as HTMLButtonElement);

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-records-alwaystap" }),
      );
    });
  });

  describe("[Sprint Contract D-4][V-9] 編集/削除/記録代理入力/エントリー代理入力/ステータスプルダウンのタップでは記録一覧モーダルが開かない (5要素を個別に検証)", () => {
    const cases: Array<[string, () => HTMLElement | null]> = [
      ["編集アイコン", () => screen.getByTestId("icon-edit-2").closest("button")],
      ["削除アイコン", () => screen.getByTestId("icon-trash-2").closest("button")],
      ["記録代理入力ボタン", () => screen.getByRole("button", { name: "記録代理入力" })],
      ["エントリー代理入力ボタン", () => screen.getByRole("button", { name: "エントリー代理入力" })],
      ["ステータスプルダウン(バッジ)", () => screen.getByTestId("icon-chevron-down").closest("button")],
    ];

    it.each(cases)("%s をタップしても記録一覧モーダルは開かない", (_label, getTarget) => {
      const comp = makeCompetition({
        id: "c-v9",
        date: FUTURE_DATE,
        title: "V9検証大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v9" isAdmin={true} />);

      const target = getTarget();
      expect(target, "対象要素が見つからない").not.toBeNull();
      fireEvent.click(target as HTMLButtonElement);

      expect(screen.queryByText("RECORDS_MODAL_OPEN")).toBeNull();
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Reviewer Critical C-2 再評価: admin バッジの chevron-down / hitSlop / aria (構造自体は D-3 で無変更)
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

      expect(screen.queryByRole("button", { name: "受付中" })).toBeNull();

      const labelEl = screen.getByText("受付中");
      const badgeContainer = labelEl.parentElement;
      expect(badgeContainer?.tagName.toLowerCase()).not.toBe("button");
      expect(badgeContainer?.getAttribute("accessibilitylabel")).toBeNull();
      expect(badgeContainer?.querySelector('[data-testid="icon-chevron-down"]')).toBeNull();
    });
  });
});
