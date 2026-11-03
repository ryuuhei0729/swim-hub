import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { ToastHost, type ToastItem, type ToastKind } from "@/components/ui/Toast";

export interface ToastOptions {
  kind?: ToastKind;
  /** 自動で消えるまでの時間 (ms)。省略時は種類ごとの既定値 */
  durationMs?: number;
}

export interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
  /** 「保存しました」など、操作が済んだことの知らせ */
  success: (message: string) => void;
  /** 読む時間が要るので success より長く出す */
  error: (message: string) => void;
  info: (message: string) => void;
}

/**
 * 種類ごとの表示時間。成功は「済んだ」と分かれば十分なので短く、
 * エラーは読む時間を取る (Apple HIG: 失敗こそ確実に伝える)。
 */
const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  success: 2500,
  error: 4000,
  info: 3000,
};

/**
 * Provider の外で呼ばれたときの受け皿。画面単体のテストやストーリーで
 * Provider を省いても例外にならないよう、何もしない実装を既定値にしている。
 */
const NOOP_API: ToastApi = {
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
};

const ToastContext = createContext<ToastApi>(NOOP_API);

/**
 * 画面下に出る短い知らせ (トースト) を提供する
 *
 * 「保存しました」のような、操作が済んだことを伝えるだけの知らせに使う。
 * ユーザーの返事が要るもの (削除の確認など) は従来どおり `Alert.alert` を使うこと。
 * 同時に出せるのは 1 件で、続けて出すと後の知らせに置き換わる。
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextIdRef = useRef(0);

  const show = useCallback((message: string, options?: ToastOptions) => {
    const kind = options?.kind ?? "info";
    nextIdRef.current += 1;
    setToast({
      id: nextIdRef.current,
      message,
      kind,
      durationMs: options?.durationMs ?? DEFAULT_DURATION_MS[kind],
    });
  }, []);

  // 消す対象の id を見て、置き換わった後の新しいトーストを古いタイマーが消さないようにする
  const dismiss = useCallback((id: number) => {
    setToast((current) => (current && current.id === id ? null : current));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, { kind: "success" }),
      error: (message) => show(message, { kind: "error" }),
      info: (message) => show(message, { kind: "info" }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      <View style={styles.root}>
        {children}
        <ToastHost toast={toast} onDismiss={dismiss} />
      </View>
    </ToastContext.Provider>
  );
};

/**
 * トーストを出す API を返す。`ToastProvider` の外では何もしない実装が返る。
 */
export const useToast = (): ToastApi => useContext(ToastContext);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
