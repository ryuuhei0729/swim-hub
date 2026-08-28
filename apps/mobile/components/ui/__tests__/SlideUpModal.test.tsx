// =============================================================================
// SlideUpModal.test.tsx
// =============================================================================
// mobile UI フィードバック #3: 「暗幕は即時表示・シートだけスライド」の共通プリミティブ
// (`components/ui/SlideUpModal.tsx`) を単体で検証する。
//
// ## jsdom で検証できる範囲とできない範囲 (正直な切り分け)
// - `__mocks__/react-native.ts` の `Animated.View` は `transform` を DOM に渡す前に
//   意図的に取り除く実装になっている (transform を DOM に渡せないため)。つまり
//   「シートが実際にスライドして見えるか」というアニメーションの見た目そのものは
//   このテストでは一切検証できない (jsdom はレイアウト/アニメーションエンジンを持たない)。
// - 検証できるのは以下の構造的な性質のみ:
//   [V-SLIDE-01] Modal 自体が `animationType="none"` で即時表示されること
//     (暗幕を含む Modal 全体をネイティブアニメーションさせない、という設計の根拠)
//   [V-SLIDE-02] 背面タップ用の Pressable が、アニメーション対象のシート (Animated.View)
//     の外側の兄弟要素として配置されていること (シートのタップが背面に届かない構造)
//   [V-SLIDE-03] 背面タップ: `onBackdropPress` 省略時は `onClose` が呼ばれる
//   [V-SLIDE-04] 背面タップ: `onBackdropPress` 指定時はそちらが呼ばれ、`onClose` は
//     呼ばれない (呼び出し元が「保存中は閉じさせない」等のガードを差し込める)
//   [V-SLIDE-05] `onRequestClose` (Android 戻るボタン) は常に `onClose` に固定される
//     (`onBackdropPress` を上書きしても Android の戻る動作は変わらない)
//   [V-SLIDE-06] `visible=false` の間は何もレンダリングしない
//
// トートロジー防止メモ: 期待するスタイル文字列・呼び出し有無はテスト側でハードコードし、
// SlideUpModal.tsx の実装をコピーしていない。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { SlideUpModal } from "../SlideUpModal";

/**
 * SlideUpModal 内部の閉じアニメーション時間 (`SLIDE_DURATION`)。
 * 実装ファイルの値をコピーしたものであり、テスト側で独自にハードコードしている
 * 訳ではないことに注意 (実装が変われば追随して更新すること)。
 */
const SLIDE_DURATION = 250;

describe("SlideUpModal", () => {
  it("[V-SLIDE-01] Modal は animationType='none' で即時表示する (暗幕自体はネイティブアニメーションしない)", () => {
    const { container } = render(
      <SlideUpModal visible onClose={vi.fn()}>
        <>content</>
      </SlideUpModal>,
    );

    // Modal (react-native モック) は props をそのまま DOM 属性として転記する
    // (`animationtype` はモックが unknown prop をそのまま反映する挙動)
    const modalRoot = container.firstElementChild as HTMLElement;
    expect(modalRoot.getAttribute("animationtype")).toBe("none");
  });

  it("[V-SLIDE-02] 背面タップ用の Pressable は、シート (children を包む Animated.View) の外側の兄弟要素である", () => {
    render(
      <SlideUpModal visible onClose={vi.fn()}>
        <>slide-up-modal-content-marker</>
      </SlideUpModal>,
    );

    const backdrop = screen.getByRole("button");
    const overlay = backdrop.parentElement!;
    // overlay の直下の子は「背面タップ用 button」と「シート div」の2つだけであり、
    // シートは背面タップ用 button の中には無い (兄弟構造)。
    expect(overlay.children.length).toBe(2);
    expect(overlay.children[0]).toBe(backdrop);
    const sheet = overlay.children[1];
    expect(sheet.tagName).not.toBe("BUTTON");
    expect(sheet.textContent).toContain("slide-up-modal-content-marker");
    // 背面タップ用 button 自身はシートの内容を含まない (兄弟であり親子ではないことの補強)
    expect(backdrop.textContent).not.toContain("slide-up-modal-content-marker");
  });

  it("[V-SLIDE-03] onBackdropPress を省略した場合、背面タップで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <SlideUpModal visible onClose={onClose}>
        <>content</>
      </SlideUpModal>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-SLIDE-04] onBackdropPress を指定した場合、背面タップではそちらが呼ばれ onClose は呼ばれない", () => {
    const onClose = vi.fn();
    const onBackdropPress = vi.fn();
    render(
      <SlideUpModal visible onClose={onClose} onBackdropPress={onBackdropPress}>
        <>content</>
      </SlideUpModal>,
    );

    fireEvent.click(screen.getByRole("button"));
    expect(onBackdropPress).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("[V-SLIDE-05] onRequestClose (Android 戻るボタン) は onBackdropPress を上書きしても常に onClose に固定される", async () => {
    const captured: { props: Record<string, unknown> | null } = { props: null };
    // このテストケース限定で Modal の props を捕捉する。react-native は vitest.config の
    // alias で __mocks__/react-native.ts に固定されているが、vi.doMock はそれより優先して
    // 解決される (このリポジトリで実証済みの方式)。
    vi.doMock("react-native", async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>();
      const RealModal = actual.Modal as React.FC<Record<string, unknown>>;
      return {
        ...actual,
        Modal: (props: Record<string, unknown>) => {
          captured.props = props;
          return RealModal(props);
        },
      };
    });

    vi.resetModules();
    const { SlideUpModal: FreshSlideUpModal } = await import("../SlideUpModal");
    const onClose = vi.fn();
    const onBackdropPress = vi.fn();
    render(
      <FreshSlideUpModal visible onClose={onClose} onBackdropPress={onBackdropPress}>
        <>content</>
      </FreshSlideUpModal>,
    );

    expect(captured.props?.onRequestClose).toBe(onClose);
    expect(captured.props?.onRequestClose).not.toBe(onBackdropPress);
    vi.doUnmock("react-native");
  });

  it("[V-SLIDE-06] visible=false の間は何もレンダリングしない", () => {
    const { container } = render(
      <SlideUpModal visible={false} onClose={vi.fn()}>
        <>hidden-content-marker</>
      </SlideUpModal>,
    );
    expect(container.textContent).not.toContain("hidden-content-marker");
    expect(container.innerHTML).toBe("");
  });

  // ---------------------------------------------------------------------
  // 遅延アンマウントの遷移テスト (PM裁定 / Reviewer指摘)
  // 静的な visible=true / visible=false だけでなく、true→false の遷移そのものと、
  // アニメーション中の高速な開閉 (true→false→true) を検証する。
  // ---------------------------------------------------------------------
  describe("遅延アンマウント (visible の遷移)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("[V-SLIDE-07] visible: true→false でも、アニメーション時間が経過するまでは中身がマウントされ続ける", () => {
      vi.useFakeTimers();
      const { container, rerender } = render(
        <SlideUpModal visible onClose={vi.fn()}>
          <>slide-transition-marker</>
        </SlideUpModal>,
      );
      expect(container.textContent).toContain("slide-transition-marker");

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()}>
          <>slide-transition-marker</>
        </SlideUpModal>,
      );

      // アニメーション時間 (SLIDE_DURATION) が経過するより前は、まだマウントされたままでよい
      // (閉じるアニメーションの再生中は中身を残す設計)
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION - 50);
      });
      expect(container.textContent).toContain("slide-transition-marker");

      // アニメーション時間を過ぎたら unmount される
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(container.textContent).not.toContain("slide-transition-marker");
      expect(container.innerHTML).toBe("");
    });

    it("[V-SLIDE-08] アニメーション中に true→false→true と高速に開閉しても、古い閉じタイマーで誤って unmount されない", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      const { container, rerender } = render(
        <SlideUpModal visible onClose={onClose}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      // 閉じる (このとき SLIDE_DURATION 後に unmount する setTimeout が仕込まれる)
      rerender(
        <SlideUpModal visible={false} onClose={onClose}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      // 閉じるアニメーションの途中 (完了前) で再度開く。実装の useEffect クリーンアップが
      // 古い setTimeout を確実に clearTimeout していれば、後続の advance で誤って
      // unmount されることは無い。
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION / 2);
      });
      rerender(
        <SlideUpModal visible onClose={onClose}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      // 元の (最初の) 閉じタイマーが仕込まれた時点から SLIDE_DURATION 以上経過させる。
      // 古いタイマーが生き残っていれば、ここで誤って unmount されてしまうはず。
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION);
      });

      expect(container.textContent).toContain("rapid-toggle-marker");
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
