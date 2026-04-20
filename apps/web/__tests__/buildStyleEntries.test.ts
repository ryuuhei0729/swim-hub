import { describe, it, expect } from "vitest";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../app/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/buildStyleEntries";

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
        "全体距離へ変換して distance=200 として relaySplitTimes に格納される",
      () => {
        // leg1: distance=100 <= legDist=100 → leg内距離 → global = 100 (offset) + 100 = 200
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
        expect(dist200!.splitTime).toBe(58.5);
      }
    );

    it(
      "4×200フリーリレー: leg2に distance=25 のスプリット (leg内距離) がある場合、" +
        "全体距離 = 200*2 + 25 = 425 として relaySplitTimes に格納される",
      () => {
        // leg2: distance=25 <= legDist=200 → leg内距離 → global = 400 (offset) + 25 = 425
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
        expect(dist425!.splitTime).toBe(14.5);
      }
    );

    it("全 leg のスプリットが空の場合、relaySplitTimes は空配列になる", () => {
      const records = makeRelayRecords4x100Free([[], [], [], []]);
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
        // relaySplitTimes の distance=200 のスプリット (leg3 → offset150+50=200) の値は 27.6
        const dist200 = (entry!.relaySplitTimes ?? []).find((st) => st.distance === 200);
        expect(dist200).toBeDefined();
        expect(dist200!.splitTime).toBe(27.6);
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
        expect(relaySplits.find((st) => st.distance === 200)).toBeDefined();
        expect(relaySplits.find((st) => st.distance === 100)).toBeUndefined();
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

  describe("全体距離として保存されたスプリットの復元", () => {
    it(
      "4×100フリーリレー: leg1に distance=200 (> legDist, = 全体距離) のスプリットがある場合 (新UI保存)、" +
        "変換なしで distance=200 のまま relaySplitTimes に格納される",
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
        "変換なしで distance=500 のまま relaySplitTimes に格納される",
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
        expect(relaySplits.find((st) => st.distance === 500)).toBeDefined();
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
        expect(relaySplits.find((st) => st.distance === 200)).toBeDefined();
        expect(relaySplits.find((st) => st.distance === 100)).toBeUndefined();
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
    // 期待される DB 保存状態をハードコード:
    // 新UIで全体距離スプリット [200→115.0, 400→231.5, 600→347.3, 800→462.0] を入力
    // 保存時に各 leg 内距離へ変換: leg0=200, leg1=200, leg2=200, leg3=200
    const records = makeRelayRecords4x200Free([
      [{ distance: 200, split_time: 115.0 }], // leg0: 全体200m → leg内200m
      [{ distance: 200, split_time: 116.5 }], // leg1: 全体400m → 400-200=200
      [{ distance: 200, split_time: 115.8 }], // leg2: 全体600m → 600-400=200
      [{ distance: 200, split_time: 114.7 }], // leg3: 全体800m → 800-600=200
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_200_EXTENDED);
    const entry = result.find((e) => e.relayEventId === "relay_4x200_free");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    // 4つのスプリットが全て異なる全体距離に復元される
    expect(relaySplits).toHaveLength(4);
    const distances = relaySplits.map((st) => st.distance).sort((a, b) => a - b);
    expect(distances).toEqual([200, 400, 600, 800]);

    // タイムが正しく復元される
    expect(relaySplits.find((st) => st.distance === 200 && Math.abs(st.splitTime - 115.0) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 400 && Math.abs(st.splitTime - 116.5) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 600 && Math.abs(st.splitTime - 115.8) < 0.01)).toBeDefined();
    expect(relaySplits.find((st) => st.distance === 800 && Math.abs(st.splitTime - 114.7) < 0.01)).toBeDefined();
  });

  it("leg内中間スプリット (50m刻み) が正しく復元される", () => {
    // 新UIで入力した全体距離スプリット:
    //   leg0: 50→28.0, 100→57.0, 150→86.0, 200→115.0
    //   leg1: 250→143.5, 300→172.0, 350→200.5, 400→231.5
    // 保存時変換:
    //   leg0: 50,100,150,200 → そのまま保存 (offset=0)
    //   leg1: 250-200=50, 300-200=100, 350-200=150, 400-200=200
    const records = makeRelayRecords4x200Free([
      [
        { distance: 50, split_time: 28.0 },
        { distance: 100, split_time: 57.0 },
        { distance: 150, split_time: 86.0 },
        { distance: 200, split_time: 115.0 },
      ],
      [
        { distance: 50, split_time: 143.5 },   // 全体250m → leg内50m
        { distance: 100, split_time: 172.0 },  // 全体300m → leg内100m
        { distance: 150, split_time: 200.5 },  // 全体350m → leg内150m
        { distance: 200, split_time: 231.5 },  // 全体400m → leg内200m
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
    // 保存時変換: leg0=100, leg1=200-100=100, leg2=300-200=100, leg3=400-300=100
    const records = makeRelayRecords4x100Medley([
      [{ distance: 100, split_time: 62.0 }],   // leg0: 全体100m → leg内100m
      [{ distance: 100, split_time: 132.5 }],  // leg1: 全体200m → 200-100=100
      [{ distance: 100, split_time: 197.3 }],  // leg2: 全体300m → 300-200=100
      [{ distance: 100, split_time: 256.0 }],  // leg3: 全体400m → 400-300=100
    ]);
    const result = buildStyleEntriesFromExisting(records, STYLES_WITH_MEDLEY);
    const entry = result.find((e) => e.relayEventId === "relay_4x100_medley");
    expect(entry).toBeDefined();

    const relaySplits = entry!.relaySplitTimes ?? [];
    expect(relaySplits).toHaveLength(4);
    const distances = relaySplits.map((st) => st.distance).sort((a, b) => a - b);
    expect(distances).toEqual([100, 200, 300, 400]);

    // タイムも正しく復元される (各 leg の leg内スプリットタイムそのまま)
    const dist100 = relaySplits.find((st) => st.distance === 100);
    const dist200 = relaySplits.find((st) => st.distance === 200);
    expect(dist100?.splitTime).toBeCloseTo(62.0, 1);
    expect(dist200?.splitTime).toBeCloseTo(132.5, 1);
  });

  it("中間スプリット (50m刻み) が正しく復元される", () => {
    // 新UIで全体距離スプリット: 50→30.5, 100→62.0, 150→96.0, 200→132.5
    // 保存時変換:
    //   leg0: 50,100 → そのまま (offset=0)
    //   leg1: 150-100=50, 200-100=100
    const records = makeRelayRecords4x100Medley([
      [
        { distance: 50, split_time: 30.5 },
        { distance: 100, split_time: 62.0 },
      ],
      [
        { distance: 50, split_time: 96.0 },   // 全体150m → leg内50m
        { distance: 100, split_time: 132.5 }, // 全体200m → leg内100m
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
