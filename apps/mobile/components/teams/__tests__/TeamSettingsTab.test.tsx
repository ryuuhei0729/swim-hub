// =============================================================================
// TeamSettingsTab.test.tsx — QA Sprint Contract Phase A スケルトン (mobile)
// =============================================================================
//
// 対象: apps/mobile/components/teams/TeamSettingsTab.tsx (未実装・Phase B で新規作成)
//
// ■ QA が Phase A で確定させる実装要件 (Contract 補強 / PM 経由で Developer へ)
//     export interface TeamSettingsTabProps {
//       teamId: string;
//       teamName: string;
//       teamDescription?: string | null;
//       inviteCode?: string | null;
//       isAdminView: boolean;
//       /** TeamDetailScreen が既に持っている members をそのまま渡す。詰め替え禁止 */
//       members: TeamMembershipWithUser[];
//     }
//     export const TeamSettingsTab: React.FC<TeamSettingsTabProps>;
//
//   TeamDetailScreen は activeTab === "settings" のときこれを描画する。
//   `members` は加工せずそのまま渡すこと (users.gender が optional なので
//   中間で型を作り直すと落ちる — WA ポイントで実障害の前科がある)。
//
// ■ Sprint Contract 検証観点 (縦積み5セクション)
//   [V-A50] 一般メンバー: チーム情報 / 招待コード / カレンダー記録色 /
//           チーム操作 / 危険な操作 の5セクションがすべて表示される
//   [V-A51] 一般メンバー: 「編集」ボタンは表示されない (管理者のみ)
//   [V-A52] 一般メンバー: 「チームを削除」は表示されない (管理者のみ)
//   [V-A53] 一般メンバー: 「脱退する」は表示される
//   [V-A54] 管理者: 「編集」「チームを削除」がどちらも表示される
//   [V-A55] 招待コードは全メンバーに値が表示され、コピーボタンがある
//   [V-A56] PM 裁定 C — 自分が最後の管理者かつ他メンバーが残るとき、
//           「脱退する」を押すと **leave API を呼ばずに** エラー文言が出る
//   [V-A57] 対照 — 管理者がもう一人居れば同じ操作で leave API が呼ばれる
//
// ■ jsdom で検証できないことの明示
//   - セクションの縦積み順序が「見た目で上から下」であること (Flexbox 非解決)。
//     DOM 上の前後関係までは見るが、実際の並びは実機/エミュレータ目視で確認する
//   - スクロールで下端の「危険な操作」に到達できること (高さ計算がされない)
//   - スウォッチのタップ判定 (ヒットテスト)
//
// ■ トートロジー回避
//   ラベルは shared/messages の ja.json から **キー経由**で引く (訳文は固定しない)。
//   キーが存在しなければ明示的に落とす (getByText(undefined) の不可解な失敗を避ける)。
// =============================================================================

import React from "react";
import { Alert } from "react-native";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import jaMessages from "@apps/shared/messages/ja.json";
import { TeamOperationError } from "@apps/shared/api/teams/core";

// -----------------------------------------------------------------------------
// モックは **実モジュールの export と戻り値の形**に一致させること。
//
// Phase A 時点の本ファイルは `useUpsertCalendarColorMutation` /
// `useResetCalendarColorMutation` という **存在しない export** をモックしていた
// (grep すると本テストと web 側テストにしか出現しない識別子だった)。
// 存在しない export をモックすると vi.mock はそのモジュール全体を差し替えるため、
// 実物が返しているものが欠落しても気づけず、しかも実装が壊れても検出できない。
//
// 実物 `apps/shared/hooks/queries/calendarColors.ts` の
// `useCalendarColorSettingsQuery` は **1つのフックが3つの mutation を同梱した
// オブジェクト**を返す (L166-175 実測):
//   settings / isLoading / isError / error / refetch /
//   updatePersonalColors / upsertTeamColors / deleteTeamColors
// `TeamCalendarColorSection` は `upsertTeamColors.isPending` をスウォッチの
// `disabled` に使う (書き込み中の二重タップで他方の色が null で上書きされるのを
// 防ぐガード)。**実装が正しいのでモック側を実物に合わせる。**
// -----------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  /** react-query の UseMutationResult のうち、本コンポーネントが触る部分だけを模す */
  const mutationStub = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  });
  return {
    /** 既定は成功。失敗経路のテストだけ mockResolvedValueOnce(false) で上書きする */
    copyTextToClipboard: vi.fn(async (_text: string) => true),
    leaveMutateAsync: vi.fn(),
    deleteMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    createMutateAsync: vi.fn(),
    joinMutateAsync: vi.fn(),
    upsertTeamColors: mutationStub(),
    updatePersonalColors: mutationStub(),
    deleteTeamColors: mutationStub(),
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" } }),
}));

// クリップボードは実引数と成否を検証したいのでモックする。
// 実物は expo-clipboard / navigator.clipboard / execCommand を環境で切り替えるため、
// jsdom では「たまたま成功する」経路に落ちて成否の分岐を踏めない
vi.mock("@/utils/copyToClipboard", () => ({
  copyTextToClipboard: (text: string) => mocks.copyTextToClipboard(text),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useLeaveTeamMutation: () => ({ mutateAsync: mocks.leaveMutateAsync, isPending: false }),
  useDeleteTeamMutation: () => ({ mutateAsync: mocks.deleteMutateAsync, isPending: false }),
  useUpdateTeamMutation: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  // TeamSettingsTab は「チーム操作」セクションで TeamCreateModal / TeamJoinModal を
  // 常時マウントする。これらが使う mutation もモックしないとフック取得で落ちる
  useCreateTeamMutation: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
  useJoinTeamMutation: () => ({ mutateAsync: mocks.joinMutateAsync, isPending: false }),
}));

vi.mock("@apps/shared/hooks/queries/calendarColors", () => ({
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
}));

import { TeamSettingsTab } from "../TeamSettingsTab";

/** ja.json からラベルを引く。キーが無ければテスト側で明示的に落とす */
function label(dottedKey: string): string {
  let cur: unknown = jaMessages;
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
 * 見出し (sectionTitle) として残るのはこの2つだけ。
 * ユーザー指示の UI 改修で「チーム操作」「危険な操作」の**見出しは廃止**され、
 * 招待コードは独立セクションをやめて**チーム情報カード内のラベル**になった。
 */
const VISIBLE_HEADINGS = [
  "teams.settingsTab.teamInfoTitle",
  "teams.settingsTab.calendarColorTitle",
] as const;

/** 見出しとしては**出てはいけない**もの (廃止済み) */
const REMOVED_HEADINGS = [
  "teams.settingsTab.teamActionsTitle",
  "teams.settingsTab.dangerZoneTitle",
] as const;

function makeMember(
  id: string,
  role: "admin" | "user",
  overrides: Partial<TeamMembershipWithUser> = {},
): TeamMembershipWithUser {
  return {
    id: `membership-${id}`,
    team_id: "team-1",
    user_id: id,
    role,
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: { id, name: `ユーザー${id}` },
    ...overrides,
  } as unknown as TeamMembershipWithUser;
}

const renderTab = (
  props: Partial<React.ComponentProps<typeof TeamSettingsTab>> = {},
) =>
  render(
    <TeamSettingsTab
      teamId="team-1"
      teamName="テストチーム"
      teamDescription="説明文"
      inviteCode="ABC123"
      isAdminView={false}
      members={[makeMember("admin-1", "admin"), makeMember("me", "user")]}
      {...props}
    />,
  );

describe("[V-A50〜A55] TeamSettingsTab セクションの出し分け", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ⚠️ 見出しの assert を消すだけにしないこと。「チーム操作」「危険な操作」は
  // 見出しを廃止したので、**セクションごと消えても緑**になりうる。
  // 見出しが無くなったぶん、存在は**中のコントロール**で担保する。
  it("[V-A50] 見出しとして残るのはチーム情報とカレンダー記録色の2つだけ", () => {
    renderTab({ isAdminView: true });
    for (const key of VISIBLE_HEADINGS) {
      expect(screen.getByText(label(key)), `${key} が見つからない`).toBeTruthy();
    }
    for (const key of REMOVED_HEADINGS) {
      expect(screen.queryByText(label(key)), `${key} の見出しが残っている`).toBeNull();
    }
  });

  // [V-A50 反転] 「チームを作成」「招待コードで参加」は設定タブから撤去された
  // (ユーザー指示。web と同じ改修)。**テストごと消さないこと** —
  // 消すと「どこにも無い」状態でも緑になる。機能自体はチーム一覧画面に残っており、
  // そちらの担保はブラウザ実機確認が持つ (web 側で実測確認済み)。
  it("[V-A50 反転] 設定タブに「チームを作成」「参加」が存在しない", () => {
    renderTab({ isAdminView: false });

    // 正のコントロール: 設定タブ自体は描画されている
    expect(screen.getByText(label("teams.settingsTab.teamInfoTitle"))).toBeTruthy();

    expect(screen.queryByText(label("teams.settingsTab.createTeam"))).toBeNull();
    expect(screen.queryByText(label("teams.settingsTab.joinTeam"))).toBeNull();
  });

  // 破壊的操作は「見出し + 説明 + 動詞形ボタン」のカード2枚になった。
  // ⚠️ 見出し (leaveTeam/deleteTeam) とボタン (leaveButton/deleteButton) は別キー
  it("[V-A50] 脱退カード: 見出し・説明・動詞形ボタンが揃っている", () => {
    renderTab({ isAdminView: false });
    expect(screen.getByText(label("teams.settingsTab.leaveTeam"))).toBeTruthy();
    expect(screen.getByText(label("teams.settingsTab.leaveDescription"))).toBeTruthy();
    expect(screen.getByText(label("teams.settingsTab.leaveButton"))).toBeTruthy();
  });

  it("[V-A50] 削除カードは管理者ビューでのみ**丸ごと**出る (説明文だけ残る実装を検出)", () => {
    // 利用者ビュー: 見出し・説明・ボタンのいずれも出ない
    renderTab({ isAdminView: false });
    expect(screen.queryByText(label("teams.settingsTab.deleteTeam"))).toBeNull();
    expect(screen.queryByText(label("teams.settingsTab.deleteDescription"))).toBeNull();
    expect(screen.queryByText(label("teams.settingsTab.deleteButton"))).toBeNull();

    cleanup();

    // 管理者ビュー: 3要素すべて出る
    renderTab({ isAdminView: true });
    expect(screen.getByText(label("teams.settingsTab.deleteTeam"))).toBeTruthy();
    expect(screen.getByText(label("teams.settingsTab.deleteDescription"))).toBeTruthy();
    expect(screen.getByText(label("teams.settingsTab.deleteButton"))).toBeTruthy();
  });

  it("[V-A50] 招待コードはチーム情報カード内に値とコピーボタンが出る", () => {
    renderTab({ isAdminView: false, inviteCode: "ZZZ999" });
    expect(screen.getByText(label("teams.settingsTab.inviteCodeTitle"))).toBeTruthy();
    expect(screen.getByText("ZZZ999")).toBeTruthy();
    // 文字サイズ縮小に伴いコピーボタンは**アイコンのみ**になった
    // (ラベルは accessibilityLabel。RN モックは Pressable の accessibilityLabel を
    //  aria-label に変換しないため、role+name では引けない)。
    // アイコンの存在ではなく **押せるボタンであること**まで見る
    const copyIcon = screen.getByTestId("icon-clipboard");
    expect(copyIcon.closest("button"), "コピーボタンが押せる要素になっていない").not.toBeNull();
  });

  // ===========================================================================
  // [V-A51/A52/A54] 出し分けは **管理者ビュートグル連動** (ユーザー指示で変更)
  //
  // 🚨 **必ず ON/OFF の対で書くこと。** 「利用者ビューで出ない」だけを書くと、
  // 常時非表示の実装 (= 管理者でも永久に編集・削除できない) でも緑になる。
  // 逆に「管理者ビューで出る」だけでは、権限基準へ戻す退行を検出できない。
  // ===========================================================================
  it("[V-A51/A52] 利用者ビュー (isAdminView=false) では「編集」「チームを削除」が出ない", () => {
    renderTab({ isAdminView: false, members: [makeMember("me", "admin"), makeMember("u1", "user")] });

    expect(screen.queryByText(label("teams.settingsTab.editTeamInfo"))).toBeNull();
    expect(screen.queryByText(label("teams.settingsTab.deleteTeam"))).toBeNull();
  });

  it("[V-A54] 対照: 管理者ビュー (isAdminView=true) では「編集」「チームを削除」が出る", () => {
    // ⚠️ members は上のケースと**同一**。差分は isAdminView だけ。
    // これにより「ビューに連動している」ことが確定する (権限や人数の副作用ではない)
    renderTab({ isAdminView: true, members: [makeMember("me", "admin"), makeMember("u1", "user")] });

    expect(screen.getByText(label("teams.settingsTab.editTeamInfo"))).toBeTruthy();
    expect(screen.getByText(label("teams.settingsTab.deleteTeam"))).toBeTruthy();
  });

  it("[V-A53] 「チームを脱退」はビューに関わらず常に出る (全メンバーの操作)", () => {
    renderTab({ isAdminView: false });
    expect(screen.getByText(label("teams.settingsTab.leaveTeam"))).toBeTruthy();

    cleanup();

    renderTab({ isAdminView: true });
    expect(screen.getByText(label("teams.settingsTab.leaveTeam"))).toBeTruthy();
  });

  // 第3の対照: 非管理者に isAdminView=true が渡ること自体が無いことは
  // **親 (TeamDetailScreen) の責務**。`effectiveIsAdminView = isCurrentUserAdmin && isAdminView`
  // という AND が親側にあり、screens/__tests__/TeamDetailScreen.adminToggle.test.tsx が
  // 「非管理者ではトグル自体が出ない / 管理者要素が漏れない」を担保している。
  // このコンポーネント単体は **prop に忠実であること**だけを保証する (下の対照)。
  // ===========================================================================
  // [V-A55] コピーボタンが**実際に機能する**こと
  //
  // 🚨 旧版はクリックするだけで**クリック後の assert が1つも無く**、
  //    `onPress` が未配線でも緑になっていた (コメントには「押すと出るところまで
  //    確認する」と書いてあったのに実装されていなかった)。
  //    しかもこの箇所は実機でも目視が取れていない (アイコンが 14px + padding 4 と
  //    小さく座標タップが当たらない / 表示が2秒で消えて録画に写らない) ため、
  //    **自動テストにも実機にも穴が開いていた**。ここは実アサーションで塞ぐ。
  // ===========================================================================
  it("[V-A55] コピーボタンを押すとクリップボードへ書き込み「コピーしました」が出る", async () => {
    renderTab({ isAdminView: false, inviteCode: "ZZZ999" });

    expect(screen.getByText("ZZZ999")).toBeTruthy();
    // 押す前は出ていないこと (最初から出ていたら以下の assert は無意味)
    expect(screen.queryByText(label("teams.settingsTab.copied"))).toBeNull();

    const copyButton = screen.getByTestId("icon-clipboard").closest("button");
    expect(copyButton, "コピーボタンが押せる要素になっていない").not.toBeNull();

    await act(async () => {
      fireEvent.click(copyButton!);
    });

    // ① クリップボードへ **招待コードそのもの** が渡る (別の値を渡す退行を検出)
    expect(mocks.copyTextToClipboard).toHaveBeenCalledTimes(1);
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith("ZZZ999");

    // ② 成功フィードバックが出る
    expect(screen.getByText(label("teams.settingsTab.copied"))).toBeTruthy();
    // ③ 失敗文言は出ない
    expect(screen.queryByText(label("teams.mobile.copyFailed"))).toBeNull();
  });

  /**
   * [V-A55] 「コピーしました」が**アイコンの右**に出ること。
   *
   * ⚠️ **jsdom で保証できるのは DOM 上の所属と前後関係だけ**。
   * 実際に横並びになるかは `inviteCodeRow` の `flexDirection: "row"` が効くかどうかで、
   * jsdom は Flexbox を解決しないため**原理的に検証できない**。
   * ここでは「同じ行コンテナの中にあり、コピーボタンより**後ろ**」= 下に積まれていない、
   * までを固定する (下に出す実装にすると別の親 View に移るか順序が変わる)。
   * 実機での見た目の最終確認は別途必要 (最終報告に未確認として明記)。
   */
  it("[V-A55] 「コピーしました」はコピーボタンと同じ行にあり、ボタンより後ろに置かれる", async () => {
    renderTab({ isAdminView: false, inviteCode: "ZZZ999" });

    const copyButton = screen.getByTestId("icon-clipboard").closest("button")!;
    const row = copyButton.parentElement!;
    // 前提: 招待コードの値も同じ行にある (行コンテナを取り違えていないことの担保)
    expect(row.textContent).toContain("ZZZ999");

    await act(async () => {
      fireEvent.click(copyButton);
    });

    const message = screen.getByText(label("teams.settingsTab.copied"));
    // 同じ行コンテナの中にある (下に積まれて別の行になっていない)
    expect(row.contains(message)).toBe(true);

    // 並び順: コピーボタン → メッセージ (= 右側)
    const children = Array.from(row.children);
    const buttonIndex = children.findIndex((el) => el === copyButton || el.contains(copyButton));
    const messageIndex = children.findIndex((el) => el === message || el.contains(message));
    expect(buttonIndex).toBeGreaterThanOrEqual(0);
    expect(messageIndex).toBeGreaterThan(buttonIndex);
  });

  it("[V-A55] コピーに失敗したときは失敗文言を出し、成功文言は出さない", async () => {
    mocks.copyTextToClipboard.mockResolvedValueOnce(false);
    renderTab({ isAdminView: false, inviteCode: "ZZZ999" });

    await act(async () => {
      fireEvent.click(screen.getByTestId("icon-clipboard").closest("button")!);
    });

    expect(screen.getByText(label("teams.mobile.copyFailed"))).toBeTruthy();
    expect(screen.queryByText(label("teams.settingsTab.copied"))).toBeNull();
  });

  it("[V-A55 境界] 招待コードが null のときもクラッシュせず招待コードセクションは出る", () => {
    renderTab({ isAdminView: false, inviteCode: null });
    expect(screen.getByText(label("teams.settingsTab.inviteCodeTitle"))).toBeTruthy();
  });

  it("[V-A50] チーム名と説明が表示される", () => {
    renderTab({ isAdminView: false, teamName: "スイムクラブ東京", teamDescription: "毎週火木" });
    expect(screen.getByText("スイムクラブ東京")).toBeTruthy();
    expect(screen.getByText("毎週火木")).toBeTruthy();
  });
});

describe("[V-A56/A57] 最後の管理者の脱退ブロック (PM 裁定 C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Alert.alert = vi.fn();
  });

  /**
   * 「脱退処理に進んだか」の判定。
   *
   * 脱退に確認ダイアログ (Alert.alert) を挟むかどうかは実装の裁量なので、
   * ここでは「API を直接呼んだ」か「確認ダイアログを出した」かのどちらかを
   * 進行とみなす。**ブロック側 ([V-A56]) はどちらも起きないことを要求する** —
   * PM 裁定 C のガードは確認ダイアログより **前** に効かせること
   * (確認の後ろに置くと「はい」を押した瞬間に脱退が成立してしまう)。
   */
  const didProceedToLeave = (): boolean =>
    mocks.leaveMutateAsync.mock.calls.length > 0 ||
    (Alert.alert as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0;

  it("[V-A56] 自分が最後の管理者で他メンバーが残るとき、脱退処理に進まずエラー文言が出る", async () => {
    renderTab({
      isAdminView: true,
      members: [makeMember("me", "admin"), makeMember("u1", "user"), makeMember("u2", "user")],
    });

    fireEvent.click(screen.getByText(label("teams.settingsTab.leaveButton")));

    expect(
      await screen.findByText(label("teams.settingsTab.lastAdminCannotLeave")),
    ).toBeTruthy();
    // 「押したあと失敗させる」のではなく「そもそも進まない」こと。
    // DB 側にこのガードは無いため、確認ダイアログまで進めた時点で脱退は成立しうる
    expect(mocks.leaveMutateAsync).not.toHaveBeenCalled();
    expect(didProceedToLeave()).toBe(false);
  });

  it("[V-A57] 対照: 管理者がもう一人居れば同じ操作で脱退処理に進む", () => {
    renderTab({
      isAdminView: true,
      members: [makeMember("me", "admin"), makeMember("a2", "admin"), makeMember("u1", "user")],
    });

    fireEvent.click(screen.getByText(label("teams.settingsTab.leaveButton")));

    expect(screen.queryByText(label("teams.settingsTab.lastAdminCannotLeave"))).toBeNull();
    expect(didProceedToLeave()).toBe(true);
  });

  it("[V-A57 対照] 一般メンバーは管理者が1人でも脱退処理に進む", () => {
    renderTab({
      isAdminView: false,
      members: [makeMember("admin-1", "admin"), makeMember("me", "user")],
    });

    fireEvent.click(screen.getByText(label("teams.settingsTab.leaveButton")));

    expect(screen.queryByText(label("teams.settingsTab.lastAdminCannotLeave"))).toBeNull();
    expect(didProceedToLeave()).toBe(true);
  });

  /**
   * [V-A58] 削除失敗時、RPC の**機械可読コード**がそのまま画面に出ず、
   * 翻訳済みの文言に変換されること。
   *
   * deleteTeam は UserFacingError の message に `not_authorized` 等のコードを載せて
   * throw する (UserFacingError 本来の「そのまま表示してよい文言」とは異なる運用)。
   * UI が `toUserFacingMessage()` のような素通し表示をすると、ユーザーには
   * `not_authorized` という英小文字のコードが見える。
   * 変換は `getDeleteTeamErrorMessageKey()` が唯一の定義元
   * (対応表そのものの検証は shared の deleteTeamErrorMessageKey.test.ts が担当)。
   */
  it.each([
    ["not_authorized", "teams.settingsTab.deleteErrors.notAuthorized"],
    ["team_not_found", "teams.settingsTab.deleteErrors.teamNotFound"],
    ["auth_required", "teams.settingsTab.deleteErrors.authRequired"],
  ])(
    "[V-A58] 削除が %s で失敗したとき、コードではなく翻訳済み文言が表示される",
    async (code, expectedKey) => {
      mocks.deleteMutateAsync.mockRejectedValueOnce(new TeamOperationError(code));
      renderTab({ isAdminView: true, members: [makeMember("me", "admin")] });

      fireEvent.click(screen.getByText(label("teams.settingsTab.deleteButton")));

      // 確認ダイアログの destructive ボタンを実プロダクションコード経由で発火させる
      const alertCall = (Alert.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const buttons = alertCall[2] as { text: string; onPress?: () => void }[];
      const confirmButton = buttons.find((b) => b.onPress);
      expect(confirmButton, "確認ダイアログに実行ボタンが無い").toBeDefined();
      await act(async () => {
        confirmButton!.onPress!();
      });

      expect(await screen.findByText(label(expectedKey))).toBeTruthy();
      // 生のコードが画面に出ていないこと
      expect(screen.queryByText(code)).toBeNull();
    },
  );

  it("[V-A58] 未知のコードで失敗したときは汎用文言に落ちる", async () => {
    mocks.deleteMutateAsync.mockRejectedValueOnce(new TeamOperationError("some_new_code"));
    renderTab({ isAdminView: true, members: [makeMember("me", "admin")] });

    fireEvent.click(screen.getByText(label("teams.settingsTab.deleteButton")));
    const alertCall = (Alert.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const buttons = alertCall[2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.onPress)!.onPress!();
    });

    expect(await screen.findByText(label("teams.settingsTab.deleteFailed"))).toBeTruthy();
    expect(screen.queryByText("some_new_code")).toBeNull();
  });

  /**
   * [V-A59] 成功時の戻り値に `cleared_practice_count` (今回 RPC に増えたフィールド) が
   * 含まれていても経路が壊れないこと。
   * ⚠️ `deleteTeam` の戻り値は `void` なので、この件数は **UI には出ない**
   * (RPC は計算して返しているが消費者が居ない)。ここで固定するのは
   * 「フィールドが増えても削除完了の導線が通る」ことまで。
   */
  it("[V-A59] 削除成功時 (cleared_practice_count を含む戻り値) に onLeftTeam が呼ばれる", async () => {
    mocks.deleteMutateAsync.mockResolvedValueOnce(undefined);
    const onLeftTeam = vi.fn();
    renderTab({ isAdminView: true, members: [makeMember("me", "admin")], onLeftTeam });

    fireEvent.click(screen.getByText(label("teams.settingsTab.deleteButton")));
    const alertCall = (Alert.alert as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const buttons = alertCall[2] as { text: string; onPress?: () => void }[];
    await act(async () => {
      buttons.find((b) => b.onPress)!.onPress!();
    });

    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith("team-1");
    expect(onLeftTeam).toHaveBeenCalledTimes(1);
    // 失敗文言は出ない
    expect(screen.queryByText(label("teams.settingsTab.deleteFailed"))).toBeNull();
  });

  it("[V-A56 境界] 自分が唯一のメンバー (管理者) なら脱退できる", () => {
    renderTab({ isAdminView: true, members: [makeMember("me", "admin")] });

    fireEvent.click(screen.getByText(label("teams.settingsTab.leaveButton")));

    expect(screen.queryByText(label("teams.settingsTab.lastAdminCannotLeave"))).toBeNull();
    expect(didProceedToLeave()).toBe(true);
  });
});
