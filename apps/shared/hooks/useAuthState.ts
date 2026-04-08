import { useState, useEffect } from "react";
import type { SupabaseClient, User, Session } from "@supabase/supabase-js";
import type { BaseAuthState } from "../types/auth";

/**
 * 3アプリ共通: Supabase の onAuthStateChange を wrap した認証状態管理 hook
 *
 * Provider 実装はプラットフォーム依存のため各アプリに残し、
 * このhookで共通のセッション監視ロジックを提供する。
 */
export function useAuthState(supabase: SupabaseClient | null): BaseAuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 認証状態の変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    // 初期セッションを明示的に取得（onAuthStateChange が呼ばれない場合のフォールバック）
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
          setSession(null);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { user, session, loading };
}
