"use client";

import { useAuth } from "@/contexts/AuthProvider";

/**
 * ログイン中のアカウントが保護者アカウント (閲覧専用) か。
 * 保護者版の画面では書き込み系のボタン (記録の追加・エントリー・練習記録の入力など) を出さない。
 * 書き込みそのものは DB 側で拒否されるので、ここは「押せるボタンを出さない」ための判定。
 * 判定中 (null) は false として扱う (保護者版の画面は判定が済むまで出ないため)。
 */
export function useIsGuardian(): boolean {
  const { isGuardian } = useAuth();
  return isGuardian === true;
}
