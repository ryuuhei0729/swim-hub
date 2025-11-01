// =============================================================================
// ダッシュボード用ヘルパー関数
// =============================================================================

import type { EntryWithStyle } from '@/stores/types'
import type { EntryInfo } from '@apps/shared/types/ui'

/**
 * 大会IDを取得するヘルパー関数
 */
export function getCompetitionId(
  createdId: string | null,
  editingData: unknown
): string | undefined {
  if (createdId) return createdId
  const competitionId = (editingData as { competition_id?: string | null } | null)?.competition_id
  return competitionId ?? undefined
}

/**
 * 記録用の大会IDを取得するヘルパー関数
 */
export function getRecordCompetitionId(
  createdId: string | null,
  editingData: unknown
): string | null {
  if (createdId) return createdId
  
  const data = editingData as {
    competition_id?: string | null
    metadata?: {
      record?: {
        competition_id?: string | null
      }
    }
  } | null
  
  return data?.competition_id ?? data?.metadata?.record?.competition_id ?? null
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
      styleId: createdEntries[0].style_id,
      styleName: String(createdEntries[0].styleName || ''),
      entryTime: createdEntries[0].entry_time
    }
  }
  
  return undefined
}

