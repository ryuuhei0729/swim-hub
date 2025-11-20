import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS } from '../config/constants'
import { BasePage } from './BasePage'

/**
 * 記録ページのPage Object
 */
export class RecordPage extends BasePage {
  readonly competitionFormModal: Locator
  readonly entryFormModal: Locator
  readonly recordFormModal: Locator
  readonly recordDetailModal: Locator

  constructor(page: Page) {
    super(page)
    
    this.competitionFormModal = this.page.getByTestId('competition-form-modal')
    this.entryFormModal = this.page.getByTestId('entry-form-modal')
    this.recordFormModal = this.page.getByTestId('record-form-modal')
    this.recordDetailModal = this.page.getByTestId('record-detail-modal')
  }

  /**
   * 大会追加モーダルを開く
   */
  async openAddCompetitionModal(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.hover()
    await dayCell.locator('[data-testid="day-add-button"]').click()
    
    const addMenuModal = this.page.getByTestId('add-menu-modal')
    await addMenuModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
    
    const addButton = addMenuModal.getByTestId('add-record-button')
    await addButton.focus()
    await this.page.keyboard.press('Enter')
    await this.competitionFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 大会フォームに入力
   */
  async fillCompetitionForm(data: {
    date: string
    title: string
    place: string
    poolType: string
    note?: string
  }): Promise<void> {
    await this.page.getByTestId('competition-date').fill(data.date)
    await this.page.getByTestId('competition-title').fill(data.title)
    await this.page.getByTestId('competition-place').fill(data.place)
    await this.page.getByTestId('competition-pool-type').selectOption(data.poolType)
    if (data.note) {
      await this.page.getByTestId('competition-note').fill(data.note)
    }
  }

  /**
   * 次へ（記録登録）ボタンをクリック
   */
  async clickNextToEntry(): Promise<void> {
    await this.page.getByRole('button', { name: '次へ（記録登録）' }).click()
    await this.entryFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * エントリーフォームに入力
   */
  async fillEntryForm(entryIndex: number, data: {
    styleIndex: number
    time: string
    note?: string
  }): Promise<void> {
    await this.page.getByTestId(`entry-style-${entryIndex}`).selectOption({ index: data.styleIndex })
    await this.page.getByTestId(`entry-time-${entryIndex}`).fill(data.time)
    if (data.note) {
      await this.page.getByTestId(`entry-note-${entryIndex}`).fill(data.note)
    }
  }

  /**
   * エントリーを追加
   */
  async addEntry(): Promise<void> {
    await this.page.getByTestId('entry-add-button').click()
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * エントリーを送信
   */
  async submitEntry(): Promise<void> {
    await this.page.getByTestId('entry-submit-button').click()
    await this.entryFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 記録フォームに入力
   */
  async fillRecordForm(recordIndex: number, data: {
    time: string
    note?: string
    isRelay?: boolean
  }): Promise<void> {
    await this.recordFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.getByTestId(`record-time-${recordIndex}`).fill(data.time)
    if (data.note) {
      await this.page.getByTestId(`record-note-${recordIndex}`).fill(data.note)
    }
    if (data.isRelay) {
      await this.page.getByTestId(`record-relay-${recordIndex}`).check()
    }
  }

  /**
   * スプリットタイムを追加
   */
  async addSplitTime(recordIndex: number, splitIndex: number, data: {
    distance: string
    time: string
  }): Promise<void> {
    const recordSection = this.page.getByTestId(`record-entry-section-${recordIndex}`)
    await recordSection.getByRole('button', { name: '追加' }).click()
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
    await recordSection.getByTestId(`record-split-distance-${recordIndex}-${splitIndex}`).fill(data.distance)
    await recordSection.getByTestId(`record-split-time-${recordIndex}-${splitIndex}`).fill(data.time)
  }

  /**
   * 記録を保存
   */
  async saveRecord(): Promise<void> {
    await this.page.getByTestId('save-record-button').click()
    await this.recordFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 記録詳細モーダルを開く
   */
  async openRecordDetail(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.click()
    const detailModal = this.recordDetailModal.first()
    await detailModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 大会情報を編集
   */
  async editCompetition(): Promise<void> {
    const detailModal = this.recordDetailModal.first()
    await detailModal.getByTestId('edit-competition-button').click()
    await this.competitionFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 大会情報を更新
   */
  async updateCompetition(): Promise<void> {
    await this.page.getByRole('button', { name: '更新' }).click()
    await this.competitionFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 記録を編集
   */
  async editRecord(recordIndex: number = 1): Promise<void> {
    const detailModal = this.recordDetailModal.first()
    await detailModal.getByTestId('edit-record-button').nth(recordIndex - 1).click()
    await this.recordFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 記録を更新
   */
  async updateRecord(): Promise<void> {
    await this.page.getByTestId('update-record-button').click()
    await this.recordFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * モーダルを閉じる（ESCキー）
   */
  async closeModal(): Promise<void> {
    await this.page.keyboard.press('Escape')
  }
}

