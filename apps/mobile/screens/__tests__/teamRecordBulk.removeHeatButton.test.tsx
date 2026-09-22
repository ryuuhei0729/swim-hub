// =============================================================================
// teamRecordBulk.removeHeatButton.test.tsx
// TeamRecordStyleDetailScreen 種目詳細画面 (個人種目) の「n本目」見出し行の
// 削除アイコン (record-remove-heat-button-*)。
// =============================================================================
//
// Sprint Contract Verification Checklist 対応:
//   V-01 1本目には削除アイコンが出ない
//   V-02 2本目を追加すると削除アイコンが出る
//   V-03 入力済みの本目の × を押すと Alert.alert が呼ばれ、キャンセルすると本目は残る
//   V-04 確認で「破棄」を選ぶとその本目だけが消え、1本目は残る
//   V-05 未入力の本目の × は確認ダイアログ無しで即削除される
//   V-06 [境界] 3本目まである状態で2本目を削除すると、元の3本目の見出しが
//        「2本目」に振り直される
//   V-07 削除後に「n本目を追加」ボタンのラベルの n が正しく再計算される
//   V-08 他の選手の本目に波及しない
//   V-09 削除した本目が保存対象から外れる (DELETE / INSERT なし)
//   V-10 リレー種目には削除アイコンが出ない
//   V-11 (i18n キーパリティは teamRecordBulk.i18nKeyParity.test.ts が別途担保)
//
// ミューテーション耐性メモ (feedback_swimhub_guard_needs_mutation_proof):
// V-01 のガード (`heatPosition >= 1` のときだけ描画) は、Phase B の手動検証で
// 条件を外した実装に対して実際に RED になることを一時的なプロダクションコード改変
// (revert 済み・git diff ゼロ確認済み) で確認済み。詳細は QA 報告を参照。
//
// act() 警告防止メモ (feedback_swimhub_qa_pin_test_trap /
// memberSelectionDataLossGuard.test.tsx と同じ教訓): Alert のボタン onPress や
// 直接呼ぶハンドラは必ず act() で包んでから DOM を読む。act() の外で呼んだ直後に
// waitFor すると、再レンダー前の DOM に対して assertion がたまたま成立し、
// ガードを壊しても赤くならない偽陰性になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import React from "react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

configure({ testIdAttribute: "testID" });

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    KeyboardAvoidingView: original.View,
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

import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMockOptions,
} from "./supabaseRecordSaveMock";

function buildDetailScreenSupabaseMock(options: RecordSaveSupabaseMockOptions = {}) {
  const base = buildRecordSaveSupabaseMock(options);
  const from = (table: string) => {
    const builder = base.supabase.from(table) as Record<string, unknown> & {
      order?: (...args: unknown[]) => unknown;
    };
    builder.order = (..._args: unknown[]) => builder;
    return builder;
  };
  return { ...base, supabase: { from } };
}

const mocks = vi.hoisted(() => ({
  goBack: vi.fn(),
  navigate: vi.fn(),
  getStyles: vi.fn(),
  getAccessToken: vi.fn(async () => "test-access-token"),
  membersBox: { current: [] as unknown[] },
  routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
  supabaseMock: { supabase: { from: () => ({}) } } as { supabase: unknown },
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabaseMock.supabase,
    subscription: null,
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
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

type CapturedMemberSelectProps = {
  visible: boolean;
  selectedUserIds: string[];
  onConfirm: (ids: string[]) => void;
  onCancel: () => void;
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

const STYLE = { id: 2, name_jp: "50m自由形", name: "Freestyle", style: "Fr", distance: 50 };

function record(over: Record<string, unknown>) {
  return {
    id: "record-x",
    user_id: "user-1",
    style_id: 2,
    time: 0,
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: "user-1", name: "太郎" },
    ...over,
  };
}

function getAlertButtons() {
  const call = (Alert.alert as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1) as [
    string,
    string,
    Array<{ text: string; style?: string; onPress?: () => void }>,
  ];
  return call[2];
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedMemberSelectProps.length = 0;
  mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
  mocks.getStyles.mockResolvedValue([STYLE]);
  mocks.membersBox.current = [
    { user_id: "user-1", role: "admin", is_swimmer: true, users: { id: "user-1", name: "太郎" } },
    { user_id: "user-2", role: "user", is_swimmer: true, users: { id: "user-2", name: "次郎" } },
  ];
});

describe("[V-01/V-02] 削除アイコンの表示条件 (1本目には出ない・2本目以降には出る)", () => {
  it("1本目には record-remove-heat-button が存在せず、2本目には存在する", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
          record({ id: "record-1", time: 30.1 }),
          record({ id: "record-2", time: 31.2 }),
        ],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findAllByTestId("record-bulk-member-time");

    expect(screen.queryByTestId("record-remove-heat-button-user-1-0")).toBeNull();
    expect(screen.getByTestId("record-remove-heat-button-user-1-1")).toBeDefined();
  });

  it("本目が1件しか無いときは見出し行自体が出ず、削除アイコンも存在しない", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [record({ id: "record-1", time: 30.1 })],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findAllByTestId("record-bulk-member-time");
    expect(screen.queryByTestId("record-remove-heat-button-user-1-0")).toBeNull();
    expect(
      screen.queryByText(ja.teams.record.groupNumber.replace("{n}", "1")),
    ).toBeNull();
  });
});

describe("[V-03/V-04] 入力済みの本目の × は確認ダイアログを経由する", () => {
  beforeEach(() => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
          record({ id: "record-1", time: 30.1 }),
          record({ id: "record-2", time: 31.2 }),
        ],
        entries: [],
      },
    });
  });

  it("× を押すと Alert.alert が呼ばれ、キャンセルすると本目は残る", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findAllByTestId("record-bulk-member-time");
    fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));

    expect(Alert.alert).toHaveBeenCalledWith(
      ja.teams.record.removeHeatConfirmTitle,
      ja.teams.record.removeHeatConfirmMessage.replace("{n}", "2"),
      expect.any(Array),
    );
    const buttons = getAlertButtons();
    const cancelButton = buttons.find((b) => b.style === "cancel");
    expect(cancelButton).toBeDefined();

    act(() => {
      cancelButton?.onPress?.();
    });

    const inputs = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs.map((el) => el.value).sort()).toEqual(["30.10", "31.20"]);
  });

  it("「破棄」を選ぶとその本目だけが消え、1本目は残る", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findAllByTestId("record-bulk-member-time");
    fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));

    const buttons = getAlertButtons();
    const discardButton = buttons.find((b) => b.style === "destructive");
    expect(discardButton).toBeDefined();

    act(() => {
      discardButton?.onPress?.();
    });

    const inputs = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.value).toBe("30.10");
    // 削除後は本目が1件だけになるので見出し行自体が消える
    expect(screen.queryByTestId("record-remove-heat-button-user-1-1")).toBeNull();
  });
});

describe("[V-05] 未入力の本目の × は確認ダイアログ無しで即削除される", () => {
  it("「n本目を追加」で作った空の本目はすぐに消える", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [record({ id: "record-1", time: 30.1 })],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findAllByTestId("record-bulk-member-time");
    act(() => {
      fireEvent.click(screen.getByTestId("record-add-heat-button"));
    });

    const inputsAfterAdd = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(inputsAfterAdd).toHaveLength(2);
    expect(screen.getByTestId("record-remove-heat-button-user-1-1")).toBeDefined();

    act(() => {
      fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    const inputsAfterRemove = screen.queryAllByTestId(
      "record-bulk-member-time",
    ) as HTMLInputElement[];
    expect(inputsAfterRemove).toHaveLength(1);
    expect(inputsAfterRemove[0]?.value).toBe("30.10");
  });
});

describe("[V-06/V-07/V-08] 3本目まである状態で2本目を削除すると見出しが振り直される", () => {
  beforeEach(() => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
          record({ id: "record-1", time: 30.1 }),
          record({ id: "record-2", time: 31.2 }),
          record({ id: "record-3", time: 32.3 }),
          record({
            id: "record-4",
            user_id: "user-2",
            time: 28.0,
            users: { id: "user-2", name: "次郎" },
          }),
        ],
        entries: [],
      },
    });
  });

  it(
    "太郎の2本目 (record-2) を削除すると、元の3本目 (record-3) の見出しが「2本目」に" +
      "振り直され、「3本目」の見出しは残らない。「n本目を追加」ボタンも「3本目を追加」に" +
      "戻る。次郎 (別の選手) の本目には一切影響しない",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      // 前提確認: 太郎は3本目まであり、「4本目を追加」ボタンになっている
      expect(
        screen.getByTestId("record-add-heat-button").textContent,
      ).toContain(ja.teams.record.addHeatButton.replace("{n}", "4"));
      expect(
        screen.getByText(ja.teams.record.groupNumber.replace("{n}", "3")),
      ).toBeDefined();

      fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));
      const buttons = getAlertButtons();
      const discardButton = buttons.find((b) => b.style === "destructive");

      act(() => {
        discardButton?.onPress?.();
      });

      const inputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      // record-2 (31.2) が消え、record-1 と record-3 (32.3) だけが残る (順序保持)
      expect(inputs.map((el) => el.value)).toEqual(["30.10", "32.30"]);

      // V-06: 元の3本目の見出しが「2本目」に振り直される。孤立した「3本目」は無い。
      expect(
        screen.getAllByText(ja.teams.record.groupNumber.replace("{n}", "2")),
      ).toHaveLength(1);
      expect(
        screen.queryByText(ja.teams.record.groupNumber.replace("{n}", "3")),
      ).toBeNull();

      // V-07: 「n本目を追加」ボタンのラベルが「3本目を追加」に再計算される
      expect(
        screen.getByTestId("record-add-heat-button").textContent,
      ).toContain(ja.teams.record.addHeatButton.replace("{n}", "3"));
      expect(
        screen.getByTestId("record-add-heat-button").textContent,
      ).not.toContain(ja.teams.record.addHeatButton.replace("{n}", "4"));

      // V-08: 次郎のタブに切り替えても、次郎の本目 (28.00) は変化していない
      fireEvent.click(screen.getByTestId("item-tab-2"));
      const jiroInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(jiroInputs).toHaveLength(1);
      expect(jiroInputs[0]?.value).toBe("28.00");
    },
  );
});

describe("[V-10] リレー種目には削除アイコンが出ない", () => {
  it("リレーの代理入力画面に record-remove-heat-button は一切現れない", async () => {
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_free" };
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
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
        entries: [],
      },
    });

    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText("選手0")).toBeDefined();
    });
    expect(
      screen.queryAllByTestId(/^record-remove-heat-button-/),
    ).toHaveLength(0);
  });
});

describe("[V-09] 保存契約: 削除した本目は保存対象から外れる", () => {
  it(
    "既存の本目 (record-2) を削除して保存すると、records に対して DELETE " +
      "(id=record-2) が発行され、record-1 は UPDATE のみで INSERT は発行されない",
    async () => {
      const saveMock = buildDetailScreenSupabaseMock({
        selectRows: {
          competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
          records: [
            record({ id: "record-1", time: 30.1 }),
            record({ id: "record-2", time: 31.2 }),
          ],
          entries: [],
        },
      });
      mocks.supabaseMock = { supabase: saveMock.supabase };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));
      const buttons = getAlertButtons();
      const discardButton = buttons.find((b) => b.style === "destructive");
      act(() => {
        discardButton?.onPress?.();
      });

      await screen.findAllByTestId("record-bulk-member-time");
      fireEvent.click(screen.getByText(ja.teams.record.saveButton));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const updateCalls = saveMock.updateCalls.filter((c) => c.table === "records");
      const insertCalls = saveMock.insertCalls.filter((c) => c.table === "records");
      const deleteInCalls = saveMock.inCalls.filter(
        (c) => c.table === "records" && c.op === "delete" && c.column === "id",
      );

      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.eq).toEqual([{ column: "id", value: "record-1" }]);
      expect(insertCalls).toHaveLength(0);
      expect(deleteInCalls).toHaveLength(1);
      expect(deleteInCalls[0]?.values).toEqual(["record-2"]);
    },
  );

  it(
    "追加直後 (未保存) の本目をすぐに削除して保存すると、その本目について INSERT が" +
      "発行されない (DELETE も発行されない = DB に一度も存在していないため無関係)",
    async () => {
      const saveMock = buildDetailScreenSupabaseMock({
        selectRows: {
          competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
          records: [record({ id: "record-1", time: 30.1 })],
          entries: [],
        },
      });
      mocks.supabaseMock = { supabase: saveMock.supabase };
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findAllByTestId("record-bulk-member-time");
      act(() => {
        fireEvent.click(screen.getByTestId("record-add-heat-button"));
      });
      await screen.findAllByTestId("record-remove-heat-button-user-1-1");
      act(() => {
        fireEvent.click(screen.getByTestId("record-remove-heat-button-user-1-1"));
      });
      expect(Alert.alert).not.toHaveBeenCalled();

      await screen.findAllByTestId("record-bulk-member-time");
      fireEvent.click(screen.getByText(ja.teams.record.saveButton));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const updateCalls = saveMock.updateCalls.filter((c) => c.table === "records");
      const insertCalls = saveMock.insertCalls.filter((c) => c.table === "records");
      const deleteInCalls = saveMock.inCalls.filter(
        (c) => c.table === "records" && c.op === "delete" && c.column === "id",
      );

      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.eq).toEqual([{ column: "id", value: "record-1" }]);
      expect(insertCalls).toHaveLength(0);
      expect(deleteInCalls).toHaveLength(0);
    },
  );
});
