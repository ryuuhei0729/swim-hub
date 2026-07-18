/**
 * PasswordChangeModal.test.tsx
 *
 * Sprint Contract (Bug2: パスワード変更モーダル input 非表示 (Android)) 検証観点:
 *
 * [D2] apps/mobile/components/profile/PasswordChangeModal.tsx の
 *      styles.body: { flex: 1 } を { flexGrow: 1, flexShrink: 1, minHeight: 0 } に変更する
 *      (ProfileEditModal.tsx の実績パターンと同一)。
 *
 * 重要な制約 (Phase A で確認済み・今回も変わらず):
 *   Android の View/ScrollView の flex レイアウト計算 (Yoga エンジン) の挙動は、
 *   jsdom (レイアウトエンジンを持たない DOM 実装) では再現できない。
 *   そのため [V-PW-01]/[V-PW-02] は「style オブジェクトの値が正しいこと」しか保証できず、
 *   実際に Android 上で input 欄が見える/入力できることの証明には *ならない*。
 *   → Bug2 の最終的な合否判定は Android 実機/エミュレータでの目視確認に依存する
 *     ([V-PW-Device] を参照。このテストファイルではカバーしない)。
 *
 * [V-PW-01] styles.body が旧来の { flex: 1 } 単体の形に戻っていないこと (退行防止)
 * [V-PW-02] styles.body が flexGrow: 1 / flexShrink: 1 / minHeight: 0 を持つこと (契約充足)
 * [V-PW-03〜06] 回帰: 入力・送信・バリデーション・close 動作
 *
 * トートロジー防止メモ:
 *   - 期待する style 値 { flexGrow: 1, flexShrink: 1, minHeight: 0 } は Sprint Contract
 *     (ProfileEditModal.tsx の実績パターン) を根拠に QA が独立に定義したものであり、
 *     Developer の diff をコピーしたものではない。
 *
 * Phase B 実装メモ・実施した修正:
 *   - Developer が実際に ScrollView へ testID="password-change-body-scroll" を付与したため
 *     (Sprint Contract の Should 項目が満たされた)、[V-PW-01]/[V-PW-02] を実際にレンダーして
 *     検証できる。react-native モック標準の ScrollView は style prop を破棄し
 *     { overflow: "auto" } に固定するため、このファイル内でのみ style をパススルーする
 *     ScrollView に上書きする (共有モック __mocks__/react-native.ts 自体は変更しない)。
 *   - testID は RN 標準では DOM に反映されないため、ローカルモックで data-testid に変換する。
 *   - 【発見した既存のテスト基盤ギャップ】共有モック __mocks__/react-native.ts の TextInput は
 *     onChangeText (RN 標準の変更コールバック) を DOM の onChange に橋渡ししていない
 *     (`{...props}` をそのまま <input> にスプレッドするだけで、onChangeText は未認識の prop として
 *     無視される)。このため fireEvent.change だけでは入力状態が更新されない。このファイル内でのみ
 *     TextInput もローカルに上書きし、onChangeText を onChange 経由で発火させる
 *     (共有モックは変更しない。他のテストファイルは影響を受けない)。
 *   - 【発見した実装の事実】送信ボタンの disabled 条件
 *     (`loading || newPassword.length < 6 || newPassword !== confirmPassword`) が、
 *     handleSubmit 内部の「一致しません」エラー分岐より先に UI 上で送信自体をブロックする。
 *     つまりパスワード不一致時にボタンをクリックしても handleSubmit 内の一致チェック分岐には
 *     到達しない (ボタンが disabled のため click イベント自体が発火しない)。これは D2 (style 修正)
 *     とは無関係の既存実装であり、今回のスコープ外の副次的な発見として QA レポートで Info 報告する。
 *     そのため [V-PW-04] は「ボタンが disabled になり送信自体ができないこと」を検証する形に調整した
 *     (実際に UI から到達可能な挙動のみを検証する)。
 */

import React from "react";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  alertFn: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    updatePassword: mocks.updatePassword,
  })),
}));

// ScrollView の style パススルー・TextInput の onChangeText 橋渡しをこのファイル内限定で上書きする。
// (共有モック __mocks__/react-native.ts 自体は変更しない。QA はテストファイルのみ編集可のため)
vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Alert: { alert: mocks.alertFn },
    ScrollView: ({
      children,
      style,
      testID,
      ...props
    }: {
      children?: React.ReactNode;
      style?: unknown;
      testID?: string;
    } & Record<string, unknown>) => {
      const processedStyle = Array.isArray(style)
        ? Object.assign({}, ...style.filter(Boolean))
        : style;
      return React.createElement(
        "div",
        { ...props, style: processedStyle, "data-testid": testID },
        children,
      );
    },
    TextInput: ({
      onChangeText,
      value,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

import { PasswordChangeModal } from "../PasswordChangeModal";

const NEW_PW_PLACEHOLDER = "新しいパスワード（6文字以上）";
const CONFIRM_PW_PLACEHOLDER = "パスワード確認";

describe("PasswordChangeModal — スタイル修正 (Bug2 D2)", () => {
  it(
    "[V-PW-01] styles.body が旧来の { flex: 1 } 単体の形に戻っていない (退行防止。" +
      "flex 単体指定だと Android 実機で input が隠れるバグが再発する)",
    () => {
      render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
      const scrollView = screen.getByTestId("password-change-body-scroll") as HTMLElement;
      // 旧実装は style={{flex:1}} のみで minHeight が存在しなかった。
      // minHeight が明示的に設定されていることをもって「単純な flex:1 に戻っていない」とみなす。
      expect(scrollView.style.minHeight).not.toBe("");
    },
  );

  it(
    "[V-PW-02] styles.body が flexGrow: 1 / flexShrink: 1 / minHeight: 0 を持つ " +
      "(ProfileEditModal.tsx の実績パターンと同一)",
    () => {
      render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
      const scrollView = screen.getByTestId("password-change-body-scroll") as HTMLElement;
      expect(scrollView.style.flexGrow).toBe("1");
      expect(scrollView.style.flexShrink).toBe("1");
      // jsdom の CSSOM は数値 0 の長さプロパティを単位なし "0" として正規化する
      // (ProfileEditModal.tsx / minHeight: 0 の意図通りの値であることに変わりはない)
      expect(scrollView.style.minHeight).toBe("0");
    },
  );
});

describe("PasswordChangeModal — 入力・送信 (回帰)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePassword.mockResolvedValue({ error: null });
  });

  it("[V-PW-03] 新しいパスワードと確認用パスワードの2欄に入力できる (回帰)", () => {
    render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
    const newPasswordInput = screen.getByPlaceholderText(NEW_PW_PLACEHOLDER) as HTMLInputElement;
    const confirmPasswordInput = screen.getByPlaceholderText(
      CONFIRM_PW_PLACEHOLDER,
    ) as HTMLInputElement;

    fireEvent.change(newPasswordInput, { target: { value: "newpass123" } });
    fireEvent.change(confirmPasswordInput, { target: { value: "newpass123" } });

    expect(newPasswordInput.value).toBe("newpass123");
    expect(confirmPasswordInput.value).toBe("newpass123");
  });

  it(
    "[V-PW-04] パスワードが一致しない場合、送信ボタンが disabled になり送信できない (回帰)",
    () => {
      render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
      fireEvent.change(screen.getByPlaceholderText(NEW_PW_PLACEHOLDER), {
        target: { value: "password1" },
      });
      fireEvent.change(screen.getByPlaceholderText(CONFIRM_PW_PLACEHOLDER), {
        target: { value: "password2" },
      });

      const submitButton = screen.getByText("パスワードを更新").closest("button") as
        | HTMLButtonElement
        | null;
      expect(submitButton?.disabled).toBe(true);
      expect(mocks.updatePassword).not.toHaveBeenCalled();
    },
  );

  it(
    "[V-PW-05] パスワードが6文字未満の場合、送信ボタンが disabled になり送信できない (境界値・回帰)",
    () => {
      render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
      const newPasswordInput = screen.getByPlaceholderText(NEW_PW_PLACEHOLDER) as HTMLInputElement;
      const confirmPasswordInput = screen.getByPlaceholderText(
        CONFIRM_PW_PLACEHOLDER,
      ) as HTMLInputElement;
      fireEvent.change(newPasswordInput, { target: { value: "abc12" } }); // 5文字
      fireEvent.change(confirmPasswordInput, { target: { value: "abc12" } });

      const submitButton = screen.getByText("パスワードを更新").closest("button") as
        | HTMLButtonElement
        | null;
      expect(submitButton?.disabled).toBe(true);
      expect(mocks.updatePassword).not.toHaveBeenCalled();
    },
  );

  it("[V-PW-05b] 6文字ちょうどのときは送信ボタンが disabled にならない (境界値)", () => {
    render(<PasswordChangeModal visible={true} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(NEW_PW_PLACEHOLDER), {
      target: { value: "abc123" }, // 6文字
    });
    fireEvent.change(screen.getByPlaceholderText(CONFIRM_PW_PLACEHOLDER), {
      target: { value: "abc123" },
    });

    const submitButton = screen.getByText("パスワードを更新").closest("button") as
      | HTMLButtonElement
      | null;
    expect(submitButton?.disabled).toBe(false);
  });

  it(
    "[V-PW-06] 更新成功後、成功メッセージが表示され2秒後にモーダルが閉じる (回帰)",
    async () => {
      vi.useFakeTimers();
      try {
        const onClose = vi.fn();
        render(<PasswordChangeModal visible={true} onClose={onClose} />);
        fireEvent.change(screen.getByPlaceholderText(NEW_PW_PLACEHOLDER), {
          target: { value: "newpass123" },
        });
        fireEvent.change(screen.getByPlaceholderText(CONFIRM_PW_PLACEHOLDER), {
          target: { value: "newpass123" },
        });

        await act(async () => {
          fireEvent.click(screen.getByText("パスワードを更新"));
        });

        expect(screen.getByText("パスワードを正常に更新しました")).toBeTruthy();
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => {
          vi.advanceTimersByTime(2000);
        });

        expect(onClose).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it(
    "[V-PW-06b] updatePassword がエラーを返した場合、失敗メッセージが表示され閉じない (回帰)",
    async () => {
      mocks.updatePassword.mockResolvedValueOnce({ error: { message: "invalid" } });
      const onClose = vi.fn();
      render(<PasswordChangeModal visible={true} onClose={onClose} />);
      fireEvent.change(screen.getByPlaceholderText(NEW_PW_PLACEHOLDER), {
        target: { value: "newpass123" },
      });
      fireEvent.change(screen.getByPlaceholderText(CONFIRM_PW_PLACEHOLDER), {
        target: { value: "newpass123" },
      });

      await act(async () => {
        fireEvent.click(screen.getByText("パスワードを更新"));
      });

      expect(screen.getByText("パスワードの更新に失敗しました")).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});
