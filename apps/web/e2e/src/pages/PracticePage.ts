import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS } from '../config/constants'
import { BasePage } from './BasePage'

/**
 * 練習ページのPage Object
 */
export class PracticePage extends BasePage {
  readonly addMenuModal: Locator
  readonly practiceFormModal: Locator
  readonly practiceLogFormModal: Locator
  readonly practiceDetailModal: Locator

  constructor(page: Page) {
    super(page)
    
    this.addMenuModal = page.getByTestId('add-menu-modal')
    this.practiceFormModal = page.getByTestId('practice-form-modal')
    this.practiceLogFormModal = page.getByTestId('practice-log-form-modal')
    this.practiceDetailModal = page.getByTestId('practice-detail-modal')
  }

  /**
   * 追加メニューモーダルを開く
   */
  async openAddMenuModal(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.hover()
    await dayCell.locator('[data-testid="day-add-button"]').click()
    await this.addMenuModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 練習追加ボタンをクリック
   */
  async clickAddPracticeButton(): Promise<void> {
    const addButton = this.addMenuModal.getByTestId('add-practice-button')
    await addButton.focus()
    await this.page.keyboard.press('Enter')
    await this.practiceFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 練習フォームに入力
   */
  async fillPracticeForm(data: {
    date: string
    place: string
    note?: string
  }): Promise<void> {
    await this.page.getByTestId('practice-date').fill(data.date)
    await this.page.getByTestId('practice-place').fill(data.place)
    if (data.note) {
      await this.page.getByTestId('practice-note').fill(data.note)
    }
  }

  /**
   * 練習を保存
   */
  async savePractice(): Promise<void> {
    await this.page.getByTestId('save-practice-button').click()
    await this.practiceFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 練習ログフォームに入力
   */
  async fillPracticeLogForm(data: {
    distance: string
    repCount: string
    setCount: string
    note?: string
  }): Promise<void> {
    await this.practiceLogFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.getByTestId('practice-distance').fill(data.distance)
    await this.page.getByTestId('practice-rep-count').fill(data.repCount)
    await this.page.getByTestId('practice-set-count').fill(data.setCount)
    if (data.note) {
      await this.page.getByTestId('practice-log-note-1').fill(data.note)
    }
  }

  /**
   * 練習ログを保存
   */
  async savePracticeLog(): Promise<void> {
    await this.page.getByTestId('save-practice-log-button').click()
    await this.practiceLogFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 練習詳細モーダルを開く
   */
  async openPracticeDetail(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.locator('[data-testid="practice-mark"]').first().click()
    await this.practiceDetailModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * モーダルを閉じる（ESCキー）
   */
  async closeModal(): Promise<void> {
    await this.page.keyboard.press('Escape')
  }
}

