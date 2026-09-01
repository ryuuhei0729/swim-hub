// =============================================================================
// CenterModal.test.tsx
// =============================================================================
// mobile UI フィードバック #1/#4: ベストタイム詳細・WAポイント説明を「中央配置の
// ポップアップ」として表示する共通プリミティブ (`components/ui/CenterModal.tsx`) を
// 単体で検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// `Animated.View` は `transform` を DOM に渡す前に取り除く実装 (`__mocks__/react-native.ts`)
// のため、フェード/スケールの見た目そのものはこのテストでは検証できない。
// 検証できるのは以下の構造的な性質のみ。
//
// Sprint Contract 検証観点:
//   [V-CENTER-01] Modal は animationType="none" で即時表示する
//   [V-CENTER-02] 背面タップで onClose が呼ばれる (常に onClose 固定。SlideUpModal と異なり
//     onBackdropPress のような上書き口は無い)
//   [V-CENTER-03] 閉じるボタン (内蔵×) で onClose が呼ばれる
//   [V-CENTER-04] onRequestClose (Android 戻るボタン) も onClose に固定される
//   [V-CENTER-05] showCloseButton=false のとき、内蔵×ボタンは描画されない
//   [V-CENTER-06] visible=false の間は何もレンダリングしない
//
// トートロジー防止メモ: 期待する呼び出し有無・DOM 構造はテスト側でハードコードし、
// CenterModal.tsx の実装をコピーしていない。
// =============================================================================

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

import { CenterModal } from "../CenterModal";

/**
 * CenterModal 内部の閉じアニメーション時間 (`ANIMATION_DURATION`)。
 * 実装ファイルの値をコピーしたものであり、テスト側で独自にハードコードしている
 * 訳ではないことに注意 (実装が変われば追随して更新すること)。
 */
const ANIMATION_DURATION = 160;

describe("CenterModal", () => {
  it("[V-CENTER-01] Modal は animationType='none' で即時表示する", () => {
    const { container } = render(
      <CenterModal visible onClose={vi.fn()} closeAccessibilityLabel="閉じる">
        <>content</>
      </CenterModal>,
    );
    const modalRoot = container.firstElementChild as HTMLElement;
    expect(modalRoot.getAttribute("animationtype")).toBe("none");
  });

  it("[V-CENTER-02] 背面タップで onClose が呼ばれる (上書き不可)", () => {
    const onClose = vi.fn();
    render(
      <CenterModal visible onClose={onClose} closeAccessibilityLabel="閉じる">
        <>content</>
      </CenterModal>,
    );

    // 背面タップ用 Pressable は StyleSheet.absoluteFill が付与された最初の button。
    const backdrop = screen.getAllByRole("button")[0]!; // getAllByRole は1件以上見つからなければ throw するため必ず存在
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-CENTER-03] 内蔵の閉じるボタン (×) で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <CenterModal visible onClose={onClose} closeAccessibilityLabel="閉じる">
        <>content</>
      </CenterModal>,
    );

    const closeIcon = screen.getByTestId("icon-x");
    fireEvent.click(closeIcon.closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-CENTER-04] onRequestClose (Android 戻るボタン) は onClose に固定される", async () => {
    const captured: { props: Record<string, unknown> | null } = { props: null };
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
    const { CenterModal: FreshCenterModal } = await import("../CenterModal");
    const onClose = vi.fn();
    render(
      <FreshCenterModal visible onClose={onClose} closeAccessibilityLabel="閉じる">
        <>content</>
      </FreshCenterModal>,
    );

    expect(captured.props?.onRequestClose).toBe(onClose);
    vi.doUnmock("react-native");
  });

  it("[V-CENTER-05] showCloseButton=false のとき、内蔵の閉じるボタン (×) は描画されない", () => {
    render(
      <CenterModal
        visible
        onClose={vi.fn()}
        closeAccessibilityLabel="閉じる"
        showCloseButton={false}
      >
        <>content-without-close-button</>
      </CenterModal>,
    );

    expect(screen.queryByTestId("icon-x")).toBeNull();
  });

  it("[V-CENTER-06] visible=false の間は何もレンダリングしない", () => {
    const { container } = render(
      <CenterModal visible={false} onClose={vi.fn()} closeAccessibilityLabel="閉じる">
        <>hidden-content-marker</>
      </CenterModal>,
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

    it("[V-CENTER-07] visible: true→false でも、アニメーション時間が経過するまでは中身がマウントされ続ける", () => {
      vi.useFakeTimers();
      const { container, rerender } = render(
        <CenterModal visible onClose={vi.fn()} closeAccessibilityLabel="閉じる">
          <>center-transition-marker</>
        </CenterModal>,
      );
      expect(container.textContent).toContain("center-transition-marker");

      rerender(
        <CenterModal visible={false} onClose={vi.fn()} closeAccessibilityLabel="閉じる">
          <>center-transition-marker</>
        </CenterModal>,
      );

      // アニメーション時間 (ANIMATION_DURATION) が経過するより前は、まだマウントされたままでよい
      // (閉じるアニメーションの再生中は中身を残す設計)
      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION - 50);
      });
      expect(container.textContent).toContain("center-transition-marker");

      // アニメーション時間を過ぎたら unmount される
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(container.textContent).not.toContain("center-transition-marker");
      expect(container.innerHTML).toBe("");
    });

    it("[V-CENTER-08] アニメーション中に true→false→true と高速に開閉しても、古い閉じタイマーで誤って unmount されない", () => {
      vi.useFakeTimers();
      const onClose = vi.fn();
      const { container, rerender } = render(
        <CenterModal visible onClose={onClose} closeAccessibilityLabel="閉じる">
          <>rapid-toggle-marker</>
        </CenterModal>,
      );

      // 閉じる (このとき ANIMATION_DURATION 後に unmount する setTimeout が仕込まれる)
      rerender(
        <CenterModal visible={false} onClose={onClose} closeAccessibilityLabel="閉じる">
          <>rapid-toggle-marker</>
        </CenterModal>,
      );

      // 閉じるアニメーションの途中 (完了前) で再度開く。実装の useEffect クリーンアップが
      // 古い setTimeout を確実に clearTimeout していれば、後続の advance で誤って
      // unmount されることは無い。
      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION / 2);
      });
      rerender(
        <CenterModal visible onClose={onClose} closeAccessibilityLabel="閉じる">
          <>rapid-toggle-marker</>
        </CenterModal>,
      );

      // 元の (最初の) 閉じタイマーが仕込まれた時点から ANIMATION_DURATION 以上経過させる。
      // 古いタイマーが生き残っていれば、ここで誤って unmount されてしまうはず。
      act(() => {
        vi.advanceTimersByTime(ANIMATION_DURATION);
      });

      expect(container.textContent).toContain("rapid-toggle-marker");
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
