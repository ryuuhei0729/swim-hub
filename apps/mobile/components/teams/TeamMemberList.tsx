import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, ActivityIndicator } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} from '@apps/shared/hooks/queries/teams'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import { formatTime } from '@/utils/formatters'

// ベストタイム型定義
interface MemberBestTime {
  style_name: string
  time: number
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
}

// 種目リスト（WEBと同様）
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー'] as const
const DISTANCES = [50, 100, 200, 400, 800] as const

// 種目の色定義
const STYLE_COLORS: Record<string, { bg: string; header: string; text: string }> = {
  '自由形': { bg: '#FEFCE8', header: '#FEF9C3', text: '#854D0E' },
  '平泳ぎ': { bg: '#F0FDF4', header: '#DCFCE7', text: '#166534' },
  '背泳ぎ': { bg: '#FEF2F2', header: '#FEE2E2', text: '#991B1B' },
  'バタフライ': { bg: '#EFF6FF', header: '#DBEAFE', text: '#1E40AF' },
  '個人メドレー': { bg: '#FDF2F8', header: '#FCE7F3', text: '#9D174D' },
}

/**
 * 種目×距離の有効な組み合わせかチェック
 */
const isInvalidCombination = (style: string, distance: number): boolean => {
  if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
  if ((style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') && (distance === 400 || distance === 800)) return true
  return false
}

interface TeamMemberListProps {
  members: TeamMembershipWithUser[]
  teamId: string
  isLoading: boolean
  isError: boolean
  error: Error | null
  currentUserId: string
  isCurrentUserAdmin: boolean
  onRetry?: () => void
  onMemberChange?: () => void
}

/**
 * チームメンバー一覧コンポーネント（WEB版準拠）
 * メンバー一覧とベストタイムテーブルを表示
 */
export const TeamMemberList: React.FC<TeamMemberListProps> = ({
  members,
  teamId: _teamId,
  isLoading,
  isError,
  error,
  currentUserId,
  isCurrentUserAdmin,
  onRetry,
  onMemberChange,
}) => {
  const { supabase } = useAuth()
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase)
  const removeMemberMutation = useRemoveMemberMutation(supabase)
  const [processingMemberId, setProcessingMemberId] = useState<string | null>(null)

  // ベストタイムデータ
  const [bestTimesMap, setBestTimesMap] = useState<Map<string, MemberBestTime[]>>(new Map())
  const [loadingBestTimes, setLoadingBestTimes] = useState(false)

  // メンバーのベストタイムを一括取得
  const loadBestTimes = useCallback(async () => {
    if (members.length === 0) return

    setLoadingBestTimes(true)
    try {
      const userIds = members.map((m) => m.user_id)

      const { data, error: fetchError } = await supabase
        .from('records')
        .select(`
          user_id,
          time,
          pool_type,
          is_relaying,
          styles!records_style_id_fkey (
            name_jp,
            distance
          )
        `)
        .in('user_id', userIds)
        .order('time', { ascending: true })

      if (fetchError) throw fetchError

      // ユーザーごとに種目×プール種別のベストタイムをまとめる
      const map = new Map<string, MemberBestTime[]>()

      if (data) {
        // user_idごとにグループ化してベストタイムを抽出
        const grouped = new Map<string, typeof data>()
        data.forEach((record) => {
          const list = grouped.get(record.user_id) || []
          list.push(record)
          grouped.set(record.user_id, list)
        })

        grouped.forEach((records, userId) => {
          const bestTimes: MemberBestTime[] = []
          const seen = new Set<string>()

          records.forEach((record: {
            user_id: string
            time: number
            pool_type: number
            is_relaying: boolean
            styles?: { name_jp: string; distance: number } | null | { name_jp: string; distance: number }[]
          }) => {
            const style = Array.isArray(record.styles) ? record.styles[0] : record.styles
            if (!style) return
            const key = `${style.name_jp}_${record.pool_type}_${record.is_relaying}`
            if (seen.has(key)) return // 既にベストが登録済み（timeでソートされているので最初が最速）
            seen.add(key)
            bestTimes.push({
              style_name: style.name_jp,
              time: record.time,
              pool_type: record.pool_type,
              is_relaying: record.is_relaying,
            })
          })

          // membershipのidをキーにする（WEBと同じ）
          const membership = members.find((m) => m.user_id === userId)
          if (membership) {
            map.set(membership.id, bestTimes)
          }
        })
      }

      setBestTimesMap(map)
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
    } finally {
      setLoadingBestTimes(false)
    }
  }, [members, supabase])

  useEffect(() => {
    if (members.length > 0) {
      loadBestTimes()
    }
  }, [members, loadBestTimes])

  // 特定メンバーの種目×距離のベストタイムを取得
  const getBestTime = (memberId: string, styleName: string, distance: number): MemberBestTime | null => {
    const times = bestTimesMap.get(memberId) || []
    const dbStyleName = `${distance}m${styleName}`

    const candidates = times.filter(
      (bt) => bt.style_name === dbStyleName && !bt.is_relaying
    )
    if (candidates.length === 0) return null
    return candidates.reduce((best, current) =>
      current.time < best.time ? current : best
    )
  }

  // ロール変更処理
  const handleRoleChange = async (member: TeamMembershipWithUser, newRole: 'admin' | 'user') => {
    if (member.role === newRole) return

    setProcessingMemberId(member.id)
    try {
      await updateRoleMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
        role: newRole,
      })
      if (onMemberChange) onMemberChange()
    } catch (err) {
      console.error('ロール変更エラー:', err)
      const errorMessage = err instanceof Error ? err.message : 'ロールの変更に失敗しました'
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    } finally {
      setProcessingMemberId(null)
    }
  }

  // メンバー削除処理
  const handleRemoveMember = (member: TeamMembershipWithUser) => {
    const memberName = member.users.name || 'このメンバー'
    const confirmMessage = `${memberName}をチームから削除しますか？\nこの操作は取り消せません。`

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage)
      if (!confirmed) return
      executeRemoveMember(member)
    } else {
      Alert.alert('削除確認', confirmMessage, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => executeRemoveMember(member),
        },
      ])
    }
  }

  const executeRemoveMember = async (member: TeamMembershipWithUser) => {
    setProcessingMemberId(member.id)
    try {
      await removeMemberMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
      })
      if (onMemberChange) onMemberChange()
    } catch (err) {
      console.error('メンバー削除エラー:', err)
      const errorMessage = err instanceof Error ? err.message : 'メンバーの削除に失敗しました'
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    } finally {
      setProcessingMemberId(null)
    }
  }

  // ローディング状態
  if (isLoading && members.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="メンバーを読み込み中..." />
      </View>
    )
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || 'メンバー一覧の取得に失敗しました'}
          onRetry={onRetry}
        />
      </View>
    )
  }

  // 空状態
  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="users" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>メンバーがいません</Text>
      </View>
    )
  }

  // メンバータイプの表示テキスト
  const getMemberTypeText = (memberType: string | null): string => {
    switch (memberType) {
      case 'swimmer': return '選手'
      case 'coach': return 'コーチ'
      case 'director': return '監督'
      case 'manager': return 'マネージャー'
      default: return ''
    }
  }

  const adminCount = members.filter((m) => m.role === 'admin').length
  const userCount = members.filter((m) => m.role === 'user').length

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* メンバー統計ヘッダー */}
      <View style={styles.statsHeader}>
        <Text style={styles.statsTitle}>メンバー</Text>
        <View style={styles.statsRow}>
          <Text style={styles.statsText}>
            合計: <Text style={styles.statsValue}>{members.length}人</Text>
          </Text>
          <Text style={styles.statsText}>
            管理者: <Text style={[styles.statsValue, styles.statsAdmin]}>{adminCount}人</Text>
          </Text>
          <Text style={styles.statsText}>
            メンバー: <Text style={styles.statsValue}>{userCount}人</Text>
          </Text>
        </View>
      </View>

      {/* メンバーカード一覧 */}
      {members.map((item) => {
        const user = item.users
        const isCurrentUser = item.user_id === currentUserId
        const roleText = item.role === 'admin' ? '管理者' : 'メンバー'
        const memberTypeText = getMemberTypeText(item.member_type)
        const joinedDate = format(new Date(item.joined_at), 'yyyy年M月d日', { locale: ja })
        const isProcessing = processingMemberId === item.id
        const canManage = isCurrentUserAdmin && !isCurrentUser

        // このメンバーのベストタイムを取得
        const memberBestTimes = bestTimesMap.get(item.id) || []
        const hasBestTimes = memberBestTimes.length > 0

        return (
          <View
            key={item.id}
            style={[
              styles.memberCard,
              isCurrentUser && styles.memberCardCurrent,
            ]}
          >
            {/* メンバーヘッダー */}
            <View style={styles.memberHeader}>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {user.name || '名前未設定'}
                  </Text>
                  {item.role === 'admin' && (
                    <Feather name="star" size={14} color="#EAB308" />
                  )}
                  {isCurrentUser && (
                    <Text style={styles.currentUserMark}>あなた</Text>
                  )}
                </View>
                <View style={styles.memberBadges}>
                  {canManage ? (
                    <Pressable
                      style={[styles.badge, item.role === 'admin' && styles.adminBadge]}
                      onPress={() =>
                        handleRoleChange(item, item.role === 'admin' ? 'user' : 'admin')
                      }
                      disabled={isProcessing}
                    >
                      <Text style={[styles.badgeText, item.role === 'admin' && styles.adminBadgeText]}>
                        {roleText}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={[styles.badge, item.role === 'admin' && styles.adminBadge]}>
                      <Text style={[styles.badgeText, item.role === 'admin' && styles.adminBadgeText]}>
                        {roleText}
                      </Text>
                    </View>
                  )}
                  {memberTypeText !== '' && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{memberTypeText}</Text>
                    </View>
                  )}
                  <Text style={styles.joinedDate}>参加: {joinedDate}</Text>
                </View>
              </View>
              {canManage && (
                <Pressable
                  style={[styles.deleteButton, isProcessing && styles.deleteButtonDisabled]}
                  onPress={() => handleRemoveMember(item)}
                  disabled={isProcessing}
                >
                  <Feather name="trash-2" size={16} color="#DC2626" />
                </Pressable>
              )}
            </View>

            {/* ベストタイムテーブル */}
            {loadingBestTimes ? (
              <View style={styles.bestTimesLoading}>
                <ActivityIndicator size="small" color="#6B7280" />
              </View>
            ) : hasBestTimes ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bestTimesScroll}>
                <View style={styles.bestTimesTable}>
                  {/* 種目ヘッダー + タイム行 */}
                  {STYLES.map((styleName) => {
                    const distances = DISTANCES.filter((d) => !isInvalidCombination(styleName, d))
                    const colors = STYLE_COLORS[styleName]

                    // この種目にベストタイムが1つでもあるか
                    const hasAnyTime = distances.some((d) => getBestTime(item.id, styleName, d) !== null)
                    if (!hasAnyTime) return null

                    return (
                      <View key={styleName} style={styles.styleColumn}>
                        <View style={[styles.styleHeader, { backgroundColor: colors.header }]}>
                          <Text style={[styles.styleHeaderText, { color: colors.text }]}>
                            {styleName}
                          </Text>
                        </View>
                        {distances.map((distance) => {
                          const bestTime = getBestTime(item.id, styleName, distance)
                          return (
                            <View key={distance} style={[styles.timeCell, { backgroundColor: colors.bg }]}>
                              <Text style={styles.distanceText}>{distance}m</Text>
                              <Text style={[styles.timeText, bestTime ? styles.timeTextValue : styles.timeTextEmpty]}>
                                {bestTime
                                  ? `${formatTime(bestTime.time)}${bestTime.pool_type === 1 ? ' L' : ''}`
                                  : '—'}
                              </Text>
                            </View>
                          )
                        })}
                      </View>
                    )
                  })}
                </View>
              </ScrollView>
            ) : (
              <Text style={styles.noBestTimes}>記録なし</Text>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  statsHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statsText: {
    fontSize: 13,
    color: '#6B7280',
  },
  statsValue: {
    fontWeight: '600',
    color: '#111827',
  },
  statsAdmin: {
    color: '#EAB308',
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberCardCurrent: {
    borderColor: '#93C5FD',
    backgroundColor: '#F0F7FF',
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flex: 1,
    gap: 6,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  currentUserMark: {
    fontSize: 11,
    fontWeight: '500',
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  memberBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  adminBadge: {
    backgroundColor: '#DBEAFE',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  adminBadgeText: {
    color: '#2563EB',
  },
  joinedDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  bestTimesScroll: {
    marginTop: 12,
  },
  bestTimesTable: {
    flexDirection: 'row',
    gap: 8,
  },
  styleColumn: {
    minWidth: 90,
  },
  styleHeader: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 4,
    alignItems: 'center',
  },
  styleHeaderText: {
    fontSize: 12,
    fontWeight: '700',
  },
  timeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    marginBottom: 2,
    gap: 4,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 28,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeTextValue: {
    color: '#111827',
  },
  timeTextEmpty: {
    color: '#D1D5DB',
  },
  noBestTimes: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bestTimesLoading: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
})
