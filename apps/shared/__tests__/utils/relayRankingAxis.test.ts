// =============================================================================
// relayRankingAxis.test.ts — リレーランキングの絞り込み軸 (QA Sprint Contract Phase B)
// =============================================================================
//
// 対象: apps/shared/utils/relayRankingAxis.ts
//
// このファイルは web (`apps/web/components/team/rankings/RankingFilters.tsx`) と
// mobile (`apps/mobile/components/teams/rankings/RankingFilterSheet.tsx`) が
// `rankingEventAxis` 経由で読む**唯一の定義元**。
// (旧 `RelayRankingFilters.tsx` / `RelayRankingFilterSheet.tsx` は
//  種目軸の統合で削除された。[V-RA-06] の docstring を参照)
// 第1弾 (`rankingStyleAxis.ts`) では選択肢の並び順が
// web と mobile で乖離した前科があるため、
//   (1) 配列の中身と並び順をリテラルで pin し
//   (2) **両アプリが自前の配列を作っていないこと**をソースの実測で pin する
// の 2 段で守る。
//
// Sprint Contract 検証観点:
//   [V-RA-01] 選択肢の並び順 (水路 0→1 / 性別 all→male→female→mixed / 種類 free→medley)
//   [V-RA-02] getRelayDistanceOptions は relayEvents から導出する。
//             **`legCount` を一緒に返すのでラベルに `× 4` をハードコードさせない**
//             (距離リストもレグ数も独自に持たない)
//   [V-RA-03] resolveLegDistanceOnKindChange: 同距離があれば維持、無ければ最短
//   [V-RA-04] buildDefaultRelayRankingFilters: 既定は free / 100m / 長水路 /
//             **男子** / 通算。**必ず値を返す** (null を返さない)
//   [V-RA-05] **削除済み** (2026-09-08)。`countActiveRelayRankingFilters` は
//             種目軸の統合で未使用になり production 参照 0 件になったため
//             関数ごと廃止された。バッジの計算は
//             `./rankingEventAxis.ts` の `countActiveRankingFilterState` が担い、
//             検証は `./rankingEventAxis.test.ts` の [V-EA-06] が担保する
//             (統合後は「その画面に出ている軸だけ」を数えるので、
//              ここの4軸をそのまま移植したものではない。
//              例: リレー表示中の scope は既定と違っても数えない)。
//             ⚠️ 移植先が無い観点が1つある: 「**`period` は数えない**」。
//             `RankingFilterState` に `period` フィールドが存在せず、
//             数える対象がそもそも無いため。
//             **Phase 2 (年度別 / 全レース) で `period` を state の軸に
//             戻すときは数え方を決めること。**
//
// 第3弾 (ランキング UI 改修) での更新:
//   ユーザー依頼で「すべて」を廃止し **男子を既定**にした。
//   `RelayRankingGenderFilter` から `"all"` が消え、選択肢は
//   男子 / 女子 / 混合 の3択になった (mixed はリレーにしか存在しない)。
//   距離の選択肢も「1人あたりの距離 (number[])」から
//   **`{legDistance, legCount}` のオブジェクト配列**に変わり、
//   `getRelayLegDistanceOptions` は `getRelayDistanceOptions` に rename された。
//
// ⚠️ `aggregation` (allRaces / teamBest) は **Sprint 途中の refactor で
//    `TeamRelayRankingFilters` からも RPC からも削除された** (2026-09-08 12:02 実測)。
//    リレーには「1チーム1行」に畳む単位が無いので teamBest の意味が無かったため。
//    QA レポートで PM に申し送り済み。
//   [V-RA-06] web / mobile が**同じ配列を読んでいる** (自前の選択肢配列を持たない)
//
// ─────────────────────────────────────────────────────────────────────────────
// トートロジー防止
//
// 期待値はプロダクションの関数では作らない。並び順・既定値はリテラルで書く。
// [V-RA-06] は「両アプリのソースが shared から import しているか」を
// ファイルの実読み取りで確認する (静的 grep を決め打ちにせず、
// 「独自の配列リテラルが無いこと」を否定形でも見る)。
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RELAY_RANKING_GENDER_VALUES,
  RELAY_RANKING_KIND_VALUES,
  RELAY_RANKING_POOL_TYPE_VALUES,
  buildDefaultRelayRankingFilters,
  getRelayDistanceOptions,
  resolveLegDistanceOnKindChange,
} from "../../utils/relayRankingAxis";
import { RELAY_EVENTS, getRelayKind, getRelayLegDistance } from "../../utils/relayEvents";

/**
 * 行コメントを落としたコード部分。docstring 内の説明文 ("free" 等) で
 * 「直書きしている」と誤検出しないため。
 *
 * ⚠️ 行頭が `//` / `*` / `/*` の行だけを落とす。行末コメントは残るが、
 *    ここで探しているのは配列リテラルなので実害が無い。
 *    (全部を落とす実装にすると誤検出ではなく**検出漏れ**を作る)
 */
function stripComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

function codeOf(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

describe("[V-RA-01] 選択肢の並び順", () => {
  it("水路は 短水路(0) → 長水路(1) (canonical な数値順)", () => {
    expect([...RELAY_RANKING_POOL_TYPE_VALUES]).toEqual([0, 1]);
  });

  it("性別区分は male → female → mixed の3択 (「すべて」は持たない)", () => {
    // ユーザー依頼で「すべて」を廃止。mixed (混合リレー) はリレーにしか
    // 存在しない実在の種目区分なので残る
    expect([...RELAY_RANKING_GENDER_VALUES]).toEqual(["male", "female", "mixed"]);
    expect(RELAY_RANKING_GENDER_VALUES).not.toContain("all");
  });

  it("リレーの種類は free → medley", () => {
    expect([...RELAY_RANKING_KIND_VALUES]).toEqual(["free", "medley"]);
  });

  it("どの選択肢配列にも重複が無い", () => {
    expect(new Set(RELAY_RANKING_POOL_TYPE_VALUES).size).toBe(2);
    expect(new Set(RELAY_RANKING_GENDER_VALUES).size).toBe(3);
    expect(new Set(RELAY_RANKING_KIND_VALUES).size).toBe(2);
  });
});

describe("[V-RA-02] getRelayDistanceOptions", () => {
  it("free は 25/50/100/200 の4択で legCount はすべて 4", () => {
    expect(getRelayDistanceOptions("free")).toEqual([
      { legDistance: 25, legCount: 4 },
      { legDistance: 50, legCount: 4 },
      { legDistance: 100, legCount: 4 },
      { legDistance: 200, legCount: 4 },
    ]);
  });

  it("medley は 25/50/100 の3択で **200m × 4 が無い**", () => {
    // 日本水泳連盟の実施種目に 800m メドレーリレー (200m × 4) が無い。
    // ここに 200 が現れたら実在しない種目を選ばせている
    expect(getRelayDistanceOptions("medley")).toEqual([
      { legDistance: 25, legCount: 4 },
      { legDistance: 50, legCount: 4 },
      { legDistance: 100, legCount: 4 },
    ]);
    expect(getRelayDistanceOptions("medley").map((o) => o.legDistance)).not.toContain(200);
  });

  it("すべての選択肢は legDistance 昇順である (UI の並びがそのままこれになる)", () => {
    for (const kind of ["free", "medley"] as const) {
      const distances = getRelayDistanceOptions(kind).map((o) => o.legDistance);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    }
  });

  it("🚨 legCount は RELAY_EVENTS のレグ数から導出されている (`× 4` のハードコードではない)", () => {
    // 期待値をリテラル 4 で書くだけでは「4 と書いてあるものが 4」でしかない。
    // **静的定義のレグ数と一致していること**を突き合わせる。
    // レグ数はここと UI ラベルの2箇所で持ってはいけない
    // (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
    for (const kind of ["free", "medley"] as const) {
      for (const option of getRelayDistanceOptions(kind)) {
        const source = RELAY_EVENTS.filter(
          (event) =>
            getRelayKind(event.id) === kind &&
            getRelayLegDistance(event.id) === option.legDistance,
        );
        expect(source, `${kind} ${option.legDistance}m の定義元が無い`).toHaveLength(1);
        expect(option.legCount).toBe(source[0]?.legs.length);
      }
    }
  });

  it("戻り値を破壊的に変更しても次の呼び出しに影響しない", () => {
    const first = getRelayDistanceOptions("free");
    first.push({ legDistance: 9999, legCount: 99 });
    first.reverse();

    expect(getRelayDistanceOptions("free").map((o) => o.legDistance)).toEqual([25, 50, 100, 200]);
  });

  it("同じ (距離, レグ数) の重複を返さない", () => {
    for (const kind of ["free", "medley"] as const) {
      const keys = getRelayDistanceOptions(kind).map((o) => `${o.legDistance}x${o.legCount}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("[V-RA-03] resolveLegDistanceOnKindChange", () => {
  it("同じ距離が新しい種類にも存在すれば維持する (100m free → 100m medley)", () => {
    expect(resolveLegDistanceOnKindChange("medley", 100)).toBe(100);
    expect(resolveLegDistanceOnKindChange("free", 100)).toBe(100);
  });

  it("25m / 50m も維持される", () => {
    expect(resolveLegDistanceOnKindChange("medley", 25)).toBe(25);
    expect(resolveLegDistanceOnKindChange("medley", 50)).toBe(50);
  });

  it("200m free → medley は 200 が無いので最短の 25m に落ちる", () => {
    expect(resolveLegDistanceOnKindChange("medley", 200)).toBe(25);
  });

  it("選択肢に無い距離 (400m など) からの切替も最短距離に落ちる", () => {
    expect(resolveLegDistanceOnKindChange("free", 400)).toBe(25);
    expect(resolveLegDistanceOnKindChange("medley", 400)).toBe(25);
  });

  it("medley → free では 200m が選べるようになるが、現在値が維持できるなら維持する", () => {
    // medley から free に戻すときに「free の最短 25m」へ勝手に落とさない
    expect(resolveLegDistanceOnKindChange("free", 50)).toBe(50);
  });
});

describe("[V-RA-04] buildDefaultRelayRankingFilters", () => {
  it("既定は free / 100m / 長水路(1) / **男子** / 通算", () => {
    expect(buildDefaultRelayRankingFilters()).toEqual({
      relayKind: "free",
      legDistance: 100,
      poolType: 1,
      genderCategory: "male",
      period: { kind: "allTime" },
    });
  });

  it("既定の性別区分は「すべて」ではない (廃止された値が残っていない)", () => {
    expect(buildDefaultRelayRankingFilters().genderCategory).not.toBe("all");
  });

  it("既定条件に aggregation を持たない (refactor で削除された軸が復活していない)", () => {
    expect(Object.keys(buildDefaultRelayRankingFilters()).sort()).toEqual([
      "genderCategory",
      "legDistance",
      "period",
      "poolType",
      "relayKind",
    ]);
  });

  it("必ず値を返す (第1弾の buildDefaultRankingFilters と違い null にならない)", () => {
    // リレーの軸は RELAY_EVENTS (静的定義) から決まるので
    // 「まだ確定していない」状態が呼び出し側に存在しない
    for (let i = 0; i < 5; i += 1) {
      expect(buildDefaultRelayRankingFilters()).not.toBeNull();
    }
  });

  it("呼び出しごとに新しいオブジェクトを返す (共有された state を書き換えない)", () => {
    const first = buildDefaultRelayRankingFilters();
    const second = buildDefaultRelayRankingFilters();

    expect(first).not.toBe(second);
    expect(first.period).not.toBe(second.period);

    first.legDistance = 25;
    expect(buildDefaultRelayRankingFilters().legDistance).toBe(100);
  });

  it("既定の legDistance は free の選択肢に実在する", () => {
    const defaults = buildDefaultRelayRankingFilters();
    expect(
      getRelayDistanceOptions(defaults.relayKind).map((o) => o.legDistance),
    ).toContain(defaults.legDistance);
  });

  it("既定の poolType / genderCategory / relayKind は選択肢配列に実在する", () => {
    const defaults = buildDefaultRelayRankingFilters();
    expect(RELAY_RANKING_POOL_TYPE_VALUES).toContain(defaults.poolType);
    expect(RELAY_RANKING_GENDER_VALUES).toContain(defaults.genderCategory);
    expect(RELAY_RANKING_KIND_VALUES).toContain(defaults.relayKind);
  });
});

// ---------------------------------------------------------------------------
// [V-RA-06] web / mobile が同じ配列を読んでいる
//
// 第1弾で「同じ意味の選択肢を web と mobile が別々に持ち、並び順が乖離した」
// 前科がある。両アプリのソースを実際に読んで
//   (a) shared からの import があること
//   (b) 自前の選択肢配列リテラルを持っていないこと (否定形)
// を確かめる。ファイルパスは git 追跡下の実ファイルなので CI でも読める。
// ---------------------------------------------------------------------------
describe("[V-RA-06] web / mobile が shared の同じ配列を読んでいる", () => {
  const REPO_APPS = path.resolve(__dirname, "../../..");

  /**
   * 消費者は**種目軸の統合 (2026-09-08) で差し替わった**。
   *   web    `RelayRankingFilters.tsx`     → 削除。`RankingFilters.tsx` に統合
   *   mobile `RelayRankingFilterSheet.tsx` → 削除。`RankingFilterSheet.tsx` に統合
   *
   * 統合後、リレー専用の絞り込み UI は存在しない (個人5種目 + リレー2種類の
   * 7択ラジオ1つが両モードを兼ねる)。よって「リレーの選択肢配列を読む場所」も
   * 各アプリ1ファイルずつになった。
   *
   * ⚠️ **統合で経路が1段深くなった。** 距離・種類の解決は
   * `rankingEventAxis` が `relayRankingAxis` へ委譲する形になったので、
   * UI が `getRelayDistanceOptions` / `resolveLegDistanceOnKindChange` を
   * 直接 import しなくなっている。これは劣化ではなく**委譲層が1つに
   * 集約された**状態なので、「5識別子を直接読んでいるか」ではなく
   * 「shared の軸モジュール経由で読み、自前の配列を持たないか」を要求する。
   */
  const CONSUMERS = [
    {
      label: "web (RankingFilters.tsx)",
      file: path.join(REPO_APPS, "web/components/team/rankings/RankingFilters.tsx"),
    },
    {
      label: "mobile (RankingFilterSheet.tsx)",
      file: path.join(REPO_APPS, "mobile/components/teams/rankings/RankingFilterSheet.tsx"),
    },
  ] as const;

  /** 委譲層。リレーの軸をここ以外から解決していたら二重管理になる */
  const EVENT_AXIS = path.join(REPO_APPS, "shared/utils/rankingEventAxis.ts");

  it.each(CONSUMERS)("$label が存在する (削除された旧ファイルを見ていない)", ({ file }) => {
    expect(existsSync(file), `${file} が無い`).toBe(true);
  });

  it.each(CONSUMERS)("$label は shared の軸モジュールから import している", ({ file }) => {
    const source = readFileSync(file, "utf8");

    // 統合後の必須経路。7択の値と選択肢、モードをまたぐ引き継ぎはすべてここ
    expect(source).toContain('from "@apps/shared/utils/rankingEventAxis"');
    // リレー固有の語彙 (性別区分 3 択) は relayRankingAxis が定義元
    expect(source).toContain('from "@apps/shared/utils/relayRankingAxis"');
    expect(source).toContain("RELAY_RANKING_GENDER_VALUES");
  });

  it.each(CONSUMERS)("$label は7択の値と距離選択肢を shared から得ている", ({ file }) => {
    const source = readFileSync(file, "utf8");
    const REQUIRED = [
      "RANKING_INDIVIDUAL_EVENT_CHOICES", // 個人5種目の並び (canonical 順)
      "RANKING_RELAY_EVENT_CHOICES", // リレー2種類の並び
      "getRankingDistanceChoices", // 距離 (個人は styles / リレーは RELAY_EVENTS)
      "parseRankingEventValue", // value → selection の逆引き (as キャストの代わり)
      "resolveRankingEventChange", // モード切替時の引き継ぎ規則
    ] as const;
    const missing = REQUIRED.filter((id) => !source.includes(id));

    expect(missing, `shared から読んでいない識別子: ${missing.join(", ")}`).toEqual([]);
  });

  it("リレー軸への委譲は rankingEventAxis 1箇所だけ (UI は relayRankingAxis の距離/種類解決を直接呼ばない)", () => {
    // 「同一のドメイン対応表を2箇所にハードコードするな」の構造版。
    // 距離とレグ数の解決を UI 側でも呼べる状態にすると、片方だけ
    // 新しいリレー種目に追従して静かに乖離する
    const DELEGATED_ONLY = ["getRelayDistanceOptions", "resolveLegDistanceOnKindChange"] as const;

    const axisSource = readFileSync(EVENT_AXIS, "utf8");
    for (const id of DELEGATED_ONLY) {
      expect(axisSource, `rankingEventAxis が ${id} を委譲していない`).toContain(id);
    }

    for (const { label, file } of CONSUMERS) {
      const code = codeOf(file);
      for (const id of DELEGATED_ONLY) {
        expect(code, `${label} が ${id} を直接呼んでいる`).not.toContain(id);
      }
    }
  });

  it.each(CONSUMERS)(
    "$label に自前の選択肢配列リテラルが無い (並び順が乖離する余地を作っていない)",
    ({ file }) => {
      // 実際に乖離を生む形 = 種類 / 性別区分 / 水路の値をその場で並べた配列リテラル。
      // コメント行を除いてから探す (説明文中の "free" 等で誤検出しないため)。
      const code = codeOf(file);

      const offenders = [
        /\[\s*"free"\s*,\s*"medley"\s*\]/, // 種類の並びを直書き
        /\[\s*"medley"\s*,\s*"free"\s*\]/,
        /\[\s*"all"\s*,\s*"male"/, // 性別区分の並びを直書き
        /\[\s*"male"\s*,\s*"female"/,
        /\[\s*0\s*,\s*1\s*\]\s*as/, // 水路の並びを直書き
        /\[\s*25\s*,\s*50\s*,\s*100/, // 距離リストを直書き
        /["']relay:free["']/, // 7択の value 文字列を直書き ("relay:" 接頭辞)
        /["']relay:medley["']/,
      ].filter((pattern) => pattern.test(code));

      expect(offenders.map(String), "選択肢配列を直書きしている箇所がある").toEqual([]);
    },
  );

  it("既定値は shared の buildDefaultRelayRankingFilters が唯一の定義元 (UI は自前のリテラルを書かない)", () => {
    // ⚠️ 統合前は web/mobile がそれぞれ既定値を作っていたが、統合後は
    //    `buildDefaultRankingFilterState` が両モードの既定を1関数で返す。
    //    リレー側の値はそこから `buildDefaultRelayRankingFilters` へ委譲される
    //    (styles マスターが空のときのフォールバック先でもある)。
    const axisSource = readFileSync(EVENT_AXIS, "utf8");
    expect(axisSource).toContain("buildDefaultRelayRankingFilters");
    expect(axisSource).toContain('from "./relayRankingAxis"');

    // UI 側 (絞り込み + 結果 + 親) のどこにも既定値のリテラルが無いこと
    const UI_SOURCES = [
      "web/components/team/rankings/RankingFilters.tsx",
      "web/components/team/rankings/TeamRankings.tsx",
      "web/components/team/rankings/TeamRelayRankings.tsx",
      "mobile/components/teams/rankings/RankingFilterSheet.tsx",
      "mobile/components/teams/rankings/TeamRankings.tsx",
      "mobile/components/teams/rankings/TeamRelayRankings.tsx",
    ] as const;

    for (const relPath of UI_SOURCES) {
      const code = codeOf(path.join(REPO_APPS, relPath));
      // 例: `{ relayKind: "free", legDistance: 100, poolType: 1, ... }` の直書き
      expect(code, relPath).not.toMatch(/relayKind\s*:\s*["']free["']/);
      expect(code, relPath).not.toMatch(/legDistance\s*:\s*100\b/);
    }
  });

  it("否定形の述語そのものが機能する (負のコントロール)", () => {
    // 上の offenders 判定はハンドロールなので、コメント除去と正規表現が
    // 本当に「直書き」を捕まえるかを固定値で確かめる。これが無いと
    // コメント除去が全部を消してしまう形に書き換わっても green になる
    const RE = /\[\s*"free"\s*,\s*"medley"\s*\]/;
    expect(RE.test('const KINDS = ["free", "medley"];')).toBe(true);
    expect(RE.test("// const KINDS = [\"free\", \"medley\"];")).toBe(true); // 生文字列では当たる
    expect(RE.test('import { RELAY_RANKING_KIND_VALUES } from "x";')).toBe(false);
    // コメント除去が効いていること
    expect(stripComments('// ["free", "medley"]\nconst a = 1;')).not.toContain("free");
    expect(stripComments('const a = ["free", "medley"];')).toContain("free");
  });
});
