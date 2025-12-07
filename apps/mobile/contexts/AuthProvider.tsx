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

  // ログアウト
  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      // React Queryのキャッシュをクリア（セキュリティとデータ整合性のため）
      const queryClient = getQueryClient()
      queryClient.clear()
      
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [])

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
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

    // 認証状態の変更を監視（初期セッション取得も含む）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) {
          return
        }
        
        setAuthState({
          user: session?.user ?? null,
          session,
          loading: false
        })
        
        // ログアウト時はReact Queryのキャッシュをクリア（セキュリティとデータ整合性のため）
        if (event === 'SIGNED_OUT') {
          const queryClient = getQueryClient()
          queryClient.clear()
        }
      }
    )

    // クリーンアップ関数
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value: AuthContextType = {
    ...authState,
    supabase,
    signIn,
    signUp,
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
