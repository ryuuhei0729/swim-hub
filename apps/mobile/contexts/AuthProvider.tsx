import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@swim-hub/shared/types/database'
import type { AuthState, AuthContextType } from '@swim-hub/shared/types/auth'
import { getQueryClient } from '@/providers/QueryProvider'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true
  })

  // ログイン
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) {
        return { data: null, error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { data: data ? { user: data.user, session: data.session } : null, error: null }
    } catch (error) {
      console.error('Sign in error:', error)
      return { data: null, error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // サインアップ
  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      // モバイルアプリでは、メール認証のリダイレクトURLは後で実装（Phase 2.2で対応）
      // 現時点では空文字列を使用
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || ''
          }
          // メール認証のリダイレクトURLは後で実装
        }
      })
      
      if (error) {
        return { data: null, error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { data: data ? { user: data.user, session: data.session } : null, error: null }
    } catch (error) {
      console.error('Sign up error:', error)
      return { data: null, error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // OAuthログイン
  const signInWithOAuth = useCallback(async (provider: 'google', options?: { redirectTo?: string; scopes?: string }) => {
    if (!supabase) {
      return { error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: options?.redirectTo,
          scopes: options?.scopes,
        }
      })
      
      if (error) {
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { error: null }
    } catch (error) {
      console.error('OAuth sign in error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // ログアウト
  const signOut = useCallback(async () => {
    if (!supabase) {
      return { error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      // React Queryのキャッシュをクリア（セキュリティとデータ整合性のため）
      const queryClient = getQueryClient()
      queryClient.clear()
      
      // Zustandストアを全てリセット（セキュリティとデータ整合性のため）
      const [
        { usePracticeFormStore },
        { usePracticeFilterStore },
        { usePracticeTimeStore },
        { useCompetitionFormStore },
        { useRecordFormStore },
        { useRecordFilterStore },
      ] = await Promise.all([
        import('@/stores/practiceFormStore'),
        import('@/stores/practiceFilterStore'),
        import('@/stores/practiceTimeStore'),
        import('@/stores/competitionFormStore'),
        import('@/stores/recordFormStore'),
        import('@/stores/recordFilterStore'),
      ])
      
      usePracticeFormStore.getState().reset()
      usePracticeFilterStore.getState().reset()
      usePracticeTimeStore.getState().reset()
      useCompetitionFormStore.getState().reset()
      useRecordFormStore.getState().reset()
      useRecordFilterStore.getState().reset()
      
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      // モバイルアプリでは、パスワードリセットのリダイレクトURLは後で実装（Phase 2.3で対応）
      // 現時点では空文字列を使用
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // リダイレクトURLは後で実装
      })
      
      if (error) {
        return { data: null, error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { data: null, error: null }
    } catch (error) {
      console.error('Password reset error:', error)
      return { data: null, error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // パスワード更新
  const updatePassword = useCallback(async (newPassword: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) {
        return { data: null, error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { data: data ? { user: data.user } : null, error: null }
    } catch (error) {
      console.error('Password update error:', error)
      return { data: null, error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // プロフィール更新
  const updateProfile = useCallback(async (updates: Partial<import('@swim-hub/shared/types/database').UserProfile>) => {
    if (!supabase) {
      return { error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      if (!authState.user) {
        return { error: new Error('User not authenticated') as unknown as import('@supabase/supabase-js').AuthError }
      }
      
      const userUpdate: Database['public']['Tables']['users']['Update'] = updates
      const { error } = await supabase
        .from('users')
        // @ts-expect-error: Supabaseの型推論がupdateでneverになる既知の問題のため
        .update(userUpdate)
        .eq('id', authState.user.id)
      
      if (error) {
        return { error: (error as unknown) as import('@supabase/supabase-js').AuthError }
      }
      
      return { error: null }
    } catch (error) {
      console.error('Profile update error:', error)
      return { error: (error as unknown) as import('@supabase/supabase-js').AuthError }
    }
  }, [authState.user])

  useEffect(() => {
    let isMounted = true

    // Supabaseクライアントが初期化されていない場合の処理
    if (!supabase) {
      console.error('Supabaseクライアントが初期化されていません')
      setAuthState({
        user: null,
        session: null,
        loading: false
      })
      return
    }

    // タイムアウト設定（10秒後にloadingをfalseにする）
    const timeoutId = setTimeout(() => {
      if (isMounted && authState.loading) {
        console.warn('認証状態の確認がタイムアウトしました')
        setAuthState(prev => ({
          ...prev,
          loading: false
        }))
      }
    }, 10000)

    // 認証状態の変更を監視（初期セッション取得も含む）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) {
          return
        }
        
        clearTimeout(timeoutId)
        
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })
        
        // ログアウト時は全てのキャッシュをクリア（セキュリティとデータ整合性のため）
        if (event === 'SIGNED_OUT') {
          const queryClient = getQueryClient()
          queryClient.clear()
          
          // Zustandストアを全てリセット
          Promise.all([
            import('@/stores/practiceFormStore'),
            import('@/stores/practiceFilterStore'),
            import('@/stores/practiceTimeStore'),
            import('@/stores/competitionFormStore'),
            import('@/stores/recordFormStore'),
            import('@/stores/recordFilterStore'),
          ]).then(([
            { usePracticeFormStore },
            { usePracticeFilterStore },
            { usePracticeTimeStore },
            { useCompetitionFormStore },
            { useRecordFormStore },
            { useRecordFilterStore },
          ]) => {
            usePracticeFormStore.getState().reset()
            usePracticeFilterStore.getState().reset()
            usePracticeTimeStore.getState().reset()
            useCompetitionFormStore.getState().reset()
            useRecordFormStore.getState().reset()
            useRecordFilterStore.getState().reset()
          }).catch((error) => {
            console.warn('ストアのリセットに失敗:', error)
          })
        }
      }
    )

    // 初期セッションを明示的に取得（onAuthStateChangeが呼ばれない場合のフォールバック）
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        clearTimeout(timeoutId)
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })
      }
    }).catch((error) => {
      console.error('初期セッション取得エラー:', error)
      if (isMounted) {
        clearTimeout(timeoutId)
        setAuthState({
          user: null,
          session: null,
          loading: false
        })
      }
    })

    // クリーンアップ関数
    return () => {
      isMounted = false
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  // supabaseがnullの場合のフォールバック（実際には使用されない）
  const value: AuthContextType = {
    ...authState,
    supabase: supabase || ({} as any),
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    isAuthenticated: !!authState.user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
