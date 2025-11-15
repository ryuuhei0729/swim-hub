# スタイルとコーディング規約

## 言語設定
- **必須**: 常に日本語で回答
- UI表示は日本語を使用
- コメントは日本語で記述

## TypeScript規約
- 型安全性を重視
- `any`の使用は最小限に（型エラー回避時のみ）
- インターフェースを適切に定義
- 非同期処理は`async/await`を使用

## React規約
- 関数コンポーネントを使用
- Hooksを適切に活用
- プロップスの型定義を必須とする
- useEffectの依存配列を正確に指定

## GraphQL規約
- クエリとミューテーションを適切に分離
- フィールド名はcamelCaseで統一
- エラーハンドリングを適切に実装

## データベース規約
- テーブル名とカラム名はsnake_caseで統一
- GraphQLスキーマではcamelCaseに変換
- RLS（Row Level Security）を適切に設定

## ファイル命名規約
- コンポーネント: PascalCase (例: `PracticeLogForm.tsx`)
- ファイル名: camelCase または kebab-case
- カスタムフック: `use` prefix (例: `useCalendarData.ts`)