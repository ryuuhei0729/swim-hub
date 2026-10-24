import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, MockInstance } from "vitest";

import { useUnsavedChangesWarning } from "../../hooks/useUnsavedChangesWarning";

describe("useUnsavedChangesWarning", () => {
  let addEventListenerSpy: MockInstance;
  let removeEventListenerSpy: MockInstance;
  let historyBackSpy: MockInstance;
  let historyGoSpy: MockInstance;
  let historyPushStateSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    historyBackSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    historyGoSpy = vi.spyOn(window.history, "go").mockImplementation(() => {});
    historyPushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    historyBackSpy.mockRestore();
    historyGoSpy.mockRestore();
    // 個別のテストで差し替えた history.length 等も戻す
    vi.restoreAllMocks();
    historyPushStateSpy.mockRestore();
  });

  describe("handleClose", () => {
    it("未保存の変更がある場合はfalseを返す", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      let returnValue: boolean;
      act(() => {
        returnValue = result.current.handleClose();
      });

      expect(returnValue!).toBe(false);
    });

    it("未保存の変更がない場合はtrueを返す", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: false,
          isSubmitted: false,
        }),
      );

      let returnValue: boolean;
      act(() => {
        returnValue = result.current.handleClose();
      });

      expect(returnValue!).toBe(true);
    });

    it("未保存の変更がある場合に確認ダイアログを表示する", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(result.current.showConfirmDialog).toBe(false);

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(true);
      expect(result.current.confirmContext).toBe("close");
    });

    it("未保存の変更がない場合は確認ダイアログを表示しない", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: false,
          isSubmitted: false,
        }),
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(false);
    });
  });

  describe("isSubmittedによる警告バイパス", () => {
    it("isSubmitted=trueの場合、未保存の変更があってもtrueを返す", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: true,
        }),
      );

      const returnValue = result.current.handleClose();

      expect(returnValue).toBe(true);
    });

    it("isSubmitted=trueの場合、確認ダイアログを表示しない", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: true,
        }),
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(false);
    });
  });

  describe("イベントリスナーの登録と解除", () => {
    it("isOpen=true かつ hasUnsavedChanges=true の場合、beforeunloadリスナーが登録される", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    });

    it("isOpen=true かつ hasUnsavedChanges=true の場合、popstateリスナーが登録される", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(addEventListenerSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    });

    it("isOpen=false の場合、イベントリスナーが登録されない", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: false,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
      expect(addEventListenerSpy).not.toHaveBeenCalledWith("popstate", expect.any(Function));
    });

    it("hasUnsavedChanges=false の場合、イベントリスナーが登録されない", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: false,
          isSubmitted: false,
        }),
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
      expect(addEventListenerSpy).not.toHaveBeenCalledWith("popstate", expect.any(Function));
    });

    it("isSubmitted=true の場合、イベントリスナーが登録されない", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: true,
        }),
      );

      expect(addEventListenerSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
      expect(addEventListenerSpy).not.toHaveBeenCalledWith("popstate", expect.any(Function));
    });

    it("アンマウント時にイベントリスナーが解除される", () => {
      const { unmount } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    });

    it("history.pushStateがマウント時に呼ばれる", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(historyPushStateSpy).toHaveBeenCalledWith(null, "", window.location.href);
    });
  });

  describe("popstateイベントによる確認ダイアログ", () => {
    it("popstateイベント発火時に確認ダイアログが表示される", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      expect(result.current.showConfirmDialog).toBe(false);

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.showConfirmDialog).toBe(true);
      expect(result.current.confirmContext).toBe("back");
    });

    it("popstateイベント発火時にhistory.pushStateが呼ばれる（戻るを防ぐため）", () => {
      renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      historyPushStateSpy.mockClear();

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(historyPushStateSpy).toHaveBeenCalledWith(null, "", window.location.href);
    });
  });

  describe("handleConfirmClose", () => {
    it("confirmContext=backの場合、history.go(-2) で popstate 時に積み直した分も越えて戻る", () => {
      // 戻り先がある: [直前のページ, このページ, 積み直し]
      vi.spyOn(window.history, "length", "get").mockReturnValue(3);
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      // popstateをシミュレートしてconfirmContext='back'に設定
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.confirmContext).toBe("back");

      act(() => {
        result.current.handleConfirmClose();
      });

      // history.back() (1つ戻る) は積み直した同じ URL に着くだけでページを離れない
      expect(historyGoSpy).toHaveBeenCalledWith(-2);
      expect(historyBackSpy).not.toHaveBeenCalled();
    });

    it("confirmContext=back で離れるとき、ブラウザ標準の離脱確認 (beforeunload) は重ねて出さない", () => {
      vi.spyOn(window.history, "length", "get").mockReturnValue(3);
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({ isOpen: true, hasUnsavedChanges: true, isSubmitted: false }),
      );
      const fireBeforeUnload = () => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      // 対照: 確認前は標準の離脱確認を出す
      expect(fireBeforeUnload()).toBe(true);

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      act(() => {
        result.current.handleConfirmClose();
      });

      // go(-2) で別ドキュメントへ戻るときに発火する beforeunload を止めない
      expect(fireBeforeUnload()).toBe(false);
    });

    it("confirmContext=back でも戻り先が無い (履歴の先頭で開いた) なら、ダイアログを閉じて留まり、離脱確認は効いたまま", () => {
      // 戻り先が無い: [このページ, 積み直し]
      vi.spyOn(window.history, "length", "get").mockReturnValue(2);
      const onCloseMock = vi.fn();
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
          onClose: onCloseMock,
        }),
      );

      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      act(() => {
        result.current.handleConfirmClose();
      });

      expect(result.current.showConfirmDialog).toBe(false);
      expect(historyGoSpy).not.toHaveBeenCalled();
      // onClose (アプリ内の離脱先へ移る処理) は close 文脈専用で、ここでは呼ばない
      expect(onCloseMock).not.toHaveBeenCalled();

      // 留まったので、タブを閉じる・リロードの離脱確認は効いたまま
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);

      // 次のブラウザバックでも確認ダイアログを出す (popstate を無視するフラグが残っていない)
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(result.current.showConfirmDialog).toBe(true);
    });

    it("confirmContext=closeの場合、onCloseが呼ばれる", () => {
      const onCloseMock = vi.fn();
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
          onClose: onCloseMock,
        }),
      );

      // handleCloseでconfirmContext='close'に設定
      act(() => {
        result.current.handleClose();
      });

      expect(result.current.confirmContext).toBe("close");

      act(() => {
        result.current.handleConfirmClose();
      });

      expect(onCloseMock).toHaveBeenCalled();
      expect(historyBackSpy).not.toHaveBeenCalled();
      expect(historyGoSpy).not.toHaveBeenCalled();
    });

    it("handleConfirmClose後に確認ダイアログが閉じる", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(true);

      act(() => {
        result.current.handleConfirmClose();
      });

      expect(result.current.showConfirmDialog).toBe(false);
    });
  });

  describe("handleCancelClose", () => {
    it("確認ダイアログを閉じる", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(true);

      act(() => {
        result.current.handleCancelClose();
      });

      expect(result.current.showConfirmDialog).toBe(false);
    });
  });

  describe("モーダルが閉じた時のリセット", () => {
    it("isOpen=falseに変わった時にshowConfirmDialogがリセットされる", () => {
      const { result, rerender } = renderHook(
        ({ isOpen }) =>
          useUnsavedChangesWarning({
            isOpen,
            hasUnsavedChanges: true,
            isSubmitted: false,
          }),
        { initialProps: { isOpen: true } },
      );

      act(() => {
        result.current.handleClose();
      });

      expect(result.current.showConfirmDialog).toBe(true);

      rerender({ isOpen: false });

      expect(result.current.showConfirmDialog).toBe(false);
    });
  });

  describe("コールバックの安定性", () => {
    it("handleCloseは依存関係が変わらない限り同じ参照を保つ", () => {
      const { result, rerender } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      const firstCallback = result.current.handleClose;

      rerender();

      expect(result.current.handleClose).toBe(firstCallback);
    });

    it("handleCancelCloseは再レンダリングしても同じ参照を保つ", () => {
      const { result, rerender } = renderHook(() =>
        useUnsavedChangesWarning({
          isOpen: true,
          hasUnsavedChanges: true,
          isSubmitted: false,
        }),
      );

      const firstCallback = result.current.handleCancelClose;

      rerender();

      expect(result.current.handleCancelClose).toBe(firstCallback);
    });
  });
});
