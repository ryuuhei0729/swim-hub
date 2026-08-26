/**
 * DeleteConfirmModal テスト
 *
 * Sprint Contract 検証観点:
 *   [V-COMMON-01] 削除確認は window.confirm ではなく共通モーダルコンポーネントで行われる
 *   [V-COMMON-03] dashboard / practice / competition の3画面から共有される削除確認モーダルの
 *                 見た目・挙動 (確認/キャンセルボタンの発火先) が一致する
 *   [V-04] extraMessage が指定されたときのみ追加警告文が表示され、未指定なら表示されない
 *          (「大会削除で records が消える件数警告」を汎用propとして共有コンポーネントに追加)
 *   [V-13] isConfirmDisabled=true のとき確認ボタンが無効化され、クリックしても onConfirm が
 *          呼ばれない (件数取得中の二重押下防止)
 *
 * トートロジー防止メモ:
 *   実装のコピーではなく「isOpen=false で非表示」「確認ボタンで onConfirm のみ発火」
 *   「キャンセルボタンで onCancel のみ発火」「extraMessage 未指定なら追加警告なし」という
 *   仕様から導いた期待値を検証する。extraMessage の実際の文言 (i18n 補間結果) は
 *   呼び出し元 (DayDetailModal/CompetitionDetailModal) の責務であり、このコンポーネントは
 *   「渡された文字列をそのまま出すか出さないか」だけを担う汎用 prop として検証する。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import { DeleteConfirmModal } from "@/components/ui/DeleteConfirmModal";

const renderWithIntl = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("DeleteConfirmModal", () => {
  it("isOpen=false のとき何も描画しない", () => {
    renderWithIntl(<DeleteConfirmModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("isOpen=true のとき確認ダイアログが表示される", () => {
    renderWithIntl(<DeleteConfirmModal isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-delete-button")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-delete-button")).toBeInTheDocument();
  });

  it("確認ボタンをクリックすると onConfirm のみが呼ばれ、onCancel は呼ばれない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithIntl(<DeleteConfirmModal isOpen={true} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByTestId("confirm-delete-button"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("キャンセルボタンをクリックすると onCancel のみが呼ばれ、onConfirm は呼ばれない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithIntl(<DeleteConfirmModal isOpen={true} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByTestId("cancel-delete-button"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("[V-04] extraMessage を指定しないとき、追加警告文は表示されない", () => {
    renderWithIntl(
      <DeleteConfirmModal isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.queryByTestId("delete-confirm-extra-message")).not.toBeInTheDocument();
  });

  it("[V-04] extraMessage を指定したとき、その文字列がそのまま追加警告として表示される", () => {
    // "1" のような部分文字列マッチしうる値を避け、判別可能な件数を含む文言にする
    const extraMessage = "この大会の記録7件も削除されます";
    renderWithIntl(
      <DeleteConfirmModal
        isOpen={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        extraMessage={extraMessage}
      />,
    );

    expect(screen.getByTestId("delete-confirm-extra-message")).toHaveTextContent(extraMessage);
  });

  it("[V-04] extraMessage が空文字のときは追加警告文が表示されない (0件相当のフォールバック)", () => {
    renderWithIntl(
      <DeleteConfirmModal isOpen={true} onConfirm={vi.fn()} onCancel={vi.fn()} extraMessage="" />,
    );

    expect(screen.queryByTestId("delete-confirm-extra-message")).not.toBeInTheDocument();
  });

  it("[V-13] isConfirmDisabled=true のとき確認ボタンは disabled になり、クリックしても onConfirm は呼ばれない", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithIntl(
      <DeleteConfirmModal
        isOpen={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isConfirmDisabled={true}
      />,
    );

    const confirmButton = screen.getByTestId("confirm-delete-button");
    expect(confirmButton).toBeDisabled();

    await user.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("[V-13] isConfirmDisabled を指定しない (デフォルト) とき確認ボタンは有効で、クリックで onConfirm が呼ばれる (回帰)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithIntl(<DeleteConfirmModal isOpen={true} onConfirm={onConfirm} onCancel={vi.fn()} />);

    const confirmButton = screen.getByTestId("confirm-delete-button");
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
