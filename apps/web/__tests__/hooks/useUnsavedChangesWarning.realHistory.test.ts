// @vitest-environment jsdom
/**
 * useUnsavedChangesWarning — 実際の履歴でのブラウザバック (history をモックしない)
 *
 * 背景: ブラウザバックの確認で「戻る」を選んでもページを離れなかった (オンボーディング画面で実害)。
 * フックは popstate 時に同じ URL を積み直してページに留めるため、確認後に history.back() で
 * 1つ戻っても、積み直しの手前の同じ URL に着くだけだった。
 *
 * ここでは jsdom の実物の history で「/before → /page (このフックを使う画面) → ブラウザバック →
 * 確認で戻る」を再現し、/before に着くことを確かめる。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

beforeEach(() => {
  window.history.replaceState(null, "", "/before");
  window.history.pushState(null, "", "/page");
});

describe("useUnsavedChangesWarning (実際の履歴)", () => {
  it("ブラウザバックで出た確認で「戻る」を選ぶと、このページを離れて直前のページへ移る", async () => {
    const { result } = renderHook(() =>
      useUnsavedChangesWarning({ isOpen: true, hasUnsavedChanges: true, isSubmitted: false }),
    );

    // ブラウザバック: ページに留まり、確認ダイアログが出る
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(result.current.showConfirmDialog).toBe(true));
    expect(result.current.confirmContext).toBe("back");
    expect(window.location.pathname).toBe("/page");

    // 確認で「戻る」
    act(() => {
      result.current.handleConfirmClose();
    });

    await waitFor(() => expect(window.location.pathname).toBe("/before"));
    // 2つ戻る移動で発火する popstate を確認ダイアログとして扱わない (ignorePopStateRef)
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.showConfirmDialog).toBe(false);
  });

  it("確認でキャンセルすれば、このページに留まる", async () => {
    const { result } = renderHook(() =>
      useUnsavedChangesWarning({ isOpen: true, hasUnsavedChanges: true, isSubmitted: false }),
    );

    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(result.current.showConfirmDialog).toBe(true));

    act(() => {
      result.current.handleCancelClose();
    });

    expect(result.current.showConfirmDialog).toBe(false);
    expect(window.location.pathname).toBe("/page");
  });
});
