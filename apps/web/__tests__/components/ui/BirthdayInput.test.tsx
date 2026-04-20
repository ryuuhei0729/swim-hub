/**
 * BirthdayInput ユニットテスト
 *
 * Sprint Contract 検証観点:
 *   [A] レイアウト: 3 フィールドすべてが可視状態
 *   [B] 年入力: 4 桁目入力後に月フィールドへ自動フォーカス
 *   [C] 月入力: "2" で日へフォーカス移動、"1" で移動しない、"12" で移動
 *   [D] 日入力: 2 桁で止まる (自動フォーカス移動なし)
 *   [E] Backspace: 月/日フィールドで空のまま Backspace → 前フィールドへフォーカス
 *   [F] バリデーション: 存在しない日付で「存在しない日付です」エラー
 *   [G] 年齢範囲: 1900 未満または maxYear 超で範囲エラー
 *   [H] ISO 読み込み: "1990-03-15" が年=1990、月=3、日=15 に分解される
 *   [J] アクセシビリティ: fieldset/legend + aria-label
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BirthdayInput from "../../../components/ui/BirthdayInput";

describe("BirthdayInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // [A] レイアウト: 3 フィールドが存在する
  // ---------------------------------------------------------------------------
  describe("[A] レイアウト", () => {
    it("年・月・日の 3 フィールドがすべて表示される", () => {
      render(<BirthdayInput onChange={vi.fn()} />);
      expect(screen.getByRole("textbox", { name: "生年" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "生月" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "生日" })).toBeInTheDocument();
    });

    it("label prop が指定されると legend として表示される", () => {
      render(<BirthdayInput label="生年月日" onChange={vi.fn()} />);
      expect(screen.getByText("生年月日")).toBeInTheDocument();
    });

    it("required 付きで必須マーカー '*' が表示される", () => {
      render(<BirthdayInput label="生年月日" required onChange={vi.fn()} />);
      expect(screen.getByText("*")).toBeInTheDocument();
    });

    it("fieldset/legend の DOM 構造が存在する", () => {
      const { container } = render(<BirthdayInput label="生年月日" onChange={vi.fn()} />);
      expect(container.querySelector("fieldset")).toBeInTheDocument();
      expect(container.querySelector("legend")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // [J] アクセシビリティ
  // ---------------------------------------------------------------------------
  describe("[J] アクセシビリティ", () => {
    it("年フィールドに aria-label='生年' が付与されている", () => {
      render(<BirthdayInput onChange={vi.fn()} />);
      expect(screen.getByRole("textbox", { name: "生年" })).toHaveAttribute("aria-label", "生年");
    });

    it("月フィールドに aria-label='生月' が付与されている", () => {
      render(<BirthdayInput onChange={vi.fn()} />);
      expect(screen.getByRole("textbox", { name: "生月" })).toHaveAttribute("aria-label", "生月");
    });

    it("日フィールドに aria-label='生日' が付与されている", () => {
      render(<BirthdayInput onChange={vi.fn()} />);
      expect(screen.getByRole("textbox", { name: "生日" })).toHaveAttribute("aria-label", "生日");
    });

    it("エラー時に aria-invalid が true になる", async () => {
      render(
        <BirthdayInput
          onChange={vi.fn()}
          value="1990-02-30"
        />,
      );
      // value が存在しない日付 → internalError がセットされる
      await waitFor(() => {
        const yearInput = screen.getByRole("textbox", { name: "生年" });
        expect(yearInput).toHaveAttribute("aria-invalid", "true");
      });
    });

    it("外部 error prop 時に aria-invalid が true になる", () => {
      render(<BirthdayInput onChange={vi.fn()} error="外部エラー" />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      expect(yearInput).toHaveAttribute("aria-invalid", "true");
    });
  });

  // ---------------------------------------------------------------------------
  // [B] 年入力: 4 桁で月フィールドへ自動フォーカス
  // ---------------------------------------------------------------------------
  describe("[B] 年入力 自動フォーカス", () => {
    it("年フィールドに 4 桁入力後、月フィールドがフォーカスされる", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      await user.click(yearInput);
      await user.type(yearInput, "1990");
      expect(monthInput).toHaveFocus();
    });

    it("3 桁入力では月フィールドにフォーカス移動しない", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      await user.click(yearInput);
      await user.type(yearInput, "199");
      expect(yearInput).toHaveFocus();
    });

    it("数字以外は無視される", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      await user.click(yearInput);
      await user.type(yearInput, "ab19");
      // 数字のみ残る: "19"
      expect(yearInput).toHaveValue("19");
    });
  });

  // ---------------------------------------------------------------------------
  // [C] 月入力: "2" で日へフォーカス、"1" では移動しない
  // ---------------------------------------------------------------------------
  describe("[C] 月入力 自動フォーカス", () => {
    it('"2" 入力で日フィールドへ即フォーカスが移る', async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(monthInput);
      await user.type(monthInput, "2");
      expect(dayInput).toHaveFocus();
    });

    it('"1" 入力では日フィールドへフォーカス移動しない (10〜12月のため)', async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      await user.click(monthInput);
      await user.type(monthInput, "1");
      expect(monthInput).toHaveFocus();
    });

    it('"12" 入力で日フィールドへフォーカスが移る', async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(monthInput);
      await user.type(monthInput, "12");
      expect(dayInput).toHaveFocus();
    });

    it('"9" 入力 (2 桁未満で 2 以上) で日フィールドへフォーカスが移る', async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(monthInput);
      await user.type(monthInput, "9");
      expect(dayInput).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // [D] 日入力: 2 桁で止まる (自動フォーカス移動なし)
  // ---------------------------------------------------------------------------
  describe("[D] 日入力", () => {
    it('"22" 入力後にフォーカスが日フィールドに留まる', async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(dayInput);
      await user.type(dayInput, "22");
      expect(dayInput).toHaveFocus();
    });

    it("3 桁目以降は入力できない (maxLength=2)", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(dayInput);
      await user.type(dayInput, "225");
      // maxLength=2 なので "22" のみ残る
      expect(dayInput).toHaveValue("22");
    });
  });

  // ---------------------------------------------------------------------------
  // [E] Backspace: 空フィールドから前フィールドへフォーカスを戻す
  // ---------------------------------------------------------------------------
  describe("[E] Backspace フォーカス復元", () => {
    it("月フィールドが空のまま Backspace を押すと年フィールドへフォーカスが戻る", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      await user.click(monthInput);
      expect(monthInput).toHaveValue("");
      await user.keyboard("{Backspace}");
      expect(yearInput).toHaveFocus();
    });

    it("日フィールドが空のまま Backspace を押すと月フィールドへフォーカスが戻る", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(dayInput);
      expect(dayInput).toHaveValue("");
      await user.keyboard("{Backspace}");
      expect(monthInput).toHaveFocus();
    });

    it("日フィールドに値があるとき Backspace では前フィールドに戻らない", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(dayInput);
      await user.type(dayInput, "2");
      await user.keyboard("{Backspace}");
      // 値削除後は空になるが、Backspace 時点では値があったので月に戻らない
      expect(dayInput).toHaveFocus();
    });
  });

  // ---------------------------------------------------------------------------
  // [F] バリデーション: 存在しない日付
  // ---------------------------------------------------------------------------
  describe("[F] バリデーション: 存在しない日付", () => {
    it('2026年2月30日で "存在しない日付です" エラーが表示される', async () => {
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} value="2026-02-30" />);
      await waitFor(() => {
        expect(screen.getByText("存在しない日付です")).toBeInTheDocument();
      });
    });

    it("存在しない日付では onChange に空文字が渡される", async () => {
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} value="2026-02-30" />);
      await waitFor(() => {
        // 不正日付なので "" が emit される
        const calls = onChange.mock.calls;
        const hasEmptyEmit = calls.some(([v]) => v === "");
        expect(hasEmptyEmit).toBe(true);
      });
    });

    it("月=0 は存在しない日付としてエラーになる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "1990");
      await user.type(monthInput, "0");
      await user.type(dayInput, "15");
      await waitFor(() => {
        expect(screen.getByText("存在しない日付です")).toBeInTheDocument();
      });
    });

    it("日=0 は存在しない日付としてエラーになる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "1990");
      await user.type(monthInput, "3");
      await user.type(dayInput, "0");
      await waitFor(() => {
        expect(screen.getByText("存在しない日付です")).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [G] 年齢範囲バリデーション
  // ---------------------------------------------------------------------------
  describe("[G] 年齢範囲バリデーション", () => {
    it("1899年は範囲エラー「1900〜XXXX年の範囲で入力してください」が表示される", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "1899");
      await user.type(monthInput, "1");
      await user.type(dayInput, "1");
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("1900");
      });
    });

    it("maxYear を超える年 (maxYear=2026 で 2027 年) は範囲エラーになる", async () => {
      const user = userEvent.setup();
      render(<BirthdayInput onChange={vi.fn()} maxYear={2026} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "2027");
      await user.type(monthInput, "1");
      await user.type(dayInput, "1");
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("2026");
      });
    });

    it("minYear=1900, maxYear=2026 の境界値 1900 年は有効", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} minYear={1900} maxYear={2026} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "1900");
      await user.type(monthInput, "1");
      await user.type(dayInput, "1");
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(onChange).toHaveBeenCalledWith("1900-01-01");
      });
    });

    it("maxYear 境界値の年は有効", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} maxYear={2026} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "2026");
      await user.type(monthInput, "1");
      await user.type(dayInput, "1");
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(onChange).toHaveBeenCalledWith("2026-01-01");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // [H] ISO 読み込み
  // ---------------------------------------------------------------------------
  describe("[H] ISO 文字列の読み込み", () => {
    it('"1990-03-15" が年=1990、月=3、日=15 に分解されて表示される', async () => {
      render(<BirthdayInput onChange={vi.fn()} value="1990-03-15" />);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "生年" })).toHaveValue("1990");
        expect(screen.getByRole("textbox", { name: "生月" })).toHaveValue("3");
        expect(screen.getByRole("textbox", { name: "生日" })).toHaveValue("15");
      });
    });

    it("ISO 形式 (T 付き) の先頭 10 文字が正規化される", async () => {
      render(<BirthdayInput onChange={vi.fn()} value="1990-03-15T00:00:00.000Z" />);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "生年" })).toHaveValue("1990");
        expect(screen.getByRole("textbox", { name: "生月" })).toHaveValue("3");
        expect(screen.getByRole("textbox", { name: "生日" })).toHaveValue("15");
      });
    });

    it("value が空文字の場合、すべてのフィールドが空になる", async () => {
      render(<BirthdayInput onChange={vi.fn()} value="" />);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "生年" })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: "生月" })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: "生日" })).toHaveValue("");
      });
    });

    it("value が undefined の場合、すべてのフィールドが空になる", async () => {
      render(<BirthdayInput onChange={vi.fn()} value={undefined} />);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "生年" })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: "生月" })).toHaveValue("");
        expect(screen.getByRole("textbox", { name: "生日" })).toHaveValue("");
      });
    });

    it("先頭月が 1 桁 ('01') のとき '1' として表示される (ゼロ埋めなし)", async () => {
      render(<BirthdayInput onChange={vi.fn()} value="1990-01-05" />);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "生月" })).toHaveValue("1");
        expect(screen.getByRole("textbox", { name: "生日" })).toHaveValue("5");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // onChange emit
  // ---------------------------------------------------------------------------
  describe("onChange emit", () => {
    it("正しい日付を入力すると yyyy-MM-dd 形式で onChange が呼ばれる", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} />);
      const yearInput = screen.getByRole("textbox", { name: "生年" });
      const monthInput = screen.getByRole("textbox", { name: "生月" });
      const dayInput = screen.getByRole("textbox", { name: "生日" });
      await user.click(yearInput);
      await user.type(yearInput, "1990");
      await user.type(monthInput, "6");
      await user.type(dayInput, "15");
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("1990-06-15");
      });
    });

    it("未入力状態では onChange に空文字が渡される", async () => {
      const onChange = vi.fn();
      render(<BirthdayInput onChange={onChange} />);
      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        if (lastCall) {
          expect(lastCall[0]).toBe("");
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // disabled 状態
  // ---------------------------------------------------------------------------
  describe("disabled 状態", () => {
    it("disabled=true のとき全フィールドが無効になる", () => {
      render(<BirthdayInput onChange={vi.fn()} disabled />);
      expect(screen.getByRole("textbox", { name: "生年" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "生月" })).toBeDisabled();
      expect(screen.getByRole("textbox", { name: "生日" })).toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // 外部エラー
  // ---------------------------------------------------------------------------
  describe("外部エラー表示", () => {
    it("error prop が指定されるとエラーメッセージが表示される", () => {
      render(<BirthdayInput onChange={vi.fn()} error="外部からのエラー" />);
      expect(screen.getByRole("alert")).toHaveTextContent("外部からのエラー");
    });

    it("helperText はエラーがないときのみ表示される", () => {
      const { rerender } = render(
        <BirthdayInput onChange={vi.fn()} helperText="ヘルプテキスト" />,
      );
      expect(screen.getByText("ヘルプテキスト")).toBeInTheDocument();
      rerender(<BirthdayInput onChange={vi.fn()} helperText="ヘルプテキスト" error="エラー" />);
      expect(screen.queryByText("ヘルプテキスト")).not.toBeInTheDocument();
    });
  });
});
