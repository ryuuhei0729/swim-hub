/**
 * MemberSelectModal (web, 共有基盤) — apps/web/components/team/MemberSelectModal.tsx
 *
 * [QA Sprint Contract Phase A → チップ化スプリント] Verification Checklist との対応:
 *   WV-01 (チップ表示) / WV-02 (全選択トグル・派生値) / WV-03 (グループミニトグル) /
 *   WV-08 (gender欠損時のフラットフォールバック) / WV-09 (onConfirm重複排除) /
 *   WV-12 (管理者バッジ同居) を参照。
 *
 * このモーダルは mobile 版 `apps/mobile/components/teams/MemberSelectModal.tsx` の
 * web 移植を検証する。PM 裁定 W1/W3 により、RecordClient/PracticeLogClient の
 * インライン実装 (checkbox) はこのファイルに統合される前提。
 * ここでは統合後の「共有基盤としての契約」だけを検証し、3画面固有の配線
 * (excludeNonSwimmers の適用箇所等) は各画面のテストファイル側で検証する。
 *
 * 【契約 (QA が Sprint Contract として確定する MemberSelectModal の外部インターフェース)】
 *   - props: { isOpen, teamId, supabase, members: MemberSelectOption[], selectedUserIds,
 *             onConfirm: (userIds: string[]) => void, onCancel, title?,
 *             extraAction?: { label: string; onClick: () => void; disabled?: boolean } }
 *     (extraAction は PracticeLogClient 専用の「出席者のみ」ボタンを収容する任意枠。W6)
 *   - `MemberSelectOption` は `gender?: number` を追加で持ちうる (グルーピング用)
 *   - グルーピングは modal 内部で `useMemberGroupSort(teamId, supabase)` を呼び、
 *     `MemberGroupSorter` (カテゴリピル) をそのまま流用する (mobile の
 *     TeamMemberGroupFilter 内蔵パターンと対称)
 *   - チップ本体は `<button type="button" aria-pressed={isSelected}>` (既存の
 *     StyleChipSelector/SelectChips と同じ aria-pressed 規約)。管理者バッジは
 *     チップ内の兄弟要素として同居してよい (accessible name の完全一致には依存しない
 *     テスト設計にしてあるため、バッジ同居で壊れない)
 *   - グループ見出しを持つセクションは `data-testid="member-select-group-<groupName>"`
 *     でラップされる (テスト容易性のための最小限のフック。mobile はネイティブ実装のため
 *     このテスト容易性フックは web 固有の追加契約)
 *   - グルーピング無効/フォールバック時は見出し無しの単一セクション (グローバル
 *     「全選択」トグルのみ) になる
 *
 * 【トートロジー防止】
 *   - 選択状態の判定は `aria-pressed` 属性のみで行い、実装の条件式を
 *     テスト内に再実装しない
 *   - 色 (白/青) は jsdom では実測できないため、本ファイルでは検証しない
 *     (aria-pressed の真偽のみが検証対象。詳細は QA 報告を参照)
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import MemberSelectModal, {
  type MemberSelectOption,
} from "../../../components/team/MemberSelectModal";

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
  };
});

// useMemberGroupSort が内部で叩く TeamGroupsAPI をネットワーク丸ごとモックする。
// GENDER_CATEGORY (既定カテゴリ) の分類は members.users.gender だけで完結するため、
// このモックが解決を待たなくても [V-...] のテストは同期的に成立する。
vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockResolvedValue([]),
    listAllMemberships: vi.fn().mockResolvedValue([]),
  })),
}));

const dummySupabase = {} as unknown as SupabaseClient;

const members: MemberSelectOption[] = [
  { user_id: "user-1", role: "admin", name: "監督", gender: 0 },
  { user_id: "user-2", role: "user", name: "選手A", gender: 0 },
  { user_id: "user-3", role: "user", name: "選手B", gender: 1 },
] as unknown as MemberSelectOption[];

/** メンバー名を含むチップボタンを textContent の部分一致で特定する
 *  (管理者バッジが同居しても accessible name の完全一致に依存しないため。
 *   mobile版 MemberSelectModal.adminBadgeAndFlatFallback.test.tsx と同じ設計方針) */
function findChipButtonByMemberName(name: string): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const found = buttons.find((b) => (b.textContent ?? "").includes(name) && b !== null);
  if (!found) {
    throw new Error(`メンバー名 "${name}" を含むチップボタンが見つからない`);
  }
  return found;
}

function renderModal(
  overrides: Partial<React.ComponentProps<typeof MemberSelectModal>> = {},
) {
  return render(
    <MemberSelectModal
      isOpen
      teamId="team-1"
      supabase={dummySupabase}
      members={members}
      selectedUserIds={[]}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe("MemberSelectModal (web, 共有基盤) — チップ化後の契約", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "[WV-01] チームメンバーが選択チップ (button, aria-pressed) として表示される" +
      "（人間の意図: checkbox一覧をチップグリッドに置き換える。チップの初期状態は未選択）",
    () => {
      renderModal();

      const taroChip = findChipButtonByMemberName("監督");
      const aChip = findChipButtonByMemberName("選手A");
      const bChip = findChipButtonByMemberName("選手B");

      expect(taroChip).toHaveAttribute("aria-pressed", "false");
      expect(aChip).toHaveAttribute("aria-pressed", "false");
      expect(bChip).toHaveAttribute("aria-pressed", "false");
    },
  );

  it(
    "[WV-01] チップをクリックすると aria-pressed が true になり、再クリックで false に戻る" +
      "（人間の意図: 個別選択のトグル操作）",
    () => {
      renderModal();

      const chip = findChipButtonByMemberName("選手A");
      fireEvent.click(chip);
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(findChipButtonByMemberName("選手A"));
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "false");
    },
  );

  it(
    "[WV-12] role==='admin' のメンバーのチップにのみ管理者バッジが表示される" +
      "（人間の意図: mobile版で撤去→復活した管理者バッジを web でも維持する。R9 相当）",
    () => {
      renderModal();

      const adminChip = findChipButtonByMemberName("監督");
      const userChip = findChipButtonByMemberName("選手A");

      expect(within(adminChip).queryByText("record.adminBadge")).not.toBeNull();
      expect(within(userChip).queryByText("record.adminBadge")).toBeNull();
    },
  );

  it(
    "[WV-20] 管理者チップは (1) accessible name がメンバー名のみ、(2) バッジ情報が" +
      "aria-hidden に頼らない sr-only 要素経由で AT に届き、(3) 可視バッジは二重読み上げ" +
      "防止のため aria-hidden のままである（人間の意図: 修正G。PM裁定 (Reviewer指摘) により" +
      "「aria-describedby が aria-hidden 要素を参照できる」という仕様上の例外規定" +
      "(VoiceOver+Safariで不安定と指摘) には依存しない設計に変更された。" +
      "検証すべきは『情報が届くか』『nameが汚染されないか』という意図であり、" +
      "『参照先にaria-hiddenが付いているか』という実装の仕組みそのものではない)",
    () => {
      renderModal();

      // (1) accessible name はメンバー名のみ。デフォルトの完全一致クエリで直接通ることが
      // バッジ同居でも name が汚染されていないことの直接証拠になる
      const adminChip = screen.getByRole("button", { name: "監督" });

      // (2) aria-describedby の参照先が存在し、正しいバッジ文言を含み、かつ
      // aria-hidden を持たない (例外規定に頼っていないことの確認)
      const describedBy = adminChip.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();

      const describedElements = describedBy!
        .split(" ")
        .map((id) => document.getElementById(id));
      const adminDescElement = describedElements.find(
        (el) => el?.textContent === "record.adminBadge",
      );
      expect(adminDescElement).toBeTruthy();
      expect(adminDescElement).not.toHaveAttribute("aria-hidden");

      // (3) 可視バッジ span (aria-hidden) は引き続きチップ内に存在する (二重読み上げ防止。
      // sr-only の説明要素とは別物であることを、aria-hidden 属性の有無で区別する)
      const visibleBadgeElements = Array.from(adminChip.querySelectorAll("span")).filter(
        (el) => el.textContent === "record.adminBadge",
      );
      expect(visibleBadgeElements.length).toBeGreaterThan(0);
      visibleBadgeElements.forEach((el) => {
        expect(el).toHaveAttribute("aria-hidden", "true");
      });
    },
  );

  it(
    "[空状態] 選手が0件のとき空状態が表示され、チップが1つも描画されない" +
      "（人間の意図: 空状態を必ず実装するという品質基準）",
    () => {
      renderModal({ members: [] });

      expect(screen.getByText("noMembersToSelect")).toBeInTheDocument();
      expect(screen.queryAllByRole("button", { name: /監督|選手/ })).toHaveLength(0);
    },
  );

  it(
    "[WV-02] 全選択トグルは派生値である: 全員選択済みのときだけ aria-pressed=true になり、" +
      "1人でも未選択なら false のまま（人間の意図: isAllSelected を独立 state で持つと" +
      "個別選択との不整合が起きる。派生値であることを外部から観測可能な形で固定する）",
    () => {
      renderModal();

      const globalToggle = screen.getByRole("button", { name: "record.selectAllToggle" });
      expect(globalToggle).toHaveAttribute("aria-pressed", "false");

      fireEvent.click(findChipButtonByMemberName("監督"));
      fireEvent.click(findChipButtonByMemberName("選手A"));
      // 選手Bはまだ未選択 → 全選択トグルはfalseのまま
      expect(screen.getByRole("button", { name: "record.selectAllToggle" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );

      fireEvent.click(findChipButtonByMemberName("選手B"));
      expect(screen.getByRole("button", { name: "record.selectAllToggle" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  );

  it(
    "[WV-02] 全選択トグルを押すと全員選択、もう一度押すと全員解除される" +
      "（人間の意図: 押下は isAllSelected ? 全解除 : 全選択、というPM裁定W11の仕様）",
    () => {
      renderModal();

      const globalToggle = () => screen.getByRole("button", { name: "record.selectAllToggle" });

      fireEvent.click(globalToggle());
      expect(findChipButtonByMemberName("監督")).toHaveAttribute("aria-pressed", "true");
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "true");
      expect(findChipButtonByMemberName("選手B")).toHaveAttribute("aria-pressed", "true");
      expect(globalToggle()).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(globalToggle());
      expect(findChipButtonByMemberName("監督")).toHaveAttribute("aria-pressed", "false");
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "false");
      expect(findChipButtonByMemberName("選手B")).toHaveAttribute("aria-pressed", "false");
    },
  );

  it(
    "[WV-03] 性別グルーピングの見出しごとにミニ全選択トグルがあり、そのグループ内だけを" +
      "全選択/全解除する（人間の意図: 他グループの選択状態を変えないこと。PM裁定W11)",
    () => {
      renderModal();

      const maleGroup = screen.getByTestId("member-select-group-male");
      const femaleGroup = screen.getByTestId("member-select-group-female");

      const maleToggle = within(maleGroup).getByRole("button", {
        name: "record.selectAllToggleGroup",
      });
      fireEvent.click(maleToggle);

      // male グループ (監督・選手A) だけが選択され、female (選手B) は変わらない
      expect(findChipButtonByMemberName("監督")).toHaveAttribute("aria-pressed", "true");
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "true");
      expect(findChipButtonByMemberName("選手B")).toHaveAttribute("aria-pressed", "false");

      // female 側のミニトグルはまだ false のまま (対照)
      const femaleToggle = within(femaleGroup).getByRole("button", {
        name: "record.selectAllToggleGroup",
      });
      expect(femaleToggle).toHaveAttribute("aria-pressed", "false");
    },
  );

  it(
    "[WV-08] gender が全メンバー欠損 (undefined) のとき、グルーピングを諦めてフラット表示に" +
      "フォールバックする（人間の意図: PM裁定W10。groupMembers が空配列を返す経路で" +
      "チップが無言で全消失しないこと。グループ見出し・ミニトグルは1つも出ず、" +
      "全選択トグルはグローバルの1つだけになる）",
    () => {
      const genderlessMembers = [
        { user_id: "user-1", role: "user", name: "太郎" },
        { user_id: "user-2", role: "user", name: "次郎" },
      ] as unknown as MemberSelectOption[];

      renderModal({ members: genderlessMembers });

      // フラット表示でもチップ自体は消えない (無言消失の回帰防止)
      expect(findChipButtonByMemberName("太郎")).toBeInTheDocument();
      expect(findChipButtonByMemberName("次郎")).toBeInTheDocument();

      // グループ見出し用のミニトグルは存在しない。「全選択」ボタンはグローバルの1つだけ
      expect(screen.getAllByRole("button", { name: "record.selectAllToggle" })).toHaveLength(1);
      expect(
        screen.queryAllByRole("button", { name: "record.selectAllToggleGroup" }),
      ).toHaveLength(0);
      expect(screen.queryByTestId(/member-select-group-/)).not.toBeInTheDocument();
    },
  );

  it(
    "[WV-09] 個別選択とグループ全選択が重なっても、onConfirm に渡る配列に重複 user_id が" +
      "含まれない（人間の意図: PM裁定W11。mobileで重複発生経路が実際に見つかったための" +
      "回帰防止）",
    () => {
      const onConfirm = vi.fn();
      renderModal({ onConfirm });

      // 選手A (male) を個別選択してから、male グループのミニトグルで再度全選択する
      // (選手Aが二重にpushされうる典型的な重複経路)
      fireEvent.click(findChipButtonByMemberName("選手A"));
      const maleGroup = screen.getByTestId("member-select-group-male");
      fireEvent.click(within(maleGroup).getByRole("button", { name: "record.selectAllToggleGroup" }));

      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const arg = onConfirm.mock.calls[0]![0] as string[];
      expect(new Set(arg).size).toBe(arg.length);
      expect(arg.sort()).toEqual(["user-1", "user-2"].sort());
    },
  );

  it(
    "[WV-09b] 呼び出し元が渡す selectedUserIds 自体に重複 user_id が含まれていても、" +
      "何もクリックせずに『決定』を押した時点の出力に重複が残らない（人間の意図: " +
      "モーダル内部の個別トグル/グループトグルは Set 経由でしか状態を書き換えないため、" +
      "現状は内部操作だけで重複は作れない。実際に重複が紛れ込みうるのは呼び出し元の" +
      "selectedUserIds prop 自体 [例: 上位の memberRecords 側に同一 user_id が二重登録される" +
      "不具合] であり、onConfirm 直前の最終 dedup がその最後の防波堤になっていることを" +
      "直接実証する)",
    () => {
      const onConfirm = vi.fn();
      renderModal({ onConfirm, selectedUserIds: ["user-1", "user-1", "user-2"] });

      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      const arg = onConfirm.mock.calls[0]![0] as string[];
      expect(new Set(arg).size).toBe(arg.length);
      expect(arg.sort()).toEqual(["user-1", "user-2"].sort());
    },
  );

  it(
    "[決定] 『決定』ボタンを押すと選択中のuser_id配列がonConfirmに渡される（人間の意図: " +
      "呼び出し元3画面 [EntriesClient/RecordClient/PracticeLogClient] が共通で受け取る契約)",
    () => {
      const onConfirm = vi.fn();
      renderModal({ selectedUserIds: ["user-1"], onConfirm });

      fireEvent.click(findChipButtonByMemberName("選手A"));
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      expect(onConfirm).toHaveBeenCalledWith(expect.arrayContaining(["user-1", "user-2"]));
    },
  );

  it(
    "[キャンセル] モーダルを閉じても（キャンセルしても）onConfirmは呼ばれない（人間の意図: " +
      "誤操作で意図しない選手が対象になったまま確定されることを防ぐ）",
    () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      renderModal({ onConfirm, onCancel });

      fireEvent.click(findChipButtonByMemberName("選手A"));
      fireEvent.click(screen.getByRole("button", { name: "record.cancelButton" }));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    },
  );

  it(
    "[isOpen] isOpen=false のときは何も描画しない（人間の意図: BaseModal共通契約）",
    () => {
      renderModal({ isOpen: false });

      expect(screen.queryByText("監督")).not.toBeInTheDocument();
    },
  );

  it(
    "[再同期] モーダルが再度開かれたとき、呼び出し元の最新の selectedUserIds に選択状態が" +
      "同期される（人間の意図: 行削除等で選択が変わった後、再オープン時に古い選択が" +
      "残らないこと）",
    () => {
      const { rerender } = render(
        <MemberSelectModal
          isOpen={false}
          teamId="team-1"
          supabase={dummySupabase}
          members={members}
          selectedUserIds={["user-1"]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      rerender(
        <MemberSelectModal
          isOpen
          teamId="team-1"
          supabase={dummySupabase}
          members={members}
          selectedUserIds={["user-2", "user-3"]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(findChipButtonByMemberName("監督")).toHaveAttribute("aria-pressed", "false");
      expect(findChipButtonByMemberName("選手A")).toHaveAttribute("aria-pressed", "true");
      expect(findChipButtonByMemberName("選手B")).toHaveAttribute("aria-pressed", "true");
    },
  );

  it(
    "[WV-06 extraAction] extraAction が渡されると追加アクションボタンが表示され、" +
      "クリックすると渡されたコールバックが呼ばれる（人間の意図: PracticeLogClient専用の" +
      "『出席者のみ』ボタンを共有モーダルが機能を落とさず収容できること。PM裁定W6）",
    () => {
      const onExtraAction = vi.fn();
      renderModal({
        extraAction: { label: "practiceLog.selectPresentButton", onClick: onExtraAction },
      });

      const btn = screen.getByRole("button", { name: "practiceLog.selectPresentButton" });
      fireEvent.click(btn);
      expect(onExtraAction).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "[WV-06 extraAction 対照] extraAction を渡さない (EntriesClient/RecordClient の使い方) " +
      "場合は追加アクションボタンが描画されない（人間の意図: PracticeLogClient専用機能が" +
      "他2画面に漏れ出さないこと）",
    () => {
      renderModal();

      expect(
        screen.queryByRole("button", { name: "practiceLog.selectPresentButton" }),
      ).not.toBeInTheDocument();
    },
  );
});
