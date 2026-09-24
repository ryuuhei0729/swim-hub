// =============================================================================
// relayEvents.test.ts — リレー種目定義の共通化と RelayEventId ⇄ DB 事実の相互変換
//                        (QA Sprint Contract Phase B / 第3弾)
// =============================================================================
//
// 対象: apps/shared/utils/relayEvents.ts
//
// 第3弾で web (`apps/web/app/.../records/_client/relayEvents.ts`) と
// mobile (`apps/mobile/screens/teamRecordBulk/relayEvents.ts`) の複製が
// この 1 ファイルへ統合された。既存のユニットテストは
//   - apps/web/__tests__/relayEvents.test.ts
//   - apps/mobile/screens/__tests__/teamRecordBulk.relayEvents.test.ts
// の 2 本があり、どちらも **各アプリの re-export バリア越し**に検証している。
// このファイルは shared 本体を直接叩き、かつ第3弾で**新規追加された 3 つの関数**
//   getRelayKind / fromRelayEventId / getRelayLegDistances
// と定数 RELAY_KIND_VALUES を対象にする (既存テストは 1 件もカバーしていない)。
//
// ⚠️ 当初は `toRelayEventId` (DB の (relay_kind, leg_distance) → RelayEventId の
//    復元) も検証対象だったが、**Sprint 途中の refactor で削除された**
//    (2026-09-08 11:54 実測。呼び出し元が 1 つも無い死んだコードだったため)。
//    復元が必要になったら「例外ではなく null を返す」という設計判断
//    (1 行の復元失敗で画面全体を落とさない) を一緒に戻すこと。
//    なお `supabase/migrations/20260908000000_add_relay_records.sql` の
//    コメント 2 箇所は今も `toRelayEventId()` を設計根拠として参照しており、
//    実体が無い状態になっている (QA レポートで指摘済み)。
//
// Sprint Contract 検証観点:
//   [V-RE-01] 7 つの RelayEventId が (種類, 1レグ距離) に一意に分解される
//             (2 つの id が同じ組に潰れない = 分解が情報を失っていない)
//   [V-RE-02] getRelayKind はサフィックスから種類を導出する
//   [V-RE-04] getRelayLegDistances は種類ごとの距離を昇順・重複なしで返す
//   [V-RE-05] RELAY_KIND_VALUES の並びは free → medley
//   [V-RE-06] DB に relay_event_id 列を持たない設計の要: 対応表を
//             二重管理していない (距離は getRelayLegDistance が唯一の定義元)
//
// ─────────────────────────────────────────────────────────────────────────────
// トートロジー防止
//
// 期待値は **プロダクションの関数では作らない**。RelayEventId の 7 値と
// (種類, 1レグ距離) の対応表を手書きのリテラルで持ち、実装と突き合わせる。
// この対応表は日本水泳連盟の公式リレー種目 (フリーリレー 4×25/50/100/200、
// メドレーリレー 4×25/50/100) に基づく。**メドレーリレーに 200m は無い**
// (公式種目として実施されない) ので `relay_4x200_medley` は存在しない。
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  RELAY_EVENTS,
  RELAY_KIND_VALUES,
  fromRelayEventId,
  getRelayKind,
  getRelayLegBoundaries,
  getRelayLegDistance,
  getRelayLegDistances,
  type RelayEventId,
} from "../../utils/relayEvents";
import type { RelayKind } from "../../types/relayRecord";

/**
 * 手書きのグラウンドトゥルース。`RELAY_EVENTS` からは導出しない。
 * 「id → (種類, 1レグ距離)」の対応をここで独立に固定する。
 */
const EXPECTED: ReadonlyArray<{ id: RelayEventId; kind: RelayKind; legDistance: number }> = [
  { id: "relay_4x25_free", kind: "free", legDistance: 25 },
  { id: "relay_4x50_free", kind: "free", legDistance: 50 },
  { id: "relay_4x100_free", kind: "free", legDistance: 100 },
  { id: "relay_4x200_free", kind: "free", legDistance: 200 },
  { id: "relay_4x25_medley", kind: "medley", legDistance: 25 },
  { id: "relay_4x50_medley", kind: "medley", legDistance: 50 },
  { id: "relay_4x100_medley", kind: "medley", legDistance: 100 },
];

describe("[V-RE-01] RelayEventId ⇄ (relay_kind, leg_distance) の往復", () => {
  it("RELAY_EVENTS の件数と id 集合が手書きの期待値と一致する (種目の増減を検出)", () => {
    expect(RELAY_EVENTS).toHaveLength(EXPECTED.length);
    expect(RELAY_EVENTS.map((event) => event.id)).toEqual(EXPECTED.map((e) => e.id));
  });

  it.each(EXPECTED)(
    "$id: fromRelayEventId が (kind=$kind, legDistance=$legDistance) に分解する",
    ({ id, kind, legDistance }) => {
      expect(fromRelayEventId(id)).toEqual({ kind, legDistance });
    },
  );

  it("7 つの id が (種類, 1レグ距離) の異なる組に分解される (2 つの種目が同じ組に潰れない)", () => {
    // DB は `relay_kind` + `leg_distance` の 2 列しか持たないので、
    // この分解が単射でないと 2 つの種目が同じ行として保存され区別できなくなる
    const keys = RELAY_EVENTS.map((event) => {
      const { kind, legDistance } = fromRelayEventId(event.id);
      return `${kind}:${legDistance}`;
    });

    expect(new Set(keys).size).toBe(RELAY_EVENTS.length);
  });

  it("分解した組から手書きの期待表を引くと元の id に戻る (対応表が壊れていない)", () => {
    // `toRelayEventId` は refactor で削除されたので、復元はここで
    // **テスト側の手書き表**を使って確認する (プロダクションの逆写像に依存しない)
    const byKey = new Map(EXPECTED.map((e) => [`${e.kind}:${e.legDistance}`, e.id]));

    for (const { id } of EXPECTED) {
      const { kind, legDistance } = fromRelayEventId(id);
      expect(byKey.get(`${kind}:${legDistance}`)).toBe(id);
    }
  });
});

describe("[V-RE-02] getRelayKind", () => {
  it.each(EXPECTED)("$id の種類は $kind である", ({ id, kind }) => {
    expect(getRelayKind(id)).toBe(kind);
  });

  it("free が 4 種目・medley が 3 種目 (メドレーリレーに 200m は無い)", () => {
    const kinds = RELAY_EVENTS.map((event) => getRelayKind(event.id));
    expect(kinds.filter((k) => k === "free")).toHaveLength(4);
    expect(kinds.filter((k) => k === "medley")).toHaveLength(3);
  });
});

describe("[V-RE-04] getRelayLegDistances", () => {
  it("free は [25, 50, 100, 200] を昇順で返す", () => {
    expect(getRelayLegDistances("free")).toEqual([25, 50, 100, 200]);
  });

  it("medley は [25, 50, 100] を昇順で返す (200 を含まない)", () => {
    expect(getRelayLegDistances("medley")).toEqual([25, 50, 100]);
  });

  it("戻り値に重複が無い", () => {
    for (const kind of ["free", "medley"] as const) {
      const distances = getRelayLegDistances(kind);
      expect(new Set(distances).size).toBe(distances.length);
    }
  });

  it("戻り値を破壊的に変更しても次の呼び出しに影響しない (内部配列を露出していない)", () => {
    const first = getRelayLegDistances("free");
    first.push(9999);
    first.sort((a, b) => b - a);

    expect(getRelayLegDistances("free")).toEqual([25, 50, 100, 200]);
  });

  it("返した距離はすべてその種類の種目として RELAY_EVENTS に実在する", () => {
    for (const kind of ["free", "medley"] as const) {
      for (const legDistance of getRelayLegDistances(kind)) {
        const matching = RELAY_EVENTS.filter(
          (event) => getRelayKind(event.id) === kind && getRelayLegDistance(event.id) === legDistance,
        );
        // 選択肢に出す距離が種目として存在しないと、UI が 0 件しか返らない
        // 条件を選べてしまう (エラーは出ない)
        expect(matching).toHaveLength(1);
      }
    }
  });
});

describe("[V-RE-05] RELAY_KIND_VALUES", () => {
  it("並びは free → medley (web の <select> と mobile のシートが同じ順で描く)", () => {
    expect([...RELAY_KIND_VALUES]).toEqual(["free", "medley"]);
  });

  it("RelayKind の 2 値をちょうど網羅している (増減を検出)", () => {
    expect(RELAY_KIND_VALUES).toHaveLength(2);
    expect(new Set(RELAY_KIND_VALUES).size).toBe(2);
  });
});

describe("[V-RE-06] 距離の対応表が二重管理になっていない", () => {
  // `getRelayLegDistance` を唯一の定義元とし、境界配列・距離リスト・ラベルは
  // すべてそこから導出する。片方だけ更新されて静かに壊れることを防ぐ
  // (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
  it.each(EXPECTED)(
    "$id: getRelayLegBoundaries は 1レグ距離の 1〜4 倍になる (別表を持っていない)",
    ({ id, legDistance }) => {
      expect(getRelayLegBoundaries(id)).toEqual([
        legDistance,
        legDistance * 2,
        legDistance * 3,
        legDistance * 4,
      ]);
    },
  );

  it("fromRelayEventId の legDistance は getRelayLegDistance と一致する", () => {
    for (const { id } of EXPECTED) {
      expect(fromRelayEventId(id).legDistance).toBe(getRelayLegDistance(id));
    }
  });

  it("getRelayLegDistances の和集合は 7 種目の距離集合と一致する", () => {
    const fromKinds = new Set([
      ...getRelayLegDistances("free"),
      ...getRelayLegDistances("medley"),
    ]);
    const fromEvents = new Set(EXPECTED.map((e) => e.legDistance));

    expect([...fromKinds].sort((a, b) => a - b)).toEqual([...fromEvents].sort((a, b) => a - b));
  });
});
