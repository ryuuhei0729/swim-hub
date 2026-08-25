import { describe, it, expect } from "vitest";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";

function makeRecord(
  overrides: Partial<ExistingRecord> & { style_id: number; time: number },
): ExistingRecord {
  return {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: "u1", name: "Swimmer" },
    ...overrides,
  };
}

const STYLES = [
  { id: 1, name_jp: "25m 自由形", distance: 25 },
  { id: 2, name_jp: "50m 自由形", distance: 50 },
  { id: 3, name_jp: "100m 自由形", distance: 100 },
  { id: 9, name_jp: "50m 平泳ぎ", distance: 50 },
  { id: 13, name_jp: "50m 背泳ぎ", distance: 50 },
  { id: 17, name_jp: "50m バタフライ", distance: 50 },
];

describe("buildStyleEntriesFromExisting", () => {
  it("空配列の場合、空の StyleEntry を 1 つ返す", () => {
    const result = buildStyleEntriesFromExisting([], STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].styleId).toBe("");
    expect(result[0].memberRecords).toHaveLength(0);
  });

  it("個人種目 1 件のみ: 区間タイムがそのまま表示される", () => {
    const records = [makeRecord({ style_id: 2, time: 27.5 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result).toHaveLength(1);
    expect(result[0].styleId).toBe(2);
    expect(result[0].relayEventId).toBeUndefined();
    expect(result[0].memberRecords[0].time).toBe(27.5);
  });

  describe("Phase 1+2: メドレーリレー検出", () => {
    it("is_relaying=[false,true,true,true] + メドレー styleId 順 → 1 つの StyleEntry にまとまる", () => {
      const records = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      expect(result).toHaveLength(1);
      expect(result[0].relayEventId).toBe("relay_4x50_medley");
      expect(result[0].memberRecords).toHaveLength(4);
    });

    it("累計タイムが正しく算出される", () => {
      const records = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const mrs = result[0].memberRecords;
      expect(mrs[0].cumulativeTimeSeconds).toBe(15.0);
      expect(mrs[1].cumulativeTimeSeconds).toBe(31.0);
      expect(mrs[2].cumulativeTimeSeconds).toBe(45.5);
      expect(mrs[3].cumulativeTimeSeconds).toBe(59.0);
    });
  });

  describe("Phase 4: フリーリレー検出", () => {
    it("同一 styleId×4 + is_relaying パターン → フリーリレーとして復元", () => {
      const records = [
        makeRecord({ style_id: 2, time: 27.5, is_relaying: false }),
        makeRecord({ style_id: 2, time: 28.7, is_relaying: true }),
        makeRecord({ style_id: 2, time: 28.3, is_relaying: true }),
        makeRecord({ style_id: 2, time: 27.6, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      expect(result).toHaveLength(1);
      expect(result[0].relayEventId).toBe("relay_4x50_free");
      expect(result[0].memberRecords).toHaveLength(4);
    });
  });

  describe("個人種目とリレーの混在", () => {
    it("個人種目 + メドレーリレーが混在しても正しく分類される", () => {
      const individual = makeRecord({ style_id: 2, time: 30.0 });
      const relay = [
        makeRecord({ style_id: 13, time: 15.0, is_relaying: false }),
        makeRecord({ style_id: 9, time: 16.0, is_relaying: true }),
        makeRecord({ style_id: 17, time: 14.5, is_relaying: true }),
        makeRecord({ style_id: 2, time: 13.5, is_relaying: true }),
      ];
      const records = [individual, ...relay];
      const result = buildStyleEntriesFromExisting(records, STYLES);

      const relayEntry = result.find((e) => e.relayEventId);
      const individualEntry = result.find((e) => !e.relayEventId);
      expect(relayEntry).toBeDefined();
      expect(relayEntry!.relayEventId).toBe("relay_4x50_medley");
      expect(individualEntry).toBeDefined();
      expect(individualEntry!.memberRecords[0].time).toBe(30.0);
    });
  });

  describe("Phase 1 の誤検出防止", () => {
    it("is_relaying パターンが一致しても detectRelayEventId が null なら個別扱い", () => {
      const records = [
        makeRecord({ style_id: 99, time: 10.0, is_relaying: false }),
        makeRecord({ style_id: 99, time: 11.0, is_relaying: true }),
        makeRecord({ style_id: 99, time: 12.0, is_relaying: true }),
        makeRecord({ style_id: 99, time: 13.0, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const relayEntry = result.find((e) => e.relayEventId);
      expect(relayEntry).toBeUndefined();
    });
  });
});

// =============================================================================
// Sprint Contract 新機能テストスケルトン (Phase A)
// relaySplitTimes フィールドの復元 & 旧データ互換性
// 以下は Developer が実装後に it.todo() → 実装コードに置き換える
// =============================================================================

// ヘルパー: 4×100フリーリレー (styleId=3×4) のベースレコードを作る
function makeRelayRecords4x100Free(
  legSplits: Array<{ distance: number; split_time: number }[]>,
): ExistingRecord[] {
  const times = [57.0, 58.5, 57.8, 56.7];
  const isRelayingFlags = [false, true, true, true];
  return times.map((time, idx) => ({
    id: crypto.randomUUID(),
    user_id: `user-${idx}`,
    style_id: 3, // 100m 自由形
    time,
    is_relaying: isRelayingFlags[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx].map((st, stIdx) => ({
      id: `st-${idx}-${stIdx}`,
      distance: st.distance,
      split_time: st.split_time,
    })),
    users: { id: `user-${idx}`, name: `Swimmer ${idx + 1}` },
  }));
}

// ヘルパー: 4×50フリーリレー (styleId=2×4) のベースレコードを作る
function makeRelayRecords4x50Free(
  legSplits: Array<{ distance: number; split_time: number }[]>,
): ExistingRecord[] {
  const times = [27.5, 28.7, 28.3, 27.6];
  const isRelayingFlags = [false, true, true, true];
  return times.map((time, idx) => ({
    id: crypto.randomUUID(),
    user_id: `user-${idx}`,
    style_id: 2, // 50m 自由形
    time,
    is_relaying: isRelayingFlags[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx].map((st, stIdx) => ({
      id: `st-${idx}-${stIdx}`,
      distance: st.distance,
      split_time: st.split_time,
    })),
    users: { id: `user-${idx}`, name: `Swimmer ${idx + 1}` },
  }));
}

// ヘルパー: 4×200フリーリレー (styleId=4×4) のベースレコードを作る
function makeRelayRecords4x200Free(
  legSplits: Array<{ distance: number; split_time: number }[]>,
): ExistingRecord[] {
  const times = [115.0, 116.5, 115.8, 114.7];
  const isRelayingFlags = [false, true, true, true];
  return times.map((time, idx) => ({
    id: crypto.randomUUID(),
    user_id: `user-${idx}`,
    style_id: 4, // 200m 自由形
    time,
    is_relaying: isRelayingFlags[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx].map((st, stIdx) => ({
      id: `st-${idx}-${stIdx}`,
      distance: st.distance,
      split_time: st.split_time,
    })),
    users: { id: `user-${idx}`, name: `Swimmer ${idx + 1}` },
  }));
}

const STYLES_WITH_200 = [
  ...STYLES,
  { id: 4, name_jp: "200m 自由形", distance: 200 },
];

describe("[新機能] StyleEntry.relaySplitTimes フィールドの復元", () => {
  describe("[V-05-new] 新UI保存データの復元 (全体距離ベースのスプリット)", () => {
    it(
      "4×100フリーリレー: leg0に distance=100、leg1に distance=200 のスプリットがある場合、" +
        "relaySplitTimes に [{ distance:100, ... }, { distance:200, ... }] が格納される",
      () => {
        // leg0: distance=100 (leg内=100 = legDist → offset 0 → global 100)
        // leg1: distance=200 (> legDist=100 → 全体距離として解釈 → global 200)
        const records = makeRelayRecords4x100Free([
          [{ distance: 100, split_time: 57.0 }],
          [{ distance: 200, split_time: 115.5 }],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        expect(entry).toBeDefined();
        const relaySplits = entry!.relaySplitTimes ?? [];
        const dist100 = relaySplits.find((st) => st.distance === 100);
        const dist200 = relaySplits.find((st) => st.distance === 200);
        expect(dist100).toBeDefined();
        expect(dist200).toBeDefined();
      }
    );

    it(
      "4×100フリーリレー: leg1のスプリットが distance=100 (leg内距離) で保存されている場合、" +
        "全体距離へ変換し、DB の leg 相対 split_time を leg 開始通算タイム分だけ通算値に戻して" +
        "relaySplitTimes に格納される (D4)",
      () => {
        // leg1: distance=100 <= legDist=100 → leg内距離 → global = 100 (offset) + 100 = 200
        // times=[57.0,58.5,57.8,56.7] → cumulatives=[57.0,115.5,173.3,230.0] → legStart(leg1)=57.0
        // D4 修正前 (バグ): splitTime は DB の値 (58.5) をそのまま通算値扱いしていた。
        // D4 修正後: 58.5 (leg 相対) + legStart(57.0) = 115.5 (正しい通算値)
        const records = makeRelayRecords4x100Free([
          [],
          [{ distance: 100, split_time: 58.5 }],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        expect(entry).toBeDefined();
        const relaySplits = entry!.relaySplitTimes ?? [];
        const dist200 = relaySplits.find((st) => st.distance === 200);
        expect(dist200).toBeDefined();
        expect(dist200!.splitTime).toBe(115.5);
      }
    );

    it(
      "4×200フリーリレー: leg2に distance=25 のスプリット (leg内距離) がある場合、" +
        "全体距離 = 200*2 + 25 = 425、通算タイムは leg2 開始通算タイム (231.5) を加算した値で" +
        "relaySplitTimes に格納される (D4)",
      () => {
        // leg2: distance=25 <= legDist=200 → leg内距離 → global = 400 (offset) + 25 = 425
        // times=[115.0,116.5,115.8,114.7] → cumulatives=[115.0,231.5,347.3,462.0] → legStart(leg2)=231.5
        // 14.5 (leg 相対) + 231.5 (legStart) = 246.0 (正しい通算値)
        const records = makeRelayRecords4x200Free([
          [],
          [],
          [{ distance: 25, split_time: 14.5 }],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200);
        const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
        expect(entry).toBeDefined();
        const relaySplits = entry!.relaySplitTimes ?? [];
        const dist425 = relaySplits.find((st) => st.distance === 425);
        expect(dist425).toBeDefined();
        expect(dist425!.splitTime).toBe(246.0);
      }
    );

    it(
      "保存された split_times が空でも、leg タイムから leg境界スプリット (100,200,300,400) が" +
        "累計タイムとして復元される",
      () => {
        // 保存時に leg 境界スプリットは「ゴールタイム = split ではない」フィルタで必ず捨てられるため、
        // DB 上は split_times が空になる。値は各 leg の time から復元できるので、再オープン時に
        // 入力済みのラップタイムが空欄に戻ってはいけない。
        const records = makeRelayRecords4x100Free([[], [], [], []]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        expect(entry).toBeDefined();

        const relaySplits = entry!.relaySplitTimes ?? [];
        // 累計: 57.0 / 115.5 / 173.3 / 230.0 (times = [57.0, 58.5, 57.8, 56.7])
        expect(relaySplits.map((st) => st.distance)).toEqual([100, 200, 300, 400]);
        expect(relaySplits.map((st) => st.splitTime)).toEqual([57.0, 115.5, 173.3, 230.0]);
      },
    );

    it("leg タイムが全て 0 の場合、復元する累計タイムが無いので relaySplitTimes は空配列になる", () => {
      const records = makeRelayRecords4x100Free([[], [], [], []]).map((r) => ({ ...r, time: 0 }));
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
      expect(entry).toBeDefined();
      expect(entry!.relaySplitTimes ?? []).toHaveLength(0);
    });

    it(
      "4×50フリーリレー: 全4 leg の境界スプリット (50,100,150,200) が揃っている場合、" +
        "relaySplitTimes の長さは4になる",
      () => {
        // 各 leg に distance=50 (= legDist) のスプリット → leg内距離 → offsetを足す
        // leg0: 0+50=50, leg1: 50+50=100, leg2: 100+50=150, leg3: 150+50=200
        const records = makeRelayRecords4x50Free([
          [{ distance: 50, split_time: 27.5 }],
          [{ distance: 50, split_time: 28.7 }],
          [{ distance: 50, split_time: 28.3 }],
          [{ distance: 50, split_time: 27.6 }],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x50_free");
        expect(entry).toBeDefined();
        expect(entry!.relaySplitTimes ?? []).toHaveLength(4);
      }
    );
  });

  describe("[V-06-new] 復元時の cumulativeTimeSeconds 計算と leg境界スプリットの対応", () => {
    it(
      "4×50フリーリレー: 各 leg のタイムから算出した累計タイムが、" +
        "leg境界距離 (200m) のスプリットタイムと一致する",
      () => {
        // leg0〜3 に距離=50 (= legDist) のスプリットを格納
        // leg3の splitTime (= 27.6) が leg3の区間タイム、累計は 27.5+28.7+28.3+27.6=112.1
        const records = makeRelayRecords4x50Free([
          [{ distance: 50, split_time: 27.5 }],
          [{ distance: 50, split_time: 28.7 }],
          [{ distance: 50, split_time: 28.3 }],
          [{ distance: 50, split_time: 27.6 }],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x50_free");
        expect(entry).toBeDefined();
        // leg3 の cumulative は 112.1
        expect(entry!.memberRecords[3].cumulativeTimeSeconds).toBeCloseTo(112.1, 1);
        // relaySplitTimes の distance=200 のスプリット (leg3 → offset150+50=200) は
        // D4 修正により leg 相対値 (27.6) + legStart(84.5) = 112.1 (leg3 の全区間 = 累計と一致)
        const dist200 = (entry!.relaySplitTimes ?? []).find((st) => st.distance === 200);
        expect(dist200).toBeDefined();
        expect(dist200!.splitTime).toBeCloseTo(112.1, 1);
      }
    );

    it("合計タイム (全体距離スプリット) が未入力の場合、cumulativeTimeSeconds は 0 になる", () => {
      const records = [
        makeRecord({ style_id: 3, time: 0, is_relaying: false }),
        makeRecord({ style_id: 3, time: 0, is_relaying: true }),
        makeRecord({ style_id: 3, time: 0, is_relaying: true }),
        makeRecord({ style_id: 3, time: 0, is_relaying: true }),
      ];
      const result = buildStyleEntriesFromExisting(records, STYLES);
      // style_id=3×4 → relay_4x100_free として復元されるはず
      const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
      expect(entry).toBeDefined();
      expect(entry!.memberRecords[3].cumulativeTimeSeconds).toBe(0);
    });
  });
});

describe("[Risk-1] 旧データ互換性: leg内距離 vs リレー全体距離の自動判定", () => {
  describe("leg内距離として保存されたスプリットの変換", () => {
    it(
      "4×100フリーリレー: leg1に distance=100 (= legDist) のスプリットがある場合 (旧UI保存)、" +
        "全体距離 = 200 に変換される (leg1のオフセット = 100)",
      () => {
        const records = makeRelayRecords4x100Free([
          [],
          [{ distance: 100, split_time: 58.5 }],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        // leg1 の 100m スプリットは leg 内距離と解釈され、全体距離 200 へ変換される。
        // D4 修正により splitTime も leg 相対値として legStart(57.0) を加算した通算値になる。
        expect(relaySplits.find((st) => st.distance === 200)?.splitTime).toBe(115.5);
        // 距離 100 に入るのは leg0 の累計タイム (57.0) であって、未変換の leg1 の値ではない
        expect(relaySplits.find((st) => st.distance === 100)?.splitTime).toBe(57.0);
      }
    );

    it(
      "4×100フリーリレー: leg2に distance=50 (< legDist) のスプリットがある場合 (旧UI保存)、" +
        "全体距離 = 250 に変換される (leg2のオフセット = 200)",
      () => {
        const records = makeRelayRecords4x100Free([
          [],
          [],
          [{ distance: 50, split_time: 28.0 }],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        expect(relaySplits.find((st) => st.distance === 250)).toBeDefined();
      }
    );

    it(
      "4×50フリーリレー: leg3に distance=50 (= legDist) のスプリットがある場合 (旧UI保存)、" +
        "全体距離 = 200 に変換される (leg3のオフセット = 150)",
      () => {
        const records = makeRelayRecords4x50Free([
          [],
          [],
          [],
          [{ distance: 50, split_time: 27.6 }],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x50_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        expect(relaySplits.find((st) => st.distance === 200)).toBeDefined();
      }
    );
  });

  describe("全体距離として保存されたスプリットの復元 (distance > legDist の legacy 分岐)", () => {
    // QA注記 (Critical・Developer報告事項):
    // st.distance > legDist の分岐は「distance も splitTime も既に全体距離/通算値として
    // 保存された旧世代データ」を想定した既存の互換ロジック (このスプリント以前から存在)。
    // distance はこの分岐で無変換のまま使われる (`st.distance > legDist ? st.distance : ...`)
    // ので、対になる splitTime も無変換であるべき — にもかかわらず D4 の実装
    // (buildStyleEntries.ts / relayEvents.ts) は `toCumulativeSplitTime` を分岐に関わらず
    // 常に適用しており、この legacy 分岐の splitTime まで legStart 分だけ二重にシフトしてしまう
    // (実測: 115.5 → 172.5)。したがってこのテストは意図的に「修正前の正しい値」を pin し、
    // 現状は red のままにしている (QA が観測挙動に合わせて期待値を書き換えると、この
    // regression が仕様として固定されてしまうため)。Developer 側で
    // `st.distance > legDist` の分岐では toCumulativeSplitTime を呼ばない (distance の
    // 変換有無と splitTime の変換有無を対称にする) 対応が必要。
    it(
      "4×100フリーリレー: leg1に distance=200 (> legDist, = 全体距離) のスプリットがある場合 (新UI保存)、" +
        "distance も splitTime も変換なしでそのまま relaySplitTimes に格納される",
      () => {
        const records = makeRelayRecords4x100Free([
          [],
          [{ distance: 200, split_time: 115.5 }],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        const dist200 = relaySplits.find((st) => st.distance === 200);
        expect(dist200).toBeDefined();
        expect(dist200!.splitTime).toBe(115.5);
      }
    );

    it(
      "4×200フリーリレー: leg2に distance=500 (> legDist=200) のスプリットがある場合 (新UI保存)、" +
        "distance も splitTime も変換なしでそのまま relaySplitTimes に格納される",
      () => {
        const records = makeRelayRecords4x200Free([
          [],
          [],
          [{ distance: 500, split_time: 289.0 }],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200);
        const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        const dist500 = relaySplits.find((st) => st.distance === 500);
        expect(dist500).toBeDefined();
        // splitTime も無変換のはずだが、現状の実装は legStart(231.5) を加算してしまい
        // 289.0 ではなく 520.5 を返す (Critical regression, 上記コメント参照)
        expect(dist500!.splitTime).toBe(289.0);
      }
    );
  });

  describe("境界値: distance = legDist の判定", () => {
    it(
      "4×100フリーリレー: leg0に distance=100 (= legDist) のスプリット → 全体距離 = 100 (変換なし)",
      () => {
        const records = makeRelayRecords4x100Free([
          [{ distance: 100, split_time: 57.0 }],
          [],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        // leg0 のオフセット = 0, distance=100 <= legDist=100 → global = 0 + 100 = 100
        expect(relaySplits.find((st) => st.distance === 100)).toBeDefined();
      }
    );

    it(
      "4×100フリーリレー: leg1に distance=100 (= legDist) のスプリット → 全体距離 = 200 (leg内距離解釈)",
      () => {
        const records = makeRelayRecords4x100Free([
          [],
          [{ distance: 100, split_time: 58.5 }],
          [],
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        // leg1 のオフセット = 100, distance=100 <= legDist=100 → global = 100 + 100 = 200
        // leg1 の 100m スプリットは leg 内距離と解釈され、全体距離 200 へ変換される。
        // D4 修正により splitTime も leg 相対値として legStart(57.0) を加算した通算値になる。
        expect(relaySplits.find((st) => st.distance === 200)?.splitTime).toBe(115.5);
        // 距離 100 に入るのは leg0 の累計タイム (57.0) であって、未変換の leg1 の値ではない
        expect(relaySplits.find((st) => st.distance === 100)?.splitTime).toBe(57.0);
      }
    );
  });

  describe("混在ケース: leg によって新旧形式が混在する場合", () => {
    it(
      "4×100フリーリレー: leg0は全体距離 100、leg1は leg内距離 100 (→200)、" +
        "leg2は全体距離 300 が混在しても relaySplitTimes に正しくマージされる",
      () => {
        const records = makeRelayRecords4x100Free([
          [{ distance: 100, split_time: 57.0 }],    // leg0: distance<=100 → offset0 → 100
          [{ distance: 100, split_time: 58.5 }],    // leg1: distance<=100 → offset100 → 200
          [{ distance: 300, split_time: 172.8 }],   // leg2: distance>100 → 全体距離 → 300
          [],
        ]);
        const result = buildStyleEntriesFromExisting(records, STYLES);
        const entry = result.find((e) => e.relayEventId === "relay_4x100_free");
        const relaySplits = entry!.relaySplitTimes ?? [];
        expect(relaySplits.find((st) => st.distance === 100)).toBeDefined();
        expect(relaySplits.find((st) => st.distance === 200)).toBeDefined();
        // leg0 (legStart=0): splitTime 変換なし
        expect(relaySplits.find((st) => st.distance === 100)?.splitTime).toBe(57.0);
        // leg1 (legStart=57.0, <=legDist分岐): splitTime は 58.5 + 57.0 = 115.5 に変換される
        expect(relaySplits.find((st) => st.distance === 200)?.splitTime).toBe(115.5);
        // leg2 (>legDist の legacy 分岐): splitTime は無変換のはず (172.8) だが、
        // 上記の Critical regression により legStart(115.5) が加算され 288.3 になる。
        // ここは QA が観測挙動を pin せず、正しい仕様値のまま残す (現状 red)。
        expect(relaySplits.find((st) => st.distance === 300)?.splitTime).toBe(172.8);
        expect(relaySplits.find((st) => st.distance === 300)).toBeDefined();
      }
    );
  });
});

// =============================================================================
// [C3] DB復元検証: 新UI保存後のDBレコード → relaySplitTimes 復元の対称性
//
// 方針: simulateSave (保存ロジックのコピー) を排除し、期待される DB レコードを
// 直接ハードコードしてから buildStyleEntriesFromExisting に渡す。
// これにより、保存ロジックのバグがテストに伝染するトートロジーを防止する。
//
// 保存時変換の仕様（テストデータ作成の根拠）:
//   保存距離 = legIdx===0 ? st.distance : st.distance - legBoundaries[legIdx-1]
//
// 4×200フリー (legDist=200) の境界値:
//   全体距離 200 → leg0 内距離 200 (offset=0)
//   全体距離 400 → leg1 内距離 200 (offset=200)
//   全体距離 600 → leg2 内距離 200 (offset=400)
//   全体距離 800 → leg3 内距離 200 (offset=600)
//
// Reviewer の懸念「4×200でdistance==legDistの曖昧性」は実害なし。
// legOffset+distance の計算が常に正確な全体距離を返すため。
// =============================================================================

describe("[C3] DB復元: 4×200フリーリレーの復元対称性", () => {
  const STYLES_WITH_200_EXTENDED = [
    { id: 1, name_jp: "25m 自由形", distance: 25 },
    { id: 2, name_jp: "50m 自由形", distance: 50 },
    { id: 3, name_jp: "100m 自由形", distance: 100 },
    { id: 4, name_jp: "200m 自由形", distance: 200 },
    { id: 9, name_jp: "50m 平泳ぎ", distance: 50 },
    { id: 13, name_jp: "50m 背泳ぎ", distance: 50 },
    { id: 17, name_jp: "50m バタフライ", distance: 50 },
  ];

  it("全 leg 境界スプリット (200,400,600,800) が正しく復元される", () => {
    // 期待される DB 保存状態をハードコード (D2 修正後: distance は leg 内距離、
    // splitTime も leg 相対値。ここでは各 leg 自身の全区間タイムをそのまま入れているため
    // legStart=0 の leg0 のみ無変換で、leg1〜3 は D4 で legStart が加算されて
    // 全体距離スプリット [200→115.0, 400→231.5, 600→347.3, 800→462.0] に復元される
    const records = makeRelayRecords4x200Free([
      [{ distance: 200, split_time: 115.0 }], // leg0: 全体200m → leg内200m (legStart=0)
      [{ distance: 200, split_time: 116.5 }], // leg1: leg 相対 116.5 + legStart(115.0) = 231.5
      [{ distance: 200, split_time: 115.8 }], // leg2: leg 相対 115.8 + legStart(231.5) = 347.3
      [{ distance: 200, split_time: 114.7 }], // leg3: leg 相対 114.7 + legStart(347.3) = 462.0
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200_EXTENDED);
    const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    // 4つのスプリットが全て異なる全体距離に復元される
    expect(relaySplits).toHaveLength(4);
    const distances = relaySplits.map((st) => st.distance).sort((a, b) => a - b);
    expect(distances).toEqual([200, 400, 600, 800]);

    // タイムが正しく復元される (D4: leg 相対値 + legStart = 通算値)
    expect(relaySplits.find((st) => st.distance === 200 && Math.abs(st.splitTime - 115.0) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 400 && Math.abs(st.splitTime - 231.5) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 600 && Math.abs(st.splitTime - 347.3) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 800 && Math.abs(st.splitTime - 462.0) < 0.01)).toBeDefined();
  });

  it("leg内中間スプリット (50m刻み) が正しく復元される", () => {
    // 新UIで入力した全体距離スプリット (管理者が entry.relaySplitTimes に入力した値):
    //   leg0: 50→28.0, 100→57.0, 150→86.0, 200→115.0
    //   leg1: 250→143.5, 300→172.0, 350→200.5, 400→231.5
    // D2 修正後の保存時変換 (distance は leg 内距離、splitTime も legStart(115.0) を
    // 引いた leg 相対値):
    //   leg0 (legStart=0): 50,100,150,200 → そのまま保存 (offset=0, splitTime無変換)
    //   leg1 (legStart=115.0): distance = 250-200=50 / splitTime = 143.5-115.0=28.5
    //                           distance = 300-200=100 / splitTime = 172.0-115.0=57.0
    //                           distance = 350-200=150 / splitTime = 200.5-115.0=85.5
    //                           distance = 400-200=200 / splitTime = 231.5-115.0=116.5
    const records = makeRelayRecords4x200Free([
      [
        { distance: 50, split_time: 28.0 },
        { distance: 100, split_time: 57.0 },
        { distance: 150, split_time: 86.0 },
        { distance: 200, split_time: 115.0 },
      ],
      [
        { distance: 50, split_time: 28.5 },   // 全体250m → leg内50m (leg相対値)
        { distance: 100, split_time: 57.0 },  // 全体300m → leg内100m (leg相対値)
        { distance: 150, split_time: 85.5 },  // 全体350m → leg内150m (leg相対値)
        { distance: 200, split_time: 116.5 }, // 全体400m → leg内200m (leg相対値)
      ],
      [],
      [],
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200_EXTENDED);
    const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    // leg0 のスプリットが全体距離として復元される
    expect(relaySplits.find((st) => st.distance === 50 && Math.abs(st.splitTime - 28.0) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 200 && Math.abs(st.splitTime - 115.0) < 0.01)).toBeDefined();
    // leg1 のスプリットが全体距離に変換されて復元される (leg内+200)
    expect(relaySplits.find((st) => st.distance === 250 && Math.abs(st.splitTime - 143.5) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 400 && Math.abs(st.splitTime - 231.5) < 0.01)).toBeDefined();
  });

  it("[C3重要] legDist=200 の境界値: distance===legDist の leg内距離解釈が曖昧にならないことを確認", () => {
    // 各 leg に distance=200 (= legDist) のスプリットがある場合
    // legOffset に基づいて正確に全体距離へ変換される
    const records = makeRelayRecords4x200Free([
      [{ distance: 200, split_time: 115.0 }], // leg0: legOffset=0  → global=200
      [{ distance: 200, split_time: 116.5 }], // leg1: legOffset=200 → global=400
      [{ distance: 200, split_time: 115.8 }], // leg2: legOffset=400 → global=600
      [{ distance: 200, split_time: 114.7 }], // leg3: legOffset=600 → global=800
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200_EXTENDED);
    const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    expect(relaySplits).toHaveLength(4);
    const distances = relaySplits.map((st) => st.distance).sort((a, b) => a - b);
    expect(distances).toEqual([200, 400, 600, 800]);
  });
});

describe("[C3] DB復元: 4×100メドレーリレーの復元対称性", () => {
  const STYLES_WITH_MEDLEY = [
    { id: 3, name_jp: "100m 自由形", distance: 100 },
    { id: 10, name_jp: "100m 平泳ぎ", distance: 100 },
    { id: 14, name_jp: "100m 背泳ぎ", distance: 100 },
    { id: 18, name_jp: "100m バタフライ", distance: 100 },
  ];

  function makeRelayRecords4x100Medley(
    legSplits: Array<{ distance: number; split_time: number }[]>,
  ): ExistingRecord[] {
    const times = [62.0, 70.5, 64.8, 58.7];
    const isRelayingFlags = [false, true, true, true];
    // ba=14, br=10, fly=18, fr=3 (relay_4x100_medley)
    const styleIds = [14, 10, 18, 3];
    return times.map((time, idx) => ({
      id: crypto.randomUUID(),
      user_id: `user-${idx}`,
      style_id: styleIds[idx],
      time,
      is_relaying: isRelayingFlags[idx],
      reaction_time: null,
      note: null,
      split_times: legSplits[idx].map((st, stIdx) => ({
        id: `st-${idx}-${stIdx}`,
        distance: st.distance,
        split_time: st.split_time,
      })),
      users: { id: `user-${idx}`, name: `Swimmer ${idx + 1}` },
    }));
  }

  it("全 leg 境界スプリット (100,200,300,400) が正しく復元される", () => {
    // 新UIで全体距離スプリット [100→62.0, 200→132.5, 300→197.3, 400→256.0] を入力
    // (times=[62.0,70.5,64.8,58.7] → cumulatives=[62.0,132.5,197.3,256.0])
    // D2 修正後の保存時変換: distance は leg 内距離 (offset差分)、splitTime は
    // legStart を引いた leg 相対値 (= 各 leg 自身の time と一致する)
    //   leg0 (legStart=0):    distance=100          / splitTime=62.0
    //   leg1 (legStart=62.0): distance=200-100=100  / splitTime=132.5-62.0=70.5
    //   leg2 (legStart=132.5):distance=300-200=100  / splitTime=197.3-132.5=64.8
    //   leg3 (legStart=197.3):distance=400-300=100  / splitTime=256.0-197.3=58.7
    const records = makeRelayRecords4x100Medley([
      [{ distance: 100, split_time: 62.0 }],  // leg0: 全体100m → leg内100m (leg相対値)
      [{ distance: 100, split_time: 70.5 }],  // leg1: 全体200m → leg内100m (leg相対値)
      [{ distance: 100, split_time: 64.8 }],  // leg2: 全体300m → leg内100m (leg相対値)
      [{ distance: 100, split_time: 58.7 }],  // leg3: 全体400m → leg内100m (leg相対値)
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_MEDLEY);
    const entry = result.find((e) => e.relayEventId === "relay_4x100_medley");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    expect(relaySplits).toHaveLength(4);
    const distances = relaySplits.map((st) => st.distance).sort((a, b) => a - b);
    expect(distances).toEqual([100, 200, 300, 400]);

    // タイムが通算値 (D4: leg 相対値 + legStart) として正しく復元される
    const dist100 = relaySplits.find((st) => st.distance === 100);
    const dist200 = relaySplits.find((st) => st.distance === 200);
    expect(dist100?.splitTime).toBeCloseTo(62.0, 1);
    expect(dist200?.splitTime).toBeCloseTo(132.5, 1);
  });

  it("中間スプリット (50m刻み) が正しく復元される", () => {
    // 新UIで全体距離スプリット: 50→30.5, 100→62.0, 150→96.0, 200→132.5
    // D2 修正後の保存時変換 (distance は offset差分、splitTime は legStart(62.0) を
    // 引いた leg 相対値):
    //   leg0 (legStart=0):    50,100 → そのまま (splitTime無変換)
    //   leg1 (legStart=62.0): distance=150-100=50 / splitTime=96.0-62.0=34.0
    //                          distance=200-100=100 / splitTime=132.5-62.0=70.5
    const records = makeRelayRecords4x100Medley([
      [
        { distance: 50, split_time: 30.5 },
        { distance: 100, split_time: 62.0 },
      ],
      [
        { distance: 50, split_time: 34.0 },   // 全体150m → leg内50m (leg相対値)
        { distance: 100, split_time: 70.5 },  // 全体200m → leg内100m (leg相対値)
      ],
      [],
      [],
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_MEDLEY);
    const entry = result.find((e) => e.relayEventId === "relay_4x100_medley");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    // leg0 のスプリット (全体距離そのまま)
    expect(relaySplits.find((st) => st.distance === 50 && Math.abs(st.splitTime - 30.5) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 100 && Math.abs(st.splitTime - 62.0) < 0.01)).toBeDefined();
    // leg1 のスプリット (leg内距離+offset=100 で全体距離に変換)
    expect(relaySplits.find((st) => st.distance === 150 && Math.abs(st.splitTime - 96.0) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 200 && Math.abs(st.splitTime - 132.5) < 0.01)).toBeDefined();
  });
});

// =============================================================================
// [Warning-1] handleRelayTotalTimeChange の ?? → > 0 修正の単体検証
//
// 修正前: newCumulatives[idx] ?? mr.cumulativeTimeSeconds ?? 0
//   → newCumulatives[idx] === 0 のとき 0 ?? ... が 0 を返す (既存値を上書き)
// 修正後: newCum > 0 ? newCum : (mr.cumulativeTimeSeconds ?? 0)
//   → newCumulatives[idx] === 0 のとき既存の cumulativeTimeSeconds を保持する
//
// RecordClient.tsx 内の React ステート更新ロジックを直接テストできないため、
// 修正した条件式と同等のピュア関数として抽出して検証する。
// =============================================================================

// =============================================================================
// [V-GUARD-01] Sprint Contract: buildStyleEntriesFromExisting の styleName フィールドが
// name_jp の生値 (日本語) を保持する。翻訳後フィールドではないことを確認する。
// =============================================================================

describe("[V-GUARD-01] buildStyleEntriesFromExisting: styleName フィールドが name_jp 生値を保持する", () => {
  it("style_id=2 (50m 自由形) の record → result[0].styleName === '50m 自由形'", () => {
    const records = [makeRecord({ style_id: 2, time: 27.5 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result[0].styleName).toBe("50m 自由形");
  });

  it("style_id=13 (50m 背泳ぎ) の record → result[0].styleName === '50m 背泳ぎ'", () => {
    const records = [makeRecord({ style_id: 13, time: 32.1 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result[0].styleName).toBe("50m 背泳ぎ");
  });

  it("styles に存在しない style_id=99 → result[0].styleName === ''", () => {
    const records = [makeRecord({ style_id: 99, time: 30.0 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result[0].styleName).toBe("");
  });

  it("空配列 → result[0].styleName === '' (空エントリーのフォールバック)", () => {
    const result = buildStyleEntriesFromExisting([], STYLES);
    expect(result[0].styleName).toBe("");
  });

  it("styleName が翻訳後フィールドでないことを確認: '50m 自由形' に 'Freestyle' が含まれない", () => {
    const records = [makeRecord({ style_id: 2, time: 27.5 })];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result[0].styleName).not.toContain("Freestyle");
    expect(result[0].styleName).not.toContain("Free");
  });
});

describe("[Warning-1] cumTime の ?? フォールバック修正の検証", () => {
  // 修正後ロジックと同等の純粋関数
  function resolveCumTime(newCum: number, existingCum: number | null | undefined): number {
    return newCum > 0 ? newCum : (existingCum ?? 0);
  }

  it("newCum が正の値のとき、newCum をそのまま採用する", () => {
    expect(resolveCumTime(57.0, 0)).toBe(57.0);
    expect(resolveCumTime(114.5, 57.0)).toBe(114.5);
    expect(resolveCumTime(0.1, null)).toBe(0.1);
  });

  it("newCum === 0 のとき (未入力 leg)、既存の cumulativeTimeSeconds を保持する", () => {
    // 修正前の ?? では 0 ?? 57.0 = 0 となり既存値が消えた
    // 修正後の > 0 では 0 > 0 = false → 57.0 を返す
    expect(resolveCumTime(0, 57.0)).toBe(57.0);
    expect(resolveCumTime(0, 114.5)).toBe(114.5);
    expect(resolveCumTime(0, 172.8)).toBe(172.8);
  });

  it("newCum === 0 かつ既存値が null/undefined のとき、0 を返す", () => {
    expect(resolveCumTime(0, null)).toBe(0);
    expect(resolveCumTime(0, undefined)).toBe(0);
  });

  it("合計タイム入力シナリオ: leg0-2 に既存累計タイムがある状態で合計タイムを入力", () => {
    // スプリット入力で leg0=57.0, leg1=114.5, leg2=172.8 の累計が入っている
    // 合計タイム欄に 230.0 を入力 → handleRelayTotalTimeChange が呼ばれる
    // このとき newCumulatives = [0, 0, 0, 230.0] (境界スプリットは最終 leg のみ更新)
    const existingCumulatives = [57.0, 114.5, 172.8, 0];
    const newCumulatives = [0, 0, 0, 230.0];

    const result = existingCumulatives.map((existing, idx) =>
      resolveCumTime(newCumulatives[idx], existing)
    );

    // leg0-2 の既存累計タイムが保持される
    expect(result[0]).toBe(57.0);
    expect(result[1]).toBe(114.5);
    expect(result[2]).toBe(172.8);
    // leg3 は新しい合計タイムで更新される
    expect(result[3]).toBe(230.0);
  });
});

// =============================================================================
// 保存 → 再オープンの往復でラップタイムが失われないことの回帰テスト
//
// 保存時、次の 2 種類のスプリットは「ゴールタイムは split ではない」フィルタで
// 必ず捨てられる (RecordClient / TeamRecordBulkFormScreen の validSplitTimes):
//   - リレー: leg 内距離へ変換した結果その leg の種目距離と一致する leg 境界スプリット
//   - 個人種目: 種目距離と同じ距離のゴール地点スプリット
// いずれも records.time から復元できるため、再オープン時に空欄へ戻してはいけない。
// =============================================================================
describe("保存→再オープンのラップタイム復元", () => {
  describe("リレー", () => {
    it("leg 内中間スプリットと復元された leg 境界スプリットが共存する", () => {
      // 4×100 フリー (times = [57.0, 58.5, 57.8, 56.7], 累計 = [57.0, 115.5, 173.3, 230.0])
      // leg0 に 50m 地点の中間スプリットのみ保存されている状態
      const records = makeRelayRecords4x100Free([
        [{ distance: 50, split_time: 27.2 }],
        [],
        [],
        [],
      ]);
      const result = buildStyleEntriesFromExisting(records, STYLES);
      const relaySplits = result.find((e) => e.relayEventId === "relay_4x100_free")!
        .relaySplitTimes!;

      // 距離昇順で 中間(50) + 境界(100,200,300,400)
      expect(relaySplits.map((st) => st.distance)).toEqual([50, 100, 200, 300, 400]);
      expect(relaySplits.find((st) => st.distance === 50)!.splitTime).toBe(27.2);
      expect(relaySplits.find((st) => st.distance === 300)!.splitTime).toBe(173.3);
    });

    it("復元された境界スプリットの値が各 leg の cumulativeTimeSeconds と一致する", () => {
      const records = makeRelayRecords4x50Free([[], [], [], []]);
      const entry = buildStyleEntriesFromExisting(records, STYLES).find(
        (e) => e.relayEventId === "relay_4x50_free",
      )!;
      const boundaries = [50, 100, 150, 200];

      // 境界スプリットは各 leg の累計タイムそのもの。ズレると合計タイム欄と矛盾する
      boundaries.forEach((distance, idx) => {
        expect(entry.relaySplitTimes!.find((st) => st.distance === distance)!.splitTime).toBe(
          entry.memberRecords[idx].cumulativeTimeSeconds,
        );
      });
    });
  });

  describe("個人種目", () => {
    it("ラップタイムを持つ記録には、ゴール地点スプリット (種目距離 = 記録タイム) が復元される", () => {
      // 100m 自由形 (styleId=3, distance=100) で 50m 通過 26.0 / ゴール 54.0 を入力して保存すると、
      // DB には 50m のみが残る
      const records = [
        makeRecord({
          style_id: 3,
          time: 54.0,
          split_times: [{ id: "st-1", distance: 50, split_time: 26.0 }],
        }),
      ];
      const splitTimes = buildStyleEntriesFromExisting(records, STYLES)[0].memberRecords[0]
        .splitTimes;

      expect(splitTimes.map((st) => st.distance)).toEqual([50, 100]);
      expect(splitTimes.find((st) => st.distance === 100)!.splitTime).toBe(54.0);
    });

    it("ラップタイムを 1 件も持たない記録には、ゴール地点スプリットを追加しない", () => {
      // ラップ未入力の行に空でない入力欄を勝手に生やさないため
      const records = [makeRecord({ style_id: 3, time: 54.0, split_times: [] })];
      const splitTimes = buildStyleEntriesFromExisting(records, STYLES)[0].memberRecords[0]
        .splitTimes;

      expect(splitTimes).toHaveLength(0);
    });

    it("既にゴール距離のスプリットが保存されている場合、重複追加しない", () => {
      const records = [
        makeRecord({
          style_id: 3,
          time: 54.0,
          split_times: [
            { id: "st-1", distance: 50, split_time: 26.0 },
            { id: "st-2", distance: 100, split_time: 54.0 },
          ],
        }),
      ];
      const splitTimes = buildStyleEntriesFromExisting(records, STYLES)[0].memberRecords[0]
        .splitTimes;

      expect(splitTimes.filter((st) => st.distance === 100)).toHaveLength(1);
    });

    it("フリーリレーとして復元された StyleEntry の leg には、ゴール地点スプリットを足さない", () => {
      // Phase 4 でリレー化した leg に「種目距離 = leg タイム」を足すと、
      // relaySplitTimes 上では累計タイムと取り違えた値になる
      const records = makeRelayRecords4x100Free([
        [{ distance: 50, split_time: 27.2 }],
        [],
        [],
        [],
      ]);
      const entry = buildStyleEntriesFromExisting(records, STYLES).find(
        (e) => e.relayEventId === "relay_4x100_free",
      )!;

      // leg0 の splitTimes は保存済みの 50m のみ (100m = leg タイム 57.0 が足されていない)
      expect(entry.memberRecords[0].splitTimes.map((st) => st.distance)).toEqual([50]);
    });
  });
});
