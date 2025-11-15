# メール認証設定ガイド

## 問題: メール内のURLがlocalhostになっている

本番環境でアカウント作成時に届くメールのURLが`localhost`になっている場合、以下の設定を確認・修正してください。

## 解決方法

### 1. Supabase Dashboardでの設定

#### 1.1 Site URLの設定

1. Supabase Dashboard → 本番プロジェクト → **Authentication** → **URL Configuration**
2. **Site URL**を本番環境のURLに設定:
   ```
   https://your-app.vercel.app
   ```
   （実際のVercelのURLに置き換えてください）

#### 1.2 Redirect URLsの設定

**Redirect URLs**に以下を追加:
```
https://your-app.vercel.app/**
https://your-app.vercel.app/auth/callback
```

**重要**: `**`はワイルドカードで、すべてのパスを許可します。

#### 1.3 メールテンプレートの確認

1. Supabase Dashboard → **Authentication** → **Email Templates**
2. **Confirm signup**テンプレートを確認
3. テンプレート内で`{{ .ConfirmationURL }}`が正しく使用されているか確認

### 2. 環境変数の設定

Vercel Dashboardで以下の環境変数を設定:

```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**設定手順**:
1. Vercel Dashboard → プロジェクト → **Settings** → **Environment Variables**
2. `NEXT_PUBLIC_APP_URL`を追加
3. 値: 本番環境のURL（例: `https://swim-hub.vercel.app`）
4. **Environment**: Production を選択
5. **Save**をクリック
6. 再デプロイを実行

### 3. コード側の修正

`apps/web/contexts/AuthProvider.tsx`で以下のように修正済み:

```typescript
// 本番環境では環境変数、開発環境ではwindow.location.originを使用
const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

emailRedirectTo: `${appUrl}/auth/callback?redirect_to=/dashboard`
```

### 4. 動作確認

1. 本番環境でアカウントを作成
2. 届いたメールのURLを確認
3. URLが`https://your-app.vercel.app/auth/callback?...`になっていることを確認
4. リンクをクリックして正常にリダイレクトされることを確認

## トラブルシューティング

### メールが届かない場合

1. **Supabase Dashboard** → **Authentication** → **Email Templates** を確認
2. **SMTP設定**が有効になっているか確認
   - Supabase Dashboard → **Settings** → **Auth** → **SMTP Settings**
   - または、SendGrid、AWS SES、Mailgunなどの外部SMTPサービスを設定

### メールは届くがURLがlocalhostの場合

1. **環境変数**`NEXT_PUBLIC_APP_URL`が正しく設定されているか確認
2. **Supabase Dashboard**の**Site URL**が正しく設定されているか確認
3. コードを再デプロイして反映されているか確認

### リダイレクトエラーが発生する場合

1. **Redirect URLs**に正しいURLが追加されているか確認
2. `**`ワイルドカードが使用されているか確認
3. URLの末尾に`/`がないか確認（`/auth/callback`はOK、`/auth/callback/`はNG）

## 参考リンク

- [Supabase Auth Configuration](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-deep-dive-jwts)
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

