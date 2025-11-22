import type { Locator, Page } from '@playwright/test'
import { TIMEOUTS } from '../config/config'
import { BasePage } from './BasePage'

/**
 * 練習ページのPage Object
 */
export class PracticePage extends BasePage {
  readonly practiceFormModal: Locator
  readonly practiceLogFormModal: Locator
  readonly practiceDetailModal: Locator

  constructor(page: Page) {
    super(page)
    
    this.practiceFormModal = page.getByTestId('practice-form-modal')
    this.practiceLogFormModal = page.getByTestId('practice-log-form-modal')
    this.practiceDetailModal = page.getByTestId('practice-detail-modal')
  }

  /**
   * 追加メニューモーダルを開く（DayDetailModalを開く）
   */
  async openAddMenuModal(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.hover()
    await dayCell.locator('[data-testid="day-add-button"]').click()
    // DayDetailModalが開く（記録がない場合はday-detail-modal、記録がある場合はpractice-detail-modalまたはrecord-detail-modal）
    await this.page.getByTestId(/^(day-detail-modal|practice-detail-modal|record-detail-modal)$/).first().waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 練習追加ボタンをクリック
   */
  async clickAddPracticeButton(): Promise<void> {
    // DayDetailModal内のボタンをクリック
    const addButton = this.page.getByTestId('add-practice-button').first()
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
   * モーダルを閉じる（バツボタン）
   */
  async closeModal(): Promise<void> {
    const modal = this.practiceDetailModal
      .filter({ has: this.page.getByTestId('modal-close-button') })
      .first()
    await modal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await modal.getByTestId('modal-close-button').first().click()
    await modal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 練習情報を編集
   */
  async editPractice(): Promise<void> {
    const detailModal = this.practiceDetailModal.first()
    await detailModal.getByTestId('edit-practice-button').first().click()
    await this.practiceFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 練習情報を更新
   */
  async updatePractice(): Promise<void> {
    await this.page.getByTestId('update-practice-button').click()
    await this.practiceFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 練習を削除
   */
  async deletePractice(): Promise<void> {
    const detailModal = this.practiceDetailModal.first()
    await detailModal.getByTestId('delete-practice-button').first().click()
    
    // 削除確認ダイアログを待つ
    const confirmDialog = this.page.getByTestId('confirm-dialog')
    await confirmDialog.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
    
    // 削除確認ボタンをクリック
    await this.page.getByTestId('confirm-delete-button').click()
    
    // ダイアログが閉じられるまで待つ
    await confirmDialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 練習フォームの既存値を取得
   * @returns 既存の値（existingPlace, existingNote）
   */
  async getExistingPracticeFormValues(): Promise<{
    existingPlace: string
    existingNote: string
  }> {
    await this.practiceFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    const placeInput = this.page.getByTestId('practice-place')
    const noteInput = this.page.getByTestId('practice-note')
    
    return {
      existingPlace: await placeInput.inputValue(),
      existingNote: await noteInput.inputValue()
    }
  }

  /**
   * 練習ログフォームの既存値を取得
   * @returns 既存の値（existingDistance, existingRepCount, existingSetCount, existingNote）
   */
  async getExistingPracticeLogFormValues(): Promise<{
    existingDistance: string
    existingRepCount: string
    existingSetCount: string
    existingNote: string
  }> {
    await this.practiceLogFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    const distanceInput = this.page.getByTestId('practice-distance')
    const repCountInput = this.page.getByTestId('practice-rep-count')
    const setCountInput = this.page.getByTestId('practice-set-count')
    const practiceLogNoteInput = this.page.getByTestId('practice-log-note-1')
    
    return {
      existingDistance: await distanceInput.inputValue(),
      existingRepCount: await repCountInput.inputValue(),
      existingSetCount: await setCountInput.inputValue(),
      existingNote: await practiceLogNoteInput.inputValue()
    }
  }

  /**
   * 練習ログ編集ボタンをクリック
   */
  async editPracticeLog(): Promise<void> {
    const detailModal = this.practiceDetailModal.first()
    await detailModal.getByTestId('edit-practice-log-button').first().click()
    await this.practiceLogFormModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }

  /**
   * 練習ログ情報を更新
   */
  async updatePracticeLog(): Promise<void> {
    await this.page.getByTestId('update-practice-log-button').click()
    await this.practiceLogFormModal.waitFor({ state: 'hidden', timeout: TIMEOUTS.DEFAULT })
  }

  /**
   * 日付セルをクリックして詳細モーダルを開く
   */
  async clickDayCell(dateIso: string): Promise<void> {
    const dayCell = this.page.locator(`[data-testid="calendar-day"][data-date="${dateIso}"]`).first()
    await dayCell.click()
    await this.practiceDetailModal.waitFor({ state: 'visible', timeout: TIMEOUTS.SHORT })
    await this.page.waitForTimeout(TIMEOUTS.MODAL_ANIMATION)
  }
}

