/**
 * CompetitionTabModal — 水路トグルの 2 span 構成テスト (jsdom / QA Phase A)
 *
 * Sprint Contract「スマホ幅 Web UI 改善」の Deliverable:
 *   CompetitionTabModal.tsx:1179 — 水路ラベルを
 *     <span className="sm:hidden">略称</span>
 *     <span className="hidden sm:inline">フル表記</span>
 *   の 2 span 構成にする。375px では「短水」「長水」、1280px では
 *   「短水路 (25m)」「長水路 (50m)」が表示される。
 *
 * ■ jsdom の制約 (Contract 役割境界に明記)
 *   jsdom は CSS を解決しないため sm:hidden / hidden sm:inline はどちらも DOM に残る。
 *   `getByText(/短水/)` は 2 個ヒットして失敗するので使わない。
 *   `within(getByTestId("competition-tab-pool-type-0"))` + クラス名で引く。
 *   「どちらが実際に見えるか」は Playwright 側で判定する。
 *
 * ■ トートロジー回避メモ
 *   クラス文字列だけを見ると「span を 2 つ置いて両方に何か書けば緑」になる。
 *   そこで (a) 各 span の textContent が i18n の別キーの値と一致すること、
 *   (b) 略称 span とフル span のテキストが互いに異なること、
 *   (c) フル表記側が変更前の値のままであること、を併せて見る。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { StyleOption } from "@/components/forms/record-log/types";
import type { EditingData } from "@/stores/types";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

// --- モック群 (CompetitionTabModal.poolType.test.tsx と同型の最小版) ---------

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "range", "in", "match", "filter", "neq"]) {
    chain[m] = () => chain;
  }
  chain.single = () => Promise.resolve(resolveValue);
  chain.maybeSingle = () => Promise.resolve(resolveValue);
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(onFulfilled, onRejected);
  return chain;
}

const COMPETITION_ROW = {
  id: "comp-1",
  date: "2099-01-01",
  end_date: null,
  title: "県大会",
  place: "県営プール",
  pool_type: 1,
  note: null,
};

const fakeSupabase = {
  from: (table: string) => {
    if (table === "competitions") return makeChain({ data: COMPETITION_ROW, error: null });
    return makeChain({ data: [], error: null });
  },
};

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, subscription: null, supabase: fakeSupabase }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));

vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));

// 記録タブの重量 UI。水路トグルの検証とは無関係なので軽量スタブに差し替える。
vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

const styles: StyleOption[] = [{ id: 2, nameJp: "50m自由形", distance: 50 }];
const FUTURE_DATE = "2099-01-01";

type Messages = Record<string, unknown>;

function renderModal(locale: string, messages: Messages) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages as AbstractIntlMessages}>
      <CompetitionTabModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(undefined)}
        selectedDate={new Date(FUTURE_DATE)}
        editingData={
          {
            id: "comp-1",
            type: "competition",
            date: FUTURE_DATE,
            title: "県大会",
            place: "県営プール",
          } as EditingData
        }
        editingCompetitionId="comp-1"
        styles={styles}
        isLoading={false}
      />
    </NextIntlClientProvider>,
  );
}

/** トグルボタン内の「sm 未満で出る span」と「sm 以上で出る span」を取り出す */
function splitToggleSpans(button: HTMLElement) {
  const spans = Array.from(button.querySelectorAll("span"));
  const mobileSpan = spans.find((s) => s.className.split(/\s+/).includes("sm:hidden"));
  const desktopSpan = spans.find(
    (s) =>
      s.className.split(/\s+/).includes("sm:inline") && s.className.split(/\s+/).includes("hidden"),
  );
  return { spans, mobileSpan, desktopSpan };
}

const competitionMessages = (m: Messages) =>
  ((m.forms as Messages).competition as Record<string, string>);

describe("CompetitionTabModal — 水路トグルの略称/フル表記 2 span 構成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[P-01] 短水路ボタンが sm:hidden の略称 span と hidden sm:inline のフル span を両方持つ", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    const button = await screen.findByTestId("competition-tab-pool-type-0");

    const { spans, mobileSpan, desktopSpan } = splitToggleSpans(button);
    // 「2 つ以上」だと余計な span が増えても気づけないので厳密一致にする
    expect(spans.length, "span は略称 / フルの 2 つちょうど").toBe(2);
    expect(mobileSpan, "sm:hidden の略称 span が無い").toBeDefined();
    expect(desktopSpan, "hidden sm:inline のフル span が無い").toBeDefined();
  });

  it("[P-02] 長水路ボタンも同じ 2 span 構成である", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    const button = await screen.findByTestId("competition-tab-pool-type-1");
    const { mobileSpan, desktopSpan } = splitToggleSpans(button);
    expect(mobileSpan).toBeDefined();
    expect(desktopSpan).toBeDefined();
  });

  it("[P-03] 各 span のテキストが対応する i18n キーの値と一致する (ja)", async () => {
    const messages = jaMessages as unknown as Messages;
    const c = competitionMessages(messages);
    renderModal("ja", messages);

    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    const longBtn = screen.getByTestId("competition-tab-pool-type-1");

    const shortSpans = splitToggleSpans(shortBtn);
    const longSpans = splitToggleSpans(longBtn);

    expect(shortSpans.mobileSpan!.textContent).toBe(c.pool_short_abbrev);
    expect(shortSpans.desktopSpan!.textContent).toBe(c.pool_short);
    expect(longSpans.mobileSpan!.textContent).toBe(c.pool_long_abbrev);
    expect(longSpans.desktopSpan!.textContent).toBe(c.pool_long);
  });

  it("[P-04] 略称とフル表記が別の文言である (同じキーを 2 回置いただけでは通さない)", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    const { mobileSpan, desktopSpan } = splitToggleSpans(shortBtn);
    expect(mobileSpan!.textContent).not.toBe(desktopSpan!.textContent);
    expect((mobileSpan!.textContent ?? "").length).toBeLessThan(
      (desktopSpan!.textContent ?? "").length,
    );
  });

  it("[P-05] デスクトップ側の文言が変更前のフル表記のまま (デスクトップ不変)", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    const longBtn = screen.getByTestId("competition-tab-pool-type-1");
    expect(splitToggleSpans(shortBtn).desktopSpan!.textContent).toBe("短水路 (25m)");
    expect(splitToggleSpans(longBtn).desktopSpan!.textContent).toBe("長水路 (50m)");
  });

  it("[P-06] トグルの選択状態 (aria-pressed) は従来どおり動作する", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    // fixture の pool_type=1 が DB 再取得で反映されること = 既存契約が壊れていない
    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
    expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("[P-07] トグル行が横あふれしない構造 (whitespace-nowrap を維持)", async () => {
    // 略称化しても nowrap を外すと 2 行に折れる。Playwright 側の高さ判定の前提。
    renderModal("ja", jaMessages as unknown as Messages);
    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    expect(shortBtn.className).toContain("whitespace-nowrap");
  });

  it("[P-08] ボタン内に素のテキストノードが残っていない (span 化の取りこぼし検出)", async () => {
    renderModal("ja", jaMessages as unknown as Messages);
    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    const directText = Array.from(shortBtn.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    expect(directText).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 全ロケールでの 2 span 構成 (en / de は最長文字列。Playwright の 375px 検証と対)
// ---------------------------------------------------------------------------
describe("CompetitionTabModal — 水路トグルの多言語表示", () => {
  const LOCALE_MESSAGES: Array<[string, Messages]> = [
    ["ja", jaMessages as unknown as Messages],
    ["en", enMessages as unknown as Messages],
    ["ko", koMessages as unknown as Messages],
    ["zh", zhMessages as unknown as Messages],
    ["de", deMessages as unknown as Messages],
  ];

  it.each(LOCALE_MESSAGES)("[P-09] %s でも略称 span / フル span が各ロケールの値で出る", async (locale, messages) => {
    const c = competitionMessages(messages);
    renderModal(locale, messages);

    const shortBtn = await screen.findByTestId("competition-tab-pool-type-0");
    const { mobileSpan, desktopSpan } = splitToggleSpans(shortBtn);
    expect(mobileSpan!.textContent).toBe(c.pool_short_abbrev);
    expect(desktopSpan!.textContent).toBe(c.pool_short);
  });
});
