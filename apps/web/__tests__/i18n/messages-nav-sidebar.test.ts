/**
 * Phase 1-C-1: authenticated 高優先度エリア 翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C1-01] Phase 1-C-1 で追加される全 namespace が ja.json / en.json の両方に存在する
 *   [V-C1-02] 各 namespace の必須キーが ja.json / en.json の両方に存在する
 *   [V-C1-03] en.json の authenticated namespace 内に日本語ハードコードがゼロ
 *   [V-C1-04] Phase 1-B 以前の必須キーがリグレッションしていない
 *   [V-C1-05] ICU Message Format の変数プレースホルダー ({count} 等) が ja/en で対称である
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に以下の namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-1 追加分):
 *   - dashboard   (DashboardStats, CalendarHeader, TeamAnnouncementsSection, DayDetailModal)
 *   - practice    (PracticeDetails, CompetitionDetails, DeleteConfirmModal, PracticeClient)
 *   - mypage      (MyPageClient)
 *   - onboarding  (OnboardingWizard, Step1Welcome, Step2Profile, Step3BestTime)
 *   - sidebar     (Sidebar)
 *   - footer      (Footer authenticated エリア)
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";

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
    const matches = value.match(/\{[a-zA-Z0-9_]+\}/g);
    if (matches) {
      for (const m of matches) result.add(m);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// [V-C1-01] Phase 1-C-1 追加 namespace の存在確認
// ---------------------------------------------------------------------------

describe("[V-C1-01] Phase 1-C-1 追加 namespace の存在確認", () => {
  // TODO (Web Developer): ja.json / en.json に以下 namespace を追加すること
  const PHASE_1C1_NAMESPACES = [
    "dashboard",
    "practice",
    "mypage",
    "onboarding",
    "sidebar",
    "footer",
  ] as const;

  for (const ns of PHASE_1C1_NAMESPACES) {
    it(`ja.json に namespace "${ns}" が存在する`, () => {
      const messages = jaMessages as Record<string, unknown>;
      expect(
        messages[ns],
        `ja.json に namespace "${ns}" が存在しません (Phase 1-C-1 未実装)`,
      ).toBeDefined();
      expect(typeof messages[ns]).toBe("object");
    });

    it(`en.json に namespace "${ns}" が存在する`, () => {
      const messages = enMessages as Record<string, unknown>;
      expect(
        messages[ns],
        `en.json に namespace "${ns}" が存在しません (Phase 1-C-1 未実装)`,
      ).toBeDefined();
      expect(typeof messages[ns]).toBe("object");
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02a] dashboard namespace の必須キー確認
//
// 対象コンポーネント:
//   DashboardStats.tsx       → stats の title / unit
//   CalendarHeader.tsx       → "カレンダー" / "今日" ボタン
//   TeamAnnouncementsSection → "のお知らせ" / "管理者" / "直近1ヶ月..." / "エントリー未提出"
//   DayDetailModal.tsx       → "の記録" / "大会記録を追加" / "練習予定を追加" 等
//   DeleteConfirmModal.tsx   → "記録を削除" / "本当に削除しますか？" / "削除" / "キャンセル"
// ---------------------------------------------------------------------------

describe("[V-C1-02a] dashboard namespace の必須キー確認", () => {
  const DASHBOARD_REQUIRED_KEYS = [
    // DashboardStats
    "dashboard.stats.monthlyPractice.title",
    "dashboard.stats.monthlyPractice.unit",
    "dashboard.stats.competitionRecord.title",
    "dashboard.stats.competitionRecord.unit",
    "dashboard.stats.practiceDays.title",
    "dashboard.stats.practiceDays.unit",
    // CalendarHeader
    "dashboard.calendar.title",
    "dashboard.calendar.today",
    // TeamAnnouncementsSection
    "dashboard.announcements.title",
    "dashboard.announcements.adminRole",
    "dashboard.announcements.unansweredAttendance",
    "dashboard.announcements.unsubmittedEntries",
    // DayDetailModal (空状態)
    "dashboard.dayDetail.addRecord",
    "dashboard.dayDetail.addPractice",
    "dashboard.dayDetail.addSection",
    "dashboard.dayDetail.close",
    // DeleteConfirmModal
    "dashboard.deleteConfirm.title",
    "dashboard.deleteConfirm.message",
    "dashboard.deleteConfirm.confirm",
    "dashboard.deleteConfirm.cancel",
  ] as const;

  for (const key of DASHBOARD_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      // 実装後: flattenKeys で確認
      // TODO (Web Developer): ja.json の dashboard namespace にこのキーを追加すること
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json に "${key}" が存在しません`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      // TODO (Web Developer): en.json の dashboard namespace にこのキーを追加すること
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json に "${key}" が存在しません`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02b] practice namespace の必須キー確認
//
// 対象コンポーネント:
//   PracticeDetails.tsx → "練習記録" badge / loading/error 状態 / "メニューを追加"
//                         タイムテーブルヘッダー / "セット平均" / "全体平均" / "全体最速"
//                         "練習内容" ラベル / "タイム" ラベル / "メモ" ラベル
//   CompetitionDetails  → 別コンポーネント (参照のみ)
//   PracticeClient.tsx  → ページヘッダー (Phase 1-C-1 スコープ内の部分)
// ---------------------------------------------------------------------------

describe("[V-C1-02b] practice namespace の必須キー確認", () => {
  const PRACTICE_REQUIRED_KEYS = [
    // PracticeDetails: ヘッダーバッジ
    "practice.details.badge",
    // PracticeDetails: 状態テキスト
    "practice.details.loading",
    "practice.details.error",
    // PracticeDetails: メニュー追加ボタン
    "practice.details.addMenu",
    // PracticeDetails: 練習内容ラベル
    "practice.details.contentLabel",
    // PracticeDetails: タイムセクション
    "practice.details.timeLabel",
    "practice.details.setAverage",
    "practice.details.overallAverage",
    "practice.details.overallFastest",
    // PracticeDetails: メモラベル
    "practice.details.memoLabel",
    // SWIM_STYLES 表示ラベル (定数配列から翻訳キーへ置換)
    "practice.styles.Fr",
    "practice.styles.Ba",
    "practice.styles.Br",
    "practice.styles.Fly",
    "practice.styles.IM",
  ] as const;

  for (const key of PRACTICE_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02c] mypage namespace の必須キー確認
//
// 対象コンポーネント:
//   MyPageClient.tsx → "マイページ" h1 / "プロフィール" h2 / "ベストタイム" h2 / 編集ボタン
// ---------------------------------------------------------------------------

describe("[V-C1-02c] mypage namespace の必須キー確認", () => {
  const MYPAGE_REQUIRED_KEYS = [
    "mypage.title",
    "mypage.subtitle",
    "mypage.profile.title",
    "mypage.profile.editButton",
    "mypage.bestTime.title",
  ] as const;

  for (const key of MYPAGE_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02d] onboarding namespace の必須キー確認
//
// 対象コンポーネント:
//   OnboardingWizard.tsx → ConfirmDialog の title / message / confirmLabel / cancelLabel
//   Step1Welcome.tsx     → "SwimHub へようこそ！" / 説明文 / 機能カード × 3 / "始める"
//   Step2Profile.tsx     → "名前" / "性別" / 男性/女性 / "生年月日" / "自己紹介" /
//                          バリデーションメッセージ / "保存中..." / "次へ" / "戻る"
//   Step3BestTime.tsx    → "ベストタイムを登録" / 種目セレクト placeholder /
//                          "引き継ぎあり" / "短水路" / "長水路" / "スキップして始める" /
//                          "保存して始める" / "登録中..." / "準備中..." / 重複エラーメッセージ
// ---------------------------------------------------------------------------

describe("[V-C1-02d] onboarding namespace の必須キー確認", () => {
  const ONBOARDING_REQUIRED_KEYS = [
    // OnboardingWizard: 離脱確認ダイアログ
    "onboarding.unsavedChanges.title",
    "onboarding.unsavedChanges.messageBack",
    "onboarding.unsavedChanges.messageLeave",
    "onboarding.unsavedChanges.confirmBack",
    "onboarding.unsavedChanges.confirmLeave",
    "onboarding.unsavedChanges.cancel",
    // Step1Welcome
    "onboarding.step1.title",
    "onboarding.step1.description",
    "onboarding.step1.feature.practice.title",
    "onboarding.step1.feature.practice.description",
    "onboarding.step1.feature.competition.title",
    "onboarding.step1.feature.competition.description",
    "onboarding.step1.feature.team.title",
    "onboarding.step1.feature.team.description",
    "onboarding.step1.startButton",
    // Step2Profile
    "onboarding.step2.nameLabel",
    "onboarding.step2.namePlaceholder",
    "onboarding.step2.genderLabel",
    "onboarding.step2.genderMale",
    "onboarding.step2.genderFemale",
    "onboarding.step2.birthdayLabel",
    "onboarding.step2.bioLabel",
    "onboarding.step2.bioPlaceholder",
    "onboarding.step2.validation.nameRequired",
    "onboarding.step2.validation.nameEmailFormat",
    "onboarding.step2.validation.nameTooLong",
    "onboarding.step2.saveError",
    "onboarding.step2.saving",
    "onboarding.step2.nextButton",
    "onboarding.step2.backButton",
    // Step3BestTime
    "onboarding.step3.title",
    "onboarding.step3.subtitle",
    "onboarding.step3.addStylePlaceholder",
    "onboarding.step3.poolTypeShort",
    "onboarding.step3.poolTypeLong",
    "onboarding.step3.relay",
    "onboarding.step3.duplicateError",
    "onboarding.step3.saveError",
    "onboarding.step3.skipButton",
    "onboarding.step3.saveButton",
    "onboarding.step3.saving",
    "onboarding.step3.completing",
    "onboarding.step3.backButton",
  ] as const;

  for (const key of ONBOARDING_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02e] sidebar namespace の必須キー確認
//
// 対象コンポーネント:
//   Sidebar.tsx → 各ナビゲーション名 / description / "チーム管理" / "管理者専用" /
//                 "設定" / "ログアウト" / "関連サービス"
// ---------------------------------------------------------------------------

describe("[V-C1-02e] sidebar namespace の必須キー確認", () => {
  const SIDEBAR_REQUIRED_KEYS = [
    // ナビゲーション名 (baseNavigation の name)
    "sidebar.nav.dashboard",
    "sidebar.nav.practice",
    "sidebar.nav.competition",
    "sidebar.nav.mypage",
    "sidebar.nav.team",
    // ナビゲーション description
    "sidebar.nav.dashboardDesc",
    "sidebar.nav.practiceDesc",
    "sidebar.nav.competitionDesc",
    "sidebar.nav.mypageDesc",
    "sidebar.nav.teamDesc",
    // チーム管理（管理者専用セクション）
    "sidebar.nav.teamAdmin",
    "sidebar.nav.teamAdminDesc",
    // スマホ用メニュー
    "sidebar.settings",
    "sidebar.logout",
    // 関連サービス
    "sidebar.relatedServices",
  ] as const;

  for (const key of SIDEBAR_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-02f] footer namespace の必須キー確認 (authenticated エリア)
//
// 対象コンポーネント:
//   Footer.tsx → "水泳選手のための記録管理サービス" / "サポート・情報" /
//               フッターリンク名 × 7 / "SwimHub サービス一覧" / "利用中" badge /
//               familyServices の description × 3
// ---------------------------------------------------------------------------

describe("[V-C1-02f] footer namespace の必須キー確認", () => {
  const FOOTER_REQUIRED_KEYS = [
    "footer.description",
    "footer.supportTitle",
    "footer.links.privacy",
    "footer.links.terms",
    "footer.links.support",
    "footer.links.contact",
    "footer.links.blog",
    "footer.links.about",
    "footer.links.tokushoho",
    "footer.services.title",
    "footer.services.currentBadge",
    "footer.services.swimhubDesc",
    "footer.services.timerDesc",
    "footer.services.scannerDesc",
  ] as const;

  for (const key of FOOTER_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-03] en.json の Phase 1-C-1 namespace 内に日本語が含まれないこと
// ---------------------------------------------------------------------------

describe("[V-C1-03] en.json の Phase 1-C-1 namespace に日本語が含まれないこと", () => {
  const PHASE_1C1_NAMESPACES = [
    "dashboard",
    "practice",
    "mypage",
    "onboarding",
    "sidebar",
    "footer",
  ] as const;

  for (const ns of PHASE_1C1_NAMESPACES) {
    it(`en.json の namespace "${ns}" に日本語が含まれない (翻訳漏れゼロ)`, () => {
      const messages = enMessages as Record<string, unknown>;
      const nsValue = messages[ns];
      if (!nsValue) {
        // namespace 未存在は [V-C1-01] が検出するためここではスキップ
        return;
      }
      expect(
        containsJapanese(nsValue),
        `en.json の "${ns}" に日本語が含まれています。翻訳漏れキーを確認してください。`,
      ).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-04] Phase 1-B 以前の必須キーがリグレッションしていないこと
// ---------------------------------------------------------------------------

describe("[V-C1-04] Phase 1-B 以前の必須キーのリグレッション防止", () => {
  const PHASE_1B_REQUIRED_KEYS = [
    "common.appName",
    "common.loading",
    "common.error",
    "common.save",
    "common.cancel",
    "nav.dashboard",
    "nav.practice",
    "nav.competition",
    "nav.mypage",
    "nav.settings",
    "nav.logout",
    "auth.signin.title",
    "auth.signin.submitButton",
    "auth.signup.title",
    "auth.signup.submitButton",
  ] as const;

  for (const key of PHASE_1B_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が維持されている (リグレッションなし)`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-B からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている (リグレッションなし)`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-B からのリグレッション)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-05] ICU Message Format プレースホルダーの ja/en 対称確認
//
// {count} などの変数プレースホルダーが ja と en で一致することを確認する。
// 実装者は ICU 変数を正確に ja/en 双方に含める必要がある。
//
// 検証対象キー (プレースホルダーを含む可能性が高いキー):
//   - dashboard.announcements.unansweredAttendance  → {count}件 のような形式
//   - dashboard.announcements.unsubmittedEntries    → {count}件 のような形式
//   - onboarding.step2.validation.nameTooLong       → {max}文字以内
// ---------------------------------------------------------------------------

describe("[V-C1-05] ICU Message Format プレースホルダーの ja/en 対称確認", () => {
  /**
   * 実装後に Web Developer がプレースホルダーを含むキーを使った場合、
   * ja と en で同じ変数名を使っていることをこのテストで保証する。
   */
  const ICU_KEYS_TO_CHECK = [
    "dashboard.announcements.unansweredAttendance",
    "dashboard.announcements.unsubmittedEntries",
    "onboarding.step2.validation.nameTooLong",
    "onboarding.step2.bioCharCount",
  ] as const;

  for (const key of ICU_KEYS_TO_CHECK) {
    it(`"${key}" の ICU プレースホルダーが ja/en で対称である`, () => {
      // キーのパスを分解してネストされた値を取得
      const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
        return path.split(".").reduce((current: unknown, segment: string) => {
          if (current !== null && typeof current === "object") {
            return (current as Record<string, unknown>)[segment];
          }
          return undefined;
        }, obj);
      };

      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

      // キー自体が未実装の場合はスキップ (キー存在チェックは [V-C1-02x] が担当)
      if (jaVal === undefined || enVal === undefined) {
        return;
      }

      const jaPlaceholders = extractPlaceholders(jaVal);
      const enPlaceholders = extractPlaceholders(enVal);

      // ja に含まれる変数が en にも存在すること
      for (const placeholder of jaPlaceholders) {
        expect(
          enPlaceholders.has(placeholder),
          `"${key}": ja には ${placeholder} があるが en にはない`,
        ).toBe(true);
      }

      // en に含まれる変数が ja にも存在すること
      for (const placeholder of enPlaceholders) {
        expect(
          jaPlaceholders.has(placeholder),
          `"${key}": en には ${placeholder} があるが ja にはない`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C1-06] ja/en 全体のキー集合一致確認 (Phase 1-C-1 実装完了後の回帰テスト)
//
// Phase 1-B の messages.test.ts [V-01] と同等だが、Phase 1-C-1 実装後の
// 最終状態を確認するために独立したテストとして維持する。
// ---------------------------------------------------------------------------

describe("[V-C1-06] Phase 1-C-1 実装後の ja/en キー集合完全一致", () => {
  it("ja.json のすべてのキーが en.json に存在する (en 欠損ゼロ)", () => {
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const enKeys = new Set(flattenKeys(enMessages as unknown as Record<string, unknown>));
    const missingInEn = jaKeys.filter((k) => !enKeys.has(k));
    expect(
      missingInEn,
      `en.json に以下のキーが欠損しています:\n${missingInEn.join("\n")}`,
    ).toHaveLength(0);
  });

  it("en.json のすべてのキーが ja.json に存在する (ja 欠損ゼロ = 余剰キー検出)", () => {
    const enKeys = flattenKeys(enMessages as unknown as Record<string, unknown>);
    const jaKeys = new Set(flattenKeys(jaMessages as unknown as Record<string, unknown>));
    const missingInJa = enKeys.filter((k) => !jaKeys.has(k));
    expect(
      missingInJa,
      `ja.json に以下のキーが欠損しています:\n${missingInJa.join("\n")}`,
    ).toHaveLength(0);
  });
});
