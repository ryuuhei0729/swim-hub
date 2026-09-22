// =============================================================================
// teamRecordBulk.styleDetailMemberTabs.test.tsx
// TeamRecordStyleDetailScreen 種目詳細画面 (個人種目) の compHeader 再設計・
// ItemTabs の選手単位化・n本目追加・空状態。
// =============================================================================
//
// Sprint Contract 対応項目:
//   #1 上部カード (styles.compHeader) を「種目名(左) + メンバーを選択ボタン(右)」の
//      1行にする。大会名と TimeInputHelp は削除。参加者ブロックはカードへ移設。
//   #2 ItemTabs の単位を「組」から「選手」へ変更。label(i) は選手のフルネーム。
//   #3 タブ右の + はメンバー選択モーダルを開く (空の組を追加しない)。
//   #4 「n本目を追加」ボタン (testID: record-add-heat-button)。アクティブタブの
//      選手にのみ空の MemberRecord が1件増える。タブは増えない。各 memberCard に
//      「1本目/2本目」の見出し。
//   #7 選手0人のときの空状態。
//   + リレー種目の代理入力フローが一切変化していないこと (compHeader は共通描画。
//     PM裁定: リレーの compHeader は無改修、メンバーを選択ボタンは出ない)。
//   + 保存契約: 選手Aの1本目/2本目、選手Bの1本目がそれぞれ独立した records 行になる。
//
// 【命名についての注意 (Reviewer指摘)】このファイルの観点は「#1」〜「#7」および
// 「保存契約」の見出しで呼ぶ。「V-09」「V-22」等の V 番号は本ファイルでは使わない。
// 同じ suite 内には過去の別スプリントの Sprint Contract が定義した V-01〜V-09 が
// 既に存在し (例: teamRecordBulk.nonSwimmerHandoffDetail.test.tsx の [V-09] は
// 本ファイルの「#4 n本目を追加」とは無関係の別機能=非泳者フィルタ引き継ぎ)、V 番号は
// スプリントごとに採番し直される非グローバルな識別子のため、番号だけを見て
// 別スプリントの観点と混同しないこと。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

// 【確定 (Phase B)】「n本目を追加」ボタンの testID は Developer/Reviewer 協議の結果
// `record-add-heat-button` に決定 (仮値だった record-add-repeat-button ではない)。
configure({ testIdAttribute: "testID" });

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    KeyboardAvoidingView: original.View,
    // record-bulk-member-time (TextInput) を testID 属性のまま (data-testid へ
    // 変換せず) 描画する。item-tab-* 等 (Pressable/View 系, testID 属性そのまま)
    // と同じ属性名で一貫してクエリできるようにする
    // (detailScreenInvalidate.test.tsx / discardConfirmDetail.test.tsx と同じ対処)。
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
    // membersBox の user-1 (role: "admin") と一致させる。過去にここが "admin-1" のまま
    // membersBox 側と噛み合っておらず isCurrentUserAdmin が常に false になり、
    // 権限ゲート画面で全テストが停止していた (実装に一度も到達していなかった)。
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

function latestMemberSelectProps(): CapturedMemberSelectProps {
  const last = capturedMemberSelectProps[capturedMemberSelectProps.length - 1];
  if (!last) throw new Error("MemberSelectModal がまだ render されていない");
  return last;
}

const STYLE = { id: 2, name_jp: "50m自由形", name: "Freestyle", style: "Fr", distance: 50 };

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

describe("[#1] compHeader の再設計 (個人種目)", () => {
  it("大会名 (競技会タイトル) が表示されなくなる", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByText("50m自由形");
    expect(screen.queryByText("テスト大会")).toBeNull();
  });

  it("TimeInputHelp (タイム入力のコツ) が表示されなくなる", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByText("50m自由形");
    expect(screen.queryByText(ja.forms.timeInput.helpTitle)).toBeNull();
  });

  it("種目名とメンバーを選択ボタンが1行のカードに表示される", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByText("50m自由形");
    expect(screen.getByText(ja.teams.record.selectMemberButton)).toBeDefined();
  });
});

describe("[#2] ItemTabs の単位が「選手」になる (個人種目)", () => {
  beforeEach(() => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
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
            time: 31.2,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-2", name: "次郎" },
          },
        ],
        entries: [],
      },
    });
  });

  it("タブのラベルが選手のフルネームになる (組番号ではない)", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByTestId("record-bulk-member-time");
    expect(screen.getByTestId("item-tab-1").textContent).toBe("太郎");
    expect(screen.getByTestId("item-tab-2").textContent).toBe("次郎");
    // 「1本目」「2本目」という組番号ラベルにはなっていない (リレーとの差分の核心)
    expect(screen.queryByText(ja.teams.record.groupNumber.replace("{n}", "1"))).toBeNull();
  });

  it("同時に表示される record-bulk-member-time はアクティブな選手の分だけ (非アクティブな選手の入力は隠れる)", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    const firstTabInputs = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(firstTabInputs).toHaveLength(1);
    expect(firstTabInputs[0]?.value).toBe("30.10");

    fireEvent.click(screen.getByTestId("item-tab-2"));

    const secondTabInputs = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(secondTabInputs).toHaveLength(1);
    expect(secondTabInputs[0]?.value).toBe("31.20");
  });
});

describe("[#3] タブの + はメンバー選択モーダルを開く (空の組を追加しない)", () => {
  it("+ を押しても新しいタブは増えず、モーダルの visible が true になる", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
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
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByTestId("record-bulk-member-time");
    expect(screen.queryByTestId("item-tab-2")).toBeNull();
    expect(latestMemberSelectProps().visible).toBe(false);

    fireEvent.click(screen.getByTestId("item-tab-add"));

    await waitFor(() => expect(latestMemberSelectProps().visible).toBe(true));
    // + を押しただけでは空の選手タブは追加されない
    expect(screen.queryByTestId("item-tab-2")).toBeNull();
  });
});

describe("[#4] 「n本目を追加」ボタン", () => {
  beforeEach(() => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
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
            time: 31.2,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-2", name: "次郎" },
          },
        ],
        entries: [],
      },
    });
  });

  it(
    "アクティブな選手 (太郎) にのみ空の MemberRecord が1件増える。" +
      "タブ数は変わらず、記録カードに「1本目」「2本目」の見出しが付く。" +
      "非アクティブな選手 (次郎) のタブに切り替えても record-bulk-member-time は1件のまま",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findByTestId("record-bulk-member-time");
      // タブ数は選手数のまま (2人)。「n本目を追加」ボタンはこの時点で「2本目を追加」
      expect(screen.queryByTestId("item-tab-3")).toBeNull();
      // 確定 testID (record-add-heat-button) と、文言 (n=2) の両方を確認する。
      const addButtonLabel = ja.teams.record.addHeatButton.replace("{n}", "2");
      const addHeatButton = screen.getByTestId("record-add-heat-button");
      expect(addHeatButton.textContent).toContain(addButtonLabel);

      fireEvent.click(addHeatButton);

      const taroInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(taroInputs).toHaveLength(2);
      // タブ数はまだ2 (選手単位のまま、本目は増えない)
      expect(screen.queryByTestId("item-tab-3")).toBeNull();
      // 1本目・2本目の見出しが付く
      expect(
        screen.getByText(ja.teams.record.groupNumber.replace("{n}", "1")),
      ).toBeDefined();
      expect(
        screen.getByText(ja.teams.record.groupNumber.replace("{n}", "2")),
      ).toBeDefined();

      fireEvent.click(screen.getByTestId("item-tab-2"));
      const jiroInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(jiroInputs).toHaveLength(1);
      expect(jiroInputs[0]?.value).toBe("31.20");
      // 次郎は1本しか無いので組番号見出しは出ない
      expect(
        screen.queryByText(ja.teams.record.groupNumber.replace("{n}", "1")),
      ).toBeNull();
    },
  );

  it(
    "[回帰] 1選手 (太郎) に2本目を追加しても、compHeader の『n名選択中』は" +
      "本目数ではなく選手数のまま『1名選択中』を維持する (以前は entry.memberRecords.length " +
      "を使っており、2本目を追加すると誤って『2名選択中』になっていた)",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await screen.findByTestId("record-bulk-member-time");
      expect(
        screen.getByText(ja.teams.record.selectedMemberCount.replace("{n}", "2")),
      ).toBeDefined();

      fireEvent.click(screen.getByTestId("record-add-heat-button"));

      await screen.findAllByTestId("record-bulk-member-time");
      // 選手数は太郎・次郎の2名のまま (本目が増えても選手数は増えない)
      expect(
        screen.getByText(ja.teams.record.selectedMemberCount.replace("{n}", "2")),
      ).toBeDefined();
      expect(
        screen.queryByText(ja.teams.record.selectedMemberCount.replace("{n}", "3")),
      ).toBeNull();

      // MemberSelectModal に渡る selectedUserIds も本目数ではなく選手数 (重複無し)
      fireEvent.click(screen.getByTestId("item-tab-add"));
      await waitFor(() => expect(latestMemberSelectProps().visible).toBe(true));
      expect(latestMemberSelectProps().selectedUserIds).toEqual(["user-1", "user-2"]);
    },
  );
});

describe("[#7] 選手0人のときの空状態", () => {
  it("選手が1人も選択されていなくても render は成功し、メンバーを選択ボタンから追加できる", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByText("50m自由形");
    expect(screen.queryAllByTestId("record-bulk-member-time")).toHaveLength(0);

    fireEvent.click(screen.getByText(ja.teams.record.selectMemberButton));
    await waitFor(() => expect(latestMemberSelectProps().visible).toBe(true));
  });

  it("選手0人のときは「メンバーが選択されていません」の空状態文言が表示される", async () => {
    mocks.supabaseMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [],
        entries: [],
      },
    });
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await screen.findByText("50m自由形");
    expect(screen.getByText(ja.teams.record.noMembersSelected)).toBeDefined();
  });
});

describe("リレー種目は無改修であること (compHeader は共通描画のため実測が必要)", () => {
  beforeEach(() => {
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
    mocks.getStyles.mockResolvedValue([STYLE]);
  });

  it("リレーの ItemTabs は引き続き「組」単位 (n本目) のラベルのままである", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText("選手0")).toBeDefined();
    });
    expect(screen.getByTestId("item-tab-1").textContent).toBe(
      ja.teams.record.groupNumber.replace("{n}", "1"),
    );
  });

  it("リレーには個人種目用の record-bulk-member-time は現れない (別経路のまま)", async () => {
    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText("選手0")).toBeDefined();
    });
    expect(screen.queryAllByTestId("record-bulk-member-time")).toHaveLength(0);
  });

  it(
    "[PM裁定確定] リレー種目の compHeader に『メンバーを選択ボタン』(#1) は出現しない " +
      "(個人種目用の一括選択とリレーの泳者ピッカーは意味が異なるため)",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("選手0")).toBeDefined();
      });
      expect(
        screen.queryByText(ja.teams.record.selectMemberButton),
      ).toBeNull();
      // PM裁定: リレーの compHeader は無改修 (大会名・種目名・TimeInputHelp を維持)
      expect(screen.getByText("テスト大会")).toBeDefined();
      expect(screen.getByText(ja.forms.timeInput.helpTitle)).toBeDefined();
    },
  );
});

describe("保存契約: 選手Aの1本目/2本目・選手Bの1本目がそれぞれ独立した records 行になる", () => {
  let saveMock: ReturnType<typeof buildDetailScreenSupabaseMock>;

  beforeEach(() => {
    saveMock = buildDetailScreenSupabaseMock({
      selectRows: {
        competitions: [{ id: "comp-1", title: "テスト大会", pool_type: 0 }],
        records: [
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
        entries: [],
      },
    });
    mocks.supabaseMock = { supabase: saveMock.supabase };
  });

  it(
    "太郎の2本目を「n本目を追加」で作成し、次郎をモーダルから追加し、両方にタイムを" +
      "入力して保存すると、records への書き込みが3件 (太郎1本目=UPDATE, 太郎2本目=INSERT, " +
      "次郎=INSERT) になり、太郎の2件が別々の records.id を持つ (1件にマージされない)",
    async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // 太郎の2本目を追加してタイムを入力する
      const addHeatButton = await screen.findByTestId("record-add-heat-button");
      fireEvent.click(addHeatButton);

      const taroInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(taroInputs).toHaveLength(2);
      fireEvent.change(taroInputs[1] as HTMLInputElement, {
        target: { value: "29.80" },
      });

      // 次郎をモーダルから追加する
      fireEvent.click(screen.getByTestId("item-tab-add"));
      await waitFor(() => expect(latestMemberSelectProps().visible).toBe(true));
      latestMemberSelectProps().onConfirm(["user-1", "user-2"]);
      await waitFor(() => expect(screen.getByTestId("item-tab-2")).toBeDefined());

      fireEvent.click(screen.getByTestId("item-tab-2"));
      const jiroInputs = (await screen.findAllByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement[];
      expect(jiroInputs).toHaveLength(1);
      fireEvent.change(jiroInputs[0] as HTMLInputElement, {
        target: { value: "32.00" },
      });

      fireEvent.click(screen.getByText(ja.teams.record.saveButton));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const updateCalls = saveMock.updateCalls.filter(
        (c) => c.table === "records",
      );
      const insertCalls = saveMock.insertCalls.filter(
        (c) => c.table === "records",
      );
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.eq).toEqual([{ column: "id", value: "record-1" }]);
      expect((updateCalls[0]?.payload as { user_id?: string })?.user_id).toBe(
        "user-1",
      );

      expect(insertCalls).toHaveLength(2);
      const insertedUserIds = insertCalls.map(
        (c) => (c.payload as { user_id?: string }).user_id,
      );
      expect(insertedUserIds.sort()).toEqual(["user-1", "user-2"]);

      // 太郎の2件 (UPDATE 対象の record-1 と INSERT された2本目) は同じ records.id に
      // マージされていない = insert された太郎の行は record-1 とは別の新規 id を持つ
      const taroInsertCount = insertCalls.filter(
        (c) => (c.payload as { user_id?: string }).user_id === "user-1",
      ).length;
      expect(taroInsertCount).toBe(1);
    },
  );
});
