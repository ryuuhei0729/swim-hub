"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * 一度表示したサーバーの描画 (renderId) を覚えておく。
 * モジュールのスコープに置くので、ページを読み直すまで (= タブの中で) 有効。
 */
const shownRenderIds = new Set<string>();

interface FreshServerRenderProps {
  /** サーバーで描画するたびに新しく作る ID (crypto.randomUUID() など) */
  renderId: string;
  /** 最新の描画を取り直している間に出すもの (ページの loading.tsx と同じ見た目) */
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * ページ遷移のキャッシュで使い回された「古いサーバーの描画」を表示させないための囲い。
 *
 * next.config.mjs の staleTimes により、30秒以内に同じ URL を開き直すと前回の描画が
 * 使い回される。一覧の表示なら少し古くても害は小さいが、サーバーから受け取ったデータを
 * フォームの初期値にする入力画面 (記録・エントリー・練習ログの代理入力) では、
 * 保存前の内容でフォームが開き、もう一度保存すると重複登録や上書き (データ消失) になる。
 *
 * 描画ごとの ID を覚えておき、すでに表示したことのある描画がもう一度表示されようとしたら
 * (= キャッシュの使い回し)、中身を出さずに router.refresh() で最新を取り直す。
 * 時刻ではなく ID で判定するので、端末とサーバーの時計のずれに左右されない。
 *
 * 中身は renderId を key にして描画するので、最新の描画が届くと作り直され、
 * フォームの初期値も新しいデータから組み立て直される。
 */
export function FreshServerRender({ renderId, fallback, children }: FreshServerRenderProps) {
  const router = useRouter();
  // この画面がすでに表示を引き受けた描画の ID。開発時の StrictMode による
  // 二重のマウントで「2回目の表示」と誤判定しないために使う (ref は二重マウントでも保たれる)
  const ownedRenderIdRef = useRef<string | null>(null);

  const isReusedRender =
    shownRenderIds.has(renderId) && ownedRenderIdRef.current !== renderId;

  useEffect(() => {
    if (isReusedRender) {
      router.refresh();
      return;
    }
    shownRenderIds.add(renderId);
    ownedRenderIdRef.current = renderId;
  }, [isReusedRender, renderId, router]);

  if (isReusedRender) return <>{fallback}</>;
  return <Fragment key={renderId}>{children}</Fragment>;
}

/**
 * この画面のマウントが「使い回されたサーバーの描画」によるものかを返す (マウント時の値で固定)。
 *
 * FreshServerRender と違って中身は出したまま、呼び出し側の判断 (キャッシュを信用せず取り直す
 * など) に使う。サーバーで描画したばかりの初回は false、30秒以内に開き直して前回の描画が
 * 使い回されたときは true。renderId が無ければ常に false。
 */
export function useIsReusedServerRender(renderId: string | undefined): boolean {
  // StrictMode の二重描画でも初期化は「まだ表示していない」状態で2回呼ばれるだけなので、
  // 二重マウントを使い回しと誤判定しない (ID を覚えるのは effect の中)
  const [isReused] = useState(() => renderId !== undefined && shownRenderIds.has(renderId));
  useEffect(() => {
    if (renderId !== undefined) shownRenderIds.add(renderId);
  }, [renderId]);
  return isReused;
}

/** テスト用: 覚えている描画の ID を忘れる */
export function resetShownRenderIdsForTest(): void {
  shownRenderIds.clear();
}
