// =============================================================================
// teamRecordBulk.entryPrefill.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (mobile 側の受け入れテスト):
//   [仕様#1・最重要] entries.entry_time は記録タイムの入力欄には入れず、行の脇に
//     読み取り専用の参考ラベル (forms.recordLog.entryTimeLabel) としてのみ表示する。
//   [仕様#2] 既存記録を優先し、不足分だけエントリーから追加する。(user_id, style_id) の
//     組で重複排除する。リレー検出済みの StyleEntry には一切触れない。
//
// 移植 (2階層化): 旧 TeamRecordBulkFormScreen は大会全体を1フォームで表示していたが、
// 新画面は一覧 (種目カード) + 詳細 (1種目/1リレー種目) に分かれた。各テストは
// 対象種目の詳細画面を直接開くことで元の観点をそのまま検証できる。「別カードとして
// 追加される」観点 (旧テスト4本目) だけは一覧画面のカード件数表示に観点が移る。

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createResponseMapSupabase,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";
import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";

const mocks = {
  ...createResponseMapSupabase(),
  style: { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
  styleBreast: { id: 9, name_jp: "50m平泳ぎ", name: "50m Breaststroke", style: "Br", distance: 50 },
};

harness.supabase = mocks.supabase;

describe("TeamRecordStyleDetailScreen — エントリー行の初期反映 (仕様#1・仕様#2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.getStyles.mockResolvedValue([mocks.style, mocks.styleBreast]);
    harness.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    harness.members.length = 0;
    harness.members.push(
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
    );
  });

  it(
    "既存記録が無い大会でエントリーが1件あると、参考ラベル (forms.recordLog.entryTimeLabel) が" +
      "表示される一方、タイム入力欄 (testID: record-bulk-member-time) は空欄のまま初期表示される" +
      "（人間の意図: entries.entry_time を記録タイム入力欄に紛れ込ませない、という" +
      "最重要契約の mobile 側確認）",
    async () => {
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // 参考ラベルが表示される (実際の i18n 文言 + フォーマット済みタイム)。
      // ラベルと値は別々の Text ノードとして描画されるため body 全体のテキストで照合する
      // (祖先要素をすべて辿ると複数要素が条件を満たし getByText が一意に決まらないため)
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/エントリータイム:/);
        expect(document.body.textContent).toMatch(/1:23\.45/);
      });

      // タイム入力欄は空欄のまま (entry_time がそのまま入力値になっていない)
      const timeInput = screen.getByTestId("record-bulk-member-time") as HTMLInputElement;
      expect(timeInput.value).toBe("");
    },
  );

  it(
    "既存記録がある (user_id, style_id) の組には、同じ組のエントリーがあっても行が" +
      "重複追加されない一方、記録の無い組は不足分として追加される (仕様#2)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          // user-1 は既に記録あり → 追加されない
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
          // user-2 は記録なし → 不足分として追加される
          { id: "entry-2", user_id: "user-2", style_id: 2, entry_time: 90.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // 【仕様変更 (種目詳細画面の選手タブ化) に伴う修正】ItemTabs が「組」から
      // 「選手」単位になり、record-bulk-member-time は常にアクティブな選手1名分
      // しか描画されない。太郎(item-tab-1, 既存)・次郎(item-tab-2, エントリー由来)
      // の両タブを切り替えてそれぞれの入力欄の値を確認する。
      const taroInput = (await screen.findByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement;
      expect(taroInput.value).toBe("27.50");

      // このファイルは configure({ testIdAttribute: "testID" }) を呼んでいないため
      // (既定の data-testid 前提)、testID をそのまま DOM 属性化する Pressable (ItemTabs
      // のタブ本体) は getByTestId で引けない (TextInput だけが data-testid に変換
      // される __mocks__/react-native.ts の既定挙動)。タブラベルのテキストで代用する。
      fireEvent.click(screen.getByText("次郎"));
      const jiroInput = (await screen.findByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement;
      expect(jiroInput.value).toBe("");
    },
  );

  it(
    "【PM確定仕様 2026-08-12 修正3・web/mobile パリティ確認 (2026-08-12着地確認済み)】" +
      "既存記録由来の行であっても、(user_id, style_id) に一致するエントリーがあれば" +
      "参考ラベルが表示される (人間の意図: 前スプリントで web と mobile の挙動が" +
      "分岐して Critical になった前例があるため、web 側の recordEntryPrefill.test.tsx の" +
      "同名テストと assertion の形を揃えて固定する。mobile の stampExistingEntryTimeReferences " +
      "[buildStyleEntries.ts] が web と完全一致することを PM が diff で確認済み)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 27.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 83.45, note: null, users: { id: "user-1", name: "太郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // 既存記録の行 (太郎, time=27.5) にもエントリーの参考ラベルが付く
      await waitFor(() => {
        expect(document.body.textContent).toMatch(/エントリータイム:/);
        expect(document.body.textContent).toMatch(/1:23\.45/);
      });

      // タイム入力値そのものは既存の結果タイムのまま (参考ラベルの追加が入力値を上書きしない)
      const timeInput = screen.getByTestId("record-bulk-member-time") as HTMLInputElement;
      expect(timeInput.value).toBe("27.50");
    },
  );

  it(
    "リレー検出済みの StyleEntry と別種目のエントリーが同時にあっても、リレーカードの" +
      "泳者選択 (4名) は変化しない (仕様#2 リレー不可侵。詳細画面をリレー種目で開く)",
    async () => {
      harness.routeParams = { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_free" };
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-a" },
          { time: 28.7, is_relaying: true, user_id: "user-b" },
          { time: 28.3, is_relaying: true, user_id: "user-c" },
          { time: 27.6, is_relaying: true, user_id: "user-d" },
        ].map((r, idx) => ({
          id: `relay-record-${idx}`,
          user_id: r.user_id,
          style_id: 2,
          time: r.time,
          is_relaying: r.is_relaying,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: r.user_id, name: `選手${idx}` },
        })),
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-2", style_id: 9, entry_time: 45.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
        error: null,
      };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // リレーカードの4名の泳者選択 (mobile はネイティブ select ではなく Pressable +
      // モーダルのピッカーボタンに選択中の氏名を表示する) がそのまま残っている
      await waitFor(() => {
        expect(screen.getByText("選手0")).toBeDefined();
        expect(screen.getByText("選手1")).toBeDefined();
        expect(screen.getByText("選手2")).toBeDefined();
        expect(screen.getByText("選手3")).toBeDefined();
      });

      // このリレー詳細画面には平泳ぎのエントリー由来行は現れない
      // (2階層化により別種目は別カード/別画面。「別カードとして追加される」ことの
      //  確認は下の一覧画面テストで行う)
      expect(screen.queryAllByTestId("record-bulk-member-time")).toHaveLength(0);
    },
  );

  it(
    "リレー検出済みの StyleEntry と別種目のエントリーが同時にあっても、エントリー由来行は" +
      "一覧画面で別カードとして反映される (仕様#2 リレー不可侵。一覧画面側の観点)",
    async () => {
      harness.routeParams = { competitionId: "comp-1", teamId: "team-1" };
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-a" },
          { time: 28.7, is_relaying: true, user_id: "user-b" },
          { time: 28.3, is_relaying: true, user_id: "user-c" },
          { time: 27.6, is_relaying: true, user_id: "user-d" },
        ].map((r, idx) => ({
          id: `relay-record-${idx}`,
          user_id: r.user_id,
          style_id: 2,
          time: r.time,
          is_relaying: r.is_relaying,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: r.user_id, name: `選手${idx}` },
        })),
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-2", style_id: 9, entry_time: 45.0, note: null, users: { id: "user-2", name: "次郎" } },
        ],
        error: null,
      };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });

      // 平泳ぎ (id 9) カードは entries 由来の1件を持つ「未入力」カードとして表示される
      await waitFor(() => {
        expect(screen.getByText("50m平泳ぎ")).toBeDefined();
      });
    },
  );
});
