# React/Next.js + Supabase ベストプラクティス

## 📋 目次

1. [プロジェクト構成](#プロジェクト構成)
2. [アーキテクチャパターン](#アーキテクチャパターン)
3. [認証とセキュリティ](#認証とセキュリティ)
4. [データ管理](#データ管理)
5. [パフォーマンス最適化](#パフォーマンス最適化)
6. [開発環境とデプロイ](#開発環境とデプロイ)
7. [エラーハンドリング](#エラーハンドリング)
8. [テストとコード品質](#テストとコード品質)

---

## 🏗️ プロジェクト構成

### モノレポ全体構造

```
/
├── apps/                    # アプリケーション群
│   ├── web/                # Next.js Webアプリ
│   │   ├── src/
│   │   │   ├── app/        # App Router
│   │   │   ├── components/ # UIコンポーネント
│   │   │   ├── hooks/      # カスタムフック
│   │   │   ├── lib/        # 外部サービス設定
│   │   │   └── ...
│   │   └── package.json
│   ├── mobile/             # Flutter モバイルアプリ
│   │   ├── lib/
│   │   │   ├── main.dart   # エントリーポイント
│   │   │   ├── screens/    # 画面（Page）
│   │   │   ├── widgets/    # UIコンポーネント
│   │   │   ├── models/     # データモデル
│   │   │   ├── services/   # API・サービス層
│   │   │   ├── providers/  # 状態管理
│   │   │   ├── utils/      # ユーティリティ
│   │   │   └── constants/  # 定数
│   │   ├── pubspec.yaml
│   │   └── android/ios/    # プラットフォーム固有
├── supabase/              # Supabase Functions
│   ├── functions/
│   │   └── graphql/       # GraphQL Edge Functions
│   └── migrations/        # データベースマイグレーション
├── packages/              # 共有パッケージ
│   ├── types/             # 共通型定義
│   │   ├── src/
│   │   │   ├── auth.ts
│   │   │   ├── database.ts
│   │   │   └── api.ts
│   │   └── package.json
│   ├── graphql-schema/    # GraphQLスキーマ
│   │   ├── src/
│   │   └── generated/
│   └── dart-types/        # Dart用型定義（生成）
│       ├── lib/
│       └── pubspec.yaml
├── package.json           # ルートpackage.json
└── README.md
```

### Next.js Web アプリ構造（理想形）

```
apps/web/
├── app/                      # 👈 アプリケーションのメイン（ルーティングとUI）
│   ├── (marketing)/          # ルートグループ（レイアウトを共有しないページ群）
│   │   ├── layout.tsx
│   │   └── page.tsx          # ランディングページなど
│   │
│   ├── (app)/                # ルートグループ（認証後メインアプリのページ群）
│   │   ├── layout.tsx        # メインアプリ共通のレイアウト（サイドバーなど）
│   │   ├── dashboard/
│   │   │   ├── _components/  # ダッシュボード"専用"のコンポーネント
│   │   │   │   └── StatsCard.tsx
│   │   │   ├── _hooks/       # ダッシュボード"専用"のカスタムフック
│   │   │   │   └── useAnalytics.ts
│   │   │   └── page.tsx      # /dashboard のページ
│   │   │
│   │   └── settings/
│   │       ├── layout.tsx
│   │       ├── page.tsx      # /settings のページ
│   │       └── ...
│   │
│   ├── api/                  # APIルート (Route Handlers)
│   │   └── ...
│   └── global-error.tsx      # グローバルなエラーUI
│
├── components/               # 👈 アプリ全体で共有する汎用コンポーネント
│   ├── ui/                   # ボタン、インプット等のUIパーツ (shadcn/uiなど)
│   │   ├── Button.tsx
│   │   └── Card.tsx
│   └── layout/               # ヘッダー、フッター等のレイアウトパーツ
│       ├── Header.tsx
│       └── Footer.tsx
│
├── lib/                      # 👈 プロジェクト固有の便利関数・クライアント設定
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── graphql/
│   │   └── client.ts
│   ├── utils.ts              # 日付フォーマットなど、汎用的な関数
│   └── validators.ts         # Zodなどを使ったスキーマ定義
│
├── hooks/                    # 👈 複数機能で横断的に使われる"グローバル"なフック
│   └── useMediaQuery.ts
│
├── contexts/                 # 👈 グローバルな状態管理 (React Context)
│   └── AuthProvider.tsx
│
├── public/                   # 画像などの静的ファイル
│
├── styles/
│   └── globals.css           # グローバルなCSS
│
├── @types/                   # グローバルな型定義
│   └── index.d.ts
│
├── next.config.mjs           # Next.js設定ファイル
└── tsconfig.json             # TypeScript設定ファイル
```

### 各ディレクトリの役割とポイント

#### `app/` (最重要)

- **機能でまとめる (Colocation)**: `dashboard` に関連するコンポーネントやフックは `dashboard` フォルダの中に置きます。これにより、機能の全体像が把握しやすくなり、修正や削除が簡単になります。

- **プライベートフォルダ (`_`)**: フォルダ名の先頭に `_` を付けると、そのフォルダはルーティングから除外されます。機能に閉じたコンポーネント (`_components`) やフック (`_hooks`) を置くのに最適で、「これはこの場所でしか使わない」という意図を明確にできます。

- **ルートグループ (`( )`)**: `(app)` や `(marketing)` のようにフォルダ名を `()` で囲むと、URLに影響を与えずに特定のページ群をグルーピングし、それぞれに異なる `layout.tsx` を適用できます。LPと認証後のアプリでレイアウトを分けたい場合に非常に便利です。

#### `components/`

- **アプリの「UIキット」**: ここには、特定の機能に依存しない、汎用的で再利用可能なコンポーネントのみを置きます。

- **`ui/`**: ボタンやカードなど、デザインシステムの最小単位となるパーツです。shadcn/ui を使うと、このディレクトリが自動的に作られます。

- **`layout/`**: アプリケーション全体の骨格となるヘッダーやフッターなどを置きます。

#### `lib/`

- **Reactに依存しないロジック**: SupabaseやGraphQLのクライアント初期化、日付のフォーマット、API通信のヘルパー関数など、ビジネスロジックや外部サービスとの接続に関するコードをここに集約します。

- **`validators.ts`**: Zod などを使ってフォームやAPIレスポンスのスキーマを定義するファイルをここに置くと、型安全性が向上します。

#### `hooks/` と `contexts/`

- **グローバルなものだけ**: ここに置くのは、アプリケーション全体で必要になるフックや状態です（例: `useMediaQuery`, 認証状態を管理する `AuthProvider`）。

- **特定のページでしか使わないフックや状態は、`app/` ディレクトリ内の機能フォルダ（例: `app/dashboard/_hooks/`）に配置します。

### 理想的な構造の原則

1. **まず `app/` の中に置けないか考える**: 関連するコンポーネントやロジックは、できるだけそれを使うページの近く（`app/feature/_components/` など）に置きます (Colocation)。

2. **複数箇所で必要になったら昇格させる**: ある機能専用だったコンポーネントが、他の機能でも必要になったら、初めて `components/` ディレクトリに「昇格」させます。

3. **Reactのコードか、ただの関数か**: Reactコンポーネントやフックは `components` や `hooks` へ。それ以外のただの関数やクラスは `lib` へ、と明確に分離します。

この原則に従うことで、プロジェクトが大きくなっても破綻しにくい、非常に見通しの良い構造を維持できます。

### 現在の構造から理想形への移行

現在の `apps/web/src/` 構造から理想形への段階的な移行を推奨します：

```typescript
// 移行例: 現在のダッシュボードコンポーネント
// 移行前: src/components/dashboard/DashboardStats.tsx
// 移行後: app/(app)/dashboard/_components/DashboardStats.tsx

// 移行例: 現在のフック
// 移行前: src/hooks/useCalendarData.ts (ダッシュボード専用)
// 移行後: app/(app)/dashboard/_hooks/useCalendarData.ts

// 移行例: グローバルフック
// 移行前: src/hooks/useAuth.ts
// 移行後: hooks/useAuth.ts (そのまま)
```

### Flutter モバイルアプリ構造

```
apps/mobile/lib/
├── main.dart              # エントリーポイント
├── app/                   # アプリ設定
│   ├── app.dart          # MaterialApp設定
│   └── routes.dart       # ルーティング設定
├── screens/               # 画面（Page）
│   ├── auth/             # 認証画面
│   │   ├── login_screen.dart
│   │   └── signup_screen.dart
│   ├── dashboard/        # ダッシュボード画面
│   │   ├── dashboard_screen.dart
│   │   └── calendar_screen.dart
│   └── profile/          # プロフィール画面
├── widgets/              # 再利用可能ウィジェット
│   ├── common/           # 共通ウィジェット
│   │   ├── app_button.dart
│   │   ├── app_text_field.dart
│   │   └── loading_indicator.dart
│   ├── calendar/         # カレンダー関連
│   └── forms/            # フォーム関連
├── models/               # データモデル
│   ├── user.dart
│   ├── practice_log.dart
│   └── record.dart
├── services/             # API・サービス層
│   ├── api_service.dart  # REST API
│   ├── graphql_service.dart # GraphQL
│   ├── auth_service.dart # 認証
│   └── storage_service.dart # ローカルストレージ
├── providers/            # 状態管理（Riverpod/Provider）
│   ├── auth_provider.dart
│   ├── calendar_provider.dart
│   └── theme_provider.dart
├── utils/                # ユーティリティ
│   ├── constants.dart    # 定数
│   ├── helpers.dart      # ヘルパー関数
│   └── validators.dart   # バリデーション
└── generated/            # 自動生成ファイル
    ├── l10n/            # 国際化
    └── assets.dart      # アセット定義
```

### ファイル命名規則

```typescript
// Next.js (TypeScript) - PascalCase
UserProfile.tsx
CalendarView.tsx
useAuth.ts
useCalendarData.ts

// Flutter (Dart) - snake_case
user_profile.dart
calendar_view.dart
auth_service.dart
api_constants.dart

// 共通パッケージ
// TypeScript: camelCase/PascalCase
formatDate.ts
API_ENDPOINTS.ts

// Dart: snake_case
format_date.dart
api_constants.dart
```

---

## 🏛️ アーキテクチャパターン

### レイヤード アーキテクチャ

```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│  (Components, Pages, UI Logic)      │
├─────────────────────────────────────┤
│         Business Logic Layer        │
│    (Custom Hooks, Services)         │
├─────────────────────────────────────┤
│         Data Access Layer           │
│  (GraphQL, Supabase Client, APIs)   │
├─────────────────────────────────────┤
│           Infrastructure            │
│   (External Services, Database)     │
└─────────────────────────────────────┘
```

### コンポーネント設計原則

```typescript
// ✅ Good: 単一責任の原則
const UserAvatar = ({ user, size = 'md' }: UserAvatarProps) => {
  return (
    <img 
      src={user.avatarUrl || '/default-avatar.png'}
      className={`rounded-full ${sizeClasses[size]}`}
      alt={`${user.name}のアバター`}
    />
  )
}

// ✅ Good: カスタムフックでロジック分離
const useUserProfile = (userId: string) => {
  const { data, loading, error } = useQuery(GET_USER_PROFILE, {
    variables: { userId }
  })
  
  return {
    user: data?.user,
    loading,
    error,
    refetch
  }
}
```

---

## 📱 Flutter + Supabase 統合

### Flutter Supabase 設定

```dart
// lib/services/supabase_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  static Future<void> initialize() async {
    await Supabase.initialize(
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
```

### Flutter GraphQL 設定

```dart
// lib/services/graphql_service.dart
import 'package:graphql_flutter/graphql_flutter.dart';
import 'supabase_service.dart';

class GraphQLService {
  static GraphQLClient? _client;

  static GraphQLClient get client {
    if (_client == null) {
      final HttpLink httpLink = HttpLink(
        const String.fromEnvironment('GRAPHQL_ENDPOINT'),
      );

      final AuthLink authLink = AuthLink(
        getToken: () async {
          final session = SupabaseService.client.auth.currentSession;
          return session?.accessToken != null 
            ? 'Bearer ${session!.accessToken}' 
            : null;
        },
      );

      final Link link = authLink.concat(httpLink);

      _client = GraphQLClient(
        link: link,
        cache: GraphQLCache(store: HiveStore()),
      );
    }
    return _client!;
  }
}
```

### Flutter 状態管理 (Riverpod)

```dart
// lib/providers/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/supabase_service.dart';

final authStateProvider = StreamProvider<AuthState>((ref) {
  return SupabaseService.client.auth.onAuthStateChange;
});

final userProvider = Provider<User?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (state) => state.session?.user,
    loading: () => null,
    error: (_, __) => null,
  );
});

// 認証サービス
final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(ref);
});

class AuthService {
  final Ref _ref;
  
  AuthService(this._ref);

  Future<AuthResponse> signIn(String email, String password) async {
    return await SupabaseService.client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  Future<void> signOut() async {
    await SupabaseService.client.auth.signOut();
  }
}
```

### Flutter UI コンポーネント

```dart
// lib/widgets/common/app_button.dart
import 'package:flutter/material.dart';

class AppButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final bool isLoading;
  final ButtonStyle? style;

  const AppButton({
    Key? key,
    required this.text,
    this.onPressed,
    this.isLoading = false,
    this.style,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      onPressed: isLoading ? null : onPressed,
      style: style ?? Theme.of(context).elevatedButtonTheme.style,
      child: isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Text(text),
    );
  }
}
```

### モデルクラス（共通型定義から生成）

```dart
// lib/models/user.dart
import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

@JsonSerializable()
class User {
  final String id;
  final String name;
  final String email;
  final UserRole role;
  final DateTime createdAt;
  final DateTime updatedAt;

  const User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.createdAt,
    required this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

enum UserRole {
  @JsonValue('player')
  player,
  @JsonValue('coach')
  coach,
  @JsonValue('manager')
  manager,
  @JsonValue('director')
  director,
}
```

### Flutter環境設定

```yaml
# pubspec.yaml
name: swim_manager_mobile
description: 水泳選手マネジメントシステム モバイルアプリ

dependencies:
  flutter:
    sdk: flutter
  
  # Supabase
  supabase_flutter: ^2.0.0
  
  # GraphQL
  graphql_flutter: ^5.1.2
  
  # 状態管理
  flutter_riverpod: ^2.4.0
  
  # ルーティング
  go_router: ^12.0.0
  
  # JSON処理
  json_annotation: ^4.8.1
  
  # ローカルストレージ
  hive: ^2.2.3
  hive_flutter: ^1.1.0
  
  # 日付処理
  intl: ^0.18.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  
  # コード生成
  build_runner: ^2.4.7
  json_serializable: ^6.7.1
  hive_generator: ^2.0.1
  
  # リント
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/images/
    - assets/icons/
```

---

## 🔐 認証とセキュリティ

### Supabase Auth 設定

```typescript
// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export const createClientComponentClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    }
  )
}
```

### Row Level Security (RLS) の実装

```sql
-- ユーザー固有データの保護
CREATE POLICY "Users can only access their own data"
ON user_profiles
FOR ALL
USING (auth.uid() = id);

-- 認証済みユーザーのみアクセス可能
CREATE POLICY "Authenticated users can read public data"
ON public_data
FOR SELECT
USING (auth.role() = 'authenticated');

-- ロールベースアクセス制御
CREATE POLICY "Coaches can manage team data"
ON team_data
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND role IN ('coach', 'manager', 'director')
  )
);
```

### 認証ガード実装

```typescript
// components/auth/AuthGuard.tsx
'use client'

import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface AuthGuardProps {
  children: React.ReactNode
  requiredRoles?: string[]
  fallback?: React.ReactNode
}

export default function AuthGuard({ 
  children, 
  requiredRoles,
  fallback = <div>アクセス権限がありません</div>
}: AuthGuardProps) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return <div>読み込み中...</div>
  }

  if (!user) {
    return null
  }

  if (requiredRoles && !requiredRoles.includes(profile?.role)) {
    return fallback
  }

  return <>{children}</>
}
```

---

## 📊 データ管理

### GraphQL + Apollo Client 設定

```typescript
// lib/apollo-client.ts
import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client/core'
import { setContext } from '@apollo/client/link/context'
import { onError } from '@apollo/client/link/error'

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT,
})

const authLink = setContext(async (_, { headers }) => {
  const supabase = createClientComponentClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  return {
    headers: {
      ...headers,
      authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    }
  }
})

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.forEach(({ message, locations, path }) => {
      console.error(`GraphQL error: ${message}`)
    })
  }

  if (networkError) {
    console.error(`Network error: ${networkError}`)
  }
})

export const apolloClient = new ApolloClient({
  link: from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      User: { keyFields: ['id'] },
      Event: { keyFields: ['id'] },
    },
  }),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
    },
    query: {
      errorPolicy: 'all',
    },
  },
})
```

### カスタムフックでのデータ管理

```typescript
// hooks/useCalendarData.ts
import { useQuery } from '@apollo/client/react'
import { useMemo } from 'react'

export function useCalendarData(currentDate: Date, userId?: string) {
  const { data, loading, error, refetch } = useQuery(GET_CALENDAR_ENTRIES, {
    variables: {
      startDate: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
      endDate: format(endOfMonth(currentDate), 'yyyy-MM-dd'),
      userId
    },
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  })

  const calendarEntries = useMemo(() => {
    if (!data) return []
    
    // データ変換ロジック
    return transformCalendarData(data)
  }, [data])

  return {
    calendarEntries,
    loading,
    error,
    refetch
  }
}
```

### データフェッチング戦略

```typescript
// Server Components でのデータ取得
export default async function DashboardPage() {
  const supabase = createServerComponentClient()
  
  // サーバーサイドでデータを取得
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true })

  return <DashboardView events={events} />
}

// Client Components でのリアルタイムデータ
'use client'

export function RealtimeEvents() {
  const [events, setEvents] = useState([])
  const supabase = createClientComponentClient()

  useEffect(() => {
    const channel = supabase
      .channel('events')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          // リアルタイム更新処理
          handleRealtimeUpdate(payload)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return <EventsList events={events} />
}
```

---

## ⚡ パフォーマンス最適化

### コード分割

```typescript
// 動的インポートでコード分割
import dynamic from 'next/dynamic'

const CalendarComponent = dynamic(() => import('@/components/calendar/Calendar'), {
  loading: () => <CalendarSkeleton />,
  ssr: false // クライアントサイドでのみレンダリング
})

const RecordForm = dynamic(() => import('@/components/forms/RecordForm'), {
  loading: () => <FormSkeleton />
})
```

### 画像最適化

```typescript
// Next.js Image コンポーネントの活用
import Image from 'next/image'

export function UserAvatar({ user }: { user: User }) {
  return (
    <Image
      src={user.avatarUrl || '/default-avatar.png'}
      alt={`${user.name}のアバター`}
      width={48}
      height={48}
      className="rounded-full"
      priority={false} // 重要でない画像は遅延読み込み
      placeholder="blur"
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//2Q=="
    />
  )
}
```

### メモ化の活用

```typescript
// React.memo でコンポーネントメモ化
export const CalendarDay = memo(({ date, entries, onClick }: CalendarDayProps) => {
  return (
    <div onClick={() => onClick(date)}>
      <span>{format(date, 'd')}</span>
      {entries.map(entry => (
        <EntryIndicator key={entry.id} entry={entry} />
      ))}
    </div>
  )
})

// useMemo で重い計算をメモ化
const processedData = useMemo(() => {
  return heavyDataProcessing(rawData)
}, [rawData])

// useCallback でイベントハンドラーをメモ化
const handleDateClick = useCallback((date: Date) => {
  onDateSelect(date)
  setSelectedDate(date)
}, [onDateSelect])
```

---

## 🔧 開発環境とデプロイ

### 環境変数管理

```bash
# .env.local (開発環境)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://your-project.supabase.co/functions/v1/graphql

# .env.production (本番環境)
NEXT_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-prod-anon-key
NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://your-prod-project.supabase.co/functions/v1/graphql
```

### Supabase CLI での環境管理

```bash
# 開発環境の開始
supabase start

# 本番環境へのデプロイ
supabase db push --linked

# Functions のデプロイ
supabase functions deploy graphql

# マイグレーションの作成
supabase migration new add_calendar_tables
```

### Docker での開発環境

```dockerfile
# apps/web/Dockerfile.dev
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development

  # Flutter開発用（オプション）
  flutter:
    image: cirrusci/flutter:stable
    working_dir: /app
    volumes:
      - ./apps/mobile:/app
    command: flutter run -d web-server --web-port=8080 --web-hostname=0.0.0.0
    ports:
      - "8080:8080"
```

### モノレポ管理スクリプト

```json
// package.json (ルート)
{
  "name": "swim-manager-monorepo",
  "private": true,
  "scripts": {
    "dev:web": "cd apps/web && npm run dev",
    "dev:mobile": "cd apps/mobile && flutter run",
    "build:web": "cd apps/web && npm run build",
    "build:mobile:android": "cd apps/mobile && flutter build apk",
    "build:mobile:ios": "cd apps/mobile && flutter build ios",
    "test:web": "cd apps/web && npm test",
    "test:mobile": "cd apps/mobile && flutter test",
    "deploy:functions": "cd supabase && supabase functions deploy",
    "type-gen": "npm run type-gen:ts && npm run type-gen:dart",
    "type-gen:ts": "cd packages/types && npm run build",
    "type-gen:dart": "cd packages/dart-types && dart run build_runner build"
  },
  "workspaces": [
    "apps/web",
    "packages/*"
  ]
}
```

### Flutter CI/CD設定

```yaml
# .github/workflows/flutter.yml
name: Flutter CI/CD

on:
  push:
    branches: [main, develop]
    paths: ['apps/mobile/**']
  pull_request:
    branches: [main]
    paths: ['apps/mobile/**']

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/mobile
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: subosito/flutter-action@v2
      with:
        flutter-version: '3.16.0'
        
    - name: Install dependencies
      run: flutter pub get
      
    - name: Run tests
      run: flutter test
      
    - name: Analyze code
      run: flutter analyze

  build-android:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    defaults:
      run:
        working-directory: apps/mobile
        
    steps:
    - uses: actions/checkout@v3
    
    - uses: subosito/flutter-action@v2
      with:
        flutter-version: '3.16.0'
        
    - name: Build APK
      run: flutter build apk --release
      
    - name: Upload APK
      uses: actions/upload-artifact@v3
      with:
        name: app-release.apk
        path: apps/mobile/build/app/outputs/flutter-apk/app-release.apk
```

---

## 🚨 エラーハンドリング

### グローバルエラーハンドリング

```typescript
// app/error.tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログ送信
    console.error('Application Error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-xl font-semibold mb-4">エラーが発生しました</h2>
      <p className="text-gray-600 mb-4">申し訳ございません。予期しないエラーが発生しました。</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        再試行
      </button>
    </div>
  )
}
```

### カスタムエラークラス

```typescript
// utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message = '認証が必要です') {
    super(message, 'AUTH_REQUIRED', 401)
  }
}

export class ValidationError extends AppError {
  constructor(message = '入力データが不正です', public field?: string) {
    super(message, 'VALIDATION_ERROR', 400)
  }
}
```

### エラーバウンダリ

```typescript
// components/ErrorBoundary.tsx
'use client'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ComponentType<{ error: Error }> },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback
      return <FallbackComponent error={this.state.error!} />
    }

    return this.props.children
  }
}
```

---

## 🧪 テストとコード品質

### テスト構成

```typescript
// __tests__/components/CalendarDay.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { CalendarDay } from '@/components/calendar/CalendarDay'

describe('CalendarDay', () => {
  const mockProps = {
    date: new Date('2024-01-15'),
    entries: [
      { id: '1', type: 'practice', title: '練習' }
    ],
    onClick: jest.fn()
  }

  it('日付が正しく表示される', () => {
    render(<CalendarDay {...mockProps} />)
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('クリック時にonClickが呼ばれる', () => {
    render(<CalendarDay {...mockProps} />)
    fireEvent.click(screen.getByText('15'))
    expect(mockProps.onClick).toHaveBeenCalledWith(mockProps.date)
  })
})
```

### ESLint 設定

```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/exhaustive-deps": "error",
    "prefer-const": "error"
  }
}
```

### Prettier 設定

```json
// .prettierrc
{
  "semi": false,
  "trailingComma": "es5",
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false
}
```

---

## 📚 追加のベストプラクティス

### TypeScript 活用

```typescript
// 厳密な型定義
interface User {
  readonly id: string
  name: string
  email: string
  role: 'player' | 'coach' | 'manager' | 'director'
  createdAt: Date
  updatedAt: Date
}

// ユーティリティ型の活用
type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>
type UpdateUserInput = Partial<Pick<User, 'name' | 'email'>>

// 型ガード関数
function isValidUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'email' in obj
  )
}
```

### パフォーマンス監視

```typescript
// lib/analytics.ts
export function trackPageView(url: string) {
  // Google Analytics, Mixpanel等での追跡
}

export function trackEvent(eventName: string, properties?: Record<string, any>) {
  // イベント追跡
}

// Web Vitals の測定
export function reportWebVitals(metric: any) {
  switch (metric.name) {
    case 'CLS':
    case 'FID':
    case 'FCP':
    case 'LCP':
    case 'TTFB':
      // メトリクス送信
      break
  }
}
```

### セキュリティ対策

```typescript
// utils/sanitize.ts
import DOMPurify from 'isomorphic-dompurify'

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
```

---

## 🎯 まとめ

### モノレポ構成のメリット

このベストプラクティスガイドに従うことで：

- **コードの共有**: 型定義、定数、ユーティリティをWeb・モバイル間で共有
- **一貫性**: 統一されたアーキテクチャパターンとコーディング規約
- **開発効率**: 単一リポジトリでの統合開発・デプロイ管理
- **保守性**: DRY原則に従った重複のないコード構成
- **スケーラビリティ**: 新しいプラットフォーム追加時の拡張性

### プラットフォーム別特徴

| 項目 | Next.js Web | Flutter Mobile | Supabase Backend |
|------|-------------|----------------|------------------|
| **言語** | TypeScript | Dart | TypeScript/SQL |
| **状態管理** | React Context/Zustand | Riverpod | - |
| **ルーティング** | App Router | GoRouter | - |
| **UI** | Tailwind CSS | Material Design | - |
| **認証** | Supabase Auth | Supabase Auth | RLS |
| **データ取得** | Apollo GraphQL | GraphQL Flutter | GraphQL Resolvers |

### 開発フロー

1. **型定義作成** (`packages/types`) 
2. **GraphQLスキーマ更新** (`packages/graphql-schema`)
3. **バックエンド実装** (`supabase`)
4. **Web・モバイル並行開発** (`apps/web`, `apps/mobile`)
5. **統合テスト・デプロイ**

### 継続的改善

定期的にこのガイドを見直し、以下の観点で更新していくことが重要です：

- **新しい技術スタックの採用**
- **パフォーマンス改善手法**
- **セキュリティ対策の強化**
- **開発体験の向上**
- **チーム規模に応じた構成調整**

---

**作成日**: 2025年1月  
**最終更新**: 2025年1月  
**バージョン**: 1.0.0
