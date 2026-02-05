import React, { useMemo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types'

interface TeamItemProps {
  membership: TeamMembershipWithUser
  onPress?: (membership: TeamMembershipWithUser) => void
}

/**
 * チームアイテムコンポーネント
 * チーム一覧の1件を表示
 */
const TeamItemComponent: React.FC<TeamItemProps> = ({ membership, onPress }) => {
  const team = useMemo(() => membership.teams, [membership.teams])
  const role = useMemo(
    () => (membership.role === 'admin' ? '管理者' : 'メンバー'),
    [membership.role]
  )
  const status = useMemo(
    () =>
      membership.status === 'pending'
        ? '承認待ち'
        : membership.status === 'approved'
          ? '承認済み'
          : '拒否',
    [membership.status]
  )

  const handlePress = useCallback(() => {
    onPress?.(membership)
  }, [onPress, membership])

  // teamがnullの場合は何も表示しない
  if (!team) {
    return null
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        membership.status === 'pending' && styles.pendingContainer,
      ]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.teamName} numberOfLines={1}>
            {team.name}
          </Text>
          {membership.status === 'pending' && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          )}
        </View>

        {team.description && (
          <Text style={styles.description} numberOfLines={2}>
            {team.description}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={styles.role}>{role}</Text>
          {membership.member_type && (
            <Text style={styles.memberType}>
              {membership.member_type === 'swimmer' ? '選手' :
               membership.member_type === 'coach' ? 'コーチ' :
               membership.member_type === 'director' ? '監督' :
               membership.member_type === 'manager' ? 'マネージャー' : ''}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pendingContainer: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400E',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  role: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberType: {
    fontSize: 12,
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
})

// メモ化して再レンダリングを最適化
export const TeamItem = React.memo(TeamItemComponent, (prevProps, nextProps) => {
  // カスタム比較関数：membership.idが同じで、主要プロパティが変更されていない場合は再レンダリングしない
  return (
    prevProps.membership.id === nextProps.membership.id &&
    prevProps.membership.status === nextProps.membership.status &&
    prevProps.membership.role === nextProps.membership.role &&
    prevProps.membership.member_type === nextProps.membership.member_type &&
    prevProps.membership.teams?.id === nextProps.membership.teams?.id &&
    prevProps.membership.teams?.name === nextProps.membership.teams?.name &&
    prevProps.membership.teams?.description === nextProps.membership.teams?.description
  )
})
