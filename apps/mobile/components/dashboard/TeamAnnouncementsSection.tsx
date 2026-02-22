import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { format, parseISO, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import { useTeamAnnouncementsQuery } from '@apps/shared/hooks/queries/announcements'
import { useUnansweredAttendancesQuery, useUnsubmittedEntriesQuery } from '@apps/shared/hooks/queries/notifications'
import { formatDate } from '@apps/shared/utils/date'
import type { TeamMembershipWithUser, TeamAnnouncement } from '@swim-hub/shared/types'
import type { MainStackParamList } from '@/navigation/types'

type NavigationProp = NativeStackNavigationProp<MainStackParamList>

interface TeamAnnouncementsSectionProps {
  teams: TeamMembershipWithUser[]
}

/**
 * ダッシュボード用チームのお知らせセクション
 * 各チームのお知らせ・出欠未回答・エントリー未提出を表示
 */
export const TeamAnnouncementsSection: React.FC<TeamAnnouncementsSectionProps> = ({
  teams,
}) => {
  const { supabase, user } = useAuth()
  const navigation = useNavigation<NavigationProp>()

  // 承認済みチームのみ
  const approvedTeams = teams.filter(
    (t) => t.status === 'approved' && t.is_active
  )

  // notification hooks expect { team_id, team?: { name } } shape
  const teamsForNotifications = approvedTeams.map((t) => ({
    team_id: t.team_id,
    team: t.teams ? { name: t.teams.name } : undefined,
  }))

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    teamsForNotifications
  )
  const { data: unsubmittedEntries = [] } = useUnsubmittedEntriesQuery(
    supabase,
    user?.id,
    teamsForNotifications
  )

  if (approvedTeams.length === 0) {
    return null
  }

  return (
    <View style={styles.container}>
      {approvedTeams.map((membership) => (
        <TeamCard
          key={membership.team_id}
          membership={membership}
          unansweredAttendances={unansweredAttendances.filter(
            (a) => a.teamId === membership.team_id
          )}
          unsubmittedEntries={unsubmittedEntries.filter(
            (e) => e.teamId === membership.team_id
          )}
          navigation={navigation}
          supabase={supabase}
        />
      ))}
    </View>
  )
}

interface TeamCardProps {
  membership: TeamMembershipWithUser
  unansweredAttendances: Array<{
    teamId: string
    eventId: string
    eventType: string
    eventName: string
    eventDate: string
  }>
  unsubmittedEntries: Array<{
    teamId: string
    competitionId: string
    competitionName: string
    competitionDate: string
  }>
  navigation: NavigationProp
  supabase: ReturnType<typeof useAuth>['supabase']
}

const TeamCard: React.FC<TeamCardProps> = ({
  membership,
  unansweredAttendances,
  unsubmittedEntries,
  navigation,
  supabase,
}) => {
  const teamId = membership.team_id
  const teamName = membership.teams?.name || 'チーム'

  const { data: announcements = [] } = useTeamAnnouncementsQuery(supabase, {
    teamId,
    viewOnly: true,
    enableRealtime: false,
  })

  const hasNotifications =
    unansweredAttendances.length > 0 || unsubmittedEntries.length > 0

  // 何も表示するものがなければスキップ
  if (!hasNotifications && announcements.length === 0) {
    return null
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.teamName}>{teamName} のお知らせ</Text>
        {membership.role === 'admin' && (
          <Text style={styles.adminBadge}>管理者</Text>
        )}
      </View>

      {/* 出欠未回答 */}
      {unansweredAttendances.length > 0 && (
        <Pressable
          style={styles.notificationItem}
          onPress={() => navigation.navigate('TeamDetail', { teamId })}
        >
          <Text style={styles.notificationText}>
            直近1ヶ月で出欠が未回答の練習・大会があります。（
            {unansweredAttendances.length}件）
          </Text>
        </Pressable>
      )}

      {/* エントリー未提出 */}
      {unsubmittedEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            エントリー未提出 ({unsubmittedEntries.length}件)
          </Text>
          {unsubmittedEntries.map((entry) => (
            <Pressable
              key={entry.competitionId}
              style={styles.notificationItem}
              onPress={() =>
                navigation.navigate('EntryForm', {
                  competitionId: entry.competitionId,
                  date: entry.competitionDate,
                })
              }
            >
              <Text style={styles.notificationText}>
                {entry.competitionName}{' '}
                <Text style={styles.dateText}>
                  ({formatDate(entry.competitionDate, 'short')})
                </Text>
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* お知らせ */}
      {announcements.length > 0 && (
        <View
          style={[styles.section, hasNotifications && styles.sectionBorder]}
        >
          {announcements.map((announcement) => (
            <AnnouncementItem key={announcement.id} announcement={announcement} />
          ))}
        </View>
      )}
    </View>
  )
}

const AnnouncementItem: React.FC<{ announcement: TeamAnnouncement }> = ({
  announcement,
}) => {
  const updatedAt = isValid(new Date(announcement.updated_at))
    ? format(parseISO(announcement.updated_at), 'M月d日 HH:mm', { locale: ja })
    : '-'

  return (
    <View style={styles.announcementItem}>
      <Text style={styles.announcementTitle} numberOfLines={1}>
        {announcement.title}
      </Text>
      <Text style={styles.announcementContent} numberOfLines={2}>
        {announcement.content}
      </Text>
      <Text style={styles.announcementDate}>{updatedAt}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  teamName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  adminBadge: {
    fontSize: 11,
    color: '#6B7280',
  },
  section: {
    marginTop: 4,
  },
  sectionBorder: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  notificationItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  notificationText: {
    fontSize: 14,
    color: '#2563EB',
    lineHeight: 20,
  },
  dateText: {
    color: '#6B7280',
  },
  announcementItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  announcementContent: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    marginBottom: 4,
  },
  announcementDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
})
