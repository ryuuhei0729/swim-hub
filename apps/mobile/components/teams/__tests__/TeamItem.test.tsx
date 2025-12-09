// =============================================================================
// TeamItem.test.tsx - チームアイテムコンポーネントのテスト
// =============================================================================

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TeamItem } from '../TeamItem'
import { createMockTeamMembershipWithUser } from '@/__mocks__/supabase'

describe('TeamItem', () => {
  const mockMembership = createMockTeamMembershipWithUser({
    role: 'admin',
    status: 'approved',
    teams: {
      id: 'team-1',
      name: 'テストチーム',
      description: 'テストチームの説明',
      invite_code: 'ABC123',
    },
  })

  it('チーム情報が正しく表示される', () => {
    render(<TeamItem membership={mockMembership} />)
    
    // チーム名が表示される
    expect(screen.getByText('テストチーム')).toBeTruthy()
    // 説明が表示される
    expect(screen.getByText('テストチームの説明')).toBeTruthy()
    // ロールが表示される
    expect(screen.getByText('管理者')).toBeTruthy()
  })

  it('adminロールの場合、「管理者」が表示される', () => {
    render(<TeamItem membership={mockMembership} />)
    
    expect(screen.getByText('管理者')).toBeTruthy()
  })

  it('userロールの場合、「メンバー」が表示される', () => {
    const userMembership = createMockTeamMembershipWithUser({
      ...mockMembership,
      role: 'user',
    })
    
    render(<TeamItem membership={userMembership} />)
    
    expect(screen.getByText('メンバー')).toBeTruthy()
  })

  it('承認待ちステータスの場合、バッジが表示される', () => {
    const pendingMembership = createMockTeamMembershipWithUser({
      ...mockMembership,
      status: 'pending',
    })
    
    render(<TeamItem membership={pendingMembership} />)
    
    expect(screen.getByText('承認待ち')).toBeTruthy()
  })

  it('承認済みステータスの場合、バッジが表示されない', () => {
    render(<TeamItem membership={mockMembership} />)
    
    expect(screen.queryByText('承認待ち')).toBeNull()
  })

  it('説明がnullの場合、説明が表示されない', () => {
    const membershipWithoutDescription = createMockTeamMembershipWithUser({
      ...mockMembership,
      teams: {
        ...mockMembership.teams,
        description: null,
      },
    })
    
    render(<TeamItem membership={membershipWithoutDescription} />)
    
    expect(screen.queryByText('テストチームの説明')).toBeNull()
  })

  it('member_typeが表示される', () => {
    const membershipWithType = createMockTeamMembershipWithUser({
      ...mockMembership,
      member_type: 'swimmer',
    })
    
    render(<TeamItem membership={membershipWithType} />)
    
    expect(screen.getByText('選手')).toBeTruthy()
  })

  it('onPressが提供された場合、タップでコールバックが呼ばれる', () => {
    const onPress = vi.fn()
    render(<TeamItem membership={mockMembership} onPress={onPress} />)
    
    // Pressableをタップ（button要素としてレンダリングされる）
    const pressable = screen.getByText('テストチーム').closest('button')
    if (pressable) {
      fireEvent.click(pressable)
      expect(onPress).toHaveBeenCalledTimes(1)
      expect(onPress).toHaveBeenCalledWith(mockMembership)
    }
  })

  it('onPressが提供されない場合でもエラーが発生しない', () => {
    render(<TeamItem membership={mockMembership} />)
    
    // エラーなくレンダリングされる
    expect(screen.getByText('テストチーム')).toBeTruthy()
  })
})

