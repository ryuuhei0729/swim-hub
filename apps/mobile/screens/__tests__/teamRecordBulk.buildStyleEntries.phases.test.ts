// QA Phase B (T-1): buildStyleEntriesFromExisting の 4 フェーズを手計算の期待値で検証する。
// 既存 teamRecordBulk.buildStyleEntries.test.ts を補完し、Reviewer T-1 指摘の以下を厚くする:
//   - Phase 1: 連続 4 件のメドレーリレー検出 (is_relaying パターン + styleId 順)
//   - Phase 2: 累計タイム / leg境界による global↔leg 距離変換の off-by-one / 取り違え
//   - Phase 3: リレー外レコードの style_id 別グループ化
//   - Phase 4: フリーリレー二次検出 (同一 styleId 4 件) と Phase2 と同等の距離変換
// トートロジー回避: 期待値は実装を呼ばず手計算した固定値で記述する。
import { describe, it, expect } from "vitest";
import {
  buildStyleEntriesFromExisting,
  ExistingRecord,
} from "../teamRecordBulk/buildStyleEntries";

const STYLES = [
  { id: 2, name_jp: "50m 自由形" },
  { id: 3, name_jp: "100m 自由形" },
  { id: 4, name_jp: "200m 自由形" },
  { id: 9, name_jp: "50m 平泳ぎ" },
  { id: 13, name_jp: "50m 背泳ぎ" },
  { id: 17, name_jp: "50m バタフライ" },
];

function rec(
  o: Partial<ExistingRecord> & { id: string; style_id: number; time: number },
): ExistingRecord {
  return {
    user_id: `user-${o.id}`,
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: `user-${o.id}`, name: `Swimmer ${o.id}` },
    ...o,
  };
}

// =============================================================================
// Phase 1 + 2: メドレーリレー検出・累計・距離変換
// =============================================================================
describe("[T-1] Phase 1/2 メドレーリレー (4x50)", () => {
  // styleId 順 13(ba),9(br),17(fly),2(fr) = relay_4x50_medley。legDist=50。
  // 累計手計算: 15.20 / 15.20+16.30=31.50 / 31.50+14.50=46.00 / 46.00+13.10=59.10
  const records = [
    rec({ id: "0", style_id: 13, time: 15.2, is_relaying: false }),
    rec({ id: "1", style_id: 9, time: 16.3, is_relaying: true }),
    rec({ id: "2", style_id: 17, time: 14.5, is_relaying: true }),
    rec({ id: "3", style_id: 2, time: 13.1, is_relaying: true }),
  ];

  it("1 entry にまとまり relayEventId が relay_4x50_medley", () => {
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result).toHaveLength(1);
    expect(result[0]!.relayEventId).toBe("relay_4x50_medley"); // 直前の toHaveLength(1) で result[0] の存在は保証済み
    expect(result[0]!.id).toBe("relay-0");
  });

  it("累計タイム (cumulativeTimeSeconds) が手計算値と一致", () => {
    const mrs = buildStyleEntriesFromExisting(records, STYLES)[0]!.memberRecords; // records は4連続のメドレーリレー検出パターンで必ず1entryにまとまる設計
    expect(mrs.map((m) => m.cumulativeTimeSeconds)).toEqual([15.2, 31.5, 46.0, 59.1]);
  });

  it("timeDisplayValue は累計を formatTimeBest した文字列 (1:00 越えで分表記)", () => {
    // leg time を大きくして累計が 60 秒を超えるケースを作る
    const slow = [
      rec({ id: "0", style_id: 13, time: 30.0, is_relaying: false }),
      rec({ id: "1", style_id: 9, time: 35.0, is_relaying: true }),
      rec({ id: "2", style_id: 17, time: 0, is_relaying: true }),
      rec({ id: "3", style_id: 2, time: 0, is_relaying: true }),
    ];
    const mrs = buildStyleEntriesFromExisting(slow, STYLES)[0]!.memberRecords; // slow も同じ4連続パターンで必ず1entryにまとまる設計
    // 累計: 30.00 / 65.00(=1:05.00) / 65.00 / 65.00
    expect(mrs[0]!.timeDisplayValue).toBe("30.00"); // slow は4件固定の入力なので mrs は必ず4要素
    expect(mrs[1]!.timeDisplayValue).toBe("1:05.00");
    // cumulative > 0 なので leg3 も累計を表示 (65.00)
    expect(mrs[3]!.timeDisplayValue).toBe("1:05.00");
  });

  it("relayLegStyleId が relay 定義の leg 順 (ba=13,br=9,fly=17,fr=2) に一致", () => {
    const mrs = buildStyleEntriesFromExisting(records, STYLES)[0]!.memberRecords; // records は4連続のメドレーリレー検出パターンで必ず1entryにまとまる設計
    expect(mrs.map((m) => m.relayLegStyleId)).toEqual([13, 9, 17, 2]);
  });
});

describe("[T-1] Phase 2 split 距離変換 (4x50 medley, legDist=50, boundaries [50,100,150,200])", () => {
  // 各 leg に leg内距離 (<= legDist) と全体距離 (> legDist) を混在させ、変換を手計算で検証。
  const recordsWithSplits: ExistingRecord[] = [
    rec({
      id: "0",
      style_id: 13,
      time: 15.0,
      is_relaying: false,
      // leg0: offset0。distance=25 はそのまま、distance=50(=legDist)もそのまま(25..50 leg内)。
      // split_time は record.time(15.0) 未満に留める (buildStyleEntries.ts の
      // isRecordSplitTimesCorrupted 防御ロジックが split_time>=record.time を
      // 旧バグ由来の破損データとみなして丸ごと捨ててしまうのを避けるため)。
      split_times: [
        { id: "s00", distance: 25, split_time: 7.0 },
        { id: "s01", distance: 50, split_time: 13.0 },
      ],
    }),
    rec({
      id: "1",
      style_id: 9,
      time: 16.0,
      is_relaying: true,
      // leg1: offset=boundaries[0]=50。distance=25(<=legDist50)→ 50+25=75。distance=100(>50, 既に全体)→100
      // split_time は record.time(16.0) 未満に留める (上記と同じ理由)。
      split_times: [
        { id: "s10", distance: 25, split_time: 8.0 },
        { id: "s11", distance: 100, split_time: 14.0 },
      ],
    }),
    rec({ id: "2", style_id: 17, time: 14.5, is_relaying: true }),
    rec({ id: "3", style_id: 2, time: 13.5, is_relaying: true }),
  ];

  it("leg0 の split は offset0 のまま (25, 50)", () => {
    const entry = buildStyleEntriesFromExisting(recordsWithSplits, STYLES)[0]!; // recordsWithSplits も4連続のメドレーリレー検出パターンで必ず1entryにまとまる設計
    const ds = (entry.relaySplitTimes ?? []).map((s) => ({ d: s.distance, t: s.splitTime }));
    expect(ds).toContainEqual({ d: 25, t: 7.0 });
    expect(ds).toContainEqual({ d: 50, t: 13.0 });
  });

  it("leg1 distance=25(<=legDist) は offset50 加算で distance=75、splitTime も legStart(15.0) を加算した通算値になる (D4)", () => {
    // times=[15.0,16.0,14.5,13.5] → cumulatives=[15.0,31.0,45.5,59.0] → legStart(leg1)=15.0
    // D4 修正前 (バグ): splitTime は DB の値 (8.0) をそのまま通算値扱いしていた。
    // D4 修正後: 8.0 (leg 相対) + legStart(15.0) = 23.0 (正しい通算値)
    const entry = buildStyleEntriesFromExisting(recordsWithSplits, STYLES)[0]!; // 同上
    const ds = (entry.relaySplitTimes ?? []).map((s) => ({ d: s.distance, t: s.splitTime }));
    expect(ds).toContainEqual({ d: 75, t: 23.0 }); // 50 + 25 / splitTime = 8.0 + legStart(15.0)
    // off-by-one ガード: leg1 の split (元 splitTime=8.0) が distance=25 のまま
    // (leg0 自身の d=25 (splitTime=7.0) とは別) で残っていないこと
    expect(ds.find((x) => x.d === 25 && x.t === 8.0)).toBeUndefined();
  });

  it(
    "leg1 distance=100(>legDist, 既に全体距離=legacy分岐) は distance も splitTime も変換せず100/14.0 " +
      "(QA注記: Critical regression。st.distance>legDist の legacy 分岐は distance が無変換のまま" +
      "使われるので、対になる splitTime も無変換であるべきだが、現状の実装は分岐を無視して" +
      "常に legStart(15.0) を加算してしまう (実測: 14.0 → 29.0)。QA は観測挙動を pin せず" +
      "正しい仕様値のまま残す (このテストは現状 red。web 側にも同一の regression あり: " +
      "apps/web/__tests__/buildStyleEntries.test.ts 参照)",
    () => {
      const entry = buildStyleEntriesFromExisting(recordsWithSplits, STYLES)[0]!; // 同上
      const ds = (entry.relaySplitTimes ?? []).map((s) => ({ d: s.distance, t: s.splitTime }));
      expect(ds).toContainEqual({ d: 100, t: 14.0 }); // 既に全体距離、splitTime も無変換のはず
    },
  );
});

// =============================================================================
// Phase 1: 複数リレーグループ / 誤検出防止 / 重複消費
// =============================================================================
describe("[T-1] Phase 1 複数リレーグループ", () => {
  it("連続する 8 件 (2 リレー分) が 2 つの relay entry になる", () => {
    const grp = (base: string) => [
      rec({ id: `${base}0`, style_id: 13, time: 15, is_relaying: false }),
      rec({ id: `${base}1`, style_id: 9, time: 16, is_relaying: true }),
      rec({ id: `${base}2`, style_id: 17, time: 14, is_relaying: true }),
      rec({ id: `${base}3`, style_id: 2, time: 13, is_relaying: true }),
    ];
    const result = buildStyleEntriesFromExisting([...grp("a"), ...grp("b")], STYLES);
    const relayEntries = result.filter((e) => e.relayEventId);
    expect(relayEntries).toHaveLength(2);
    expect(relayEntries[0]!.id).toBe("relay-a0"); // 直前の toHaveLength(2) で2件の存在は保証済み
    expect(relayEntries[1]!.id).toBe("relay-b0");
  });

  it("is_relaying パターン一致でも style 順が逆だと検出されない (取り違え防止)", () => {
    // medley は ba,br,fly,fr 順。逆順 fr,fly,br,ba は detectRelayEventId=null
    const records = [
      rec({ id: "0", style_id: 2, time: 13, is_relaying: false }),
      rec({ id: "1", style_id: 17, time: 14, is_relaying: true }),
      rec({ id: "2", style_id: 9, time: 16, is_relaying: true }),
      rec({ id: "3", style_id: 13, time: 15, is_relaying: true }),
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result.find((e) => e.relayEventId)).toBeUndefined();
  });

  it("先頭が is_relaying=true だとリレーパターン不成立 (第1泳者は飛び込み=false 必須)", () => {
    const records = [
      rec({ id: "0", style_id: 13, time: 15, is_relaying: true }),
      rec({ id: "1", style_id: 9, time: 16, is_relaying: true }),
      rec({ id: "2", style_id: 17, time: 14, is_relaying: true }),
      rec({ id: "3", style_id: 2, time: 13, is_relaying: true }),
    ];
    expect(buildStyleEntriesFromExisting(records, STYLES).find((e) => e.relayEventId)).toBeUndefined();
  });
});

// =============================================================================
// Phase 3: style_id 別グループ化
// =============================================================================
describe("[T-1] Phase 3 個人種目グループ化", () => {
  it("同一 style_id 2 件は 1 entry にまとまり styleName が styles から引かれる", () => {
    const records = [
      rec({ id: "0", style_id: 2, time: 27.5 }),
      rec({ id: "1", style_id: 2, time: 28.1 }),
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result).toHaveLength(1);
    expect(result[0]!.styleId).toBe(2); // 直前の toHaveLength(1) で result[0] の存在は保証済み
    expect(result[0]!.styleName).toBe("50m 自由形");
    expect(result[0]!.memberRecords).toHaveLength(2);
    expect(result[0]!.memberRecords.map((m) => m.time)).toEqual([27.5, 28.1]);
  });

  it("異なる style_id は別 entry (3件: 50Fr, 100Fr, 200Fr)", () => {
    const records = [
      rec({ id: "0", style_id: 2, time: 27.5 }),
      rec({ id: "1", style_id: 3, time: 58.0 }),
      rec({ id: "2", style_id: 4, time: 125.0 }),
    ];
    const result = buildStyleEntriesFromExisting(records, STYLES);
    expect(result.map((e) => e.styleId).sort()).toEqual([2, 3, 4]);
  });

  it("styles に存在しない style_id は styleName 空文字", () => {
    const result = buildStyleEntriesFromExisting([rec({ id: "0", style_id: 999, time: 10 })], STYLES);
    expect(result[0]!.styleName).toBe(""); // records は要素1件の配列なので必ず1entryが返る
  });

  it("個人種目 split は変換されず distance そのまま (Phase2 変換は適用外)", () => {
    const records = [
      rec({
        id: "0",
        style_id: 4,
        time: 125.0,
        split_times: [
          { id: "p0", distance: 50, split_time: 30.0 },
          { id: "p1", distance: 100, split_time: 62.0 },
        ],
      }),
    ];
    const sts = buildStyleEntriesFromExisting(records, STYLES)[0]!.memberRecords[0]!.splitTimes; // records は要素1件の配列で memberRecords も必ず1件
    expect(sts.map((s) => s.distance)).toEqual([50, 100]);
  });
});

// =============================================================================
// Phase 4: フリーリレー二次検出 (同一 style_id 4 件 → Phase3 でまとまった後に再判定)
// =============================================================================
describe("[T-1] Phase 4 フリーリレー二次検出", () => {
  // 全 leg が同一 style_id=3 (100m Fr) → 4 件で is_relaying [false,true,true,true]
  // → Phase1 では連続性で拾うが、ここでは Phase4 経路を意図的に作る:
  // style_id 同一 4 件は Phase1 でも検出されうるため、ここでは「Phase3→Phase4」経路を
  // 検証する: Phase1 が拾えないように 5 件目を間に挟まず純粋に 4 件で構成し、
  // detectRelayEventId(同一id x4) が relay_4x100_free を返すことを確認。
  const freeRelay = [
    rec({ id: "0", style_id: 3, time: 57.0, is_relaying: false }),
    rec({ id: "1", style_id: 3, time: 58.5, is_relaying: true }),
    rec({ id: "2", style_id: 3, time: 57.8, is_relaying: true }),
    rec({ id: "3", style_id: 3, time: 56.7, is_relaying: true }),
  ];

  it("relayEventId が relay_4x100_free として復元される", () => {
    const result = buildStyleEntriesFromExisting(freeRelay, STYLES);
    const relay = result.find((e) => e.relayEventId);
    expect(relay).toBeDefined();
    expect(relay!.relayEventId).toBe("relay_4x100_free");
  });

  it("累計タイムが手計算値 (57.00/115.50/173.30/230.00) と一致", () => {
    const relay = buildStyleEntriesFromExisting(freeRelay, STYLES).find((e) => e.relayEventId)!;
    // 57.00 / 57.00+58.50=115.50 / 115.50+57.80=173.30 / 173.30+56.70=230.00
    expect(relay.memberRecords.map((m) => m.cumulativeTimeSeconds)).toEqual([
      57.0, 115.5, 173.3, 230.0,
    ]);
  });

  it("Phase4 経由のフリーリレー split も leg境界で global 距離・通算タイムへ変換される (D4)", () => {
    // legDist=100, boundaries=[100,200,300,400]
    // cumulatives=[57.0,115.5,173.3,230.0] → legStart(leg1)=57.0, legStart(leg3)=173.3
    // split_time は各 leg の record.time (57.0/58.5/57.8/56.7) 未満に留める
    // (isRecordSplitTimesCorrupted 防御ロジックの誤爆を避けるため)。
    // leg0 distance=100(=legDist,legStart=0) は offset0・splitTime無変換のまま 100/50.0
    // leg1 distance=100(<=legDist) → distance=100+100=200 / splitTime=40.0+legStart(57.0)=97.0
    // leg3 distance=50(<=legDist) → distance=300+50=350 / splitTime=30.0+legStart(173.3)=203.3
    const withSplits = [
      { ...freeRelay[0]!, split_times: [{ id: "a", distance: 100, split_time: 50.0 }] }, // freeRelay は要素4件固定の配列
      { ...freeRelay[1]!, split_times: [{ id: "b", distance: 100, split_time: 40.0 }] },
      { ...freeRelay[2]!, split_times: [] },
      { ...freeRelay[3]!, split_times: [{ id: "c", distance: 50, split_time: 30.0 }] },
    ];
    const relay = buildStyleEntriesFromExisting(withSplits, STYLES).find((e) => e.relayEventId)!;
    const ds = (relay.relaySplitTimes ?? []).map((s) => ({ d: s.distance, t: s.splitTime }));
    expect(ds).toContainEqual({ d: 100, t: 50.0 }); // leg0 offset0, legStart=0
    expect(ds).toContainEqual({ d: 200, t: 97.0 }); // leg1 100+100, splitTime 40.0+57.0
    expect(ds).toContainEqual({ d: 350, t: 203.3 }); // leg3 300+50, splitTime 30.0+173.3
  });

  it("同一 style_id でも detectRelayEventId 不能な id (=999) は個人扱いのまま", () => {
    const notRelay = [
      rec({ id: "0", style_id: 999, time: 10, is_relaying: false }),
      rec({ id: "1", style_id: 999, time: 11, is_relaying: true }),
      rec({ id: "2", style_id: 999, time: 12, is_relaying: true }),
      rec({ id: "3", style_id: 999, time: 13, is_relaying: true }),
    ];
    const result = buildStyleEntriesFromExisting(notRelay, STYLES);
    expect(result.find((e) => e.relayEventId)).toBeUndefined();
    expect(result[0]!.memberRecords).toHaveLength(4); // notRelay は要素4件で同一style_idのため必ず1entryにまとまる設計
  });
});
