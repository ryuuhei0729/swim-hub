# SwimHub UI/UX レビューレポート

レビュー日: 2026-01-23

## 1. 総評

SwimHubは水泳チーム管理アプリとして、しっかりとした基盤が構築されています。Tailwind CSSによる一貫したデザインシステム、コンポーネントの適切な分離、レスポンシブ対応など、モダンなWebアプリの基本は押さえられています。以下、改善により更にUXを向上できるポイントを挙げます。

---

## 2. 練習記録追加機能のレビュー

### 2.1 フロー概要
```
ダッシュボード → 日付クリック → 「練習予定を追加」
    → [Step 1] 練習基本情報フォーム（PracticeBasicForm）
    → [Step 2] 練習ログフォーム（PracticeLogForm）
        → [任意] タイム入力モーダル（TimeInputModal）
```

### 2.2 良い点

| 項目 | 詳細 |
|------|------|
| **段階的フォーム設計** | 基本情報 → 詳細ログと2段階に分けることで、入力負荷を軽減 |
| **未保存変更の警告** | ブラウザバック、閉じる操作時にConfirmDialogで確認。データ損失を防止 |
| **タグ機能** | 練習メニューにタグを付けられる柔軟な設計 |
| **マイルストーン連携** | 目標から練習メニューを自動生成できる便利機能 |
| **画像添付** | 3枚まで画像を添付可能。視覚的な記録が可能 |

### 2.3 改善点

| 優先度 | 問題 | 現状 | 改善案 |
|--------|------|------|--------|
| **高** | **ステップの進行状況が不明** | 2段階フォームだが、現在どのステップかが視覚的に示されない | FormStepperコンポーネント（既存）を活用して進捗を表示 |
| **高** | **練習基本情報フォームに「戻る」がない** | Step 2からStep 1に戻れない | 「戻る」ボタンを追加し、入力内容を保持したまま編集可能に |
| **中** | **タイム入力が見つけにくい** | 「タイムを入力」ボタンが目立たない | ボタンにアイコンを追加（時計アイコンなど）、背景色を付ける |
| **中** | **メニュー削除の確認がない** | メニューを即座に削除可能 | 確認ダイアログを表示するか、Undoトーストを表示 |
| **中** | **サークルタイム入力が分散** | 分と秒が別フィールド | 「1:30」形式で入力できる統合フィールドも検討 |
| **低** | **練習タイトルの例示** | placeholderが「例: Swim, AM, 16:00」 | 「朝練習」「午後練習」「特別メニュー」等、より具体的な例を |

### 2.4 TimeInputModal の改善点

| 優先度 | 問題 | 改善案 |
|--------|------|--------|
| **高** | **全本数手入力が必要** | 「全て同じタイムで埋める」機能を追加 |
| **中** | **入力フォーマットのガイドが小さい** | placeholder「例: 1:30.50」を入力欄の下にもヘルパーテキストとして表示 |
| **中** | **キーボードナビゲーション** | TabキーやEnterで次のフィールドに自動移動 |
| **低** | **コピー機能がない** | 前のセットからタイムをコピーする機能 |

---

## 3. 大会記録追加機能のレビュー

### 3.1 フロー概要
```
ダッシュボード → 日付クリック → 「大会記録を追加」
    → [Step 1] 大会基本情報フォーム（CompetitionBasicForm）
    → [Step 2] エントリーフォーム（EntryLogForm）※スキップ可能
    → [Step 3] 大会記録フォーム（RecordLogForm）
```

### 3.2 良い点

| 項目 | 詳細 |
|------|------|
| **3段階フォーム設計** | 大会情報 → エントリー → 記録と論理的な流れ |
| **エントリースキップ機能** | エントリーなしで記録だけ登録可能。柔軟性が高い |
| **複数日大会対応** | 開始日・終了日を設定可能 |
| **終了日のバリデーション** | 開始日より前の日付を選択不可（DatePickerで無効化） |
| **スプリットタイム** | 25mごとのラップタイムを記録可能 |
| **リアクションタイム** | 競技記録に必要な反応時間を記録可能 |

### 3.3 改善点

| 優先度 | 問題 | 現状 | 改善案 |
|--------|------|------|--------|
| **高** | **ステップ進捗が不明** | 3段階だが進捗表示なし | FormStepperで「1. 大会情報 → 2. エントリー → 3. 記録」を表示 |
| **高** | **戻る機能がない** | Step 3からStep 2、Step 2からStep 1に戻れない | 「戻る」ボタンを追加 |
| **高** | **ボタンの順序が逆** | 「次へ（記録登録）」「キャンセル」の順 | 一般的なUI規約に従い「キャンセル」「次へ」の順に |
| **中** | **プール種別の初期値** | 短水路がデフォルト選択 | 未選択状態からスタートし、明示的に選択させる |
| **中** | **種目選択が長いリスト** | 23種目がフラットなドロップダウン | 距離や泳法でグループ化したセレクトUIに |
| **中** | **スプリットタイム追加が2ボタン** | 「追加(25mごと)」と「追加」 | 距離に応じて自動的にスプリット数を提案 |
| **低** | **リアクションタイムの単位** | 数値入力のみ | 「秒」のラベルを追加 |
| **低** | **ビデオURLの検証** | 入力検証なし | YouTube、Vimeo等の有効なURLか検証 |

### 3.4 エントリーフォームの改善点

| 優先度 | 問題 | 改善案 |
|--------|------|--------|
| **中** | **「エントリーをスキップ」の配置** | 左端に配置されており、誤クリックの可能性 | フッター右側に「スキップ」「キャンセル」「登録」の順で配置 |
| **中** | **種目追加時のスクロール** | 新しい種目が追加されてもスクロールしない | 新規追加時に自動スクロール |
| **低** | **過去のエントリータイム参照** | 入力のヒントがない | 過去の記録から自動入力の提案機能 |

---

## 4. 日付入力モーダル（DatePicker）のレビュー

### 4.1 確認した箇所
1. **練習基本情報フォーム** - 練習日
2. **大会基本情報フォーム** - 開始日
3. **大会基本情報フォーム** - 終了日（minDate制約あり）

### 4.2 良い点

| 項目 | 詳細 |
|------|------|
| **一貫したUI** | 全ての日付入力で同じDatePickerコンポーネントを使用 |
| **曜日の色分け** | 日曜が赤、土曜が青で視覚的に区別しやすい |
| **今日ボタン** | 今日の日付にワンクリックで移動可能 |
| **本日のハイライト** | 今日の日付が薄青背景で強調 |
| **選択日のハイライト** | 選択された日付が濃い青背景で明確 |
| **クリアボタン** | 日付フィールドの×ボタンでクリア可能 |
| **minDate制約** | 終了日では開始日より前が無効化される |
| **日本語ロケール** | 「2026年01月23日」形式で表示 |
| **アクセシビリティ** | aria-label、aria-expanded、dialog role等が適切に設定 |

### 4.3 改善点

| 優先度 | 問題 | 現状 | 改善案 |
|--------|------|------|--------|
| **高** | **前月・翌月の日付が表示されない** | 月初・月末で隣接月の日付が見えない | カレンダーグリッドに前月・翌月の日付を薄く表示 |
| **高** | **年・月の直接選択ができない** | 月送りボタンのみ | 「2026年1月」をクリックで年月選択モーダルを表示 |
| **中** | **キーボードナビゲーション** | ESCで閉じるのみ | 矢印キーで日付移動、Enterで選択をサポート |
| **中** | **閉じるボタンが目立たない** | テキストリンクスタイル | より明確なボタンスタイルに |
| **中** | **月送りボタンが小さい** | アイコンのみで44px未満 | タップターゲットを44px以上に拡大 |
| **低** | **祝日表示がない** | 通常日と祝日の区別なし | 日本の祝日を赤文字で表示（要：祝日データ） |
| **低** | **週の開始曜日** | 日曜始まり固定 | 設定で月曜始まりも選択可能に |

### 4.4 DatePickerの具体的な改善コード例

```tsx
// 前月・翌月の日付を表示する改善
const generateCalendarDays = (currentMonth: Date) => {
  const start = startOfMonth(currentMonth)
  const end = endOfMonth(currentMonth)
  const startDay = start.getDay() // 0-6

  const days = []

  // 前月の日付を追加
  for (let i = startDay - 1; i >= 0; i--) {
    days.push({
      date: subDays(start, i + 1),
      isCurrentMonth: false
    })
  }

  // 当月の日付を追加
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({
      date: d,
      isCurrentMonth: true
    })
  }

  // 翌月の日付を追加（6週間分になるまで）
  while (days.length < 42) {
    days.push({
      date: addDays(end, days.length - getDaysInMonth(currentMonth) - startDay + 1),
      isCurrentMonth: false
    })
  }

  return days
}
```

---

## 5. 共通UIコンポーネントのレビュー

### 5.1 ConfirmDialog

| 評価 | 詳細 |
|------|------|
| **良い点** | variant（danger/warning/info）で色分け、フォーカストラップ、ESC対応 |
| **改善点** | アニメーション（フェードイン/アウト）を追加するとより洗練される |

### 5.2 FormStepper（未使用）

```
現状: コンポーネントは存在するが、練習・大会フォームで使われていない
改善: 各フォームに組み込み、進捗を視覚化
```

### 5.3 Input

| 評価 | 詳細 |
|------|------|
| **良い点** | ValidationRulesによる柔軟なバリデーション、エラー/成功状態の表示 |
| **改善点** | showSuccessStateがデフォルトfalseなので、成功時のフィードバックが見えにくい |

---

## 6. 高優先度の改善点（まとめ）

### 6.1 ナビゲーション・情報設計

| 問題 | 現状 | 改善案 |
|------|------|--------|
| **ユーザードロップダウンの重複** | `Header.tsx:124-140` で「プロフィール」と「設定」が両方 `/mypage` に遷移 | 「設定」は `/settings` へ遷移させるか、メニュー項目を統合する |
| **サイドバーの視覚的階層** | 全ナビ項目が同じスタイルで平坦 | グループ分け（例: 記録管理 / チーム / アカウント）を導入し、視覚的にセクション分けする |
| **パンくずリストの欠如** | 深い階層（`/teams/[id]/competitions/[id]/records`）で現在地が不明確 | パンくずナビを追加してユーザーの位置を明示 |

### 6.2 フォーム・入力体験

| 問題 | 現状 | 改善案 |
|------|------|--------|
| **フォームのプログレス表示がない** | 複数ステップのフォームでも進捗がわからない | FormStepperを活用してステップ表示 |
| **入力フィールドのフィードバック遅延** | バリデーションがsubmit時のみの箇所がある | リアルタイムバリデーション（blur時）を徹底 |
| **戻る機能がない** | 複数ステップフォームで前のステップに戻れない | 「戻る」ボタンを追加 |

### 6.3 ビジュアルデザイン

| 問題 | 現状 | 改善案 |
|------|------|--------|
| **カラーコントラスト不足** | `globals.css:253` の `.stat-card-title` が `text-gray-500` | WCAG AA基準（4.5:1）を満たす `text-gray-600` 以上に変更 |
| **アクセントカラーの単調さ** | ほぼ青一色（Primary Blue）のみ | 機能別にセカンダリカラーを活用（練習=緑、大会=オレンジなど）|
| **空状態のデザインが弱い** | テキストのみの空状態 | イラスト + CTA付きのEmpty Stateコンポーネントを作成 |

---

## 7. 中優先度の改善点

### 7.1 インタラクション・マイクロインタラクション

| 問題 | 改善案 |
|------|--------|
| **ボタンのホバー状態が地味** | `hover:scale-[1.02]` や微細なシャドウ変化を追加してクリック可能性を強調 |
| **ローディング状態の単調さ** | スケルトンUIは良いが、パルスアニメーションに加えてシマー効果も検討 |
| **成功/エラーフィードバックが弱い** | トースト通知を導入し、操作結果を明確にフィードバック |
| **ページ遷移のアニメーション欠如** | Framer Motion等でページ間のスムーズなトランジションを追加 |

### 7.2 モバイル体験

| 問題 | 現状 | 改善案 |
|------|------|--------|
| **タップターゲットが小さい** | 一部のアイコンボタンが44px未満 | 最小44x44pxを確保（iOS Human Interface Guidelines準拠） |
| **モバイルでの水平スクロール** | テーブルが横スクロールになる可能性 | カードベースのレイアウトに切り替えるレスポンシブ対応を追加 |
| **サイドバーの閉じにくさ** | スワイプジェスチャー非対応 | 左スワイプでサイドバーを閉じられるように |
| **ボトムナビの検討** | サイドバーのみ | モバイルではボトムナビゲーションの方がアクセスしやすい |

### 7.3 アクセシビリティ

| 問題 | 現状 | 改善案 |
|------|------|--------|
| **フォーカスの可視性** | フォーカスリングはあるが薄い場合がある | `ring-offset-2 ring-2 ring-blue-500` を全インタラクティブ要素に統一 |
| **スクリーンリーダー対応** | 基本的な`aria-label`はあるが不十分な箇所も | `aria-live`リージョンで動的コンテンツ更新を通知 |
| **キーボードナビゲーション** | ドロップダウンは対応済み | モーダル内のフォーカストラップを確認・強化 |
| **エラーメッセージの関連付け** | `aria-describedby`の欠如 | Inputコンポーネントでエラーメッセージとinputを`aria-describedby`で関連付け |

---

## 8. 低優先度の改善点（今後の検討事項）

### 8.1 デザインシステムの強化

- **Design Tokens の導入**: 色、スペーシング、タイポグラフィを変数化して一元管理
- **Storybook の活用**: UIコンポーネントのカタログ化とビジュアルリグレッションテスト
- **ダークモード対応**: `dark:` プレフィックスを使った暗色テーマ

### 8.2 パフォーマンス最適化（UX観点）

- **インタラクションのレイテンシ削減**: Optimistic UI更新の導入
- **画像の遅延読み込み**: `loading="lazy"` の徹底
- **スケルトンUIの洗練**: コンテンツの実際のレイアウトに近い形状に

### 8.3 パーソナライゼーション

- サイドバーのお気に入り機能
- ダッシュボードのウィジェットカスタマイズ
- よく使う機能へのクイックアクセス

---

## 9. 具体的なコード改善例

### 9.1 フォームにFormStepperを追加

```tsx
// PracticeBasicFormでの使用例
import { FormStepper } from '@/components/ui/FormStepper'

const practiceSteps = [
  { id: 'basic', label: '基本情報', description: '日付・場所' },
  { id: 'log', label: '練習記録', description: 'メニュー・タイム' }
]

// フォーム内で
<FormStepper
  steps={practiceSteps}
  currentStep={0} // または 1
/>
```

### 9.2 大会フォームにFormStepperを追加

```tsx
const competitionSteps = [
  { id: 'basic', label: '大会情報', description: '日程・場所' },
  { id: 'entry', label: 'エントリー', description: '種目・タイム' },
  { id: 'record', label: '記録入力', description: '結果・スプリット' }
]

<FormStepper
  steps={competitionSteps}
  currentStep={currentStep}
/>
```

### 9.3 DatePickerの年月直接選択

```tsx
// DatePicker.tsx への追加機能
const [showMonthPicker, setShowMonthPicker] = useState(false)

// 月表示部分をクリッカブルに
<button
  onClick={() => setShowMonthPicker(true)}
  className="text-lg font-semibold hover:bg-gray-100 px-2 py-1 rounded"
>
  {format(currentMonth, 'yyyy年 M月', { locale: ja })}
</button>

// 年月選択パネル
{showMonthPicker && (
  <div className="absolute z-10 bg-white shadow-lg rounded-lg p-4">
    {/* 年選択 */}
    <div className="flex justify-between items-center mb-4">
      <button onClick={() => setYear(year - 1)}>←</button>
      <span className="font-semibold">{year}年</span>
      <button onClick={() => setYear(year + 1)}>→</button>
    </div>
    {/* 月選択グリッド */}
    <div className="grid grid-cols-4 gap-2">
      {[...Array(12)].map((_, i) => (
        <button
          key={i}
          onClick={() => selectMonth(i)}
          className="p-2 hover:bg-blue-100 rounded"
        >
          {i + 1}月
        </button>
      ))}
    </div>
  </div>
)}
```

### 9.4 Empty Stateコンポーネント

```tsx
// components/ui/EmptyState.tsx
interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {Icon && <Icon className="h-12 w-12 text-gray-300 mb-4" />}
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="primary">
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

### 9.5 トースト通知システムの導入

react-hot-toast や sonner の導入を推奨:

```tsx
// 成功時
toast.success('練習記録を保存しました')

// エラー時
toast.error('保存に失敗しました。再度お試しください')
```

### 9.6 パンくずリストコンポーネント

```tsx
// components/ui/Breadcrumb.tsx
import Link from 'next/link'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="パンくずリスト" className="flex items-center space-x-2 text-sm">
      <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
        <HomeIcon className="h-4 w-4" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <ChevronRightIcon className="h-4 w-4 text-gray-300" />
          {item.href ? (
            <Link href={item.href} className="text-gray-500 hover:text-gray-700">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  )
}
```

---

## 10. まとめ

| カテゴリ | 評価 | コメント |
|----------|------|----------|
| **全体的な一貫性** | ★★★★☆ | デザインシステムの基盤は良好。細部の統一が必要 |
| **レスポンシブデザイン** | ★★★★☆ | 基本対応済み。モバイルファーストの最適化余地あり |
| **アクセシビリティ** | ★★★☆☆ | 基本は対応。ARIA属性とフォーカス管理の強化を |
| **インタラクションデザイン** | ★★★☆☆ | 機能的だが、フィードバックとアニメーションが弱い |
| **情報設計** | ★★★☆☆ | 機能は揃っているが、ナビゲーションの整理が必要 |
| **フォームUX** | ★★★☆☆ | 段階的設計は良いが、進捗表示と戻る機能が必要 |
| **DatePicker** | ★★★★☆ | 基本機能は充実。年月直接選択と前後月表示を追加すると完璧 |

---

## 11. 最優先で取り組むべき項目

1. **FormStepperの活用** - 練習・大会フォームに進捗表示を追加
2. **戻るボタンの追加** - 複数ステップフォームで前のステップに戻れるように
3. **トースト通知の導入** - ユーザーフィードバック改善
4. **DatePickerの年月直接選択** - 遠い日付の選択が困難
5. **ボタン配置の統一** - 「キャンセル」「次へ」の順序を統一

---

## 12. 参考リソース

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design Guidelines](https://m3.material.io/)
