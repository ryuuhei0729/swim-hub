/**
 * DeleteConfirmModal テスト
 *
 * Sprint Contract 検証観点:
 *   [V-COMMON-01] 削除確認は window.confirm ではなく共通モーダルコンポーネントで行われる
 *   [V-COMMON-03] dashboard / practice / competition の3画面から共有される削除確認モーダルの
 *                 見た目・挙動 (確認/キャンセルボタンの発火先) が一致する
 *
 * トートロジー防止メモ:
 *   実装のコピーではなく「isOpen=false で非表示」「確認ボタンで onConfirm のみ発火」
 *   「キャンセルボタンで onCancel のみ発火」という仕様から導いた期待値を検証する。
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
});
