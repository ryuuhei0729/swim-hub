/**
 * EntriesClient — 保存フロー回帰テスト (C①/C②/C⑤ + New Critical A + キャンセル/重複 UI 契約)
 *
 * Sprint Contract 検証観点: [V-01][V-02][V-07][V-17]
 * Reviewer 申し送り事項・PM確定仕様 (2026-08-12 最終) を直接カバーする:
 *   C②: 種目を「未選択」に戻した既存行が、確認モーダルの4分類のいずれか
 *       （特に「削除」）に表示されること
 *   C⑤: 既存行 (更新対象) への「流用」ボタンでも、確認モーダルの「更新」欄に
 *       ⚠️ (未編集プリフィル警告) が表示されること
 *   New Critical A (旧C①/W3の後継仕様): 自然キーが衝突する削除 (種目付け替えの
 *       付け替え先に既存行がある場合) を検出したら、確認モーダルを開く前に
 *       保存処理そのものを中止する（事前バリデーション方式）。
 *       「衝突する削除を先行実行してから更新する」という順序制御は
 *       「削除がコミットされた直後に更新が別要因で失敗するとエントリーを
 *       完全に失うデータ損失窓を生む」ため廃止された、と実装コメントに明記されている
 *       (`EntriesClient.tsx:356-361`)。よって検証すべきは「DBに1行も書き込まれない」
 *       ことそのもの。
 *
 * 実測 (2026-08-12, Phase B最終着地後): EntriesClient.tsx の構成:
 * - `handleOpenConfirm` (:380) が `findDeleteConflictError` (:363) で事前チェックし、
 *   衝突があれば `window.alert` のみで確認モーダルを開かない (:396-400)
 * - `handleConfirmSave` (:411) も書き込み直前に同じチェックを再実行する (:421-425、
 *   defense in depth)
 * - 書き込み順序は create(upsert) → update(id指定) → delete で固定 (衝突削除の
 *   先行実行は廃止)
 * - Postgres 23505 (UNIQUE制約違反) を検出した場合は `saveFailedDuplicate` の
 *   分岐メッセージを出す (:463-471)
 *
 * このテストは EntryAPI を丸ごとモックし、実際の DB 書き込みは行わず
 * 「どのAPIメソッドが何回・何を引数に呼ばれたか (0回であることを含む)」
 * 「確認モーダルに何が表示されるか」のみを検証する (DB実測は
 * apps/shared/__tests__/api/entries.test.ts に委譲する)。
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BestTime, Style } from "@apps/shared/types";
import EntriesClient, {
  type ExistingEntryDisplay,
} from "../../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient";

const mocks = vi.hoisted(() => ({
  createBulkEntries: vi.fn().mockResolvedValue([]),
  updateEntry: vi.fn().mockResolvedValue({}),
  deleteBulkEntries: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    createBulkEntries: mocks.createBulkEntries,
    updateEntry: mocks.updateEntry,
    deleteBulkEntries: mocks.deleteBulkEntries,
  })),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, supabase: {} }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const STYLE_FREE_100: Style = {
  id: 3,
  name_jp: "自由形100m",
  name: "Freestyle",
  style: "fr",
  distance: 100,
};
const STYLE_BREAST_50: Style = {
  id: 9,
  name_jp: "平泳ぎ50m",
  name: "Breaststroke",
  style: "br",
  distance: 50,
};

const baseCompetition = {
  id: "comp-1",
  title: "テスト大会",
  date: "2999-01-01", // 十分未来の日付 (isPastDate=false を保証)
  place: null,
  pool_type: 0 as const,
  entry_status: "open" as const,
  teamName: "テストチーム",
};

const activeMembers = [{ user_id: "user-1", role: "user", name: "選手A" }];

function renderEntriesClient(
  existingEntries: ExistingEntryDisplay[],
  bestTimesByUser: Record<string, BestTime[]> = {},
) {
  return render(
    <EntriesClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      activeMembers={activeMembers}
      existingEntries={existingEntries}
      styles={[STYLE_FREE_100, STYLE_BREAST_50]}
      bestTimesByUser={bestTimesByUser}
    />,
  );
}

describe("EntriesClient — 保存フロー回帰テスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createBulkEntries.mockResolvedValue([]);
    mocks.updateEntry.mockResolvedValue({});
    mocks.deleteBulkEntries.mockResolvedValue(undefined);
  });

  it(
    "既存2行 (X: 自由形, Y: 平泳ぎ) のうちXの種目をYに付け替えて保存しようとすると、" +
      "確認モーダルを開く前にブロックされ、DBには1行も書き込まれない（人間の意図: " +
      "New Critical A の核心。X→Y付け替え + 元のYの削除が同時に起きる保存は自然キー" +
      "衝突を起こすため、事前バリデーションで保存処理そのものを中止すべきこと。" +
      "『衝突削除を先行実行してから更新する』順序制御はデータ損失窓を生むため採用しない、" +
      "という確定仕様を固定する）",
    async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
        { id: "entry-Y", user_id: "user-1", style_id: 9, entry_time: 40.0, note: null, targetUserName: "選手A" },
      ];

      renderEntriesClient(existingEntries);

      const selects = screen.getAllByRole("combobox");
      // 1行目 (entry-X, 自由形) の種目を平泳ぎ(id=9)に付け替える
      fireEvent.change(selects[0], { target: { value: "9" } });
      // 2行目 (entry-Y, 元から平泳ぎ) をフォームから削除する。
      // これをしないと user-1:9 が2行に重複するため、正しく「重複エラーで
      // 保存disabled」になる (それ自体は仕様#7の正しい動作)。ここで検証したいのは
      // 「Yの行を消してXをYの種目に付け替える」という実際の管理者操作なので、
      // 削除ボタンで明示的にYの行を取り除く
      fireEvent.click(screen.getAllByRole("button", { name: "delete" })[1]);

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));

      // 確認モーダルは開かない (findDeleteConflictError がブロックする)
      expect(screen.queryByRole("button", { name: "confirmButton" })).not.toBeInTheDocument();
      expect(alertSpy).toHaveBeenCalledWith("deleteConflictError");

      // DBには1行も書き込まれていない
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.deleteBulkEntries).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    },
  );

  it(
    "衝突が無い通常の種目付け替え(Yの行を残さず削除する必要が無いケース)は、" +
      "確認モーダルが開き、更新は updateEntry(id, patch) 経由で行われる（人間の意図: " +
      "衝突検出ロジックが過剰検出になっておらず、通常の更新フローを妨げないこと。" +
      "New Critical A の事前バリデーションが『常にブロックする』過剰実装になっていないか" +
      "の非退行確認）",
    async () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox");
      // 既存に無い種目 (id=9, 平泳ぎ) への付け替え。衝突する既存行が無い
      fireEvent.change(select, { target: { value: "9" } });

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      fireEvent.click(await screen.findByRole("button", { name: "confirmButton" }));

      await waitFor(() => {
        expect(mocks.updateEntry).toHaveBeenCalledWith(
          "entry-X",
          expect.objectContaining({ style_id: 9 }),
        );
      });
      expect(mocks.deleteBulkEntries).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "保存成功後は /teams-admin/team-1?tab=competitions へ遷移する（人間の意図: " +
      "方式E [2026-08-25確定]。EntriesDataLoader は role !== 'admin' を server 側で" +
      "redirect 済みのため、この画面に到達できるのは常に admin だけであり、" +
      "戻り先は一般メンバー画面 [/teams/] ではなく管理者画面 [/teams-admin/] に固定してよい。" +
      "完全一致で assert し、/teams/team-1?tab=competitions を受理してしまう緩い assert " +
      "[toContain 等] を避ける)",
    async () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "9" } });

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      fireEvent.click(await screen.findByRole("button", { name: "confirmButton" }));

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledTimes(1);
      });
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    },
  );

  it(
    "ヘッダーの戻るボタンを押すと /teams-admin/team-1?tab=competitions へ遷移する " +
      "（人間の意図: 方式E [2026-08-25確定]。保存成功後と同じく戻り先は teams-admin に" +
      "固定する。保存APIは一切呼ばれないこと [＝副作用なしのナビゲーションのみ] も併せて確認する)",
    () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      fireEvent.click(screen.getByRole("button", { name: "record.backButton" }));

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
      expect(mocks.deleteBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "保存中に Postgres の UNIQUE制約違反 (code: 23505) が発生した場合、" +
      "saveFailedDuplicate の分岐メッセージが表示される（人間の意図: 事前バリデーションで" +
      "弾けなかった同時編集等のレースコンディションに対するフォールバック文言。" +
      "汎用エラーメッセージと区別し、ユーザーが原因を推測できるようにする）",
    async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
      mocks.updateEntry.mockRejectedValueOnce({ code: "23505", message: "duplicate key" });

      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "9" } });
      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      fireEvent.click(await screen.findByRole("button", { name: "confirmButton" }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("saveFailedDuplicate");
      });
      // 汎用エラー文言 (record.saveFailed) ではないことも確認する
      expect(alertSpy).not.toHaveBeenCalledWith("record.saveFailed");

      alertSpy.mockRestore();
    },
  );

  it(
    "23505 以外のDBエラー（同時編集での外部キー違反等）が発生した場合も、" +
      "生の Postgres エラー文字列 (err.message) が管理者に表示されない（人間の意図: " +
      "PM指示。生のDB内部エラー文字列 [例: 'duplicate key value violates unique " +
      "constraint \"entries_pkey\"'] をそのままアラートに出すと、内部実装の詳細が" +
      "ユーザーに露出してしまう。汎用の翻訳済みメッセージ [record.saveFailed] だけが" +
      "表示されること)",
    async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
      const rawPostgresMessage =
        'update or delete on table "entries" violates foreign key constraint "entries_team_id_fkey"';
      mocks.updateEntry.mockRejectedValueOnce({ code: "23503", message: rawPostgresMessage });

      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "9" } });
      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      fireEvent.click(await screen.findByRole("button", { name: "confirmButton" }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("record.saveFailed");
      });

      // window.alert に渡された引数のいずれにも、生のPostgresエラー文字列が
      // 含まれていないことを確認する
      const allAlertArgs = alertSpy.mock.calls.flat();
      expect(allAlertArgs).not.toContain(rawPostgresMessage);
      for (const arg of allAlertArgs) {
        expect(String(arg)).not.toContain("foreign key constraint");
      }

      alertSpy.mockRestore();
    },
  );

  it(
    "既存1行の種目を「未選択」に戻して保存を開くと、確認モーダルの『削除』セクションに" +
      "その行が表示される（人間の意図: Reviewer Critical#2の再発防止。確認モーダルは" +
      "diffEntryRowsの計算結果 [実際に保存される内容] と一致していなければならない）",
    async () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-Z", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox");
      fireEvent.change(select, { target: { value: "" } });

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));

      await screen.findByRole("button", { name: "confirmButton" });

      // 4セクション構成: statusDelete (件数) という見出しが表示されているか
      expect(screen.getByText("statusDelete (1)")).toBeInTheDocument();
    },
  );

  it(
    "新規追加した空行 (既存エントリーなし) で種目を選択すると、ベストタイムが入力欄に" +
      "自動プリフィルされる（人間の意図: 仕様#4『種目選択時にベストタイムを自動プリフィル』。" +
      "既存行への『流用』ボタン適用とは別の経路 [handleStyleChange] であることを明示的に検証する）",
    async () => {
      const bestTimesByUser: Record<string, BestTime[]> = {
        "user-1": [
          {
            id: "best-1",
            time: 58.0,
            created_at: "2025-01-01T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            style_id: 3,
            style: { name_jp: "自由形100m", distance: 100 },
          },
        ],
      };
      renderEntriesClient([], bestTimesByUser);

      // 選手を選択して空行を1つ追加する
      fireEvent.click(screen.getByRole("button", { name: "record.selectMemberButton" }));
      fireEvent.click(await screen.findByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
      expect(select.value).toBe(""); // 未選択の空行から開始する
      fireEvent.change(select, { target: { value: "3" } });

      const timeInput = screen.getByPlaceholderText("record.timePlaceholder") as HTMLInputElement;
      expect(timeInput.value).toBe("58.00");
    },
  );

  it(
    "既存行 (更新対象) に対して『流用』ボタンでベストタイムを再適用すると、確認モーダルの" +
      "『更新』セクションに ⚠️ (未編集プリフィル警告) が表示される（人間の意図: " +
      "Reviewer Critical#5の再発防止。⚠️警告は新規作成行だけでなく既存行の更新にも" +
      "同じ判定が適用されるべきこと）",
    async () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      const bestTimesByUser: Record<string, BestTime[]> = {
        "user-1": [
          {
            id: "best-1",
            time: 58.0,
            created_at: "2025-01-01T00:00:00Z",
            pool_type: 0,
            is_relaying: false,
            style_id: 3,
            style: { name_jp: "自由形100m", distance: 100 },
          },
        ],
      };

      renderEntriesClient(existingEntries, bestTimesByUser);

      // 「ベストタイムを流用」ボタンを押す (既存の60.5から58.0のベストタイムに置き換わる)
      fireEvent.click(screen.getByRole("button", { name: "bestTimePrefillButton" }));

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      await screen.findByRole("button", { name: "confirmButton" });

      expect(screen.getByText("statusUpdate (1)")).toBeInTheDocument();
      expect(screen.getByText("unedittedBestTimeWarning")).toBeInTheDocument();
    },
  );

  it(
    "確認モーダルをキャンセルしてもフォーム状態 (種目選択) は保持される（人間の意図: " +
      "Sprint Contract 仕様#1『キャンセルでフォーム state を失わない』）",
    async () => {
      const existingEntries: ExistingEntryDisplay[] = [
        { id: "entry-X", user_id: "user-1", style_id: 3, entry_time: 60.5, note: null, targetUserName: "選手A" },
      ];
      renderEntriesClient(existingEntries);

      const select = screen.getByRole("combobox") as unknown as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "9" } });

      fireEvent.click(screen.getByRole("button", { name: "saveButton" }));
      const confirmButton = await screen.findByRole("button", { name: "confirmButton" });
      const cancelButton = screen.getByRole("button", { name: "cancel" });
      fireEvent.click(cancelButton);

      await waitFor(() => expect(confirmButton).not.toBeInTheDocument());
      // モーダルを閉じた後も select の値 (編集内容) が保持されている
      expect((screen.getByRole("combobox") as unknown as HTMLSelectElement).value).toBe("9");
      // 保存APIは一切呼ばれていない
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "同一選手・同一種目の行を2つ作ると保存ボタンが disabled になり、重複エラー文言が表示される" +
      "（人間の意図: Sprint Contract 仕様#7『重複行は入力時点でエラー + 保存ボタンdisabled』）",
    async () => {
      renderEntriesClient([]);

      fireEvent.click(screen.getByRole("button", { name: "record.selectMemberButton" }));
      // MemberSelectModal で選手Aを選択して確定する
      const checkbox = await screen.findByRole("checkbox");
      fireEvent.click(checkbox);
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      // 選手カードに種目行を1つ追加し、既定行と合わせて2行を同じ種目にする
      fireEvent.click(screen.getByRole("button", { name: "record.addEventButton" }));

      const selects = screen.getAllByRole("combobox");
      fireEvent.change(selects[0], { target: { value: "3" } });
      fireEvent.change(selects[1], { target: { value: "3" } });

      expect(screen.getAllByText("duplicateMemberStyle").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "saveButton" })).toBeDisabled();
    },
  );
});
