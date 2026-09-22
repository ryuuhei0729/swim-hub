// =============================================================================
// teamRecordBulk.memberSelectionDataLossGuard.test.tsx
// [Sprint Contract Phase A スケルトン] TeamRecordStyleDetailScreen 種目詳細画面
// (個人種目) のメンバー選択モーダル確定処理まわりの回帰・新機能ガード。
// =============================================================================
//
// Sprint Contract 対応項目:
//   #5 confirmMemberSelection の .find() → .filter() 化。
//      現行コード (`prev.memberRecords.find((mr) => mr.memberUserId === userId)`) は
//      同じ選手が複数本目 (MemberRecord) を持っていても最初の1件しか拾わない。
//      そのため「モーダルを開いて決定を押し直す」(典型的には一旦選択解除→再選択)
//      という操作をするだけで、2本目以降が静かに消える。
//   #6 タブの × はその選手の全ての本目を解除する。入力済みの値がある場合は
//      確認ダイアログを出す (未入力なら即座に解除して良い)。
//
// トートロジー防止メモ: 「.filter() を使っていることをコードから読む」のではなく、
// 実際に画面を render し、MemberSelectModal の onConfirm を実際に呼び出した後の
// DOM 上の record-bulk-member-time の件数・値で確認する。
//
// ミューテーション耐性メモ (feedback_swimhub_guard_needs_mutation_proof):
// 下記の各テストは、対象のガード (.filter() 化 / 削除確認ダイアログ) を
// 意図的に外した実装に対しては必ず FAIL することを Phase B で実装直後に
// 一度確認すること (現行の `.find()` のままだと「同じ選手を選択したまま
// 決定を押し直す」#5 のテストは 2本目が消えて FAIL するはずで、これは
// 「一旦選択解除してから再選択する」という操作手順を経由せずとも、
// 選択状態を変えずに決定を押すだけで再現する — 本質的なバグの引き金は
// 「selectedUserIds に対して選手ごとに .find() で1件だけ引く」ことそのもの)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import React from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

configure({ testIdAttribute: "testID" });

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    KeyboardAvoidingView: original.View,
    // __mocks__/react-native.ts の TextInput は testID を data-testid に変換するため、
    // このファイルの `configure({ testIdAttribute: "testID" })` と噛み合わず
    // record-bulk-member-time が一切引けなくなる (findAllByTestId が常に空を返す =
    // 実装に到達せず全テストが無意味に赤くなる)。detailScreenInvalidate /
    // discardConfirmDetail / styleDetailMemberTabs と同じくローカルで
    // testID をそのまま DOM 属性として描画する TextInput に差し替える。
    TextInput: ({
      onChangeText,
      value,
      ...props
    }: { onChangeText?: (text: string) => void; value?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

const mocks = vi.hoisted(() => {
  const style = { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 };
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {
          select: (..._a: unknown[]) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    style,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
    goBack: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
    ] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
    getStyles: vi.fn(),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: vi.fn(), goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.teamMembers, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = vi.fn(async () => new Map());
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));

// MemberSelectModal の props (特に onConfirm) を捕捉するスタブ。
// teamEntryBulk.nonSwimmerAdminGuard.test.tsx と同じ方式 (捕捉のみで描画は行わない)。
type CapturedMemberSelectProps = {
  selectedUserIds: string[];
  onConfirm: (ids: string[]) => void;
};
const capturedMemberSelectProps: CapturedMemberSelectProps[] = [];
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: CapturedMemberSelectProps) => {
    capturedMemberSelectProps.push(props);
    return null;
  },
}));

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function latestMemberSelectProps(): CapturedMemberSelectProps {
  const last = capturedMemberSelectProps[capturedMemberSelectProps.length - 1];
  if (!last) throw new Error("MemberSelectModal がまだ render されていない");
  return last;
}

describe("[#5] confirmMemberSelection のデータ消失防止 (.find() → .filter() 化)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = {
      // 太郎の1本目・2本目。同一 memberUserId (user-1) の MemberRecord が
      // 既に2件、画面ロード時点で entry.memberRecords に存在する状態を作る。
      data: [
        {
          id: "record-1",
          user_id: "user-1",
          style_id: 2,
          time: 30.1,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "user-1", name: "太郎" },
        },
        {
          id: "record-2",
          user_id: "user-1",
          style_id: 2,
          time: 31.2,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "user-1", name: "太郎" },
        },
      ],
      error: null,
    };
  });

  it(
    "ロード直後は太郎の1本目・2本目の両方が record-bulk-member-time として" +
      "存在する (このテストの前提の確認)",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      const timeInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(timeInputs).toHaveLength(2);
      expect(timeInputs.map((el) => el.value).sort()).toEqual(["30.10", "31.20"]);
    },
  );

  it(
    "太郎が選択された状態のままモーダルの決定 (onConfirm) を再度呼んでも、" +
      "太郎の1本目・2本目は両方とも残る (選択解除→再選択の操作でも同じ結果になる、" +
      "本質的なバグの引き金である『再確定』そのものを再現する)",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");

      // モーダルに渡っている現在の選択状態 (太郎のみ) を確認してから、
      // 同じ選択内容のまま決定を押した状況を再現する
      expect(latestMemberSelectProps().selectedUserIds).toEqual(["user-1"]);
      // 【ミューテーション耐性の修正】onConfirm を act() の外で呼ぶと、直後の
      // `findAllByTestId`/`queryAllByTestId` は React の非同期な再レンダーが
      // 完了する前の (更新前の) DOM に対して即座に成立してしまい、`.find()` 退行
      // (2本目が消える) を検出できない (実測済み: production を `.find()` に
      // 戻しても、act() で囲わない限りこのテストは常に green のままだった)。
      // act() で state 更新を同期的にフラッシュしてから DOM を読む。
      act(() => {
        latestMemberSelectProps().onConfirm(["user-1"]);
      });

      const inputsAfter = screen.queryAllByTestId(
        "record-bulk-member-time",
      ) as HTMLInputElement[];
      expect(inputsAfter.map((el) => el.value).sort()).toEqual(["30.10", "31.20"]);
    },
  );

  it(
    "太郎を一旦選択解除 (onConfirm([])) してから再選択 (onConfirm(['user-1'])) すると、" +
      "解除前の1本目・2本目は復元されず、空の新規1件だけになる " +
      "（PM裁定確定 2026-09-22: 全解除は『破棄』であり undo 相当の復元は行わない。" +
      "将来ここに復元ロジックが紛れ込んだら赤くなるよう、最終状態を明示的に pin する）",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");

      act(() => {
        latestMemberSelectProps().onConfirm([]);
      });
      // 選択解除直後は太郎の入力欄が消える (これ自体は仕様通りの挙動)
      expect(screen.queryAllByTestId("record-bulk-member-time")).toHaveLength(0);

      act(() => {
        latestMemberSelectProps().onConfirm(["user-1"]);
      });

      // PM裁定: 解除前の1本目 (30.10)・2本目 (31.20) はどちらも復元されない。
      // 再選択は「新規の空行」1件のみになる (undo 相当の復元ロジックは無い)。
      const inputsAfterReselect = screen.queryAllByTestId(
        "record-bulk-member-time",
      ) as HTMLInputElement[];
      expect(inputsAfterReselect).toHaveLength(1);
      expect(inputsAfterReselect[0]?.value).toBe("");
      expect(latestMemberSelectProps().selectedUserIds).toEqual(["user-1"]);
    },
  );

  it.todo(
    "[要 PM 裁定] モーダルを開いたまま (決定を押さずに) チェックを外して" +
      "また入れ直した場合は、そもそも state に反映されておらず onConfirm も" +
      "呼ばれないため、この経路ではデータ消失は起きない — と考えて良いか確認する",
  );
});

describe("[#6] タブの × は選手の全ての本目を解除し、入力済みなら確認ダイアログを出す", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    // 【Reviewer指摘対応】ItemTabs は count > 1 のときしか × を表示しない
    // (PM裁定: 選手1名のときは × を出さないのが正しい仕様として現状維持)。
    // × を実際に押す検証をするため、最低2名 (太郎・次郎とも入力済み) にする。
    mocks.responses["select:records"] = {
      data: [
        {
          id: "record-1",
          user_id: "user-1",
          style_id: 2,
          time: 30.1,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "user-1", name: "太郎" },
        },
        {
          id: "record-2",
          user_id: "user-2",
          style_id: 2,
          time: 28.0,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "user-2", name: "次郎" },
        },
      ],
      error: null,
    };
  });

  it(
    "入力済み (time>0) の選手のタブの × を押すと確認ダイアログが表示され、" +
      "キャンセルすると選手は消えない",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      expect(screen.getByTestId("item-tab-2")).toBeDefined();

      // 【Reviewer指摘対応】以前はここで × を一度も押さずに
      // `Alert.alert` 未呼び出しを確認するだけだった (ガードを削除しても赤くならない
      // = ミューテーション耐性ゼロ)。実際に次郎 (入力済み) の × を押す。
      fireEvent.click(screen.getByTestId("item-tab-remove-2"));

      expect(Alert.alert).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
      );
      const [, , buttons] = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0] as [string, string, Array<{ text: string; style?: string; onPress?: () => void }>];
      const cancelButton = buttons.find((b) => b.style === "cancel");
      expect(cancelButton).toBeDefined();

      cancelButton?.onPress?.();

      // キャンセルしたので選手 (タブ・入力欄) は消えない
      expect(screen.getByTestId("item-tab-2")).toBeDefined();
      const inputsAfterCancel = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(inputsAfterCancel).toHaveLength(1);
    },
  );

  it(
    "未入力 (time=0 かつ note 等も空) の選手のタブの × は確認ダイアログ無しで即座に解除される",
    async () => {
      // 【実装上の注意】未入力状態は既存 records 由来では再現できない — DB から
      // 読み込む個人種目の MemberRecord は `buildStyleEntriesFromExisting` が
      // 常に `timeDisplayValue: formatTimeBest(record.time)` を入れるため、
      // 万一 time=0 の行が存在すると formatTimeBest(0) === "0.00" (空文字ではない)
      // になり hasMemberRecordData が誤って true を返す。ただし保存側は
      // `mr.time > 0` のときしか個人種目の records 行を作らないため、time=0 の
      // 既存行は実運用では発生しない。実際に「未入力」を再現できる経路は
      // メンバー選択モーダルで新規に選手を追加した直後 (addHeatForActivePlayer /
      // confirmMemberSelection はどちらも timeDisplayValue: "" で新規行を作る)
      // なので、そちらを使う。
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.1,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      latestMemberSelectProps().onConfirm(["user-1", "user-2"]);

      await waitFor(() => {
        expect(screen.getByTestId("item-tab-2")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("item-tab-remove-2"));

      expect(Alert.alert).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByTestId("item-tab-2")).toBeNull();
      });
    },
  );

  it(
    "確認ダイアログで「破棄」を選ぶと、その選手の全ての本目が" +
      "record-bulk-member-time / タブから消え、MemberSelectModal の selectedUserIds からも外れる",
    async () => {
      // 次郎も入力済み (time>0) にして、削除確認ダイアログの「破棄」経路を検証する。
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.1,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
          {
            id: "record-2",
            user_id: "user-2",
            style_id: 2,
            time: 28.0,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-2", name: "次郎" },
          },
        ],
        error: null,
      };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      expect(screen.getByTestId("item-tab-2")).toBeDefined();

      fireEvent.click(screen.getByTestId("item-tab-remove-2"));

      expect(Alert.alert).toHaveBeenCalledWith(
        "選手を削除しますか？",
        "次郎の入力済みデータが削除されます。",
        expect.any(Array),
      );
      const [, , buttons] = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0] as [string, string, Array<{ text: string; style?: string; onPress?: () => void }>];
      const discardButton = buttons.find((b) => b.style === "destructive");
      expect(discardButton).toBeDefined();

      discardButton?.onPress?.();

      await waitFor(() => {
        expect(screen.queryByTestId("item-tab-2")).toBeNull();
      });
      const remainingInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(remainingInputs).toHaveLength(1);
      expect(remainingInputs[0]?.value).toBe("30.10");
      expect(latestMemberSelectProps().selectedUserIds).not.toContain("user-2");
    },
  );
});
