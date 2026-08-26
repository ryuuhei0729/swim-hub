/**
 * BestTimesTable (チーム > メンバータブ > メンバー詳細モーダル ベストタイム表)
 * 「WAポイント」表示トグル機能テスト
 *
 * Sprint Contract: 「チームのメンバータブで任意のメンバーを表示した時のベストタイム表にも、
 * WAポイント表示ボタンを作ってください」— 直前スプリントで mypage 版
 * (`apps/web/components/profile/BestTimesTable.tsx`) に実装した WAポイント ON/OFF トグルと
 * 同じ挙動を、`apps/web/components/member-detail/BestTimesTable.tsx` (named export) にも実装する。
 *
 * ## 対象コンポーネントの確定事実 (PM 実測)
 * - i18n 名前空間は `teams.memberDetail.bestTimesTable` (mypage版の `mypage.bestTimesTable` とは別)
 * - 型は `@/types/member-detail` の `BestTime` / `TabType`
 * - named export (`export function BestTimesTable(...)`)、mypage版は default export
 * - data-testid が現状一切無いため、本テストのために最小限を新設する (下記 Interface Contract)
 * - モバイルレスポンシブ最適化 (sm: ブレークポイント等) は元々無い→本スプリントでも追加しない
 *
 * ## 踏襲すべき確定設計 (mypage版で Approved 済み。再発明禁止)
 * - D1: WA候補は非リレー記録のみ (!bt.is_relaying)。最高得点を選ぶ。1件も無ければ「—」。
 *       includeRelaying を WA 経路で参照しない (トグルを動かしても表示が変わらない)
 * - D2: ALLタブは「最高得点の記録」を選ぶ (最速タイムではない)
 * - D3: gender が 0/1 以外 (undefined 含む) → セルは「—」。例外を投げない
 * - D4: 凡例をモードで切替。WAモードでは legend.relaying を出さない
 * - D5: タブ切替でトグル状態維持
 * - D6: includeRelaying チェックボックスは WAモードでも操作可能
 * - UI配置: タブ行の右側に「WAポイントボタン → 引き継ぎチェックボックス」の順
 * - WAモードでは New バッジ・ホバーツールチップを出さない
 *
 * ## ★最重要 (この機能特有の最大のリスク)
 * `MemberDetail.users` には元々 `gender` フィールドが型定義上存在しない。
 * `apps/web/types/member-detail.ts` の `MemberDetail.users` に `gender?: number` を追加し、
 * `MemberDetailModal.tsx` が `<BestTimesTable bestTimes={bestTimes} gender={member.users.gender} />`
 * のように配線する必要がある (Web Developer が実装)。
 *
 * このとき最も危険な実装ミスは、`gender ?? 0` のようなフォールバックを新設すること。
 * `users.gender` の DB デフォルトは 0 (男性) であるため、`?? 0` で埋めると
 * 女性メンバーの点数を男性の基準タイムで計算し、もっともらしいが誤った数値を表示する
 * (基準タイムは男女で約10%異なる)。
 *
 * 下記 [V-GENDER-DIVERGENCE] は、同一タイム・同一種目に対して gender=0 と gender=1 で
 * 異なる数値 (542 / 763) が出ることを実数値で pin する。`gender ?? 0` 型のバグが入ると
 * gender=1 のケースが 542 になり、このテストが確実に red になる。
 *
 * ## 期待値の作成方法 (トートロジー回避)
 * WAポイントの期待値は全て `node -e` で P=floor(1000*(B/T)^3) を独立に計算した
 * ハードコード値。BestTimesTable/waPoints.ts の実装を呼び出して期待値を生成していない。
 * base time (apps/shared/utils/waPoints.ts の BASE_TIME_TABLE, PM確定済み実数値):
 *   SCM(poolType=0) 男子 Fr100: 44.84 / SCM 女子 Fr100: 50.25
 *   LCM(poolType=1) 男子 Fr100: 46.40
 *   SCM 男子 IM100: 49.28 (LCM 男子 IM100 は公式表に存在しない → null)
 *   T=54.97 のとき: 男子(gender=0)=542点 / 女子(gender=1)=763点
 *   T=55.50 (LCM) のとき: 男子=584点
 *
 * ## Developer が満たすべきインターフェース契約 (この契約を前提にテストを書いている)
 * - `BestTimesTableProps` に `gender?: number` を追加 (0: 男性, 1: 女性, undefined/その他: 不明→常に「—」)
 * - トグルボタン: `data-testid="member-detail-best-times-wa-points-toggle"` / `aria-pressed={isWaPointsMode}`
 * - 各セル: `data-testid={`member-detail-best-times-cell-${STYLE_KEY_MAP[style]}-${distance}`}`
 *   (例: 自由形100m → "member-detail-best-times-cell-Fr-100")
 *   WAポイント表示時、メインテキストは整数の文字列のみ (カンマ区切り・単位なし)。
 *   ALLタブでLCM側が選ばれた場合のみ既存の "L" サフィックス相当を付与 (Rは付与しない)
 * - 凡例: `data-testid="member-detail-best-times-legend"` をラッパーに付与
 * - 新規 i18n キー (namespace `teams.memberDetail.bestTimesTable`):
 *   - `waPointsToggle` (ボタン文言)
 *   - `legend.relayingExcludedFromWaPoints` (WAモード時の凡例文言)
 *   訳文は mypage 版の同名キーの実際の訳文を流用すること (新規に訳を発明しない)
 * - タブ行の DOM 順序: WAポイントトグルボタン → 引き継ぎチェックボックス (この順)
 * - 未実装時点ではこれらの data-testid / props / i18n キーが存在しないため、
 *   本テストは意図的に全滅する。Developer 実装後に green になることを
 *   Sprint Contract の完了条件とする。
 */

import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import { BestTimesTable } from "@/components/member-detail/BestTimesTable";
import type { BestTime } from "@/types/member-detail";
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
  `member-detail-best-times-cell-${STYLE_KEY_MAP[style]}-${distance}`;

const getToggle = () => screen.getByTestId("member-detail-best-times-wa-points-toggle");
const getCheckbox = () =>
  screen.getByRole("checkbox", { name: "引き継ぎタイムも含めて表示" });
const getLegend = () => screen.getByTestId("member-detail-best-times-legend");

// ---------------------------------------------------------------------------
// [V-TOGGLE] トグルボタンの基本動作
// ---------------------------------------------------------------------------
describe("[V-TOGGLE] WAポイント表示切替トグル (member-detail)", () => {
  it("初期表示ではタイムモード (aria-pressed=false) で、セルにタイムが表示される", () => {
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt]);

    expect(getToggle()).toHaveAttribute("aria-pressed", "false");
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
  });

  it("トグルをクリックすると aria-pressed=true になり、セルがWAポイント表示に切り替わる", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt], { gender: 0 });

    await user.click(getToggle());

    expect(getToggle()).toHaveAttribute("aria-pressed", "true");
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("542")).toBeInTheDocument();
    expect(within(cell).queryByText(formatTimeBest(54.97))).not.toBeInTheDocument();
  });

  it("ON→OFF→ON と往復すると、タイム表示とWAポイント表示が正しく往復する (状態のpin)", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();

    await user.click(getToggle());
    expect(within(cell).getByText("542")).toBeInTheDocument();

    await user.click(getToggle());
    expect(getToggle()).toHaveAttribute("aria-pressed", "false");
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();

    await user.click(getToggle());
    expect(within(cell).getByText("542")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-GENDER-DIVERGENCE] 最重要: 性別分岐が実際に効いていることの実証
// (`gender ?? 0` のような誤フォールバックが入っていれば gender=1 でも 542 のままになり red)
// ---------------------------------------------------------------------------
describe("[V-GENDER-DIVERGENCE] gender=0 と gender=1 で同一タイムから異なる点数が出る", () => {
  it("gender=0 (男性) と gender=1 (女性) で同一の記録 (T=54.97, SCM, 100m自由形) から異なる点数が出る (542 / 763)", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });

    const maleRender = renderWithLocale([bt], { gender: 0 });
    await user.click(getToggle());
    const maleCell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(maleCell).getByText("542")).toBeInTheDocument();
    expect(within(maleCell).queryByText("763")).not.toBeInTheDocument();
    maleRender.unmount();

    const femaleRender = renderWithLocale([bt], { gender: 1 });
    await user.click(getToggle());
    const femaleCell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(femaleCell).getByText("763")).toBeInTheDocument();
    expect(within(femaleCell).queryByText("542")).not.toBeInTheDocument();
    femaleRender.unmount();
  });

  it("gender=1 (女性) を渡した場合、gender=0 (男性) の点数 542 が表示されてはならない (`gender ?? 0` 型の誤フォールバック検出)", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt], { gender: 1 });

    await user.click(getToggle());
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();
    expect(within(cell).getByText("763")).toBeInTheDocument();
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
    expect(getToggle()).toBeInTheDocument();

    await user.click(getToggle());
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-D1] リレータイムはWAポイントの対象外 (includeRelaying の状態に関係なく不変)
// ---------------------------------------------------------------------------
describe("[V-D1] WAポイントは非リレー記録のみから算出する (member-detail)", () => {
  it("リレー記録しか無い種目は、includeRelayingがON/OFFどちらでもWAポイントは「—」", async () => {
    const user = userEvent.setup();
    const relayOnly = buildBestTime({
      id: "relay-only",
      time: 120.0,
      pool_type: 0,
      is_relaying: true,
      style: { name_jp: "200m背泳ぎ", distance: 200 },
    });
    renderWithLocale([relayOnly], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("背泳ぎ", 200));

    await user.click(getToggle());
    expect(within(cell).getByText("—")).toBeInTheDocument();

    await user.click(getCheckbox());
    expect(within(cell).getByText("—")).toBeInTheDocument();

    await user.click(getCheckbox());
    expect(within(cell).getByText("—")).toBeInTheDocument();
  });

  it("非リレー記録がある種目は、リレー記録(relayingTime)が付随していてもWAポイントは非リレー記録の得点で不変 (includeRelayingの状態に関係なく)", async () => {
    const user = userEvent.setup();
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
    renderWithLocale([bt], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    // タイムモードでの回帰確認 (既存アルゴリズム: includeRelayingで最速候補が変わる)
    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();
    await user.click(getCheckbox());
    expect(within(cell).getByText(formatTimeBest(50.0))).toBeInTheDocument();

    // WAポイントモード: includeRelaying ON のままでも542点 (非リレーの54.97由来) で不変
    await user.click(getToggle());
    expect(within(cell).getByText("542")).toBeInTheDocument();

    // includeRelaying を OFF に戻しても542点のまま変化しない
    await user.click(getCheckbox());
    expect(within(cell).getByText("542")).toBeInTheDocument();
  });

  it("D1-INV: includeRelaying の ON/OFF で WAポイントモードの表示テキストが1文字も変わらない", async () => {
    const user = userEvent.setup();
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
    renderWithLocale([bt], { gender: 0 });
    await user.click(getToggle());
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    const beforeText = cell.textContent;

    await user.click(getCheckbox());
    expect(cell.textContent).toBe(beforeText);

    await user.click(getCheckbox());
    expect(cell.textContent).toBe(beforeText);
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
    renderWithLocale([scm, lcm], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    expect(within(cell).getByText(formatTimeBest(54.97))).toBeInTheDocument();

    await user.click(getToggle());
    expect(within(cell).getByText("584")).toBeInTheDocument();
    expect(within(cell).getByText("L")).toBeInTheDocument();
    expect(within(cell).queryByText("542")).not.toBeInTheDocument();
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
    renderWithLocale([imLcm], { gender: 0 });

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
    renderWithLocale([bt], { gender: 0 });

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
    renderWithLocale([bt], { gender: 0 });
    const legend = getLegend();
    expect(legend.textContent).toContain(
      jaMessages.teams.memberDetail.bestTimesTable.legend.relaying,
    );
  });

  it("WAポイントモードの凡例は「R: 引き継ぎあり」を含まないが、「L: 長水路」は維持する", async () => {
    const user = userEvent.setup();
    const bt = buildBestTime({ time: 54.97, pool_type: 0 });
    renderWithLocale([bt], { gender: 0 });

    await user.click(getToggle());
    const legend = getLegend();
    expect(legend.textContent).not.toContain(
      jaMessages.teams.memberDetail.bestTimesTable.legend.relaying,
    );
    expect(legend.textContent).toContain(
      jaMessages.teams.memberDetail.bestTimesTable.legend.longCourse,
    );
    expect(legend.textContent?.trim().length ?? 0).toBeGreaterThan(
      jaMessages.teams.memberDetail.bestTimesTable.legend.longCourse.length,
    );
  });
});

// ---------------------------------------------------------------------------
// [V-NEWBADGE] WAモードでは New バッジ・ホバーツールチップを出さない
// ---------------------------------------------------------------------------
describe("[V-NEWBADGE] WAポイントモードではNewバッジ・ホバー詳細を表示しない", () => {
  it("タイムモードで New バッジと大会名が見えていた記録も、WAモードに切替えると両方消える", async () => {
    const user = userEvent.setup();
    const recent = buildBestTime({
      time: 54.97,
      pool_type: 0,
      created_at: new Date().toISOString(),
      competition: { title: "直近大会タイトル", date: "2026-08-01" },
    });
    renderWithLocale([recent], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));

    expect(within(cell).getByText("New")).toBeInTheDocument();

    await user.click(getToggle());
    expect(within(cell).queryByText("New")).not.toBeInTheDocument();
    expect(screen.queryByText("直近大会タイトル")).not.toBeInTheDocument();
    expect(within(cell).getByText("542")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// [V-ORDER] UI配置: トグルボタン → 引き継ぎチェックボックスの順
// ---------------------------------------------------------------------------
describe("[V-ORDER] WAポイントトグルボタンは引き継ぎチェックボックスより前に配置される", () => {
  it("DOM上でトグルボタンがチェックボックスより先に現れる", () => {
    const bt = buildBestTime();
    renderWithLocale([bt], { gender: 0 });
    const toggle = getToggle();
    const checkbox = getCheckbox();

    expect(!!(toggle.compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// [V-REG] 既存機能の回帰確認 (本スプリントで変更されないこと)
// (member-detail/BestTimesTable.tsx 用の専用テストファイルは元々存在しなかったため、
//  このスプリントで新設するテストファイルにベースラインの回帰確認も含める)
// ---------------------------------------------------------------------------
describe("[V-REG] 既存の時間表示・Newバッジ・ホバーツールチップ・チェックボックスの回帰確認", () => {
  it("初期状態では引き継ぎチェックボックスは未チェック", () => {
    const bt = buildBestTime();
    renderWithLocale([bt], { gender: 0 });
    expect(getCheckbox()).not.toBeChecked();
  });

  it("30日以内の記録には New バッジが表示される (タイムモード)", () => {
    const recent = buildBestTime({
      created_at: new Date().toISOString(),
      competition: { title: "直近大会", date: "2026-08-01" },
    });
    renderWithLocale([recent], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).getByText("New")).toBeInTheDocument();
  });

  it("30日より前の記録には New バッジが表示されない (タイムモード)", () => {
    const old = buildBestTime({ created_at: "2000-01-01T00:00:00.000Z" });
    renderWithLocale([old], { gender: 0 });
    const cell = screen.getByTestId(cellTestId("自由形", 100));
    expect(within(cell).queryByText("New")).not.toBeInTheDocument();
  });

  it("ホバー時の詳細情報 (大会名) がDOMに存在する (タイムモード)", () => {
    const bt = buildBestTime({ competition: { title: "全国大会", date: "2020-01-01" } });
    renderWithLocale([bt], { gender: 0 });
    expect(screen.getByText("全国大会")).toBeInTheDocument();
  });

  it("記録が1件も無い場合は空状態メッセージが表示される (回帰: WAポイント機能追加でこの分岐を壊さない)", () => {
    renderWithLocale([], { gender: 0 });
    expect(
      screen.getByText(jaMessages.teams.memberDetail.bestTimesTable.noRecords),
    ).toBeInTheDocument();
  });
});
