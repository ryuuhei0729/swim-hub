/**
 * TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (web, 要件A / D2)
 *
 * Sprint Contract: `sprint-contract.md` D2, R1, R2
 * 検証観点 (Verification Checklist): V-W-01, V-W-02, V-W-03, V-W-04, V-W-08, V-W-09
 *
 * QA Phase A: このファイルはスケルトンのみ。アサーションの実装は Phase B (実装完了後) で行う。
 *
 * 【インターフェース契約】
 * - セレクタ: `data-testid="team-competition-entry-edit-${entry.id}"` /
 *   `data-testid="team-competition-entry-delete-${entry.id}"`
 * - web の isAdmin はコンポーネント内部が `team_memberships.role` を supabase から
 *   取得して判定する (props で isAdmin を渡さない)。テストは既存の
 *   TeamCompetitionEntryModalOtherAdminCompetition.test.tsx と同様に
 *   `buildSupabaseMock({ competitions: {...}, team_memberships: { data: { role: "admin" | "user" } } })`
 *   の形でロールを注入する。
 * - R1: 表示条件は `entry_status === "open"` **かつ** 大会日が過去でない、の両方が真のときのみ。
 *   判定は「実効ステータス」(mobile 同様、過去日なら自動的に受付終了扱いにする既存仕様と対称) で行う。
 *   entry_status="open" でも大会日が過去なら非表示になることを必ず境界値として持つ。
 * - R2: 削除は行単位のみ。リレーの他選手のレグ行、他ユーザーの行は一切変化しない。
 * - 編集アイコン押下 → `CompetitionTabModal` (entry タブ) を開く (モーダル内インライン編集フォームは作らない)。
 * - 削除アイコン押下 → 確認 → `EntryAPI.deleteEntry(entry.id)` → 再取得。失敗時はエラー表示し一覧を壊さない。
 *
 * 【トートロジー防止メモ】
 * 削除/編集の成否は「DOM から消えたか」「navigate 相当の呼び出しが期待 props で行われたか」
 * という振る舞いで検証し、実装内部の state をそのままアサートしない。
 */

import { describe, it, vi, beforeEach } from "vitest";

// Phase A メモ: このファイルは it.todo のみのスケルトンのため、実際に render/screen/expect
// を使うのは Phase B (アサーション実装時) から。今 import すると未使用 import で
// eslint (@typescript-eslint/no-unused-vars: error) に落ちるため、Phase B で
// `import { renderWithI18n as render, screen } from "../../utils/render";` と
// `expect` (vitest) を追加すること。

const mocks = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  updateEntry: vi.fn(),
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    deleteEntry: mocks.deleteEntry,
    updateEntry: mocks.updateEntry,
    getEntriesByCompetition: mocks.getEntriesByCompetition,
  })),
}));

// TODO(Phase B): 既存 TeamCompetitionEntryModalOtherAdminCompetition.test.tsx と同型の
// supabase チェーンモック (competitions / team_memberships) をここに用意する。

describe("TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-W-01] SC1: 自分のエントリー行の編集アイコン", () => {
    it.todo(
      "編集アイコンを押すと CompetitionTabModal が entry タブ・入力済みの種目/タイム/メモ付きで開く",
    );
    it.todo("保存すると一覧 (エントリー件数・行) に反映される");
  });

  describe("[V-W-02] SC2: 自分のエントリー行の削除アイコン", () => {
    it.todo("削除アイコン→確認で、その行だけが一覧から消え EntryAPI.deleteEntry(entry.id) が呼ばれる");
    it.todo("リレーの他選手のレグ行・他ユーザーの行は削除後も残る (R2)");
  });

  describe("[V-W-03] SC3: 他ユーザーの行には編集/削除アイコンが出ない", () => {
    it.todo("entry.user_id !== 自分の id の行に data-testid=entry-edit-*/entry-delete-* が存在しない");
  });

  describe("[V-W-04] SC4 / R1: 実効ステータスによる表示条件", () => {
    it.todo("entry_status='before' のとき自分の行にも編集/削除アイコンが出ない");
    it.todo("entry_status='closed' のとき自分の行にも編集/削除アイコンが出ない");
    it.todo(
      "[境界値] entry_status='open' だが大会日が過去のとき、編集/削除アイコンが出ない (実効ステータスで判定)",
    );
    it.todo("[非退行] entry_status='open' かつ大会日が今日/未来のとき、編集/削除アイコンが出る");
  });

  describe("[V-W-08] SC8: admin 自身のエントリーにも同様にアイコンが出る", () => {
    it.todo("admin がエントリーを持つ場合、admin 自身の行にも編集/削除アイコンが出る");
  });

  describe("[V-W-09] SC9: 削除失敗時のエラーハンドリング", () => {
    it.todo("EntryAPI.deleteEntry がネットワークエラーで reject した場合、エラーが表示される");
    it.todo("削除失敗後も一覧は実態(削除されていない状態)のまま残り、行が消えたまま固まらない");
    it.todo(
      "[情報露出防止] 生の Error メッセージはそのまま表示されず、UserFacingError のみ素通しされる (対照テスト)",
    );
  });
});
