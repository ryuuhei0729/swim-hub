/**
 * web↔mobile パリティ監査スプリント (D1〜D8) 新規 i18n キー網羅テスト
 *
 * Sprint Contract で「新規に必要」と合意した i18n キーの存在を固定する。
 * キー集合の ja/en/zh/ko/de 完全一致・日本語リーク・ICUプレースホルダー対称性は
 * apps/shared/__tests__/messages-coverage.test.ts が全キーを対象に動的網羅しているため、
 * ここでは重複させず「このスプリントで追加すべき正確なキー名」のみを固定する
 * (messages-teams-admin.test.ts と同じ方針)。
 *
 * Sprint Contract 検証観点:
 *   [V-D8-01] D2 (パスワード変更UI): settings 名前空間にセクション見出し/開くボタンの
 *             キーが存在する (モーダル本体は既存 mypage.passwordChange.* を流用するため
 *             新規キーは最小限)
 *   [V-D8-02] D3 (チーム練習/大会の編集・削除ボタン): teams.practices.card /
 *             teams.competitions.card に editButton/deleteButton が存在する
 *   [V-D8-03] D4 (一般メンバーの自己ログ/自己記録導線): teams.practices /
 *             teams.competitions に自己ログ/自己記録ボタンラベルが存在する
 *   [V-D8-04] D6 (チーム一括登録 手動入力モード): teamsAdmin.bulkRegister にモード切替
 *             タブ + 手動入力フォームの各ラベル/エラーメッセージが存在する
 *   [V-D8-05] ja.json に存在する本スプリントの新規キーは en.json にも存在する
 *             (翻訳漏れの早期検出。zh/ko/de の網羅は messages-coverage.test.ts に委譲)
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、本テストは意図的に
 * 赤くなる (Developer 実装のガイドとして機能する)。D5 (常設アクションバー) と D7
 * (設定画面への練習ログテンプレートリンク) は既存キー (teams.empty.createButton /
 * teams.empty.joinButton / practiceLogTemplates.page.title) を再利用する方針のため、
 * 新規キーはこのテストの対象外 (Verification Checklist 側で確認する)。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";

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

// -----------------------------------------------------------------------
// [V-D8-01]〜[V-D8-04] 新規キー一覧 (Sprint Contract で合意した正確なキー名)
// -----------------------------------------------------------------------
const SPRINT_REQUIRED_KEYS = [
  // D2: パスワード変更セクション (モーダル本体は mypage.passwordChange.* を流用)
  "settings.password.title",
  "settings.password.openButton",

  // D3: チーム練習カードの編集・削除ボタン (admin向け)
  "teams.practices.card.editButton",
  "teams.practices.card.deleteButton",
  // D3: チーム大会カードの編集・削除ボタン (admin向け)
  "teams.competitions.card.editButton",
  "teams.competitions.card.deleteButton",

  // D4: 一般メンバーの自己ログ/自己記録追加ボタン
  "teams.practices.selfLogButton",
  "teams.competitions.selfRecordButton",

  // D6: 一括登録 手動入力モード
  "teamsAdmin.bulkRegister.modeTabFile",
  "teamsAdmin.bulkRegister.modeTabManual",
  "teamsAdmin.bulkRegister.manual.addPracticeRowButton",
  "teamsAdmin.bulkRegister.manual.addCompetitionRowButton",
  "teamsAdmin.bulkRegister.manual.deleteRowButton",
  "teamsAdmin.bulkRegister.manual.labelDate",
  "teamsAdmin.bulkRegister.manual.labelTitle",
  "teamsAdmin.bulkRegister.manual.labelPlace",
  "teamsAdmin.bulkRegister.manual.labelNote",
  "teamsAdmin.bulkRegister.manual.labelStartDate",
  "teamsAdmin.bulkRegister.manual.labelEndDate",
  "teamsAdmin.bulkRegister.manual.labelCompetitionName",
  "teamsAdmin.bulkRegister.manual.labelPoolType",
  "teamsAdmin.bulkRegister.manual.errorDateRequired",
  "teamsAdmin.bulkRegister.manual.errorStartDateRequired",
  "teamsAdmin.bulkRegister.manual.errorEndDateAfterStart",
  "teamsAdmin.bulkRegister.manual.submitButton",
  "teamsAdmin.bulkRegister.manual.submitting",
] as const;

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

describe("[V-D8] web↔mobile パリティスプリント 新規 i18n キー", () => {
  for (const key of SPRINT_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (D2/D3/D4/D6 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (D2/D3/D4/D6 未実装)`).toContain(key);
    });

    it(`"${key}" の値が ja/en とも空文字でない`, () => {
      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);
      // 未実装時点では undefined になり falsy なので、この assertion 自体も赤になる想定
      expect(jaVal, `ja.json の "${key}" が空/未定義`).toBeTruthy();
      expect(enVal, `en.json の "${key}" が空/未定義`).toBeTruthy();
    });
  }
});

// -----------------------------------------------------------------------
// [V-D8-Regression] D5/D7 が既存キーを再利用する前提のリグレッション防止
// (新規キーではなく、Sprint Contract が「流用する」と定めた既存キーが
//  今回の変更で誤って削除されていないことを保証する)
// -----------------------------------------------------------------------
describe("[V-D8-Regression] D5/D7 が再利用する既存キーの温存確認", () => {
  const REUSED_KEYS = [
    // D5: 常設アクションバーは空状態の既存ラベルをそのまま使う想定
    "teams.empty.createButton",
    "teams.empty.joinButton",
    // D7: 設定画面への練習ログテンプレートリンクは既存ページタイトルを流用する想定
    "practiceLogTemplates.page.title",
    // D2: モーダル本体は既存 mypage.passwordChange.* を流用する想定
    "mypage.passwordChange.title",
    "mypage.passwordChange.newPasswordLabel",
    "mypage.passwordChange.confirmPasswordLabel",
    "mypage.passwordChange.passwordMismatch",
    "mypage.passwordChange.passwordMinLength",
    "mypage.passwordChange.submitButton",
  ] as const;

  for (const key of REUSED_KEYS) {
    it(`ja.json に既存キー "${key}" が維持されている`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys).toContain(key);
    });
  }
});
