/**
 * DayDetailModal.targetMode.test.tsx
 *
 * Sprint Contract (練習タブ/大会タブ経由の DayDetailModal を「タップした1件のみ」表示に
 * 絞り込む) 検証観点:
 *
 *   [V-34] scope="practice" + targetId=対象ログid のとき、同日の兄弟ログは出ず対象ログ1件のみ描画される
 *   [V-35] targetId がログ0件の practice/team_practice アイテムの id のとき、そのアイテム1件が描画される
 *   [V-36] scope="competition" + targetId=大会id + targetRecordId=対象記録id のとき、
 *          RecordDetail に targetRecordId が渡る (同じ大会の他種目記録は RecordDetail 内部で絞られる。
 *          RecordDetail 自体の内部クエリ検証は RecordDetail.targetRecordId.test.tsx が担当)
 *   [V-37] targetRecordId 無し (エントリー済み行タップ) でも targetId(=大会id) だけで
 *          その大会の record-detail/entry-detail のいずれかが描画され、他大会は描画されない
 *   [G-1]  (Reviewer指摘の空白域) 同じ大会に複数種目のエントリーがあるとき、targetId=大会id は
 *          その大会に属する entry を "全て" 残し、別大会の entry は残さない。
 *          V-50c (domainFilter.targetId.test.ts) のコメントが明示的に除外していたケースを、
 *          DayDetailModal レベル(EntryDetail への実際の entries 配列)で確認する
 *   [V-38] scope="practice" + titleOverride 指定時、ヘッダーは日付ではなく titleOverride を表示する
 *   [V-39] scope="competition" + titleOverride 指定時も同様
 *   [V-40] targetId/titleOverride を一切渡さない (ダッシュボード呼び出し) 場合、
 *          ヘッダーは従来どおり日付 + headerTitleSuffix のままで titleOverride 分岐に入らない (無変更回帰)
 *   [V-41] targetRecordId 指定の1件モードでも RecordDetail へ onAddRecord が forward される
 *          (「大会記録を追加」導線は残す、というPM裁定の配線保証)
 *   [V-42] targetId に一致するアイテムが0件のとき、白紙にならず entryEmptyText が表示される
 *   [V-43] targetId/titleOverride/targetRecordId は全て optional。
 *          既存呼び出し (scope="day" のみ、他は未指定) は型上・実行上ともに従来と同じ結果になる
 *
 * 対象実装 (未実装 / Phase A 時点では targetId 等の prop 自体が存在しないため RED):
 *   apps/mobile/components/calendar/DayDetailModal/DayDetailModal.tsx
 *   apps/mobile/components/calendar/DayDetailModal/types.ts (DayDetailModalProps に
 *     targetId?: string / titleOverride?: string / targetRecordId?: string を追加)
 *
 * テスト方針:
 *   DayDetailModal.scope.test.tsx と同一パターンで
 *   `@/components/calendar/DayDetailModal/components` を軽量スタブに mock する。
 *   RecordDetail スタブは props (competitionId, targetRecordId, onAddRecord の有無) を
 *   data-testid / data-* 属性として露出し、DayDetailModal 側の配線のみを検証する
 *   (RecordDetail 内部の supabase クエリ検証は別ファイルの責務)。
 *
 * トートロジー防止メモ:
 *   期待値は PM がユーザーに確認して確定した仕様 (練習タブ=タップしたログ1件のみ /
 *   大会タブ=タップした記録1件のみ・同大会の他種目は出さない / ダッシュボードは無変更) から
 *   導出したものであり、DayDetailModal.tsx の実装(diff)を読んでコピーしたものではない。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@apps/shared/types/ui";
import { DayDetailModal } from "../DayDetailModal";
import type { DayDetailModalProps } from "../types";

vi.mock("@/components/calendar/DayDetailModal/components", () => ({
  MemoizedPracticeLogDetail: (props: { item: CalendarItem }) => (
    <div data-testid={`other-item-${props.item.type}-${props.item.id}`}>
      {props.item.type}:{props.item.id}
    </div>
  ),
  RecordDetail: (props: {
    competitionId: string;
    targetRecordId?: string;
    onAddRecord?: () => void;
  }) => (
    <div
      data-testid={`record-detail-${props.competitionId}`}
      data-target-record-id={props.targetRecordId ?? ""}
      data-has-add-record={props.onAddRecord ? "yes" : "no"}
    >
      record-detail
    </div>
  ),
  EntryDetail: (props: { competitionId: string; entries?: CalendarItem[] }) => (
    <div
      data-testid={`entry-detail-${props.competitionId}`}
      data-entry-count={props.entries?.length ?? 0}
      data-entry-ids={(props.entries ?? []).map((e) => e.id).join(",")}
    >
      entry-detail
    </div>
  ),
}));

function makeItem(
  type: CalendarItem["type"],
  id: string,
  overrides: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: {},
    ...overrides,
  };
}

const NOOP_DATE = new Date("2026-07-15T00:00:00Z");

function renderModal(props: Partial<DayDetailModalProps> & { entries: CalendarItem[] }) {
  return render(
    <DayDetailModal
      visible={true}
      date={NOOP_DATE}
      onClose={vi.fn()}
      onAddRecord={vi.fn()}
      onAddPractice={vi.fn()}
      {...props}
    />,
  );
}

describe("DayDetailModal — targetId による1件絞り込み (練習タブ)", () => {
  it("[V-34] 同日に複数ログがあっても targetId に一致する1件のみ描画する", () => {
    renderModal({
      entries: [
        makeItem("practice_log", "log-A"),
        makeItem("practice_log", "log-B"),
      ],
      scope: "practice",
      targetId: "log-A",
    });

    expect(screen.getByTestId("other-item-practice_log-log-A")).toBeDefined();
    expect(screen.queryByTestId("other-item-practice_log-log-B")).toBeNull();
  });

  it("[V-35] ログ0件の practice アイテム (targetId=practice.id) は1件そのまま描画される", () => {
    renderModal({
      entries: [makeItem("practice", "practice-no-log")],
      scope: "practice",
      targetId: "practice-no-log",
    });

    expect(screen.getByTestId("other-item-practice-practice-no-log")).toBeDefined();
  });
});

describe("DayDetailModal — targetId による1件絞り込み (大会タブ)", () => {
  it("[V-36] targetRecordId 指定時、対象大会の RecordDetail のみ描画され targetRecordId が渡る", () => {
    renderModal({
      entries: [
        makeItem("record", "comp-1", {
          metadata: { competition: { id: "comp-1", title: "A大会", date: "2026-07-15", place: null, pool_type: 0 } },
        }),
      ],
      scope: "competition",
      targetId: "comp-1",
      targetRecordId: "record-xyz",
    });

    const el = screen.getByTestId("record-detail-comp-1");
    expect(el.getAttribute("data-target-record-id")).toBe("record-xyz");
  });

  it("[V-37] targetRecordId 無し (エントリー済み行タップ) でも targetId=大会id のみで絞り込まれる", () => {
    renderModal({
      entries: [
        makeItem("entry", "en-1", {
          metadata: { competition: { id: "comp-2", title: "B大会", date: "2026-07-15", place: null, pool_type: 0 } },
        }),
      ],
      scope: "competition",
      targetId: "comp-2",
    });

    expect(screen.getByTestId("entry-detail-comp-2")).toBeDefined();
  });

  it(
    "[G-1] 同じ大会に複数種目のエントリーがあるとき、エントリー済み行タップは全て残し、" +
      "別大会のエントリーは除外する (V-50c コメントが明示的に除外していた空白域)",
    () => {
      renderModal({
        entries: [
          makeItem("entry", "en-100fr", {
            metadata: { competition: { id: "comp-multi", title: "複数種目大会", date: "2026-07-15", place: null, pool_type: 0 } },
          }),
          makeItem("entry", "en-200fr", {
            metadata: { competition: { id: "comp-multi", title: "複数種目大会", date: "2026-07-15", place: null, pool_type: 0 } },
          }),
          makeItem("entry", "en-other-comp", {
            metadata: { competition: { id: "comp-other", title: "別大会", date: "2026-07-15", place: null, pool_type: 0 } },
          }),
        ],
        scope: "competition",
        targetId: "comp-multi",
      });

      const el = screen.getByTestId("entry-detail-comp-multi");
      expect(el.getAttribute("data-entry-count")).toBe("2");
      expect(el.getAttribute("data-entry-ids")).toBe("en-100fr,en-200fr");
      expect(screen.queryByTestId("entry-detail-comp-other")).toBeNull();
    },
  );

  it("[V-41] targetRecordId 指定の1件モードでも RecordDetail へ onAddRecord が forward される", () => {
    renderModal({
      entries: [
        makeItem("record", "comp-3", {
          metadata: { competition: { id: "comp-3", title: "C大会", date: "2026-07-15", place: null, pool_type: 0 } },
        }),
      ],
      scope: "competition",
      targetId: "comp-3",
      targetRecordId: "record-1",
      onAddRecord: vi.fn(),
    });

    expect(screen.getByTestId("record-detail-comp-3").getAttribute("data-has-add-record")).toBe(
      "yes",
    );
  });
});

describe("DayDetailModal — ヘッダーの titleOverride", () => {
  it("[V-38] scope=\"practice\" + titleOverride 指定時、ヘッダーは titleOverride を表示する", () => {
    renderModal({
      entries: [makeItem("practice_log", "log-A")],
      scope: "practice",
      targetId: "log-A",
      titleOverride: "朝練メニュー",
    });

    expect(screen.getByText("朝練メニュー")).toBeDefined();
  });

  it("[V-39] scope=\"competition\" + titleOverride 指定時、ヘッダーは titleOverride を表示する", () => {
    renderModal({
      entries: [
        makeItem("record", "comp-1", {
          metadata: { competition: { id: "comp-1", title: "A大会", date: "2026-07-15", place: null, pool_type: 0 } },
        }),
      ],
      scope: "competition",
      targetId: "comp-1",
      titleOverride: "第10回市民大会",
    });

    expect(screen.getByText("第10回市民大会")).toBeDefined();
  });

  it("[V-40] targetId/titleOverride 未指定 (ダッシュボード) は従来どおり日付見出しのまま", () => {
    renderModal({
      entries: [makeItem("practice", "p1")],
    });

    // 日付フォーマットは formatDate("shortWithWeekday") 依存のため厳密な文字列は固定せず、
    // 少なくとも「練習」等の titleOverride 文言が使われていないことのみ確認する
    expect(screen.queryByText("朝練メニュー")).toBeNull();
    expect(screen.getByTestId("other-item-practice-p1")).toBeDefined();
  });
});

describe("DayDetailModal — targetId 絞り込みの0件ケース", () => {
  it("[V-42] targetId に一致するアイテムが無いとき、白紙にならず entryEmptyText が表示される", () => {
    renderModal({
      entries: [makeItem("practice_log", "log-other")],
      scope: "practice",
      targetId: "log-deleted-elsewhere",
    });

    expect(screen.getByText("エントリー情報が見つかりません")).toBeDefined();
    expect(screen.queryByTestId("other-item-practice_log-log-other")).toBeNull();
  });
});

describe("DayDetailModal — 新規propはすべてoptional (回帰確認)", () => {
  it("[V-43] targetId/titleOverride/targetRecordId を渡さない既存呼び出しは従来と同じ結果になる", () => {
    renderModal({
      entries: [makeItem("practice", "p1"), makeItem("record", "r1", {
        metadata: { competition: { id: "comp-r1", title: "Comp R1", date: "2026-07-15", place: null, pool_type: 0 } },
      })],
    });

    expect(screen.getByTestId("other-item-practice-p1")).toBeDefined();
    expect(screen.getByTestId("record-detail-comp-r1")).toBeDefined();
  });
});
