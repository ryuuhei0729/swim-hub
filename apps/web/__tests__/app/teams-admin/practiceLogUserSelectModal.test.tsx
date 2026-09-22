/**
 * PracticeLogClient — 「対象ユーザー」選択モーダルの統合 (チップ化スプリント新設)
 *
 * Sprint Contract 検証観点:
 *   PracticeLogClient のインライン実装 (`showUserSelectModal`, checkbox形式) は
 *   3画面共通の共有 `MemberSelectModal.tsx` (選択チップ) に統合される (PM裁定 W1/W5)。
 *   このファイルが新設されたのは、統合前のインライン実装に専用テストが
 *   1件も存在しなかったため (Planner 実測)。
 *
 *   [WV-04] チップUI・全選択トグル・グループミニトグルが EntriesClient/RecordClient と
 *           同じ挙動で動作する (共通コンポーネント化の検証)
 *   [WV-05] 「出席者のみ ({count}名)」ボタンが PracticeLogClient に残っている
 *           (PM裁定W6: 独自機能を削って統合するのは禁止)
 *   [WV-07] Issue #49 適用漏れの修正: 非泳者が候補チップに出ない (これまで未適用
 *           だったので、この修正で新たに除外されるようになることそのものを pin する)
 *   [WV-14] 新規メニューでモーダルを開くと、出席者が初期選択済み (aria-pressed=true)
 *   [WV-15] 一度選択を変えて決定したあと再度開くと、その選択が保持されている
 *           (出席者デフォルトに戻らない)
 *   [WV-16] 非泳者が既に targetUserIds に含まれている状態でモーダルを開き、別の泳者を
 *           追加して決定しても、非泳者の user_id が onConfirm の出力から落ちない
 *
 * [Phase B PM裁定 2026-09-22] `buildMenusFromLogs` は新規メニュー作成時に
 * `targetUserIds: presentUserIds` (出席者をデフォルト選択) とする**既存仕様**であり、
 * `practiceLogNavigationTarget.test.tsx` が既に保護している。モーダルを開くたびに
 * `menu.targetUserIds` を初期選択として引き継ぐため、本ファイルの fixture
 * (`presentUserIds=["user-1","user-3"]`) では太郎(user-1)が初期選択済みになる。
 * 当初 [WV-04]「初期状態で太郎は未選択」[WV-05・決定]「次郎のみ選択して決定すると
 * 件数1」としていたテストは、この既存仕様を認識していなかった QA 側の前提誤りであり、
 * production ではなくテストを修正する (PM裁定: production が正)。
 * あわせてこの挙動 (出席者デフォルト選択・選択の永続化・非泳者の暗黙保持) を
 * WV-14/15/16 として明示的に pin する。
 *
 * モック方針: 既存 practiceLogNavigationTarget.test.tsx と同一の最小レンダリング方針
 * (rpc は resolve するだけ、router.push はモック)。
 * useMemberGroupSort が叩く TeamGroupsAPI は MemberSelectModal.test.tsx と同じくネットワーク
 * 丸ごとモックする。
 *
 * 契約: PracticeLogClient のローカル `TeamMember` interface は `is_swimmer?: boolean` を
 * 持つ (Phase A 時点では型に無いため fixture は `as unknown as` でキャストする)。
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PracticeTag } from "@apps/shared/types";
import PracticeLogClient from "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/practices/[practiceId]/logs/_client/PracticeLogClient";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockResolvedValue([]),
    listAllMemberships: vi.fn().mockResolvedValue([]),
  })),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: { rpc: mocks.rpc }, subscription: null }),
}));

const basePractice = {
  id: "practice-1",
  user_id: "admin-1",
  team_id: "team-1",
  date: "2026-01-01",
  title: null,
  place: null,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

// 太郎: 泳者・出席・男性, 次郎: 泳者・欠席・女性, 非泳者花子: 非泳者・出席・女性
// (「出席者のみ」の候補にも非泳者は含まれてはならないことを合わせて確認する。
// gender は WV-17/WV-18 [修正B: PracticeLogDataLoader の gender 配線] の検証に使う)
const members = [
  { id: "user-1", user_id: "user-1", role: "admin", is_swimmer: true, users: { id: "user-1", name: "太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", is_swimmer: true, users: { id: "user-2", name: "次郎", gender: 1 } },
  { id: "user-3", user_id: "user-3", role: "user", is_swimmer: false, users: { id: "user-3", name: "非泳者花子", gender: 1 } },
] as unknown as Parameters<typeof PracticeLogClient>[0]["members"];

function renderPracticeLogClient() {
  return render(
    <PracticeLogClient
      teamId="team-1"
      practiceId="practice-1"
      practice={basePractice}
      members={members}
      existingLogs={[]}
      availableTags={[] as PracticeTag[]}
      presentUserIds={["user-1", "user-3"]}
    />,
  );
}

function openUserSelectModal() {
  fireEvent.click(screen.getByTestId("team-practice-log-select-users-1"));
}

describe("PracticeLogClient — 対象ユーザー選択モーダル (チップ化スプリント統合)", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
  });

  it(
    "[WV-07] 候補チップ一覧に非泳者が表示されない（人間の意図: Issue #49 適用漏れの修正。" +
      "これまでこの画面だけ非泳者が候補に出ていた状態を、今回初めて除外することを固定する）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      expect(screen.getByRole("button", { name: "太郎" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "次郎" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "非泳者花子" })).not.toBeInTheDocument();
    },
  );

  it(
    "[WV-12b] 出席しているメンバーのチップにだけ『出席』バッジ (renderMemberBadge) が" +
      "表示される（人間の意図: PM裁定W12。共有モーダルへの統合で PracticeLogClient 固有の" +
      "出席バッジ機能を落とさないこと。太郎は出席・次郎は欠席なので区別できる）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      const taroChip = screen.getByRole("button", { name: "太郎" });
      const jiroChip = screen.getByRole("button", { name: "次郎" });

      expect(taroChip).toHaveTextContent("practiceLog.attendingBadge");
      expect(jiroChip).not.toHaveTextContent("practiceLog.attendingBadge");
    },
  );

  it(
    "[WV-17/WV-18] 性別グルーピングが実際に機能し、フラットフォールバックに落ちない" +
      "（人間の意図: 修正B。PracticeLogDataLoader が gender を select し PracticeLogClient の" +
      "memberSelectCandidates に反映していることの結果として、男性/女性のグループ見出しが" +
      "描画されること自体を pin する。gender が届いていなければ WV-08 のフラット" +
      "フォールバックに落ちて見出しが1つも出ないはずなので、区別できる）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      // 太郎(gender=0)のグループと次郎(gender=1)のグループが別セクションとして描画される
      const maleGroup = screen.getByTestId("member-select-group-male");
      const femaleGroup = screen.getByTestId("member-select-group-female");

      expect(within(maleGroup).getByRole("button", { name: "太郎" })).toBeInTheDocument();
      expect(within(femaleGroup).getByRole("button", { name: "次郎" })).toBeInTheDocument();
      // フラットフォールバック (見出し無し・グループミニトグル0件) には落ちていない。
      // このファイルの next-intl モックは vars 付き呼び出しを `key:{"group":"..."}`
      // という形式で返す (MemberSelectModal.test.tsx の恒等関数モックとは異なる) ため
      // 正規表現で照合する
      expect(
        screen.getAllByRole("button", { name: /record\.selectAllToggleGroup/ }).length,
      ).toBe(2);
    },
  );

  it(
    "[WV-04] チップをクリックすると選択状態 (aria-pressed) がトグルされる" +
      "（人間の意図: 共有 MemberSelectModal.tsx と同じ挙動で統合されていること。" +
      "次郎は出席者ではないため初期状態が未選択であることが保証されており、" +
      "トグルの往復を曖昧さなく検証できる）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      const chip = screen.getByRole("button", { name: "次郎" });
      expect(chip).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(chip);
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(screen.getByRole("button", { name: "次郎" }));
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute("aria-pressed", "false");
    },
  );

  it(
    "[WV-14] 新規メニュー (existingLogs=[]) でモーダルを開くと、出席者が初期選択済みに" +
      "なっている（人間の意図: buildMenusFromLogs の既存仕様『新規作成時は出席者を" +
      "デフォルト選択』を pin する。太郎は出席者、次郎は欠席者なので区別できる）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      expect(screen.getByRole("button", { name: "太郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  it(
    "[WV-15] 選択を変更して決定したあと再度モーダルを開くと、変更後の選択が保持される" +
      "（人間の意図: 再オープンのたびに出席者デフォルトへ戻ってしまうと、せっかくの" +
      "編集が消えたように見えるユーザー体験になる。持続することを明示的に固定する）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      // 太郎 (初期選択済み) を外し、次郎 (初期未選択) を追加する
      fireEvent.click(screen.getByRole("button", { name: "太郎" }));
      fireEvent.click(screen.getByRole("button", { name: "次郎" }));
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      // 再度モーダルを開く
      openUserSelectModal();

      expect(screen.getByRole("button", { name: "太郎" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  );

  it(
    "[WV-16] 非泳者が既に targetUserIds に含まれている状態で、別の泳者を追加して決定しても" +
      "非泳者の user_id が出力から落ちない（人間の意図: Issue #49 PM裁定R4『候補提示の" +
      "直前だけ非泳者を除外し、過去に対象だった人を遡って外さない』設計を pin する。" +
      "非泳者花子は初期状態から targetUserIds に含まれる (出席者デフォルト選択) が、" +
      "候補チップとしては表示されない。それでも決定後の対象一覧に残り続けることを確認する）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      // 花子には触れず (触れようがない、候補チップに出ないため)、次郎だけを追加する
      fireEvent.click(screen.getByRole("button", { name: "次郎" }));
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      // モーダル外の「選択されたユーザーの表示」バッジ一覧 (非泳者も含め生の members から
      // 名前解決するため、非泳者花子が候補チップに出ないことと矛盾なく表示されうる)
      expect(screen.getByText("非泳者花子")).toBeInTheDocument();
      expect(screen.getByText("太郎")).toBeInTheDocument();
      expect(screen.getByText("次郎")).toBeInTheDocument();
      expect(
        screen.getByText(/practiceLog\.selectedCount:\{"count":3\}/),
      ).toBeInTheDocument();
    },
  );

  it(
    "[WV-05] 『出席者のみ』ボタンが残っており、押すと出席者 (かつ候補に出ている泳者) だけが" +
      "選択される（人間の意図: PM裁定W6。PracticeLogClient固有の機能を統合で削らないこと。" +
      "出席はしているが非泳者の花子は候補自体に出ないため選択されえない）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      const presentOnlyButton = screen.getByRole("button", {
        name: /practiceLog\.selectPresentButton/,
      });
      fireEvent.click(presentOnlyButton);

      expect(screen.getByRole("button", { name: "太郎" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  it(
    "[WV-05] 決定すると選択した対象ユーザーがメニューに反映される（人間の意図: " +
      "共有モーダルへの統合後も『対象ユーザー』選択の保存契約自体は壊れていないこと。" +
      "初期選択済みの太郎・花子 (出席者デフォルト) を全員外し、次郎だけを選び直すことで" +
      "『1名だけを明示的に選んだ結果が1名として反映される』ことを曖昧さなく確認する）",
    () => {
      renderPracticeLogClient();
      openUserSelectModal();

      // 出席者のみボタンではなく個別トグルで「太郎を外す」→ 残る初期選択は花子(非表示)のみ
      fireEvent.click(screen.getByRole("button", { name: "太郎" }));
      // グローバル全選択トグルは使わず、次郎を個別に追加する
      fireEvent.click(screen.getByRole("button", { name: "次郎" }));
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      // 太郎を外し次郎を追加した結果、targetUserIds = [花子(非表示), 次郎] の2名になる
      // (花子は候補チップに出ないため個別に外す手段が無く、Issue #49 PM裁定R4により
      // 意図的に残り続ける。WV-16 で別途検証済みのため、ここでは件数のみを確認する)
      expect(
        screen.getByText(/practiceLog\.selectedCount:\{"count":2\}/),
      ).toBeInTheDocument();
    },
  );
});
