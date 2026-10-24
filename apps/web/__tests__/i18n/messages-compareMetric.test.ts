/**
 * ベストタイム表「比較指標プルダウン」新規 i18n キーの5言語パリティテスト
 *
 * Sprint Contract: WAポイント固定だった比較指標を、①WAポイント ②日本記録ポイント
 * ③年齢別ポイント の3択プルダウンに変更する。プルダウンのラベル・選択肢・区分名・
 * 指標固有の説明文の翻訳キーが ja/en/de/ko/zh 全てに存在することを保証する
 * (既存 `apps/web/__tests__/i18n/messages.test.ts` は ja/en 間のみの検証で zh/ko/de は
 * 対象外のため、この機能専用の safety net として新設する。
 * `apps/web/__tests__/i18n/messages-time-level.test.ts` と同方針)。
 *
 * ## キー名
 * 2画面 (マイページ/メンバー詳細) は既存でも同じキーを別 namespace に重複定義する規約
 * (例: mypage.bestTimesTable.waPointsToggle と teams.memberDetail.bestTimesTable.waPointsToggle が
 * 同じ文言を別々に持つ) に倣い、`mypage.bestTimesTable` と `teams.memberDetail.bestTimesTable` の
 * 両方に同じキー構造を追加する:
 *   compareMetricLabel                        (プルダウンのラベル、例:「比較指標」)
 *   compareMetric.wa / .nr / .age              (選択肢ラベル)
 *   ageCategoryLabel                           (年齢区分セレクトのラベル、例:「区分」)
 *   ageCategoryUnset                           (区分未設定時の表示、例:「未設定」)
 *   ageCategory.elementary / .juniorHigh / .highSchool / .university / .general (区分名)
 *   compareMetricInfo                          (**指標ごとではなく単一の説明文**。
 *                                                比較指標プルダウン用の新設アイコン
 *                                                (`{prefix}-compare-metric-info-button`) が表示する、
 *                                                WA/日本記録/年齢別の3指標を1つのツールチップ内で
 *                                                簡潔に列挙する固定コンテンツ。既存の
 *                                                `{prefix}-wa-points-info-button` が使う
 *                                                teams.waPointsCompare.infoTooltip とは別物
 *                                                (そちらは無変更で back-compat))
 *   compareMetricInfoAriaLabel                 (同アイコンの aria-label 用の短い文言。
 *                                                a11y 改善のため compareMetricInfo (長いツールチップ本文)
 *                                                とは別キーに分離されている)
 *
 * Sprint Contract 検証観点:
 *   [V-I01] 上記キーが ja/en/de/ko/zh の5言語すべてに空でない文字列として存在する
 *   [V-I02] en.json の値に日本語文字が含まれない (翻訳漏れ検出)
 *   [V-I03] 新規キーを既存の `teams.waPointsCompare` 名前空間 (既存10キー厳密一致テストが
 *           WaPointsInfoTooltip.test.tsx に既にある) に追加していないこと (回帰ガード)
 *   [V-I04] ageCategory.* の5区分と compareMetric.* の3指標が、それぞれ他と重複しない
 *           一意な文言であること (コピペミスで同じ文言が複数キーに入る事故の検出)
 *   [V-I05] compareMetricInfo が既存の teams.waPointsCompare.infoTooltip と異なる文言であること
 *           (単一の説明にまとめた結果、既存文言をそのまま複製しただけになっていないかの確認)
 *   [V-I06] compareMetricInfoAriaLabel が compareMetricInfo (本文) と同一文言に縮退していないこと
 *           (aria-label とツールチップ本文を分離した意図が壊れていないかの確認)
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../../packages/shared/messages/ja.json";
import enMessages from "../../../../packages/shared/messages/en.json";
import deMessages from "../../../../packages/shared/messages/de.json";
import koMessages from "../../../../packages/shared/messages/ko.json";
import zhMessages from "../../../../packages/shared/messages/zh.json";

function getValue(obj: Record<string, unknown>, dottedKey: string): unknown {
  const parts = dottedKey.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

const NAMESPACES = ["mypage.bestTimesTable", "teams.memberDetail.bestTimesTable"];

const KEY_SUFFIXES = [
  "compareMetricLabel",
  "compareMetric.wa",
  "compareMetric.nr",
  "compareMetric.age",
  "ageCategoryLabel",
  "ageCategoryUnset",
  "ageCategory.elementary",
  "ageCategory.juniorHigh",
  "ageCategory.highSchool",
  "ageCategory.university",
  "ageCategory.general",
  "compareMetricInfo",
  "compareMetricInfoAriaLabel",
];

const LOCALES: Array<{ name: string; messages: Record<string, unknown> }> = [
  { name: "ja", messages: jaMessages },
  { name: "en", messages: enMessages },
  { name: "de", messages: deMessages },
  { name: "ko", messages: koMessages },
  { name: "zh", messages: zhMessages },
];

const ALL_FULL_KEYS = NAMESPACES.flatMap((ns) => KEY_SUFFIXES.map((suffix) => `${ns}.${suffix}`));

describe("[V-I01] 比較指標プルダウンの i18n キー (5言語パリティ)", () => {
  for (const { name, messages } of LOCALES) {
    it.each(ALL_FULL_KEYS)(`[V-I01] ${name}.json に %s が空でない文字列として存在する`, (key) => {
      const value = getValue(messages, key);
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    });
  }
});

describe("[V-I02] en.json の値に日本語文字が含まれない (翻訳漏れ検出)", () => {
  it("KEY_SUFFIXES の全キーについて en.json の値が日本語を含まない", () => {
    const jaLeakRegex = /[ぁ-んァ-ヶー一-龯]/;
    for (const key of ALL_FULL_KEYS) {
      const value = getValue(enMessages, key);
      expect(
        typeof value === "string" && jaLeakRegex.test(value),
        `en.json の "${key}" に日本語が含まれています: ${String(value)}`,
      ).toBe(false);
    }
  });
});

describe("[V-I03] 新規キーは既存 teams.waPointsCompare 名前空間に追加されていない (回帰ガード)", () => {
  it("teams.waPointsCompare のキー一覧は既存10キーのみのままである (WaPointsInfoTooltip.test.tsx の厳密一致テストと対称の確認)", () => {
    const KNOWN_KEYS = [
      "buttonLabel",
      "infoAriaLabel",
      "infoTooltip",
      "modalTitle",
      "rankLabel",
      "pointsLabel",
      "styleLabel",
      "courseShort",
      "courseLong",
      "empty",
    ];
    const ja = jaMessages as unknown as { teams: { waPointsCompare: Record<string, unknown> } };
    expect(Object.keys(ja.teams.waPointsCompare).sort()).toEqual(KNOWN_KEYS.sort());
  });
});

describe("[V-I04] ageCategory.* / compareMetric.* の文言が互いに重複しない (コピペ事故検出)", () => {
  for (const ns of NAMESPACES) {
    it(`${ns}: ageCategory.* の5区分がja.jsonで互いに異なる文言である`, () => {
      const keys = [
        "elementary",
        "juniorHigh",
        "highSchool",
        "university",
        "general",
      ].map((k) => `${ns}.ageCategory.${k}`);
      const values = keys.map((k) => getValue(jaMessages, k));
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it(`${ns}: compareMetric.* の3指標がja.jsonで互いに異なる文言である`, () => {
      const keys = ["wa", "nr", "age"].map((k) => `${ns}.compareMetric.${k}`);
      const values = keys.map((k) => getValue(jaMessages, k));
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  }
});

describe("[V-I05] compareMetricInfo (新設の単一説明文) は既存の teams.waPointsCompare.infoTooltip の複製ではない", () => {
  for (const ns of NAMESPACES) {
    it(`${ns}.compareMetricInfo は teams.waPointsCompare.infoTooltip と異なる文言である (ja.json)`, () => {
      const combined = getValue(jaMessages, `${ns}.compareMetricInfo`);
      const waOnly = (jaMessages as unknown as { teams: { waPointsCompare: { infoTooltip: string } } })
        .teams.waPointsCompare.infoTooltip;
      expect(combined).not.toBe(waOnly);
    });
  }
});

describe("[V-I06] compareMetricInfoAriaLabel はツールチップ本文 (compareMetricInfo) と別の短い文言である", () => {
  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${name}.json ${ns}: compareMetricInfoAriaLabel は compareMetricInfo と同一文言ではない`, () => {
        const ariaLabel = getValue(messages, `${ns}.compareMetricInfoAriaLabel`);
        const tooltipBody = getValue(messages, `${ns}.compareMetricInfo`);
        expect(ariaLabel).not.toBe(tooltipBody);
      });
    }
  }
});

/**
 * [V-I07]〜[V-I09] 追記分。
 *
 * 背景: 文言変更 (プルダウンのラベル「WAポイント」→「世界記録基準」等、および
 * compareMetricInfo の単一パラグラフ → `\n` 区切り3行構成) が入ったが、上記 V-I01〜V-I06 は
 * 「キーが存在し空でない文字列である」という構造検証のみで、具体的な文言・行数・整合性を
 * 一切見ていないため、190件全 green のまま文言変更を検出できなかった (Developer 申し送り)。
 *
 * [V-I07] は ja のみの厳密一致 pin。ユーザーが明示指定した文言 ("世界記録基準"/"日本記録基準"/
 * "区分記録基準") なので、捏造コピーの pin ではなく仕様の記録として許容する。
 *
 * [V-I08]/[V-I09] は「プルダウンのラベルを変えたら説明文も追従しているか」という
 * 実際に起こりうるドリフト (どちらか一方だけ更新される事故) を機械的に検出する不変条件。
 * 実装の出力を期待値に使わず、「プルダウンと説明文の用語は一致していなければならない」という
 * 仕様から導いた条件のみで判定するため、トートロジーにならない。
 */
describe("[V-I07] compareMetric.{wa,nr,age} の ja 文言厳密一致 (ユーザー指定の仕様 pin)", () => {
  // 追記: 当初 wa は「世界記録基準」だったが、WAポイントが実在する公式制度であるのに対し
  // nr/age は SwimHub 独自の換算であるため同列に並べるべきではない、というユーザー判断により
  // wa のみ「WAポイント」に改称された (nr/age は無変更)。
  const EXPECTED_JA_LABELS = {
    wa: "WAポイント",
    nr: "日本記録基準",
    age: "区分記録基準",
  } as const;

  for (const ns of NAMESPACES) {
    for (const [metric, expected] of Object.entries(EXPECTED_JA_LABELS)) {
      it(`ja.json ${ns}.compareMetric.${metric} は "${expected}" である`, () => {
        expect(getValue(jaMessages, `${ns}.compareMetric.${metric}`)).toBe(expected);
      });
    }
  }
});

describe("[V-I08] compareMetricInfo は5言語×2namespaceすべてで正確に3行 (空行なし)", () => {
  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${name}.json ${ns}.compareMetricInfo は \\n で区切った行数が3である`, () => {
        const info = getValue(messages, `${ns}.compareMetricInfo`);
        expect(typeof info).toBe("string");
        const lines = (info as string).split("\n");
        expect(lines.length).toBe(3);
        for (const line of lines) {
          expect(line.trim().length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe("[V-I09] compareMetricInfo の各行冒頭は対応する compareMetric ラベルと一致する (用語ドリフト防止・本命)", () => {
  const METRIC_ORDER = ["wa", "nr", "age"] as const;

  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${name}.json ${ns}: compareMetricInfo の各行が compareMetric.{wa,nr,age} の順で始まる`, () => {
        const info = getValue(messages, `${ns}.compareMetricInfo`);
        expect(typeof info).toBe("string");
        const lines = (info as string).split("\n");
        expect(lines.length).toBe(3);

        METRIC_ORDER.forEach((metric, index) => {
          const label = getValue(messages, `${ns}.compareMetric.${metric}`);
          expect(typeof label).toBe("string");
          const line = lines[index];
          expect(
            line !== undefined && line.startsWith(label as string),
            `${name}.json ${ns}.compareMetricInfo の${index + 1}行目 "${line}" が ` +
              `compareMetric.${metric} ("${label}") で始まっていません`,
          ).toBe(true);
        });
      });
    }
  }
});

/**
 * [V-I10]〜[V-I13] 追記分 (トグル横 i アイコンの汎用化)。
 *
 * 背景: 従来トグル横の info アイコン (`{prefix}-wa-points-info-button`) は
 * `teams.waPointsCompare.infoTooltip` (WA固有の説明) にフォールバックしていたが、
 * プルダウンで「日本記録基準」を選んでいても WA の説明が出てしまう不整合があった。
 * これを解消するため、新規キー `pointsInfo` / `pointsInfoAriaLabel` を追加し、
 * どの基準を選んでいても正しい「算出式の一般的な説明」に差し替えた
 * (`apps/web/__tests__/components/profile/BestTimesTable.infoIcon.test.tsx` 等が
 * コンポーネント側の配線を検証する。ここでは i18n キーそのものの整合性を検証する)。
 */
const POINTS_INFO_KEYS = ["pointsInfo", "pointsInfoAriaLabel"];

describe("[V-I10] pointsInfo / pointsInfoAriaLabel が5言語×2namespaceすべてに空でない文字列として存在する", () => {
  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      for (const key of POINTS_INFO_KEYS) {
        it(`${name}.json ${ns}.${key} が存在する`, () => {
          const value = getValue(messages, `${ns}.${key}`);
          expect(typeof value).toBe("string");
          expect((value as string).length).toBeGreaterThan(0);
        });
      }
    }
  }
});

describe("[V-I11] pointsInfo は teams.waPointsCompare.infoTooltip の複製ではない (フォールバック retrogression 検出)", () => {
  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${name}.json ${ns}.pointsInfo は同ロケールの teams.waPointsCompare.infoTooltip と異なる文言である`, () => {
        const pointsInfo = getValue(messages, `${ns}.pointsInfo`);
        const waOnly = getValue(messages, "teams.waPointsCompare.infoTooltip");
        expect(pointsInfo).not.toBe(waOnly);
      });
    }
  }
});

describe("[V-I12] en/zh/ko/de の pointsInfo / pointsInfoAriaLabel に日本語が含まれない (翻訳漏れ検出)", () => {
  // ひらがな/カタカナのみを対象にする (既存 V-I02 の `一-龯` を含む正規表現は en 専用の
  // チェックだったため問題にならなかったが、ここでは zh も対象に含むため漢字/繁体字の
  // 範囲を含めると中国語の正規の訳文に誤検出してしまう。ひらがな/カタカナは日本語にしか
  // 出現しないため、この範囲だけで翻訳漏れ (日本語の生文字列がそのまま残る事故) を検出できる)
  const jaLeakRegex = /[ぁ-んァ-ヶー]/;
  for (const { name, messages } of LOCALES.filter((l) => l.name !== "ja")) {
    for (const ns of NAMESPACES) {
      for (const key of POINTS_INFO_KEYS) {
        it(`${name}.json ${ns}.${key} に日本語が含まれていない`, () => {
          const value = getValue(messages, `${ns}.${key}`);
          expect(
            typeof value === "string" && jaLeakRegex.test(value),
            `${name}.json の "${ns}.${key}" に日本語が含まれています: ${String(value)}`,
          ).toBe(false);
        });
      }
    }
  }
});

describe("[V-I13] pointsInfo に「World Aquatics」/「WA」が含まれない (どの基準を選んでも正しい説明であるための核心条件)", () => {
  // \bWA\b は JS の正規表現では \w (英数字+アンダースコア) と非\wの境界で成立するため、
  // "WAポイント" のように直後が非ラテン文字(日本語等)でも正しく境界と判定される。
  const waMentionRegex = /World Aquatics|\bWA\b/i;
  for (const { name, messages } of LOCALES) {
    for (const ns of NAMESPACES) {
      it(`${name}.json ${ns}.pointsInfo に "World Aquatics"/"WA" が含まれていない`, () => {
        const value = getValue(messages, `${ns}.pointsInfo`);
        expect(typeof value).toBe("string");
        expect(
          waMentionRegex.test(value as string),
          `${name}.json ${ns}.pointsInfo に WA 固有の言及が含まれています: ${String(value)}`,
        ).toBe(false);
      });
    }
  }
});
