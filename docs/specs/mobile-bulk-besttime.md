# 仕様書: ベストタイム一括手動登録（モバイル / マイページ）

- **対象アプリ**: `swim-hub` モバイル（Expo / React Native, `apps/mobile/`）
- **起点**: マイページ（`MyPageScreen`）→ ベストタイムセクション
- **ステータス**: Draft
- **作成日**: 2026-06-09

---

## 1. 背景・課題

Web 版にはベストタイムの手動一括登録画面 `/bulk-besttime`
（[BulkBestTimeClient.tsx](../apps/web/app/[locale]/(authenticated)/bulk-besttime/_client/BulkBestTimeClient.tsx)）が
存在し、マイページのベストタイム表から「一括入力」ボタンで遷移できる。

**モバイルには同等機能が無い。** モバイルでベストタイムを複数登録するには、
記録作成画面（`RecordFormScreen`）で1種目ずつ登録するしかなく、初期データ投入の手間が大きい。
（オンボーディング時のみ `OnboardingBestTime` で一括入力できるが、登録後に再度まとめて入れる導線が無い。）

### 既存資産（再利用前提）

モバイルのオンボーディングには、**カード追加型の一括ベストタイム入力UIが既に完成している**:
[`apps/mobile/components/onboarding/OnboardingBestTime.tsx`](../apps/mobile/components/onboarding/OnboardingBestTime.tsx)

- 「種目を追加」→ ボトムシートで種目選択 → カードが増える
- 各カード: 種目名 / 短水路・長水路トグル / タイム入力（`TextInput`）/ 削除
- 重複検知（同 `styleId`+`poolType`）、保存可否判定、`RecordAPI.createBulkRecords()` 呼び出し

本機能は **この UI パターンを共通化し、マイページから到達できる独立画面として提供する**。
Web のグリッド（5種目 × 7距離 × 短/長 × 通常/引継ぎ）をそのまま移植するのは
画面幅 375px では非現実的なため、モバイルは**カード追加型**を正とする。

---

## 2. ゴール / 非ゴール

### ゴール
- マイページのベストタイムセクションから「一括入力」へ遷移できる
- 1画面で複数種目のベストタイムをまとめて手入力し、1アクションで一括保存できる
- 保存後マイページに戻ると、登録したベストタイムが反映されている
- Web 版・オンボーディングと同じ `RecordAPI.createBulkRecords()` を使い、データ整合を保つ

### 非ゴール（今回やらない）
- Excel / CSV / 画像取り込み（scanner アプリの責務。Web のメタ説明にある「Excel」は実装されていない）
- 既存ベストタイムの **編集・上書き・重複排除**（現 API は INSERT 専用。下記「§8 既知の制約」参照）
- リレー（引き継ぎ, `is_relaying`）タイムの入力（オンボーディング同様、初版は `false` 固定）
- 反応時間・スプリットの入力（単一記録の `RecordFormScreen` の責務）

---

## 3. 用語・ドメイン定義（既存準拠）

| 概念 | 値・形式 | 出典 |
|------|---------|------|
| タイム保存形式 | `numeric(10,2)` 秒単位（例 `83.45` = 1:23.45） | `records.time` |
| `pool_type` | `0` = 短水路(SCM/25m), `1` = 長水路(LCM/50m) | `records.pool_type` |
| `is_relaying` | 引き継ぎ有無。本機能は `false` 固定 | `records.is_relaying` |
| 種目マスタ | `styles` テーブル / フロントは `STYLES` 定数（id 1–22）と同期 | [OnboardingBestTime.tsx:52-75](../apps/mobile/components/onboarding/OnboardingBestTime.tsx#L52-L75) |
| タイム入力 → 秒 | `parseTime("1:23.45")` / クイック `"31-2"` 対応 | [apps/shared/utils/time.ts](../apps/shared/utils/time.ts) |
| 長水路で無効な組合せ | 25m 全種目、100m 個人メドレー | Web `isValidForLongCourse` |

種目マスタ（id・距離・種目）は `OnboardingBestTime.STYLES` と完全一致させる。

---

## 4. UX フロー

```
マイページ（MyPageScreen）
  └ ベストタイムセクション ヘッダー右に「一括入力」ボタン（新規）
        │ navigation.navigate("BulkBestTime")
        ▼
一括入力画面（BulkBestTimeScreen, 新規 Stack 画面）
  ├ ヘッダー: タイトル + 戻る
  ├ 種目カードリスト（0件開始）
  │   各カード: 種目名 / [短水路|長水路] トグル / タイム入力 / 削除(×)
  ├ 「+ 種目を追加」ボタン → ボトムシートで種目選択 → カード追加
  ├ 重複警告バナー（同 種目×水路 が2件以上）
  ├ エラーバナー（保存失敗・部分失敗）
  └ フッター: 「一括登録する」ボタン（有効入力 ≥1 かつ重複なし かつ全タイム妥当 で活性）
        │ createBulkRecords → 成功
        ▼
  Toast / Alert 「N件登録しました」→ navigation.goBack() でマイページへ
  （React Query の bestTimes が再フェッチされ反映）
```

### 画面遷移の方針
- `RecordForm` / `Settings` と同じく **`MainStackParamList` のモーダル/スタック画面**として追加する
  （[apps/mobile/navigation/types.ts](../apps/mobile/navigation/types.ts) / `MainStack.tsx`）
- パラメータ不要: `BulkBestTime: undefined`

---

## 5. 画面仕様: `BulkBestTimeScreen`

`OnboardingBestTime` をベースに、オンボーディング固有の要素（戻る/スキップ/`onComplete`）を
**マイページ文脈に置き換えた独立画面**として実装する。共通ロジックは抽出して両者で共有する（§7）。

### 5.1 レイアウト
- `SafeAreaView` + ヘッダー（戻るボタン + タイトル `t("bulkBestTime.header.title")`）
- 本体は `OnboardingBestTime` のエントリーリスト + 追加ボタン + 種目選択モーダルを流用
- フッター固定の「一括登録する」ボタン（`OnboardingBestTime` の primaryButton 相当）
- `KeyboardAvoidingView` + `keyboardShouldPersistTaps="handled"`（既存パターン踏襲）

### 5.2 エントリーカード（`EntryRow` 流用）
| 要素 | 仕様 |
|------|------|
| 種目名 | `${distance}m ${t("practice.styles.<Key>")}`（例 `50m 自由形`） |
| 水路トグル | 短水路 / 長水路。**長水路で無効な種目（25m / 100m IM）は長水路ボタンを非活性 or 当該種目を長水路で追加不可** |
| タイム入力 | `TextInput`, `keyboardType="numbers-and-punctuation"`, placeholder `1:23.45` |
| 削除 | × アイコン |

### 5.3 種目選択モーダル
- ボトムシート（`OnboardingBestTime` の Modal 流用）に `STYLES` 22種を一覧表示
- 既にカードがある種目も追加可（重複は警告で検知）

### 5.4 バリデーション（`OnboardingBestTime` のロジック流用）
- `canSave`: エントリー ≥1 件 / 重複なし / 全エントリー `parseTime(time) > 0`
- 重複: 同一 `styleId`+`poolType` の組が2件以上 → 該当カードを赤枠 + 警告バナー
- 不正タイム: `parseTime <= 0` のカードを赤枠（保存ボタン非活性）

### 5.5 保存処理
```ts
const records = entries.map((e) => ({
  style_id: e.styleId,
  time: parseTime(e.time),   // 秒
  is_relaying: false,
  note: null,
  pool_type: e.poolType,
}));
const result = await recordAPI.createBulkRecords(records);
// result.errors.length === 0 → 成功 Toast/Alert + goBack()
// それ以外 → 部分失敗バナー
```
- `RecordAPI` 生成: `const { supabase } = useAuth(); new RecordAPI(supabase)`（既存パターン）
- 二重送信防止: `savingRef`（`OnboardingBestTime` 同様）
- 保存成功後、マイページの `useBestTimesQuery` を最新化する
  （`goBack` で再マウント or `queryClient.invalidateQueries` / `refetch`。実装時に既存のキャッシュキー `userKeys` を確認して invalidate を推奨）

### 5.6 状態表示（3状態必須・品質基準準拠）
- **空**: カード0件 → 「種目を追加」のみ。説明文で操作を案内
- **ローディング**: 保存中は `ActivityIndicator`、ボタン非活性、入力 `editable={false}`
- **エラー**: 保存失敗 / 部分失敗をバナー表示（赤）。成功は Toast/Alert（緑系）

---

## 6. マイページ側の変更: `MyPageScreen`

[apps/mobile/screens/MyPageScreen.tsx](../apps/mobile/screens/MyPageScreen.tsx) のベストタイムセクションに
「一括入力」導線を追加する。Web の [MyPageClient.tsx:228-234](../apps/web/app/[locale]/(authenticated)/mypage/_client/MyPageClient.tsx#L228-L234) と対応。

- ベストタイムセクション見出し行の右側に `Pressable`（アイコン + ラベル）を配置
- `onPress={() => navigation.navigate("BulkBestTime")}`
- ラベル: 既存キー `t("mypage.mobile.bulkInput")`（無ければ追加, §9）
- アイコン: `Feather name="upload"` または `"plus"`（既存トーンに合わせる）

---

## 7. 共通化方針（重複コードを増やさない）

`OnboardingBestTime` と `BulkBestTimeScreen` で UI・ロジックがほぼ重複するため、以下を抽出:

| 抽出対象 | 内容 | 置き場所(案) |
|---------|------|-------------|
| `STYLES` / `formatStyleDisplay` / `genKey` | 種目マスタ・表示・キー生成 | `apps/mobile/components/besttime/styleOptions.ts` |
| `hasDuplicates` / `getDuplicateKeys` / `canSave` | バリデーション | 同上 or `apps/shared/utils` |
| `EntryRow` / 種目選択モーダル | カードUI・ボトムシート | `apps/mobile/components/besttime/` |

- オンボーディングは「戻る/スキップ/`onComplete`」、マイページは「戻る/`goBack`」とフッターのみ差し替え
- **注意（CLAUDE.md 作業ルール）**: 各担当は担当範囲外ファイルを編集しない。
  共通化で `OnboardingBestTime` を触る場合は影響範囲（オンボーディングのリグレッション）を QA 対象に含める

---

## 8. データ・既知の制約

- `createBulkRecords` は **INSERT 専用**（[apps/shared/api/records.ts:190](../apps/shared/api/records.ts#L190)）。
  同じ種目を再度一括登録すると `records` 行が重複して増える。本機能はベストタイムを
  「複数の記録のうち最速」で表示しているため表示上の不整合は出にくいが、
  **「既存ベストの上書き・置き換え」は提供しない**ことを画面文言で明示する（誤解防止）。
- 大会非紐付け（`competition_id: null`）、`team_id: null`、`reaction_time: null` で登録される。
- RLS: `records` の INSERT は `auth.uid() = user_id` のみ許可。`createBulkRecords` は内部で
  認証ユーザーの `user_id` を付与するため、他人の記録は作成不可（既存挙動）。

---

## 9. i18n

- 翻訳は `apps/shared/messages/{ja,en}.json`、参照は `react-i18next` の `useTranslation()`。
- 既存 `bulkBestTime.*`（ja.json:1737〜）と `onboarding.step3.*`（ja.json:1173〜）を再利用。
- 追加が必要になりうるキー（実装時に既存有無を確認、無ければ追加）:
  - `mypage.mobile.bulkInput`（マイページの導線ラベル, 既存 web は `mypage.bulkInput`）
  - `bulkBestTime.mobile.*`（モバイル専用の説明文・空状態文言・成功トースト等）
- ハードコード禁止（既存規約）。`50m自由形` 等の表示は `practice.styles.<Key>` + 距離で組み立てる。

---

## 10. 受け入れ条件（Sprint Contract / QA 検証チェックリスト）

### 機能
- [ ] マイページのベストタイムセクションに「一括入力」ボタンが表示され、タップで `BulkBestTimeScreen` に遷移する
- [ ] 「種目を追加」で種目を選びカードが追加できる（22種目すべて選択可）
- [ ] 各カードで短水路/長水路を切り替えられ、長水路で無効な種目（25m・100m IM）は長水路を選べない
- [ ] タイムを `1:23.45` 形式およびクイック形式 `31-2` で入力でき、秒に正しく変換される
- [ ] 不正なタイム入力時はカードがエラー表示になり、保存ボタンが非活性になる
- [ ] 同一 種目×水路 を2件入れると重複警告が出て保存できない
- [ ] 「一括登録する」で全件が `records` に INSERT され、成功メッセージ後マイページに戻る
- [ ] マイページのベストタイム表に登録結果が反映される（再フェッチ）
- [ ] 部分失敗時はエラーバナーで件数/内容が分かる

### エッジケース（品質基準）
- [ ] カード0件で保存ボタンが非活性（空状態）
- [ ] 保存中の二重タップで二重登録されない（`savingRef`）
- [ ] ネットワークエラー時にエラーバナーが出てクラッシュしない
- [ ] 未認証 / `supabase` 未生成時に保存処理が走らない

### 非リグレッション
- [ ] オンボーディングの `OnboardingBestTime`（共通化で影響）が従来どおり動作する
- [ ] `tsc --noEmit` / lint / 既存テストが通る（`OnboardingWizard.test.tsx` 等）

### UI/UX
- [ ] 375px 幅で横スクロールせずに操作できる（カード型）
- [ ] ローディング/エラー/空 の3状態が実装されている
- [ ] タッチ対象が十分な大きさ（44px 目安）

---

## 11. 実装タスク分解（参考）

1. **共通モジュール抽出**（型→ロジック→UI の順）: `styleOptions.ts` / バリデーション / `EntryRow`・種目モーダル
2. **`OnboardingBestTime` を共通モジュール利用にリファクタ**（挙動不変・テスト緑を維持）
3. **`BulkBestTimeScreen` 新規作成**（共通UI + フッター「一括登録」+ 成功時 `goBack`/`refetch`）
4. **ナビゲーション登録**: `MainStackParamList` に `BulkBestTime: undefined`、`MainStack.tsx` に `Stack.Screen`
5. **`MyPageScreen` に導線追加**
6. **i18n キー追加**（`mypage.mobile.bulkInput` ほか, ja/en）
7. **テスト**: 共通バリデーション単体、画面の保存フロー、オンボーディング非リグレッション

---

## 12. 参照ファイル

| 用途 | パス |
|------|------|
| モバイル既存一括入力UI（土台） | `apps/mobile/components/onboarding/OnboardingBestTime.tsx` |
| マイページ画面 | `apps/mobile/screens/MyPageScreen.tsx` |
| ベストタイム表示 | `apps/mobile/components/profile/BestTimesTable.tsx` |
| ナビゲーション型 | `apps/mobile/navigation/types.ts` / `navigation/MainStack.tsx` |
| 共有 API | `apps/shared/api/records.ts`（`createBulkRecords` L190） |
| タイムパース | `apps/shared/utils/time.ts`（`parseTime`） |
| Web 参考実装 | `apps/web/app/[locale]/(authenticated)/bulk-besttime/_client/BulkBestTimeClient.tsx` |
| i18n | `apps/shared/messages/{ja,en}.json`（`bulkBestTime.*`, `onboarding.step3.*`） |
