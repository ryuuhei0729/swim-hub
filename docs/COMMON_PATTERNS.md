# よくある実装パターン - Swim Manager v2

## 概要

このドキュメントは、Swim Manager v2でよく使う実装パターンのコード例をまとめたものです。コピー＆ペーストですぐに使えるようになっています。

**最終更新**: 2025年1月17日

---

## 目次

1. [GraphQLクエリ実行](#1-graphqlクエリ実行)
2. [GraphQLミューテーション実行](#2-graphqlミューテーション実行)
3. [認証チェック](#3-認証チェック)
4. [フォーム実装パターン](#4-フォーム実装パターン)
5. [モーダル管理](#5-モーダル管理)
6. [日付フォーマット](#6-日付フォーマット)
7. [タイム変換](#7-タイム変換)
8. [エラーハンドリング](#8-エラーハンドリング)
9. [ローディング状態管理](#9-ローディング状態管理)
10. [楽観的更新](#10-楽観的更新)

---

## 1. GraphQLクエリ実行

### 基本パターン

```typescript
import { useQuery } from '@apollo/client'
import { GET_CALENDAR_ENTRIES } from '@/graphql/queries'

function CalendarComponent() {
  const { data, loading, error, refetch } = useQuery(GET_CALENDAR_ENTRIES, {
    variables: { 
      startDate: '2025-01-01', 
      endDate: '2025-01-31',
      userId 
    },
    fetchPolicy: 'cache-and-network',  // キャッシュを見つつ、最新データも取得
    errorPolicy: 'all'                 // エラーがあっても部分的なデータを返す
  })

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} />
  
  return <CalendarView entries={data?.calendarEntries} />
}
```

### fetchPolicyの種類

```typescript
// キャッシュ優先（デフォルト）- 高速だがデータが古い可能性
fetchPolicy: 'cache-first'

// ネットワーク優先 - 常に最新だが遅い
fetchPolicy: 'network-only'

// キャッシュとネットワーク両方 - 高速かつ最新（推奨）
fetchPolicy: 'cache-and-network'

// キャッシュのみ - オフライン対応
fetchPolicy: 'cache-only'

// キャッシュなし - 常に最新、キャッシュ汚染なし
fetchPolicy: 'no-cache'
```

### 条件付きクエリ

```typescript
const { data } = useQuery(GET_USER_PROFILE, {
  variables: { userId },
  skip: !userId,  // userIdがない場合はクエリを実行しない
})
```

### 手動refetch

```typescript
const { data, refetch } = useQuery(GET_PRACTICES)

// ボタンクリックで再取得
const handleRefresh = async () => {
  await refetch({ userId: newUserId })
}
```

---

## 2. GraphQLミューテーション実行

### 基本パターン

```typescript
import { useMutation } from '@apollo/client'
import { CREATE_PRACTICE_LOG } from '@/graphql/mutations'

function PracticeForm() {
  const [createPracticeLog, { loading, error }] = useMutation(CREATE_PRACTICE_LOG, {
    refetchQueries: ['GetCalendarEntries', 'GetPractices'],  // 関連クエリを自動再取得
    awaitRefetchQueries: true,                               // 再取得完了を待つ
    onCompleted: (data) => {
      console.log('成功:', data)
      // 成功後の処理（モーダルを閉じる、メッセージ表示など）
    },
    onError: (error) => {
      console.error('エラー:', error)
      // エラー処理
    }
  })

  const handleSubmit = async (formData: PracticeLogFormData) => {
    try {
      await createPracticeLog({ 
        variables: { input: formData } 
      })
    } catch (error) {
      // onErrorで処理済み
    }
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      handleSubmit(practiceData)
    }}>
      {/* フォーム内容 */}
      <button type="submit" disabled={loading}>
        {loading ? '送信中...' : '送信'}
      </button>
    </form>
  )
}
```

### 複数のrefetchQueries

```typescript
const [updatePractice] = useMutation(UPDATE_PRACTICE, {
  refetchQueries: [
    'GetCalendarEntries',
    'GetPractices',
    'GetPracticeSummary',
    { query: GET_USER_STATS, variables: { userId } }  // 変数付きクエリ
  ],
})
```

### キャッシュ手動更新

```typescript
const [deletePractice] = useMutation(DELETE_PRACTICE, {
  update(cache, { data }) {
    // キャッシュから削除されたアイテムを除去
    cache.modify({
      fields: {
        practices(existingPractices = [], { readField }) {
          return existingPractices.filter(
            practiceRef => data.deletePractice.id !== readField('id', practiceRef)
          )
        }
      }
    })
  }
})
```

---

## 3. 認証チェック

### 基本パターン

```typescript
'use client'
import { useAuth } from '@/contexts/AuthProvider'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProtectedPage() {
  const { user, profile, loading, isAuthenticated } = useAuth()
  const router = useRouter()
  
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])
  
  if (loading) {
    return <LoadingSpinner />
  }
  
  if (!isAuthenticated) {
    return null  // リダイレクト中
  }
  
  return (
    <div>
      <h1>こんにちは、{profile?.name}さん</h1>
      {/* 保護されたコンテンツ */}
    </div>
  )
}
```

### AuthGuard コンポーネント

```typescript
// components/auth/AuthGuard.tsx
interface AuthGuardProps {
  children: React.ReactNode
  requiredRole?: string
  fallback?: React.ReactNode
}

export function AuthGuard({ 
  children, 
  requiredRole,
  fallback = <div>アクセス権限がありません</div>
}: AuthGuardProps) {
  const { user, profile, loading, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])

  if (loading) return <LoadingSpinner />
  if (!isAuthenticated) return null

  // ロールチェック
  if (requiredRole && profile?.role !== requiredRole) {
    return fallback
  }

  return <>{children}</>
}

// 使用例
<AuthGuard requiredRole="admin">
  <AdminPanel />
</AuthGuard>
```

---

## 4. フォーム実装パターン

### useState + バリデーション

```typescript
import { useState } from 'react'
import { format } from 'date-fns'

interface PracticeLogFormData {
  practiceDate: string
  location: string
  sets: PracticeSet[]
  note: string
}

function PracticeForm({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState<PracticeLogFormData>({
    practiceDate: format(new Date(), 'yyyy-MM-dd'),
    location: '',
    sets: [],
    note: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // バリデーション
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.practiceDate) {
      newErrors.practiceDate = '日付を入力してください'
    }
    
    if (!formData.location) {
      newErrors.location = '場所を入力してください'
    }
    
    if (formData.sets.length === 0) {
      newErrors.sets = '少なくとも1セット追加してください'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsSubmitting(true)
    
    try {
      await createPracticeLog({
        variables: { input: formData }
      })
      onClose()
    } catch (error) {
      console.error('Error:', error)
      setErrors({ submit: 'エラーが発生しました' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="practiceDate">日付</label>
        <input
          id="practiceDate"
          type="date"
          value={formData.practiceDate}
          onChange={(e) => setFormData({ ...formData, practiceDate: e.target.value })}
          className={errors.practiceDate ? 'border-red-500' : ''}
        />
        {errors.practiceDate && (
          <p className="text-red-500 text-sm">{errors.practiceDate}</p>
        )}
      </div>

      <div>
        <label htmlFor="location">場所</label>
        <input
          id="location"
          type="text"
          value={formData.location}
          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          className={errors.location ? 'border-red-500' : ''}
        />
        {errors.location && (
          <p className="text-red-500 text-sm">{errors.location}</p>
        )}
      </div>

      {errors.submit && (
        <div className="bg-red-50 p-4 rounded">
          <p className="text-red-700">{errors.submit}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? '送信中...' : '送信'}
        </button>
      </div>
    </form>
  )
}
```

---

## 5. モーダル管理

### 基本パターン

```typescript
import { useState } from 'react'

function ListComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editData, setEditData] = useState<CalendarItem | null>(null)

  // 新規追加
  const handleAdd = () => {
    setEditData(null)
    setIsModalOpen(true)
  }

  // 編集
  const handleEdit = (item: CalendarItem) => {
    setEditData(item)
    setIsModalOpen(true)
  }

  // 閉じる
  const handleClose = () => {
    setIsModalOpen(false)
    setEditData(null)
  }

  return (
    <>
      <button onClick={handleAdd}>新規追加</button>
      
      <ul>
        {items.map(item => (
          <li key={item.id}>
            {item.title}
            <button onClick={() => handleEdit(item)}>編集</button>
          </li>
        ))}
      </ul>

      {isModalOpen && (
        <Modal onClose={handleClose}>
          <Form
            initialData={editData}
            onSubmit={handleClose}
            onCancel={handleClose}
          />
        </Modal>
      )}
    </>
  )
}
```

### モーダルコンポーネント

```typescript
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* モーダル本体 */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {title && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{title}</h2>
              <button onClick={onClose}>✕</button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
```

---

## 6. 日付フォーマット

### date-fnsの基本的な使い方

```typescript
import { format, parseISO, addDays, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { ja } from 'date-fns/locale'

// 表示用フォーマット
const displayDate = format(new Date(), 'yyyy年M月d日(E)', { locale: ja })
// "2025年1月17日(金)"

// DB保存用フォーマット
const dbDate = format(new Date(), 'yyyy-MM-dd')
// "2025-01-17"

// ISO文字列をパース
const parsedDate = parseISO('2025-01-17')

// 日付の加算・減算
const tomorrow = addDays(new Date(), 1)
const yesterday = subDays(new Date(), 1)

// 月の開始・終了
const monthStart = startOfMonth(new Date())
const monthEnd = endOfMonth(new Date())
```

### よく使うフォーマット一覧

```typescript
// 年月日
format(date, 'yyyy-MM-dd')           // "2025-01-17"
format(date, 'yyyy/MM/dd')           // "2025/01/17"
format(date, 'yyyy年M月d日')          // "2025年1月17日"
format(date, 'yyyy年M月d日(E)', { locale: ja })  // "2025年1月17日(金)"

// 時刻
format(date, 'HH:mm')                // "14:30"
format(date, 'HH:mm:ss')             // "14:30:45"

// 日時
format(date, 'yyyy-MM-dd HH:mm')     // "2025-01-17 14:30"
format(date, 'M月d日(E) HH:mm', { locale: ja })  // "1月17日(金) 14:30"
```

---

## 7. タイム変換

### 分・秒 ⇔ 秒の変換

```typescript
// 分・秒 → 秒
function timeToSeconds(minutes: number, seconds: number): number {
  return (minutes * 60) + seconds
}

// 秒 → 分・秒
function secondsToTime(totalSeconds: number): { minutes: number; seconds: number } {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return { minutes, seconds }
}

// 使用例
const seconds = timeToSeconds(1, 30)  // 90秒
const { minutes, seconds: secs } = secondsToTime(90)  // { minutes: 1, seconds: 30 }
```

### タイム表示フォーマット

```typescript
// 秒 → MM:SS.ss形式
function formatTime(timeInSeconds: number): string {
  const minutes = Math.floor(timeInSeconds / 60)
  const seconds = (timeInSeconds % 60).toFixed(2)
  return `${minutes}:${seconds.padStart(5, '0')}`
}

// 使用例
formatTime(90.25)    // "1:30.25"
formatTime(65.5)     // "1:05.50"
formatTime(125.123)  // "2:05.12"

// 秒 → MM:SS形式（秒数は整数）
function formatTimeSimple(timeInSeconds: number): string {
  const minutes = Math.floor(timeInSeconds / 60)
  const seconds = Math.floor(timeInSeconds % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// 使用例
formatTimeSimple(90)   // "1:30"
formatTimeSimple(65)   // "1:05"
formatTimeSimple(125)  // "2:05"
```

### タイム入力のパース

```typescript
// "MM:SS.ss" → 秒
function parseTime(timeString: string): number {
  const [minutes, seconds] = timeString.split(':').map(Number)
  return (minutes * 60) + seconds
}

// 使用例
parseTime("1:30.25")  // 90.25
parseTime("2:05.50")  // 125.5
```

---

## 8. エラーハンドリング

### GraphQLエラーの処理

```typescript
import { ApolloError } from '@apollo/client'

function handleGraphQLError(error: ApolloError) {
  if (error.graphQLErrors) {
    error.graphQLErrors.forEach(({ message, extensions }) => {
      console.error(`GraphQL Error: ${message}`)
      
      // エラーコードに応じた処理
      if (extensions?.code === 'UNAUTHENTICATED') {
        // 認証エラー
        router.push('/login')
      } else if (extensions?.code === 'FORBIDDEN') {
        // 権限エラー
        alert('アクセス権限がありません')
      }
    })
  }

  if (error.networkError) {
    console.error(`Network Error: ${error.networkError.message}`)
    alert('ネットワークエラーが発生しました')
  }
}

// 使用例
const [createPractice] = useMutation(CREATE_PRACTICE, {
  onError: handleGraphQLError
})
```

### エラーメッセージコンポーネント

```typescript
interface ErrorMessageProps {
  error: ApolloError | Error
  onRetry?: () => void
}

function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <h3 className="text-red-800 font-semibold mb-2">
        エラーが発生しました
      </h3>
      <p className="text-red-600 text-sm mb-4">
        {error.message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          再試行
        </button>
      )}
    </div>
  )
}
```

---

## 9. ローディング状態管理

### スケルトンローディング

```typescript
function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded mb-4"></div>
      <div className="h-4 bg-gray-200 rounded mb-2"></div>
      <div className="h-4 bg-gray-200 rounded mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
    </div>
  )
}

// 使用例
function PracticeList() {
  const { data, loading } = useQuery(GET_PRACTICES)
  
  if (loading) return <LoadingSkeleton />
  
  return (
    <ul>
      {data?.practices.map(practice => (
        <li key={practice.id}>{practice.title}</li>
      ))}
    </ul>
  )
}
```

### ローディングスピナー

```typescript
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  }

  return (
    <div className="flex justify-center items-center p-4">
      <div className={`${sizeClasses[size]} border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin`}></div>
    </div>
  )
}
```

---

## 10. 楽観的更新

### 楽観的更新の基本

```typescript
const [createPractice] = useMutation(CREATE_PRACTICE, {
  optimisticResponse: {
    __typename: 'Mutation',
    createPractice: {
      __typename: 'Practice',
      id: 'temp-id',  // 一時的なID
      date: formData.date,
      place: formData.place,
      note: formData.note,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  },
  update(cache, { data }) {
    // キャッシュを手動更新
    cache.modify({
      fields: {
        practices(existingPractices = []) {
          const newPracticeRef = cache.writeFragment({
            data: data?.createPractice,
            fragment: gql`
              fragment NewPractice on Practice {
                id
                date
                place
                note
              }
            `
          })
          return [...existingPractices, newPracticeRef]
        }
      }
    })
  }
})
```

### 削除の楽観的更新

```typescript
const [deletePractice] = useMutation(DELETE_PRACTICE, {
  optimisticResponse: {
    __typename: 'Mutation',
    deletePractice: {
      __typename: 'DeleteResult',
      success: true,
      id: practiceId
    }
  },
  update(cache) {
    // キャッシュから削除
    cache.evict({ id: cache.identify({ __typename: 'Practice', id: practiceId }) })
    cache.gc()
  }
})
```

---

**最終更新**: 2025年1月17日  
**バージョン**: 1.0.0

