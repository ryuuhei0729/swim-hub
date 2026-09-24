// =============================================================================
// RelayRankingList.legStyleLabel.test.tsx
// レグの泳法ラベルが **公式略称 (`practice.styleAbbrev.*`)** 由来であることを
// **非 ja ロケールで**固定する (QA Sprint Contract Phase B / 第3弾)
// =============================================================================
//
// 対象: apps/mobile/components/teams/rankings/RelayRankingList.tsx の `legStyleLabel`
//
// 【なぜ専用ファイルが必要か】
//   `./TeamRelayRankings.test.tsx` の
//       expect(screen.getAllByText(jaMessages.practice.styleAbbrev.Fr)).toHaveLength(4)
//   は **ja では退行を検出できない**。実測 (2026-09-08):
//       ja: practice.styles.Fr === practice.styleAbbrev.Fr === "自由形"
//   なので `styleAbbrev` → `styles` にキーを戻しても文字列が変わらず緑のまま通る。
//   さらに `apps/mobile/vitest.setup.ts` の react-i18next モックは **ja.json 固定**で
//   解決するため、あちらのファイル内でロケールを変えて区別することもできない。
//
//   このファイルは **react-i18next のモックをファイル単位で上書きし、
//   ロケールを en / de / ja に切り替えられるようにする**。en / de では
//       styleAbbrev: Fr / Ba / Br / Fly   (2〜3 文字)
//       styles:      Freestyle / Backstroke / Breaststroke / Butterfly
//       styles(de):  Freistil / Rücken / Brust / Schmetterling
//   と値が明確に分かれるので、**どちらのキー由来かを文字列で判別できる**。
//
// 【なぜ略称なのか】(App Dev の実装判断。QA は妥当と判断し観点として固定する)
//   `legStyleCol` は `width: 64` 固定 + `flexShrink: 0` + `numberOfLines={1}`。
//   RN には表の列を揃える仕組みが無いので、泳法列を自動幅にすると見出し (「種目」) と
//   本文で幅が変わり列がずれる。正式名を使うと en `Breaststroke` (12字) /
//   de `Schmetterling` (13字) が 64dp に収まらず省略される
//   (fontSize 12 の実測見積で 80〜87dp)。
//   同じ用途の `components/profile/BestTimesTable.tsx` /
//   `components/teams/member-detail/BestTimesTable.tsx` も同じキーを引いており、
//   CLAUDE.md「種目名は公式略称に準拠」にも沿う。
//
// 🚨 **「64dp に収まる」ことはこのテストでは検証していない。**
//    jsdom はレイアウトを計算しないので幅の assert は原理的に不可能
//    (`getBoundingClientRect()` は常に 0 を返す)。ここで固定するのは
//    **文字列がどちらのキー由来か**だけである。
//    実際に省略されないかどうかは **Android / iOS 実機での目視確認が必要**
//    (第3弾時点では未実施。QA レポートで残債務として申し送り済み)。
//
// Sprint Contract 検証観点:
//   [V-LS-01] en では略称 (`Fr`/`Ba`/`Br`/`Fly`) が出る。
//             正式名 (`Freestyle`/`Breaststroke`/…) はどこにも出ない (否定形)
//   [V-LS-02] de でも同様。特に `Schmetterling` が出ない
//   [V-LS-03] ja では両キーの文字列が同一なので**区別できない**ことを明示的に固定する
//             (このロケールで緑になっても保証にならない、という事実自体をテストにする)
//   [V-LS-04] メドレーリレーの 4 レグで 4 種の泳法すべてが略称で出る
//   [V-LS-05] `styleAbbrev` が 5 ロケールすべてに 5 キー揃っている
//   [V-LS-06] ソース実測: `RelayRankingList.tsx` は `practice.styleAbbrev.` を読み、
//             `practice.styles.` を読んでいない (否定形)
//   [V-LS-07] 正規化できない `styles.style` は生の文字列をそのまま出す
//             (`as SwimStyle` のキャストで検証を迂回していない)
//
// ⚠️ 否定形の assert に `body.textContent.includes()` を使ってはいけない (QA が実際に踏んだ)。
//    en の種目名は `relay.eventLabel` の補間で「100m×4 Freestyle relay」になり、
//    **`relay.kind.free` = "Freestyle relay" が正式名 "Freestyle" を部分文字列として含む**。
//    そのため「正式名が出ていない」を includes で見ると種目名に反応して常に赤くなる。
//    テキストノード単位の**完全一致** (`queryAllByText(文字列)` の既定挙動) で見る。

import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import jaMessages from "../../../../../shared/messages/ja.json";
import enMessages from "../../../../../shared/messages/en.json";
import deMessages from "../../../../../shared/messages/de.json";
import koMessages from "../../../../../shared/messages/ko.json";
import zhMessages from "../../../../../shared/messages/zh.json";

// ---------------------------------------------------------------------------
// react-i18next をファイル単位で上書きする。
// `apps/mobile/vitest.setup.ts` の ja 固定モックより **こちらが優先**される。
// `mocks.locale.current` を書き換えるとその後のレンダーで解決先が変わる。
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({ locale: { current: "ja" as "ja" | "en" | "de" } }));

vi.mock("react-i18next", async () => {
  const bundles = {
    ja: (await import("../../../../../shared/messages/ja.json")).default,
    en: (await import("../../../../../shared/messages/en.json")).default,
    de: (await import("../../../../../shared/messages/de.json")).default,
  } as Record<string, unknown>;

  const resolve = (locale: string, key: string): string | undefined => {
    let cur: unknown = bundles[locale];
    for (const part of key.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return typeof cur === "string" ? cur : undefined;
  };

  const t = (key: string, options?: Record<string, unknown>): string => {
    const raw = resolve(mocks.locale.current, key);
    if (raw === undefined) return key;
    if (!options || Object.keys(options).length === 0) return raw;
    return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
      name in options ? String(options[name]) : `{${name}}`,
    );
  };

  return {
    useTranslation: () => ({
      t,
      i18n: { language: mocks.locale.current, changeLanguage: vi.fn(async () => undefined) },
    }),
    Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
    I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
    initReactI18next: { type: "3rdParty", init: () => {} },
  };
});

import { RelayRankingList } from "../RelayRankingList";
import type { TeamRelayRankingRow } from "@apps/shared/types";

// ---------------------------------------------------------------------------
// fixture
//   styles.id: Fr 100=3 / Ba 100=14 / Br 100=10 / Fly 100=18
//   `styles.style` は canonical なタイトルケース ("Fr"/"Ba"/"Br"/"Fly")
// ---------------------------------------------------------------------------
function leg(overrides: Partial<TeamRelayRankingRow["legs"][number]>) {
  return {
    legId: "leg-petrel-x",
    legIndex: 0,
    userId: "usr-petrel-x",
    displayName: "アルファ",
    styleId: 3,
    style: "Fr",
    legTime: 53.4,
    reactionTime: null,
    ...overrides,
  };
}

/** メドレーリレー: 背 → 平 → バタ → 自 の 4 レグ (4 種の泳法が全部出る) */
function medleyRow(): TeamRelayRankingRow {
  return {
    relayRecordId: "rr-petrel-medley",
    relayKind: "medley",
    legDistance: 100,
    legCount: 4,
    poolType: 1,
    genderCategory: "male",
    totalTime: 214.55,
    competitionId: "cmp-petrel-spring",
    competitionTitle: "MeetPrimary",
    competitionDate: "2026-05-03",
    relayCreatedAt: "2026-05-04T09:15:00+09:00",
    rank: 1,
    legs: [
      leg({ legId: "leg-back", legIndex: 0, styleId: 14, style: "Ba", legTime: 53.4 }),
      leg({ legId: "leg-breast", legIndex: 1, styleId: 10, style: "Br", legTime: 54.2 }),
      leg({ legId: "leg-fly", legIndex: 2, styleId: 18, style: "Fly", legTime: 53.55 }),
      leg({ legId: "leg-free", legIndex: 3, styleId: 3, style: "Fr", legTime: 53.4 }),
    ],
  };
}

/** フリーリレー: 4 レグすべて自由形 */
function freeRow(): TeamRelayRankingRow {
  return {
    ...medleyRow(),
    relayRecordId: "rr-petrel-free",
    relayKind: "free",
    legs: [0, 1, 2, 3].map((index) =>
      leg({ legId: `leg-free-${index}`, legIndex: index, styleId: 3, style: "Fr" }),
    ),
  };
}

function renderList(rows: TeamRelayRankingRow[]) {
  return render(<RelayRankingList rows={rows} emptyVariant="noMatch" />);
}

/** 行を展開してレグを描画させる (既定は折りたたみ) */
function expandFirstRow(locale: "ja" | "en" | "de") {
  const label =
    locale === "ja"
      ? jaMessages.teams.ranking.relay.expand
      : locale === "en"
        ? enMessages.teams.ranking.relay.expand
        : deMessages.teams.ranking.relay.expand;
  const button = screen.getAllByRole("button").find((node) => node.textContent === label);
  if (!button) throw new Error(`展開ボタンが見つからない (locale=${locale}, label="${label}")`);
  // ⚠️ 素の `button.click()` では React の state 更新が act() の外で起きて
  //    再レンダーが反映されない。fireEvent を使う
  fireEvent.click(button);
}

beforeEach(() => {
  mocks.locale.current = "ja";
});

describe("[V-LS-01] en では公式略称が出て正式名は出ない", () => {
  it("フリーリレーの 4 レグに 'Fr' が出て 'Freestyle' はどこにも出ない", () => {
    mocks.locale.current = "en";
    renderList([freeRow()]);
    expandFirstRow("en");

    expect(screen.getAllByText(enMessages.practice.styleAbbrev.Fr)).toHaveLength(4);

    // 🚨 キーを practice.styles に戻すとここが赤になる (これが本命の assert)。
    //    完全一致で見る: 種目名「100m×4 Freestyle relay」は "Freestyle" を
    //    部分文字列として含むので includes では判定できない
    expect(screen.queryAllByText(enMessages.practice.styles.Fr)).toHaveLength(0); // "Freestyle"
  });

  it("メドレーリレーの 4 レグが Ba / Br / Fly / Fr の略称で出る", () => {
    mocks.locale.current = "en";
    renderList([medleyRow()]);
    expandFirstRow("en");

    for (const code of ["Ba", "Br", "Fly", "Fr"] as const) {
      expect(screen.getByText(enMessages.practice.styleAbbrev[code]), `${code} の略称が無い`).toBeTruthy();
    }
  });

  it("正式名 (Backstroke / Breaststroke / Butterfly / Freestyle) が1つも出ない (否定形)", () => {
    mocks.locale.current = "en";
    renderList([medleyRow()]);
    expandFirstRow("en");

    const leaked = (["Fr", "Ba", "Br", "Fly"] as const)
      .map((code) => enMessages.practice.styles[code])
      .filter((full) => screen.queryAllByText(full).length > 0);

    expect(leaked, `正式名が描画されている: ${leaked.join(", ")}`).toEqual([]);
  });
});

describe("[V-LS-02] de でも公式略称が出て正式名は出ない", () => {
  it("メドレーリレーの 4 レグが略称で出る", () => {
    mocks.locale.current = "de";
    renderList([medleyRow()]);
    expandFirstRow("de");

    for (const code of ["Ba", "Br", "Fly", "Fr"] as const) {
      expect(screen.getByText(deMessages.practice.styleAbbrev[code]), `${code} の略称が無い`).toBeTruthy();
    }
  });

  it("最長の正式名 'Schmetterling' (13 文字) が出ない (64dp 固定列に収まらない値)", () => {
    mocks.locale.current = "de";
    renderList([medleyRow()]);
    expandFirstRow("de");

    // de も同様に完全一致で見る (`relay.kind.free` = "Freistilstaffel" が
    //  正式名 "Freistil" を部分文字列として含む)
    expect(screen.queryAllByText(deMessages.practice.styles.Fly)).toHaveLength(0); // "Schmetterling"
    expect(screen.queryAllByText(deMessages.practice.styles.Fr)).toHaveLength(0); // "Freistil"
  });
});

describe("[V-LS-03] ja では2つのキーを区別できない (この事実自体を固定する)", () => {
  it("ja の practice.styles.* と practice.styleAbbrev.* は4種すべて同一文字列である", () => {
    // 同一である限り、ja のテストがいくら緑でもキーの差し替えは検出できない。
    // 将来 ja の略称が短縮された (例: "自由") らこの assert が落ちるので、
    // そのときは ja でも [V-LS-01] 相当の否定形 assert を書けるようになる。
    for (const code of ["Fr", "Ba", "Br", "Fly"] as const) {
      expect(jaMessages.practice.styleAbbrev[code]).toBe(jaMessages.practice.styles[code]);
    }
  });

  it("ja でもレグの泳法ラベル自体は 4 件描画される", () => {
    mocks.locale.current = "ja";
    renderList([freeRow()]);
    expandFirstRow("ja");

    expect(screen.getAllByText(jaMessages.practice.styleAbbrev.Fr)).toHaveLength(4);
  });
});

describe("[V-LS-05] practice.styleAbbrev が 5 ロケールすべてに揃っている", () => {
  const LOCALES = {
    ja: jaMessages,
    en: enMessages,
    de: deMessages,
    ko: koMessages,
    zh: zhMessages,
  } as const;

  it.each(Object.keys(LOCALES) as Array<keyof typeof LOCALES>)(
    "%s.json の practice.styleAbbrev に 5 キーが非空で存在する",
    (locale) => {
      const abbrev = LOCALES[locale].practice.styleAbbrev as Record<string, string>;
      for (const code of ["Fr", "Ba", "Br", "Fly", "IM"] as const) {
        expect(typeof abbrev[code], `${locale}.${code}`).toBe("string");
        expect((abbrev[code] ?? "").trim().length, `${locale}.${code}`).toBeGreaterThan(0);
      }
    },
  );

  it("en / de / ko / zh の略称は 4 文字以下である (固定幅 64dp 列に入る前提)", () => {
    // ja だけは正式名と同一 (最長「バタフライ」5 CJK) で、これは意図的な例外。
    // ⚠️ 文字数は幅の代理指標にすぎない。実際の描画幅は実機で確認すること
    for (const locale of ["en", "de", "ko", "zh"] as const) {
      const abbrev = LOCALES[locale].practice.styleAbbrev as Record<string, string>;
      for (const code of ["Fr", "Ba", "Br", "Fly"] as const) {
        expect((abbrev[code] ?? "").length, `${locale}.${code}="${abbrev[code]}"`).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("[V-LS-06] ソース実測: styleAbbrev を読み styles を読んでいない", () => {
  const SOURCE = readFileSync(
    path.resolve(__dirname, "../RelayRankingList.tsx"),
    "utf8",
  );

  /** 行コメントを落としたコード部分 (docstring での言及で誤検出しない) */
  const code = SOURCE.split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  it("practice.styleAbbrev. を読んでいる", () => {
    expect(code).toContain("practice.styleAbbrev.");
  });

  it("practice.styles. を読んでいない (正式名に戻していない)", () => {
    expect(code).not.toContain("practice.styles.");
  });

  it("泳法列は固定幅 + flexShrink:0 のまま (縮む余地を持つのは泳者名の列だけ)", () => {
    // 泳法・タイム列が縮むと情報として壊れる。列がずれない代わりに幅が固定なので、
    // 略称を使うことが前提条件になっている
    expect(code).toMatch(/legStyleCol:\s*\{[^}]*width:\s*64/);
    expect(code).toMatch(/legStyleCol:\s*\{[^}]*flexShrink:\s*0/);
    expect(code).toMatch(/legTimeCol:\s*\{[^}]*flexShrink:\s*0/);
  });
});

describe("[V-LS-07] 正規化できない styles.style は生の文字列をそのまま出す", () => {
  it("未知の泳法コードでもレグ行を落とさず値をそのまま描画する", () => {
    // `toStyleCode()` が null を返す値。`as SwimStyle` のキャストで検証を
    // 迂回していれば `practice.styleAbbrev.undefined` のようなキー文字列が出る
    mocks.locale.current = "en";
    const row: TeamRelayRankingRow = {
      ...freeRow(),
      legs: [
        leg({ legId: "leg-unknown", legIndex: 0, style: "QA_UNKNOWN_STROKE" }),
        leg({ legId: "leg-free-1", legIndex: 1 }),
        leg({ legId: "leg-free-2", legIndex: 2 }),
        leg({ legId: "leg-free-3", legIndex: 3 }),
      ],
    };
    renderList([row]);
    expandFirstRow("en");

    expect(screen.getByText("QA_UNKNOWN_STROKE")).toBeTruthy();
    // 未解決の翻訳キーが露出していない (これは部分一致で見るのが正しい:
    //  "practice.styleAbbrev.undefined" のような文字列を拾いたい)
    expect(document.body.textContent ?? "").not.toContain("practice.styleAbbrev");
    // 残り 3 レグは通常どおり略称
    expect(screen.getAllByText(enMessages.practice.styleAbbrev.Fr)).toHaveLength(3);
  });

  it("旧ケーシング (小文字) の style でも略称に正規化される", () => {
    // DB に旧 canonical (小文字) の行が残っていても拾えること
    mocks.locale.current = "en";
    const row: TeamRelayRankingRow = {
      ...freeRow(),
      legs: [0, 1, 2, 3].map((index) =>
        leg({ legId: `leg-lower-${index}`, legIndex: index, style: "fr" }),
      ),
    };
    renderList([row]);
    expandFirstRow("en");

    expect(screen.getAllByText(enMessages.practice.styleAbbrev.Fr)).toHaveLength(4);
    // 小文字の生値がそのまま描画されていない (完全一致)
    expect(screen.queryAllByText("fr")).toHaveLength(0);
  });
});
