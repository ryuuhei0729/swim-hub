'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Database } from '@swim-hub/shared/types/database'
import { useRouter } from 'next/navigation'
import { getQueryClient } from '@/providers/QueryProvider'
import { AuthState, AuthContextType } from '@/types'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
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
  }, [supabase])

  // サインアップ
  const signUp = useCallback(async (email: string, password: string, name?: string) => {
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
  }, [supabase])

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
    try {
      // 本番環境では環境変数、開発環境ではwindow.location.originを使用
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/api/auth/callback?redirect_to=/update-password`
      })
      
      if (error) {
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { error: null }
    } catch (error) {
      console.error('Password reset error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

  // パスワード更新
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })
      
      if (error) {
        return { error: error as import('@supabase/supabase-js').AuthError }
      }
      
      return { error: null }
    } catch (error) {
      console.error('Password update error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

  // プロフィール更新（React Queryのミューテーションに移行予定）
  const updateProfile = useCallback(async (updates: Partial<import('@apps/shared/types/database').UserProfile>) => {
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
        
        // ログイン/ログアウト時にページをリフレッシュ
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          // ログアウト時はReact Queryのキャッシュをクリア（セキュリティとデータ整合性のため）
          if (event === 'SIGNED_OUT') {
            const queryClient = getQueryClient()
            queryClient.clear()
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

    // クリーンアップ関数
    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [router, supabase])

  const value: AuthContextType = {
    ...authState,
    supabase,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    isAuthenticated: !!authState.user,
    isLoading: authState.loading
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
