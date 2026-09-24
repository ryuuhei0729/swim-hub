// =============================================================================
// messages-team-ranking.test.ts — チームランキングの i18n キー網羅 (QA Phase B)
// =============================================================================
//
// なぜ専用ファイルが必要か:
//   `apps/web/__tests__/i18n/messages-teams-admin.test.ts` は
//   `test.each(flattenKeys(ja.teamsAdmin))` で teamsAdmin 名前空間を動的に網羅するため、
//   `teamsAdmin.tabs.rankings` は実装追加と同時に自動でカバーされた (テスト数 +2)。
//   一方 **`teams` 名前空間には同等の動的網羅が無い**。
//   `teams.ranking.*` と `teams.tabs.rankings` / `teams.mobile.tabRankings` は
//   `messages-coverage.test.ts` の「ja と他ロケールのキー構造一致」でしか守られておらず、
//   これは **5ロケール全部から同時に消せば緑のまま通る**。
//   このファイルが「キーそのものが存在すること」の唯一の担保である。
//
// 第3弾 (ランキング UI 改修) での更新:
//   ユーザー依頼で <select> をラジオボタン化し、**「男女すべて」を廃止**した
//   (水泳は性別で分かれて実施されるので男女混在の順位表に競技上の意味が無い)。
//   これに伴い:
//     - `teams.ranking.gender.all` を削除 (個人 25 → 24 キー)
//     - `teams.ranking.relay.genderCategory.all` を削除
//     - `teams.ranking.relay.legDistanceOption` を新設 (relay 31 キーのまま)
//   → 総数は **55 キー** (24 + 31)。
//   ⚠️ 実測値は 55 である (PM の指示書は 54 だったが、追加された
//      `legDistanceOption` の1件が引き算だけで数えられていた。5ロケール全部を
//      flatten して数え直した結果が 55)。
//
// 第3弾 (リレーのチーム記録化) での更新:
//   `teams.ranking.*` の厳密一致 pin は当初「ちょうど 25 キー」だった。
//   リレーランキングは**ランキングタブ内のサブビュー**なので `teams.ranking.relay.*`
//   という配置が意味的に正しく、pin を避けるために名前空間を動かすのは逆である。
//   よって pin 側を意図的な拡張 (relay 31 キー) に合わせて更新した。
//   pin の役目は「うっかりキーが増減したこと」の検出であり、
//   意図的な増減はここを一緒に更新することでレビュー可能になる。
//
// Sprint Contract 検証観点:
//   [V-R1] teams.ranking.* の 24 + 31 = 55 キーが 5 ロケールすべてに存在する
//          (件数の厳密一致つき)
//   [V-R2] タブ名が 3 面 (web 一般 / web 管理者 / mobile) すべてに存在する。
//          PM 裁定「rankings タブは3面すべてに出す」の i18n 側の担保
//   [V-R3] 全キーの値が空でない文字列である (キーだけ作って中身が無い状態を弾く)
//   [V-R4] en / de に日本語が混入していない。zh / ko にひらがな・カタカナが無い
//   [V-R5] ICU プレースホルダーが 5 ロケールで対称 (resultCount の {count} /
//          relay.eventLabel の {distance}{legCount}{kind} / relay.legLabel の {num} /
//          relay.legDistanceOption の {distance}{legCount})
//   [V-R8] 廃止したキー (`gender.all` / `relay.genderCategory.all`) が復活していない。
//          `legDistanceOption` と `eventLabel` が別キーとして共存している
//   [V-R6] scope.allCompetitionsNote (他チーム大会の記録も含む旨の注意書き) が
//          どのロケールでも省略されていない — 意図的な露出拡大の告知なので必須
//   [V-R7] リレー側が**再利用すべきキーを再利用している** (否定形の assert)。
//          水路 / 順位 / 泳法名 / 大会なし の文言を relay 名前空間に新設していないこと
//   [V-39] TeamRecords.tsx は削除したが teams.records.* のキーは残す (PM 裁定)。
//          「使っていないから消す」を防ぐ

import { describe, expect, it } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import koMessages from "../../messages/ko.json";
import zhMessages from "../../messages/zh.json";

type Messages = Record<string, unknown>;

const LOCALES = ["ja", "en", "de", "ko", "zh"] as const;
type Locale = (typeof LOCALES)[number];

const MESSAGES: Record<Locale, Messages> = {
  ja: jaMessages as unknown as Messages,
  en: enMessages as unknown as Messages,
  de: deMessages as unknown as Messages,
  ko: koMessages as unknown as Messages,
  zh: zhMessages as unknown as Messages,
};

function flattenKeys(obj: Messages, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Messages, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getValue(obj: Messages, dottedKey: string): unknown {
  let current: unknown = obj;
  for (const part of dottedKey.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    if (!(part in (current as Messages))) return undefined;
    current = (current as Messages)[part];
  }
  return current;
}

/** ひらがな / カタカナ / CJK 漢字 */
const JA_REGEX = /[ぁ-んァ-ヶー一-龯]/;
/** ひらがな / カタカナのみ (漢字は zh/ko で正当) */
const JA_KANA_ONLY_REGEX = /[ぁ-んァ-ヶー]/;

// ---------------------------------------------------------------------------
// 期待キー一覧 (Sprint Contract に基づく手書き。実装の JSON からは導出しない)
// ---------------------------------------------------------------------------
const RANKING_KEYS = [
  // 見出し
  "teams.ranking.title",
  // 絞り込みラベル (種目 / 距離 / 水路 / 性別 / 対象大会)
  "teams.ranking.filter.style",
  "teams.ranking.filter.distance",
  "teams.ranking.filter.poolType",
  "teams.ranking.filter.gender",
  "teams.ranking.filter.scope",
  // 性別フィルタの選択肢。**「男女すべて」は持たない** (ユーザー依頼で廃止)。
  // 水泳は性別で分かれて実施されるので男女混在の順位表に競技上の意味が無い。
  // ja は競技表記に合わせて「男子 / 女子」(「男性 / 女性」から変更)
  "teams.ranking.gender.male",
  "teams.ranking.gender.female",
  // 対象大会スコープの選択肢 + 露出拡大の注意書き
  "teams.ranking.scope.teamCompetitions",
  "teams.ranking.scope.allCompetitions",
  "teams.ranking.scope.allCompetitionsNote",
  // 表の列見出し (順位列は teams.waPointsCompare.rankLabel を流用するのでここには無い)
  "teams.ranking.col.name",
  "teams.ranking.col.time",
  "teams.ranking.col.competition",
  "teams.ranking.col.date",
  // 空状態 2種 (条件に一致なし / チームに記録が無い)
  "teams.ranking.empty.noMatchTitle",
  "teams.ranking.empty.noMatchBody",
  "teams.ranking.empty.noRecordsTitle",
  "teams.ranking.empty.noRecordsBody",
  // ローディング / エラー / 再試行 / さらに表示 / 件数
  "teams.ranking.error",
  "teams.ranking.retry",
  // 個人種目だけが使えない状態の通知 (種目統合で追加)。
  // ⚠️ **`fetchFailed` と `empty` を1キーに束ねないこと。** 取得失敗は再試行に
  //    意味があるが、マスターが空 (または全行が canonical 化できない) 状態は
  //    再試行しても同じ結果になるので、同じ文言で再試行ボタンを出すと
  //    直らないボタンを押させ続ける。文言もユーザーの次の行動が違う
  "teams.ranking.individualUnavailable.fetchFailed",
  "teams.ranking.individualUnavailable.empty",
  "teams.ranking.loading",
  "teams.ranking.showMore",
  "teams.ranking.resultCount",
  // ---------------------------------------------------------------------------
  // 第2弾 (年度別ランキング + 全レースモード) で追加された 8 キー
  //
  // ⚠️ **`period.*` は個人種目専用の名前空間ではない。** `period.fiscalYearNote`
  //    はリレーでも出す注意書きなので、`relay.*` にも `scope` 系にも入れない。
  //    (`aggregation` はリレー RPC に引数が無いので個人限定だが、キーの置き場所は
  //     `period` と同じ階層で揃えてある)
  // ⚠️ `period.fiscalYear` は選択肢のラベル (`{year}年度`)、
  //    `period.fiscalYearNote` は「年度を選ぶと一括登録記録が落ちる」の説明で**別キー**。
  //    片方に寄せると「選択肢に説明文が出る」か「説明が消える」のどちらかになる。
  // ---------------------------------------------------------------------------
  "teams.ranking.filter.period",
  "teams.ranking.filter.aggregation",
  "teams.ranking.period.allTime",
  "teams.ranking.period.fiscalYear",
  // 「2023年度以前」= 下端の無いバケット。単一整数の `p_fiscal_year` では
  // 表現できないので migration 20260909000000 が `p_fiscal_year_or_earlier`
  // を足した。**`period.fiscalYear` とは別キー** — 前者は「2026年度」、
  // 後者は「2023年度以前」で、どちらも `{year}` 補間を持つ
  "teams.ranking.period.fiscalYearOrEarlier",
  "teams.ranking.period.fiscalYearNote",
  "teams.ranking.aggregation.personalBest",
  "teams.ranking.aggregation.allRaces",
  // 取得上限に達したことの明示 (`{limit}` 補間あり)
  "teams.ranking.truncatedNote",
] as const;

// ---------------------------------------------------------------------------
// 第3弾: リレーランキングのキー一覧 (Sprint Contract に基づく手書き)
//
// ⚠️ この配列は `ja.json` の `teams.ranking.relay` から**導出していない**。
//    実装 JSON を flatten して期待値にすると「JSON にあるキーが JSON にある」
//    というトートロジーになり、キーの増減を検出できなくなる。
//
// リレー側が**持たない**キーがあることに注意 (再利用が前提):
//   - 水路のラベル → `common.poolTypeShort` / `common.poolTypeLong`
//   - 順位列の見出し → `teams.waPointsCompare.rankLabel`
//   - レグの泳法名 → `practice.styles.*` (タイトルケース)
//   - 大会に紐づかない行の文言 → `common.none`
//   - loading / retry / showMore / resultCount → 個人種目と同じ `teams.ranking.*`
// これらを relay 名前空間に新設していないことは [V-R7] で否定形に assert する。
// ---------------------------------------------------------------------------
const RELAY_KEYS = [
  // 🚨 **廃止された4キーはここに戻さないこと** (種目軸統合で消えた)。
  //   - `relay.view.individual` / `relay.view.relay`
  //     … 「個人種目 / リレー」のビュー切替トグルが無くなった。種目ラジオの
  //        7択 (個人5 + リレー2) の選択そのものがモードを決めるため、
  //        トグルを残すと「個人種目を選んでいるのにリレー表示」という
  //        矛盾した組み合わせが表現可能になる
  //   - `relay.filter.kind`
  //     … リレーの種類は種目ラジオ (`relay.kind.*` のラベル) で選ぶので、
  //        種類専用の絞り込みグループが無くなった。`relay.kind.free` /
  //        `relay.kind.medley` は**選択肢のラベルとして現役**である
  //   - `relay.filter.legDistance`
  //     … 距離グループが個人/リレーで1つに統合され `filter.distance` を共用。
  //        5ロケール全部で `filter.distance` と同一文言だったので、
  //        モードでキーを分けると「同じ文言の別キーをモードで引く隠れた分岐」
  //        になっていた
  //
  // ⚠️ `relay.legDistanceOption` ("{distance}m × {legCount}") は**現役**。
  //    廃止された `relay.filter.legDistance` (グループの legend) と混同しないこと。
  //    前者は選択肢のラベルで、後者は項目名だった
  //
  // 絞り込みラベル: 性別区分だけがリレー固有 (個人は「性別」で語彙が違う)。
  // 水路・距離・種目は個人種目と共用する
  "teams.ranking.relay.filter.genderCategory",
  // リレーの種類の選択肢
  "teams.ranking.relay.kind.free",
  "teams.ranking.relay.kind.medley",
  // 性別区分フィルタの選択肢。**「すべて」は持たない** (個人種目と同じ理由)。
  // リレーだけは mixed (混合リレー) が実在するので3択になる
  "teams.ranking.relay.genderCategory.male",
  "teams.ranking.relay.genderCategory.female",
  "teams.ranking.relay.genderCategory.mixed",
  // 表の列見出し (順位列は teams.waPointsCompare.rankLabel を流用するのでここには無い)
  "teams.ranking.relay.col.event",
  "teams.ranking.relay.col.time",
  "teams.ranking.relay.col.competition",
  "teams.ranking.relay.col.date",
  "teams.ranking.relay.col.legs",
  // 種目名 / 第N泳者ラベル / 距離の選択肢ラベル (いずれも補間あり)。
  // ⚠️ `legDistanceOption` ("{distance}m × {legCount}") と
  //    `eventLabel` ("{distance}m×{legCount} {kind}") は**別キー**である。
  //    前者は絞り込みの選択肢 (種類は別のラジオで選ぶので kind を含まない)、
  //    後者は表の種目列 (行ごとに種類が違うので kind を含む)。
  //    片方に寄せると「距離の選択肢に種類が出る」「種目列から種類が消える」
  //    のどちらかが起きる
  "teams.ranking.relay.eventLabel",
  "teams.ranking.relay.legDistanceOption",
  "teams.ranking.relay.legLabel",
  // 行展開時のレグ表の見出し
  "teams.ranking.relay.legHeader.swimmer",
  "teams.ranking.relay.legHeader.style",
  "teams.ranking.relay.legHeader.legTime",
  "teams.ranking.relay.legHeader.cumulative",
  // 行の開閉ボタン (aria-label)
  "teams.ranking.relay.expand",
  "teams.ranking.relay.collapse",
  // 退会した泳者 (legs.user_id は ON DELETE SET NULL で null になる)
  "teams.ranking.relay.retiredMember",
  // レグが1件も無いリレー行 (backfill 由来など)
  "teams.ranking.relay.noLegs",
  // 空状態 2種 (条件に一致なし / チームにリレー記録が無い)
  "teams.ranking.relay.empty.noMatchTitle",
  "teams.ranking.relay.empty.noMatchBody",
  "teams.ranking.relay.empty.noRecordsTitle",
  "teams.ranking.relay.empty.noRecordsBody",
  // エラー (loading / retry は個人種目と共用)
  "teams.ranking.relay.error",
] as const;

/** `teams.ranking.*` 配下の全期待キー (個人種目 35 + リレー 27 = 62)。 */
const ALL_RANKING_KEYS = [...RANKING_KEYS, ...RELAY_KEYS] as const;

/** PM 裁定: rankings タブは3面すべてに出す。その3面のラベルキー */
const TAB_LABEL_KEYS = [
  "teams.tabs.rankings", // web 一般 (TeamTabs.tsx)
  "teamsAdmin.tabs.rankings", // web 管理者 (TeamAdminTabs.tsx)
  "teams.mobile.tabRankings", // mobile (components/teams/TeamTabs.tsx)
] as const;

describe("[V-R1] teams.ranking.* が 5 ロケールすべてに存在する", () => {
  it.each(LOCALES)("%s.json に 個人種目 35 キーすべてが存在する", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const missing = RANKING_KEYS.filter((key) => !keys.has(key));

    expect(missing, `${locale}.json に欠損:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it.each(LOCALES)("%s.json に リレー 27 キーすべてが存在する", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const missing = RELAY_KEYS.filter((key) => !keys.has(key));

    expect(missing, `${locale}.json に欠損:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("期待キー一覧そのものに重複が無い (手書き配列の写し間違いを検出)", () => {
    expect(new Set(ALL_RANKING_KEYS).size).toBe(ALL_RANKING_KEYS.length);
    // 個人種目 34 + リレー 27。数を式ではなくリテラルで書いて配列と二重に固定する
    expect(RANKING_KEYS.length).toBe(35);
    expect(RELAY_KEYS.length).toBe(27);
    expect(ALL_RANKING_KEYS.length).toBe(62);
  });

  it.each(LOCALES)(
    "%s.json の teams.ranking.* がちょうど 62 キー (余剰キー = 未使用の死んだ翻訳を検出)",
    (locale) => {
      const rankingKeys = flattenKeys(MESSAGES[locale]).filter((key) =>
        key.startsWith("teams.ranking."),
      );

      // 「teams.ranking.title」も含めた総数。Contract で合意した 26 + 27 キーと
      // 厳密一致させる。**廃止4キーが残っていればここが余剰として落ちる**
      // (第2弾で 53 → 61 → 62。追加9キーの内訳は RANKING_KEYS の末尾)
      expect(rankingKeys.sort()).toEqual([...ALL_RANKING_KEYS].sort());
    },
  );
});

describe("[V-R2] rankings タブのラベルが 3 面すべてに存在する", () => {
  const combos = LOCALES.flatMap((locale) => TAB_LABEL_KEYS.map((key) => [locale, key] as const));

  it.each(combos)('%s.json に "%s" が存在する', (locale, key) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    expect(keys.has(key), `${locale}.json に ${key} が無い`).toBe(true);
  });

  it("ja では 3 面のラベルが同一文言である (面によって呼び名が変わらない)", () => {
    const values = TAB_LABEL_KEYS.map((key) => getValue(MESSAGES.ja, key));
    expect(new Set(values).size, `3面の文言が食い違っている: ${JSON.stringify(values)}`).toBe(1);
  });
});

describe("[V-R3] 値が空でない", () => {
  const combos = LOCALES.flatMap((locale) =>
    [...ALL_RANKING_KEYS, ...TAB_LABEL_KEYS].map((key) => [locale, key] as const),
  );

  it.each(combos)('%s.json の "%s" が空でない文字列である', (locale, key) => {
    const value = getValue(MESSAGES[locale], key);

    expect(typeof value, `${locale}.json ${key} が文字列でない`).toBe("string");
    expect(String(value).trim().length, `${locale}.json ${key} が空`).toBeGreaterThan(0);
  });
});

describe("[V-R4] 翻訳漏れ (日本語の残存) を検出する", () => {
  const enLikeCombos = (["en", "de"] as const).flatMap((locale) =>
    [...ALL_RANKING_KEYS, ...TAB_LABEL_KEYS].map((key) => [locale, key] as const),
  );

  it.each(enLikeCombos)('%s.json の "%s" に日本語が含まれない', (locale, key) => {
    const value = getValue(MESSAGES[locale], key);
    expect(
      JA_REGEX.test(String(value ?? "")),
      `${locale}.json の ${key} が未翻訳のまま (値: ${String(value)})`,
    ).toBe(false);
  });

  const cjkCombos = (["zh", "ko"] as const).flatMap((locale) =>
    [...ALL_RANKING_KEYS, ...TAB_LABEL_KEYS].map((key) => [locale, key] as const),
  );

  it.each(cjkCombos)(
    '%s.json の "%s" にひらがな・カタカナが含まれない (漢字は正当)',
    (locale, key) => {
      const value = getValue(MESSAGES[locale], key);
      expect(
        JA_KANA_ONLY_REGEX.test(String(value ?? "")),
        `${locale}.json の ${key} が未翻訳のまま (値: ${String(value)})`,
      ).toBe(false);
    },
  );
});

describe("[V-R5] ICU プレースホルダーが 5 ロケールで対称", () => {
  /** 値から `{name}` 形式の変数名を昇順で抽出する (`{{name}}` も一旦拾う)。 */
  function extractPlaceholders(value: string): string[] {
    const names = [...value.matchAll(/\{+([a-zA-Z][a-zA-Z0-9]*)\}+/g)].map((m) => m[1] ?? "");
    return [...new Set(names)].sort();
  }

  it.each(LOCALES)("%s.json の teams.ranking.resultCount が {count} を持つ", (locale) => {
    const value = String(getValue(MESSAGES[locale], "teams.ranking.resultCount") ?? "");

    // next-intl / react-i18next 共用のため単一波括弧の {count}
    expect(value, `${locale}: ${value}`).toContain("{count}");
    // {{count}} (react-i18next 既定形式) が混ざると next-intl 側で literal 表示になる
    expect(value).not.toContain("{{count}}");
  });

  it.each(LOCALES)(
    "%s.json の teams.ranking.relay.eventLabel が {distance} {legCount} {kind} を持つ",
    (locale) => {
      const value = String(getValue(MESSAGES[locale], "teams.ranking.relay.eventLabel") ?? "");

      expect(extractPlaceholders(value), `${locale}: ${value}`).toEqual([
        "distance",
        "kind",
        "legCount",
      ]);
      // 単一波括弧であること。二重波括弧は next-intl では literal 表示になる
      expect(value, `${locale}: ${value}`).not.toMatch(/\{\{/);
    },
  );

  it.each(LOCALES)("%s.json の teams.ranking.relay.legLabel が {num} を持つ", (locale) => {
    const value = String(getValue(MESSAGES[locale], "teams.ranking.relay.legLabel") ?? "");

    expect(extractPlaceholders(value), `${locale}: ${value}`).toEqual(["num"]);
    expect(value, `${locale}: ${value}`).not.toMatch(/\{\{/);
  });

  it.each(LOCALES)(
    "%s.json の teams.ranking.relay.legDistanceOption が {distance} {legCount} を持つ",
    (locale) => {
      const value = String(
        getValue(MESSAGES[locale], "teams.ranking.relay.legDistanceOption") ?? "",
      );

      expect(extractPlaceholders(value), `${locale}: ${value}`).toEqual([
        "distance",
        "legCount",
      ]);
      // ⚠️ `{kind}` を含んではいけない。距離の選択肢に種類が混ざる
      // (種類は別のラジオグループで選ぶ)
      expect(extractPlaceholders(value), `${locale}: ${value}`).not.toContain("kind");
      expect(value, `${locale}: ${value}`).not.toMatch(/\{\{/);
    },
  );

  it("teams.ranking.* のうち補間を持つキーが7つだけである (補間の付け忘れ・付け過ぎを検出)", () => {
    const withPlaceholder = ALL_RANKING_KEYS.filter((key) =>
      /\{[a-zA-Z]/.test(String(getValue(MESSAGES.ja, key) ?? "")),
    );

    // 第2弾で `period.fiscalYear` ({year}) と `truncatedNote` ({limit}) が増えた。
    // ⚠️ `period.fiscalYearNote` は**補間を持たない** (「年度を選ぶと一括登録記録は
    //    含まれません」という固定文で、年度の値を埋め込まない)。ここに混ざったら
    //    説明文に年が入る形へ変わった = 別の設計になったということなので落とす
    expect([...withPlaceholder].sort()).toEqual(
      [
        "teams.ranking.period.fiscalYear",
        "teams.ranking.period.fiscalYearOrEarlier",
        "teams.ranking.relay.eventLabel",
        "teams.ranking.relay.legDistanceOption",
        "teams.ranking.relay.legLabel",
        "teams.ranking.resultCount",
        "teams.ranking.truncatedNote",
      ].sort(),
    );
  });

  it.each(LOCALES)("%s.json の teams.ranking.* に二重波括弧が1件も無い", (locale) => {
    const offenders = ALL_RANKING_KEYS.filter((key) =>
      String(getValue(MESSAGES[locale], key) ?? "").includes("{{"),
    );

    expect(offenders, `${locale}.json で react-i18next 形式の二重波括弧`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// [V-R8] 廃止したキーが復活していない / 似たキーを混同していない
//
// ユーザー依頼で「男女すべて」を廃止した。翻訳キーは 5 ロケールから消したので、
// **`messages-coverage.test.ts` の「ja と他ロケールのキー構造一致」では
// 復活を検出できない** (5ロケール同時に足せば構造は一致したまま)。
// ここで否定形に固定する。
// ---------------------------------------------------------------------------
describe("[V-R8] 廃止したキーが復活していない / legDistanceOption と eventLabel は別キー", () => {
  const REMOVED_KEYS = [
    "teams.ranking.gender.all",
    "teams.ranking.relay.genderCategory.all",
  ] as const;

  it.each(LOCALES)("%s.json に廃止した「すべて」のキーが無い", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const revived = REMOVED_KEYS.filter((key) => keys.has(key));

    expect(
      revived,
      `${locale}.json: 廃止した「男女すべて」のキーが復活しています:\n  ${revived.join("\n  ")}`,
    ).toEqual([]);
  });

  it.each(LOCALES)("%s.json の性別フィルタは男子/女子の2択だけである", (locale) => {
    const genderKeys = flattenKeys(MESSAGES[locale]).filter((key) =>
      key.startsWith("teams.ranking.gender."),
    );

    expect(genderKeys.sort()).toEqual([
      "teams.ranking.gender.female",
      "teams.ranking.gender.male",
    ]);
  });

  it.each(LOCALES)("%s.json のリレー性別区分は男子/女子/混合の3択だけである", (locale) => {
    const keys = flattenKeys(MESSAGES[locale]).filter((key) =>
      key.startsWith("teams.ranking.relay.genderCategory."),
    );

    // mixed はリレーにしか存在しない (混合リレーが実在する種目)
    expect(keys.sort()).toEqual([
      "teams.ranking.relay.genderCategory.female",
      "teams.ranking.relay.genderCategory.male",
      "teams.ranking.relay.genderCategory.mixed",
    ]);
  });

  it.each(LOCALES)(
    "%s.json の legDistanceOption と eventLabel は別の文字列である (片方に寄せていない)",
    (locale) => {
      const option = getValue(MESSAGES[locale], "teams.ranking.relay.legDistanceOption");
      const event = getValue(MESSAGES[locale], "teams.ranking.relay.eventLabel");

      expect(typeof option).toBe("string");
      expect(typeof event).toBe("string");
      expect(option, `${locale}: 2つのキーが同じ文言になっている`).not.toBe(event);
    },
  );

  it("ja では個人種目とリレーの性別ラベルが同じ語彙 (男子/女子) で揃っている", () => {
    // 変更前は個人「男性/女性」・リレー「男子/女子」で不統一だった。
    // 水泳の競技表記 (男子100m自由形) に合わせて統一した
    expect(getValue(MESSAGES.ja, "teams.ranking.gender.male")).toBe("男子");
    expect(getValue(MESSAGES.ja, "teams.ranking.gender.female")).toBe("女子");
    expect(getValue(MESSAGES.ja, "teams.ranking.relay.genderCategory.male")).toBe("男子");
    expect(getValue(MESSAGES.ja, "teams.ranking.relay.genderCategory.female")).toBe("女子");
  });

  it("ja の性別ラベルが「男性/女性」に戻っていない (否定形)", () => {
    for (const key of [
      "teams.ranking.gender.male",
      "teams.ranking.gender.female",
      "teams.ranking.relay.genderCategory.male",
      "teams.ranking.relay.genderCategory.female",
    ] as const) {
      expect(String(getValue(MESSAGES.ja, key) ?? ""), key).not.toMatch(/性$/);
    }
  });
});

// ---------------------------------------------------------------------------
// [V-R7] 再利用すべきキーを relay 名前空間に新設していない (否定形の assert)
//
// リレー表は 水路 / 順位 / 泳法名 / 大会なし の4種の文言を既存キーから読む。
// これらを `teams.ranking.relay.*` に複製すると、片方だけ翻訳を直して静かに
// 食い違う (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
// 「再利用元が存在すること」と「複製が存在しないこと」を対で押さえる。
// ---------------------------------------------------------------------------
describe("[V-R7] 水路・順位・泳法名・大会なしの文言は既存キーの再利用である", () => {
  /** 再利用元。ここが消えるとリレー表の文言が落ちるので存在を要求する */
  const REUSED_KEYS = [
    "common.poolTypeShort",
    "common.poolTypeLong",
    "common.none",
    "teams.waPointsCompare.rankLabel",
    "practice.styles.Fr",
    "practice.styles.Ba",
    "practice.styles.Br",
    "practice.styles.Fly",
  ] as const;

  it.each(LOCALES)("%s.json に再利用元のキーが揃っている", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const missing = REUSED_KEYS.filter((key) => !keys.has(key));

    expect(missing, `${locale}.json に再利用元が無い:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  /**
   * relay 名前空間に**存在してはいけない**キー。
   * 上の [V-R1] の厳密一致 pin でも間接的に検出できるが、
   * pin を更新するときに「なぜこれを足してはいけないのか」が読めるよう明示する。
   */
  const FORBIDDEN_RELAY_KEYS = [
    // 水路は common.poolTypeShort / common.poolTypeLong を読む
    "teams.ranking.relay.poolType.short",
    "teams.ranking.relay.poolType.long",
    "teams.ranking.relay.filter.poolType",
    "teams.ranking.relay.col.poolType",
    // 順位は teams.waPointsCompare.rankLabel を読む
    "teams.ranking.relay.col.rank",
    "teams.ranking.relay.rankLabel",
    // レグの泳法名は practice.styles.* を読む
    "teams.ranking.relay.styles.Fr",
    "teams.ranking.relay.styles.Ba",
    "teams.ranking.relay.styles.Br",
    "teams.ranking.relay.styles.Fly",
    "teams.ranking.relay.styleName.fr",
    // 大会に紐づかない行は common.none を読む
    "teams.ranking.relay.noCompetition",
    "teams.ranking.relay.competitionNone",
    // 「すべて」は廃止した (ユーザー依頼)。復活は [V-R8] でも見ているが、
    // 厳密一致 pin を更新するときにここでも気づけるようにする
    "teams.ranking.relay.genderCategory.all",
    // loading / retry / showMore / resultCount は個人種目と共用
    "teams.ranking.relay.loading",
    "teams.ranking.relay.retry",
    "teams.ranking.relay.showMore",
    "teams.ranking.relay.resultCount",
  ] as const;

  it.each(LOCALES)("%s.json の relay 名前空間に再利用可能な文言の複製が無い", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const duplicated = FORBIDDEN_RELAY_KEYS.filter((key) => keys.has(key));

    expect(
      duplicated,
      `${locale}.json: 既存キーを再利用すべき文言が relay 側に複製されています:\n  ${duplicated.join("\n  ")}`,
    ).toEqual([]);
  });

  it("禁止キー一覧が期待キー一覧と衝突していない (テスト自身の自己矛盾を検出)", () => {
    const expected = new Set<string>(ALL_RANKING_KEYS);
    const conflicting = FORBIDDEN_RELAY_KEYS.filter((key) => expected.has(key));

    expect(conflicting).toEqual([]);
  });
});

describe("[V-R6] allCompetitions の露出拡大の注意書きが省略されていない", () => {
  it.each(LOCALES)("%s.json の注意書きが 10 文字以上ある (単語1つで済ませていない)", (locale) => {
    const value = String(getValue(MESSAGES[locale], "teams.ranking.scope.allCompetitionsNote") ?? "");

    // RLS では見えない他チーム大会の記録まで出す旨の告知なので、
    // 「すべて」のような単語だけでは説明として成立しない
    expect(value.trim().length, `${locale}: "${value}"`).toBeGreaterThanOrEqual(10);
  });

  it("scope の選択肢2つと注意書きが互いに異なる文言である", () => {
    const teamScope = getValue(MESSAGES.ja, "teams.ranking.scope.teamCompetitions");
    const allScope = getValue(MESSAGES.ja, "teams.ranking.scope.allCompetitions");
    const note = getValue(MESSAGES.ja, "teams.ranking.scope.allCompetitionsNote");

    expect(new Set([teamScope, allScope, note]).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// [V-39] TeamRecords.tsx 削除後も teams.records.* のキーは残す (PM 裁定)
//
// `apps/web/components/team/TeamRecords.tsx` (264 行のデッドコード) は本スプリントで
// 削除したが、翻訳キーは **意図的に残している**。
// `apps/web/__tests__/i18n/messages-teams.test.ts` の該当 pin (8 キー) を
// 「もう使っていないから」で撤去すると、キーが消えたことに誰も気づけなくなる。
// こちらは 5 ロケール分を守る (あちらは ja/en のみ)。
// ---------------------------------------------------------------------------
describe("[V-39] teams.records.* のキーは TeamRecords.tsx 削除後も残っている", () => {
  const RECORDS_KEYS = [
    "teams.records.title",
    "teams.records.empty",
    "teams.records.error",
    "teams.records.col.style",
    "teams.records.col.distance",
    "teams.records.col.time",
    "teams.records.col.competition",
    "teams.records.col.date",
  ] as const;

  it.each(LOCALES)("%s.json に teams.records.* の 8 キーが残っている", (locale) => {
    const keys = new Set(flattenKeys(MESSAGES[locale]));
    const missing = RECORDS_KEYS.filter((key) => !keys.has(key));

    expect(
      missing,
      `${locale}.json から teams.records.* が消えています (PM 裁定でキーは残す):\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("teams.records.* と teams.ranking.* は別の名前空間である (統合されていない)", () => {
    const keys = new Set(flattenKeys(MESSAGES.ja));
    expect(keys.has("teams.records.title")).toBe(true);
    expect(keys.has("teams.ranking.title")).toBe(true);
    expect(getValue(MESSAGES.ja, "teams.records.title")).not.toBe(
      getValue(MESSAGES.ja, "teams.ranking.title"),
    );
  });
});

/**
 * [V-R9] 🚨 individualUnavailable の2文言は「リレーは使える」ことを伝える。
 *
 * 種目軸の統合で `styles` マスターの失敗が**タブ全体を止めない**ようになった。
 * その仕様がユーザーに伝わるかは文言に完全に依存しており、
 * 「個人種目が表示できません」だけだと**リレーも見られないと誤解される**。
 *
 * ⚠️ 文言そのものを厳密一致で pin すると翻訳の微修正で赤くなるので、
 *    **2キーが共通の末尾 (= リレーが使えるという一文) を持つ**という構造で見る。
 *    共通部分の長さに下限を置くので、片方から一文が消えたら落ちる。
 *
 * ⚠️ `fetchFailed` と `empty` は**先頭だけが違う**ので、片方を assert して
 *    もう片方を `toContain` で見るとどちらでも通る。両者が**異なること**も見る。
 */
describe("[V-R9] individualUnavailable はリレーが使えることを伝える", () => {
  /** 2つの文字列の共通末尾 */
  function commonSuffix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
    return a.slice(a.length - i);
  }

  it.each(LOCALES)("%s: 2文言が別物で、リレーに触れる共通の末尾を持つ", (locale) => {
    const fetchFailed = getValue(MESSAGES[locale], "teams.ranking.individualUnavailable.fetchFailed");
    const empty = getValue(MESSAGES[locale], "teams.ranking.individualUnavailable.empty");

    expect(typeof fetchFailed, `${locale} fetchFailed`).toBe("string");
    expect(typeof empty, `${locale} empty`).toBe("string");

    const a = fetchFailed as string;
    const b = empty as string;

    // 原因が違うので文言も違う (同じなら区別する意味が無い)
    expect(a, `${locale}: 2文言が同一`).not.toBe(b);

    // 共通末尾 = 「リレーのランキングは表示できます」相当の一文。
    // 片方からこの一文が落ちたら共通部分が短くなって落ちる
    const suffix = commonSuffix(a, b);
    expect(
      suffix.length,
      `${locale}: 共通末尾が短すぎる (${JSON.stringify(suffix)})。` +
        "どちらかから「リレーは表示できる」旨の一文が落ちた可能性がある",
    ).toBeGreaterThanOrEqual(12);

    // 共通末尾が文全体ではない = 原因の説明が実際に別々に書かれている
    expect(suffix.length, `${locale}: fetchFailed が共通末尾だけ`).toBeLessThan(a.length);
    expect(suffix.length, `${locale}: empty が共通末尾だけ`).toBeLessThan(b.length);
  });

  it("共通末尾の述語そのものが機能する (負のコントロール)", () => {
    function commonSuffixLocal(a: string, b: string): string {
      let i = 0;
      while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
      return a.slice(a.length - i);
    }
    expect(commonSuffixLocal("Aです。リレーは使えます。", "Bです。リレーは使えます。")).toBe(
      "です。リレーは使えます。",
    );
    // 片方から一文が落ちると共通部分がほぼ消える
    expect(commonSuffixLocal("Aです。リレーは使えます。", "Bです。").length).toBeLessThan(4);
    expect(commonSuffixLocal("abc", "xyz")).toBe("");
  });

  it("ja の2文言が「リレー」と「個人種目」の両方に言及する (ja だけは中身も見る)", () => {
    // 他ロケールは語彙が違うので構造で見るが、ja は定義元なので中身を確認する
    for (const key of ["fetchFailed", "empty"] as const) {
      const value = getValue(MESSAGES.ja, `teams.ranking.individualUnavailable.${key}`) as string;
      expect(value, key).toContain("リレー");
      expect(value, key).toContain("個人種目");
    }
  });
});
