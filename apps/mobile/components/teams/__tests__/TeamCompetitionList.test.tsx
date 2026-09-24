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
 * [V-11] 非admin もカード本体 (タイトル行/本文行の両方) をタップすると記録一覧モーダルが
 *        開く (Sprint Contract: 利用者ビューでも他選手の記録を見られるようにする要望に伴い、
 *        旧仕様「非adminは開かない」を反転させる。PM 判定済みの仕様変更であり
 *        `feedback_swimhub_qa_pin_test_trap` の観測挙動昇格には該当しない)
 * [V-18] 非admin でモーダルを開いても、編集/削除アイコン・ステータスプルダウン・
 *        代理入力ボタン (admin 専用 UI) が新たに露出しない (今回の変更の回帰点)
 * [V-19] admin ビューでは、編集/削除アイコン等をタップして記録一覧モーダルが誤って
 *        開かないこと。Phase C でカード最外殻が Pressable 化され、編集/削除等は
 *        onOpenRecords を呼ぶ Pressable の**子孫**になった (もはや兄弟ではない)。
 *        バブリングが起きない真の理由は「`__mocks__/react-native.ts` の Pressable
 *        モックが実機同様に最深要素でタッチを専有するよう修正されているから」であり、
 *        JSX 上の兄弟/子孫関係そのものには依存しない。このテストはその依存 (モックの
 *        イベント転送実装) が壊れたときに検出する回帰ガードである (D-4)
 * [V-22] ステータスプルダウン展開中の statusMenuPanel 内部の余白、および
 *        statusMenuBackdrop をタップしたときに記録一覧モーダルが誤って開かないこと
 *        (Reviewer 検出の High: パネル内部の余白タップでメニューが開いたまま記録一覧
 *        モーダルも開いてしまう不具合の回帰ガード。Phase C 時点で正式テストスイートに
 *        存在しなかった経路)
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
 * 3. 旧 [V-11] (非admin はカード本体タップで記録一覧モーダルが開かない, 旧 L1193-1218) を
 *    PM 判定済みの仕様変更として反転した。検証方法・追加した回帰ガードの詳細は
 *    冒頭マッピングの [V-11]/[V-18] を参照 (重複記載を避けるためここでは繰り返さない)。
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
 * - [旧SC-1] admin ボタン構成 (記録代理入力/エントリー代理入力の2つのみ) も無変更
 *   (ただし [旧SC-1] のテスト自体は日付が FUTURE_DATE のため、下記の新規 [SC-6c] の
 *   下でも「エントリー代理入力が表示される」側であり非退行)。
 *
 * ---------------------------------------------------------------------
 * 【追記: 別 Sprint Contract (SC-1〜SC-9, 記録追加ボタン + 日付排他化) との統合】
 * (今回の Sprint Contract 改訂で、PM 経由のユーザー追加要望により以下が確定した)
 * - [SC-6b] 大会タブ admin の「記録代理入力」は非admin と同じ isEntryTabVisible 境界
 *   (未来日のみ true) の**否定**で表示される。未来日では表示されない
 *   (旧: 日付に関わらず常時表示だったが、今回のスプリントで admin ボタンが非admin と
 *   同じ三項排他に統一されたため反転した)。
 * - [SC-6c] 大会タブ admin の「エントリー代理入力」は非admin と同じ
 *   isEntryTabVisible 境界 (未来日のみ true) で表示/非表示になる。今日・過去・
 *   null・空文字・不正日付では表示されない (無変更)。
 * - [SC-9] (改訂) admin も非admin と同じく排他になった。未来日は「エントリー代理入力」
 *   のみ、今日・過去・null・空文字・不正日付は「記録代理入力」のみが表示される。
 *   旧 [SC-9] は「admin は排他ではない (両方同時に出る)」を pin していた
 *   「コピペ実装ミス検出ガード」だったが、今回のスプリントで admin 自体が排他化
 *   されたため、旧テストは実装のバグではなく仕様変更によって反転した。
 * - 上記に伴い、本ファイル末尾の新規ブロック `[Sprint Contract SC-2〜SC-8]` 内の
 *   SC-6 関連テストは `[SC-6b]`/`[SC-6c]`/`[SC-9]` の3ブロックに分割した。
 * ---------------------------------------------------------------------
 *
 * トートロジー防止: DOM に表示される文字列・要素の有無、外部 mock の呼び出し引数のみ
 * 検証する。日付は `new Date()` からの相対 (subDays/addDays) で生成し、固定日付を
 * ハードコードしない (テスト実行日に依存して壊れることを防ぐ)。
 *
 * ---------------------------------------------------------------------
 * 削除済みルート "RecordLogForm" への negative assert を
 * 「toHaveBeenCalledWith(<期待ルート>) + toHaveBeenCalledTimes(1)」の組に置き換えた
 * 経緯は、本ファイルでは重複記載せず TeamBulkNavigation.test.tsx のヘッダーコメントに
 * 集約している (同ファイルが唯一の定義元)。本ファイル内の該当 assert 直上には
 * 1行の参照コメントのみを置く。
 */

import React from "react";
import { Text, Pressable, Alert } from "react-native";
import { __modalMountRegistry, __resetModalMountRegistry } from "../../../__mocks__/react-native";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { addDays, format, subDays } from "date-fns";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import deMessages from "@apps/shared/messages/de.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";

// 固定日付ハードコード禁止: 実行時の「今日」からの相対で past/today/future を導出する
const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 5), "yyyy-MM-dd");
const TODAY_DATE = format(NOW, "yyyy-MM-dd");
const FUTURE_DATE = format(addDays(NOW, 5), "yyyy-MM-dd");
// [Sprint Contract SC-3/SC-4] 境界値専用: isEntryTabVisible は「厳密に未来 (date > today)」
// のみ true なので、境界そのもの (昨日/明日) を別途用意する。
const YESTERDAY_DATE = format(subDays(NOW, 1), "yyyy-MM-dd");
const TOMORROW_DATE = format(addDays(NOW, 1), "yyyy-MM-dd");

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

// -----------------------------------------------------------------------
// [Sprint Contract Phase C][V-20][V-21] タップ判定拡大のための DOM 探索ヘルパー
// -----------------------------------------------------------------------
// 実装後の正確な JSX 構造 (どの階層が Pressable になるか) は Phase A 時点では
// 未確定なため、特定のタグ名や新規 testID には依存しない。既存の Feather アイコン
// (icon-<name>) や表示テキストという「実装が変わっても存在し続けるはずの目印」から
// 相対的な親要素を辿ることで、「ボタン要素そのものではない、その周辺の余白 (実際には
// DOM 上は親コンテナ要素) をクリックする」ことを表現する。fireEvent.click は
// 指定した要素そのものに click イベントを dispatch し、DOM の祖先方向へバブリングする
// (jsdom は座標ヒットテストをしないため、要素を直接指定することが「その要素の
// 領域をタップする」ことの表現になる)。

/** itemHeader (タイトル行と編集/削除アイコンの間の余白を含む行) のコンテナ要素を返す。 */
function getItemHeaderContainer(): HTMLElement {
  const awardIcon = screen.getByTestId("icon-award");
  const titleRow = awardIcon.parentElement;
  if (!titleRow) throw new Error("award アイコンの親要素 (タイトル行) が見つからない");
  const itemHeader = titleRow.parentElement;
  if (!itemHeader) throw new Error("タイトル行の親要素 (itemHeader) が見つからない");
  return itemHeader;
}

/**
 * カード最外殻のコンテナ要素 (styles.item 相当) を返す。
 *
 * 【Reviewer Medium 指摘】現在の実装ではこの要素自身が単一の Pressable (<button>) であるため、
 * ここに fireEvent.click するのは「padding 領域を独立にタップする」ことにはならず、
 * [V-10]/[V-11] (タイトルテキストを起点に closest("button") で辿る) と同一の <button> に
 * 収束する。jsdom には「要素自身の padding だけを別途クリックする」手段が無いため、これは
 * この検証方法の限界であり、意図的にそう設計している (V-20d のテスト内コメント参照)。
 */
function getOuterCardContainer(): HTMLElement {
  const itemHeader = getItemHeaderContainer();
  const outer = itemHeader.parentElement;
  if (!outer) throw new Error("itemHeader の親要素 (カード最外殻) が見つからない");
  return outer;
}

/** admin ビュー: 受付ステータスのプルダウン (chevron-down アイコン) から statusRow を辿る。 */
function getStatusRowFromDropdown(): HTMLElement {
  const chevron = screen.getByTestId("icon-chevron-down");
  const badgeButton = chevron.closest("button");
  if (!badgeButton) throw new Error("chevron-down アイコンの祖先 button (ステータスバッジ) が見つからない");
  const wrapper = badgeButton.parentElement;
  if (!wrapper) throw new Error("ステータスバッジの親要素 (statusDropdownWrapper) が見つからない");
  const statusRow = wrapper.parentElement;
  if (!statusRow) throw new Error("statusDropdownWrapper の親要素 (statusRow) が見つからない");
  return statusRow;
}

/** 非admin ビュー: 受付ステータスのラベルテキストから statusRow を辿る (バッジ自体が非インタラクティブ)。 */
function getStatusRowFromLabel(label: string): HTMLElement {
  const labelEl = screen.getByText(label);
  const badge = labelEl.parentElement;
  if (!badge) throw new Error(`ステータスラベル "${label}" の親要素 (バッジ) が見つからない`);
  const statusRow = badge.parentElement;
  if (!statusRow) throw new Error("バッジの親要素 (statusRow) が見つからない");
  return statusRow;
}

/** entryRecordRow (エントリー/記録系ボタンが並ぶ行) のコンテナ要素を、行内の任意のボタンから辿る。 */
function getEntryRecordRowFromButton(button: HTMLElement): HTMLElement {
  const row = button.parentElement;
  if (!row) throw new Error("ボタンの親要素 (entryRecordRow) が見つからない");
  return row;
}

/**
 * statusMenuBackdrop (プルダウン背景の閉じるための透明 Pressable) を特定する。
 *
 * 【識別方法の変遷】当初は「accessibilityRole を持たない唯一の button」という消去法で
 * 特定していたが、Critical (アクセシビリティ) 対応でカード最外殻 Pressable からも
 * accessibilityRole が削除され (accessible={false} のため死んだ属性だった)、
 * 「role 無し」がもはや一意の目印ではなくなった。a11y 属性は今後も継続的に見直される
 * 対象であり不安定なため、代わりに `styles.statusMenuBackdrop` 固有のスタイル値
 * (画面全体を覆う top/left/right/bottom を全て 0 にする、という他のどの要素とも
 * 被らない意味的シグネチャ) で識別する。
 */
function getStatusMenuBackdrop(container: HTMLElement): HTMLElement {
  const candidates = Array.from(container.querySelectorAll("button"));
  const backdrop = candidates.find((el) => {
    const style = el.getAttribute("style") ?? "";
    return (
      style.includes("top: 0px") &&
      style.includes("left: 0px") &&
      style.includes("right: 0px") &&
      style.includes("bottom: 0px")
    );
  });
  if (!backdrop) throw new Error("statusMenuBackdrop (画面全体を覆う button) が見つからない");
  return backdrop;
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

    // [脆さ修正] ヘッダーに一括登録ボタンが追加され buttons[0] が「大会を追加」では
    // なくなった。加えて競合大会が0件のため「大会を追加」ラベルのボタンはヘッダー用・
    // 空状態用の2つ存在する (どちらも同じ handleAdd を呼ぶため機能的には等価)。
    // インデックスではなく、ヘッダー側 (+ アイコン付き) を icon-plus の有無で識別する。
    const addButtons = screen.getAllByRole("button", { name: "大会を追加" });
    const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
    expect(headerAddButton, "ヘッダーの追加ボタン(+アイコン付き)が見つからない").toBeDefined();
    fireEvent.click(headerAddButton!);

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
  //
  // 【QA Phase A 書き換えメモ (今回の Sprint Contract SC-2/SC-3/SC-4)】
  // makeCompetition() のデフォルト日付は FUTURE_DATE。旧仕様は「エントリー」と
  // 「記録」が未来日で両方同時に表示される前提だったが、今回の Sprint Contract は
  // 非admin を日付で排他表示にする (未来=エントリーのみ/それ以外=記録追加のみ)。
  // 実測: apps/shared/messages/ja.json は既に recordButton キーの値が
  // "記録" → "記録追加" に更新済み (SC-2)。網羅的な排他性検証は本ファイル末尾の
  // 新設ブロック [Sprint Contract SC-1〜SC-8] に集約したため、ここでは
  // 「未来日でエントリーボタンが出る」既存 pin のみ残し、「記録ボタンが出る」pin は
  // 排他仕様と正面から矛盾するため、日付を過去日に変更し新ラベルで書き換えた。
  // -----------------------------------------------------------------------

  // [S3-V-B1] エントリーボタンが表示される (未来日、非退行)
  it("[S3-V-B1] 未来日の大会では、エントリーボタンが表示される", () => {
    const comp = makeCompetition({ title: "冬季大会", date: FUTURE_DATE });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.entryButton = 'エントリー' (SC-5, 不変)
    expect(screen.getByText("エントリー")).toBeDefined();
  });

  // [S3-V-B1→SC-2] 記録追加ボタンが表示される (過去日: 排他仕様によりエントリーは出ない)
  it("[S3-V-B1→SC-2] 過去日の大会では、記録追加ボタンが表示される (旧ラベル「記録」は表示されない)", () => {
    const comp = makeCompetition({ title: "冬季大会", date: PAST_DATE });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    // ja.json の teams.mobile.teamCompetitionList.recordButton = '記録追加' (SC-2)
    expect(screen.getByText("記録追加")).toBeDefined();
    expect(screen.queryByText("記録", { exact: true })).toBeNull();
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
    // 【QA Phase B 書き換え】旧アサーションは `teamId` prop を期待していたが、現行の
    // TeamCompetitionEntryModal は teamId を受け取らない (TeamCompetitionList.tsx の
    // 呼び出しに teamId は渡されていない、実測済み)。渡されなくなった prop を
    // 期待し続けていただけで、モーダルは isAdmin:false / entryStatus:"open" で
    // 正しく開いている (退行ではない)。
    expect(mocks.entryModalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        visible: true,
        competitionId: "c-ent",
        competitionTitle: "秋季大会",
        entryStatus: "open",
        isAdmin: false,
      }),
    );
  });

  // [V-06 / Sprint Contract] モーダル内「種目をエントリー」(onSelfEntry) で
  // CompetitionTabForm (initialTab: "entry") へ遷移する (セルフエントリー機能維持)。
  // 【QA Phase A 書き換え】旧仕様は EntryForm への navigate だったが、今回のスプリントで
  // handleSelfEntry の遷移先が CompetitionTabForm に統一されたため期待値を更新した。
  it("モーダルの onSelfEntry で CompetitionTabForm に { competitionId, date, teamId, initialTab: 'entry' } で navigate される", () => {
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
      "CompetitionTabForm",
      expect.objectContaining({
        competitionId: "c-self",
        date: FUTURE_DATE,
        teamId: "team-self",
        initialTab: "entry",
      }),
    );
  });

  // [#7 dead-click 防止] 現在 status が "open" でないときは onSelfEntry が発火しても navigate しない
  it("entry_status が closed のとき onSelfEntry が発火しても CompetitionTabForm へ navigate しない", () => {
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

    expect(mocks.navigate).not.toHaveBeenCalledWith(
      "CompetitionTabForm",
      expect.objectContaining({ initialTab: "entry" }),
    );
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
  //
  // 【QA Phase A 書き換えメモ】元の日付は "2026-10-15" のハードコードだった。この
  // ファイルの他のテストは「固定日付ハードコード禁止: 実行時の『今日』からの相対で
  // past/today/future を導出する」方針を明記しているのに、この1件だけ違反していた
  // (テスト作成時点では未来日だったはずが、実行日が進めば過去日に変わり得る地雷)。
  // 加えて今回の Sprint Contract の排他仕様により、未来日では記録追加ボタン自体が
  // 描画されなくなるため、そのままでは矛盾する。PAST_DATE に修正し、ラベルも
  // SC-2 の新文言「記録追加」に書き換えた。
  it("[S3-V-B1 / W-01] 記録追加ボタンを押すと CompetitionTabForm に { competitionId, date, teamId, initialTab: 'record' } で navigate される (重複レコード作成バグの回帰防止)", () => {
    const comp = makeCompetition({ id: "c-rec", date: PAST_DATE, title: "選手権大会" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-rec" isAdmin={false} />);

    const recordButton = screen.getByRole("button", { name: "記録追加" });
    fireEvent.click(recordButton);

    expect(mocks.navigate).toHaveBeenCalledWith(
      "CompetitionTabForm",
      expect.objectContaining({
        competitionId: "c-rec",
        date: PAST_DATE,
        teamId: "team-rec",
        initialTab: "record",
      }),
    );

    // 期待ルート以外へは飛ばない (上の toHaveBeenCalledWith との組で担保)
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // [旧SC-1] admin ボタン構成 (別スプリント番号。今回の Sprint Contract の
  // SC-1「非admin ラベル/アイコン変更」とは無関係な過去の番号なので混同注意)
  // -----------------------------------------------------------------------

  describe("[旧SC-1] admin 時のボタン構成", () => {
    // 【QA Phase B 書き換え (R3)】日付は FUTURE_DATE (未来) のまま。今回のスプリントで
    // admin の未来日ボタンは「エントリー代理入力」から「エントリー」(モーダルを開く、
    // 非admin と同じ導線) に置換された。カード上に代理入力ボタンは残らない
    // (代理入力への導線はモーダル内に移動した。実装のバグではなく仕様変更)。
    it("「記録」ボタンは存在せず、未来日は「エントリー」のみ存在する (代理入力ボタンはカードに残らない)", () => {
      const comp = makeCompetition({ id: "c-admin-btns", date: FUTURE_DATE, title: "管理者大会" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

      expect(screen.queryByRole("button", { name: "記録" })).toBeNull();

      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
      expect(screen.queryByRole("button", { name: "記録代理入力" })).toBeNull();
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
      const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0]![2] as Array<{ // 直前の toHaveBeenCalledTimes(1) で存在は保証済み
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

      const buttons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0]![2] as Array<{ // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
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
      const firstButtons = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0]![2] as Array<{ // 直前の click で Alert.alert が呼ばれる設計のため必ず存在
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
      // [SC-2] ラベルは新文言「記録追加」に変わった (旧「記録」は表示されない)
      expect(screen.getByRole("button", { name: "記録追加" })).toBeDefined();
      // getByRole の name は既定で完全一致 (部分一致ではない) なので、"記録追加" が
      // 描画されていても "記録" 単体では引っかからない。ByRoleOptions に exact
      // プロパティは存在しない (TS2769) ため使わない。
      expect(screen.queryByRole("button", { name: "記録" })).toBeNull();
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
      const lastCall = calls[calls.length - 1]![0] as Record<string, unknown>; // 直前の click でモーダルが開かれる設計のため必ず存在
      expect(lastCall.isPastDate).toBeFalsy();
    });

    // 【QA Phase A 書き換え: 仕様が正面から反転したケース】
    // 旧テストは「今日はエントリー可 (過去扱いしない)」を pin していた。これは
    // 旧仕様 isCompetitionDateInPast (今日は過去でない) を素直に反映したもの。
    // 今回の Sprint Contract [SC-4] は判定を isEntryTabVisible 相当 (未来のみ
    // エントリー可、今日は非エントリー=記録追加のみ) に変更するため、
    // 「今日はエントリー可」という前提そのものが仕様変更で無効化された。
    // 観測挙動をそのまま守る pin ではなく、Sprint Contract の記述に基づいて
    // 反転させている (人間の判断: PM 承認済み Sprint Contract の SC-4 行)。
    it("[SC-4 境界値] 今日の大会では「エントリー」ボタンは表示されず、「記録追加」ボタンが表示される (今日は未来ではないため)", () => {
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

      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      expect(screen.getByRole("button", { name: "記録追加" })).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // D-4 [V-9][V-10][V-11]: カード本体タップで記録一覧モーダル (admin のみ)
  // -----------------------------------------------------------------------

  describe("[Sprint Contract D-4][V-10][V-11] カード本体タップで記録一覧モーダル (admin/非admin 共通)", () => {
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

    it("[V-11] 一般ビュー (isAdmin=false) でカード本体のタイトル行をタップすると記録一覧モーダルが開き、対象大会の props が渡る (仕様反転)", () => {
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

      expect(screen.queryByText("RECORDS_MODAL_OPEN")).toBeNull();

      // [落とし穴対策] closest("button") で要素が見つかること自体は disabled でも
      // 満たされてしまう (RN モックは disabled でも <button> を描画する)。
      // 主軸は recordsModalSpy が visible:true + 対象 competitionId で呼ばれることとする。
      const titleEl = screen.getByText("非管理者記録対象大会");
      const cardButton = titleEl.closest("button");
      expect(cardButton, "タイトル行の Pressable が button として見つからない").not.toBeNull();
      fireEvent.click(cardButton as HTMLButtonElement);

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: true,
          competitionId: "c-records-nonadmin",
          competitionTitle: "非管理者記録対象大会",
        }),
      );
      expect(screen.getByText("RECORDS_MODAL_OPEN")).toBeDefined();
    });

    it("[V-11] 一般ビュー (isAdmin=false) でカード本体の本文行 (日付/場所) をタップしても記録一覧モーダルが開く (タイトル行だけでなく本文行の Pressable も配線されていること)", () => {
      const comp = makeCompetition({
        id: "c-records-nonadmin-body",
        date: FUTURE_DATE,
        title: "非管理者記録対象大会2",
        place: "本文タップ会場",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-records-na-body" isAdmin={false} />);

      // calendar アイコンは本文行 Pressable の子であり、タイトル行 Pressable の子ではない。
      // 祖先 <button> はバブリングで本文行側だけがヒットするため、タイトル行と独立に検証できる。
      const calendarIcon = screen.getByTestId("icon-calendar");
      const bodyButton = calendarIcon.closest("button");
      expect(bodyButton, "本文行の Pressable が button として見つからない").not.toBeNull();
      fireEvent.click(bodyButton as HTMLButtonElement);

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          visible: true,
          competitionId: "c-records-nonadmin-body",
        }),
      );
    });

    it("[V-18 回帰ガード] 非admin でモーダルを開いても、編集/削除アイコン・ステータスプルダウン・代理入力ボタン (admin 専用 UI) は露出しない", () => {
      const comp = makeCompetition({
        id: "c-records-nonadmin-noleak",
        date: FUTURE_DATE,
        title: "非管理者UI非露出検証大会",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-noleak" isAdmin={false} />);

      const titleEl = screen.getByText("非管理者UI非露出検証大会");
      fireEvent.click(titleEl.closest("button") as HTMLButtonElement);

      // モーダルが開いたことの確認 (前提条件)
      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );

      // admin 専用 UI が一切露出していないこと
      expect(screen.queryByTestId("icon-edit-2")).toBeNull();
      expect(screen.queryByTestId("icon-trash-2")).toBeNull();
      expect(screen.queryByTestId("icon-chevron-down")).toBeNull();
      expect(screen.queryByRole("button", { name: "記録代理入力" })).toBeNull();
      expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
      // 非admin 本来の導線は維持されていること。日付は FUTURE_DATE なので [SC-3] の
      // 排他仕様により「エントリー」のみが出て「記録追加」は出ない (両方は同時に出ない)。
      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "記録追加" })).toBeNull();
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

  // [V-19 回帰ガード] 非admin ゲート解除 (D-4) 後も、admin ビューで編集/削除アイコン等を
  // タップして記録一覧モーダルが誤って開かないこと。
  //
  // 【Reviewer Medium 指摘への訂正 (2026-09-19)】旧コメントは「編集/削除等は
  // onOpenRecords を呼ぶ Pressable の兄弟要素であり構造的にバブリングは起こり得ない」
  // としていたが、Phase C でカード最外殻 (`styles.item`) が Pressable 化され、
  // 編集/削除等は onOpenRecords を呼ぶ Pressable の**子孫**になった。もはや
  // 「兄弟だから安全」ではない。バブリングが実際に起きない理由は
  // `__mocks__/react-native.ts` の Pressable モックが実機同様に「最深要素が
  // タッチを専有し、stopPropagation してから onPress へ転送する」よう修正されて
  // いるからであり、この**モックのイベント転送実装への依存**が唯一の防波堤である。
  // 将来このモックの転送ロジックが壊れた場合に検出できるよう、ここに回帰ガードとして
  // このテストを維持する (isAdmin 条件の除去/変更で onOpenRecords が無条件発火に
  // 倒れるリグレッションも合わせて検出する)。
  describe("[Sprint Contract D-4][V-9][V-19] 編集/削除/記録代理入力/エントリー代理入力/ステータスプルダウンのタップでは記録一覧モーダルが開かない (5要素を個別に検証, admin ビュー)", () => {
    // 今回のスプリントで admin の「記録代理入力」「エントリー代理入力」が排他表示に
    // なったため (未来日はエントリー代理入力のみ、それ以外は記録代理入力のみ)、
    // 両者を同一の日付で同時に描画できない。ケースごとに描画に必要な日付を持たせる。
    const cases: Array<[string, string, () => HTMLElement | null]> = [
      ["編集アイコン", FUTURE_DATE, () => screen.getByTestId("icon-edit-2").closest("button")],
      ["削除アイコン", FUTURE_DATE, () => screen.getByTestId("icon-trash-2").closest("button")],
      ["記録代理入力ボタン", PAST_DATE, () => screen.getByRole("button", { name: "記録代理入力" })],
      // 【QA Phase B 書き換え (R3)】admin の未来日ボタンは「エントリー代理入力」から
      // 「エントリー」(モーダルを開くだけ) に置換された。カード上のこのボタンをタップ
      // しても記録一覧モーダルは開かない、という検証観点自体は変わらない。
      ["エントリーボタン", FUTURE_DATE, () => screen.getByRole("button", { name: "エントリー" })],
      ["ステータスプルダウン(バッジ)", FUTURE_DATE, () => screen.getByTestId("icon-chevron-down").closest("button")],
    ];

    it.each(cases)("%s をタップしても記録一覧モーダルは開かない", (_label, date, getTarget) => {
      const comp = makeCompetition({
        id: "c-v9",
        date,
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
  // [Sprint Contract Phase C][V-20][V-21] タップ判定拡大
  // (ユーザー要望: 「エントリー/記録/代理入力系のボタン以外の部分は全てタップ判定としたい」)
  //
  // PM 実測: __mocks__/react-native.ts の Pressable モックを実機 RN 準拠
  // (stopPropagation してから onPress へイベント転送) に修正済み。これにより、
  // ネストした Pressable は実機同様「最も深い Pressable だけが反応し、祖先へは
  // バブリングしない」ため、D-4 コメント (旧: モックの嘘に合わせて JSX を分割していた)
  // の制約が外れ、カード全体を1つの Pressable にしてもボタン類の既存動作を壊さずに
  // 実装できる (実装方法自体は Web/App Developer に委ねる。ここでは「どう実装しても
  // 満たすべき外部から観測可能な振る舞い」だけを検証する)。
  //
  // 実装前提を置かない検証方法: 既存の Feather アイコンや表示テキストを起点に、
  // 「そのボタン要素自身ではない、直近の非インタラクティブな親コンテナ要素」を
  // fireEvent.click で直接クリックする。これは実機で「ボタンの外側の余白をタップする」
  // ことに相当する (jsdom はクリック対象の要素をそのまま dispatch し、そこから
  // 祖先方向へバブリングするため、要素の選択自体が「タップ位置」を表現する)。
  // -----------------------------------------------------------------------

  describe("[Sprint Contract Phase C][V-20] アクションボタン以外の領域をタップすると記録一覧モーダルが開く (死角4種の代表箇所, admin ビュー)", () => {
    it("[V-20a] itemHeader の余白 (タイトルと編集/削除アイコンの間) をタップするとモーダルが開く", () => {
      const comp = makeCompetition({ id: "c-tapzone-header", date: FUTURE_DATE, title: "タップ拡大検証大会1" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={true} />);

      fireEvent.click(getItemHeaderContainer());

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-header" }),
      );
    });

    it("[V-20b] statusRow の余白 (バッジ以外) をタップするとモーダルが開き、ステータスプルダウンは展開しない", () => {
      const comp = makeCompetition({
        id: "c-tapzone-status",
        date: FUTURE_DATE,
        title: "タップ拡大検証大会2",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={true} />);

      fireEvent.click(getStatusRowFromDropdown());

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-status" }),
      );
      // プルダウンが誤って展開されていないこと (受付前/受付終了が新たに現れない)
      expect(screen.queryByText("受付前")).toBeNull();
      expect(screen.queryByText("受付終了")).toBeNull();
    });

    it("[V-20c] entryRecordRow の背景 (代理入力ボタンとボタンの間) をタップするとモーダルが開く (admin ビュー)", () => {
      // 今回のスプリントで admin も排他化されたため、「記録代理入力」ボタンが
      // 描画される PAST_DATE を使う (FUTURE_DATE だとエントリー代理入力のみになる)。
      const comp = makeCompetition({ id: "c-tapzone-actionrow-admin", date: PAST_DATE, title: "タップ拡大検証大会3" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={true} />);

      const recordBulkButton = screen.getByRole("button", { name: "記録代理入力" });
      fireEvent.click(getEntryRecordRowFromButton(recordBulkButton));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-actionrow-admin" }),
      );
    });

    // 【Reviewer Medium 指摘への訂正】現在の実装ではカード最外殻がそのまま単一の
    // Pressable であるため、この要素を直接クリックする操作は [V-10] (タイトルテキストを
    // 起点に closest("button") で辿る) と同一の <button> 要素へ収束し、実質的に
    // 同じ検証になっている。「padding 領域をタップした」わけではない (padding は
    // 要素自身の box の一部であり、別要素として独立にクリックする手段が jsdom には無い)。
    // それでも本テストは維持する: [V-10] が「タイトルテキストという特定の子要素」を
    // 起点にするのに対し、本テストは「itemHeader の親という構造的位置」を起点にする。
    // 将来カード最外殻とタイトル行が再び分離した場合 (Phase A 以前の構造に戻すリファクタ等)、
    // 起点が異なる2つのテストのどちらが追随するかが変わるため、独立した回帰ガードとして残す。
    it("[V-20d] カード最外殻の要素そのもの (itemHeader の親) を直接クリックすると記録一覧モーダルが開く (admin ビュー、[V-10]と同一 <button> に収束するが起点が異なる)", () => {
      const comp = makeCompetition({ id: "c-tapzone-outer-admin", date: FUTURE_DATE, title: "タップ拡大検証大会4" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={true} />);

      fireEvent.click(getOuterCardContainer());

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-outer-admin" }),
      );
    });
  });

  describe("[Sprint Contract Phase C][V-20] アクションボタン以外の領域をタップすると記録一覧モーダルが開く (利用者ビュー)", () => {
    // 【QA Phase A 書き換え】FUTURE_DATE のままだと [SC-3] の排他仕様により
    // 「記録追加」ボタン自体が描画されなくなるため PAST_DATE に変更し、
    // ラベルも SC-2 の新文言に書き換えた (背景タップ判定自体の検証意図は不変)。
    it("[V-20c] entryRecordRow の背景 (エントリー/記録追加ボタンの間) をタップするとモーダルが開く (非admin ビュー)", () => {
      const comp = makeCompetition({ id: "c-tapzone-actionrow-member", date: PAST_DATE, title: "タップ拡大検証大会5" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={false} />);

      const recordButton = screen.getByRole("button", { name: "記録追加" });
      fireEvent.click(getEntryRecordRowFromButton(recordButton));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-actionrow-member" }),
      );
    });

    // [V-20d] 注記は admin ビュー版と同じ (getOuterCardContainer の docstring 参照)。
    it("[V-20d] カード最外殻の要素そのもの (itemHeader の親) を直接クリックすると記録一覧モーダルが開く (非admin ビュー、[V-11]と同一 <button> に収束するが起点が異なる)", () => {
      const comp = makeCompetition({ id: "c-tapzone-outer-member", date: FUTURE_DATE, title: "タップ拡大検証大会6" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={false} />);

      fireEvent.click(getOuterCardContainer());

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-outer-member" }),
      );
    });

    it("[V-20e] statusRow 全体 (バッジのタップも含む) が非admin では従来完全な死角だったが、タップするとモーダルが開く", () => {
      const comp = makeCompetition({
        id: "c-tapzone-status-member",
        date: FUTURE_DATE,
        title: "タップ拡大検証大会7",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-tapzone" isAdmin={false} />);

      // 非admin のバッジは元々 role=button を持たない非インタラクティブ要素であり、
      // バッジのラベル文字列自体をタップしても (SC-3 の通り) 単体では何も起きなかった。
      // 今回の要望はここも含めて「アクション要素でなければ全てタップ判定にする」ため、
      // ラベルをタップした場合の挙動を検証する。
      fireEvent.click(getStatusRowFromLabel("受付中"));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-tapzone-status-member" }),
      );
    });
  });

  describe("[Sprint Contract Phase C][V-21] アクションボタンをタップしたときは記録一覧モーダルが開かない (回帰ガード, admin ビュー)", () => {
    // 今回のスプリントで admin の「記録代理入力」「エントリー代理入力」が排他表示に
    // なったため、ケースごとに描画に必要な日付を持たせる (V-9 ブロックと同じ方針)。
    const adminCases: Array<[string, string, () => HTMLElement | null]> = [
      ["編集アイコン", FUTURE_DATE, () => screen.getByTestId("icon-edit-2").closest("button")],
      ["削除アイコン", FUTURE_DATE, () => screen.getByTestId("icon-trash-2").closest("button")],
      ["受付ステータスプルダウン(バッジ)", FUTURE_DATE, () => screen.getByTestId("icon-chevron-down").closest("button")],
      ["記録代理入力ボタン", PAST_DATE, () => screen.getByRole("button", { name: "記録代理入力" })],
      // 【QA Phase B 書き換え (R3)】admin の未来日ボタンは「エントリー」に置換された。
      ["エントリーボタン", FUTURE_DATE, () => screen.getByRole("button", { name: "エントリー" })],
    ];

    it.each(adminCases)("%s をタップしても記録一覧モーダルは開かない (admin)", (_label, date, getTarget) => {
      const comp = makeCompetition({
        id: "c-v21-admin",
        date,
        title: "V21検証大会admin",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v21-admin" isAdmin={true} />);

      const target = getTarget();
      expect(target, "対象要素が見つからない").not.toBeNull();
      fireEvent.click(target as HTMLButtonElement);

      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });

    it("受付ステータスの選択肢 (展開後の「受付前」「受付中」「受付終了」) をタップしても記録一覧モーダルは開かない", () => {
      const comp = makeCompetition({
        id: "c-v21-menuoption",
        date: FUTURE_DATE,
        title: "V21メニュー検証大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v21-menu" isAdmin={true} />);

      // トリガー (現在値「受付前」) をタップして展開する。展開前は「受付前」のみ一意。
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));

      // 展開後に現れる選択肢「受付中」はトリガーのラベルとは異なるため一意に取得できる
      // (既存 [V-7] テストと同じ前提)。
      fireEvent.click(screen.getByRole("button", { name: "受付中" }));

      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });
  });

  describe("[Sprint Contract Phase C][V-21] アクションボタンをタップしたときは記録一覧モーダルが開かない (回帰ガード, 利用者ビュー)", () => {
    // 【QA Phase A 書き換え】旧テストは「エントリー」「記録」の2ボタンが同一日付
    // (FUTURE_DATE) で同時に存在する前提の it.each だった。今回の Sprint Contract
    // [SC-3][SC-4] の排他仕様により、非admin では日付ごとにどちらか一方しか
    // 描画されなくなったため、ケースごとに描画される日付を分離した
    // (エントリー=未来日、記録追加=過去日)。ラベルも SC-2 の新文言に書き換えた。
    const memberCases: Array<[string, string, string]> = [
      ["エントリーボタン", "エントリー", FUTURE_DATE],
      ["記録追加ボタン", "記録追加", PAST_DATE],
    ];

    it.each(memberCases)("%s をタップしても記録一覧モーダルは開かない (非admin)", (_label, name, date) => {
      const comp = makeCompetition({
        id: "c-v21-member",
        date,
        title: "V21検証大会member",
        entry_status: "open",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v21-member" isAdmin={false} />);

      const target = screen.getByRole("button", { name });
      expect(target, "対象要素が見つからない").not.toBeNull();
      fireEvent.click(target);

      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // [Sprint Contract Phase C][V-22] ステータスプルダウン展開中のパネル内部/バックドロップの誤爆防止
  //
  // 【Reviewer 検出の High】カード全体が Pressable 化されたことで、展開中の
  // statusMenuPanel はカード最外殻 Pressable の子孫になった。パネル内部の
  // 選択肢と選択肢の間の余白 (パネル自身の padding/gap) をタップすると、
  // 従来はパネルが単なる View で祖先へバブリングしなかった前提が崩れ、
  // 「メニューは開いたまま記録一覧モーダルも開いてしまう」誤爆が発生する経路。
  // Phase C 時点の正式テストスイートにはこの経路のガードが1件も存在しなかった
  // (Reviewer が使い捨てテストで発見)。ここでは「メニューが閉じるか開いたままか」の
  // 具体的な UI 挙動は実装の選択に委ね (App Developer 対応中)、
  // 「記録一覧モーダルが開かない」という最重要不変条件のみを検証する。
  //
  // statusMenuBackdrop (プルダウン背景の閉じるための透明 Pressable) は既存の
  // Pressable モック修正 (stopPropagation 転送) により現状でも正しく動作するはずだが、
  // 公式スイートに回帰ガードが1件も無かったため、ここに追加する。
  // -----------------------------------------------------------------------

  describe("[Sprint Contract Phase C][V-22] ステータスプルダウン展開中のパネル内部/バックドロップの誤爆防止", () => {
    it("[V-22a] statusMenuPanel 内部の余白 (選択肢と選択肢の間) をタップしても記録一覧モーダルは開かない (Reviewer 検出の High の回帰ガード)", () => {
      const comp = makeCompetition({
        id: "c-panelgap",
        date: FUTURE_DATE,
        title: "パネル内余白検証大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-panelgap" isAdmin={true} />);

      // トリガー (現在値「受付前」) をタップして展開する。
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));

      // 展開後に現れる選択肢「受付中」の親要素 (statusMenuPanel) を、選択肢自体では
      // なくパネル自身として直接クリックする (= パネル内の余白をタップした状態を表現する)。
      const optionButton = screen.getByRole("button", { name: "受付中" });
      const panel = optionButton.parentElement;
      expect(panel, "選択肢の親要素 (statusMenuPanel) が見つからない").not.toBeNull();
      fireEvent.click(panel as HTMLElement);

      // 最重要不変条件: メニューの開閉状態がどちらであっても、記録一覧モーダルだけは
      // 絶対に開いてはいけない。
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });

    it("[V-22b] statusMenuBackdrop (プルダウン展開中の背景) をタップするとメニューが閉じ、記録一覧モーダルは開かない", () => {
      const comp = makeCompetition({
        id: "c-backdrop",
        date: FUTURE_DATE,
        title: "バックドロップ検証大会",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      const { container } = render(<TeamCompetitionList teamId="team-backdrop" isAdmin={true} />);

      fireEvent.click(screen.getByRole("button", { name: "受付前" })); // 展開
      expect(screen.getByText("受付中"), "展開後の選択肢が見つからない (前提条件)").toBeDefined();

      // getStatusMenuBackdrop: a11y 属性に依存しないスタイルシグネチャで特定する
      // (新規 testID の追加を実装に要求しない)。
      const backdrop = getStatusMenuBackdrop(container);
      fireEvent.click(backdrop);

      // メニューが閉じていること (選択肢「受付中」が消える)
      expect(screen.queryByText("受付中")).toBeNull();
      // 記録一覧モーダルは開かない
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // [Sprint Contract Phase D][V-23] 利用者ビューのボタン配置変更
  // (ユーザー要望: 「エントリーと記録ボタンをカード右側に、上が記録・下がエントリーの
  // 2行で配置してほしい」。isAdmin=false のみが対象、管理者ビューは無変更)
  //
  // 【検証可能/実機送りの切り分け】
  // jsdom は Tailwind も RN Flexbox もレイアウト計算しないため、「右側に表示される」
  // という視覚的な配置そのものはこのファイルでは検証不可能 (ピクセル位置の assert は
  // 実装のスタイル値を単に転記するだけのトートロジーになりやすいため意図的に避ける)。
  // ここで検証するのは非admin に限定した副作用として観測可能な1点のみ:
  //   [V-23b] 過去大会でエントリーボタンが消えても、記録ボタン単体が機能し続けること。
  // 実機確認に送る項目 (BLOCKED, QA Report 参照): 「右側配置」自体の視覚確認、
  // 2行スタックの実際の見た目、タップ領域が視覚位置とズレていないか。
  //
  // 【PM 裁定 (削除): 旧 [V-23a] 非admin「記録が上・エントリーが下」DOM順序検証】
  // `TeamCompetitionList.tsx` の非admin 描画は
  // `isEntryTabVisible(competition.date) ? <entryButton> : <recordButton>` という
  // 三項排他であり (このファイル該当箇所: entryButton/recordButton の分岐)、
  // 同一カードに record と entry が同時に描画される非admin の状態は構造上発生しない。
  // 「DOM順序の比較」はそもそも比較対象が2つ揃わないため観測不能であり、失敗している
  // のでも未実装なのでもない。配置要件 (記録が上/エントリーが下) を検証するガードは
  // 下記の [Sprint Contract Phase E][V-24a] (admin 未来日、記録代理入力/エントリー
  // 代理入力の2ボタンが同時に描画される) に一本化した。
  // -----------------------------------------------------------------------

  describe("[Sprint Contract Phase D][V-23] 利用者ビューのボタン配置 (記録が上/エントリーが下)", () => {
    it("[V-23b] 過去大会 + 非admin: エントリーボタンが無くても記録追加ボタンは機能する (CompetitionTabForm へ navigate される)", () => {
      const comp = makeCompetition({
        id: "c-v23-pastonly",
        date: PAST_DATE,
        title: "V23過去大会検証",
        entry_status: "closed",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v23-past" isAdmin={false} />);

      // 前提条件: エントリーボタンが存在しない (過去大会のため)
      expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();

      const recordButton = screen.getByRole("button", { name: "記録追加" });
      expect(recordButton, "記録追加ボタンが見つからない").toBeDefined();
      fireEvent.click(recordButton);

      expect(mocks.navigate).toHaveBeenCalledWith(
        "CompetitionTabForm",
        expect.objectContaining({
          competitionId: "c-v23-pastonly",
          teamId: "team-v23-past",
          initialTab: "record",
        }),
      );
    });

    // 【QA Phase A 書き換え】FUTURE_DATE のままだと [SC-3] の排他仕様により
    // 記録追加ボタンが描画されなくなるため PAST_DATE に変更した。
    it("[V-23c 非退行] レイアウト変更後も entryRecordRow の背景タップで記録一覧モーダルが開く ([V-20c] 再確認)", () => {
      const comp = makeCompetition({
        id: "c-v23-tapzone",
        date: PAST_DATE,
        title: "V23死角再確認大会",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v23-tapzone" isAdmin={false} />);

      const recordButton = screen.getByRole("button", { name: "記録追加" });
      fireEvent.click(getEntryRecordRowFromButton(recordButton));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-v23-tapzone" }),
      );
    });

    // 【QA Phase A 書き換え】旧テストは同一日付 (FUTURE_DATE) でエントリー/記録の
    // 両方が存在する前提の for ループだった。[SC-3][SC-4] の排他仕様により
    // 非admin では日付ごとにどちらか一方しか描画されないため、ケースごとに
    // 日付を分離した (この点は V-23a/d 全体の構造的矛盾とは別の、単純な
    // 「タップして誤爆しないこと」の検証なので、日付を分ければ両立できる)。
    it("[V-23d 非退行] レイアウト変更後もエントリー/記録追加ボタンをタップして記録一覧モーダルが誤って開かない ([V-21] 再確認)", () => {
      const cases: Array<[string, string, string]> = [
        ["エントリーボタン", "エントリー", FUTURE_DATE],
        ["記録追加ボタン", "記録追加", PAST_DATE],
      ];

      for (const [, name, date] of cases) {
        const comp = makeCompetition({
          id: `c-v23-noleak-${name}`,
          date,
          title: `V23誤爆再確認大会-${name}`,
          entry_status: "open",
        });
        mocks.useTeamCompetitionsQuery.mockReturnValue({
          data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
        });

        const { unmount } = render(<TeamCompetitionList teamId={`team-v23-noleak-${name}`} isAdmin={false} />);

        fireEvent.click(screen.getByRole("button", { name }));

        expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({ visible: true }),
        );

        unmount();
      }
    });
  });

  // -----------------------------------------------------------------------
  // [Sprint Contract Phase E][V-24] admin ビューのボタン配置 (利用者ビューに揃える)
  //
  // 経緯: 当初 App Developer が指示範囲を超えて admin にも左右分割レイアウトを適用 →
  // PM が「指示外」と指摘して一旦差し戻し → PM がユーザーに確認したところ
  // 「admin ビューも揃えたい」が正式な希望と判明 → 再実装。結果的に最初の実装が
  // 正解だったという経緯があるため、この仕様が今後また揺れ動いても対応できるよう
  // 「admin/非admin で同じ規則 (記録が上・エントリー系が下)」を明示的にテストする。
  //
  // 【最重要】admin には受付ステータスのプルダウン (statusMenuPanel, zIndex 20) があり、
  // 展開すると右列の代理入力ボタンと重なりうる。App Developer の実装を確認したところ、
  // 採用された解決策は「展開中は itemButtonColumn に `pointerEvents="none"` を与えて
  // ボタン列自体のタップを無効化する」というものだった (コメント L323-327 参照)。
  // これは実機 RN のタッチヒットテスト機構に依存する解決策であり、jsdom は座標も
  // pointerEvents も解釈しないため、**素の jsdom では検証不可能**。
  // そのため `__mocks__/react-native.ts` の View モックに pointerEvents="none" の
  // 挙動 (配下のクリックを素通りさせる = capture フェーズで止める) を追加した
  // (このモック拡張自体もフルスイート実行で既存テストへの影響ゼロを確認済み)。
  // -----------------------------------------------------------------------

  describe("[Sprint Contract Phase E][V-24] admin ビューのボタン配置 (利用者ビューに揃える)", () => {
    // 【QA Phase A/B 書き換え】旧 [V-24a] は「記録代理入力ボタンがエントリー代理入力
    // ボタンより DOM 順で先に現れる」を FUTURE_DATE 1ケースで pin していたが、今回の
    // スプリントで admin のボタンが排他表示になったため、同一日付で両ボタンを同時に
    // 描画できなくなった (前提が崩れた)。代わりに「排他化後も itemButtonColumn には
    // 常に1つのボタンだけが存在する (利用者ビューと同じ単一ボタンレイアウト)」を
    // 未来日/過去日の両方で確認する。
    // 【QA Phase B 追記 (R3)】未来日側のボタンは「エントリー代理入力」から「エントリー」
    // (モーダルを開く) に置換された。
    it("[V-24a 改訂] admin: 排他表示化後もボタン列には常に1つのボタンだけが存在する (利用者ビューと同じ単一ボタンレイアウト)", () => {
      const future = makeCompetition({ id: "c-v24-order-future", date: FUTURE_DATE, title: "V24順序検証大会(未来)" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [future], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      const { unmount } = render(<TeamCompetitionList teamId="team-v24-order-future" isAdmin={true} />);
      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "記録代理入力" })).toBeNull();
      expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
      unmount();

      const past = makeCompetition({ id: "c-v24-order-past", date: PAST_DATE, title: "V24順序検証大会(過去)" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [past], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      render(<TeamCompetitionList teamId="team-v24-order-past" isAdmin={true} />);
      expect(screen.getByRole("button", { name: "記録代理入力" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
    });

    it("[V-24b 非退行] admin: レイアウト変更後もボタン間の背景タップで記録一覧モーダルが開く ([V-20c] 再確認)", () => {
      // 排他化により「記録代理入力」が描画される PAST_DATE を使う。
      const comp = makeCompetition({ id: "c-v24-tapzone", date: PAST_DATE, title: "V24死角再確認大会" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-v24-tapzone" isAdmin={true} />);

      const recordBulkButton = screen.getByRole("button", { name: "記録代理入力" });
      fireEvent.click(getEntryRecordRowFromButton(recordBulkButton));

      expect(mocks.recordsModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ visible: true, competitionId: "c-v24-tapzone" }),
      );
    });

    it("[V-24c 非退行] admin: レイアウト変更後も記録代理入力/エントリーボタンをタップして記録一覧モーダルが誤って開かない ([V-21] 再確認)", () => {
      // 排他化により、それぞれのボタンが描画される日付を個別に指定する。
      // 【QA Phase B 書き換え (R3)】未来日側は「エントリー代理入力」から「エントリー」に置換された。
      const namesWithDate: Array<[string, string]> = [
        ["記録代理入力", PAST_DATE],
        ["エントリー", FUTURE_DATE],
      ];

      for (const [name, date] of namesWithDate) {
        const comp = makeCompetition({
          id: `c-v24-noleak-${name}`,
          date,
          title: `V24誤爆再確認大会-${name}`,
          entry_status: "open",
        });
        mocks.useTeamCompetitionsQuery.mockReturnValue({
          data: [comp], isLoading: false, isError: false, error: null, refetch: vi.fn(),
        });

        const { unmount } = render(<TeamCompetitionList teamId={`team-v24-noleak-${name}`} isAdmin={true} />);

        fireEvent.click(screen.getByRole("button", { name }));

        expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
          expect.objectContaining({ visible: true }),
        );

        unmount();
      }
    });

    it("[V-24d 最重要] プルダウン展開中は代理入力/エントリーボタン (記録代理入力/エントリー) をタップしても遷移しない (statusMenuPanel との重なり対策)", () => {
      // 排他化により両ボタンを同時に描画できないため、未来日 (エントリー) と
      // 過去日 (記録代理入力) の2ケースに分けて検証する。
      // 【QA Phase B 書き換え (R3)】未来日側のボタンは「エントリー代理入力」から
      // 「エントリー」(モーダルを開く) に置換された。プルダウン展開中はタップ自体が
      // 無効化される (pointerEvents="none") ため、モーダルも開かないはず。
      const future = makeCompetition({
        id: "c-v24-overlap-future",
        date: FUTURE_DATE,
        title: "V24重なり検証大会(未来)",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [future], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      const { unmount } = render(<TeamCompetitionList teamId="team-v24-overlap-future" isAdmin={true} />);
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));
      expect(screen.getByText("受付中"), "展開後の選択肢が見つからない (前提条件)").toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "エントリー" }));
      expect(mocks.entryModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
      unmount();

      // TODAY_DATE は D-2 の対象外 (statusRow が表示される) かつ isEntryTabVisible=false
      // (記録代理入力が表示される) なので、プルダウン展開中に記録代理入力ボタンが
      // 重なるケースを再現できる唯一の日付区分になる。
      const today = makeCompetition({
        id: "c-v24-overlap-today",
        date: TODAY_DATE,
        title: "V24重なり検証大会(今日)",
        entry_status: "before",
      });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [today], isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      render(<TeamCompetitionList teamId="team-v24-overlap-today" isAdmin={true} />);
      fireEvent.click(screen.getByRole("button", { name: "受付前" }));
      expect(screen.getByText("受付中"), "展開後の選択肢が見つからない (前提条件)").toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "記録代理入力" }));
      expect(mocks.navigate).not.toHaveBeenCalledWith("TeamRecordBulkForm", expect.anything());
      expect(mocks.recordsModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ visible: true }),
      );
    });
  });

  // =========================================================================
  // 【Reviewer 検出の Critical (2026-09-19)】zIndex 階層ミスで admin が
  // 受付ステータスを変更できない不具合、および jsdom の検出限界について
  // =========================================================================
  //
  // 【不具合の実体】カード最外殻 Pressable の直接の子は itemHeader/itemBodyRow/
  // statusMenuBackdrop の3つ。backdrop (zIndex 5) と比較されるのは itemBodyRow
  // (旧: zIndex 指定なし=0) であり、その子孫の itemInfoColumn(10)/statusMenuPanel(20)
  // ではない。ネイティブのビュー階層では子は親の兄弟を追い越せないため、パネル全体が
  // backdrop の下に沈み、選択肢をタップしても backdrop に吸われてメニューが
  // 閉じるだけになっていた (App Developer が itemBodyRow に zIndex を付与して修正済み)。
  //
  // 【この Critical が示す構造的な教訓】`fireEvent.click` は座標も視覚的重なりも
  // 見ずに指定した DOM ノードへ直接イベントを発火する。そのため既存の [V-7]/[V-8]
  // (プルダウン展開 → 選択肢を role/name で取得 → fireEvent.click) は「選択肢の
  // クリックハンドラが正しい引数で呼ばれるか」という JS ロジックは検証できるが、
  // 「実機で指をタップした座標にその選択肢の DOM ノードが実際に存在するか
  // (zIndex/elevation によって別の透明な要素の下に沈んでいないか)」は最初から
  // 検証対象外だった。**[V-7]/[V-8] が 82/82 全緑であることは、この Critical の
  // 反証には全くならない** (実際、修正前のバグの下でも [V-7]/[V-8] は緑のままだった)。
  //
  // 【新規テストの要否 (実測して判断)】Reviewer は「プルダウン展開中に選択肢自体を
  // タップして正しく選択できる」ことを明示する回帰テストの追加を推奨したが、
  // 既存 [V-7] の1件目 (「受付前→受付中を選ぶと確認 Alert が出て、OK 押下で
  // mutation が呼ばれる」) が展開後に role/name で取得した選択肢ノードへ
  // fireEvent.click しており、これはまさに「選択肢のクリックハンドラが正しく
  // 呼ばれること」を検証している。ミューテーションで実証済み (選択肢 Pressable の
  // onPress を no-op に変えたところ、[V-7] の該当2件と [V-8] の1件が正しく赤化した。
  // 「同一値選択は no-op」テストのみ、元々何も起きないことを検証する性質上
  // このミューテーションでは赤化しない=想定通り)。
  // **→ 新規テストは重複となるため追加しない。既存 [V-7]/[V-8] で JS ロジック面の
  // 回帰は担保済みと判断する。**
  //
  // 【実機検証チェックリスト (BLOCKED — jsdom では原理的に検証不可能)】
  // zIndex・要素の重なり・実際のタップ座標のヒットテストは、レイアウト計算を
  // 一切行わない jsdom では検証できない領域である。以下は実機確認者向けの
  // 具体的な確認手順 (**iOS を優先すること**: iOS は elevation を無視し zIndex
  // のみに依存するため、この種の不具合が最も顕在化しやすい。Android は
  // elevation の巻き添えで偶然動いてしまい、問題を隠す可能性がある):
  //   1. [最優先/今回の Critical 再発確認] admin ビューで大会カードの受付ステータス
  //      バッジ (例:「受付前」) をタップしてプルダウンを展開し、展開された選択肢
  //      (例:「受付中」) を実際に指でタップする。→ タップ後に **バッジの表示が
  //      実際に新しいステータスに変わること** を目視確認する (mutation 成功後の
  //      確認ダイアログ操作を含む)。iOS 実機/Simulator で確認すること。
  //   2. 上記 1 を、利用者ビュー (Phase C でカード全体がタップ領域化された状態)
  //      でも大会カードの他の領域 (タイトル/日付欄等) を誤タップしないことと
  //      合わせて確認する。
  //   3. admin ビューでプルダウンを展開した状態のまま、右列の代理入力ボタン
  //      (記録代理入力/エントリー代理入力) を実際にタップし、**画面遷移が
  //      発生しないこと** を確認する (pointerEvents="none" の実機での効き目。
  //      jsdom 側は [V-24d] でモック拡張により検証済みだが、実機の座標ベースの
  //      ヒットテストで同じ結果になるかは別途確認が必要)。
  //   4. プルダウン展開中にパネル外の余白 (statusMenuBackdrop) をタップすると
  //      メニューが閉じること。
  //   5. カード全体が Pressable 化されたことによる VoiceOver (iOS) / TalkBack
  //      (Android) の読み上げ順序 (タイトル行が唯一の AT エントリポイントとして
  //      機能し、配下の編集/削除/ステータス/代理入力に個別フォーカスできるか)。
  //   6. 「情報ブロックとボタン群が左右に並ぶ」「記録が上・エントリーが下の
  //      2行スタックになっている」という視覚配置そのもの。
  //   7. pointerEvents="none" 適用時、ボタンの見た目が変化しない可能性がある
  //      (無効化されたことが視覚的にユーザーに伝わるかはデザインレビュー送り)。
  // =========================================================================

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

  // -----------------------------------------------------------------------
  // [変更C] 一括登録ボタンの移設 (TeamDetailScreen の独立行 → ヘッダー行内)
  // -----------------------------------------------------------------------

  describe("[変更C] 一括登録ボタンがヘッダー行内に「追加」の左として配置される", () => {
    it("isAdmin=true のとき、一括登録ボタンが DOM 上で追加ボタンより先に現れる", () => {
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

      const bulkRegisterButton = screen.getByRole("button", { name: "一括登録" });
      const addButtons = screen.getAllByRole("button", { name: "大会を追加" });
      const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
      expect(headerAddButton, "ヘッダーの追加ボタンが見つからない").toBeDefined();

      const position = bulkRegisterButton.compareDocumentPosition(headerAddButton!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("大会が0件 (空状態) でも一括登録ボタンと追加ボタンはヘッダーに表示される (items.length===0 分岐の外側)", () => {
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

      expect(screen.getByRole("button", { name: "一括登録" })).toBeDefined();
      const addButtons = screen.getAllByRole("button", { name: "大会を追加" });
      expect(addButtons.length).toBeGreaterThan(0);
    });

    it("isAdmin=false のときは一括登録ボタンが表示されない (表示条件は addButton と同一)", () => {
      const comp = makeCompetition({ title: "一括登録非表示検証" });
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [comp],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

      expect(screen.queryByRole("button", { name: "一括登録" })).toBeNull();
    });

    it("一括登録ボタンを押すと TeamBulkRegister へ { teamId } で navigate される", () => {
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<TeamCompetitionList teamId="team-bulk" isAdmin={true} />);

      fireEvent.click(screen.getByRole("button", { name: "一括登録" }));

      expect(mocks.navigate).toHaveBeenCalledWith("TeamBulkRegister", { teamId: "team-bulk" });
    });
  });

  // =========================================================================
  // [Sprint Contract SC-2〜SC-8] 大会タブ: 非admin「記録追加」ラベル + plus アイコン、
  // 日付による排他表示 (未来=エントリーのみ / それ以外=記録追加のみ)、admin完全不変
  //
  // 判定境界 (Contract の記述): isEntryTabVisible 相当のロジックを再利用する想定
  // (未来 (date > today) のみエントリー可。今日・過去・null・空文字・不正日付は
  // すべて記録追加のみ)。ここではコンポーネントを実際にレンダーして DOM を見るだけで
  // 検証し、判定関数の内部実装をテスト側で再実装しない。
  // =========================================================================
  describe("[Sprint Contract SC-2〜SC-8] 記録追加ボタン + 日付排他化 (大会タブ)", () => {
    const helper = (data: Record<string, unknown>[]) => {
      mocks.useTeamCompetitionsQuery.mockReturnValue({
        data,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
    };

    describe("[SC-3/SC-4] 排他性: 両方向を明示的に assert する (片方だけだと排他化していなくても緑になるため)", () => {
      it("[境界値] 明日 (tomorrow) は「エントリー」のみが描画され、「記録追加」は描画されない", () => {
        helper([makeCompetition({ id: "c-excl-tomorrow", date: TOMORROW_DATE, title: "排他検証大会" })]);
        render(<TeamCompetitionList teamId="team-excl-tomorrow" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "エントリー" }), "エントリーボタンが出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "記録追加" }), "記録追加ボタンが出てはいけないのに出ている").toBeNull();
      });

      it("[境界値] 今日 (today ちょうど) は「記録追加」のみが描画され、「エントリー」は描画されない", () => {
        helper([makeCompetition({ id: "c-excl-today", date: TODAY_DATE, title: "排他検証大会" })]);
        render(<TeamCompetitionList teamId="team-excl-today" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "記録追加" }), "記録追加ボタンが出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" }), "エントリーボタンが出てはいけないのに出ている").toBeNull();
      });

      it("[境界値] 昨日 (yesterday) は「記録追加」のみが描画され、「エントリー」は描画されない", () => {
        helper([makeCompetition({ id: "c-excl-yesterday", date: YESTERDAY_DATE, title: "排他検証大会" })]);
        render(<TeamCompetitionList teamId="team-excl-yesterday" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "記録追加" }), "記録追加ボタンが出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" }), "エントリーボタンが出てはいけないのに出ている").toBeNull();
      });

      it("[境界値] 5日後 (FUTURE_DATE) は「エントリー」のみが描画される (境界から離れた明確な未来の非退行確認)", () => {
        helper([makeCompetition({ id: "c-excl-future", date: FUTURE_DATE, title: "排他検証大会" })]);
        render(<TeamCompetitionList teamId="team-excl-future" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
        expect(screen.queryByRole("button", { name: "記録追加" })).toBeNull();
      });

      it("[境界値] 5日前 (PAST_DATE) は「記録追加」のみが描画される (境界から離れた明確な過去の非退行確認)", () => {
        helper([makeCompetition({ id: "c-excl-past", date: PAST_DATE, title: "排他検証大会" })]);
        render(<TeamCompetitionList teamId="team-excl-past" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "記録追加" })).toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      });
    });

    describe("[SC-4] フォールバック: null / 空文字 / 不正な日付文字列", () => {
      const fallbackCases: Array<[string, string | null]> = [
        ["date: null", null],
        ["date: 空文字", ""],
        ["date: 不正な日付文字列", "not-a-date"],
      ];

      it.each(fallbackCases)("%s のとき「記録追加」のみが描画され、「エントリー」は描画されない", (_label, date) => {
        helper([makeCompetition({ id: "c-fallback", date, title: "フォールバック検証大会" })]);
        render(<TeamCompetitionList teamId="team-fallback" isAdmin={false} />);

        expect(screen.getByRole("button", { name: "記録追加" }), "記録追加ボタンが出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" }), "エントリーボタンが出てはいけないのに出ている").toBeNull();
      });
    });

    describe("[SC-2] ラベル/アイコン: 非admin「記録追加」ボタンのアイコンは plus であり、旧アイコン clock は使われない", () => {
      it("過去日 (記録追加が表示される条件) でアイコンが plus に変わっている", () => {
        helper([makeCompetition({ id: "c-icon", date: PAST_DATE, title: "アイコン検証大会" })]);
        render(<TeamCompetitionList teamId="team-icon" isAdmin={false} />);

        const button = screen.getByRole("button", { name: "記録追加" });
        expect(button.querySelector('[data-testid="icon-plus"]'), "plus アイコンが見つからない").not.toBeNull();
        expect(button.querySelector('[data-testid="icon-clock"]'), "旧アイコン clock が残っている").toBeNull();
      });
    });

    describe("[SC-5] 非退行: エントリーボタンの見た目・遷移は完全に不変", () => {
      it("エントリーボタンのラベル/アイコン/onPress (受付状況モーダルを開く) が変わっていない", () => {
        helper([
          makeCompetition({ id: "c-sc5", date: TOMORROW_DATE, title: "SC-5検証大会", entry_status: "open" }),
        ]);
        render(<TeamCompetitionList teamId="team-sc5" isAdmin={false} />);

        const button = screen.getByRole("button", { name: "エントリー" });
        expect(button.querySelector('[data-testid="icon-log-in"]'), "log-in アイコンが見つからない").not.toBeNull();

        expect(screen.queryByText("ENTRY_MODAL_OPEN")).toBeNull();
        fireEvent.click(button);
        expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined();
        expect(mocks.entryModalSpy).toHaveBeenCalledWith(
          expect.objectContaining({ visible: true, competitionId: "c-sc5" }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // 【Sprint Contract 改訂 (今回のスプリント: admin ボタンの三項排他統一)】
    // admin の「記録代理入力」「エントリー代理入力」は、非admin の
    // 「記録追加」「エントリー」と同じ三項排他 (isEntryTabVisible の true/false) に
    // 統一された:
    //   [SC-6b] (改訂) 大会タブ admin の「記録代理入力」は非admin の「記録追加」と
    //           同じ境界で表示される (未来日は非表示、今日・過去・null・空文字・
    //           不正日付で表示)
    //   [SC-6c] 大会タブ admin の「エントリー代理入力」は非admin と同じ
    //           isEntryTabVisible 境界 (未来のみ true) で表示する (無変更)
    //   [SC-9]  (改訂) admin も非admin と同じく排他になった。未来日は
    //           「エントリー代理入力」のみ、それ以外は「記録代理入力」のみが
    //           表示される (両方向を明示的に assert し、admin の排他化漏れを
    //           検出するガード)
    //
    // 「今日」の境界を明示的に assert する理由 (PM 指摘): 非admin/admin で共通の
    // isEntryTabVisible を使い回すべきところ、admin 側だけ誤って
    // isCompetitionDateInPast (今日を過去扱いしない) を使ってしまうと、
    // 「今日」のケースだけ静かにズレる (今日にエントリー代理入力が出てしまう)。
    // これは他の境界 (未来/過去) のテストだけでは検出できない、全 green を
    // 通過しうる故障モードなので、今日のケースを独立したケースとして必ず含める。
    // -----------------------------------------------------------------------
    describe("[SC-6b] admin の「記録代理入力」は非admin の「記録追加」と同じ境界で表示される (未来日は非表示)", () => {
      const sc6bVisibleCases: Array<[string, string | null]> = [
        ["今日", TODAY_DATE],
        ["過去 (昨日)", YESTERDAY_DATE],
        ["null", null],
        ["空文字", ""],
        ["不正な日付文字列", "not-a-date"],
      ];

      it.each(sc6bVisibleCases)("date=%s のとき、admin の「記録代理入力」が表示される", (_label, date) => {
        helper([makeCompetition({ id: "c-sc6b", date, title: "SC-6b検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6b" isAdmin={true} />);

        expect(
          screen.getByRole("button", { name: "記録代理入力" }),
          "記録代理入力が出ていない",
        ).toBeDefined();
        // admin には非admin 用の新ラベル/旧ラベルのどちらも出ない
        expect(screen.queryByRole("button", { name: "記録追加" })).toBeNull();
        expect(screen.queryByRole("button", { name: "記録" })).toBeNull();
      });

      it("[境界値] 未来 (明日) は「記録代理入力」が表示されない (排他化により「エントリー代理入力」のみになる)", () => {
        helper([makeCompetition({ id: "c-sc6b-future", date: TOMORROW_DATE, title: "SC-6b検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6b-future" isAdmin={true} />);

        expect(
          screen.queryByRole("button", { name: "記録代理入力" }),
          "未来日なのに記録代理入力が出ている (排他化されていない疑い)",
        ).toBeNull();
      });
    });

    // 【QA Phase B 書き換え (R3)】admin の未来日ボタンは「エントリー代理入力」から
    // 「エントリー」(モーダルを開く、非admin と同じ導線) に置換された。isEntryTabVisible
    // 境界の判定ロジック自体は変わっていないため、ボタン名のみ更新する。
    describe("[SC-6c] admin の「エントリー」は isEntryTabVisible 境界 (未来のみ) で表示/非表示になる", () => {
      it("未来 (明日) は「エントリー」が表示される", () => {
        helper([makeCompetition({ id: "c-sc6c-future", date: TOMORROW_DATE, title: "SC-6c検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6c-future" isAdmin={true} />);

        expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー代理入力" })).toBeNull();
      });

      // 【最重要境界: PM 指摘】isEntryTabVisible と isCompetitionDateInPast の
      // 唯一の違いが「今日」の扱い (前者は今日を未来扱いしない=false、後者も
      // 今日を過去扱いしない=false だが「エントリーを消す」条件としては
      // 逆になる)。ここで admin 側の実装がどちらの判定関数を使っているかが
      // 露呈する。
      it("[最重要境界] 今日は「エントリー」が表示されない", () => {
        helper([makeCompetition({ id: "c-sc6c-today", date: TODAY_DATE, title: "SC-6c検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6c-today" isAdmin={true} />);

        expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      });

      it("過去 (昨日) は「エントリー」が表示されない", () => {
        helper([makeCompetition({ id: "c-sc6c-past", date: YESTERDAY_DATE, title: "SC-6c検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6c-past" isAdmin={true} />);

        expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      });

      const sc6cFallbackCases: Array<[string, string | null]> = [
        ["null", null],
        ["空文字", ""],
        ["不正な日付文字列", "not-a-date"],
      ];

      it.each(sc6cFallbackCases)("date=%s は「エントリー」が表示されない (フォールバック)", (_label, date) => {
        helper([makeCompetition({ id: "c-sc6c-fallback", date, title: "SC-6c検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc6c-fallback" isAdmin={true} />);

        expect(screen.queryByRole("button", { name: "エントリー" })).toBeNull();
      });
    });

    describe("[SC-9] admin も非admin と同じく排他になった: 両方向を明示的に assert する (片方だけだと排他化していなくても緑になるため)", () => {
      it("未来 (明日) は「エントリー」のみが表示され、「記録代理入力」は表示されない", () => {
        helper([makeCompetition({ id: "c-sc9-future", date: TOMORROW_DATE, title: "SC-9検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc9-future" isAdmin={true} />);

        expect(screen.getByRole("button", { name: "エントリー" }), "エントリーが出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "記録代理入力" }), "未来日なのに記録代理入力が出ている (排他化されていない疑い)").toBeNull();
      });

      it("今日は「記録代理入力」のみが表示され、「エントリー」は表示されない", () => {
        helper([makeCompetition({ id: "c-sc9-today", date: TODAY_DATE, title: "SC-9検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc9-today" isAdmin={true} />);

        expect(screen.getByRole("button", { name: "記録代理入力" }), "記録代理入力が出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" }), "今日なのにエントリーが出ている (排他化されていない疑い)").toBeNull();
      });

      it("過去 (昨日) は「記録代理入力」のみが表示され、「エントリー」は表示されない", () => {
        helper([makeCompetition({ id: "c-sc9-past", date: YESTERDAY_DATE, title: "SC-9検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc9-past" isAdmin={true} />);

        expect(screen.getByRole("button", { name: "記録代理入力" }), "記録代理入力が出ていない").toBeDefined();
        expect(screen.queryByRole("button", { name: "エントリー" }), "過去日なのにエントリーが出ている (排他化されていない疑い)").toBeNull();
      });
    });

    describe("[SC-7] 非退行: 「記録追加」ボタンの遷移先・props は従来の記録ボタンと同一", () => {
      it("非admin: 「記録追加」ボタンを押すと CompetitionTabForm に { competitionId, date, teamId, initialTab: 'record' } で navigate される (TeamRecordBulkForm へは行かない)", () => {
        helper([makeCompetition({ id: "c-sc7", date: PAST_DATE, title: "SC-7検証大会" })]);
        render(<TeamCompetitionList teamId="team-sc7" isAdmin={false} />);

        fireEvent.click(screen.getByRole("button", { name: "記録追加" }));

        expect(mocks.navigate).toHaveBeenCalledWith(
          "CompetitionTabForm",
          expect.objectContaining({
            competitionId: "c-sc7",
            date: PAST_DATE,
            teamId: "team-sc7",
            initialTab: "record",
          }),
        );
        expect(mocks.navigate).not.toHaveBeenCalledWith("TeamRecordBulkForm", expect.anything());
        // 期待ルート以外へは飛ばない (上の toHaveBeenCalledWith との組で担保)
        expect(mocks.navigate).toHaveBeenCalledTimes(1);
      });
    });

    // -----------------------------------------------------------------------
    // [SC-8] i18n: recordButton (競合キー) が5ロケール全てで新文言に変わり、
    // entryButton は旧値のまま (全ロケール不変) であること
    //
    // 実測ベース: apps/shared/messages/*.json を直接 import し、Sprint 着手前の
    // 実測値 (git diff で確認済み) との差分で「変わったこと/変わっていないこと」を
    // 検証する。ja の新文言のみ Contract 本文の指定リテラル値で厳密一致検証する。
    // -----------------------------------------------------------------------
    describe("[SC-8] i18n: teamCompetitionList.recordButton が5ロケールで更新され、entryButton は不変", () => {
      const LOCALE_MESSAGES: Record<
        string,
        { teams: { mobile: { teamCompetitionList: { recordButton?: string; entryButton?: string } } } }
      > = {
        ja: jaMessages,
        en: enMessages,
        de: deMessages,
        ko: koMessages,
        zh: zhMessages,
      };
      // Phase A 時点 (今回の Sprint Contract 着手前) の実測値。git diff で確認済み。
      const OLD_RECORD_BUTTON: Record<string, string> = {
        ja: "記録",
        en: "Record",
        de: "Ergebnis",
        ko: "기록",
        zh: "成绩",
      };
      // entryButton は今回のスコープ外のキーであり、変わっていてはいけない値
      // (Sprint Contract 着手前と同一の実測値。git diff で無変更を確認済み)。
      const ENTRY_BUTTON_UNCHANGED: Record<string, string> = {
        ja: "エントリー",
        en: "Entry",
        de: "Anmelden",
        ko: "엔트리",
        zh: "报名",
      };

      // App Developer が実測して各ロケールの近傍キーに寄せた新文言 (PM 経由で実測値の
      // 報告を受けているが、これも鵜呑みにせず LOCALE_MESSAGES (実ファイル読み込み) 側で
      // 厳密一致検証する。表と実ファイルが食い違えばこのテストが red になる)。
      const NEW_RECORD_BUTTON: Record<string, string> = {
        ja: "記録追加",
        en: "Add Record",
        de: "Ergebnis hinzufügen",
        ko: "기록 추가",
        zh: "添加成绩",
      };

      it.each(Object.keys(OLD_RECORD_BUTTON))(
        "%s: recordButton キーの値が Sprint 着手前の旧値から変わっている (キー自体は存在し続ける)",
        (locale) => {
          const value = LOCALE_MESSAGES[locale]?.teams.mobile.teamCompetitionList.recordButton;
          expect(value, `${locale}.json に teamCompetitionList.recordButton が存在しない`).toBeDefined();
          expect(value).not.toBe(OLD_RECORD_BUTTON[locale]);
        },
      );

      it.each(Object.keys(NEW_RECORD_BUTTON))(
        "%s: recordButton キーの値が実測済みの新文言と厳密一致する",
        (locale) => {
          const value = LOCALE_MESSAGES[locale]?.teams.mobile.teamCompetitionList.recordButton;
          expect(value).toBe(NEW_RECORD_BUTTON[locale]);
        },
      );

      it.each(Object.keys(ENTRY_BUTTON_UNCHANGED))(
        "%s: entryButton キーの値は今回のスコープ外であり、Sprint 着手前と完全に同一のまま変わっていない",
        (locale) => {
          const value = LOCALE_MESSAGES[locale]?.teams.mobile.teamCompetitionList.entryButton;
          expect(value).toBe(ENTRY_BUTTON_UNCHANGED[locale]);
        },
      );
    });
  });
});

// ===========================================================================
// [Sprint Contract v3 — D3] 管理者導線の origin: "teamAdmin" 付与
// ===========================================================================
// 既存の [S2-V-09] (handleAdd) / 編集アイコンのテストは `expect.objectContaining` で
// navigate 引数を見ているため、**origin を足しても足さなくても常に PASS する**。
// D3 (「新規作成側にも必ず origin を付ける」) の検証が現状ゼロなので、
// ここで `toEqual` の厳密一致 + `hasOwnProperty("origin")` で pin する。
//
// なぜ厳密一致にするか: origin は「チーム管理者ビューから来た」ことを示す唯一の
// シグナルであり、これが欠けると
//   - フォームのタブが絞られない (SC-1/SC-15)
//   - 保存直後に isEditMode が flip して自分の入力がグレーアウトし、
//     続けて編集した内容が無言破棄される (BC-2)
// という2つの事故が同時に起きる。objectContaining ではこの欠落を検出できない。
// ---------------------------------------------------------------------------
describe("TeamCompetitionList — 管理者導線の origin 付与 (Sprint Contract v3 D3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDeleteTeamCompetitionMutation.mockReturnValue(makeMutationMock());
    mocks.useUpdateCompetitionMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
    });
    mocks.mutateAsync.mockResolvedValue(undefined);
  });

  /** navigate の (routeName, params) を取り出す。呼ばれていなければ失敗させる。 */
  function lastNavigateCall(): [string, Record<string, unknown>] {
    const calls = mocks.navigate.mock.calls as Array<[string, Record<string, unknown>]>;
    expect(calls.length, "navigation.navigate が一度も呼ばれていない").toBeGreaterThan(0);
    return calls[calls.length - 1]!;
  }

  it("[TCL-1] admin の「追加」: CompetitionForm へ { teamId, date, origin:'teamAdmin' } が厳密一致で渡る", () => {
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const addButtons = screen.getAllByRole("button", { name: "大会を追加" });
    const headerAddButton = addButtons.find((el) => el.querySelector('[data-testid="icon-plus"]'));
    expect(headerAddButton, "ヘッダーの追加ボタン(+アイコン付き)が見つからない").toBeDefined();
    fireEvent.click(headerAddButton!);

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const [routeName, params] = lastNavigateCall();
    expect(routeName).toBe("CompetitionForm");
    // date は「今日」が入るため値を固定せず、キー構成と origin の値を厳密に見る
    expect(Object.keys(params).sort()).toEqual(["date", "origin", "teamId"]);
    expect(params.teamId).toBe("team-1");
    expect(params.origin).toBe("teamAdmin");
    expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(true);
  });

  it("[TCL-2] admin の「編集」(鉛筆): CompetitionForm へ { competitionId, date, teamId, origin:'teamAdmin' } が厳密一致で渡る", () => {
    const comp = makeCompetition({ id: "c-edit-origin", title: "origin検証大会", date: "2026-08-10" });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    const editButton = screen.getByTestId("icon-edit-2").closest("button");
    expect(editButton, "編集アイコンの button が見つからない").not.toBeNull();
    fireEvent.click(editButton as HTMLButtonElement);

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionForm", {
      competitionId: "c-edit-origin",
      date: "2026-08-10",
      teamId: "team-1",
      origin: "teamAdmin",
    });
  });

  it("[TCL-3 / 対照] 非 admin の自己記録導線には origin が付かない (origin は管理者導線専用のシグナル)", () => {
    // 過去日 = 非admin には「記録追加」だけが出る (排他表示)
    const comp = makeCompetition({ id: "c-self-record", title: "非admin記録導線大会", date: PAST_DATE });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={false} />);

    const recordButton = screen.getByRole("button", {
      name: resolveJaKey("teams.mobile.teamCompetitionList.recordButton"),
    });
    fireEvent.click(recordButton);

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    const [routeName, params] = lastNavigateCall();
    expect(routeName).toBe("CompetitionTabForm");
    expect(Object.prototype.hasOwnProperty.call(params, "origin")).toBe(false);
    expect(params).toEqual({
      competitionId: "c-self-record",
      date: PAST_DATE,
      teamId: "team-1",
      initialTab: "record",
    });
  });

  // -------------------------------------------------------------------------
  // [SC-13] R7 (「続けてエントリーを作成」ボタン廃止) の代替導線が生きていること
  // -------------------------------------------------------------------------
  // 旧 CompetitionBasicFormScreen の「続けてエントリーを作成」は R2/R7 で廃止された。
  // 代替は「エントリー受付モーダル → エントリーを代理入力 (TeamEntryBulkForm)」。
  // この配線を検証するテストは着手前時点で**存在しなかった** (QA 実測) ため、
  // 旧テスト [SC-4] の移設先としてここに新設する。
  it("[TCL-4 / SC-13] admin: エントリー受付モーダルの「代理入力」から TeamEntryBulkForm へ { competitionId, teamId } で遷移する", () => {
    const comp = makeCompetition({ id: "c-bulk-entry", title: "代理エントリー大会", date: FUTURE_DATE });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    // エントリー受付モーダルを開く
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveJaKey("teams.mobile.teamCompetitionList.entryButton"),
      }),
    );
    expect(screen.getByText("ENTRY_MODAL_OPEN")).toBeDefined();

    // モーダルに渡された onAdminBulkEntry (= 代理入力導線) を発火させる
    const calls = mocks.entryModalSpy.mock.calls as Array<[Record<string, unknown>]>;
    const lastProps = calls[calls.length - 1]?.[0];
    expect(lastProps, "TeamCompetitionEntryModal に props が渡っていない").toBeDefined();
    const onAdminBulkEntry = lastProps!.onAdminBulkEntry as (() => void) | undefined;
    expect(
      typeof onAdminBulkEntry,
      "onAdminBulkEntry が渡っていない (一括エントリーの代替導線が死んでいる)",
    ).toBe("function");

    act(() => {
      onAdminBulkEntry!();
    });

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("TeamEntryBulkForm", {
      competitionId: "c-bulk-entry",
      teamId: "team-1",
    });
  });

  it("[TCL-3b / 対照] admin の「記録代理入力」(TeamRecordBulkForm) にも origin は付かない (別画面のため不要)", () => {
    const comp = makeCompetition({ id: "c-bulk-record", title: "代理記録大会", date: PAST_DATE });
    mocks.useTeamCompetitionsQuery.mockReturnValue({
      data: [comp],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TeamCompetitionList teamId="team-1" isAdmin={true} />);

    // admin ビューのラベルは recordBulkButton (「記録代理入力」)。非admin の
    // recordButton (「記録追加」) とは別キーであることに注意。
    const recordButton = screen.getByRole("button", {
      name: resolveJaKey("teams.mobile.teamCompetitionList.recordBulkButton"),
    });
    fireEvent.click(recordButton);

    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("TeamRecordBulkForm", {
      competitionId: "c-bulk-record",
      teamId: "team-1",
    });
  });
});
