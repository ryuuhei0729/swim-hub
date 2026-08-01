/**
 * BottomSheet テスト(Sprint Contract Phase B: 実装完了後の a11y 検証)
 *
 * 2026-07-22 Sprint: 大会/練習履歴タブ カード化+ボトムシート化。
 * `components/ui/BottomSheet.tsx` の実装(Developer報告)に基づき、Phase A の it.todo を実装する。
 *
 * 実装仕様(Developer報告 + 実ファイル確認):
 *   - props: {isOpen, onClose, title?, children, footer?, maxHeightClassName?}
 *   - role="dialog" / aria-modal="true"、title 指定時のみ aria-labelledby でヘッダー見出しの id を参照
 *   - shouldRender(DOM存在)/isVisible(translate-y-0⇔translate-y-full) の2段階 state。
 *     閉じるときは isVisible を先に false にし、CLOSE_ANIMATION_MS(300ms)後に shouldRender を false にして
 *     初めて DOM から除去される(createPortal(document.body) なので screen クエリで直接見つかる)
 *   - Escape・フォーカストラップ・フォーカス復帰は ConfirmDialog と同型のロジック
 *   - body scroll lock は utils/scrollLock.ts の参照カウント方式(ConfirmDialog と共用)
 *
 * jsdom 制約:
 *   - CSS transition の実際の描画結果(computed transform)は評価されないため、
 *     className に "translate-y-0"/"translate-y-full" が含まれるかで間接検証する。
 *   - 閉じるモーション後の遅延 unmount は実際に real timer 300ms 経過するまで DOM に残るため、
 *     `waitFor` (デフォルトタイムアウト1000ms・ポーリング間隔50ms) で待つ(vi.useFakeTimers は
 *     userEvent の内部タイマーと競合するリスクがあるため使わない)。
 *   - `max-h-[80vh]` の内部スクロール可否(実レイアウト計算)は jsdom では検証不能なため、
 *     クラスの存在確認に留め、実スクロール挙動は Playwright 実機検証に委譲する。
 */

import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import BottomSheet from "@/components/ui/BottomSheet";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("BottomSheet", () => {
  describe("表示・非表示", () => {
    it("isOpen=false のとき何も描画しない (DOM に role=dialog が存在しない)", () => {
      renderWithIntl(
        <BottomSheet isOpen={false} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("isOpen=true のとき document.body 直下に createPortal でダイアログが描画される", () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      // createPortal(document.body) のため、RTL の render コンテナ(container)の外側にある
      expect(document.body.contains(dialog)).toBe(true);
    });

    it("isOpen=false → true に変化すると、直後に translate-y-0 クラスへ遷移する", async () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      await waitFor(() => {
        expect(screen.getByRole("dialog").className).toContain("translate-y-0");
      });
      expect(screen.getByRole("dialog").className).not.toContain("translate-y-full");
    });

    it(
      "isOpen=true → false に変化した直後は即座に unmount されず、" +
        "閉じるモーション時間 (300ms) 経過後に unmount される",
      async () => {
        function Harness() {
          const [open, setOpen] = useState(true);
          return (
            <>
              <button type="button" onClick={() => setOpen(false)}>
                閉じるトリガー
              </button>
              <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="テスト">
                <p>内容</p>
              </BottomSheet>
            </>
          );
        }
        const user = userEvent.setup();
        renderWithIntl(<Harness />);

        await waitFor(() => {
          expect(screen.getByRole("dialog").className).toContain("translate-y-0");
        });

        await user.click(screen.getByRole("button", { name: "閉じるトリガー" }));

        // 閉じた直後もまだ DOM に存在する(スライドアウトモーション中)
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        // モーション時間経過後に unmount される
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      },
    );
  });

  describe("a11y 属性", () => {
    it('ダイアログ要素が role="dialog" を持つ', () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it('ダイアログ要素が aria-modal="true" を持つ', () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    });

    it("title prop を渡した場合、aria-labelledby がタイトル見出しの id を参照する", () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="並べ替え">
          <p>内容</p>
        </BottomSheet>,
      );
      const dialog = screen.getByRole("dialog");
      const labelledBy = dialog.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      const heading = document.getElementById(labelledBy as string);
      expect(heading).not.toBeNull();
      expect(heading).toHaveTextContent("並べ替え");
    });

    it("title を渡さない場合は aria-labelledby を持たない", () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()}>
          <p>内容</p>
        </BottomSheet>,
      );
      expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-labelledby");
    });

    it("内部コンテンツ領域が既定で max-h-[80vh] クラスを持つ", () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p data-testid="sheet-content">内容</p>
        </BottomSheet>,
      );
      const content = screen.getByTestId("sheet-content").parentElement;
      expect(content?.className).toContain("max-h-[80vh]");
      expect(content?.className).toContain("overflow-y-auto");
    });
  });

  describe("Escape キーで閉じる", () => {
    it("開いている状態で Escape キーを押すと onClose が1回だけ呼ばれる", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={onClose} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("閉じている状態 (isOpen=false) では Escape キーを押しても onClose は呼ばれない", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
        <BottomSheet isOpen={false} onClose={onClose} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );

      await user.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("オーバーレイクリックで閉じる", () => {
    it("オーバーレイ(背景)をクリックすると onClose が呼ばれる", () => {
      const onClose = vi.fn();
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={onClose} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );

      const dialog = screen.getByRole("dialog");
      // オーバーレイは dialog の直前の兄弟要素 (aria-hidden の背景 div)
      const overlay = dialog.previousElementSibling as HTMLElement;
      expect(overlay).toHaveAttribute("aria-hidden", "true");

      fireEvent.click(overlay);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("シート本体(コンテンツ領域)をクリックしても onClose は呼ばれない", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={onClose} title="テスト">
          <button type="button">内容ボタン</button>
        </BottomSheet>,
      );

      await user.click(screen.getByRole("button", { name: "内容ボタン" }));

      expect(onClose).not.toHaveBeenCalled();
    });

    it("閉じるボタン(ヘッダーのXアイコン)をクリックすると onClose が呼ばれる", async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={onClose} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );

      await user.click(screen.getByRole("button", { name: "閉じる" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("フォーカストラップ", () => {
    it("開いた直後、ヘッダーの閉じるボタンにフォーカスが移動する", async () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <button type="button">Child A</button>
        </BottomSheet>,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
      });
    });

    it(
      "最後のフォーカス可能要素(フッターボタン)で Tab を押すと、" +
        "フォーカスが最初のフォーカス可能要素(閉じるボタン)に循環する",
      async () => {
        const user = userEvent.setup();
        renderWithIntl(
          <BottomSheet
            isOpen={true}
            onClose={vi.fn()}
            title="テスト"
            footer={<button type="button">Footer Button</button>}
          >
            <button type="button">Child A</button>
            <button type="button">Child B</button>
          </BottomSheet>,
        );

        const footerButton = screen.getByRole("button", { name: "Footer Button" });
        footerButton.focus();
        expect(footerButton).toHaveFocus();

        await user.keyboard("{Tab}");

        expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
      },
    );

    it(
      "最初のフォーカス可能要素(閉じるボタン)で Shift+Tab を押すと、" +
        "フォーカスが最後のフォーカス可能要素(フッターボタン)に循環する",
      async () => {
        const user = userEvent.setup();
        renderWithIntl(
          <BottomSheet
            isOpen={true}
            onClose={vi.fn()}
            title="テスト"
            footer={<button type="button">Footer Button</button>}
          >
            <button type="button">Child A</button>
            <button type="button">Child B</button>
          </BottomSheet>,
        );

        await waitFor(() => {
          expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
        });

        await user.keyboard("{Shift>}{Tab}{/Shift}");

        expect(screen.getByRole("button", { name: "Footer Button" })).toHaveFocus();
      },
    );
  });

  describe("フォーカス復帰", () => {
    it(
      "シートを開く前にフォーカスされていた要素(トリガーボタン)に、" +
        "Escape で閉じた後にフォーカスが戻る",
      async () => {
        function Harness() {
          const [open, setOpen] = useState(false);
          return (
            <>
              <button type="button" onClick={() => setOpen(true)}>
                開くトリガー
              </button>
              <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="テスト">
                <p>内容</p>
              </BottomSheet>
            </>
          );
        }
        const user = userEvent.setup();
        renderWithIntl(<Harness />);

        const triggerButton = screen.getByRole("button", { name: "開くトリガー" });
        await user.click(triggerButton);

        await waitFor(() => {
          expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
        });

        await user.keyboard("{Escape}");

        await waitFor(() => {
          expect(triggerButton).toHaveFocus();
        });
      },
    );
  });

  describe("body スクロールロック(参照カウント方式)", () => {
    it("開いている間、document.body.style.overflow が 'hidden' になる", () => {
      renderWithIntl(
        <BottomSheet isOpen={true} onClose={vi.fn()} title="テスト">
          <p>内容</p>
        </BottomSheet>,
      );
      expect(document.body.style.overflow).toBe("hidden");
    });

    it(
      "閉じると document.body.style.overflow が開く前の値に復元される" +
        "(ただし PM 確定仕様により、復元されるのは shouldRender=false になる" +
        "300ms 後=アンマウント時。閉じた直後はスライドアウト中のため overflow は" +
        "'hidden' のまま維持される)",
      async () => {
        function Harness() {
          const [open, setOpen] = useState(true);
          return (
            <>
              <button type="button" onClick={() => setOpen(false)}>
                閉じるトリガー
              </button>
              <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="テスト">
                <p>内容</p>
              </BottomSheet>
            </>
          );
        }
        const user = userEvent.setup();
        document.body.style.overflow = "";
        renderWithIntl(<Harness />);
        expect(document.body.style.overflow).toBe("hidden");

        await user.click(screen.getByRole("button", { name: "閉じるトリガー" }));

        // 閉じた直後(スライドアウトモーション中)はまだ overflow ロックが維持される
        expect(document.body.style.overflow).toBe("hidden");

        // アンマウント(shouldRender=false, 300ms後)で初めて復元される
        await waitFor(() => {
          expect(document.body.style.overflow).toBe("");
        });
      },
    );

    it(
      "[複数シート競合] 2つの BottomSheet が同時に開いている場合、片方を閉じても" +
        "もう片方が開いている間は overflow ロックが解除されない(参照カウントが0にならない限り復元しない)",
      async () => {
        function TwoSheets() {
          const [open1, setOpen1] = useState(true);
          const [open2, setOpen2] = useState(false);
          return (
            <>
              <button type="button" onClick={() => setOpen2(true)}>
                2つ目を開く
              </button>
              <button type="button" onClick={() => setOpen2(false)}>
                2つ目を閉じる
              </button>
              <button type="button" onClick={() => setOpen1(false)}>
                1つ目を閉じる
              </button>
              <BottomSheet isOpen={open1} onClose={() => setOpen1(false)} title="1つ目">
                <p>内容1</p>
              </BottomSheet>
              <BottomSheet isOpen={open2} onClose={() => setOpen2(false)} title="2つ目">
                <p>内容2</p>
              </BottomSheet>
            </>
          );
        }
        const user = userEvent.setup();
        document.body.style.overflow = "";
        renderWithIntl(<TwoSheets />);
        expect(document.body.style.overflow).toBe("hidden");

        await user.click(screen.getByRole("button", { name: "2つ目を開く" }));
        expect(document.body.style.overflow).toBe("hidden");

        // 2つ目だけ閉じても、1つ目がまだ開いているので overflow は "hidden" のまま
        await user.click(screen.getByRole("button", { name: "2つ目を閉じる" }));
        expect(document.body.style.overflow).toBe("hidden");

        // 1つ目も閉じて初めて overflow が復元される(shouldRender=false になる
        // 300ms後=アンマウント時。PM確定仕様のため waitFor で待つ)
        await user.click(screen.getByRole("button", { name: "1つ目を閉じる" }));
        await waitFor(() => {
          expect(document.body.style.overflow).toBe("");
        });
      },
    );

    it(
      "[ConfirmDialog との競合] BottomSheet が開いている間に ConfirmDialog も開いた場合、" +
        "ConfirmDialog を閉じても BottomSheet が開いている間は overflow ロックが解除されず、" +
        "両方閉じて初めて復元される",
      async () => {
        function SheetAndConfirm() {
          const [sheetOpen, setSheetOpen] = useState(true);
          const [confirmOpen, setConfirmOpen] = useState(false);
          return (
            <>
              <button type="button" onClick={() => setConfirmOpen(true)}>
                確認を開く
              </button>
              <button type="button" onClick={() => setSheetOpen(false)}>
                シートを閉じる
              </button>
              <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="シート">
                <p>内容</p>
              </BottomSheet>
              <ConfirmDialog
                isOpen={confirmOpen}
                onConfirm={() => setConfirmOpen(false)}
                onCancel={() => setConfirmOpen(false)}
                title="確認"
                message="本当によろしいですか?"
              />
            </>
          );
        }
        const user = userEvent.setup();
        document.body.style.overflow = "";
        renderWithIntl(<SheetAndConfirm />);
        expect(document.body.style.overflow).toBe("hidden");

        await user.click(screen.getByRole("button", { name: "確認を開く" }));
        expect(document.body.style.overflow).toBe("hidden");

        // ConfirmDialog を確定して閉じても、BottomSheet が開いている間は overflow ロックされたまま
        await user.click(screen.getByTestId("confirm-dialog-confirm-button"));
        expect(document.body.style.overflow).toBe("hidden");

        // BottomSheet も閉じて初めて overflow が復元される(shouldRender=false になる
        // 300ms後=アンマウント時。PM確定仕様のため waitFor で待つ)
        await user.click(screen.getByRole("button", { name: "シートを閉じる" }));
        await waitFor(() => {
          expect(document.body.style.overflow).toBe("");
        });
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Critical 1 実証(2026-07-22 修正版): onClose を onCloseRef で安定化し、
  // Escape/フォーカストラップ effect を [isOpen] のみ依存にした。初期フォーカスは
  // [isOpen, shouldRender] 依存の専用 effect に分離し、マウント直後の1回のみ発火する。
  // Reviewer 推奨ケース: isOpen=true のまま親が再レンダーされ onClose が新しい参照に
  // なっても、(1) フォーカスが×ボタンへ再度移動しない(選択中の子要素からフォーカスを
  // 奪わない)、(2) scroll lock 状態が変化しない、の2点を実証する。
  // ---------------------------------------------------------------------------
  describe("Critical 1 実証: onClose 参照安定化(親再レンダーでの副作用再実行防止)", () => {
    it(
      "開いた直後は×ボタンへ初期フォーカスが入るが、isOpen=true のまま親が再レンダーされ" +
        "onClose が新しい参照になっても、子要素に移したフォーカスが×ボタンへ奪い返されない",
      async () => {
        const onCloseA = () => {};
        const { rerender } = renderWithIntl(
          <BottomSheet isOpen={true} onClose={onCloseA} title="テスト">
            <input type="text" placeholder="入力" />
          </BottomSheet>,
        );

        // 開いた直後は×ボタンへ初期フォーカスが入る
        await waitFor(() => {
          expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
        });

        // ユーザーが子要素(入力欄)へフォーカスを移す
        const input = screen.getByPlaceholderText("入力");
        input.focus();
        expect(input).toHaveFocus();

        // 親を再レンダーし、onClose に新しい参照を渡す(isOpen は true のまま = 開きっぱなし)
        const onCloseB = () => {};
        rerender(
          <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
            <BottomSheet isOpen={true} onClose={onCloseB} title="テスト">
              <input type="text" placeholder="入力" />
            </BottomSheet>
          </NextIntlClientProvider>,
        );

        // 初期フォーカス effect の依存配列は [isOpen, shouldRender] のみで、
        // どちらも変化していないため再実行されず、フォーカスは入力欄に残ったまま
        expect(input).toHaveFocus();
      },
    );

    it(
      "isOpen=true のまま親が再レンダーされ onClose が新しい参照になっても、" +
        "scroll lock 状態(document.body.style.overflow)は変化しない",
      async () => {
        document.body.style.overflow = "";
        const onCloseA = () => {};
        const { rerender } = renderWithIntl(
          <BottomSheet isOpen={true} onClose={onCloseA} title="テスト">
            <p>内容</p>
          </BottomSheet>,
        );
        expect(document.body.style.overflow).toBe("hidden");

        const onCloseB = () => {};
        rerender(
          <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
            <BottomSheet isOpen={true} onClose={onCloseB} title="テスト">
              <p>内容</p>
            </BottomSheet>
          </NextIntlClientProvider>,
        );

        // scroll lock effect の依存配列は [shouldRender] のみで変化していないため
        // 再実行されず、参照カウントの二重加算等が起きずに "hidden" のまま安定している
        expect(document.body.style.overflow).toBe("hidden");
      },
    );

    it(
      "isOpen=true のまま親が再レンダーされ onClose が新しい参照になっても、" +
        "Escape キーは最新の onClose(再レンダー後の参照)を呼び出す(onCloseRef 経由で安定動作する)",
      async () => {
        const onCloseA = vi.fn();
        const { rerender } = renderWithIntl(
          <BottomSheet isOpen={true} onClose={onCloseA} title="テスト">
            <p>内容</p>
          </BottomSheet>,
        );

        const onCloseB = vi.fn();
        rerender(
          <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
            <BottomSheet isOpen={true} onClose={onCloseB} title="テスト">
              <p>内容</p>
            </BottomSheet>
          </NextIntlClientProvider>,
        );

        const user = userEvent.setup();
        await user.keyboard("{Escape}");

        // 古い onCloseA ではなく、再レンダー後に渡された最新の onCloseB が呼ばれる
        expect(onCloseB).toHaveBeenCalledTimes(1);
        expect(onCloseA).not.toHaveBeenCalled();
      },
    );
  });
});
