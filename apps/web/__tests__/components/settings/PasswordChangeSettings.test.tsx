/**
 * PasswordChangeSettings コンポーネントテスト (Sprint Contract D2)
 *
 * D2: apps/web/components/settings/PasswordChangeSettings.tsx を新設し、
 * settings/_client/SettingsClient.tsx の IdentityLinkSettings 後・AccountDeleteSettings 前に
 * 組み込む。手本 = components/settings/EmailChangeSettings.tsx (モーダル + updateUser 直呼び)。
 * バリデーションは mobile 準拠 (PasswordChangeModal.tsx): 新パスワード6文字以上 + 確認一致のみ
 * (signup 用の強度チェックは不使用)。i18n は既存 mypage.passwordChange.* を流用する。
 *
 * このテストは apps/mobile/components/profile/__tests__/PasswordChangeModal.test.tsx の
 * 観点をそのまま web 版に移植したものであり、Developer の実装をコピーしたものではない
 * (mobile 側の既存実装パターンを Sprint Contract が「手本」として指定しているため、
 * 期待値はその手本から QA が独立に導出している)。
 *
 * Sprint Contract 検証観点:
 *   [V-D2-01] セクションが閉じた状態で表示され、ボタン押下でモーダルが開く
 *   [V-D2-02] 新パスワード/確認パスワードの2欄に入力できる
 *   [V-D2-03] 境界値: 6文字未満は送信できない (disabled or エラー)
 *   [V-D2-03b] 境界値: ちょうど6文字なら送信可能
 *   [V-D2-04] 不一致の場合は送信できない、またはエラーメッセージが表示される
 *   [V-D2-05] 正常系: supabase.auth.updateUser({ password }) が呼ばれ、成功メッセージが表示される
 *   [V-D2-06] 異常系: updateUser がエラーを返すと失敗メッセージが表示され、モーダルは閉じない
 *   [V-D2-07] キャンセル/閉じるボタンでモーダルが閉じ、次回オープン時に入力値がリセットされる
 *
 * 【jsdom 描画リスクに関するメモ】
 * EmailChangeSettings 系のモーダルは react-query を使わない単純な useState 実装であり、
 * jsdom で問題なくレンダリング可能 (react-query + supabase-ssr の組み合わせハングは無関係)。
 * ただし useAuth() から取得する supabase.auth.updateUser を呼ぶため @/contexts をモックする。
 *
 * NOTE: PasswordChangeSettings.tsx は D2 未実装のため、このテストは import 解決の時点で
 * 失敗する (期待された赤テスト)。Developer 実装後、パス/セレクタの調整が必要な場合がある
 * (button 名・testID 等は Sprint Contract の意図を保ったまま調整可)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "swimmer@example.com" },
    supabase: {
      auth: {
        updateUser: mocks.updateUser,
      },
    },
  }),
}));

import PasswordChangeSettings from "@/components/settings/PasswordChangeSettings";

describe("PasswordChangeSettings (D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it("[V-D2-01] 初期表示はボタンのみで、押下するとモーダルが開く", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const openButton = screen.getByRole("button", { name: /パスワード/ });
    await user.click(openButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("[V-D2-03] 境界値: 6文字未満のパスワードは送信できない", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));

    const newPasswordInput = screen.getByLabelText(/新しいパスワード/);
    const confirmPasswordInput = screen.getByLabelText(/パスワード確認/);
    await user.type(newPasswordInput, "abc12"); // 5文字
    await user.type(confirmPasswordInput, "abc12");

    const submitButton = screen.getByRole("button", { name: "パスワードを更新" });
    expect(submitButton).toBeDisabled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("[V-D2-03b] 境界値: ちょうど6文字なら送信ボタンが有効になる", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));

    await user.type(screen.getByLabelText(/新しいパスワード/), "abc123");
    await user.type(screen.getByLabelText(/パスワード確認/), "abc123");

    expect(screen.getByRole("button", { name: "パスワードを更新" })).not.toBeDisabled();
  });

  it("[V-D2-04] パスワード不一致の場合は送信できない (disabled または送信ブロック)", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));

    await user.type(screen.getByLabelText(/新しいパスワード/), "password1");
    await user.type(screen.getByLabelText(/パスワード確認/), "password2");

    const submitButton = screen.getByRole("button", { name: "パスワードを更新" });
    if (!(submitButton as HTMLButtonElement).disabled) {
      await user.click(submitButton);
    }
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("[V-D2-05] 正常系: updateUser({ password }) が呼ばれ、成功メッセージが表示される", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));

    await user.type(screen.getByLabelText(/新しいパスワード/), "newpass123");
    await user.type(screen.getByLabelText(/パスワード確認/), "newpass123");
    await user.click(screen.getByRole("button", { name: "パスワードを更新" }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ password: "newpass123" }),
      );
    });
    expect(await screen.findByText("パスワードを正常に更新しました")).toBeInTheDocument();
  });

  it("[V-D2-06] 異常系: updateUser がエラーを返すと失敗メッセージが表示され、モーダルは閉じない", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { message: "invalid" } });
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));

    await user.type(screen.getByLabelText(/新しいパスワード/), "newpass123");
    await user.type(screen.getByLabelText(/パスワード確認/), "newpass123");
    await user.click(screen.getByRole("button", { name: "パスワードを更新" }));

    expect(await screen.findByText("パスワードの更新に失敗しました")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("[V-D2-07] キャンセルでモーダルが閉じ、再オープン時に入力がリセットされている", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeSettings />);
    await user.click(screen.getByRole("button", { name: /パスワード/ }));
    await user.type(screen.getByLabelText(/新しいパスワード/), "temporary");

    await user.click(screen.getByRole("button", { name: /キャンセル/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /パスワード/ }));
    expect((screen.getByLabelText(/新しいパスワード/) as HTMLInputElement).value).toBe("");
  });
});
