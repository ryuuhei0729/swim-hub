/**
 * BestTimesTable (マイページ ベストタイム表) 「WAポイント」トグル機能テスト
 *
 * Sprint Contract 検証観点 (Phase A スケルトン → Phase B 実装):
 *   [V-TOGGLE] トグルボタンが常に描画され、aria-pressed でON/OFF状態を表す。
 *              ON→OFF→ON の往復でセル内容が正しく戻る (状態のpin)
 *   [V-D1] WAポイントは「非リレー記録のみ」から最高得点を選ぶ。
 *          - リレー記録しか無い種目 → 「—」(includeRelayingチェックボックスの状態に関係なく)
 *          - 非リレー記録がある種目 → その点数を表示 (includeRelayingの状態に関係なく不変)
 *   [V-D2] ALLタブはWAポイントモードで「最高得点の記録」を選ぶ (最速タイムの記録ではない)。
 *          同じセルがタイムモードとWAポイントモードで別の記録を指すことがある (仕様)
 *   [V-D3] gender が undefined のときWAポイントセルは例外を投げず「—」。
 *          ボタン自体は常に描画される (条件付き描画によるレイアウトシフト禁止)
 *   [V-BASE] 長水路タブ×100m個人メドレーは base time が無いため「—」
 *   [V-D5] タブ切替をしてもトグル状態(ON/OFF)は維持される
 *   [V-D4] 凡例文言がモードによって変わる (WAポイントモードでは「R: 引き継ぎあり」を出さない)
 *   [V-REG] 既存の時間表示・Newバッジ・ホバーツールチップ・チェックボックスの回帰確認
 *
 * ## [V-SCOPE] 削除の経緯 (2026-08-26 QA Phase A, 次スプリント)
 * 前スプリントではこのファイルに、apps/web/components/member-detail/BestTimesTable.tsx
 * (別コンポーネント) の sha256 ハッシュを pin する [V-SCOPE] ガードが存在した。
 * 今回のスプリントは「member-detail 版にも同じWAポイント機能を実装する」ことが要件で
 * あり、そのファイルを変更するのが正しい変更であるため、このガードは必然的に red になる。
 * これは正しい失敗であり、実装を止める理由にはならない (PM 裁定により削除承認)。
 *
 * 単純に削除するだけでは「mypage版が今後も無変更である」保証を失うが、同じ hash-pin
 * パターンで代替すると「1文字変えたら無条件に赤くなる」将来の足止めテストを再生産する
 * だけなので採用しない。代わりに以下の behavioral な安全網で担保する:
 *   - このファイル自体の [V-TOGGLE]/[V-D1]/[V-D2]/[V-D3]/[V-BASE]/[V-D5]/[V-D4]/[V-REG]
 *     が今回のスプリント後も green のままであること (mypage版の実際の挙動を直接検証して
 *     いるため、member-detail版の実装作業中に mypage版に誤って手を入れて壊した場合はここで
 *     検出できる)
 *   - member-detail 版自身の挙動は
 *     apps/web/__tests__/components/member-detail/BestTimesTable.test.tsx が直接検証する
 *     (ファイル内容の無変更を pin するのではなく、機能そのものが正しく動くことを検証する
 *     「本来の検証」に格上げした)
 *
 * ## モック方針
 * - next-intl は手書き useTranslations モックを行わず、NextIntlClientProvider +
 *   実メッセージ JSON (@apps/shared/messages/{locale}.json) を使う
 *   (apps/web/__tests__/components/team/MembersTimeTable.test.tsx と同方針)
 * - Supabase・Auth 等の外部依存は無い (BestTimesTable は props のみで完結する純粋な
 *   表示コンポーネントのため、モック不要)
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * WAポイントの期待値は全て `node -e` で P=floor(1000*(B/T)^3) を独立に計算した
 * ハードコード値。BestTimesTable/waPoints.ts の実装を呼び出して期待値を生成していない。
 * base time は apps/shared/utils/waPoints.ts の BASE_TIME_TABLE (PM確定済み実数値):
 *   SCM(poolType=0) 男子 Fr100: 44.84 / LCM(poolType=1) 男子 Fr100: 46.40
 *   SCM 男子 IM100: 49.28 (LCM 男子 IM100は公式表に存在しない → null)
 *
 * ## Developer が満たすべきインターフェース契約 (この契約を前提にテストを書いている)
 * - props: `gender?: number` を追加 (0: 男性, 1: 女性, undefined/その他: 不明→常に「—」)
 * - トグルボタン: `data-testid="best-times-wa-points-toggle"` / `aria-pressed={isWaPointsMode}`
 * - 各セル: `data-testid={`best-times-cell-${STYLE_KEY_MAP[style]}-${distance}`}`
 *   (例: 自由形100m → "best-times-cell-Fr-100")
 *   WAポイント表示時、メインテキストは整数の文字列のみ (カンマ区切り・単位なし)。
 *   ALLタブでLCM側が選ばれた場合のみ既存の "L" サフィックス相当を付与 (Rは付与しない)
 * - 凡例: `data-testid="best-times-legend"` をラッパーに付与
 * - 未実装時点ではこれらの data-testid / props が存在しないため、本テストは意図的に
 *   全滅する。Developer 実装後に green になることを Sprint Contract の完了条件とする。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import BestTimesTable, { type BestTime } from "../../../components/profile/BestTimesTable";
import { STYLE_KEY_MAP } from "@apps/shared/utils/swimStyles";
import { formatTimeBest } from "@apps/shared/utils/time";

import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";

type Locale = "ja" | "en";
const MESSAGES: Record<Locale, AbstractIntlMessages> = {
  ja: jaMessages as unknown as AbstractIntlMessages,
  en: enMessages as unknown as AbstractIntlMessages,
};

function renderWithLocale(
  bestTimes: BestTime[],
  props: { gender?: number } = { gender: 0 },
  locale: Locale = "ja",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <BestTimesTable bestTimes={bestTimes} {...props} />
    </NextIntlClientProvider>,
  );
}

function buildBestTime(overrides: Partial<BestTime> = {}): BestTime {
  return {
    id: "record-1",
    time: 60.0,
    created_at: "2020-01-01T00:00:00.000Z",
    pool_type: 0,
    is_relaying: false,
    style: { name_jp: "100m自由形", distance: 100 },
    competition: { title: "テスト大会", date: "2020-01-01" },
    ...overrides,
  };
}

const cellTestId = (style: keyof typeof STYLE_KEY_MAP, distance: number) =>
  `best-times-cell-${STYLE_KEY_MAP[style]}-${distance}`;

const getToggle = () => screen.getByTestId("best-times-wa-points-toggle");
const getCheckbox = () =>
  screen.getByRole("checkbox", { name: "引き継ぎタイムも含めて表示" });

// ---------------------------------------------------------------------------
// [V-TOGGLE] トグルボタンの基本動作
// ---------------------------------------------------------------------------
describe("[V-TOGGLE] WAポイント表示切替トグル", () => {
  it("初期表示ではタイムモード (aria-pressed=false) で、セルにタイムが表示される", () => {
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);

    expect(getToggle()).toHaveAttribute("aria-pressed", "false");
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
  });

  it("トグルをクリックすると aria-pressed=true になり、セルがWAポイント表示に切り替わる", async () => {
    const user = userEvent.setup();
    // SCM 男子 Fr100, T=54.97 (base=44.84) → 542点
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);

    await user.click(getToggle());

    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("542")).toBeInTheDocument();
    expect(within(cell).queryByText(formatTimeBest(54.97))).not.toBeInTheDocument();
  });

  it("ON→OFF→ON と往復すると、タイム表示とWAポイント表示が正しく往復する (状態のpin)", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    // OFF (初期)
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();

    // ON
    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
    expect(within(cell).getByText("542")).toBeInTheDocument();

    // OFF に戻す
    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "false");
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();

    // 再度 ON
    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
    expect(within(cell).getByText("542")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-D2] ALLタブの逆転ケース: 最速タイムではなく最高得点の記録を採用する
// ---------------------------------------------------------------------------
describe("[V-D2] ALLタブ: WAポイントモードは最高得点の記録を選ぶ (最速タイムの記録ではない)", () => {
  it("SCM 54.97 (542点・タイムは速い) と LCM 55.50 (584点・タイムは遅い) が両方ある場合、タイムモードはSCMの54.97、WAポイントモードはLCMの584点(Lサフィックス付き)を表示する", async () => {
    const user = userEvent.setup();
    const scm = buildBestTime({ id: "scm", time: 54.97, pool_type: 0, is_relaying: false });
    const lcm = buildBestTime({ id: "lcm", time: 55.5, pool_type: 1, is_relaying: false });
    renderWithLocale([scm, lcm]);
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    // タイムモード (ALLタブ既定): 最速のSCM 54.97 が選ばれ、Lサフィックスは付かない
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
    expect(within(cell).queryByText("L")).not.toBeInTheDocument();

    // WAポイントモード: LCM側の584点が選ばれ、Lサフィックスが付く。542(SCMの点数)ではない
    await user.click(getToggle());
    expect(within(cell).getByText("584")).toBeInTheDocument();
    expect(within(cell).getByText("L")).toBeInTheDocument();
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-D1] リレータイムはWAポイントの対象外 (D1: includeRelayingの状態に関係なく不変)
// ---------------------------------------------------------------------------
describe("[V-D1] WAポイントは非リレー記録のみから算出する", () => {
  it("リレー記録しか無い種目は、includeRelayingがON/OFFどちらでもWAポイントは「—」", async () => {
    const user = userEvent.setup();
    // 200m背泳ぎ、is_relaying=true のみ (非リレー記録が存在しない)
    const relayOnly = buildBestTime({
      id: "relay-only",
      time: 120.0,
      pool_type: 0,
      is_relaying: true,
      style: { name_jp: "200m背泳ぎ", distance: 200 },
    });
    renderWithLocale([relayOnly]);
    const cell = screen.getByTestId(cellTestId("背泳ぎ", 200));

    await user.click(getToggle()); // WAポイントモードON
    expect(within(cell).getByText("—")).toBeInTheDocument();

    await user.click(getCheckbox()); // includeRelaying ON
    expect(within(cell).getByText("—")).toBeInTheDocument();

    await user.click(getCheckbox()); // includeRelaying OFF に戻す
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });

  it("非リレー記録がある種目は、リレー記録(relayingTime)が付随していてもWAポイントは非リレー記録の得点で不変 (includeRelayingの状態に関係なく)", async () => {
    const user = userEvent.setup();
    // 非リレー T=54.97 (542点) に、より速いリレー引き継ぎ T=50.00 が付随
    const bt = buildBestTime({
      id: "nonrelay",
      time: 54.97,
      pool_type: 0,
      is_relaying: false,
      relayingTime: {
        id: "relay-1",
        time: 50.0,
        created_at: "2020-01-01T00:00:00.000Z",
      },
    });
    renderWithLocale([bt]);
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    // --- タイムモードでの回帰確認 (既存アルゴリズム: includeRelayingで最速候補が変わる) ---
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
    await user.click(getCheckbox()); // includeRelaying ON
    expect(within(cell).getByText(formatTimeBest(50.0))).toBeInTheDocument();
    expect(within(cell).getByText("R")).toBeInTheDocument();

    // --- WAポイントモード: includeRelaying ON のままでも542点 (非リレーの54.97由来) で不変 ---
    await user.click(getToggle());
    expect(within(cell).getByText("542")).toBeInTheDocument();
    expect(within(cell).queryByText("R")).not.toBeInTheDocument();

    // includeRelaying を OFF に戻しても542点のまま変化しない
    await user.click(getCheckbox());
    expect(within(cell).getByText("542")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-D3] gender が undefined のとき、WAポイントは例外を投げず「—」
// ---------------------------------------------------------------------------
describe("[V-D3] gender が undefined のときWAポイントセルは例外なく「—」", () => {
  it("gender未指定でWAポイントモードに切り替えても例外を投げず「—」になり、トグルボタンは描画されたまま", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });

    expect(() => renderWithLocale([bt], {})).not.toThrow();
    // ボタンは常に描画される (条件付き描画によるレイアウトシフト禁止)
    expect(getToggle()).toBeInTheDocument();

    await user.click(getToggle());
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-BASE] 長水路タブ×100m個人メドレーは base time が無いため「—」
// ---------------------------------------------------------------------------
describe("[V-BASE] LCM×IM100 は公式base timeが存在しないため「—」", () => {
  it("長水路タブでIM100の記録があってもWAポイントは「—」", async () => {
    const user = userEvent.setup();
    const imLcm = buildBestTime({
      id: "im-lcm",
      time: 56.0,
      pool_type: 1,
      is_relaying: false,
      style: { name_jp: "100m個人メドレー", distance: 100 },
    });
    renderWithLocale([imLcm]);

    // 長水路タブへ切り替え
    await user.click(screen.getByRole("button", { name: "長水路" }));
    await user.click(getToggle());

    const cell = screen.getByTestId(cellTestId("個人メドレー", 100));
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-D5] タブ切替をしてもトグル状態は維持される
// ---------------------------------------------------------------------------
describe("[V-D5] タブ切替でWAポイントトグルのON状態が維持される", () => {
  it("ALL→短水路→長水路とタブを切り替えても aria-pressed=true が維持される", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);

    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "短水路" }));
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "長水路" }));
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "ALL" }));
    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
  });
});

// ---------------------------------------------------------------------------
// [V-D4] 凡例文言がモードによって変わる
// ---------------------------------------------------------------------------
describe("[V-D4] 凡例文言がモードで変わる (WAポイントモードで「R: 引き継ぎあり」は出さない)", () => {
  it("タイムモードの凡例には「R: 引き継ぎあり」を含む (回帰確認)", () => {
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);
    const legend = screen.getByTestId("best-times-legend");
    expect(legend.textContent).toContain(jaMessages.mypage.bestTimesTable.legend.relaying);
  });

  it("WAポイントモードの凡例は「R: 引き継ぎあり」を含まないが、「L: 長水路」は維持する", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);

    await user.click(getToggle());
    const legend = screen.getByTestId("best-times-legend");
    expect(legend.textContent).not.toContain(jaMessages.mypage.bestTimesTable.legend.relaying);
    expect(legend.textContent).toContain(jaMessages.mypage.bestTimesTable.legend.longCourse);
    // 空文字ではなく、何らかの説明文が表示されていること
    expect(legend.textContent?.trim().length ?? 0).toBeGreaterThan(
      jaMessages.mypage.bestTimesTable.legend.longCourse.length,
    );
  });
});

// ---------------------------------------------------------------------------
// [V-REG] 既存の時間表示・Newバッジ・ホバーツールチップ・チェックボックスの回帰確認
// ---------------------------------------------------------------------------
describe("[V-REG] 既存機能の回帰確認 (本スプリントで変更されないこと)", () => {
  it("30日以内の記録には New バッジが表示される", () => {
    const recent = buildBestTime({
      created_at: new Date().toISOString(),
      competition: { title: "直近大会", date: "2026-08-01" },
    });
    renderWithLocale([recent]);
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("New")).toBeInTheDocument();
  });

  it("30日より前の記録には New バッジが表示されない", () => {
    const old = buildBestTime({ created_at: "2000-01-01T00:00:00.000Z" });
    renderWithLocale([old]);
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).queryByText("New")).not.toBeInTheDocument();
  });

  it("ホバー時の詳細情報 (大会名) がDOMに存在する (タイムモード)", () => {
    const bt = buildBestTime({ competition: { title: "全国大会", date: "2020-01-01" } });
    renderWithLocale([bt]);
    expect(screen.getByText("全国大会")).toBeInTheDocument();
  });

  it("引き継ぎタイムを含めるチェックボックスは初期状態で未チェック", () => {
    const bt = buildBestTime();
    renderWithLocale([bt]);
    expect(getCheckbox()).not.toBeChecked();
  });
});
