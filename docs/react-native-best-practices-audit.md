# React Native ベストプラクティス診断レポート

**診断日**: 2026-02-13
**対象**: `apps/mobile/`
**基準**: `vercel-react-native-skills` (全8カテゴリ)
**総合スコア**: 7/10（概ね良好）

---

## サマリー

| カテゴリ | 重要度 | 評価 |
|---|---|---|
| リストパフォーマンス | CRITICAL | ⚠️ 改善余地あり |
| アニメーション | HIGH | ✅ 安全 |
| ナビゲーション | HIGH | ✅ 良好 |
| UIパターン | HIGH | ✅ 優秀 |
| ステート管理 | MEDIUM | ⚠️ 改善余地あり |
| レンダリング | MEDIUM | ✅ 優秀 |
| モノレポ | MEDIUM | ✅ 完璧 |
| 設定 | LOW | ✅ 良好 |

---

## 1. リストパフォーマンス (CRITICAL)

### FlashList未導入

**状態**: 違反

`FlatList`を5箇所で使用しており、`@shopify/flash-list`が未導入。

**該当箇所**:
- `screens/RecordsScreen.tsx` (line 258)
- `screens/PracticesScreen.tsx` (line 243)
- `screens/TeamsScreen.tsx` (line 149)
- `components/teams/TeamAnnouncementList.tsx` (line 74)
- `components/teams/TeamMemberList.tsx` (line 161)

**修正方法**:
```bash
npx expo install @shopify/flash-list
```

```tsx
// Before
import { FlatList } from 'react-native'
<FlatList data={records} renderItem={renderItem} />

// After
import { FlashList } from '@shopify/flash-list'
<FlashList data={records} renderItem={renderItem} estimatedItemSize={80} />
```

### リストアイテムのmemo化

**状態**: 概ね良好（2件未対応）

memo済み:
- `components/records/RecordItem.tsx` - `React.memo()` + カスタム比較関数
- `components/practices/PracticeItem.tsx` - `React.memo()` + カスタム比較関数
- `components/teams/TeamItem.tsx` - `React.memo()` + カスタム比較関数

**未対応**:
- `components/records/SplitTimeItem.tsx` (line 15)
- `components/practices/PracticeLogItem.tsx` (line 14)

### コールバックの安定化

**状態**: 優秀

全画面で`renderItem`、`handleRefresh`、`handleLoadMore`等がuseCallbackで安定化済み。

### keyExtractor

**状態**: 完璧

全リストで`keyExtractor={(item) => item.id}`を正しく使用。

---

## 2. アニメーション (HIGH)

### react-native-reanimated

**状態**: 未導入（現時点では問題なし）

カスタムアニメーションが存在しないため、導入の必要性は低い。将来ジェスチャーアニメーションを追加する場合は検討。

### GPU非対応プロパティのアニメーション

**状態**: 安全

`width`/`height`/`left`/`top`のアニメーションなし。React Navigationの組み込みトランジションのみ使用。

### LayoutAnimation

**状態**: 安全（使用なし）

---

## 3. ナビゲーション (HIGH)

### Native Stack Navigator

**状態**: 優秀

```tsx
// AuthStack.tsx, MainStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack'
```

`@react-navigation/native-stack` v7.11.0を正しく使用。

### react-native-screens

**状態**: 要確認

パッケージ（v4.16.0）はインストール済みだが、`enableScreens()`の明示的呼び出しが見つからない。

**修正方法** (`App.tsx`に追加):
```tsx
import { enableScreens } from 'react-native-screens'
enableScreens()
```

### ボトムタブ

**状態**: JSベース

`@react-navigation/bottom-tabs`（JSベース）を使用。ネイティブ実装ではないが、現時点でパフォーマンス問題がなければ許容範囲。

---

## 4. UIパターン (HIGH)

### expo-image

**状態**: 未使用

React Native標準の`Image`を使用。`expo-image`はキャッシュ管理、プレースホルダー、トランジション等で優位。

**該当箇所**:
- `screens/WelcomeScreen.tsx` (line 2)
- `components/profile/AvatarUpload.tsx` (line 2)
- `components/profile/ProfileDisplay.tsx` (line 2)
- `components/shared/ImageUploader.tsx` (line 5)

**修正方法**:
```bash
npx expo install expo-image
```

```tsx
// Before
import { Image } from 'react-native'

// After
import { Image } from 'expo-image'
```

### Pressable vs TouchableOpacity

**状態**: 完璧

- Pressable: **458箇所**
- TouchableOpacity: **0箇所**

### SafeArea対応

**状態**: 良好

全画面で`SafeAreaView`の`edges`プロパティを正しく指定。

```tsx
<SafeAreaView edges={['top', 'left', 'right']}>
```

### StyleSheet.create

**状態**: 優秀

全コンポーネントで一貫して`StyleSheet.create()`を使用。

---

## 5. ステート管理 (MEDIUM)

### Zustandセレクタパターン

**状態**: 違反

全ストアでストア全体をデストラクチャリングしており、不要な再レンダリングが発生する可能性がある。

**該当箇所**:
- `screens/RecordFormScreen.tsx` (lines 48-70) - 13以上のフィールドをデストラクチャリング
- `screens/EntryLogFormScreen.tsx` (line 58)
- 全ストア使用箇所

**修正方法**:
```tsx
// Before（ストア全体を取得 → 任意のフィールド変更で再レンダリング）
const { styleId, time, note } = useRecordStore()

// After（必要なフィールドのみ購読）
const styleId = useRecordStore(state => state.styleId)
const time = useRecordStore(state => state.time)
const note = useRecordStore(state => state.note)

// または useShallow で複数フィールドを一括取得
import { useShallow } from 'zustand/react/shallow'
const { styleId, time, note } = useRecordStore(
  useShallow(state => ({ styleId: state.styleId, time: state.time, note: state.note }))
)
```

### ローディングフォールバック

**状態**: 優秀

全画面でReact Queryの`isLoading`を使い`LoadingSpinner`を表示。

### ログアウト時クリーンアップ

**状態**: 優秀

全Zustandストアの`reset()`呼び出し + React Queryキャッシュクリアを実施。

---

## 6. レンダリング (MEDIUM)

### Textコンポーネントラップ

**状態**: 良好

生テキストの`<Text>`ラップ漏れなし。

### falsy &&パターン

**状態**: 優秀

全箇所で安全なパターンを使用。

```tsx
// 正しいパターン（プロジェクト内で統一）
{entries.length > 0 && <Component />}
{announcements.length > 0 ? <List /> : <Empty />}
```

---

## 7. モノレポ (MEDIUM)

### ネイティブ依存の配置

**状態**: 完璧

全ネイティブ依存（`react-native`, `expo-*`, `react-native-screens`等）が`apps/mobile/package.json`に配置。`apps/shared/package.json`には含まれていない。

### 依存バージョン統一

**状態**: 完璧

| パッケージ | apps/mobile | apps/shared |
|---|---|---|
| `@tanstack/react-query` | ^5.90.10 | ^5.90.10 |
| `@supabase/supabase-js` | ^2.80.0 | ^2.80.0 |
| `date-fns` | ^4.1.0 | ^4.1.0 |
| `react` | 19.1.0 | 19.1.0 (peer) |

---

## 8. 設定 (LOW)

### metro.config.js

**状態**: 良好

モノレポ対応のカスタムリゾルバー設定済み。React/React-DOMの重複を防止。

### TypeScript

**状態**: 良好

パスエイリアス（`@/*`, `@apps/shared/*`）を正しく設定。

---

## 改善アクションプラン

### HIGH（パフォーマンスに直結）

| # | タスク | 影響範囲 |
|---|---|---|
| 1 | `@shopify/flash-list`を導入し、FlatListを置き換え | 5ファイル |
| 2 | Zustandセレクタパターンに移行 | 全ストア使用箇所 |
| 3 | `expo-image`を導入し、RN標準Imageを置き換え | 4ファイル |

### MEDIUM

| # | タスク | 影響範囲 |
|---|---|---|
| 4 | `SplitTimeItem`と`PracticeLogItem`をReact.memo()でラップ | 2ファイル |
| 5 | `enableScreens()`をApp.tsxに追加 | 1ファイル |

### LOW（将来の拡張時に検討）

| # | タスク | 条件 |
|---|---|---|
| 6 | `react-native-reanimated`の導入 | カスタムアニメーション追加時 |
| 7 | ネイティブボトムタブへの移行 | タブ切替のパフォーマンス問題発生時 |

---

## 良い点（維持すべきプラクティス）

- **Pressable 100%使用** - TouchableOpacityが一切なく模範的
- **falsy &&の安全なパターン** - `.length > 0`で統一
- **モノレポの依存管理** - ネイティブ依存の配置・バージョン統一が完璧
- **useCallbackによるコールバック安定化** - 全リスト画面で徹底
- **ローディング状態の適切な表示** - 全画面でフォールバックUI
- **StyleSheet.create の一貫使用** - インラインスタイルを最小限に
- **React Queryのオフライン対応設定** - staleTime/gcTime/networkModeが適切
