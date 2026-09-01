// TeamEntryBulkFormScreen — 保存フロー回帰テスト (C②/C④/New Critical A mobile側)
//
// Sprint Contract 検証観点: [V-01][V-02][V-07]
// Reviewer 申し送り事項・PM確定仕様 (2026-08-12 最終) を直接カバーする:
//   C④: validDraftRows.length===0 ブロックが撤去され、hasAnyChange (diff 3種の合計)
//        に変わったため、全削除保存が可能になっていること
//   New Critical A: 自然キーが衝突する削除 (種目付け替えの付け替え先に既存行がある場合)
//        を検出したら、確認モーダルを開く前に保存処理そのものを中止する事前バリデーション。
//        「衝突削除を先行実行してから更新する」順序制御は廃止された
//        (TeamEntryBulkFormScreen.tsx:289-308 の実装コメントに明記)。
//        検証すべきは「DBに1行も書き込まれない」ことそのもの。
//   PM指示: web と mobile で diffEntryRows の結果が一致することを検証する
//        (同じ入力 → 同じ4分類。計算ロジック自体は apps/shared/__tests__/utils/entryDiff.test.ts
//        で検証済みのため、ここでは「画面が計算結果をそのまま使っているか」を実際の
//        保存API呼び出しで確認する)
//   「選択を解除」(clearRowStyle): 既存行に対して行うと削除意図として扱われること
//
// QA独自の追加観点 (Reviewer/PMのリストには無い新規発見):
//   `teams.mobile.entryBulk.conflictingDeleteTitle` / `conflictingDeleteMessage`
//   (TeamEntryBulkFormScreen.tsx:305-306 で使用) が5言語のいずれの messages/*.json にも
//   存在しない (grep実測: 0件)。衝突検出時のアラートが翻訳されずキー名のまま
//   表示される可能性がある。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Alert } from "react-native";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  // vi.mock ファクトリは巻き上げられるため、ファイル冒頭の import 済み React ではなく
  // ここで実体を取り直す。
  const ReactActual = await vi.importActual<typeof import("react")>("react");
  const ActualModal = actual.Modal as React.ComponentType<Record<string, unknown>>;
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
    // 共有モックの __modalMountRegistry は「マウント時点の props」しか保持しないため、
    // onRequestClose がマウント時のクロージャ (saving=false) に固定されてしまう。
    // 実機の RN では戻るボタンは常に「現在レンダーされている」ハンドラを呼ぶので、
    // レンダーごとの最新 props を記録して、そちらを発火できるようにする。
    Modal: (props: Record<string, unknown>) => {
      mocks.modalRenders.push(props);
      return ReactActual.createElement(ActualModal, props);
    },
  };
});

const mocks = vi.hoisted(() => {
  const styleFree: { id: number; name_jp: string; name: string; style: string; distance: number } = {
    id: 3,
    name_jp: "自由形100m",
    name: "Freestyle",
    style: "fr",
    distance: 100,
  };
  const styleBreast = {
    id: 9,
    name_jp: "平泳ぎ50m",
    name: "Breaststroke",
    style: "br",
    distance: 50,
  };

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        const op = "select";
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.order = vi.fn(() => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }));
        builder.single = vi.fn(() => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }));
        return builder;
      },
    };
  }

  return {
    modalRenders: [] as Record<string, unknown>[],
    styleFree,
    styleBreast,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getBestTimesForUsers: vi.fn(),
    createBulkEntries: vi.fn().mockResolvedValue([]),
    updateEntry: vi.fn().mockResolvedValue({}),
    deleteBulkEntries: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    user: { id: "admin-1" },
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
      { user_id: "user-1", role: "user", users: { id: "user-1", name: "選手A" } },
    ],
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    createBulkEntries = mocks.createBulkEntries;
    updateEntry = mocks.updateEntry;
    deleteBulkEntries = mocks.deleteBulkEntries;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesForUsers = mocks.getBestTimesForUsers;
  },
}));

// このテストの検証対象外の重量コンポーネントを薄いスタブに差し替える
// (TeamRecordBulkFormScreen.invalidate.test.tsx と同じ方針)
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: () => null,
}));

import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamEntryBulkFormScreen — 保存フロー回帰テスト", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modalRenders.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.getStyles.mockResolvedValue([mocks.styleFree, mocks.styleBreast]);
    mocks.getBestTimesForUsers.mockResolvedValue(new Map());
    mocks.createBulkEntries.mockResolvedValue([]);
    mocks.updateEntry.mockResolvedValue({});
    mocks.deleteBulkEntries.mockResolvedValue(undefined);

    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0, date: "2999-01-01", entry_status: "open" },
      error: null,
    };
    mocks.responses["select:entries"] = {
      data: [
        {
          id: "entry-X",
          user_id: "user-1",
          style_id: 3,
          entry_time: 60.5,
          note: null,
          users: { id: "user-1", name: "選手A" },
        },
        {
          id: "entry-Y",
          user_id: "user-1",
          style_id: 9,
          entry_time: 40.0,
          note: null,
          users: { id: "user-1", name: "選手A" },
        },
      ],
      error: null,
    };
  });

  it(
    "既存2行 (entry-X: 自由形, entry-Y: 平泳ぎ) のうち entry-X の行を削除して、" +
      "entry-Y のみを残した状態で保存すると、entry-X が deleteBulkEntries の対象になる" +
      "（人間の意図: mobile側でも C①/C②相当の diff 計算 [削除対象の正確な検出] が" +
      "画面の保存フローに正しく反映されていることの基本動作確認）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // entry-X (1行目) を削除ボタンで取り除く
      const deleteButtons = screen.getAllByTestId("icon-trash-2").map((icon) => icon.closest("button") as HTMLElement);
      fireEvent.click(deleteButtons[0]);

      fireEvent.click(screen.getByText("まとめて登録"));
      fireEvent.click(await screen.findByText("確定"));

      await waitFor(() => {
        expect(mocks.deleteBulkEntries).toHaveBeenCalledWith("team-1", ["entry-X"]);
      });
      // 残った entry-Y は変更されていないため update/create の対象にならない
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "全既存行を削除して保存できる（人間の意図: C④の再発防止。" +
      "validDraftRows.length===0 でのブロックが撤去され、hasAnyChange 判定に変わった" +
      "ことを実際の保存操作で確認する。以前の実装ではこの操作自体が" +
      "『少なくとも1件、選手と種目を選択してください』アラートでブロックされていた）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      const deleteButtons = screen.getAllByTestId("icon-trash-2").map((icon) => icon.closest("button") as HTMLElement);
      expect(deleteButtons).toHaveLength(2);
      fireEvent.click(deleteButtons[1]);
      fireEvent.click((screen.getAllByTestId("icon-trash-2")[0]).closest("button") as HTMLElement);

      fireEvent.click(screen.getByText("まとめて登録"));
      // 全削除保存が可能であること (アラートでブロックされず確認モーダルが開く)
      fireEvent.click(await screen.findByText("確定"));

      await waitFor(() => {
        expect(mocks.deleteBulkEntries).toHaveBeenCalledWith(
          "team-1",
          expect.arrayContaining(["entry-X", "entry-Y"]),
        );
      });
    },
  );

  /** entry-X の種目ピッカーを開き平泳ぎ(id=9)に付け替える共通操作 */
  async function reassignFirstRowToBreaststroke() {
    const pickerButtons = screen
      .getAllByRole("button")
      .filter((btn) => /自由形|平泳ぎ|種目を選択/.test(btn.textContent ?? ""));
    fireEvent.click(pickerButtons[0]);

    // 種目ピッカーの選択肢一覧は「行の現在値表示」より後にDOM上へ追加されるため、
    // 複数マッチのうち最後の要素がピッカー内の選択肢である
    const breastOptions = await screen.findAllByText(/平泳ぎ/, { selector: "span" });
    const breastOption = breastOptions[breastOptions.length - 1];
    fireEvent.click(breastOption.closest("button") ?? breastOption);
  }

  it(
    "entry-X の種目を entry-Y の種目 (平泳ぎ) に付け替え、元の entry-Y を削除する保存は、" +
      "確認モーダルを開く前にブロックされ、DBには1行も書き込まれない（人間の意図: " +
      "New Critical A の mobile 側対応。conflictingDeleteRows (:293) が保存処理の入口" +
      "[handleOpenConfirm:492] でチェックされ、確認モーダルが開かないこと自体を検証する）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      await reassignFirstRowToBreaststroke();

      // entry-Y の行を削除する
      const deleteButtons = screen
        .getAllByTestId("icon-trash-2")
        .map((icon) => icon.closest("button") as HTMLElement);
      fireEvent.click(deleteButtons[1]);

      fireEvent.click(screen.getByText("まとめて登録"));

      // 確認モーダルは開かない (「確定」ボタンが出現しない)
      expect(screen.queryByText("確定")).toBeNull();
      expect(Alert.alert).toHaveBeenCalled();

      // DBには1行も書き込まれていない
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.deleteBulkEntries).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "衝突検出アラートには翻訳済みの見出し・本文が渡る（生のi18nキー文字列ではない）" +
      "（人間の意図: 衝突検出という重要な保存ブロック理由をユーザーに正しく伝える" +
      "文言が必要。react-i18next モック [ja.json 実データ解決] を通した結果を検証することで、" +
      "『翻訳キーが欠落してキー名のまま表示される』regressionを機械的に検出する。" +
      "\n\n[2026-08-12 PM裁定に基づく修正] 当初このテストは『conflictingDeleteTitle/" +
      "Messageキーが5言語に存在せず、Alert.alertに生キー文字列が渡ること』を" +
      "『実測で固定』していた。i18nキー欠落という実バグを検出できた点は成果だったが、" +
      "Developer がキーを追加した後もこの向きのままだとバグ修正そのものがFAILとして" +
      "報告されてしまう (バグを仕様として固定する誤り)。キー追加を確認した上で、" +
      "『翻訳済みの正しい文言が渡ること』を検証する向きに反転させた）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      await reassignFirstRowToBreaststroke();
      const deleteButtons = screen
        .getAllByTestId("icon-trash-2")
        .map((icon) => icon.closest("button") as HTMLElement);
      fireEvent.click(deleteButtons[1]);
      fireEvent.click(screen.getByText("まとめて登録"));

      // ja.json の実データ: conflictingDeleteTitle = "削除待ちの種目と重複しています"
      // conflictingDeleteMessage = "先に削除だけを保存してから、種目の変更を保存してください。\n{list}"
      expect(Alert.alert).toHaveBeenCalledWith(
        "削除待ちの種目と重複しています",
        expect.stringContaining("先に削除だけを保存してから、種目の変更を保存してください。"),
      );

      // 生のi18nキー文字列がそのまま渡っていないこと（キー欠落の再発防止）
      const [, messageArg] = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0];
      expect(messageArg).not.toContain("teams.mobile.entryBulk.conflictingDelete");
    },
  );

  it(
    "既存行の種目を「選択を解除」すると、削除意図として扱われ保存できる（人間の意図: " +
      "web の <option value=\"\"> 相当の操作。mobile 独自の『選択を解除』UIが" +
      "diffEntryRows の toDelete に正しく反映されること）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      const pickerButtons = screen
        .getAllByRole("button")
        .filter((btn) => /自由形|平泳ぎ|種目を選択/.test(btn.textContent ?? ""));
      fireEvent.click(pickerButtons[0]);

      const clearOption = await screen.findByText("選択解除");
      fireEvent.click(clearOption.closest("button") ?? clearOption);

      fireEvent.click(screen.getByText("まとめて登録"));
      fireEvent.click(await screen.findByText("確定"));

      await waitFor(() => {
        expect(mocks.deleteBulkEntries).toHaveBeenCalledWith(
          "team-1",
          expect.arrayContaining(["entry-X"]),
        );
      });
    },
  );

  it(
    "確認モーダルをキャンセルしてもフォーム状態は保持される（人間の意図: Sprint Contract " +
      "仕様#1『キャンセルでフォーム state を失わない』。web側と同じ契約を mobile でも保証する）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // entry-Xを削除して保存を開き、確認モーダルをキャンセルする
      const deleteButtons = screen
        .getAllByTestId("icon-trash-2")
        .map((icon) => icon.closest("button") as HTMLElement);
      fireEvent.click(deleteButtons[0]);

      fireEvent.click(screen.getByText("まとめて登録"));
      await screen.findByText("確定");
      // フッターの「キャンセル」(画面全体) と確認モーダル内の「キャンセル」が両方存在するため、
      // DOM上で後に追加される (モーダル内の) ものを選ぶ
      const cancelTexts = screen.getAllByText("キャンセル");
      fireEvent.click(cancelTexts[cancelTexts.length - 1]);

      await waitFor(() => {
        expect(screen.queryByText("確定")).toBeNull();
      });
      // entry-X の行が削除された状態 (種目 1 が1件のみ) が保持されている。
      // entry-Y (平泳ぎ) の行だけが残っていることを確認する
      expect(screen.getAllByTestId("icon-trash-2")).toHaveLength(1);
      // 保存APIは一切呼ばれていない
      expect(mocks.updateEntry).not.toHaveBeenCalled();
      expect(mocks.deleteBulkEntries).not.toHaveBeenCalled();
      expect(mocks.createBulkEntries).not.toHaveBeenCalled();
    },
  );

  it(
    "保存中に Postgres の UNIQUE制約違反 (code: 23505) が発生した場合、" +
      "翻訳済みの重複エラーメッセージが Alert.alert に表示される（人間の意図: " +
      "web (EntriesClient.tsx) と同型の分岐を mobile でも保証する。PM確定仕様により " +
      "App Developer が追加した分岐の回帰テスト）",
    async () => {
      mocks.updateEntry.mockRejectedValueOnce({ code: "23505", message: "duplicate key" });
      // entry-X (style_id=3) のベストタイムを用意し、「流用」ボタン (Pressable) で
      // 種目に触れずタイムだけを更新する。RN TextInput モックは onChangeText を
      // DOM の onChange に結線しないため、fireEvent.change でテキスト入力は再現できない
      // (Pressable の onPress は onClick に結線されるため、ボタン操作で代替する)
      mocks.getBestTimesForUsers.mockResolvedValue(
        new Map([["user-1", [{ id: "best-1", time: 65.0, style_id: 3 }]]]),
      );

      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // 「流用」ボタンは bestTimesByUserId のロード (非同期effect) が完了するまで
      // disabled のままなので、押せる状態になるまで明示的に待つ
      // (フレーキー対策: クリック自体は成功するが処理対象データが未ロードのまま
      // 保存を試みると `hasAnyChange=false` になり「まとめて登録」が確認モーダルを
      // 開かずアラートを出すだけになり、後続の `findByText("確定")` がタイムアウトする)
      const prefillButtons = await screen.findAllByText("ベストタイムを流用");
      await waitFor(() => {
        const btn = prefillButtons[0].closest("button") as HTMLButtonElement | null;
        expect(btn?.disabled).toBe(false);
      });
      fireEvent.click(prefillButtons[0].closest("button") ?? prefillButtons[0]);

      // プリフィルが実際に入力欄へ反映されたこと (state更新の反映) を確認してから
      // 保存に進む。フォーマット済みの "1:05.00" (65.0秒) が表示されるまで待つ
      await screen.findByDisplayValue("1:05.00");

      fireEvent.click(screen.getByText("まとめて登録"));
      fireEvent.click(await screen.findByText("確定"));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
      const [, messageArg] = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0];
      // 現状の参照先 (competition.entries.saveFailedDuplicate) のいずれかの翻訳文言。
      // 生のキー文字列や "duplicate key" ではないことを確認する
      expect(messageArg).not.toBe("duplicate key");
      expect(String(messageArg)).not.toContain("saveFailedDuplicate");
    },
  );

  it(
    "23505 以外のDBエラーが発生した場合、生の Postgres/JS エラー文字列が Alert.alert に" +
      "表示されない（人間の意図: PM指示。内部エラー文字列 [例: err.message] をそのまま" +
      "ユーザーに見せないこと。App Developer が recordMobile.saveFailed 等の翻訳済み" +
      "メッセージに統一した変更の回帰テスト）",
    async () => {
      const rawMessage =
        'update or delete on table "entries" violates foreign key constraint "entries_team_id_fkey"';
      mocks.updateEntry.mockRejectedValueOnce(new Error(rawMessage));
      mocks.getBestTimesForUsers.mockResolvedValue(
        new Map([["user-1", [{ id: "best-1", time: 65.0, style_id: 3 }]]]),
      );

      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // 「流用」ボタンは bestTimesByUserId のロード (非同期effect) が完了するまで
      // disabled のままなので、押せる状態になるまで明示的に待つ
      // (フレーキー対策: クリック自体は成功するが処理対象データが未ロードのまま
      // 保存を試みると `hasAnyChange=false` になり「まとめて登録」が確認モーダルを
      // 開かずアラートを出すだけになり、後続の `findByText("確定")` がタイムアウトする)
      const prefillButtons = await screen.findAllByText("ベストタイムを流用");
      await waitFor(() => {
        const btn = prefillButtons[0].closest("button") as HTMLButtonElement | null;
        expect(btn?.disabled).toBe(false);
      });
      fireEvent.click(prefillButtons[0].closest("button") ?? prefillButtons[0]);

      // プリフィルが実際に入力欄へ反映されたこと (state更新の反映) を確認してから
      // 保存に進む。フォーマット済みの "1:05.00" (65.0秒) が表示されるまで待つ
      await screen.findByDisplayValue("1:05.00");

      fireEvent.click(screen.getByText("まとめて登録"));
      fireEvent.click(await screen.findByText("確定"));

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
      const allAlertArgs = (
        Alert.alert as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls.flat();
      expect(allAlertArgs).not.toContain(rawMessage);
      for (const arg of allAlertArgs) {
        expect(String(arg)).not.toContain("foreign key constraint");
      }
    },
  );
  // ------------------------------------------------------------------
  // CodeRabbit 指摘 (PR #253): 確認モーダルは背面タップ (onBackdropPress) と
  // ヘッダーの × (disabled) では保存中の閉じを既に塞いでいたが、
  // SlideUpModal は Android の戻るボタン (Modal の onRequestClose) を onClose に
  // 直結させているため、onClose 側だけ無防備だった。保存中に戻るボタンで
  // 確認モーダルが閉じられると、進行中の書き込みの結果をユーザーが確認できない。
  // ------------------------------------------------------------------
  it(
    "保存中は Android の戻るボタン (onRequestClose) で確認モーダルが閉じない" +
      "（人間の意図: 背面タップ/× と同じ保護を戻るボタン経由にも掛ける。" +
      "保存 API を未解決のまま保留して saving=true を維持し、その状態で" +
      "実際に <Modal> へ渡された onRequestClose を発火させて検証する）",
    async () => {
      // deleteBulkEntries を保留させ、保存中 (saving=true) の状態を維持する
      let resolveDelete: (() => void) | undefined;
      mocks.deleteBulkEntries.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = () => resolve();
          }),
      );

      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      const deleteButtons = screen
        .getAllByTestId("icon-trash-2")
        .map((icon) => icon.closest("button") as HTMLElement);
      fireEvent.click(deleteButtons[0]);

      fireEvent.click(screen.getByText("まとめて登録"));
      const confirmButton = await screen.findByText("確定");

      fireEvent.click(confirmButton);
      await waitFor(() => {
        expect(mocks.deleteBulkEntries).toHaveBeenCalled();
      });

      // 保存が進行中 (deleteBulkEntries 未解決) の状態で、確認モーダルの <Modal> が
      // 「今」受け取っている onRequestClose を取り出す。実機の Android 戻るボタンも
      // 現在レンダーされているハンドラを呼ぶため、マウント時ではなく最新を使う。
      const visibleModalProps = mocks.modalRenders.filter((p) => p.visible === true);
      const confirmModalProps = visibleModalProps[visibleModalProps.length - 1];
      if (!confirmModalProps) throw new Error("[test setup] 表示中の <Modal> が記録されていない");
      const onRequestClose = confirmModalProps.onRequestClose as (() => void) | undefined;
      if (typeof onRequestClose !== "function") {
        throw new Error("[test setup] SlideUpModal の <Modal> に onRequestClose が渡されていない");
      }

      act(() => {
        onRequestClose();
      });

      // SlideUpModal は閉じるとき SLIDE_DURATION(250ms) 後にネイティブ Modal の
      // visible を落とす遅延アンマウントを持つため、発火直後に見るとガードの有無に
      // かかわらず中身がまだ残っている。スライドアウトが終わり切る時間まで待ってから
      // 「それでも開いたままである」ことを確認する。
      await new Promise((resolve) => setTimeout(resolve, 400));

      // 確認モーダルは閉じていない。保存中は「確定」ラベルが ActivityIndicator に
      // 差し替わるため、確定ボタンではなくモーダル見出しの有無で開閉を判定する。
      expect(screen.queryByText("登録内容の確認")).not.toBeNull();

      resolveDelete?.();
      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });
    },
  );
});
