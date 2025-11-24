import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from '@/contexts/AuthProvider'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}))

type AuthCallback = (
  event: string,
  session: { user: { id: string; email?: string | null } | null; [key: string]: unknown } | null
) => void

let currentSupabase: ReturnType<typeof buildSupabaseMock>
const createClientMock = vi.hoisted(() => vi.fn(() => currentSupabase))

vi.mock('@/lib/supabase', () => ({
  createClient: createClientMock,
}))

function buildSupabaseMock() {
  const profileData = {
    id: 'user-1',
    name: 'ユーザー',
  }

  const profileSingleMock = vi.fn().mockImplementation(() =>
    Promise.resolve({ data: { ...profileData }, error: null })
  )
  const profileEqMock = vi.fn(() => ({
    single: profileSingleMock,
  }))
  const profileSelectMock = vi.fn(() => ({
    eq: profileEqMock,
  }))

  const updateMock = vi.fn((updates: Partial<typeof profileData>) => ({
    eq: vi.fn(() => {
      Object.assign(profileData, updates)
      return Promise.resolve({ error: null })
    }),
  }))

  const authCallbacks: AuthCallback[] = []

  return {
    auth: {
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        authCallbacks.push(callback)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' }, session: { access_token: 'token' } },
        error: null,
      }),
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' }, session: { access_token: 'token' } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: profileSelectMock,
          update: updateMock,
        }
      }
      return {
        update: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      }
    }),
    _mocks: {
      profileData,
      profileSingleMock,
      profileSelectMock,
      updateMock,
      authCallbacks,
    },
  }
}

const TestConsumer = ({ onReady }: { onReady: (value: ReturnType<typeof useAuth>) => void }) => {
  const auth = useAuth()
  onReady(auth)
  return null
}

describe('AuthProvider', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    createClientMock.mockClear()
    currentSupabase = buildSupabaseMock()
    window.history.pushState({}, '', '/dashboard')
  })

  it('throws when useAuth is used outside provider', () => {
    const Outside = () => {
      useAuth()
      return null
    }

    expect(() => render(<Outside />)).toThrow('useAuth must be used within an AuthProvider')
  })

  it('provides authenticated state after auth event and refreshes router', async () => {
    let contextValue: ReturnType<typeof useAuth> | undefined

    render(
      <AuthProvider>
        <TestConsumer onReady={(value) => (contextValue = value)} />
      </AuthProvider>
    )

    const authCallback: AuthCallback = currentSupabase._mocks.authCallbacks[0]
    await act(async () => {
      await authCallback('SIGNED_IN', {
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token' },
      })
    })

    await waitFor(() => {
      expect(contextValue?.isLoading).toBe(false)
      expect(contextValue?.user?.id).toBe('user-1')
    })

    expect(refreshMock).toHaveBeenCalled()
  })

  it('wraps auth helpers', async () => {
    let contextValue: ReturnType<typeof useAuth> | undefined

    render(
      <AuthProvider>
        <TestConsumer onReady={(value) => (contextValue = value)} />
      </AuthProvider>
    )

    const authCallback: AuthCallback = currentSupabase._mocks.authCallbacks[0]
    await act(async () => {
      await authCallback('SIGNED_IN', {
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token' },
      })
    })

    const auth = contextValue!

    await auth.signIn('mail@example.com', 'password')
    expect(currentSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'mail@example.com',
      password: 'password',
    })

    await auth.signUp('mail@example.com', 'password', 'Swimmer')
    expect(currentSupabase.auth.signUp).toHaveBeenCalled()

    await auth.signOut()
    expect(currentSupabase.auth.signOut).toHaveBeenCalled()

    await auth.resetPassword('reset@example.com')
    expect(currentSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('reset@example.com', expect.any(Object))

    await auth.updatePassword('new-password')
    expect(currentSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password' })
  })

  it('プロフィールを更新する', async () => {
    let contextValue: ReturnType<typeof useAuth> | undefined

    render(
      <AuthProvider>
        <TestConsumer onReady={(value) => (contextValue = value)} />
      </AuthProvider>
    )

    const authCallback: AuthCallback = currentSupabase._mocks.authCallbacks[0]
    await act(async () => {
      await authCallback('SIGNED_IN', {
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token' },
      })
    })

    currentSupabase._mocks.profileData.name = '更新済み'

    let result: Awaited<ReturnType<NonNullable<ReturnType<typeof useAuth>>['updateProfile']>> | undefined
    await act(async () => {
      result = await contextValue!.updateProfile({ name: '更新済み' })
    })
    expect(result?.error).toBeNull()
    expect(currentSupabase._mocks.updateMock).toHaveBeenCalledWith({ name: '更新済み' })
  })
})


