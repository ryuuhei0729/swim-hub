<!-- c3e7267b-7578-4fce-a90d-40e9b5dc7e19 e94742d9-1439-4865-ad70-412df6e6b508 -->
# `/api/attendance/update`のリファクタリング計画

## 概要

`apps/web/app/api/attendance/update/route.ts`の機能を`apps/shared/api/teams/attendances.ts`に移動し、API Route Handlerを削除します。

現在の`/api/attendance/update`は、`practices`または`competitions`テーブルの`attendance_status`（'before' | 'open' | 'closed'）を更新する管理者向けの機能です。

## ファイル変更計画

### 新規・更新

- **更新**: `apps/shared/api/teams/attendances.ts`
- 管理者権限チェックのヘルパーメソッド`requireTeamAdmin`を追加
- `updatePracticeAttendanceStatus(practiceId: string, status: 'before' | 'open' | 'closed' | null)`メソッドを追加
- `updateCompetitionAttendanceStatus(competitionId: string, status: 'before' | 'open' | 'closed' | null)`メソッドを追加

- **更新**: `apps/web/app/(authenticated)/teams/[teamId]/_client/TeamDetailClient.tsx`
- `handleAttendanceStatusChange`関数を修正
- `/api/attendance/update`へのfetch呼び出しを削除
- `TeamAttendancesAPI`の新しいメソッドを使用するように変更

### 削除

- **削除**: `apps/web/app/api/attendance/update/route.ts`
- 機能が`apps/shared/api/teams/attendances.ts`に移動したため不要

## 主要実装ステップ

1. **`TeamAttendancesAPI`に管理者権限チェックメソッドを追加**

- `requireTeamAdmin(teamId: string, userId?: string): Promise<void>`を追加
- `team_memberships`テーブルから`role = 'admin'`を確認

2. **`TeamAttendancesAPI`に`attendance_status`更新メソッドを追加**

- `updatePracticeAttendanceStatus(practiceId: string, status: 'before' | 'open' | 'closed' | null): Promise<void>`
- `practiceId`から`team_id`を取得
- 管理者権限を確認
- `practices`テーブルの`attendance_status`を更新
- `updateCompetitionAttendanceStatus(competitionId: string, status: 'before' | 'open' | 'closed' | null): Promise<void>`
- `competitionId`から`team_id`を取得
- 管理者権限を確認
- `competitions`テーブルの`attendance_status`を更新

3. **`TeamDetailClient.tsx`を更新**

- `TeamAttendancesAPI`をインポート
- `handleAttendanceStatusChange`関数を修正
- `TeamAttendancesAPI`のインスタンスを作成
- `eventType`に応じて適切なメソッドを呼び出す

4. **API Route Handlerを削除**

- `apps/web/app/api/attendance/update/route.ts`を削除

## 技術的考慮事項

- **認証・認可**: 管理者権限チェックを実装し、セキュリティを向上
- **エラーハンドリング**: 既存のエラーハンドリングパターンに従う
- **型安全性**: `AttendanceStatusType`型を使用して型安全性を確保
- **一貫性**: 既存の`TeamAttendancesAPI`のパターンに従う

## リスクと対策

- **リスク**: 既存の機能が動作しなくなる可能性
- **対策**: `TeamDetailClient.tsx`の更新を確実に実施し、動作確認を行う

- **リスク**: 管理者権限チェックの実装漏れ
- **対策**: `requireTeamAdmin`メソッドを確実に実装し、両方のメソッドで使用する

## テスト計画

- [ ] `TeamAttendancesAPI.updatePracticeAttendanceStatus`のユニットテスト
- [ ] `TeamAttendancesAPI.updateCompetitionAttendanceStatus`のユニットテスト
- [ ] 管理者権限チェックのテスト
- [ ] `TeamDetailClient.tsx`の動作確認（E2Eテストまたは手動テスト）