import { memo } from 'react'
import type { EntryFormProps } from '@/types/team-entry'

function EntryFormComponent({
  formData,
  errors,
  styles,
  submitting,
  onUpdateForm,
  onSubmit,
  onCancelEdit
}: EntryFormProps) {
  const isEditing = !!formData.editingEntryId

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-orange-900 mb-3">
        {isEditing ? '✏️ 編集' : '➕ 追加'}
      </h4>
      <div className="space-y-3">
        {/* 種目選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            種目 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.styleId}
            onChange={(e) => onUpdateForm({ styleId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">選択してください</option>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name_jp}
              </option>
            ))}
          </select>
        </div>

        {/* エントリータイム */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            エントリータイム（任意）
          </label>
          <input
            type="text"
            value={formData.entryTime}
            onChange={(e) => onUpdateForm({ entryTime: e.target.value })}
            placeholder="例: 1:23.45"
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
              errors.entryTime ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.entryTime && (
            <p className="mt-1 text-xs text-red-600">{errors.entryTime}</p>
          )}
          {!errors.entryTime && (
            <p className="mt-1 text-xs text-gray-500">
              形式: 分:秒.ミリ秒（例: 1:23.45） または 秒.ミリ秒（例: 65.23）
            </p>
          )}
        </div>

        {/* メモ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            メモ（任意）
          </label>
          <textarea
            value={formData.note}
            onChange={(e) => onUpdateForm({ note: e.target.value })}
            placeholder="補足情報があれば入力してください"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        {/* 送信ボタン */}
        <div className="flex space-x-2">
          <button
            onClick={onSubmit}
            disabled={submitting || !formData.styleId}
            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-all shadow-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '送信中...' : isEditing ? '更新する' : 'エントリーする'}
          </button>
          {isEditing && (
            <button
              onClick={onCancelEdit}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const EntryForm = memo(EntryFormComponent)
