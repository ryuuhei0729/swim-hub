/**
 * TeamSettingsTab.test.tsx — QA Sprint Contract Phase A スケルトン (web)
 *
 * 対象: apps/web/components/team/settings/TeamSettingsTab.tsx
 *       (未実装・Phase B で Web Developer が新規作成)
 *
 * ■ QA が Phase A で確定させる実装要件 (Contract 補強 / PM 経由で Developer へ)
 *     export interface TeamSettingsTabProps {
 *       teamId: string;
 *       teamName: string;
 *       teamDescription?: string | null;
 *       inviteCode?: string | null;
 *       isAdmin: boolean;
 *       // メンバー一覧。詰め替え禁止 (users.gender が optional)
 *       members: { user_id: string; role: "admin" | "user" }[];
 *     }
 *     export default function TeamSettingsTab(props: TeamSettingsTabProps): JSX.Element;
 *
 *   既存の `apps/web/components/team/TeamSettings.tsx` (管理者ページの設定タブ) とは
 *   別ファイルにする。あちらは teamsAdmin 名前空間・チーム名/説明の編集のみで、
 *   本スプリントの3セクション構成 (チーム情報 (招待コード内包) / このチームの記録色 / 脱退)
 *   とは別物。
 *   ⚠️ **Contract の抜け (過去スプリントからの持ち越し。本スプリントでは扱わない)**:
 *      管理者ページ (teams-admin) の既存「設定」タブをこの新コンポーネントへ寄せるかどうかが
 *      Contract に書かれていない。PM の裁定が必要 (最終報告で指摘済み)。
 *      本ファイルは一般ページ側のみ検証する。
 *
 * ■ Sprint Contract 検証観点 (縦積み3セクション: チーム情報 (招待コード内包) /
 *   このチームの記録色 / 脱退。mobile は今スプリントで [V-D1]〜[V-D6] に個別展開済み
 *   (ID は1対1対応しない。web も mobile の [V-D6] (フック呼び出し) / [V-D5]
 *   (mutateAsync) と粒度を揃え、[V-W6a]/[V-W6b] の2件に分けている))
 *   [V-A70] セクション構成 (見出しは2つだけ。廃止した見出しが復活していないこと、
 *           および見出しを持たないセクションが**中のコントロール**で生きていること)
 *   [V-A71] 一般メンバー: 「編集」ボタンが表示されない
 *   [V-A73] 一般メンバー: 「脱退する」は表示される
 *   [V-A75] 招待コードは readOnly の入力欄で値が見え、コピーボタンがある
 *   [V-A76] PM 裁定 C — 最後の管理者は脱退できない (leave API を呼ばない)
 *   [V-A77] 対照 — 管理者が2人なら脱退処理に進む
 *   [V-A78] カレンダー記録色セクションは ColorSwatchRow を再利用する
 *           (ロジックを再実装しない。export されていることを直接確認する)
 *
 * ■ 2026-09-21 追加スプリント: 「チームを削除する」動線の撤去 (ユーザー指示)
 *   PM 裁定: shared の deleteTeam API / useDeleteTeamMutation /
 *   getDeleteTeamErrorMessageKey / i18n の `teams.settingsTab.delete*`
 *   キーは意図的に残置する。撤去対象は web のこのコンポーネントの配線のみ。
 *   [V-W1] 管理者でも deleteTeam 見出し/deleteDescription/deleteButton/
 *          data-testid="team-settings-delete" のいずれも DOM に無い (旧 [V-A72]/[V-A74] の反転)
 *   [V-W2] 非管理者でも同様に無い (旧 [V-A72] の期待値を維持)
 *   [V-W3] 削除確認ダイアログを開く経路が無い。ConfirmDialog が2つから1つに減った
 *   [V-W4] 対照 (退行検知): 管理者の「編集」は従来どおり出る (削除だけが消えたことの証跡)
 *   [V-W5] 対照 (退行検知): 脱退は管理者・非管理者双方に出て、確定すると
 *          leaveTeamMutation が呼ばれ /teams へ遷移する ([V-A76]/[V-A77] のガードは維持)
 *   [V-W6a] useDeleteTeamMutation フック自体が一度も呼ばれない
 *   [V-W6b] mutateAsync が一度も呼ばれない (削除フックへの配線が
 *          外れていることの証跡。2件に分割し、どちらの退行かを区別できるようにした)
 *   旧 [V-A58]/[V-A59] (削除失敗時の文言変換・成功時の遷移) はクリック導線が
 *   無くなったため撤去。deleteTeam / getDeleteTeamErrorMessageKey 自体の検証は
 *   apps/shared/__tests__/deleteTeamErrorMessageKey.test.ts が引き続き担う。
 *
 * ■ jsdom で検証できないことの明示
 *   - Tailwind のクラスは jsdom では解決されないため、セクションの縦積み・余白・
 *     「危険な操作」の赤系配色は **原理的に検証不能**。ブラウザ実機 (B-02) で確認する
 *   - コピーボタンの実際のクリップボード書き込み (navigator.clipboard は jsdom 未実装。
 *     呼び出しの発生までを見る)
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import messages from "@apps/shared/messages/ja.json";

// -----------------------------------------------------------------------------
// モックは **実モジュールの import パスと戻り値の形**に一致させること。
//
// Phase A 時点の本ファイルには3つの不備があった:
//   1. `@/i18n/navigation` (useRouter) をモックしておらず、
//      `invariant expected app router to be mounted` で全滅していた。
//      他の team 系テスト (records/recordEntryPrefill.test.tsx 等) が同じモックを
//      置いているのでそれに揃える。
//   2. useAuth の import 元が違った。実装は `@/contexts` (バレル) から取っている。
//   3. `@apps/shared/hooks/queries/calendarColors` を直接モックしていたが、
//      実装 (TeamCalendarColorSection.tsx L6) は **バレル `@apps/shared/hooks`**
//      から取っている。さらに **実在しない** `useUpsertCalendarColorMutation` /
//      `useResetCalendarColorMutation` を定義していた。
//
// 実物 `useCalendarColorSettingsQuery` は **1つのフックが3つの mutation を同梱した
// オブジェクト**を返す:
//   settings / isLoading / isError / error / refetch /
//   updatePersonalColors / upsertTeamColors / deleteTeamColors
// `TeamCalendarColorSection` は `upsertTeamColors.isPending` をスウォッチの
// `disabled` に使う (書き込み中の二重タップで他方の色が null で上書きされるのを
// 防ぐ既存 CalendarColorSettings と同じガード)。**実装が正なのでモックを合わせる。**
// バレル全体を差し替えると他の export が消えるため importActual で残す。
// -----------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  /** react-query の UseMutationResult のうち、本画面が触る部分だけを模す */
  const mutationStub = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  });
  return {
    leaveTeam: vi.fn(),
    deleteTeam: vi.fn(),
    /** useDeleteTeamMutation フックそのものが呼ばれたかを検出する ([V-W6a]) */
    useDeleteTeamMutationSpy: vi.fn(),
    routerPush: vi.fn(),
    routerRefresh: vi.fn(),
    updatePersonalColors: mutationStub(),
    upsertTeamColors: mutationStub(),
    deleteTeamColors: mutationStub(),
  };
});

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: vi.fn(),
    refresh: mocks.routerRefresh,
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
  redirect: vi.fn(),
  usePathname: () => "/teams/team-1",
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" }, session: null }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useLeaveTeamMutation: () => ({ mutateAsync: mocks.leaveTeam, isPending: false }),
  // [V-W6a] フック自体がコンポーネントから呼ばれていないことを検出するためのスパイ。
  // (mutateAsync の非呼び出しは mocks.deleteTeam を見る [V-W6b] が担当)
  // shared 側のフックは PM 裁定により残置されているのでモック自体は消さない。
  useDeleteTeamMutation: (...args: unknown[]) => {
    mocks.useDeleteTeamMutationSpy(...args);
    return { mutateAsync: mocks.deleteTeam, isPending: false };
  },
}));

vi.mock("@apps/shared/hooks", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@apps/shared/hooks");
  return {
    ...actual,
    useCalendarColorSettingsQuery: () => ({
      settings: { personal: { practice_color: null, competition_color: null }, byTeam: {} },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      updatePersonalColors: mocks.updatePersonalColors,
      upsertTeamColors: mocks.upsertTeamColors,
      deleteTeamColors: mocks.deleteTeamColors,
    }),
  };
});

import TeamSettingsTab from "../../../components/team/settings/TeamSettingsTab";

/** ja.json からラベルを引く。キーが無ければテスト側で明示的に落とす */
function label(dottedKey: string): string {
  let cur: unknown = messages;
  for (const part of dottedKey.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) {
      throw new Error(`i18n キーが shared/messages/ja.json に存在しない: ${dottedKey}`);
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur !== "string") throw new Error(`i18n キーが文字列ではない: ${dottedKey}`);
  return cur;
}

/**
 * 見出し (h3) として残るのはこの2つだけ。
 * ユーザー指示の UI 改修で「チーム操作」「危険な操作」の**見出しは廃止**され、
 * 招待コードは独立セクションをやめて**チーム情報カード内**へ統合された。
 */
const VISIBLE_HEADINGS = [
  "teams.settingsTab.teamInfoTitle",
  "teams.settingsTab.calendarColorTitle",
] as const;

/** 見出しとしては**出てはいけない**もの (廃止されたセクション見出し) */
const REMOVED_HEADINGS = [
  "teams.settingsTab.teamActionsTitle",
  "teams.settingsTab.dangerZoneTitle",
] as const;

/** 実装の `LeaveGuardMember` と同じ構造 (詰め替えさせないための構造的型) */
type Member = { user_id: string; role: "admin" | "user" };

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

function renderTab(overrides: Partial<React.ComponentProps<typeof TeamSettingsTab>> = {}) {
  const members: Member[] = [
    { user_id: "admin-1", role: "admin" },
    { user_id: "me", role: "user" },
  ];
  return wrap(
    <TeamSettingsTab
      teamId="team-1"
      teamName="テストチーム"
      teamDescription="説明文"
      inviteCode="ABC123"
      isAdmin={false}
      members={members}
      {...overrides}
    />,
  );
}

describe("[V-A70〜A75] web 設定タブのセクション出し分け", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // [V-A70] セクション構成
  //
  // 🚨 **見出しの有無だけを見てはいけない。**「チーム操作」「危険な操作」は
  // 見出しを廃止したので、見出しの assert を2つ消すだけにすると
  // **セクションごと消えても緑になる**。見出しが無くなったぶん、
  // セクションの存在は**中のコントロールが見えること**で担保する。
  // ===========================================================================
  it("[V-A70] 見出しとして残るのはチーム情報とカレンダー記録色の2つだけ", () => {
    renderTab({ isAdmin: true, members: [{ user_id: "me", role: "admin" }, { user_id: "u1", role: "user" }] });

    for (const key of VISIBLE_HEADINGS) {
      expect(screen.getByText(label(key)), `${key} が見つからない`).toBeInTheDocument();
    }
    // 廃止された見出しが復活していないこと
    for (const key of REMOVED_HEADINGS) {
      expect(screen.queryByText(label(key)), `${key} の見出しが残っている`).not.toBeInTheDocument();
    }
  });

  it("[V-A70] 招待コードは独立セクションではなくチーム情報カード**内**にある", () => {
    renderTab({ isAdmin: false, inviteCode: "ZZZ999" });

    const teamInfoHeading = screen.getByText(label("teams.settingsTab.teamInfoTitle"));
    const teamInfoSection = teamInfoHeading.closest("section");
    expect(teamInfoSection, "チーム情報カード (section) が見つからない").not.toBeNull();

    // 招待コードのラベル・値・コピーボタンがすべて**同じカードの中**にある
    const inviteLabel = screen.getByText(label("teams.settingsTab.inviteCodeTitle"));
    expect(teamInfoSection!.contains(inviteLabel)).toBe(true);
    expect(teamInfoSection!.contains(screen.getByDisplayValue("ZZZ999"))).toBe(true);
    expect(
      teamInfoSection!.contains(screen.getByTestId("team-settings-copy-invite-code")),
    ).toBe(true);
  });

  // ===========================================================================
  // [V-A70 反転] 「チームを作成」「招待コードで参加」は設定タブから撤去された
  //
  // ⚠️ **テストごと消さないこと。** 消すと「どこにも無い」状態でも緑になる。
  //    機能自体はチーム一覧画面 (TeamsClient の常設アクションバー、
  //    i18n キー `teams.empty.createButton` / `teams.empty.joinButton`) に残っている。
  //
  // 📌 「一覧側に**ある**こと」をここで assert できない理由:
  //    TeamsClient のレンダリングテストは jsdom ハングのため無効化されている
  //    (__tests__/app/teams/teamsClientActionBar.test.tsx 参照)。
  //    したがって有る側の担保は**ブラウザ実機確認**が持つ。
  //    片側だけのテストになるので、この非対称を明記しておく。
  // ===========================================================================
  it("[V-A70 反転] 設定タブに「チームを作成」「参加」ボタンが存在しない", () => {
    renderTab({ isAdmin: false });

    // 正のコントロール: 設定タブ自体は描画されている
    // (描画失敗で何も見つからない状態を「撤去成功」と誤読しないため)
    expect(screen.getByTestId("team-settings-tab")).toBeInTheDocument();
    expect(screen.getByText(label("teams.settingsTab.teamInfoTitle"))).toBeInTheDocument();

    expect(screen.queryByTestId("team-settings-create-team")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-settings-join-team")).not.toBeInTheDocument();
    // 文言でも残っていないこと (testid だけ消してボタンが残る実装を検出)
    expect(screen.queryByText(label("teams.settingsTab.createTeam"))).not.toBeInTheDocument();
    expect(screen.queryByText(label("teams.settingsTab.joinTeam"))).not.toBeInTheDocument();
  });

  // ===========================================================================
  // [V-A70] 破壊的操作 — 2026-09-16 に「左右2ボタン」から
  //         「見出し + 説明 + 全幅ボタン」の縦積みカード2枚へ変更。
  //
  // ⚠️ 見出し (leaveTeam/deleteTeam) とボタン文言 (leaveButton/deleteButton) は**別キー**。
  //    `toHaveTextContent` は部分一致なので「チームを脱退する」は「チームを脱退」を
  //    含んでしまい、**見出しキーで assert しても緑になる**。動詞形を
  //    完全一致で固定して、ボタンが名詞形に戻る退行を検出する。
  // ===========================================================================
  it("[V-A70] 脱退カード: 見出し・説明・動詞形ボタンが揃っている", () => {
    renderTab({ isAdmin: false });

    expect(screen.getByText(label("teams.settingsTab.leaveTeam"))).toBeInTheDocument();
    // 新規に入った説明文
    expect(screen.getByText(label("teams.settingsTab.leaveDescription"))).toBeInTheDocument();

    const button = screen.getByTestId("team-settings-leave");
    // 完全一致。動詞形 (「チームを脱退する」) であること
    expect(button.textContent?.trim()).toBe(label("teams.settingsTab.leaveButton"));
    expect(button.textContent?.trim()).not.toBe(label("teams.settingsTab.leaveTeam"));
  });

  // ===========================================================================
  // [V-W1/V-W2] チーム削除 UI 撤去 (2026-09-21 ユーザー指示)
  //
  // 旧仕様 (管理者には deleteTeam 見出し/deleteDescription/deleteButton/
  // data-testid="team-settings-delete" が出る) を反転する。shared の
  // deleteTeam API / useDeleteTeamMutation / getDeleteTeamErrorMessageKey /
  // i18n の `teams.settingsTab.delete*` キー自体は PM 裁定により意図的に残置
  // されている (apps/shared/__tests__/ 配下は変更禁止)。ここで見るのは
  // **web のこのコンポーネントから配線が外れたこと** のみ。
  // ===========================================================================
  it.each([
    [
      "管理者 (isAdmin=true)",
      true,
      [
        { user_id: "me", role: "admin" as const },
        { user_id: "u1", role: "user" as const },
      ],
    ],
    [
      "非管理者 (isAdmin=false)",
      false,
      [
        { user_id: "admin-1", role: "admin" as const },
        { user_id: "me", role: "user" as const },
      ],
    ],
  ])("[V-W1/V-W2] %s でも削除見出し・説明・ボタン・testid が一切出ない", (_case, isAdmin, members) => {
    renderTab({ isAdmin, members });

    // 正のコントロール: 描画自体が失敗していない/破壊的操作セクション自体は生きている
    expect(screen.getByTestId("team-settings-tab")).toBeInTheDocument();
    expect(screen.getByTestId("team-settings-leave")).toBeInTheDocument();

    // 🚨 ボタンだけ消して見出し・説明が残る実装を検出するため、4要素すべてを見る
    expect(screen.queryByTestId("team-settings-delete")).not.toBeInTheDocument();
    expect(screen.queryByText(label("teams.settingsTab.deleteTeam"))).not.toBeInTheDocument();
    expect(
      screen.queryByText(label("teams.settingsTab.deleteDescription")),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(label("teams.settingsTab.deleteButton"))).not.toBeInTheDocument();
  });

  it("[V-A71] 一般メンバーには「編集」ボタンが表示されない", () => {
    renderTab({ isAdmin: false });
    expect(screen.queryByTestId("team-settings-edit-info")).toBeNull();
  });

  it("[V-A73] 一般メンバーにも「脱退する」は表示される", () => {
    renderTab({ isAdmin: false });
    expect(screen.getByTestId("team-settings-leave")).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // [V-W4] 対照 (退行検知): 「編集」は削除撤去の影響を受けず従来どおり出る。
  // 削除だけが消えたことを示す。isAdmin 分岐ごと壊すと真っ先にここが赤くなる。
  // -----------------------------------------------------------------------
  it("[V-W4] 対照: 管理者には「編集」は従来どおり表示され、「チームを削除」は表示されない", () => {
    renderTab({
      isAdmin: true,
      members: [{ user_id: "me", role: "admin" }, { user_id: "u1", role: "user" }],
    });
    expect(screen.getByTestId("team-settings-edit-info")).toBeInTheDocument();
    expect(screen.queryByTestId("team-settings-delete")).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // [V-W3] 削除確認ダイアログを開く経路が存在しない。ConfirmDialog が
  // 2つ (脱退用/削除用) から1つ (脱退用のみ) に減ったことを示す。
  // トリガーとなるボタン自体が無いので、脱退操作を経由しても
  // deleteConfirmTitle は絶対に出てこないことを対照として置く。
  // -----------------------------------------------------------------------
  it("[V-W3] 脱退ボタンを押すと開くのはleaveConfirmTitleのみ。deleteConfirmTitleは出ない", async () => {
    renderTab({
      isAdmin: true,
      members: [
        { user_id: "me", role: "admin" },
        { user_id: "a2", role: "admin" },
      ],
    });

    // 削除確認ダイアログを開くトリガー自体が無い
    expect(screen.queryByTestId("team-settings-delete")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("team-settings-leave"));

    expect(
      await screen.findByText(label("teams.settingsTab.leaveConfirmTitle")),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(label("teams.settingsTab.deleteConfirmTitle")),
    ).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // [V-W6a/V-W6b] useDeleteTeamMutation がこのコンポーネントから一度も呼ばれない。
  // 「ボタンが無い」だけでなく「削除フックへの配線が外れている」ことを示す。
  // mobile の [V-D6] (フック呼び出し) / [V-D5] (mutateAsync) と粒度を揃え、
  // 検出対象の異なる2軸 (レンダー時のフック呼び出し / クリック起因の
  // mutateAsync 呼び出し) を別 it に分ける。落ちたときにどちらの退行かを
  // 一目で区別できるようにするため。削除 UI 自体が描画されないことの
  // 主たる担保は [V-W1]/[V-W2] が持つ。ここはその上で「配線」まで外れて
  // いることの証跡。
  // -----------------------------------------------------------------------
  it("[V-W6a] useDeleteTeamMutation フック自体が呼ばれない", () => {
    // 削除ボタンは配線しないが `useDeleteTeamMutation(supabase)` だけを
    // 関数本体に書き戻す半端な再導入を render 時点で検出する。
    renderTab({
      isAdmin: true,
      members: [{ user_id: "me", role: "admin" }, { user_id: "u1", role: "user" }],
    });

    expect(mocks.useDeleteTeamMutationSpy).not.toHaveBeenCalled();
  });

  it("[V-W6b] mutateAsync が呼ばれない", () => {
    // クリック起因の呼び出しが無いこと。トリガーとなるボタン自体が無い
    // ([V-W1]/[V-W2]) ので、レンダーのみでも mutateAsync は発火しない。
    renderTab({
      isAdmin: true,
      members: [{ user_id: "me", role: "admin" }, { user_id: "u1", role: "user" }],
    });

    expect(mocks.deleteTeam).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // [V-W5] 脱退は管理者・非管理者双方に出る。確定するとmutateAsyncが呼ばれ
  // 一覧へ遷移する。削除撤去の影響を受けていないことの対照。
  // -----------------------------------------------------------------------
  it.each([
    ["管理者 (isAdmin=true)", true],
    ["非管理者 (isAdmin=false)", false],
  ])("[V-W5] %s: 脱退を確定するとleaveTeamMutationが呼ばれ一覧へ遷移する", async (_case, isAdmin) => {
    renderTab({
      isAdmin,
      members: [
        { user_id: "admin-1", role: "admin" },
        { user_id: "me", role: isAdmin ? "admin" : "user" },
      ],
    });

    await userEvent.click(screen.getByTestId("team-settings-leave"));
    await userEvent.click(screen.getByTestId("confirm-dialog-confirm-button"));

    expect(mocks.leaveTeam).toHaveBeenCalledWith("team-1");
    expect(mocks.routerPush).toHaveBeenCalledWith("/teams");
  });

  it("[V-A75] 招待コードは readOnly の入力欄に表示され、コピーボタンがある", () => {
    renderTab({ isAdmin: false, inviteCode: "ZZZ999" });

    const input = screen.getByDisplayValue("ZZZ999");
    expect(input).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: label("teams.settingsTab.copyInviteCode") }),
    ).toBeInTheDocument();
  });

  it("[V-A75 境界] 招待コードが null でもクラッシュせずセクションは出る", () => {
    renderTab({ isAdmin: false, inviteCode: null });
    expect(screen.getByText(label("teams.settingsTab.inviteCodeTitle"))).toBeInTheDocument();
  });

});

describe("[V-A76/A77] web 最後の管理者の脱退ブロック", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-A76] 最後の管理者が「脱退する」を押すと leave API を呼ばずにエラー文言が出る", async () => {
    renderTab({
      isAdmin: true,
      members: [
        { user_id: "me", role: "admin" },
        { user_id: "u1", role: "user" },
        { user_id: "u2", role: "user" },
      ],
    });

    await userEvent.click(screen.getByTestId("team-settings-leave"));

    expect(
      await screen.findByText(label("teams.settingsTab.lastAdminCannotLeave")),
    ).toBeInTheDocument();
    expect(mocks.leaveTeam).not.toHaveBeenCalled();
  });

  it("[V-A77] 対照: 管理者が2人なら同じ操作でエラー文言は出ない", async () => {
    renderTab({
      isAdmin: true,
      members: [
        { user_id: "me", role: "admin" },
        { user_id: "a2", role: "admin" },
        { user_id: "u1", role: "user" },
      ],
    });

    await userEvent.click(screen.getByTestId("team-settings-leave"));

    expect(screen.queryByText(label("teams.settingsTab.lastAdminCannotLeave"))).toBeNull();
    // ブロックされず脱退確認ダイアログまで進む (「押しても何も起きない」との区別)
    expect(screen.getByText(label("teams.settingsTab.leaveConfirmTitle"))).toBeInTheDocument();
  });

  it("[V-A76 境界] 自分が唯一のメンバー (管理者) ならブロックされず確認ダイアログへ進む", async () => {
    renderTab({ isAdmin: true, members: [{ user_id: "me", role: "admin" }] });

    await userEvent.click(
      screen.getByTestId("team-settings-leave"),
    );

    expect(screen.queryByText(label("teams.settingsTab.lastAdminCannotLeave"))).toBeNull();
    expect(screen.getByText(label("teams.settingsTab.leaveConfirmTitle"))).toBeInTheDocument();
  });
});

// [V-A58/A59] 削除失敗コードの文言変換と成功経路のテストは削除 UI 撤去 (2026-09-21)
// に伴い撤去した。deleteTeam / getDeleteTeamErrorMessageKey 自体の検証は
// apps/shared/__tests__/deleteTeamErrorMessageKey.test.ts が引き続き担う
// (PM 裁定により変更禁止)。web 側のクリック導線が無くなったため
// clickDeleteAndConfirm 経由のテストは成立しない ([V-W1]〜[V-W3] が代替)。

describe("[V-A78] カレンダー記録色は既存実装を再利用する", () => {
  it("[V-A78] ColorSwatchRow が CalendarColorSettings から export されている", async () => {
    const mod = await import("../../../components/settings/CalendarColorSettings");
    expect(
      (mod as Record<string, unknown>).ColorSwatchRow,
      "ColorSwatchRow が export されていない (設定タブから再利用できない)",
    ).toBeTypeOf("function");
  });
});
