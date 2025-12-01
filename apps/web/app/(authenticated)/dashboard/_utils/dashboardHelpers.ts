// =============================================================================
// ダッシュボード用ヘルパー関数
// =============================================================================

import type { EntryWithStyle } from '@/stores/types'
import type { EntryInfo } from '@apps/shared/types/ui'

// =============================================================================
// 型ガード関数
// =============================================================================

/**
 * 値がオブジェクトかどうかをチェック
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * オブジェクトが指定されたプロパティを持ち、そのプロパティが文字列かどうかをチェック
 */
function hasStringProperty(obj: Record<string, unknown>, prop: string): boolean {
  return prop in obj && (typeof obj[prop] === 'string' || obj[prop] === null || obj[prop] === undefined)
}

/**
 * editingDataがcompetitionIdを持つオブジェクトかどうかをチェック
 */
function isEditingDataWithCompetition(value: unknown): value is { competitionId: string | null | undefined } {
  return isObject(value) && hasStringProperty(value, 'competitionId')
}

/**
 * editingDataがpracticeIdを持つオブジェクトかどうかをチェック
 */
function isEditingDataWithPractice(value: unknown): value is { practiceId: string | null | undefined } {
  return isObject(value) && hasStringProperty(value, 'practiceId')
}

/**
 * metadataオブジェクトを持つかチェック
 */
function hasMetadata(value: unknown): value is {
  metadata: Record<string, unknown>
} {
  if (!isObject(value) || !('metadata' in value)) {
    return false
  }
  return isObject(value.metadata)
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 練習IDを取得するヘルパー関数
 */
export function getPracticeId(
  createdId: string | null,
  editingData: unknown
): string | undefined {
  if (createdId) return createdId
  
  // 直接practiceIdをチェック
  if (isEditingDataWithPractice(editingData)) {
    const practiceId = editingData.practiceId
    if (typeof practiceId === 'string') {
      return practiceId
    }
  }
  
  // CalendarItemの場合: metadata.practice.id または metadata.practice_id をチェック
  if (hasMetadata(editingData)) {
    const metadata = editingData.metadata
    
    // metadata.practice.id をチェック
    if ('practice' in metadata && isObject(metadata.practice) && 'id' in metadata.practice) {
      const practiceId = metadata.practice.id
      if (typeof practiceId === 'string') {
        return practiceId
      }
    }
    
    // metadata.practice_id をチェック
    if ('practice_id' in metadata) {
      const practiceId = metadata.practice_id
      if (typeof practiceId === 'string') {
        return practiceId
      }
    }
  }
  
  return undefined
}

/**
 * 大会IDを取得するヘルパー関数
 */
export function getCompetitionId(
  createdId: string | null,
  editingData: unknown
): string | undefined {
  if (createdId) return createdId
  
  // 直接competitionIdをチェック
  if (isEditingDataWithCompetition(editingData)) {
    const competitionId = editingData.competitionId
    if (typeof competitionId === 'string') {
      return competitionId
    }
  }
  
  // CalendarItemの場合: metadata.competition.id または metadata.entry.competition_id をチェック
  if (hasMetadata(editingData)) {
    const metadata = editingData.metadata
    
    // metadata.competition.id をチェック
    if ('competition' in metadata && isObject(metadata.competition) && 'id' in metadata.competition) {
      const competitionId = metadata.competition.id
      if (typeof competitionId === 'string') {
        return competitionId
      }
    }
    
    // metadata.entry.competition_id をチェック
    if ('entry' in metadata && isObject(metadata.entry) && 'competition_id' in metadata.entry) {
      const competitionId = metadata.entry.competition_id
      if (typeof competitionId === 'string') {
        return competitionId
      }
    }
  }
  
  return undefined
}

/**
 * 記録用の大会IDを取得するヘルパー関数
 */
export function getRecordCompetitionId(
  createdId: string | null,
  editingData: unknown
): string | null {
  if (createdId) return createdId
  
  // まず直接competitionIdをチェック
  if (isEditingDataWithCompetition(editingData)) {
    const competitionId = editingData.competitionId
    if (typeof competitionId === 'string') {
      return competitionId
    }
  }
  
  // CalendarItemの場合: metadata内の各プロパティをチェック
  if (hasMetadata(editingData)) {
    const metadata = editingData.metadata
    
    // metadata.record.competition_id をチェック
    if ('record' in metadata && isObject(metadata.record) && 'competition_id' in metadata.record) {
      const competitionId = metadata.record.competition_id
      if (typeof competitionId === 'string') {
        return competitionId
      }
    }
    
    // metadata.competition.id をチェック
    if ('competition' in metadata && isObject(metadata.competition) && 'id' in metadata.competition) {
      const competitionId = metadata.competition.id
      if (typeof competitionId === 'string') {
        return competitionId
      }
    }
    
    // metadata.entry.competition_id をチェック
    if ('entry' in metadata && isObject(metadata.entry) && 'competition_id' in metadata.entry) {
      const competitionId = metadata.entry.competition_id
      if (typeof competitionId === 'string') {
        return competitionId
      }
    }
  }
  
  return null
}

/**
 * 記録フォーム用のEntryInfoを取得するヘルパー関数
 */
export function getEntryDataForRecord(
  editingData: unknown,
  createdEntries: EntryWithStyle[]
): EntryInfo | undefined {
  if (editingData && typeof editingData === 'object' && 'entryData' in editingData 
    && editingData.entryData 
    && typeof editingData.entryData === 'object' 
    && editingData.entryData !== null) {
    const entryData = editingData.entryData
    if ('styleId' in entryData && 'styleName' in entryData) {
      const styleId = typeof entryData.styleId === 'number' ? entryData.styleId 
        : typeof entryData.styleId === 'string' ? Number(entryData.styleId) 
        : undefined
      const styleName = typeof entryData.styleName === 'string' ? entryData.styleName : ''
      const entryTime = 'entryTime' in entryData 
        ? (typeof entryData.entryTime === 'number' ? entryData.entryTime 
          : entryData.entryTime === null ? null 
          : undefined)
        : undefined
      
      if (styleId !== undefined && styleName !== undefined) {
        return { styleId, styleName, entryTime }
      }
    }
  }
  
  if (createdEntries.length > 0) {
    return {
      styleId: createdEntries[0].styleId,
      styleName: String(createdEntries[0].styleName || ''),
      entryTime: createdEntries[0].entryTime
    }
  }
  
  return undefined
}

