/**
 * DayDetailModal.headerOverflow.test.tsx
 *
 * Sprint Contract (練習タブ/大会タブ経由のヘッダーに practices.title/competitions.title を
 * 表示する) 検証観点:
 *
 *   [V-45] titleOverride が長い文字列のとき、ヘッダーの見出し Text に
 *          numberOfLines={1} 相当の折り返し制限が渡り、かつ閉じるボタン(icon-x)が
 *          兄弟要素として引き続き描画される (どちらか一方だけを見て「直った」と誤判定しない)
 *   [V-45b] 見出しの style に flexShrink または flex が含まれる (閉じるボタンを
 *          押し出さずに自身が縮む側に倒れること)。numberOfLines だけでは
 *          flexDirection:"row" 内で兄弟 (閉じるボタン) を圧迫できるため、両方を要求する。
 *   [G-2]  (Reviewer指摘) titleOverride 未指定 (ダッシュボード) のとき、見出し Text に
 *          numberOfLines は付かない (undefined のまま)。修正3
 *          (`numberOfLines={titleOverride ? 1 : undefined}`) が意図どおり効いていることの
 *          固定。文字サイズ拡大(OS設定)時にダッシュボードの日付見出しが折り返せなくなる
 *          a11y 後退を防ぐための分岐であり、既存にこれを pin するテストが無かった。
 *

 * 実測 (Phase A 時点の現行コード。長い titleOverride 機能自体が無いため、まだ何も
 * 崩れてはいないが、ヘッダー Text 自体に対策が無いことは既に確認済み):
 *   apps/mobile/components/calendar/DayDetailModal/styles.ts の `title` は
 *   { fontSize: 18, fontWeight: "600", color: "#111827" } のみで flexShrink/flex 無し。
 *   DayDetailModal.tsx のヘッダー Text にも numberOfLines 指定が無い。
 *   このため本テストは実装前の時点で RED になることを意図している。
 *
 * モック方針:
 *   グローバル RN モック (__mocks__/react-native.ts) の Text は numberOfLines を
 *   「DOM要素では無視」して意図的に読み捨てる (RN専用プロップのため)。そのままでは
 *   numberOfLines の有無を DOM から検証できず、「常にfalseになる無意味なテスト」に
 *   なってしまう (過去の paddingVertical 空文字判定と同種の罠)。このファイルだけ
 *   react-native の Text をローカルに上書きし、渡された props をそのまま
 *   capturedTexts に記録する (他コンポーネントは original のまま)。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { TextProps, TextStyle } from "react-native";
import type { CalendarItem } from "@apps/shared/types/ui";

type CapturedText = {
  children: ReactNode;
  numberOfLines?: number;
  style?: Record<string, unknown>;
};

const capturedTexts = vi.hoisted(() => [] as CapturedText[]);

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  const React = await import("react");
  const CapturingText = (props: TextProps) => {
    const style: TextStyle | TextStyle[] | undefined = props.style as
      | TextStyle
      | TextStyle[]
      | undefined;
    const flattenedStyle = Array.isArray(style)
      ? Object.assign({}, ...style.filter(Boolean))
      : style;
    capturedTexts.push({
      children: props.children,
      numberOfLines: props.numberOfLines,
      style: flattenedStyle as Record<string, unknown> | undefined,
    });
    // 実際の描画は original.Text に委譲する (numberOfLines は元の実装同様 DOM には出さない)
    return React.createElement(original.Text, props);
  };
  return { ...original, Text: CapturingText };
});

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  MemoizedPracticeLogDetail: () => null,
  RecordDetail: () => null,
  EntryDetail: () => null,
}));

import { DayDetailModal } from "../DayDetailModal";
import type { DayDetailModalProps } from "../types";

function makeItem(type: CalendarItem["type"], id: string): CalendarItem {
  return { id, type, date: "2026-07-15", title: `item-${id}`, metadata: {} };
}

const NOOP_DATE = new Date("2026-07-15T00:00:00Z");
const LONG_TITLE =
  "第58回全日本マスターズ水泳競技大会・長距離種目・予選・決勝・記録会・特別強化練習メニュー";

// ヘッダー見出し Text は styles.title (fontSize:18, fontWeight:"600") を持つ唯一の Text。
// 表示文字列 (日付 or titleOverride) や DOM 上の描画順に依存せず、スタイルの指紋で
// 一意に特定する (タイトル文字列を書き換えても壊れないようにするため)。
function findHeaderText(): CapturedText | undefined {
  return capturedTexts.find(
    (t) => t.style?.fontSize === 18 && t.style?.fontWeight === "600",
  );
}

function renderModal(props: Partial<DayDetailModalProps> & { entries: CalendarItem[] }) {
  return render(
    <DayDetailModal
      visible={true}
      date={NOOP_DATE}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("DayDetailModal — ヘッダー見出しの折り返し崩壊ガード", () => {
  it(
    "[V-45] 長い titleOverride のとき、見出し Text に numberOfLines が渡り、" +
      "閉じるボタン(icon-x)も引き続き描画される (兄弟要素とセットで確認する)",
    () => {
      capturedTexts.length = 0;
      renderModal({
        entries: [makeItem("practice_log", "log-A")],
        scope: "practice",
        targetId: "log-A",
        titleOverride: LONG_TITLE,
      });

      // 兄弟要素 (閉じるボタン) が引き続き存在することを先に確認する
      // (これが無くなっていたら見出し側だけ直っても意味が無い)
      expect(screen.getByTestId("icon-x")).toBeDefined();

      const headerText = capturedTexts.find(
        (t) => typeof t.children === "string" && (t.children as string).includes(LONG_TITLE),
      );
      expect(headerText, "長い titleOverride を表示する見出し Text が見つからない").toBeDefined();
      expect(headerText?.numberOfLines).toBe(1);
    },
  );

  it("[V-45b] 見出しの style に flexShrink または flex が含まれる (閉じるボタンを圧迫しない)", () => {
    capturedTexts.length = 0;
    renderModal({
      entries: [makeItem("practice_log", "log-A")],
      scope: "practice",
      targetId: "log-A",
      titleOverride: LONG_TITLE,
    });

    const headerText = capturedTexts.find(
      (t) => typeof t.children === "string" && (t.children as string).includes(LONG_TITLE),
    );
    expect(headerText).toBeDefined();
    const style = headerText?.style ?? {};
    const hasShrinkGuard =
      "flexShrink" in style || (typeof style.flex === "number" && style.flex > 0);
    expect(
      hasShrinkGuard,
      `見出し style に flexShrink/flex が無い: ${JSON.stringify(style)}`,
    ).toBe(true);
  });

  it(
    "[G-2] titleOverride 未指定 (ダッシュボード) のとき、見出し Text に numberOfLines は付かない",
    () => {
      capturedTexts.length = 0;
      renderModal({
        entries: [makeItem("practice", "p1")],
        // scope/targetId/titleOverride は一切渡さない = ダッシュボード呼び出し
      });

      const headerText = findHeaderText();
      expect(headerText, "ヘッダー見出し Text が見つからない").toBeDefined();
      expect(headerText?.numberOfLines).toBeUndefined();
    },
  );
});
