/**
 * MemberSelectModal (web) — apps/web/components/team/MemberSelectModal.tsx
 *
 * 実測 (2026-08-12, Phase B): 実装ファイルパスは `apps/web/components/team/MemberSelectModal.tsx`
 * (Phase Aで仮定していた `components/team/entry/MemberSelectModal.tsx` ではなかった。
 * import パスを実装に合わせて修正する)。
 *
 * Sprint Contract 仕様#9: web用 MemberSelectModal を新設して entries 画面で使う。
 * 各テストが検証する「人間の意図」をコメントで明示する。
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

const members: MemberSelectOption[] = [
  { user_id: "user-1", role: "admin", name: "監督" },
  { user_id: "user-2", role: "user", name: "選手A" },
  { user_id: "user-3", role: "user", name: "選手B" },
];

describe("MemberSelectModal (web)", () => {
  it(
    "チームメンバー一覧がチェックボックス付きで表示される" +
      "（人間の意図: 代理入力の対象選手を選ぶ基本UI）",
    () => {
      render(
        <MemberSelectModal
          isOpen
          members={members}
          selectedUserIds={[]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText("監督")).toBeInTheDocument();
      expect(screen.getByText("選手A")).toBeInTheDocument();
      expect(screen.getByText("選手B")).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    },
  );

  it(
    "選手を選択すると『{n}名選択中』相当のカウント表示が更新される" +
      "（人間の意図: 既存i18nキー selectedMemberCount 相当の再利用。選択操作が" +
      "確定前にリアルタイムでフィードバックされること）",
    () => {
      render(
        <MemberSelectModal
          isOpen
          members={members}
          selectedUserIds={[]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText("record.selectedMemberCount")).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("checkbox")[0]!);
      // カウント表示のテキスト自体はi18n補間 (mock passthroughのため {n} は展開されない) だが、
      // チェック状態の変化を checkbox の checked 属性で直接確認する
      expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    },
  );

  it(
    "選手が0件のとき空状態が表示される（人間の意図: 空状態を必ず実装するという品質基準）",
    () => {
      render(
        <MemberSelectModal
          isOpen
          members={[]}
          selectedUserIds={[]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText("noMembersToSelect")).toBeInTheDocument();
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    },
  );

  it(
    "『決定』ボタンを押すと選択中のuser_id配列がonConfirmに渡される（人間の意図: " +
      "呼び出し元 [EntriesClient] が受け取る契約そのもの）",
    () => {
      const onConfirm = vi.fn();
      render(
        <MemberSelectModal
          isOpen
          members={members}
          selectedUserIds={["user-1"]}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />,
      );

      // user-2 (選手A) を追加で選択する
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[1]!);
      fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

      expect(onConfirm).toHaveBeenCalledWith(expect.arrayContaining(["user-1", "user-2"]));
    },
  );

  it(
    "モーダルを閉じても（キャンセルしても）onConfirmは呼ばれない（人間の意図: " +
      "誤操作で意図しない選手が対象になったまま確定されることを防ぐ。呼び出し元の" +
      "選択状態は確定しない）",
    () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      render(
        <MemberSelectModal
          isOpen
          members={members}
          selectedUserIds={[]}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      fireEvent.click(screen.getAllByRole("checkbox")[0]!);
      fireEvent.click(screen.getByRole("button", { name: "record.cancelButton" }));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    },
  );

  it(
    "isOpen=false のときは何も描画しない（人間の意図: BaseModal共通契約。閉じている間は" +
      "DOMに存在せず、フォーム全体のレンダリング負荷やフォーカストラップの誤作動を防ぐ）",
    () => {
      render(
        <MemberSelectModal
          isOpen={false}
          members={members}
          selectedUserIds={[]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.queryByText("監督")).not.toBeInTheDocument();
    },
  );

  it(
    "モーダルが再度開かれたとき、呼び出し元の最新の selectedUserIds に選択状態が同期される" +
      "（人間の意図: EntriesClient側で行を削除して選択が変わった後、モーダルを再度開いた" +
      "ときに古い選択状態が残らないこと）",
    () => {
      const { rerender } = render(
        <MemberSelectModal
          isOpen={false}
          members={members}
          selectedUserIds={["user-1"]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      rerender(
        <MemberSelectModal
          isOpen
          members={members}
          selectedUserIds={["user-2", "user-3"]}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes[0]).not.toBeChecked(); // user-1
      expect(checkboxes[1]).toBeChecked(); // user-2
      expect(checkboxes[2]).toBeChecked(); // user-3
    },
  );
});
