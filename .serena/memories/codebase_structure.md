# コードベース構造

## ディレクトリ構成

```text
/
├── apps/
│   ├── web/           # Next.jsアプリケーション
│   │   ├── app/       # App Router
│   │   │   ├── (authenticated)/    # 認証済みルート
│   │   │   │   ├── dashboard/      # ダッシュボード機能
│   │   │   │   ├── practice/       # 練習記録
│   │   │   │   ├── competitions/   # 大会記録
│   │   │   │   └── ...
│   │   │   └── (unauthenticated)/  # 未認証ルート
│   │   ├── components/             # 共有コンポーネント
│   │   ├── contexts/              # React Context
│   │   ├── graphql/               # GraphQLクエリ・ミューテーション
│   │   ├── hooks/                 # カスタムフック
│   │   └── lib/                   # ユーティリティ
│   └── mobile/        # Flutterアプリケーション
├── supabase/          # Supabaseプロジェクト設定
│   ├── functions/     # Edge Functions
│   └── migrations/    # データベースマイグレーション
```

## 主要なファイル

- `/apps/web/app/(authenticated)/dashboard/page.tsx` - ダッシュボード メインページ
- `/apps/web/components/forms/PracticeLogForm.tsx` - 練習記録フォーム
- `/apps/web/components/forms/TimeInputModal.tsx` - タイム入力モーダル
- `/apps/web/graphql/` - GraphQLクエリとミューテーション