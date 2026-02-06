# Apple認証 & iOSカレンダー連携 ロードマップ

## 概要

Swim-HubにApple認証とiOSカレンダー同期機能を追加するためのロードマップ。

### 現在の状態
- Google認証: 実装済み（Supabase Auth）
- Google Calendar同期: 実装済み

### 目標
1. **Apple認証**: Appleでログイン/サインアップ
2. **iOSカレンダー同期**: Swim-hub → iOSカレンダーへの一方通行同期

---

## フェーズ1: Apple認証の実装

### 1.1 Apple Developer設定（所要時間: 1-2時間）

#### 必要なもの
- Apple Developer Program メンバーシップ（既に加入済み）
- App IDの作成/更新

#### 手順
1. **Apple Developer Console**で設定
   - [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) にアクセス
   - App ID（Identifier）で「Sign In with Apple」を有効化
   - Services IDを作成（Web用）
   - Private Keyを生成

2. **必要な値を取得**
   ```
   - Team ID: Apple Developer アカウントのチームID
   - Service ID: Web用のサービスID（例: com.swimhub.web）
   - Key ID: 生成したPrivate KeyのID
   - Private Key: .p8ファイルの内容
   - Bundle ID: iOSアプリのBundle ID（例: com.swim-**hub**.app）
   ```

### 1.2 Supabase設定（所要時間: 30分）

1. **Supabase Dashboard** → Authentication → Providers → Apple
2. 以下を設定:
   - `Client ID`: Service ID（Web用）
   - `Secret Key`: 生成したPrivate Key（.p8の内容）
   - `Key ID`: Private KeyのKey ID
   - `Team ID`: Apple Developer Team ID
3. Callback URLをApple Developer Consoleに登録

### 1.3 Web (Next.js) 実装（所要時間: 2-3時間）

#### 新規ファイル作成

```typescript
// apps/web/lib/supabase-auth/authApple.ts
"use server";

import { createClient } from "@/lib/supabase-auth/server";
import { redirect } from "next/navigation";
import { getCurrentEnvConfig } from "@/lib/env";

export async function signInWithApple() {
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || getCurrentEnvConfig().appUrl;
  const redirectTo = `${appUrl}/api/auth/callback`;

  const { data: { url }, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo,
    },
  });

  if (error) console.error('Appleログインエラー:', error.message);
  if (!error && url) redirect(url);
}
```

#### AuthUIコンポーネント更新

```typescript
// apps/web/components/auth/AuthUI.tsx に追加
const handleAppleAuth = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback?redirect_to=/dashboard`
    }
  });
  // ...エラーハンドリング
};
```

### 1.4 モバイル (Expo) 実装（所要時間: 3-4時間）

#### パッケージインストール

```bash
cd apps/mobile
npx expo install expo-apple-authentication
```

#### app.json / app.config.js 設定

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.swim-hub.app",
      "usesAppleSignIn": true
    }
  }
}
```

#### Apple認証フック作成

```typescript
// apps/mobile/hooks/useAppleAuth.ts
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';

export const useAppleAuth = () => {
  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });

        if (error) throw error;
        return data;
      }
    } catch (error) {
      // エラーハンドリング
    }
  };

  return { signInWithApple };
};
```

#### ログイン画面にボタン追加

```tsx
// apps/mobile/screens/LoginScreen.tsx
import * as AppleAuthentication from 'expo-apple-authentication';

<AppleAuthentication.AppleAuthenticationButton
  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
  cornerRadius={5}
  style={{ width: '100%', height: 44 }}
  onPress={signInWithApple}
/>
```

---

## フェーズ2: iOSカレンダー同期

### 2.1 実装方針の検討

#### 選択肢A: EventKit（推奨）
- **メリット**: ネイティブAPI、オフライン動作、iCloudとの自動同期
- **デメリット**: モバイルアプリのみ

#### 選択肢B: CalDAV API
- **メリット**: Web/モバイル両対応
- **デメリット**: iCloud固有の設定が複雑、App-Specific Password必要

**推奨**: 選択肢A（EventKit）でモバイルアプリから直接iOSカレンダーに書き込み

### 2.2 モバイル実装（所要時間: 4-6時間）

#### パッケージインストール

```bash
cd apps/mobile
npx expo install expo-calendar
```

#### app.json 権限設定

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCalendarsUsageDescription": "練習や大会の予定をカレンダーに同期するために使用します",
        "NSCalendarsFullAccessUsageDescription": "練習や大会の予定をカレンダーに同期するために使用します"
      }
    }
  }
}
```

#### カレンダー同期サービス作成

```typescript
// apps/mobile/services/iosCalendarSync.ts
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

// SwimHub専用カレンダーを作成/取得
async function getOrCreateSwimHubCalendar(): Promise<string> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existingCalendar = calendars.find(c => c.title === 'SwimHub');

  if (existingCalendar) {
    return existingCalendar.id;
  }

  // デフォルトカレンダーソースを取得
  const defaultCalendarSource = Platform.OS === 'ios'
    ? calendars.find(c => c.source.name === 'iCloud')?.source
    : { isLocalAccount: true, name: 'SwimHub', type: Calendar.CalendarType.LOCAL };

  const newCalendarId = await Calendar.createCalendarAsync({
    title: 'SwimHub',
    color: '#0066FF',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: defaultCalendarSource?.id,
    source: defaultCalendarSource,
    name: 'SwimHub',
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });

  return newCalendarId;
}

// 練習イベントを同期
export async function syncPracticeToiOSCalendar(practice: Practice): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('カレンダーへのアクセスが許可されていません');
  }

  const calendarId = await getOrCreateSwimHubCalendar();

  const eventId = await Calendar.createEventAsync(calendarId, {
    title: `[練習] ${practice.team_name || ''}`,
    startDate: new Date(practice.start_time),
    endDate: new Date(practice.end_time),
    notes: practice.notes || '',
    location: practice.location || '',
    timeZone: 'Asia/Tokyo',
  });

  return eventId;
}

// 大会イベントを同期
export async function syncCompetitionToiOSCalendar(competition: Competition): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('カレンダーへのアクセスが許可されていません');
  }

  const calendarId = await getOrCreateSwimHubCalendar();

  const eventId = await Calendar.createEventAsync(calendarId, {
    title: `[大会] ${competition.name}`,
    startDate: new Date(competition.start_date),
    endDate: new Date(competition.end_date),
    notes: competition.description || '',
    location: competition.venue || '',
    timeZone: 'Asia/Tokyo',
    allDay: true,
  });

  return eventId;
}

// イベント更新
export async function updateiOSCalendarEvent(eventId: string, updates: Partial<Calendar.Event>): Promise<void> {
  await Calendar.updateEventAsync(eventId, updates);
}

// イベント削除
export async function deleteiOSCalendarEvent(eventId: string): Promise<void> {
  await Calendar.deleteEventAsync(eventId);
}
```

### 2.3 データベース拡張（所要時間: 1時間）

```sql
-- iOSカレンダー連携用のカラム追加
ALTER TABLE users ADD COLUMN ios_calendar_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN ios_calendar_sync_practices BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN ios_calendar_sync_competitions BOOLEAN DEFAULT true;

-- 練習テーブルにiOSイベントID追加
ALTER TABLE practices ADD COLUMN ios_calendar_event_id TEXT;

-- 大会テーブルにiOSイベントID追加
ALTER TABLE competitions ADD COLUMN ios_calendar_event_id TEXT;
```

### 2.4 設定画面UI（所要時間: 2-3時間）

```tsx
// apps/mobile/screens/SettingsScreen.tsx に追加
import { Switch } from 'react-native';

const [iosCalendarEnabled, setIosCalendarEnabled] = useState(false);

const toggleiOSCalendar = async (value: boolean) => {
  if (value) {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カレンダーへのアクセスを許可してください');
      return;
    }
  }

  setIosCalendarEnabled(value);
  await updateUserProfile({ ios_calendar_enabled: value });
};

// UI
<View style={styles.settingRow}>
  <Text>iOSカレンダーに同期</Text>
  <Switch value={iosCalendarEnabled} onValueChange={toggleiOSCalendar} />
</View>
```

---

## フェーズ3: 統合テスト & リリース

### 3.1 テスト項目（所要時間: 2-3日）

#### Apple認証テスト
- [ ] Web: Appleログイン成功
- [ ] Web: 既存Googleユーザーとのアカウントリンク
- [ ] iOS: Appleログイン成功
- [ ] iOS: Face ID/Touch ID連携
- [ ] 新規ユーザー登録フロー
- [ ] ログアウト→再ログイン

#### iOSカレンダー同期テスト
- [ ] 初回権限リクエスト
- [ ] SwimHubカレンダー作成
- [ ] 練習イベント同期（作成/更新/削除）
- [ ] 大会イベント同期（作成/更新/削除）
- [ ] オフライン時の動作
- [ ] iCloud同期確認

### 3.2 App Store審査対応

#### 必須対応
1. **Apple認証ガイドライン準拠**
   - Googleログインがある場合、Appleログインも必須（App Store要件）
   - Appleボタンのデザインガイドライン遵守

2. **プライバシーポリシー更新**
   - Apple認証で取得するデータの説明
   - カレンダーデータの使用目的

3. **App Store Connect設定**
   - Sign in with Apple capability追加
   - プライバシーマニフェスト更新

---

## タイムライン概算

| フェーズ | タスク | 所要時間 |
|---------|--------|----------|
| 1.1 | Apple Developer設定 | 1-2時間 |
| 1.2 | Supabase設定 | 30分 |
| 1.3 | Web実装 | 2-3時間 |
| 1.4 | モバイル実装 | 3-4時間 |
| 2.2 | iOSカレンダー実装 | 4-6時間 |
| 2.3 | DB拡張 | 1時間 |
| 2.4 | 設定画面UI | 2-3時間 |
| 3.1 | テスト | 2-3日 |
| **合計** | | **約3-5日** |

---

## 環境変数（追加分）

```env
# Apple Auth
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_SERVICE_ID=com.swimhub.web
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

---

## 参考リンク

- [Supabase Apple Auth Docs](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Expo Calendar](https://docs.expo.dev/versions/latest/sdk/calendar/)
- [Apple Sign In Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [EventKit Documentation](https://developer.apple.com/documentation/eventkit)

---

## 注意事項

1. **Apple認証のメール非公開**
   - ユーザーがメールを非公開にした場合、`xxxxx@privaterelay.appleid.com` が返される
   - 初回ログイン時のみ名前・メールが取得可能（2回目以降は取得不可）

2. **iOSカレンダーの制限**
   - Androidには別途Google Calendar連携を使用
   - Web版からはiOSカレンダーに直接書き込み不可

3. **テスト環境**
   - Apple認証はシミュレーターでは動作しない（実機テスト必須）
   - Sandbox環境でのテストには専用テストアカウントが必要
