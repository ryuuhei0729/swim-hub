/**
 * iOSカレンダー連携設定コンポーネント
 * iOSネイティブカレンダーとの同期設定を管理
 */
import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useIOSCalendarSync } from '@/hooks/useIOSCalendarSync'
import type { UserProfile } from '@swim-hub/shared/types'

interface IOSCalendarSyncSettingsProps {
  /** ユーザープロフィール */
  profile: UserProfile | null
  /** 設定更新後のコールバック */
  onUpdate: () => void
}

/**
 * カレンダーアイコン
 */
const CalendarIcon: React.FC = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path
      d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
      stroke="#374151"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M15.6947 13.7H15.7037M15.6947 16.7H15.7037M11.9955 13.7H12.0045M11.9955 16.7H12.0045M8.29431 13.7H8.30329M8.29431 16.7H8.30329"
      stroke="#374151"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)

export const IOSCalendarSyncSettings: React.FC<IOSCalendarSyncSettingsProps> = ({
  profile,
  onUpdate,
}) => {
  const {
    isAvailable,
    enableSync,
    disableSync,
    updateSyncSettings,
    loading: syncLoading,
    error: syncError,
    clearError,
  } = useIOSCalendarSync()
  const [syncing, setSyncing] = useState(false)

  // iOSでない場合は表示しない
  if (Platform.OS !== 'ios' || !isAvailable) {
    return null
  }

  const isEnabled = profile?.ios_calendar_enabled || false
  const syncPractices = profile?.ios_calendar_sync_practices ?? true
  const syncCompetitions = profile?.ios_calendar_sync_competitions ?? true

  // 連携開始
  const handleConnect = async () => {
    clearError()
    const success = await enableSync()
    if (success) {
      onUpdate()
    }
  }

  // 連携解除
  const handleDisconnect = () => {
    Alert.alert(
      '確認',
      'iOSカレンダー連携を解除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: async () => {
            const success = await disableSync()
            if (success) {
              onUpdate()
            }
          },
        },
      ]
    )
  }

  // 同期設定変更
  const handleSyncSettingChange = async (
    field: 'ios_calendar_sync_practices' | 'ios_calendar_sync_competitions',
    value: boolean
  ) => {
    setSyncing(true)
    clearError()

    const success = await updateSyncSettings(field, value)
    if (success) {
      onUpdate()
    }

    setSyncing(false)
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>iOSカレンダー連携</Text>
        {isEnabled && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>連携中</Text>
          </View>
        )}
      </View>

      {/* エラー表示 */}
      {syncError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{syncError}</Text>
        </View>
      )}

      {!isEnabled ? (
        // 未連携状態
        <View style={styles.section}>
          <Text style={styles.description}>
            iOSカレンダーと連携すると、練習記録と大会記録がデバイスのカレンダーに追加されます。
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.connectButton,
              pressed && styles.buttonPressed,
              syncLoading && styles.buttonDisabled,
            ]}
            onPress={handleConnect}
            disabled={syncLoading}
            accessibilityRole="button"
            accessibilityLabel="iOSカレンダーと連携"
          >
            {syncLoading ? (
              <ActivityIndicator color="#374151" size="small" />
            ) : (
              <View style={styles.buttonContent}>
                <CalendarIcon />
                <Text style={styles.connectButtonText}>iOSカレンダーと連携</Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : (
        // 連携済み状態
        <>
          {/* 同期設定 */}
          <View style={styles.section}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>練習記録を自動同期</Text>
              <Switch
                value={syncPractices}
                onValueChange={(value) =>
                  handleSyncSettingChange('ios_calendar_sync_practices', value)
                }
                disabled={syncing || syncLoading}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={syncPractices ? '#2563EB' : '#F3F4F6'}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>大会記録を自動同期</Text>
              <Switch
                value={syncCompetitions}
                onValueChange={(value) =>
                  handleSyncSettingChange('ios_calendar_sync_competitions', value)
                }
                disabled={syncing || syncLoading}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={syncCompetitions ? '#2563EB' : '#F3F4F6'}
              />
            </View>
          </View>

          {/* 説明 */}
          <View style={[styles.section, styles.borderTop]}>
            <Text style={styles.description}>
              練習や大会を作成・更新すると、自動的にiOSカレンダーに反映されます。
              カレンダーアプリの「SwimHub」カレンダーで予定を確認できます。
            </Text>
          </View>

          {/* 連携解除 */}
          <View style={[styles.section, styles.borderTop]}>
            <Pressable
              style={({ pressed }) => [
                styles.disconnectButton,
                pressed && styles.disconnectButtonPressed,
              ]}
              onPress={handleDisconnect}
              accessibilityRole="button"
              accessibilityLabel="連携を解除"
            >
              <Text style={styles.disconnectButtonText}>連携を解除</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#059669',
  },
  section: {
    gap: 12,
  },
  borderTop: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  connectButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  buttonPressed: {
    backgroundColor: '#F3F4F6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 14,
    color: '#374151',
  },
  disconnectButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disconnectButtonPressed: {
    backgroundColor: '#FEF2F2',
  },
  disconnectButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#DC2626',
  },
})
