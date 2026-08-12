/**
 * BulkAssignModal.test.tsx — Sprint Contract [Bug2 / Bug3] 検証
 *
 * 対象: apps/mobile/components/teams/group-management/BulkAssignModal.tsx
 *
 * [Bug2] ヘッダーのステータスバー/ダイナミックアイランド重なり — 検証ステータス:
 *   実装は `useSafeInsets()` の `insets.top` をヘッダーの `paddingTop` に加算する
 *   対応 (BulkAssignModal.tsx:406: `<View style={[styles.header, { paddingTop:
 *   insets.top + 12 }]}>`)。**本テストファイルに Bug2 の自動テストは含まれていない
 *   (GroupMemberModal.test.tsx が Bug1 について明記しているのと対称的に、ここでも
 *   明示しておく)。** 理由: 共有モック __mocks__/react-native.ts の
 *   `useSafeAreaInsets` はテスト環境で常に `{top: 0, ...}` を返すため、
 *   `insets.top + 12` は常に `12` に評価され、noteチ層 (ノッチ/Dynamic Island) の
 *   ある実機とない実機の違いをテストで区別できない (jsdom はそもそも実ピクセル
 *   レイアウトを計算しないため、paddingTop の値が正しく DOM に渡っていることを
 *   確認できても「実際に重ならずに見えるか」は原理的に検証不可能)。
 *   Bug2 は **Android エミュレータでの実機目視で PASS 済み** (Phase 4 QA 報告)。
 *   本ラウンドで BulkAssignModal.tsx に加えられた変更はゾーン ref 登録機構のみで
 *   ヘッダーの paddingTop ロジックは無変更のため、PM 判断により本ラウンドでの
 *   再目視は不要としている (Verification Checklist 参照)。
 *
 * [Bug3] 以下、ドラッグ&ドロップの参照安定性検証 (本ファイルの主眼)。
 *
 * 背景 (Sprint Contract より):
 *   メンバーチップを長押しすると移動状態(ハイライト)になるが、そのままドラッグしても
 *   チップが追従せず移動できない。最有力原因は `DraggableMemberChip` / `DropZone` が
 *   `useCallback` のインライン関数コンポーネントとして定義され、依存配列にドラッグ中に
 *   変化する state (`draggedUserId` / `hoveredZone`) を含むこと。
 *   `onStart` の `runOnJS(setDraggedUserId)` が親再レンダーを誘発 → コンポーネント参照
 *   (関数の identity/型) が変わる → React がアンマウント/リマウント →
 *   進行中の `Gesture.Pan` ネイティブハンドラが破棄され `onUpdate` が届かない、という仮説。
 *
 * jsdom 制約に関する重要な注意 (実測済み):
 *   1. `BulkAssignModal.tsx` は `react-native-gesture-handler` を import しているが、
 *      このパッケージの ESM ビルドは Flow/TS 構文を含み、素の import では
 *      `SyntaxError: Unexpected token 'typeof'` でテスト実行自体が落ちる
 *      (screens/__tests__/TeamDetailScreen.adminToggle.test.tsx のコメントで
 *      既に文書化されていた制約を、本ファイルでも import 単体で再現確認済み)。
 *   2. `react-native-gesture-handler` / `react-native-reanimated` をこのファイル内限定で
 *      モックしても、`View.measureInWindow`(ドロップゾーンの絶対座標計測に使う
 *      ネイティブ専用メソッド)が共有モック __mocks__/react-native.ts の `View` には
 *      存在せず、素のままでは render 時に例外になる。
 *   3. 実際の指のドラッグ(タッチストリームの継続)そのものは jsdom でシミュレート
 *      不可能。したがって「長押し→ドラッグ→ドロップで実際に指に追従するか」という
 *      見た目のジェスチャー体験そのものはこのテストでは検証できない
 *      (Verification Checklist の実機/シミュレータ目視項目に委ねる)。
 *
 *   そのため本ファイルでは、ネイティブ境界 (View の ref / Gesture.Pan のビルダー /
 *   reanimated の shared value) のみをこのファイル内限定でモックし
 *   (共有モック __mocks__/react-native.ts 自体は変更しない)、それ以外のロジック
 *   (assignments state, findZoneAtPosition 相当のヒットテスト, membersByGroup 等)は
 *   実装をそのまま使う。Gesture.Pan の `.onStart()/.onUpdate()/.onEnd()/.onFinalize()`
 *   に登録されたハンドラをテストから直接呼び出す手法は、既存の
 *   __mocks__/react-native.ts の `PanResponder.create().__config` 公開パターンと
 *   同じ発想である。
 *
 * トートロジー防止メモ: ここで検証するのは「ドラッグ開始によって draggedUserId が
 * 変化しても、対象チップの DOM ノード(コンポーネントインスタンス)が同一のまま
 * 保たれる」という、修正後にあるべき正しい挙動である。バグ原因の実装詳細
 * (useCallback の依存配列など) を直接 grep するのではなく、レンダーツリーの
 * ノード同一性という外部から観測可能な結果で検証する。
 * このテストは現状の実装に対しては RED (ノードが再生成され false になる) になる
 * ことを確認済み — これは「壊れた挙動を pin する」テストではなく、
 * 「修正後に GREEN になるべき正しい挙動」を表現したものである。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// --- ネイティブ境界のみのモック (ロジックは実装をそのまま使う) -------------------

// ゾーンごとに異なる矩形を返すため、measureInWindow の呼び出し順に y 座標をずらす。
// registerZoneRef はゾーンが描画された順 (未割り当て → 各グループ) に1回ずつ呼ばれるため、
// 呼び出し順序 = ゾーンの登録順という前提で、座標からどのゾーンを狙うかを決定できる。
let zoneMeasureCallCount = 0;

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  const RN = require("react");
  // BulkAssignModal はドロップゾーンの絶対座標計測に View.measureInWindow (ネイティブ専用)
  // を使う。共有モックの View にはこれが無いため、このファイル内限定で forwardRef 化し、
  // 呼び出し順に応じて縦にずらした矩形を返すダミー実装を与える。
  //
  // 【重要・実測で発見したこのファイル自身のモック不具合】useImperativeHandle に依存配列を
  // 渡さないと、real な forwardRef+useImperativeHandle のコールバック ref は「実際の
  // mount/unmount」だけでなく「毎回の再レンダー」のたびに detach(null)→attach(新handle) を
  // 繰り返してしまう (React の仕様上、依存配列なしの useImperativeHandle は
  // useLayoutEffect と同様に毎レンダー後に再実行されるため)。これにより
  // handleRegisterZoneRef の null クリーンアップとゾーン再登録が、意図しない
  // 「ドラッグ中の毎回の setState のたびに」誤発火し、テスト対象のロジックとは無関係に
  // ゾーン座標が際限なくズレ続けるという壊れたモックになっていた (実機/本番では
  // 実 View インスタンスは再レンダーごとに再生成されないため起こらない現象)。
  // 依存配列を [] にして「実際に View インスタンスが mount/unmount されたときだけ」
  // ハンドルが (再)生成されるようにし、本物の View の挙動に合わせる。
  const ViewWithMeasure = RN.forwardRef((props: Record<string, unknown>, ref: unknown) => {
    RN.useImperativeHandle(
      ref,
      () => ({
        measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
          const index = zoneMeasureCallCount++;
          cb(0, index * 100, 100, 100);
        },
      }),
      [],
    );
    return RN.createElement("div", props);
  });
  return {
    ...original,
    View: ViewWithMeasure,
    default: { ...(original as unknown as { default: object }).default, View: ViewWithMeasure },
  };
});

type PanHandlers = {
  onStart?: (e: { absoluteX: number; absoluteY: number }) => void;
  onUpdate?: (e: { absoluteX: number; absoluteY: number }) => void;
  onEnd?: (e: { absoluteX: number; absoluteY: number }) => void;
  onFinalize?: () => void;
};

/** 生成された Gesture.Pan ハンドラ一式をテストから直接駆動できるよう記録する */
const capturedPanGestures: PanHandlers[] = [];

vi.mock("react-native-gesture-handler", () => {
  const RN = require("react");

  function panBuilder(handlers: PanHandlers) {
    return {
      activateAfterLongPress: () => panBuilder(handlers),
      onStart: (fn: PanHandlers["onStart"]) => {
        handlers.onStart = fn;
        return panBuilder(handlers);
      },
      onUpdate: (fn: PanHandlers["onUpdate"]) => {
        handlers.onUpdate = fn;
        return panBuilder(handlers);
      },
      onEnd: (fn: PanHandlers["onEnd"]) => {
        handlers.onEnd = fn;
        return panBuilder(handlers);
      },
      onFinalize: (fn: PanHandlers["onFinalize"]) => {
        handlers.onFinalize = fn;
        return panBuilder(handlers);
      },
    };
  }

  return {
    GestureHandlerRootView: ({ children, ...props }: { children?: React.ReactNode }) =>
      RN.createElement("div", props, children),
    GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
    Gesture: {
      Pan: () => {
        const handlers: PanHandlers = {};
        capturedPanGestures.push(handlers);
        return panBuilder(handlers);
      },
    },
    ScrollView: ({
      children,
      scrollEnabled,
      ...props
    }: { children?: React.ReactNode; scrollEnabled?: boolean } & Record<string, unknown>) => {
      // scrollEnabled は DOM の標準属性ではないため React が描画時に読み飛ばしてしまい、
      // container.innerHTML からは観測できない (実測済み)。そのためコンポーネントへ実際に
      // 渡された prop の値をこの配列に記録し、DOM ではなく prop 経由で検証する。
      scrollEnabledLog.push(scrollEnabled);
      return RN.createElement("div", props, children);
    },
  };
});

/**
 * BulkAssignModal に渡る2つの ScrollView (未割り当てカラム/グループカラム) に対して
 * 実際に渡された scrollEnabled 値を、レンダーされる都度末尾に追記する。
 * 呼び出し順は JSX の記述順 (左カラム→右カラム) で、通常は同じ draggedUserId から
 * 導出されるため値は一致する。直近の値を見れば現在の scrollEnabled 状態を判定できる。
 */
const scrollEnabledLog: (boolean | undefined)[] = [];

vi.mock("react-native-reanimated", () => {
  const RN = require("react");
  return {
    default: {
      View: ({ children, ...props }: { children?: React.ReactNode }) =>
        RN.createElement("div", props, children),
    },
    // 【本ファイルで実際に発生した不具合】単に `(v) => ({ value: v })` と実装すると、
    // 呼び出し元コンポーネントが再レンダーされるたびに新しいオブジェクトを返してしまう
    // (実際の reanimated の useSharedValue はコンポーネントのライフタイムを通して
    // 同一オブジェクトの参照を返す)。この不一致により、`dragX`/`dragY`/`isDragging` を
    // 依存配列に含む `DraggableMemberChip` 内の `useMemo(() => Gesture.Pan()..., [...])` が
    // 親の再レンダーのたびに (isDragging.value の変更等、本来は再構築不要な場面でも)
    // 誤って再計算されてしまい、Gesture.Pan ビルダーの再構築有無を検証するテスト
    // (V-B3-18) が偽陽性の失敗を起こしていた。useRef で包み、初回レンダーでのみ
    // オブジェクトを生成することで実物の挙動に合わせる。
    useSharedValue: (initial: unknown) => {
      const ref = RN.useRef(null) as { current: { value: unknown } | null };
      if (ref.current === null) {
        ref.current = { value: initial };
      }
      return ref.current;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    runOnJS:
      (fn: (...args: unknown[]) => void) =>
      (...args: unknown[]) =>
        fn(...args),
  };
});

vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(() => ({
    listAllMemberships: vi.fn().mockResolvedValue([]),
    setGroupMembers: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { BulkAssignModal } from "../BulkAssignModal";
import { TeamGroupsAPI } from "@apps/shared/api/teams/groups";

const TEAM_MEMBERS = [{ id: "m1", user_id: "u1", users: { id: "u1", name: "Taro" } }];
const GROUPS = [{ id: "g1", team_id: "t1", category: "Cat", name: "Group1", member_count: 0 }];

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  zoneMeasureCallCount = 0;
  capturedPanGestures.length = 0;
  scrollEnabledLog.length = 0;
});

/**
 * 【実測で判明した挙動・Phase 5 ラウンド2 で発見】BulkAssignModal の割り当て読み込み
 * useEffect は `groupIds` (`useMemo(() => new Set(groups.map(g => g.id)), [groups])`) を
 * 依存に持つ。`groups` プロパティが新しい配列参照になるたび (要素の中身が同じでも) この
 * useMemo が再計算され、useEffect が再発火して `loading` を true→false と往復させる。
 * `{loading ? <ローディング表示> : <columns (全ドロップゾーン)>}` という三項演算子のため、
 * この往復のたびに columns 配下の全ドロップゾーン View が一度アンマウントされ、
 * 直後に全て再マウントされる (React.memo で個々の再レンダーは防げても、三項演算子による
 * ブランチ切り替え自体はコンポーネントの型を切り替えるため防げない)。
 *
 * そのため `groups` プロパティが変わった直後に `await flush()` で結果整合が済んだ時点では、
 * 「そのときの現在のゾーン数ぶん」だけ measureInWindow が連続で呼ばれた、という
 * 直近のバッチが常に最新の有効な登録として残る。呼び出し順は JSX の記述順
 * (未割り当て → groups 配列の現在の順序) に一致する。
 *
 * この関数は、直前の `await flush()` の直後に呼ぶことで「現在有効な登録バッチ」における
 * position (0=未割り当て, 1=groups[0], 2=groups[1], ...) に対応する y 座標 (矩形の中点) を
 * 動的に算出する。ハードコードされた y の値は上記の挙動に対して壊れやすいため、
 * このヘルパーを介して都度計算する。
 */
function zoneY(positionInBatch: number, currentZoneCount: number): number {
  const startIndex = zoneMeasureCallCount - currentZoneCount;
  return (startIndex + positionInBatch) * 100 + 50;
}

/**
 * ドロップゾーンのラベル (例: "Group1") から、同じ行に隣接して描画される件数バッジの
 * 実測値を厳密一致で取得する。
 *
 * 【本ファイルで実際に発生した不具合】以前は
 * `screen.getByText("Group1").parentElement?.textContent).toContain("1")` という
 * 部分一致アサーションを使っていたが、"Group1" というラベル自体に文字 "1" が含まれるため、
 * 件数が実際には 0 のままでも (文字列 "Group10" は "1" を含む) このアサーションは
 * 常に成功してしまうトートロジーだった。ゾーン名が数字を含む限り `toContain` によるチェックは
 * 信頼できないため、件数バッジの DOM ノード (ラベルの直後の兄弟 <Text>) を個別に取得し、
 * 厳密一致 (toBe) で検証する。
 */
function getZoneCountText(label: string): string | null | undefined {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe("BulkAssignModal - ドラッグ中のコンポーネント参照安定性 [Bug3]", () => {
  it("[V-B3-01] ドラッグ開始 (draggedUserId の変化) をまたいでも、チップの DOM ノードは再生成されない", async () => {
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // 未割り当てゾーン側のチップ (ドラッグオーバーレイにも同名テキストが出るため index 0 を使う)
    const chipNodeBefore = screen.getAllByText("Taro")[0].parentElement;

    expect(capturedPanGestures.length).toBeGreaterThan(0);
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });

    const chipNodeAfter = screen.getAllByText("Taro")[0].parentElement;

    expect(chipNodeAfter).toBe(chipNodeBefore);
  });

  it("[V-B3-02] ドラッグ中に別ゾーン上へ移動しても (onUpdate) チップの DOM ノードは再生成されない", async () => {
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    const gesture = capturedPanGestures[0];
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    const chipNodeAfterStart = screen.getAllByText("Taro")[0].parentElement;

    act(() => {
      gesture.onUpdate?.({ absoluteX: 50, absoluteY: 50 });
    });
    const chipNodeAfterUpdate = screen.getAllByText("Taro")[0].parentElement;

    expect(chipNodeAfterUpdate).toBe(chipNodeAfterStart);
  });

  /**
   * [V-B3-18] Reviewer 指摘 #2 への対応 (Phase 5 ラウンド2)
   *
   * 指摘: 本ファイルの GestureDetector モックは `({ children }) => children` で
   * `gesture` prop を完全に無視しているため、V-B3-01〜03 は「(モックが記録した)
   * capturedPanGestures[0] を直接叩けば正しい結果になる」ことしか検証できておらず、
   * `DraggableMemberChip` 内部の `useMemo(() => Gesture.Pan()..., deps)` を
   * まるごと削除する regression (= 毎レンダー Gesture.Pan() を新規に作り直してしまう)
   * が入っても検出できない抜け道になっている。
   *
   * ここでは「ドラッグ開始〜移動〜終了という一連の操作をまたいで、
   * Gesture.Pan() ビルダーが再構築されないこと」を capturedPanGestures の件数不変性で
   * 直接検証する。useMemo が正しく効いていれば、(draggedUserId 等の state 変化に
   * 伴う再レンダーがあっても) 増えないはずである。
   *
   * 【実測に基づく設計判断】mount 直後の `await flush()` の時点で、割り当て読み込み
   * useEffect による loading の true→false 往復 (このブロック冒頭のコメント参照) が
   * 既に1回発生しており、この時点で capturedPanGestures.length は既に 2 になっている
   * (これは正当な、テスト対象の regression とは無関係な mount 時の挙動)。
   * そのため「1 であること」ではなく「flush() 直後の件数を基準値とし、以降の
   * ドラッグ操作でそこから増えないこと」を検証する。
   * また onEnd で実際にドロップが成立するとメンバーが別の DropZone (別の親要素) へ
   * 移動し、そのこと自体で正当な再マウントが1回発生してしまい `useMemo` の
   * 検証にノイズが入るため、意図的にどのゾーンにもヒットしない座標で onEnd を呼ぶ。
   *
   * ミューテーション確認 (実施済み・プロダクションコードは元に戻し済み):
   * `DraggableMemberChip` の `useMemo(() => Gesture.Pan()..., [...])` を
   * 一時的に `(() => Gesture.Pan()...)()` (useMemo を外して毎レンダー再構築) に
   * 書き換えて本テストを実行したところ、本テストは件数不変のアサーションで
   * FAIL することを確認した (再現ログは PM 報告に記載)。確認後ただちに
   * `git diff` でプロダクションコードが変更前の状態に戻っていることを確認し、
   * 本テストのみをコミット候補として残している。
   */
  it("[V-B3-18] ドラッグ操作 (onStart→onUpdate→onEnd→onFinalize) をまたいで Gesture.Pan ビルダーが再構築されない", async () => {
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    const baseline = capturedPanGestures.length;
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    expect(capturedPanGestures.length).toBe(baseline);

    act(() => {
      gesture.onUpdate?.({ absoluteX: 50, absoluteY: 50 });
    });
    expect(capturedPanGestures.length).toBe(baseline);

    act(() => {
      // どのゾーンにもヒットしない座標 (member の親ゾーンが変わらず、正当な
      // 再マウントが混ざらないようにする)
      gesture.onEnd?.({ absoluteX: 10, absoluteY: 99999 });
    });
    expect(capturedPanGestures.length).toBe(baseline);

    act(() => {
      gesture.onFinalize?.();
    });
    expect(capturedPanGestures.length).toBe(baseline);
  });

  it("[V-B3-03] onEnd で Group1 ゾーン上にドロップすると、未割り当てからグループ側へ実際に移動する", async () => {
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // ドロップ前: 未割り当てゾーンに Taro が1人、Group1 は0人
    expect(getZoneCountText("Group1")).toBe("0");

    const gesture = capturedPanGestures[0];
    // 現在有効な登録バッチにおける Group1 の位置 (0=未割り当て, 1=Group1) から
    // ドロップ先座標を動的に算出する (ハードコードした y はモック側の再登録
    // タイミングに対して壊れやすいため使わない — 詳細は zoneY のコメント参照)。
    const group1Y = zoneY(1, 2);
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: group1Y });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    // ドロップ後: Group1 側のメンバー数が1件に増える (assignments state が実際に更新された)
    expect(getZoneCountText("Group1")).toBe("1");
  });
});

/**
 * scrollEnabled={!draggedUserId} の検証 [Bug3 任意項目]
 *
 * Developer の申し送り事項: 「draggedUserId が null に戻らないパスが存在すると
 * スクロールが永久に不能になる」というリスクに対して、正常ドロップ / ゾーン外ドロップ /
 * onFinalize によるキャンセル / 保存中 / モーダル再オープン の各経路で draggedUserId が
 * null に戻り、スクロールが再度有効になることを確認する。
 *
 * 観測方法についての注意 (実測済み):
 *   scrollEnabled は React DOM の標準属性ではないため、DOM に描画されず
 *   container.innerHTML からは値を読み取れない (React が警告を出して読み飛ばす)。
 *   そのため、上部でモックした ScrollView コンポーネントが実際に受け取った
 *   scrollEnabled prop の値を scrollEnabledLog に記録し、そこから状態を検証する。
 *   これは「モックの戻り値をそのまま検証する」トートロジーではなく、
 *   BulkAssignModal 自身が計算した `!draggedUserId` という式の結果を、
 *   ScrollView という子コンポーネントの props という外部境界で観測している。
 */
describe("BulkAssignModal - draggedUserId のリセット経路 [scrollEnabled 任意項目]", () => {
  const renderModal = (props: Partial<React.ComponentProps<typeof BulkAssignModal>> = {}) =>
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
        {...props}
      />,
    );

  it("[V-B3-04] ドラッグ開始前は scrollEnabled が true である", async () => {
    renderModal();
    await flush();
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);
  });

  it("[V-B3-05] onStart でドラッグが始まると scrollEnabled が false になる", async () => {
    renderModal();
    await flush();
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });

    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(false);
  });

  it("[V-B3-06] 正常ドロップ (ゾーン上で onEnd → onFinalize) の後、scrollEnabled は true に戻る", async () => {
    renderModal();
    await flush();
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(false);

    act(() => {
      // 本テストの主眼は scrollEnabled の復帰であり、実際にどのゾーンへ
      // ヒットするかは問わない (handleDrop は targetZone の有無に関わらず
      // setDraggedUserId(null) を先に実行するため)。Group1 の位置へドロップする。
      gesture.onEnd?.({ absoluteX: 10, absoluteY: zoneY(1, 2) });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);
  });

  it("[V-B3-07] ゾーン外ドロップ (どのゾーンにもヒットしない座標での onEnd → onFinalize) の後も scrollEnabled は true に戻る", async () => {
    renderModal();
    await flush();
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(false);

    act(() => {
      // どの登録済みゾーン矩形 (y=0-100, y=100-200) にも入らない座標
      gesture.onEnd?.({ absoluteX: 10, absoluteY: 99999 });
    });
    // handleDrop は targetZone が null でも setDraggedUserId(null) を先に実行するため、
    // onFinalize を待たずこの時点で既に true に戻っているべき
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);

    act(() => {
      gesture.onFinalize?.();
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);

    // 副次確認: ドロップ先が無いので割り当ては変化していない (Group1 は 0 のまま)
    expect(getZoneCountText("Group1")).toBe("0");
  });

  it("[V-B3-08] onEnd を経ずに onFinalize だけが呼ばれる (ジェスチャーキャンセル) 場合も scrollEnabled は true に戻る", async () => {
    renderModal();
    await flush();
    const gesture = capturedPanGestures[0];

    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(false);

    act(() => {
      gesture.onFinalize?.();
    });

    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);
  });

  it("[V-B3-09] 保存中 (setGroupMembers が未解決の間) でも、直前に完了したドラッグの scrollEnabled=true は false に戻らない", async () => {
    let resolveSetGroupMembers: () => void = () => {};
    const pendingSave = new Promise<void>((resolve) => {
      resolveSetGroupMembers = resolve;
    });
    vi.mocked(TeamGroupsAPI).mockImplementation(
      () =>
        ({
          listAllMemberships: vi.fn().mockResolvedValue([]),
          setGroupMembers: vi.fn(() => pendingSave),
        }) as unknown as InstanceType<typeof TeamGroupsAPI>,
    );

    renderModal();
    await flush();
    const gesture = capturedPanGestures[0];

    // 先にドラッグ&ドロップを正常完了させ、draggedUserId を null に戻しておく
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: zoneY(1, 2) });
    });
    act(() => {
      gesture.onFinalize?.();
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);

    // 保存を開始 (setGroupMembers は pendingSave が解決するまで保留される)
    fireEvent.click(screen.getByText("保存"));
    await flush();
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);

    // 保存完了後も scrollEnabled は true のまま
    await act(async () => {
      resolveSetGroupMembers();
      await pendingSave;
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);
  });

  it("[V-B3-10] モーダル再オープン (前回インスタンスをドラッグ未完了のまま閉じた場合含む) では、新しいインスタンスは scrollEnabled=true から始まる", async () => {
    // 実際の呼び出し元 (TeamGroupManagement.tsx) は
    // `{bulkAssignCategory !== null && <BulkAssignModal ... />}` という条件レンダーで
    // 開閉しており、閉じる = アンマウント、再度開く = 新規マウントである
    // (visible prop のトグルで同一インスタンスを使い回す設計ではない)。
    // そのため「前回のドラッグが finalize されずに終わった」状態が残っていても、
    // 再オープンは常に新しいコンポーネントインスタンス = 初期状態から始まる。
    const first = renderModal();
    await flush();
    const gestureBeforeUnmount = capturedPanGestures[0];

    act(() => {
      // finalize を呼ばずにドラッグ中のまま放置する (壊れたケースを想定)
      gestureBeforeUnmount.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(false);

    first.unmount();

    renderModal();
    await flush();

    expect(scrollEnabledLog[scrollEnabledLog.length - 1]).toBe(true);
  });
});

/**
 * ゾーン参照の null クリーンアップ検証 [Phase 5 ラウンド1 PM追加指示 / ラウンド2で再検証]
 *
 * 背景: Reviewer 指摘によりゾーンの ref コールバックが `zoneId` ごとに安定化された
 * (`DropZone` 内部の `handleRef = useCallback((ref) => onRegisterZoneRef(zoneId, ref),
 * [zoneId, onRegisterZoneRef])`)。これに伴い ref が null で呼ばれる (= そのゾーンの
 * View が実際にアンマウントされた) 場合に初めて意味を持つようになったため、
 * `handleRegisterZoneRef` に `zoneRefs.current` / `zoneRects.current` 両方から
 * 該当 zoneId を削除する分岐が追加された (BulkAssignModal.tsx:261-266)。
 *
 * ここで検証するのは実装の内部詳細 (Map から delete されたかどうか) ではなく、
 * 外部から観測可能な結果: 「削除されたグループの古い座標にドロップしても
 * そのグループへ紐付かないこと」「削除されても他の生きているゾーンの座標紐付けが
 * 壊れないこと」「削除後に新しいグループを追加しても正しくドロップできること」。
 *
 * 座標モデルについての注記 (Phase 5 ラウンド2 で実測により全面的に修正):
 *   当初は「未unmountのゾーンは measureInWindow が再実行されず index が不変」という
 *   前提で y をハードコードしていたが、これは誤りだった。実際には
 *   `groups` プロパティが新しい配列参照になるたびに `groupIds`(useMemo dep)が
 *   再計算され、割り当て読み込み useEffect が再発火して loading を true→false と
 *   往復させる。`{loading ? ... : columns}` という三項演算子のため、この往復のたびに
 *   columns 配下の**全ドロップゾーン**が一度アンマウント→再マウントされ、
 *   生存しているゾーンも含めて measureInWindow が呼び直される。そのため
 *   ハードコードした y は `groups` の変更を挟むたびに実態とズレて壊れる
 *   (実測: 部分一致 `toContain` のトートロジー的バグと合わさり、この誤りは
 *   長らく気づかれずにいた。詳細は zoneY / getZoneCountText のコメント参照)。
 *   本ブロックでは `zoneY()` ヘルパーで毎回動的に座標を算出する。
 */
describe("BulkAssignModal - ゾーン参照の再アタッチ/削除 [null クリーンアップ]", () => {
  const GROUPS_2 = [
    { id: "g1", team_id: "t1", category: "Cat", name: "Group1", member_count: 0 },
    { id: "g2", team_id: "t1", category: "Cat", name: "Group2", member_count: 0 },
  ];

  it("[V-B3-14] グループが削除されると、その古い座標へのドロップはもはやそのグループに紐付かない (ゴースト参照防止)", async () => {
    const { rerender } = render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS_2 as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();
    expect(getZoneCountText("Group1")).toBe("0");
    expect(getZoneCountText("Group2")).toBe("0");

    // Group2 が (削除される前に) 実際に登録されていた座標を記録しておく。
    // 削除後にこの座標へドロップして、クリーンアップが機能しているかを確認する。
    const oldGroup2Y = zoneY(2, 3); // 0=未割り当て, 1=Group1, 2=Group2

    // Group2 をリストから削除する (DropZone がアンマウントされ、ref(null) が呼ばれる想定)
    rerender(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={[GROUPS_2[0]] as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();
    expect(screen.queryByText("Group2")).toBeNull();

    // 削除前に Group2 が実際に登録されていた座標にドロップを試みる
    const gesture = capturedPanGestures[0];
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: oldGroup2Y });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    // クリーンアップが機能していれば、どのゾーンにもヒットせず Taro は未割り当てのまま残る。
    // (退行時は削除済み Group2 の矩形が残留し、Taro が assignments 上で "g2" に付け替えられて
    //  未割り当てからもGroup1からも消える=画面上どこにも表示されなくなる)
    expect(screen.getByText("Taro")).toBeTruthy();
    expect(getZoneCountText("Group1")).toBe("0");
  });

  it("[V-B3-15] 兄弟ゾーン (Group2) の削除後も、生き残っている Group1 への通常ドロップは正しく機能する", async () => {
    const { rerender } = render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS_2 as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    rerender(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={[GROUPS_2[0]] as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // Group2 削除後、生き残った Group1 は現在有効な登録バッチの position1 にいる
    // (0=未割り当て, 1=Group1 の2ゾーン構成)。
    const group1Y = zoneY(1, 2);
    const gesture = capturedPanGestures[0];
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: group1Y });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    expect(getZoneCountText("Group1")).toBe("1");
  });

  it("[V-B3-16] グループ削除後に別の新規グループを追加すると、そのグループへのドロップが正しく機能する", async () => {
    const { rerender } = render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS_2 as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // Group2 を削除
    rerender(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={[GROUPS_2[0]] as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // 新規グループ Group3 を追加
    const GROUP_3 = { id: "g3", team_id: "t1", category: "Cat", name: "Group3", member_count: 0 };
    rerender(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={[GROUPS_2[0], GROUP_3] as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();
    expect(screen.getByText("Group3")).toBeTruthy();

    // Group3 は現在有効な登録バッチの position2 にいる (0=未割り当て, 1=Group1, 2=Group3)。
    const group3Y = zoneY(2, 3);
    const gesture = capturedPanGestures[0];
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: group3Y });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    expect(getZoneCountText("Group3")).toBe("1");
  });

  it("[V-B3-17] 既存グループの並び替え (Group1↔Group2) を挟んでも、両ゾーンとも新しい位置で正しくドロップできる", async () => {
    // 実測メモ: 当初は「並び替えだけなら measureInWindow は再実行されない」ことを
    // zoneMeasureCallCount の不変性で検証しようとしたが、実際には `groups` の
    // 配列参照が変わるたびに割り当て読み込み useEffect が再発火し、並び替えのみでも
    // 全ゾーンが再登録されることが実測でわかった (このブロック冒頭のコメント参照)。
    // そのため「再登録が起きないこと」自体はこのテストの正しい主張ではなく、
    // 「並び替えを挟んでも両ゾーンとも新しい位置で機能し続けること」を検証する。
    const { rerender } = render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS_2 as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // key (group.id) は変えず、配列の順序だけを入れ替える (Group2 → Group1 の順)
    rerender(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={[GROUPS_2[1], GROUPS_2[0]] as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );
    await flush();

    // 並び替え後の登録順は 0=未割り当て, 1=Group2, 2=Group1
    const group1Y = zoneY(2, 3);
    const gesture = capturedPanGestures[0];
    act(() => {
      gesture.onStart?.({ absoluteX: 10, absoluteY: 10 });
    });
    act(() => {
      gesture.onEnd?.({ absoluteX: 10, absoluteY: group1Y });
    });
    act(() => {
      gesture.onFinalize?.();
    });

    expect(getZoneCountText("Group1")).toBe("1");
    expect(getZoneCountText("Group2")).toBe("0");
  });
});

/**
 * 境界ケース: 保存中ガード / 保存API失敗時のエラーバナーと再試行導線
 *
 * トートロジー防止メモ: ここではボタンの disabled 状態・エラーバナーの文言・
 * 再試行後の成功という「ユーザーから観測可能な結果」のみを検証する。
 * 期待文言は apps/shared/messages/ja.json の実際の値を直接書き出しており、
 * 実装のエラーメッセージ構築ロジックをそのままコピーしていない。
 */
describe("BulkAssignModal - 保存中ガード / 保存失敗時のエラーと再試行", () => {
  const renderModal = () =>
    render(
      <BulkAssignModal
        visible
        onClose={() => {}}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={() => {}}
      />,
    );

  it("[V-B3-11] 保存中 (setGroupMembers が未解決の間) はキャンセル/保存ボタンが無効化される", async () => {
    let resolveSave: () => void = () => {};
    const pendingSave = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(TeamGroupsAPI).mockImplementation(
      () =>
        ({
          listAllMemberships: vi.fn().mockResolvedValue([]),
          setGroupMembers: vi.fn(() => pendingSave),
        }) as unknown as InstanceType<typeof TeamGroupsAPI>,
    );

    renderModal();
    await flush();

    fireEvent.click(screen.getByText("保存"));
    await flush();

    const cancelButton = screen.getByText("キャンセル").closest("button") as HTMLButtonElement;
    const saveButton = screen.getByText("保存中...").closest("button") as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      resolveSave();
      await pendingSave;
    });
  });

  it("[V-B3-12] 保存API (setGroupMembers) が失敗すると、エラーバナーが表示されモーダルは閉じない", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    vi.mocked(TeamGroupsAPI).mockImplementation(
      () =>
        ({
          listAllMemberships: vi.fn().mockResolvedValue([]),
          setGroupMembers: vi.fn().mockRejectedValue(new Error("network down")),
        }) as unknown as InstanceType<typeof TeamGroupsAPI>,
    );

    render(
      <BulkAssignModal
        visible
        onClose={onClose}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={onSaved}
      />,
    );
    await flush();

    fireEvent.click(screen.getByText("保存"));
    await flush();

    expect(screen.getByText(/グループ割り当ての保存に失敗しました/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("[V-B3-13] 保存失敗後、同じ保存ボタンで再試行して成功すると onSaved / onClose が呼ばれる (再試行導線)", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const setGroupMembers = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue(undefined);
    vi.mocked(TeamGroupsAPI).mockImplementation(
      () =>
        ({
          listAllMemberships: vi.fn().mockResolvedValue([]),
          setGroupMembers,
        }) as unknown as InstanceType<typeof TeamGroupsAPI>,
    );

    render(
      <BulkAssignModal
        visible
        onClose={onClose}
        category="Cat"
        groups={GROUPS as never}
        teamMembers={TEAM_MEMBERS as never}
        teamId="t1"
        supabase={{} as never}
        onSaved={onSaved}
      />,
    );
    await flush();

    // 1回目: 失敗してエラーバナーが出る
    fireEvent.click(screen.getByText("保存"));
    await flush();
    expect(screen.getByText(/グループ割り当ての保存に失敗しました/)).toBeTruthy();

    // 2回目: 同じボタンで再試行して成功する
    fireEvent.click(screen.getByText("保存"));
    await flush();

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
