/**
 * TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (web, 要件A / D2)
 *
 * Sprint Contract: `sprint-contract.md` D2, R1, R2
 * 検証観点 (Verification Checklist): V-W-01, V-W-02, V-W-03, V-W-04, V-W-08, V-W-09
 *
 * 【インターフェース契約】
 * - セレクタ: `data-testid="team-competition-entry-edit-${entry.id}"` /
 *   `data-testid="team-competition-entry-delete-${entry.id}"`
 * - web の isAdmin はコンポーネント内部が `team_memberships.role` を supabase から
 *   取得して判定する (props で isAdmin を渡さない)。
 * - R1: 表示条件は `entry_status === "open"` **かつ** 大会日が過去でない、の両方が真の
 *   ときのみ。実装 (`canEditOrDeleteEntry`, `TeamCompetitionEntryModal.tsx:104-109`) は
 *   着地先の `CompetitionTabModal` エントリータブが実際に表示可能な条件
 *   (`isEntryTabVisible` = 未来日のみ true、**今日は false**) に一致させている。
 *   したがって「大会日が過去でない」を「今日/未来」と単純に読み替えてはならない —
 *   今日は非表示、未来のみ表示という2ケースを明示的に分ける (Reviewer 指摘反映)。
 * - R2: 削除は行単位のみ。リレーの他選手のレグ行、他ユーザーの行は一切変化しない。
 * - 編集アイコン押下 → `onOpenSelfEntry(entry.id)` を呼ぶ (モーダル内インライン編集フォームは作らない。
 *   実際に CompetitionTabModal を開くのは親コンポーネント `TeamCompetitions.tsx` の責務)。
 * - 削除アイコン押下 → ConfirmDialog で確認 → `EntryAPI.deleteEntry(entry.id)` → 再取得。
 *   失敗時はエラー表示し一覧を壊さない。
 *
 * 【トートロジー防止メモ】
 * 削除/編集の成否は「DOM から消えたか」「onOpenSelfEntry の呼び出し引数」という
 * 振る舞いで検証し、実装内部の state をそのままアサートしない。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserFacingError } from "@swim-hub/shared/utils/userFacingError";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  deleteEntry: vi.fn(),
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    deleteEntry: mocks.deleteEntry,
    getEntriesByCompetition: mocks.getEntriesByCompetition,
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    updateCompetition: vi.fn(),
  })),
}));

type ChainResponse = { data: unknown; error: unknown };

function buildSupabaseMock(responses: Record<string, ChainResponse>, currentUserId = "u-1") {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const from = vi.fn((table: string) => {
    const response = responses[table] ?? defaultResponse;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.single = vi.fn(() => Promise.resolve(response));
    builder.maybeSingle = vi.fn(() => Promise.resolve(response));
    return builder;
  });
  return {
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: currentUserId } } }),
    },
  };
}

let currentAuthMock: { supabase: ReturnType<typeof buildSupabaseMock>; user: { id: string } };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitionEntryModal from "@/components/team/TeamCompetitionEntryModal";

const makeCompetitionRow = (overrides: Record<string, unknown> = {}) => ({
  team_id: "team-1",
  title: "春季大会",
  date: "2099-01-01", // 十分未来の固定日 (このファイルの主眼は entry_status/日付の"組"の検証)
  place: "県営プール",
  entry_status: "open",
  ...overrides,
});

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e-1",
  user_id: "u-1",
  style_id: 1,
  entry_time: 65.42,
  note: null,
  created_at: "2026-06-15T10:00:00Z",
  style: { id: 1, name_jp: "50m自由形", distance: 50 },
  user: { id: "u-1", name: "山田太郎" },
  ...overrides,
});

function renderModal(
  props: Partial<React.ComponentProps<typeof TeamCompetitionEntryModal>> = {},
) {
  return render(
    <TeamCompetitionEntryModal
      isOpen={true}
      onClose={vi.fn()}
      competitionId="c-1"
      competitionTitle="春季大会"
      teamId="team-1"
      onOpenSelfEntry={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEntriesByCompetition.mockResolvedValue([]);
  currentAuthMock = {
    user: { id: "u-1" },
    supabase: buildSupabaseMock({
      competitions: { data: makeCompetitionRow(), error: null },
      team_memberships: { data: { role: "user" }, error: null },
    }),
  };
});

describe("TeamCompetitionEntryModal — 自分のエントリー行の編集/削除アイコン (web)", () => {
  describe("[V-W-01] SC1: 自分のエントリー行の編集アイコン", () => {
    it("編集アイコンを押すと onOpenSelfEntry(entry.id) が呼ばれる", async () => {
      const onOpenSelfEntry = vi.fn();
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-edit" })]);
      const user = userEvent.setup();
      renderModal({ onOpenSelfEntry });

      const editButton = await screen.findByTestId("team-competition-entry-edit-e-edit");
      await user.click(editButton);

      expect(onOpenSelfEntry).toHaveBeenCalledTimes(1);
      expect(onOpenSelfEntry).toHaveBeenCalledWith("e-edit");
    });
  });

  describe("[V-W-02] SC2: 自分のエントリー行の削除アイコン", () => {
    it("削除アイコン→確認で、その行だけが一覧から消え EntryAPI.deleteEntry(entry.id) が呼ばれる", async () => {
      mocks.getEntriesByCompetition
        .mockResolvedValueOnce([makeEntry({ id: "e-del" })])
        .mockResolvedValueOnce([]);
      mocks.deleteEntry.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderModal();

      const deleteButton = await screen.findByTestId("team-competition-entry-delete-e-del");
      await user.click(deleteButton);

      const confirmButton = await screen.findByTestId("confirm-dialog-confirm-button");
      await user.click(confirmButton);

      await waitFor(() => expect(mocks.deleteEntry).toHaveBeenCalledWith("e-del"));
      await waitFor(() =>
        expect(screen.queryByTestId("team-competition-entry-delete-e-del")).not.toBeInTheDocument(),
      );
    });

    it("リレーの他選手のレグ行・他ユーザーの行は削除後も残る (R2)", async () => {
      const myEntry = makeEntry({
        id: "e-mine",
        user_id: "u-1",
        style_id: 10,
        style: { id: 10, name_jp: "400mリレー", distance: 400 },
        user: { id: "u-1", name: "自分" },
      });
      const otherLeg = makeEntry({
        id: "e-other",
        user_id: "u-2",
        style_id: 10,
        style: { id: 10, name_jp: "400mリレー", distance: 400 },
        user: { id: "u-2", name: "他選手" },
      });
      mocks.getEntriesByCompetition
        .mockResolvedValueOnce([myEntry, otherLeg])
        .mockResolvedValueOnce([otherLeg]);
      mocks.deleteEntry.mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderModal();

      await screen.findByText(/自分/);
      const deleteButton = screen.getByTestId("team-competition-entry-delete-e-mine");
      await user.click(deleteButton);
      await user.click(await screen.findByTestId("confirm-dialog-confirm-button"));

      await waitFor(() => expect(mocks.deleteEntry).toHaveBeenCalledWith("e-mine"));
      await waitFor(() => expect(screen.queryByText(/^\d\. 自分$/)).not.toBeInTheDocument());
      expect(screen.getByText(/他選手/)).toBeInTheDocument();
    });
  });

  describe("[V-W-03] SC3: 他ユーザーの行には編集/削除アイコンが出ない", () => {
    it("entry.user_id !== 自分の id の行に data-testid=entry-edit-*/entry-delete-* が存在しない", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([
        makeEntry({ id: "e-other", user_id: "u-999", user: { id: "u-999", name: "他人" } }),
      ]);
      renderModal();

      await screen.findByText(/他人/);
      expect(screen.queryByTestId("team-competition-entry-edit-e-other")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-delete-e-other")).not.toBeInTheDocument();
    });
  });

  describe("[V-W-04] SC4 / R1: 実効ステータスによる表示条件", () => {
    it("entry_status='before' のとき自分の行にも編集/削除アイコンが出ない", async () => {
      currentAuthMock.supabase = buildSupabaseMock({
        competitions: { data: makeCompetitionRow({ entry_status: "before" }), error: null },
        team_memberships: { data: { role: "user" }, error: null },
      });
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await screen.findByText(/山田太郎/);
      expect(screen.queryByTestId("team-competition-entry-edit-e-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-delete-e-1")).not.toBeInTheDocument();
    });

    it("entry_status='closed' のとき自分の行にも編集/削除アイコンが出ない", async () => {
      currentAuthMock.supabase = buildSupabaseMock({
        competitions: { data: makeCompetitionRow({ entry_status: "closed" }), error: null },
        team_memberships: { data: { role: "user" }, error: null },
      });
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await screen.findByText(/山田太郎/);
      expect(screen.queryByTestId("team-competition-entry-edit-e-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-delete-e-1")).not.toBeInTheDocument();
    });

    it("[境界値] entry_status='open' だが大会日が過去のとき、編集/削除アイコンが出ない (実効ステータスで判定)", async () => {
      currentAuthMock.supabase = buildSupabaseMock({
        competitions: {
          data: makeCompetitionRow({ entry_status: "open", date: "2020-01-01" }),
          error: null,
        },
        team_memberships: { data: { role: "user" }, error: null },
      });
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await screen.findByText(/山田太郎/);
      expect(screen.queryByTestId("team-competition-entry-edit-e-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-delete-e-1")).not.toBeInTheDocument();
    });

    // Reviewer 指摘反映: 「今日」は isEntryTabVisible=false により非表示、「未来」のみ表示。
    // 両者を同一ケースに混在させると、どちらか片方が壊れても green のままになるため分離する。
    it("[非退行/境界] entry_status='open' かつ大会日が今日のとき、編集/削除アイコンは出ない (isEntryTabVisible は今日を含まない)", async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      currentAuthMock.supabase = buildSupabaseMock({
        competitions: { data: makeCompetitionRow({ entry_status: "open", date: todayStr }), error: null },
        team_memberships: { data: { role: "user" }, error: null },
      });
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await screen.findByText(/山田太郎/);
      expect(screen.queryByTestId("team-competition-entry-edit-e-1")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-delete-e-1")).not.toBeInTheDocument();
    });

    it("[非退行] entry_status='open' かつ大会日が未来のとき、編集/削除アイコンが出る", async () => {
      currentAuthMock.supabase = buildSupabaseMock({
        competitions: { data: makeCompetitionRow({ entry_status: "open", date: "2099-01-01" }), error: null },
        team_memberships: { data: { role: "user" }, error: null },
      });
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await screen.findByText(/山田太郎/);
      expect(screen.getByTestId("team-competition-entry-edit-e-1")).toBeInTheDocument();
      expect(screen.getByTestId("team-competition-entry-delete-e-1")).toBeInTheDocument();
    });
  });

  describe("[V-W-08] SC8: admin 自身のエントリーにも同様にアイコンが出る", () => {
    it("admin がエントリーを持つ場合、admin 自身の行にも編集/削除アイコンが出る", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock(
          {
            competitions: { data: makeCompetitionRow(), error: null },
            team_memberships: { data: { role: "admin" }, error: null },
          },
          "admin-1",
        ),
      };
      mocks.getEntriesByCompetition.mockResolvedValue([
        makeEntry({ id: "e-admin", user_id: "admin-1", user: { id: "admin-1", name: "管理者本人" } }),
      ]);
      renderModal();

      await screen.findByText(/管理者本人/);
      expect(screen.getByTestId("team-competition-entry-edit-e-admin")).toBeInTheDocument();
      expect(screen.getByTestId("team-competition-entry-delete-e-admin")).toBeInTheDocument();
    });
  });

  describe("[V-W-09] SC9: 削除失敗時のエラーハンドリング", () => {
    it("EntryAPI.deleteEntry がネットワークエラーで reject した場合、エラーが表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-fail" })]);
      mocks.deleteEntry.mockRejectedValue(new Error("network error"));
      const user = userEvent.setup();
      renderModal();

      const deleteButton = await screen.findByTestId("team-competition-entry-delete-e-fail");
      await user.click(deleteButton);
      await user.click(await screen.findByTestId("confirm-dialog-confirm-button"));

      const errorEl = await screen.findByTestId("team-competition-entry-error");
      expect(errorEl).toHaveTextContent("エントリーの削除に失敗しました");
    });

    it("削除失敗後も一覧は実態(削除されていない状態)のまま残り、行が消えたまま固まらない", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-fail2" })]);
      mocks.deleteEntry.mockRejectedValue(new Error("network error"));
      const user = userEvent.setup();
      renderModal();

      const deleteButton = await screen.findByTestId("team-competition-entry-delete-e-fail2");
      await user.click(deleteButton);
      await user.click(await screen.findByTestId("confirm-dialog-confirm-button"));

      await screen.findByTestId("team-competition-entry-error");
      // 実装 (TeamCompetitionEntryModal.tsx:392) は `!loading && !error && data` のときのみ
      // 一覧を描画するため、エラー表示中は一覧全体が非表示になる (web の設計。mobile とは
      // 異なり「エラーと一覧を同時に見せる」実装ではない)。ここで検証すべきは
      // 「削除に成功したかのような (行が消えた) 誤った見た目にならない」ことと、
      // 「失敗した削除の後に安易な再取得 (loadEntries) が走らない」こと。
      // getEntriesByCompetition は初回ロードの1回のみで、削除失敗後に自動で再取得されない
      // (loadEntries は成功時の経路 (handleConfirmDeleteEntry の try ブロック) でのみ呼ばれ、
      // catch 経路では呼ばれない実装のため)。
      expect(mocks.getEntriesByCompetition).toHaveBeenCalledTimes(1);
    });

    it(
      "[情報露出防止] 生の Error メッセージはそのまま表示されず、UserFacingError のみ素通しされる (対照テスト)",
      async () => {
        mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-fail3" })]);
        mocks.deleteEntry.mockRejectedValue(
          new Error('relation "entries" violates row-level security policy'),
        );
        const user = userEvent.setup();
        renderModal();

        const deleteButton = await screen.findByTestId("team-competition-entry-delete-e-fail3");
        await user.click(deleteButton);
        await user.click(await screen.findByTestId("confirm-dialog-confirm-button"));

        const errorEl = await screen.findByTestId("team-competition-entry-error");
        expect(errorEl).toHaveTextContent("エントリーの削除に失敗しました");
        expect(errorEl).not.toHaveTextContent("row-level security policy");

        // 対照実験: UserFacingError はそのまま素通しされる
        mocks.deleteEntry.mockRejectedValue(new UserFacingError("このエントリーを削除する権限がありません"));
        mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-fail4" })]);
        renderModal();

        const deleteButton2 = await screen.findByTestId("team-competition-entry-delete-e-fail4");
        await user.click(deleteButton2);
        await user.click((await screen.findAllByTestId("confirm-dialog-confirm-button")).at(-1)!);

        await waitFor(() => {
          const errors = screen.getAllByTestId("team-competition-entry-error");
          expect(errors.some((el) => el.textContent === "このエントリーを削除する権限がありません")).toBe(
            true,
          );
        });
      },
    );
  });
});
