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

// Platform.OS を可変にする (V-10/V-11/V-12 で iOS 分岐を検証するため)。
// vi.hoisted で作った可変オブジェクトを vi.mock ファクトリとテスト本体の両方から
// 参照する (このリポジトリで既に確立されたパターン。screens/__tests__/*.tagModalRace.test.tsx
// を参照)。既定値 "web" は共有モックの既定 Platform.OS と同じなので、Platform に触れない
// 既存テスト (V-SLIDE-*, V-9*) の挙動には一切影響しない。
const platformState = vi.hoisted(() => ({ OS: "web" as "web" | "ios" | "android" }));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Platform: {
      get OS() {
        return platformState.OS;
      },
      select: (obj: Record<string, unknown> & { web?: unknown; default?: unknown }) => {
        if (platformState.OS === "ios") return (obj as Record<string, unknown>).ios ?? obj.default;
        if (platformState.OS === "android")
          return (obj as Record<string, unknown>).android ?? obj.default;
        return obj.web ?? obj.default;
      },
    },
  };
});

import {
  __modalMountRegistry,
  __resetModalMountRegistry,
} from "../../../__mocks__/react-native";
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

  // ---------------------------------------------------------------------
  // [V-9] onClosed コールバック (二重マウント競合の修正で追加)
  // TagSelectModal → TagManageModal の遷移で、呼び出し元が「このシートが完全に
  // 閉じ終わってから次のモーダルを開く」制御に使う。誤って早すぎる/遅すぎる/
  // 余分なタイミングで発火すると、呼び出し元側の状態遷移がずれるため、
  // 発火有無そのものを直接検証する。
  // ---------------------------------------------------------------------
  describe("[V-9] onClosed コールバック", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("[V-9a] 初回マウント時 (visible が最初から false) には onClosed が発火しない", () => {
      vi.useFakeTimers();
      const onClosed = vi.fn();
      render(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>never-opened-marker</>
        </SlideUpModal>,
      );

      // 「一度も開いていない」状態であり、閉じるアニメーションも走らないため
      // タイマーを進めても onClosed は呼ばれない。
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION * 2);
      });
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("[V-9a 補足] visible=true で初回マウントしただけ (まだ一度も閉じていない) では onClosed が発火しない", () => {
      vi.useFakeTimers();
      const onClosed = vi.fn();
      render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>still-open-marker</>
        </SlideUpModal>,
      );

      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION * 2);
      });
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("[V-9] visible: true→false でアニメーション時間が経過すると onClosed が1回だけ発火する", () => {
      vi.useFakeTimers();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>content</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>content</>
        </SlideUpModal>,
      );

      // アンマウント (unmount) されるより前は発火しない
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION - 50);
      });
      expect(onClosed).not.toHaveBeenCalled();

      // アンマウントと同時に1回だけ発火する
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("[V-9b] 閉じアニメーション中に再オープンされた場合 (true→false→true) は onClosed が発火しない", () => {
      vi.useFakeTimers();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      // 閉じるアニメーションの途中 (完了前) で再度開く
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION / 2);
      });
      rerender(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>rapid-toggle-marker</>
        </SlideUpModal>,
      );

      // 元の (最初の) 閉じタイマーが仕込まれた時点から SLIDE_DURATION 以上経過させる。
      // clearTimeout されていれば、ここで onClosed は誤発火しない。
      act(() => {
        vi.advanceTimersByTime(SLIDE_DURATION);
      });

      expect(onClosed).not.toHaveBeenCalled();
    });

    it("[V-9c] onClosed 未指定でもエラーにならない (省略可能なプロパティ)", () => {
      vi.useFakeTimers();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()}>
          <>content</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()}>
          <>content</>
        </SlideUpModal>,
      );

      expect(() => {
        act(() => {
          vi.advanceTimersByTime(SLIDE_DURATION);
        });
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------
  // [V-10, V-11, V-12] iOS: ネイティブ onDismiss ベースの完了信号
  // (Reviewer Critical 修正: `awaitingDismissRef`/`closeShouldNotifyRef` の検証)
  //
  // これまでのテスト (V-SLIDE-*, V-9*) は Platform.OS の既定値 "web" (= Android/Web と
  // 同じ即時確定パス) でしか SlideUpModal を検証しておらず、iOS 専用パス
  // (内部 <Modal> の onDismiss を実際に起点にする経路、`handleNativeDismiss`) は
  // このリポジトリのどのテストからも一度も呼ばれていなかった (Reviewer 実測)。
  // ここでは TagManageModal の V-8 と同じ手法 (__modalMountRegistry から onDismiss を
  // capture して手動発火する) を、SlideUpModal 自身の内部 <Modal> (select 分類:
  // `transparent === true` で判別可能) に適用する。
  // ---------------------------------------------------------------------
  describe("[V-10, V-11, V-12] iOS: onDismiss ベースの完了信号 (Reviewer Critical 修正の検証)", () => {
    afterEach(() => {
      vi.useRealTimers();
      platformState.OS = "web";
    });

    function advanceBy(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    }

    /** 保留中の次のタイマーを1本だけ進める (フェイルセーフの正確な ms 値をテスト側で決め打ちしない)。 */
    function fireNextTimer() {
      act(() => {
        vi.advanceTimersToNextTimer();
      });
    }

    /**
     * __modalMountRegistry に記録された「select 分類 (transparent === true)」の
     * 直近のイベントから onDismiss を取り出す。SlideUpModal.test.tsx はこのファイル内で
     * SlideUpModal 単体しかレンダーしないため、TagManageModal (manage 分類) との
     * 混在を心配する必要はない。
     */
    function getLatestSelectOnDismiss(): () => void {
      const events = __modalMountRegistry.events;
      for (let i = events.length - 1; i >= 0; i--) {
        const props = events[i].props;
        if (props.transparent === true) {
          const onDismiss = props.onDismiss;
          if (typeof onDismiss === "function") return onDismiss as () => void;
        }
      }
      throw new Error("[test setup] select 分類 (transparent===true) の onDismiss が記録されていない");
    }

    it("[V-10 最重要] スライドアウト完了後・onDismiss到達前に再オープンされた場合、stale な onDismiss が届いてもシートは消えず onClosed も発火しない", () => {
      platformState.OS = "ios";
      vi.useFakeTimers();
      __resetModalMountRegistry();
      const onClosed = vi.fn();
      const { container, rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>reopen-race-marker</>
        </SlideUpModal>,
      );

      // 閉じる
      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>reopen-race-marker</>
        </SlideUpModal>,
      );

      // スライドアウト完了 → 内部 <Modal> の visible が落ち、ネイティブ dismiss 開始相当。
      // ここではまだ onDismiss (本物の完了信号) は届いていない。
      advanceBy(SLIDE_DURATION);

      const staleOnDismiss = getLatestSelectOnDismiss();

      // onDismiss が届く前に再オープンする
      rerender(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>reopen-race-marker</>
        </SlideUpModal>,
      );
      expect(container.textContent).toContain("reopen-race-marker");

      // reopen 前の (もう無効なはずの) クローズサイクルの onDismiss が遅れて届く
      act(() => {
        staleOnDismiss();
      });

      // シートは消えない (再オープンされたまま)
      expect(container.textContent).toContain("reopen-race-marker");
      // onClosed も誤発火しない
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("[V-11] フェイルセーフ発火後に本物の onDismiss が遅れて届いても、onClosed は高々1回しか発火しない", () => {
      platformState.OS = "ios";
      vi.useFakeTimers();
      __resetModalMountRegistry();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>failsafe-then-dismiss-marker</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>failsafe-then-dismiss-marker</>
        </SlideUpModal>,
      );

      advanceBy(SLIDE_DURATION);
      const onDismiss = getLatestSelectOnDismiss();

      // onDismiss がまだ来ないまま、フェイルセーフが先に発火する
      fireNextTimer();
      expect(onClosed).toHaveBeenCalledTimes(1);

      // その後に本物の onDismiss が遅れて届く
      act(() => {
        onDismiss();
      });

      // 2回目は発火しない (高々1回)
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("[V-12a 正常系] iOS: onDismiss が届くまで onClosed は発火せず、届いた時点で1回だけ発火する", () => {
      platformState.OS = "ios";
      vi.useFakeTimers();
      __resetModalMountRegistry();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>normal-ios-marker</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>normal-ios-marker</>
        </SlideUpModal>,
      );

      advanceBy(SLIDE_DURATION);
      // まだ onDismiss が来ていない時点では発火しない
      expect(onClosed).not.toHaveBeenCalled();

      const onDismiss = getLatestSelectOnDismiss();
      act(() => {
        onDismiss();
      });

      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("[V-12b 異常系] iOS: onDismiss が届かない場合でも、フェイルセーフにより最終的に1回だけ発火する", () => {
      platformState.OS = "ios";
      vi.useFakeTimers();
      __resetModalMountRegistry();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>failsafe-only-marker</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>failsafe-only-marker</>
        </SlideUpModal>,
      );

      advanceBy(SLIDE_DURATION);
      expect(onClosed).not.toHaveBeenCalled();

      // onDismiss を一切発火させないまま、フェイルセーフのタイマーだけを進める
      fireNextTimer();

      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("[V-10 補足] Android では onDismiss を待たずに visible=false 直後で確定するため、この reopen 競合は起きない (対照確認)", () => {
      platformState.OS = "android";
      vi.useFakeTimers();
      __resetModalMountRegistry();
      const onClosed = vi.fn();
      const { rerender } = render(
        <SlideUpModal visible onClose={vi.fn()} onClosed={onClosed}>
          <>android-marker</>
        </SlideUpModal>,
      );

      rerender(
        <SlideUpModal visible={false} onClose={vi.fn()} onClosed={onClosed}>
          <>android-marker</>
        </SlideUpModal>,
      );

      // Android は SLIDE_DURATION 経過だけで確定する (onDismiss 不要)
      advanceBy(SLIDE_DURATION);
      expect(onClosed).toHaveBeenCalledTimes(1);
    });
  });
});
