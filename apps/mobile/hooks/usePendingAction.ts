"use client";

// =============================================================================
// usePendingAction - 削除などの操作を「同時に1つだけ」実行するためのフック
// =============================================================================
//
// 低速回線では削除リクエストが返ってくるまで数秒〜数十秒かかる。その間に同じボタンを
// もう一度押せると、確認ダイアログが二重に出たり、2回目の削除が「0件削除」で静かに
// 成功扱いになったりする。実行中の対象を state と ref の両方で持ち、
// - ref: 同じ描画フレーム内の連打も確実に弾く
// - state: ボタンの無効化・スピナー表示に使う
// という役割分担にしている。

import { useCallback, useRef, useState } from "react";

export interface PendingAction {
  /** 実行中の対象 (例: 削除中の id)。何も実行していなければ null */
  pendingKey: string | null;
  /** 何かを実行中か */
  isPending: boolean;
  /**
   * action を実行する。すでに別の操作を実行中なら何もせず false を返す。
   * action が投げた例外はそのまま呼び出し元へ伝わる。
   */
  run: (key: string, action: () => Promise<void>) => Promise<boolean>;
  /** 描画を待たずに実行中かを確かめる (確認ダイアログを開く前のチェック用) */
  isBusy: () => boolean;
}

export function usePendingAction(): PendingAction {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    if (pendingRef.current !== null) return false;
    pendingRef.current = key;
    setPendingKey(key);
    try {
      await action();
      return true;
    } finally {
      pendingRef.current = null;
      setPendingKey(null);
    }
  }, []);

  const isBusy = useCallback(() => pendingRef.current !== null, []);

  return { pendingKey, isPending: pendingKey !== null, run, isBusy };
}
