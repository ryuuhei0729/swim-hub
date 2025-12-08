import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { TeamMembershipWithUser } from '@swim-hub/shared/types/database'

interface TeamItemProps {
  membership: TeamMembershipWithUser
  onPress?: (membership: TeamMembershipWithUser) => void
}

/**
 * チームアイテムコンポーネント
 * チーム一覧の1件を表示
 */
export const TeamItem: React.FC<TeamItemProps> = ({ membership, onPress }) => {
  const team = membership.teams
  const user = membership.users
  const role = membership.role === 'admin' ? '管理者' : 'メンバー'
  const status = membership.status === 'pending' ? '承認待ち' : membership.status === 'approved' ? '承認済み' : '拒否'

  const handlePress = () => {
    onPress?.(membership)
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
