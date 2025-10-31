'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { User, Session, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import type { Database } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { UserProfile, AuthState, AuthContextType } from '@/types'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true
  })

  // ユーザープロフィールを取得（完全オプション化）
  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      
      // プロフィール取得はタイムアウト付きで実行
      const profilePromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Profile fetch timeout')), 1000)
      })
      
      const { data, error } = await Promise.race([profilePromise, timeoutPromise])
      
      if (error) {
        
        // ユーザーが存在しない場合（PGRST116エラー）、デフォルトプロフィールを作成
        if (error.code === 'PGRST116') {
          if (process.env.NODE_ENV === 'development') {
          }
          
          try {
            const { data: newProfile, error: createError } = await (supabase as any)
              .from('users')
              .insert({
                id: userId,
                name: 'ユーザー',
                gender: 0,
                bio: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .select()
              .single()
            
            if (createError) {
              console.error('AuthProvider: Failed to create profile:', createError)
              return null
            }
            
            return newProfile
          } catch (createErr) {
            console.error('AuthProvider: Error creating profile:', createErr)
            return null
          }
        }
        
        // その他のエラーの場合は null を返すが、認証には影響しない
        return null
      }
      
      return data
    } catch (error) {
      // プロフィール取得失敗は認証状態に影響しない
      return null
    }
  }, [supabase])


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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name || ''
          },
          // メール認証後のリダイレクト先を設定
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect_to=/dashboard`
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
      
      return { error: null }
    } catch (error) {
      console.error('Sign out error:', error)
      return { error: error as import('@supabase/supabase-js').AuthError }
    }
  }, [supabase])

  // パスワードリセット
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?redirect_to=/update-password`
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

  // プロフィール更新
  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    try {
      if (!authState.user) {
        return { error: new Error('User not authenticated') }
      }
      
      const { error } = await (supabase as any)
        .from('users')
        .update(updates)
        .eq('id', authState.user.id)
      
      if (error) {
        return { error }
      }
      
      // プロフィールを再取得
      const updatedProfile = await fetchUserProfile(authState.user.id)
      if (updatedProfile) {
        setAuthState(prev => ({ ...prev, profile: updatedProfile }))
      }
      
      return { error: null }
    } catch (error) {
      console.error('Profile update error:', error)
      return { error }
    }
  }, [authState.user, supabase, fetchUserProfile]) // fetchUserProfileを依存配列に追加

  useEffect(() => {
    let isMounted = true

    // 認証状態の変更を監視（初期セッション取得も含む）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) {
          return
        }

        let profile = null
        if (session?.user) {
          try {
            profile = await fetchUserProfile(session.user.id)
          } catch (error) {
            console.error('Profile fetch error:', error)
            // プロフィール取得に失敗してもローディングは終了する
            profile = null
          }
        }
        
        setAuthState({
          user: session?.user ?? null,
          session,
          profile,
          loading: false
        })
        
        // ログイン/ログアウト時にページをリフレッシュ
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
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
  }, [router, supabase, fetchUserProfile]) // fetchUserProfileを依存配列に追加

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
