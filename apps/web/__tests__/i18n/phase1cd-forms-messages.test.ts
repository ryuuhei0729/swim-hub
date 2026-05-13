/**
 * Phase 1-C-D: shared forms i18n 翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-CD-01-DYNAMIC] forms namespace 全キー対称性 (ja/en 完全一致)
 *   [V-CD-02]         forms 必須キー存在チェック (Sprint Contract 明示キー)
 *   [V-CD-03-DYNAMIC] forms ICU プレースホルダー対称性
 *   [V-CD-04]         en.json の forms namespace 内に日本語が含まれない
 *   [V-CD-05]         Phase 1-C-1 / 1-C-2-A / 1-C-2-B / 1-C-2-C-1 / 1-C-2-C-2 リグレッション防止
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に forms namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-D 追加分):
 *   - forms.unsavedChanges  (9 フォーム共通の未保存変更確認ダイアログ)
 *   - forms.practice        (PracticeBasicForm, PracticeLogForm)
 *   - forms.competition     (CompetitionBasicForm)
 *   - forms.practiceLog     (PracticeLogForm, practice-log/PracticeLogForm)
 *   - forms.practiceMenu    (practice-log/components/PracticeMenuItem)
 *   - forms.timeInput       (TimeInputModal, shared/TimeInput)
 *   - forms.record          (record/RecordForm, record/components/RecordBasicInfo, RecordSetItem)
 *   - forms.entry           (EntryLogForm)
 *   - forms.recordLog       (record-log/RecordLogForm, record-log/components/RecordLogEntry)
 *   - forms.tag             (TagManagementModal, TagInput)
 *   - forms.teamCreate      (TeamCreateForm)
 *   - forms.teamJoin        (TeamJoinForm)
 *   - forms.lapTime         (LapTimeDisplay)
 *   - forms.imageUploader   (shared/ImageUploader/ImageUploader)
 *
 * 対象ファイル (17 個):
 *   1. components/forms/TagManagementModal.tsx
 *   2. components/forms/TagInput.tsx
 *   3. components/forms/LapTimeDisplay.tsx
 *   4. components/forms/TimeInputModal.tsx
 *   5. components/forms/record/components/RecordBasicInfo.tsx
 *   6. components/forms/record/components/RecordSetItem.tsx
 *   7. components/forms/record/RecordForm.tsx
 *   8. components/forms/practice-log/components/PracticeMenuItem.tsx
 *   9. components/forms/practice-log/PracticeLogForm.tsx
 *   10. components/forms/record-log/components/RecordLogEntry.tsx
 *   11. components/forms/record-log/RecordLogForm.tsx
 *   12. components/forms/PracticeBasicForm.tsx
 *   13. components/forms/CompetitionBasicForm.tsx
 *   14. components/forms/EntryLogForm.tsx
 *   15. components/forms/TeamCreateForm.tsx
 *   16. components/forms/TeamJoinForm.tsx
 *   17. components/forms/shared/ImageUploader/ImageUploader.tsx
 *
 * Critical リスク (Developer 実装時の注意点):
 *   - date-fns locale 固定 (locale: ja) が PracticeBasicForm / EntryLogForm / record-log/RecordLogForm の3ファイルにある
 *     → useLocale() + enUS 切替で対応
 *   - PRACTICE_STEPS / COMPETITION_STEPS のモジュールスコープ定数
 *     → 関数内 useMemo 移動が必要 (useTranslations フック制約)
 *   - ImageUploader の props default 値日本語
 *     → 内部翻訳化 (caller 変更回避)
 *   - forms.unsavedChanges.* キーを 9 個のフォームで共通利用
 */

import { describe, it, expect, test } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";

// ---------------------------------------------------------------------------
// ヘルパー: ネストしたキーをフラットなパスで列挙
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// ヘルパー: 値の中に日本語文字が含まれるかチェック
// ---------------------------------------------------------------------------

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    return /[぀-ヿ一-鿿＀-￯]/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(containsJapanese);
  }
  return false;
}

// ---------------------------------------------------------------------------
// ヘルパー: ICU Message Format の {variable} プレースホルダーを抽出
// ---------------------------------------------------------------------------

function extractPlaceholders(value: unknown): Set<string> {
  const result = new Set<string>();
  if (typeof value === "string") {
    const matches = value.match(/\{([a-zA-Z0-9_]+)/g);
    if (matches) {
      for (const m of matches) result.add(m.replace("{", ""));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ヘルパー: ネストされたキーパスで値を取得
// ---------------------------------------------------------------------------

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// ---------------------------------------------------------------------------
// [V-CD-01-DYNAMIC] forms namespace 全キー対称性
//
// ja.json に追加された forms namespace のすべてのキーが en.json にも存在し、
// かつ en.json の forms キーが ja.json と完全一致していることを検証する。
// Developer が新規キーを追加しても自動で検出できる。
// ---------------------------------------------------------------------------

describe("[V-CD-01-DYNAMIC] forms namespace 全キー対称性", () => {
  const jaFormsNs = (jaMessages as unknown as Record<string, unknown>)["forms"] as
    | Record<string, unknown>
    | undefined;
  const enFormsNs = (enMessages as unknown as Record<string, unknown>)["forms"] as
    | Record<string, unknown>
    | undefined;

  it("ja.json に forms namespace が存在する", () => {
    expect(
      jaFormsNs,
      "ja.json に forms namespace が存在しません (Phase 1-C-D 未実装)",
    ).toBeDefined();
  });

  it("en.json に forms namespace が存在する", () => {
    expect(
      enFormsNs,
      "en.json に forms namespace が存在しません (Phase 1-C-D 未実装)",
    ).toBeDefined();
  });

  it("ja.json と en.json の forms キー集合が完全一致する", () => {
    if (!jaFormsNs || !enFormsNs) return; // 上のテストが検出済み
    const jaKeys = flattenKeys(jaFormsNs, "forms").sort();
    const enKeys = flattenKeys(enFormsNs, "forms").sort();
    expect(
      enKeys,
      `ja/en で forms キー集合が一致しません。\n` +
        `ja only: ${jaKeys.filter((k) => !enKeys.includes(k)).join(", ")}\n` +
        `en only: ${enKeys.filter((k) => !jaKeys.includes(k)).join(", ")}`,
    ).toEqual(jaKeys);
  });

  const jaFormsKeysForEach = jaFormsNs ? flattenKeys(jaFormsNs, "forms") : [];

  // forms namespace が未実装の場合はスキッププレースホルダーを入れる
  if (jaFormsKeysForEach.length === 0) {
    it("forms namespace が未実装のためスキップ (Phase 1-C-D 実装後に自動有効化)", () => {
      // Developer が forms namespace を追加すると、このテストは不要になり
      // 以下の test.each が代わりに実行される
    });
  }

  test.each(jaFormsKeysForEach)("%s が ja/en 両方に存在し空文字でない", (key) => {
    const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
    const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);
    expect(jaVal, `ja.json の "${key}" が空または未定義です`).toBeTruthy();
    expect(enVal, `en.json の "${key}" が空または未定義です`).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// [V-CD-02] forms 必須キー存在チェック
//
// Sprint Contract で明示された必須キー一覧。
// Developer の実装漏れを早期検出するためハードコードで管理する。
// ---------------------------------------------------------------------------

describe("[V-CD-02] forms 必須キー存在チェック", () => {
  const REQUIRED_FORMS_KEYS = [
    // --------------------------------------------------------
    // forms.unsavedChanges (9 フォーム共通: ConfirmDialog テキスト)
    // --------------------------------------------------------
    "forms.unsavedChanges.title",
    "forms.unsavedChanges.messageBack",
    "forms.unsavedChanges.messageClose",
    "forms.unsavedChanges.confirmBack",
    "forms.unsavedChanges.confirmClose",
    "forms.unsavedChanges.cancel",

    // --------------------------------------------------------
    // forms.practice (PracticeBasicForm)
    // --------------------------------------------------------
    "forms.practice.title_create",
    "forms.practice.title_edit",
    "forms.practice.steps",
    "forms.practice.date_label",
    "forms.practice.title_field",
    "forms.practice.place_label",
    "forms.practice.note_label",
    "forms.practice.save",
    "forms.practice.saving",
    "forms.practice.update",
    "forms.practice.updating",
    "forms.practice.save_close",
    "forms.practice.save_next",

    // --------------------------------------------------------
    // forms.competition (CompetitionBasicForm)
    // --------------------------------------------------------
    "forms.competition.title_create",
    "forms.competition.title_edit",
    "forms.competition.steps",
    "forms.competition.start_date_label",
    "forms.competition.end_date_label",
    "forms.competition.end_date_error",
    "forms.competition.name_label",
    "forms.competition.place_label",
    "forms.competition.note_label",
    "forms.competition.save",
    "forms.competition.saving",
    "forms.competition.update",
    "forms.competition.updating",
    "forms.competition.save_close",
    "forms.competition.next_entry",
    "forms.competition.next_record",

    // --------------------------------------------------------
    // forms.practiceLog (practice-log/PracticeLogForm)
    // --------------------------------------------------------
    "forms.practiceLog.title_create",
    "forms.practiceLog.title_edit",
    "forms.practiceLog.close_aria",
    "forms.practiceLog.addMenu",
    "forms.practiceLog.saveAsTemplate",
    "forms.practiceLog.cancel",
    "forms.practiceLog.save",
    "forms.practiceLog.saving",
    "forms.practiceLog.update",
    "forms.practiceLog.updating",
    "forms.practiceLog.videoLabel",

    // --------------------------------------------------------
    // forms.practiceMenu (practice-log/components/PracticeMenuItem)
    // --------------------------------------------------------
    "forms.practiceMenu.header",
    "forms.practiceMenu.removeAria",
    "forms.practiceMenu.style1Label",
    "forms.practiceMenu.style2Label",
    "forms.practiceMenu.distanceLabel",
    "forms.practiceMenu.repsLabel",
    "forms.practiceMenu.setsLabel",
    "forms.practiceMenu.timeLabel",
    "forms.practiceMenu.noteLabel",
    "forms.practiceMenu.notePlaceholder",
    "forms.practiceMenu.timesHeader",
    "forms.practiceMenu.avgRow",

    // --------------------------------------------------------
    // forms.timeInput (TimeInputModal)
    // --------------------------------------------------------
    "forms.timeInput.title",
    "forms.timeInput.titleGeneric",
    "forms.timeInput.subtitle",
    "forms.timeInput.setHeader",
    "forms.timeInput.repLabel",
    "forms.timeInput.average",
    "forms.timeInput.notEntered",
    "forms.timeInput.overallAvg",
    "forms.timeInput.save",
    "forms.timeInput.cancel",

    // --------------------------------------------------------
    // forms.record (record/RecordForm + RecordBasicInfo + RecordSetItem)
    // --------------------------------------------------------
    "forms.record.title_create",
    "forms.record.title_edit",
    "forms.record.closeAria",
    "forms.record.recordsHeader",
    "forms.record.addEvent",
    "forms.record.cancel",
    "forms.record.save",
    "forms.record.saving",
    "forms.record.update",
    "forms.record.eventHeader",
    "forms.record.removeEventAria",

    // --------------------------------------------------------
    // forms.entry (EntryLogForm)
    // --------------------------------------------------------
    "forms.entry.title",
    "forms.entry.subtitle",
    "forms.entry.eventsHeader",
    "forms.entry.addEvent",
    "forms.entry.eventHeader",
    "forms.entry.skip",
    "forms.entry.submit",
    "forms.entry.submitting",
    "forms.entry.cancel",

    // --------------------------------------------------------
    // forms.recordLog (record-log/RecordLogForm + RecordLogEntry)
    // --------------------------------------------------------
    "forms.recordLog.eventHeader",
    "forms.recordLog.entryTimeLabel",
    "forms.recordLog.cancel",
    "forms.recordLog.save",
    "forms.recordLog.saving",
    "forms.recordLog.update",

    // --------------------------------------------------------
    // forms.tag (TagManagementModal + TagInput)
    // --------------------------------------------------------
    "forms.tag.placeholder",
    "forms.tag.searchPlaceholder",
    "forms.tag.noTags",
    "forms.tag.noMatch",
    "forms.tag.createHint",
    "forms.tag.addHint",
    "forms.tag.cancel",
    "forms.tag.duplicateError",
    "forms.tag.updateError",

    // --------------------------------------------------------
    // forms.teamCreate (TeamCreateForm)
    // --------------------------------------------------------
    "forms.teamCreate.title",
    "forms.teamCreate.nameRequired",
    "forms.teamCreate.nameTooLong",
    "forms.teamCreate.submit",
    "forms.teamCreate.submitting",
    "forms.teamCreate.cancel",

    // --------------------------------------------------------
    // forms.teamJoin (TeamJoinForm)
    // --------------------------------------------------------
    "forms.teamJoin.codeLabel",
    "forms.teamJoin.codePlaceholder",
    "forms.teamJoin.codeHint",
    "forms.teamJoin.errorTitle",
    "forms.teamJoin.joining",
    "forms.teamJoin.submit",

    // --------------------------------------------------------
    // forms.lapTime (LapTimeDisplay)
    // --------------------------------------------------------
    "forms.lapTime.raceLapTab",
    "forms.lapTime.allLapTab",
    "forms.lapTime.noSplits",
    "forms.lapTime.noStyle",
    "forms.lapTime.noLap",
    "forms.lapTime.distanceHeader",
    "forms.lapTime.splitTimeHeader",

    // --------------------------------------------------------
    // forms.imageUploader (shared/ImageUploader/ImageUploader)
    // --------------------------------------------------------
    "forms.imageUploader.label",
    "forms.imageUploader.formatDescription",
    "forms.imageUploader.countDisplay",
    "forms.imageUploader.new",
    "forms.imageUploader.removeImageAria",
    "forms.imageUploader.uploadAria",
    "forms.imageUploader.clickToSelect",
    "forms.imageUploader.orDragDrop",
    "forms.imageUploader.maxReached",

    // --------------------------------------------------------
    // Phase 1-C-D Loop 1 追加キー
    // --------------------------------------------------------
    // C-2: placeholder 系
    "forms.practice.title_placeholder",
    "forms.competition.name_placeholder",
    "forms.record.time_placeholder",
    "forms.record.distance_placeholder",
    "forms.recordLog.time_placeholder",
    "forms.recordLog.reactionTime_placeholder",
    "forms.recordLog.distance_placeholder",
    // C-3: RecordForm validation
    "forms.record.validation.dateRequired",
    "forms.record.validation.dateInvalid",
    // C-4: imageUploader エラー
    "forms.imageUploader.remainingSlotsError",
    "forms.imageUploader.invalidFile",
    // C-5: tag 認証・CRUD エラー
    "forms.tag.authRequired",
    "forms.tag.createFailed",
    "forms.tag.deleteFailed",
  ] as const;

  test.each(REQUIRED_FORMS_KEYS)("%s が ja/en 両方に存在する", (key) => {
    const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
    const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);
    expect(
      jaVal,
      `ja.json に "${key}" が存在しません (Phase 1-C-D 未実装)`,
    ).toBeDefined();
    expect(
      enVal,
      `en.json に "${key}" が存在しません (Phase 1-C-D 未実装)`,
    ).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// [V-CD-03-DYNAMIC] forms ICU プレースホルダー対称性
//
// forms namespace 内の全文字列キーを動的に走査し、
// ICU プレースホルダー ({date}, {count}, {n}, {name}, {max}, {current} 等) が
// ja/en で対称かを検証する。
// ---------------------------------------------------------------------------

describe("[V-CD-03-DYNAMIC] forms ICU プレースホルダー対称性", () => {
  const jaFormsNs = (jaMessages as unknown as Record<string, unknown>)["forms"] as
    | Record<string, unknown>
    | undefined;

  const jaFormsKeys = jaFormsNs ? flattenKeys(jaFormsNs, "forms") : [];

  // forms namespace が未実装の場合はスキッププレースホルダーを入れる
  // (test.each に空配列を渡すと "No test found in suite" エラーになるため)
  if (jaFormsKeys.length === 0) {
    it("forms namespace が未実装のためスキップ (Phase 1-C-D 実装後に自動有効化)", () => {
      // Developer が forms namespace を追加すると、このテストは不要になり
      // 以下の test.each が代わりに実行される
    });
  }

  test.each(jaFormsKeys)("%s の ICU プレースホルダーが ja/en で対称", (key) => {
    const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
    const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

    // 片方が未定義の場合は [V-CD-01-DYNAMIC] が検出するためここではスキップ
    if (typeof jaVal !== "string" || typeof enVal !== "string") return;

    const jaPlaceholders = extractPlaceholders(jaVal);
    const enPlaceholders = extractPlaceholders(enVal);

    for (const placeholder of jaPlaceholders) {
      expect(
        enPlaceholders.has(placeholder),
        `"${key}": ja には {${placeholder}} があるが en にはない (ja: "${jaVal}", en: "${enVal}")`,
      ).toBe(true);
    }

    for (const placeholder of enPlaceholders) {
      expect(
        jaPlaceholders.has(placeholder),
        `"${key}": en には {${placeholder}} があるが ja にはない (ja: "${jaVal}", en: "${enVal}")`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// [V-CD-04] en.json の forms namespace に日本語が含まれないこと
//
// 翻訳漏れキー (en.json に日本語がそのまま入っている) を検出する。
// ---------------------------------------------------------------------------

describe("[V-CD-04] en.json の forms namespace に日本語が含まれないこと", () => {
  it('en.json の namespace "forms" に日本語が含まれない (翻訳漏れゼロ)', () => {
    const messages = enMessages as Record<string, unknown>;
    const nsValue = messages["forms"];
    if (!nsValue) {
      // namespace 未存在は [V-CD-02] の各キーテストが検出するためここではスキップ
      return;
    }
    expect(
      containsJapanese(nsValue),
      'en.json の "forms" に日本語が含まれています。翻訳漏れキーを確認してください。',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-CD-05] リグレッション防止 (Phase 1-C-1 〜 1-C-2-C-2 の既存キー)
//
// Phase 1-C-D 実装後も以前のフェーズのキーが維持されていることを確認。
// ---------------------------------------------------------------------------

describe("[V-CD-05] Phase 1-C-1 〜 1-C-2-C-2 必須キーのリグレッション防止", () => {
  const REGRESSION_KEYS = [
    // Phase 1-C-1: dashboard
    "dashboard.stats.monthlyPractice.title",
    "dashboard.calendar.title",
    "dashboard.deleteConfirm.title",
    // Phase 1-C-1: practice
    "practice.details.badge",
    "practice.styles.Fr",
    // Phase 1-C-1: mypage
    "mypage.title",
    // Phase 1-C-1: sidebar
    "sidebar.nav.dashboard",
    // Phase 1-C-2-A: competition
    "competition.header.title",
    // Phase 1-C-2-A: settings
    "settings.header.title",
    // Phase 1-C-2-B: goals
    "goals.page.title",
    // Phase 1-C-2-C-1: teams
    "teams.page.title",
    "teams.tabs.attendance",
    // Phase 1-C-2-C-2: teamsAdmin
    "teamsAdmin.page.title",
    "teamsAdmin.tabs.attendance",
    "teamsAdmin.practiceLog.saveButton",
  ] as const;

  for (const key of REGRESSION_KEYS) {
    it(`ja.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B/1-C-2-C-1/1-C-2-C-2 からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B/1-C-2-C-1/1-C-2-C-2 からのリグレッション)`,
      ).toContain(key);
    });
  }
});
