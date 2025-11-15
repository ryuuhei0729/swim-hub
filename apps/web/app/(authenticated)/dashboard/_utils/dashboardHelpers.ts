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
 * metadataオブジェクトがrecordプロパティを持ち、そのrecordがcompetitionIdを持つかチェック
 */
function hasMetadataWithRecordCompetition(value: unknown): value is {
  metadata: {
    record?: {
      competitionId?: string | null
    }
  }
} {
  if (!isObject(value) || !('metadata' in value)) {
    return false
  }
  const metadata = value.metadata
  if (!isObject(metadata)) {
    return false
  }
  // recordプロパティが存在する場合、オブジェクトまたはnull/undefinedであることを確認
  if ('record' in metadata) {
    const record = metadata.record
    return record === null || record === undefined || isObject(record)
  }
  return false
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * 大会IDを取得するヘルパー関数
 */
export function getCompetitionId(
  createdId: string | null,
  editingData: unknown
): string | undefined {
  if (createdId) return createdId
  
  if (isEditingDataWithCompetition(editingData)) {
    const competitionId = editingData.competitionId
    return typeof competitionId === 'string' ? competitionId : undefined
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
  
  // 次にmetadata.record.competitionIdをチェック
  if (hasMetadataWithRecordCompetition(editingData)) {
    const metadata = editingData.metadata
    if (isObject(metadata) && 'record' in metadata) {
      const record = metadata.record
      if (isObject(record) && 'competitionId' in record) {
        const recordCompetitionId = record.competitionId
        if (typeof recordCompetitionId === 'string') {
          return recordCompetitionId
        }
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

