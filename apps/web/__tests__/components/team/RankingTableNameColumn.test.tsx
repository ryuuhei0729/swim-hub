/**
 * ランキング表のメンバー名列 — `truncate` + `xl:max-w-40` + `title`
 * (QA Sprint Contract Phase B / 2カラム化の追随修正)
 *
 * 対象:
 *   apps/web/components/team/rankings/RankingTable.tsx      (個人種目)
 *   apps/web/components/team/rankings/RelayRankingTable.tsx (リレーのレグ内訳)
 *
 * 背景:
 *   PC を左右2カラムにした結果、表の載る右カラムが 1280px で 444px / 1440px で
 *   524px しかなくなった。長い氏名を放置すると氏名列が伸びて「大会 / 日付」まで
 *   親の `overflow-x-auto` の外へ押し出す。そこで `xl` 以上だけ 160px の上限を与える。
 *
 * 検証観点:
 *   [V-NC-01] `title` に**表示文字列と同一の全文**が入る (CSS で見た目が切れても
 *             DOM 側には全文が残っている)
 *   [V-NC-02] 🚨 上限は **`xl:` 接頭辞つきだけ**。素の `max-w-*` や
 *             `sm:` / `md:` / `lg:` の `max-w-*` が無い (否定形)。
 *             ユーザーは「1280px 未満は今のままでいい」と明言しており、
 *             接頭辞を落とすとスマホ・タブレットの氏名が静かに切れ始める
 *   [V-NC-03] 個人種目版とリレー版が**同一の値**を使う (片方だけ変えると
 *             タブ切り替えで氏名の切れ方が変わる)
 *
 * 🚨 **「160px に収まるか」「実際に切り詰められるか」はこのファイルでは検証していない。**
 *    jsdom は CSS を読まずレイアウトも計算しないので `clientWidth` / `scrollWidth` は
 *    常に 0 で、truncate の判定は**原理的に不可能**。
 *    実測はヘッドレス Chromium 側で行った (QA レポートに記載):
 *      1279px → max-width: none  / 44字の氏名も切られない (= 変更前と同じ)
 *      1280px → max-width: 160px / 44字は clientWidth 160 vs scrollWidth 615 で切れる
 *               19字は切れない。maxWidth を none に戻すと右カラムの表が
 *               444px の枠に対して 885px を要求する (= この上限は load-bearing)
 *
 * 🚨 **`aria-label` を付けない / 付けるという判断はここでは固定しない。**
 *    支援技術向けの露出方法は本テストの関心外であり、後から `aria-label` を
 *    足しても本テストは赤くならない。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import type { TeamRankingRow } from "@apps/shared/types";
import RankingTable from "@/components/team/rankings/RankingTable";

vi.mock("@/lib/image-url", () => ({
  getSignedImageUrl: vi.fn().mockResolvedValue(null),
}));

const SRC_DIR = path.resolve(__dirname, "../../../components/team/rankings");
const readSource = (file: string) => readFileSync(path.join(SRC_DIR, file), "utf8");

/** 44字。切り詰めが起きる長さの実測値 (Chromium で 615px を要求した文字列) */
const LONG_NAME = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわ";
/** 19字。1280px でも切り詰めが起きなかった長さ */
const NORMAL_NAME = "QA Sticky Member 16";

const row = (recordId: string, displayName: string): TeamRankingRow => ({
  recordId,
  userId: `user-${recordId}`,
  displayName,
  time: 62.34,
  styleId: 1,
  style: "Fr",
  distance: 100,
  poolType: 1,
  gender: 0,
  competitionId: "comp-1",
  competitionTitle: "QA 記録会",
  competitionDate: "2026-06-01",
  recordCreatedAt: "2026-06-01T00:00:00Z",
  rank: Number(recordId),
});

const renderTable = (rows: readonly TeamRankingRow[]) =>
  render(
    <NextIntlClientProvider
      locale="ja"
      // ja.json の `keywords` が string[] なので AbstractIntlMessages に直接は入らない
      // (既存の TeamRankings.test.tsx と同じ回避法)
      messages={messages as unknown as AbstractIntlMessages}
      timeZone="Asia/Tokyo"
    >
      <RankingTable rows={rows} />
    </NextIntlClientProvider>,
  );

/** メンバー名の span を DOM から取る。`title` 属性の有無ではなく行から辿る */
const nameSpan = (container: HTMLElement, recordId: string): HTMLElement => {
  const tr = container.querySelector(`[data-testid="team-rankings-row-${recordId}"]`);
  expect(tr, `行 ${recordId} が描画されていない`).not.toBeNull();
  const span = tr!.querySelectorAll("td")[1]?.querySelector("span");
  expect(span, `行 ${recordId} のメンバー名 span が見つからない`).not.toBeNull();
  return span as HTMLElement;
};

describe("ランキング表のメンバー名列", () => {
  describe("[V-NC-01] title に全文が残る", () => {
    it("長い氏名でも title と表示文字列が完全一致する", () => {
      const { container } = renderTable([row("1", LONG_NAME), row("2", NORMAL_NAME)]);

      const longSpan = nameSpan(container, "1");
      expect(longSpan.textContent).toBe(LONG_NAME);
      expect(longSpan.getAttribute("title")).toBe(LONG_NAME);

      const normalSpan = nameSpan(container, "2");
      expect(normalSpan.textContent).toBe(NORMAL_NAME);
      expect(normalSpan.getAttribute("title")).toBe(NORMAL_NAME);
    });

    it("氏名が短くても title を省略しない (長さで分岐していない)", () => {
      const { container } = renderTable([row("1", "山田")]);
      expect(nameSpan(container, "1").getAttribute("title")).toBe("山田");
    });

    it("氏名が空文字でも例外を投げずに描画する (退会等の欠損データ)", () => {
      const { container } = renderTable([row("1", "")]);
      const span = nameSpan(container, "1");
      expect(span.textContent).toBe("");
      expect(span.getAttribute("title")).toBe("");
      // 順位とタイムは欠損に引きずられず出る
      expect(screen.getByText("1:02.34")).toBeInTheDocument();
    });
  });

  describe("[V-NC-02] 上限は xl 以上だけ", () => {
    it("描画されたクラスに truncate と xl:max-w-40 がある", () => {
      const { container } = renderTable([row("1", LONG_NAME)]);
      const cls = nameSpan(container, "1").className.split(/\s+/);
      expect(cls).toContain("truncate");
      expect(cls).toContain("xl:max-w-40");
    });

    it("🚨 接頭辞なし / xl 以外の接頭辞つきの max-w-* を持たない", () => {
      const { container } = renderTable([row("1", LONG_NAME)]);
      const cls = nameSpan(container, "1").className.split(/\s+/);
      const maxW = cls.filter((c) => /(^|:)max-w-/.test(c));
      // 上限は1つだけ、しかも xl: 接頭辞つき
      expect(maxW).toEqual(["xl:max-w-40"]);
      expect(cls.filter((c) => /^(sm|md|lg):max-w-/.test(c))).toEqual([]);
      expect(cls.filter((c) => /^max-w-/.test(c))).toEqual([]);
    });

    it("トークン抽出の述語そのものが機能する (自作パーサの負のコントロール)", () => {
      // このファイルの max-w 判定はハンドロールなので、判定式が本当に
      // 「素の max-w」「lg:max-w」を弾けるかを固定値で先に確かめる。
      // これが無いと、抽出が空振りしていても上の assert が green になる形に
      // 書き換わったことに気づけない
      const pick = (tokens: readonly string[]) => tokens.filter((t) => /(^|:)max-w-/.test(t));
      expect(pick(["block", "truncate", "max-w-40"])).toEqual(["max-w-40"]);
      expect(pick(["block", "lg:max-w-40"])).toEqual(["lg:max-w-40"]);
      expect(pick(["block", "xl:max-w-40"])).toEqual(["xl:max-w-40"]);
      expect(pick(["block", "truncate"])).toEqual([]);
      // 紛らわしい別クラスを拾わない
      expect(pick(["max-h-40", "min-w-0", "w-40"])).toEqual([]);
    });

    it("🚨 リレーのレグ内訳側も同様に xl 限定である (ソース)", () => {
      const src = readSource("RelayRankingTable.tsx");
      // クラス文字列を抜き出して max-w-* を数える
      const classAttrs = src.match(/className=(?:"[^"]*"|\{[^}]*\})/g) ?? [];
      const maxWTokens = classAttrs
        .flatMap((a) => a.split(/[\s"'`{}]+/))
        .filter((t) => /(^|:)max-w-/.test(t));
      expect(maxWTokens.length).toBeGreaterThan(0);
      for (const t of maxWTokens) {
        expect(t, `${t} が xl: 接頭辞を持たない`).toMatch(/^xl:max-w-/);
      }
    });
  });

  describe("[V-NC-03] 個人種目とリレーで値が一致する", () => {
    it("両ファイルが同一の max-w トークンを使う", () => {
      const tokensOf = (file: string) => {
        const src = readSource(file);
        return [...new Set((src.match(/xl:max-w-[\w./[\]-]+/g) ?? []))].sort();
      };
      const individual = tokensOf("RankingTable.tsx");
      const relay = tokensOf("RelayRankingTable.tsx");
      expect(individual).not.toEqual([]);
      expect(relay).toEqual(individual);
    });

    it("リレー側も title に全文を渡している (ソース)", () => {
      const src = readSource("RelayRankingTable.tsx");
      // 同じ式が children と title の両方に渡っていること
      expect(src).toMatch(/className="block truncate xl:max-w-40"\s*\n?\s*title=\{swimmerLabel\}/);
      expect(src).toMatch(/title=\{swimmerLabel\}\s*>\s*\n?\s*\{swimmerLabel\}/);
    });
  });
});
