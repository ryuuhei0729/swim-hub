/**
 * PremiumBadge.test.tsx
 *
 * テスト観点: feature prop の各値に対して、ja ロケールの翻訳済み文言が
 * 正しくレンダリングされることを検証する。
 *
 * 検証項目:
 *   - image_upload    → "画像の添付は Premium 会員限定です"
 *   - video_upload    → "動画の添付は Premium 会員限定です"
 *   - split_time_limit  → FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD (3) が文中に含まれる
 *   - practice_time_limit → FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG (18) が文中に含まれる
 *   - compact=false (デフォルト) のとき "アップグレードする" ボタンが表示される
 *   - compact=true のとき "アップグレードする" ボタンは表示されない
 *   - "アップグレードする" ボタン押下で navigation.navigate("Paywall") が呼ばれる
 *
 * トートロジー防止メモ:
 *   - 内部の messages マップを直接参照してはいけない
 *   - ja.json の実文言 (jaMessages) と FREE_PLAN_LIMITS の実定数を期待値として使用する
 *   - react-i18next のモックは vitest.setup.ts で ja.json を返す tMock に設定済み
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import jaMessages from "@apps/shared/messages/ja.json";

// useNavigation は vitest.setup.ts でグローバルモック済みだが、
// navigate の呼び出し検証のために個別に参照する
const mockNavigate = vi.fn();
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: vi.fn(),
    setOptions: vi.fn(),
  }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  useFocusEffect: vi.fn(),
}));

import { PremiumBadge } from "../PremiumBadge";

// ja.json から期待値を直接取得
const ja = jaMessages as unknown as Record<string, Record<string, Record<string, string>>>;
const PREMIUM_MESSAGES = ja.forms.premium;
const UPGRADE_LABEL = ja.common.premiumBadge.upgradeAction;

describe("PremiumBadge — feature prop 別の翻訳済み文言レンダリング", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("feature='image_upload' のとき画像制限の文言が表示される", () => {
    render(<PremiumBadge feature="image_upload" />);
    expect(screen.getByText(PREMIUM_MESSAGES.imageUpload)).toBeTruthy();
  });

  it("feature='video_upload' のとき動画制限の文言が表示される", () => {
    render(<PremiumBadge feature="video_upload" />);
    expect(screen.getByText(PREMIUM_MESSAGES.videoUpload)).toBeTruthy();
  });

  it("feature='split_time_limit' のとき FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD (3) が文中に含まれる", () => {
    render(<PremiumBadge feature="split_time_limit" />);
    const expectedText = PREMIUM_MESSAGES.splitTimeLimit.replace(
      "{limit}",
      String(FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD),
    );
    expect(screen.getByText(expectedText)).toBeTruthy();
    // 補間値が実際の数値定数と一致することを明示的に確認
    expect(expectedText).toContain(String(FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD));
  });

  it("feature='practice_time_limit' のとき FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG (18) が文中に含まれる", () => {
    render(<PremiumBadge feature="practice_time_limit" />);
    const expectedText = PREMIUM_MESSAGES.practiceTimeLimit.replace(
      "{limit}",
      String(FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG),
    );
    expect(screen.getByText(expectedText)).toBeTruthy();
    expect(expectedText).toContain(String(FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG));
  });
});

describe("PremiumBadge — compact=false (デフォルト)", () => {
  it("アップグレードボタンが表示される", () => {
    render(<PremiumBadge feature="image_upload" />);
    expect(screen.getByText(UPGRADE_LABEL)).toBeTruthy();
  });

  it("アップグレードボタンを押すと navigation.navigate('Paywall') が呼ばれる", () => {
    render(<PremiumBadge feature="video_upload" />);
    fireEvent.click(screen.getByText(UPGRADE_LABEL));
    expect(mockNavigate).toHaveBeenCalledWith("Paywall");
  });

  it("'Premium' タイトルが表示される", () => {
    render(<PremiumBadge feature="image_upload" />);
    expect(screen.getByText("Premium")).toBeTruthy();
  });
});

describe("PremiumBadge — compact=true", () => {
  it("アップグレードボタンは表示されない", () => {
    render(<PremiumBadge feature="image_upload" compact />);
    expect(screen.queryByText(UPGRADE_LABEL)).toBeNull();
  });

  it("feature='video_upload' の文言がコンパクト表示でも出る", () => {
    render(<PremiumBadge feature="video_upload" compact />);
    expect(screen.getByText(PREMIUM_MESSAGES.videoUpload)).toBeTruthy();
  });

  it("コンパクト表示でタップすると navigation.navigate('Paywall') が呼ばれる", () => {
    render(<PremiumBadge feature="image_upload" compact />);
    // compact は Pressable 全体がタップ可能
    fireEvent.click(screen.getByText(PREMIUM_MESSAGES.imageUpload));
    expect(mockNavigate).toHaveBeenCalledWith("Paywall");
  });
});
