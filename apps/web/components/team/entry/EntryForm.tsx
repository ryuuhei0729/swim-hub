import { memo } from "react";
import { useTranslations } from "next-intl";
import type { EntryFormProps } from "@/types/team-entry";

function EntryFormComponent({
  formData,
  errors,
  styles,
  submitting,
  onUpdateForm,
  onSubmit,
  onCancelEdit,
}: EntryFormProps) {
  const t = useTranslations("teams");
  const isEditing = !!formData.editingEntryId;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-orange-900 mb-3">
        {isEditing ? t("entryForm.editButton") : t("entryForm.addButton")}
      </h4>
      <div className="space-y-3">
        {/* 種目選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("entryForm.styleLabel")} <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.styleId}
            onChange={(e) => onUpdateForm({ styleId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">{t("entryForm.styleSelectPlaceholder")}</option>
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
            {t("entryForm.entryTimeLabel")}
          </label>
          <input
            type="text"
            value={formData.entryTime}
            onChange={(e) => onUpdateForm({ entryTime: e.target.value })}
            placeholder={t("entryForm.entryTimePlaceholder")}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
              errors.entryTime ? "border-red-500" : "border-gray-300"
            }`}
          />
          {errors.entryTime && <p className="mt-1 text-xs text-red-600">{errors.entryTime}</p>}
          {!errors.entryTime && (
            <p className="mt-1 text-xs text-gray-500">
              {t("entryForm.timeFormatHint")}
            </p>
          )}
        </div>

        {/* メモ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("entryForm.memoLabel")}</label>
          <textarea
            value={formData.note}
            onChange={(e) => onUpdateForm({ note: e.target.value })}
            placeholder={t("entryForm.memoPlaceholder")}
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
            {submitting
              ? t("entryForm.processing")
              : isEditing
                ? t("entryForm.updateButton")
                : t("entryForm.registerButton")}
          </button>
          {isEditing && (
            <button
              onClick={onCancelEdit}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {t("entryForm.cancelButton")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const EntryForm = memo(EntryFormComponent);
