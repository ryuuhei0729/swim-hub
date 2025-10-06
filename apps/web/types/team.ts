// チーム関連の型定義

export interface Team {
  id: string
  name: string
  description?: string
  inviteCode: string
  createdAt: string
  updatedAt: string
}

export interface TeamMembership {
  id: string
  teamId: string
  userId: string
  role: 'ADMIN' | 'USER'
  joinedAt: string
  leftAt?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TeamAnnouncement {
  id: string
  teamId: string
  title: string
  content: string
  createdBy: string
  isPublished: boolean
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

// 入力型
export interface CreateTeamAnnouncementInput {
  teamId: string
  title: string
  content: string
  isPublished?: boolean
}

export interface UpdateTeamAnnouncementInput {
  title?: string
  content?: string
  isPublished?: boolean
}
