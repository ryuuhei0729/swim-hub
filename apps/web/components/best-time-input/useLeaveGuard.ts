"use client";

// =============================================================================
// useLeaveGuard - 入力が残っている間、ページから離れる操作を確かめる
// =============================================================================
//
// App Router にはページ遷移を止める仕組みが無いので、次の3つを自前で受ける。
// - アプリ内のリンク (サイドバー・ヘッダーなど): document の capture 段階でクリックを止め、
//   確認後に router.push で同じ先へ移る (Next の Link の onClick より先に動く)
// - ブラウザの戻る: 履歴に1つ積んでおき、戻られたら積み直して確認する。離れるなら2つ戻る
//   (PracticeTabModal と同じやり方)
// - 再読み込み・タブを閉じる: beforeunload (ブラウザ標準の確認しか出せない)

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** proceed を呼ぶと、止めた操作 (リンク先への移動・戻る) をそのまま続ける */
export type LeaveAttemptHandler = (proceed: () => void) => void;

export function useLeaveGuard(active: boolean, onAttemptLeave: LeaveAttemptHandler): void {
  const router = useRouter();
  const handlerRef = useRef(onAttemptLeave);
  useEffect(() => {
    handlerRef.current = onAttemptLeave;
  }, [onAttemptLeave]);

  useEffect(() => {
    if (!active) return;
    // 「離れる」と決めた後の戻る (history.go(-2)) では、もう確かめない
    let leaving = false;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 新しいタブで開く操作は止めない
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // 同じページ内のアンカー (# だけ違う) は離れないので止めない
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      handlerRef.current(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };

    const handlePopState = () => {
      if (leaving) return;
      window.history.pushState(null, "", window.location.href);
      handlerRef.current(() => {
        leaving = true;
        window.history.go(-2);
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [active, router]);
}
