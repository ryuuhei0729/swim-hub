'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Database } from '@swim-hub/shared/types/database'
import type { Session } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { getQueryClient } from '@/providers/QueryProvider'
import { AuthState, AuthContextType } from '@swim-hub/shared/types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter()
  // ブラウザ環境でのみSupabaseクライアントを作成（ビルド時の静的生成を回避）
  const supabase = useMemo((): SupabaseClient<Database> | null => {
    // サーバー側（ビルド時）では実行しない
    if (typeof window === 'undefined') {
      // サーバー側ではnullを返す（実際には使用されない）
      return null
    }
    try {
      return createClient()
    } catch (error) {
      // 環境変数が設定されていない場合のエラーハンドリング
      console.error('Supabaseクライアントの作成に失敗しました:', error)
      // nullを返す（実際には使用されない）
      return null
    }
  }, [])
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
  }, [supabase])

  // サインアップ
  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      // 本番環境では環境変数、開発環境ではwindow.location.originを使用
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || ''
          },
          // メール認証後のリダイレクト先を設定
          emailRedirectTo: `${appUrl}/api/auth/callback?redirect_to=/dashboard`
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
  }, [supabase])

  // OAuth認証（Google）
  // createBrowserClientは自動的にCookieを使用してPKCE code verifierを保存
  const signInWithOAuth = useCallback(async (provider: 'google', options?: { redirectTo?: string; scopes?: string }) => {
    if (!supabase) {
      return { error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
      const redirectTo = options?.redirectTo || `${appUrl}/api/auth/callback?redirect_to=/dashboard`
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          scopes: options?.scopes || 'https://www.googleapis.com/auth/calendar',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })
      
      if (error) {
        console.error('OAuth signInWithOAuth error:', error)
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      // OAuthプロバイダーにリダイレクト（data.urlが存在する場合）
      if (data.url && typeof window !== 'undefined') {
        window.location.href = data.url
      }
      
      return { error: null }
    } catch (error) {
      console.error('OAuth sign in error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

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
      if (typeof window !== 'undefined') {
        const {
          useProfileStore,
          useTeamStore,
          useUIStore,
          usePracticeFormStore,
          usePracticeRecordStore,
          useCompetitionFormStore,
          useCompetitionRecordStore,
          useCompetitionFilterStore,
          usePracticeFilterStore,
          useCommonFormStore,
          useAttendanceTabStore,
          useTeamDetailStore,
          useTeamAdminStore,
          useModalStore,
        } = await import('@/stores')
        
        useProfileStore.getState().reset()
        useTeamStore.getState().reset()
        useUIStore.getState().reset()
        usePracticeFormStore.getState().reset()
        usePracticeRecordStore.getState().reset()
        useCompetitionFormStore.getState().reset()
        useCompetitionRecordStore.getState().reset()
        useCompetitionFilterStore.getState().reset()
        usePracticeFilterStore.getState().reset()
        useCommonFormStore.getState().reset()
        useAttendanceTabStore.getState().reset()
        useTeamDetailStore.getState().reset()
        useTeamAdminStore.getState().reset()
        useModalStore.getState().reset()
      }
      
      // localStorageをクリア（念のため、将来的な使用に備えて）
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.clear()
        } catch (error) {
          console.warn('localStorageのクリアに失敗:', error)
        }
      }
      
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) {
      return { data: null, error: new Error('Supabaseクライアントが初期化されていません') as import('@supabase/supabase-js').AuthError }
    }
    try {
      // 本番環境では環境変数、開発環境ではwindow.location.originを使用
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/api/auth/callback?redirect_to=/update-password`
      })
      
      if (error) {
        return { data: null, error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { data: null, error: null }
    } catch (error) {
      console.error('Password reset error:', error)
      return { data: null, error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

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
  }, [supabase])

  // プロフィール更新（React Queryのミューテーションに移行予定）
  const updateProfile = useCallback(async (updates: Partial<import('@apps/shared/types/database').UserProfile>) => {
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
  }, [authState.user, supabase])

  useEffect(() => {
    // ブラウザ環境でない場合、またはSupabaseクライアントが作成されていない場合はスキップ
    if (typeof window === 'undefined' || !supabase) {
      return
    }

    let isMounted = true

    // 認証状態の変更を監視（初期セッション取得も含む）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: string, session: Session | null) => {
        if (!isMounted) {
          return
        }
        
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })
        
        // ログイン/ログアウト時にページをリフレッシュ
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          // ログアウト時は全てのキャッシュをクリア（セキュリティとデータ整合性のため）
          if (event === 'SIGNED_OUT') {
            const queryClient = getQueryClient()
            queryClient.clear()
            
            // Zustandストアを全てリセット
            if (typeof window !== 'undefined') {
              import('@/stores').then((stores) => {
                stores.useProfileStore.getState().reset()
                stores.useTeamStore.getState().reset()
                stores.useUIStore.getState().reset()
                stores.usePracticeFormStore.getState().reset()
                stores.usePracticeRecordStore.getState().reset()
                stores.useCompetitionFormStore.getState().reset()
                stores.useCompetitionRecordStore.getState().reset()
                stores.useCompetitionFilterStore.getState().reset()
                stores.usePracticeFilterStore.getState().reset()
                stores.useCommonFormStore.getState().reset()
                stores.useAttendanceTabStore.getState().reset()
                stores.useTeamDetailStore.getState().reset()
                stores.useTeamAdminStore.getState().reset()
                stores.useModalStore.getState().reset()
              }).catch((error) => {
                console.warn('ストアのリセットに失敗:', error)
              })
              
              // localStorageをクリア
              try {
                window.localStorage.clear()
              } catch (error) {
                console.warn('localStorageのクリアに失敗:', error)
              }
            }
          }
          
          const currentPath = window.location.pathname
          const authPages = ['/login', '/signup', '/reset-password', '/auth/callback']
          const isAuthPage = authPages.some(page => currentPath.startsWith(page))
          
          if (!isAuthPage) {
            router.refresh()
          }
        }
      }
    )

    // 初期セッションを明示的に取得（onAuthStateChangeが呼ばれない場合のフォールバック）
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: import('@supabase/supabase-js').Session | null } }) => {
      if (isMounted) {
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })
      }
    }).catch((error: unknown) => {
      console.error('初期セッション取得エラー:', error)
      if (isMounted) {
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
      subscription.unsubscribe()
    }
  }, [router, supabase])

  const value: AuthContextType = {
    ...authState,
    supabase: supabase || ({} as SupabaseClient<Database>),
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
