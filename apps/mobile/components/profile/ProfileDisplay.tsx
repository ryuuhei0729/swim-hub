import React, { useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { TeamMembershipWithUser, UserProfile } from '@swim-hub/shared/types'
import type { MainStackParamList } from '@/navigation/types'

interface ProfileDisplayProps {
  profile: UserProfile
  teams?: TeamMembershipWithUser[]
}

type ProfileDisplayNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * プロフィール表示コンポーネント
 */
export const ProfileDisplay: React.FC<ProfileDisplayProps> = ({ profile, teams = [] }) => {
  const navigation = useNavigation<ProfileDisplayNavigationProp>()

  const formatBirthday = (birthday: string | null | undefined): string => {
    if (!birthday) return '未設定'
    try {
      return format(new Date(birthday), 'yyyy年M月d日', { locale: ja })
    } catch {
      return '未設定'
    }
  }

  // 承認済みかつアクティブなチームのみフィルタリング
  const approvedTeams = useMemo(() => {
    return teams.filter(
      (membership) => membership.status === 'approved' && membership.is_active === true
    )
  }, [teams])

  // プロフィール画像の表示（デフォルトは名前の頭文字）
  const renderAvatar = () => {
    if (profile.profile_image_path) {
      return (
        <Image
          source={{ uri: profile.profile_image_path }}
          style={styles.avatarImage}
          contentFit="cover"
        />
      )
    }
    return (
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>{profile.name.charAt(0) || '?'}</Text>
      </View>
    )
  }

  const handleTeamPress = (teamId: string) => {
    navigation.navigate('TeamDetail', { teamId })
  }

  return (
    <View style={styles.container}>
      {/* プロフィール画像と基本情報 */}
      <View style={styles.profileRow}>
        <View style={styles.avatarContainer}>{renderAvatar()}</View>
        <View style={styles.infoContainer}>
          <Text style={styles.name}>{profile.name}</Text>
        </View>
      </View>

      {/* 生年月日と参加チーム */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>生年月日</Text>
          <Text style={styles.detailValue}>{formatBirthday(profile.birthday)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>参加チーム</Text>
          {approvedTeams.length > 0 ? (
            <View style={styles.teamsContainer}>
              {approvedTeams.map((membership) => {
                const teamName =
                  'teams' in membership && membership.teams?.name
                    ? membership.teams.name
                    : 'チーム名不明'
                const teamId = membership.team_id

                return (
                  <Pressable
                    key={membership.id}
                    style={styles.teamBadge}
                    onPress={() => handleTeamPress(teamId)}
                  >
                    <Text style={styles.teamBadgeText} numberOfLines={1}>
                      {teamName}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <Text style={styles.emptyText}>参加しているチームはありません</Text>
          )}
        </View>
      </View>

      {/* 自己紹介 */}
      <View style={styles.bioContainer}>
        <Text style={styles.bioLabel}>自己紹介</Text>
        <View style={styles.bioContent}>
          <Text style={styles.bioText}>{profile.bio || '未設定'}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  detailsRow: {
    gap: 16,
  },
  detailItem: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    color: '#111827',
  },
  teamsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  teamBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
  },
  teamBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E40AF',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  bioContainer: {
    gap: 8,
  },
  bioLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  bioContent: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  bioText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 20,
  },
})
