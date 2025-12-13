import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'

export type TeamTabType = 'members' | 'announcements' | 'practices' | 'competitions' | 'bulkRegister'

export interface TeamTabsProps {
  activeTab: TeamTabType
  onTabChange: (tab: TeamTabType) => void
  isAdmin?: boolean
}

const tabs: { id: TeamTabType; name: string; icon: keyof typeof Feather.glyphMap; adminOnly?: boolean }[] = [
  {
    id: 'members',
    name: 'メンバー',
    icon: 'users',
  },
  {
    id: 'announcements',
    name: 'お知らせ',
    icon: 'bell',
  },
  {
    id: 'practices',
    name: '練習',
    icon: 'clock',
  },
  {
    id: 'competitions',
    name: '大会',
    icon: 'award',
  },
  {
    id: 'bulkRegister',
    name: '一括登録',
    icon: 'clipboard',
    adminOnly: true,
  },
]

/**
 * チームタブコンポーネント
 * メンバー、お知らせ、練習、大会、一括登録のタブ切り替え
 */
export const TeamTabs: React.FC<TeamTabsProps> = ({ activeTab, onTabChange, isAdmin = false }) => {
  // 管理者のみ表示されるタブをフィルタリング
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin)

  return (
    <View style={styles.container}>
      <View style={styles.tabList}>
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.id)}
            >
              <Feather
                name={tab.icon}
                size={16}
                color={isActive ? '#2563EB' : '#6B7280'}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.name}
              </Text>
              {isActive && <View style={styles.tabIndicator} />}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabList: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 4,
    position: 'relative',
  },
  tabActive: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#2563EB',
  },
})
