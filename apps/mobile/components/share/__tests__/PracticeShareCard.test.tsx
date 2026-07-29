/**
 * PracticeShareCard コンポーネント テスト（Phase B 本実装）
 *
 * 対象: apps/mobile/components/share/PracticeShareCard.tsx
 * 参照実装: apps/web/components/share/PracticeShareCard.tsx
 *
 * Sprint Contract 検証観点:
 *   [V-10] 練習ログ「全件」が menuItems として集約されたカードが描画される
 *   [V-11] 練習ログが1件のみの日でも、その1件が正しく表示される（退行なし）
 *
 * 事実確認メモ（重要）:
 *   web/mobile とも PracticeShareCard は `totalDistance`/`totalSets` を一切
 *   DOM に描画しない（web apps/web/components/share/PracticeShareCard.tsx にも
 *   同フィールドの表示箇所は存在しない）。これは mobile 固有のバグではなく
 *   web と一致した既存仕様。したがって [V-12]（totalDistance/totalSets の計算）は
 *   本ファイルではなく、データ組み立て元の
 *   apps/mobile/components/calendar/DayDetailModal/__tests__/PracticeLogDetail.share.test.tsx
 *   側で、ShareCardModal に渡される props を検証する形で確認する。
 *
 * 注記: 本プロジェクトの mobile vitest には @testing-library/jest-dom が
 * セットアップされていないため、`toBeTruthy()`/`toBeNull()` を使う
 * （既存 components/practices/__tests__/PracticeItem.test.tsx 等と同一の慣習）。
 *
 * トートロジー防止メモ:
 *   期待値は web PracticeShareCard.tsx の挙動（menuItems.map 全件描画）と
 *   Sprint Contract の記述から導出したものであり、mobile 実装コードの diff を
 *   読んでコピーしたものではない。
 */

import { render, screen } from "@testing-library/react";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";

// expo-auth-session / expo-web-browser: PracticeShareCard → CompetitionShareCard →
// BestTimeBadge → contexts/AuthProvider → google-auth.ts という依存チェーン経由で
// vitest のモジュール解決過程に引き込まれるためスタブ化する
// (components/practices/__tests__/PracticeLogItem.test.tsx と同一パターン)。
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(() => "swimhub://auth/callback"),
  ResponseType: { Token: "token", Code: "code" },
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

import { PracticeShareCard } from "../PracticeShareCard";
import type { PracticeShareData, PracticeMenuItem } from "../types";

// PracticeShareCard は t を props で受け取るコンポーネントのため、useTranslation() フックを
// テストのトップレベル(コンポーネント外)で呼ぶことはできない(react-hooks/rules-of-hooks)。
// vitest.setup.ts のモックと同じロジックで ja.json を直接解決する軽量な t を用意する。
function resolveKey(key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = jaMessages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}
function interpolate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name) => (name in values ? String(values[name]) : `{${name}}`));
}
const t = ((key: string, options?: Record<string, unknown>) => {
  const raw = resolveKey(key);
  if (raw === undefined) return key;
  return options && Object.keys(options).length > 0 ? interpolate(raw, options) : raw;
}) as unknown as TFunction;

function makeMenuItem(overrides: Partial<PracticeMenuItem> = {}): PracticeMenuItem {
  return {
    style: "Fr",
    category: "Swim",
    distance: 100,
    repCount: 4,
    setCount: 1,
    ...overrides,
  };
}

function makeData(overrides: Partial<PracticeShareData> = {}): PracticeShareData {
  return {
    date: "2026年7月1日(水)",
    title: "朝練",
    menuItems: [makeMenuItem()],
    totalDistance: 400,
    totalSets: 1,
    ...overrides,
  };
}

describe("PracticeShareCard", () => {
  it("[V-10] 内容の異なる2件の menuItems を渡すと、両方の内容(距離・種目)が描画される", () => {
    const data = makeData({
      menuItems: [
        makeMenuItem({ distance: 100, repCount: 4, setCount: 1, style: "Fr" }),
        makeMenuItem({ distance: 50, repCount: 8, setCount: 2, style: "Br" }),
      ],
    });
    render(<PracticeShareCard data={data} t={t} />);

    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    // repCount/setCount も両方表示される（本数の重複を許容し getAllByText を使う）
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
  });

  it("[V-10] menuItems が3件でも全件分のカードが描画される", () => {
    const data = makeData({
      menuItems: [
        makeMenuItem({ distance: 100 }),
        makeMenuItem({ distance: 200 }),
        makeMenuItem({ distance: 300 }),
      ],
    });
    render(<PracticeShareCard data={data} t={t} />);

    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("300")).toBeTruthy();
  });

  it("[V-11] menuItems が1件のみのとき、その1件のみ正しく表示される（退行なし）", () => {
    const data = makeData({ menuItems: [makeMenuItem({ distance: 100, repCount: 4 })] });
    render(<PracticeShareCard data={data} t={t} />);

    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText(data.title)).toBeTruthy();
  });

  it("[共通] times が0件(未設定)のメニュー項目は、タイムテーブルを描画しない", () => {
    const data = makeData({ menuItems: [makeMenuItem({ times: undefined })] });
    render(<PracticeShareCard data={data} t={t} />);

    expect(screen.queryByText(t("practice.modal.setAverage"))).toBeNull();
    expect(screen.queryByText(t("practice.modal.overallAverage"))).toBeNull();
  });

  it("[共通] times が1件以上あるとき、タイムテーブル(セット平均/全体平均/全体最速)が描画される", () => {
    const data = makeData({
      menuItems: [
        makeMenuItem({
          repCount: 1,
          setCount: 1,
          times: [{ setNumber: 1, repNumber: 1, time: 60 }],
        }),
      ],
    });
    render(<PracticeShareCard data={data} t={t} />);

    expect(screen.getByText(t("practice.modal.setAverage"))).toBeTruthy();
    expect(screen.getByText(t("practice.modal.overallAverage"))).toBeTruthy();
    expect(screen.getByText(t("practice.modal.overallFastest"))).toBeTruthy();
  });

  it("[共通] note/tags が無い場合、該当セクションを描画しない（undefined 安全性）", () => {
    const data = makeData({ menuItems: [makeMenuItem({ note: undefined, tags: undefined })] });
    expect(() => render(<PracticeShareCard data={data} t={t} />)).not.toThrow();
    expect(screen.queryByText(t("practice.modal.memo"))).toBeNull();
  });

  it("[共通] place/note が無い場合、メタ行が描画されずクラッシュしない", () => {
    const data = makeData({ place: undefined, note: undefined });
    expect(() => render(<PracticeShareCard data={data} t={t} />)).not.toThrow();
  });
});
