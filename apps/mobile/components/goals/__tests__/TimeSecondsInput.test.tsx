// =============================================================================
// components/goals/__tests__/TimeSecondsInput.test.tsx  (S6, Boundary)
// =============================================================================
// 仕様書: apps/web/__tests__/goals/timeSecondsInputMidTyping.test.tsx の観点を RN のイベントモデルで再現。
//   - キー入力: fireEvent.change を **累積文字列で1文字ずつ** 発火 (一括入力では途中入力バグを検出できない)
//   - blur    : fireEvent.blur を **最後に明示的に** 発火。発火順は change* -> blur
// 親は web と同じ「state を持つ controlled」。RTL の render は StrictMode 無しのため、
// mount 時 cleanup 系の不具合はここでは検出できない (既知の限界)。
// ミューテーション: lastNotifiedValueRef の「自分のエコー判定」を外すと '9' ケースが赤 (QA が __mut__ で実証)。
// =============================================================================
import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    TextInput: ({
      onChangeText,
      value,
      editable,
      testID,
      ...props
    }: {
      onChangeText?: (text: string) => void;
      value?: string;
      editable?: boolean;
      testID?: string;
    } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        "data-testid": testID,
        value,
        disabled: editable === false,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

import { TimeSecondsInput } from "../TimeSecondsInput";

/** 1文字ずつ累積した文字列で change を発火する */
function typeChars(input: HTMLInputElement, text: string) {
  let acc = "";
  for (const ch of text) {
    acc += ch;
    fireEvent.change(input, { target: { value: acc } });
  }
}
const clear = (input: HTMLInputElement) => fireEvent.change(input, { target: { value: "" } });

function Harness({
  initial = null,
  nullToZero = false,
  required = false,
  commits,
  disabled = false,
}: {
  initial?: number | null;
  nullToZero?: boolean;
  required?: boolean;
  commits?: Array<number | null>;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState<number | null>(initial);
  return (
    <div>
      <button type="button" onClick={() => setValue(95.5)}>
        external-95.5
      </button>
      <button type="button" onClick={() => setValue(0)}>
        external-zero
      </button>
      <span data-testid="parent-value">{value === null ? "null" : String(value)}</span>
      <TimeSecondsInput
        value={value}
        onChange={(s) => {
          commits?.push(s);
          setValue(nullToZero && s === null ? 0 : s);
        }}
        required={required}
        requiredErrorMessage="REQUIRED"
        invalidErrorMessage="INVALID"
        disabled={disabled}
        testID="tsi"
      />
    </div>
  );
}
const input = () => screen.getByTestId("tsi") as HTMLInputElement;
const parent = () => screen.getByTestId("parent-value").textContent;

describe("途中入力で表示が潰れない (web 3件相当)", () => {
  it("'1:30.50' を1文字ずつ入力 -> 表示は入力どおり、blur 後も '1:30.50'", () => {
    render(<Harness />);
    typeChars(input(), "1:30.50");
    expect(input().value).toBe("1:30.50");
    fireEvent.blur(input());
    expect(input().value).toBe("1:30.50");
  });
  it("最終確定値は 90.5 で親に伝わる", () => {
    const commits: Array<number | null> = [];
    render(<Harness commits={commits} />);
    typeChars(input(), "1:30.50");
    fireEvent.blur(input());
    expect(commits[commits.length - 1]).toBe(90.5);
    expect(parent()).toBe("90.5");
  });
  it("'9' だけ入力した直後 (blur 前) は '9' のまま ('9.00' に化けない)", () => {
    render(<Harness />);
    typeChars(input(), "9");
    expect(input().value).toBe("9");
  });
});

describe("外部変更 / blur 前の親の値 / 途中入力確定 (web 4件相当)", () => {
  it("親が直接 95.5 に差し替え (ベストタイム取得相当) -> 表示 '1:35.50'", () => {
    render(<Harness />);
    expect(input().value).toBe("");
    fireEvent.click(screen.getByText("external-95.5"));
    expect(input().value).toBe("1:35.50");
  });
  it("外部変更の後に clear -> '9' 入力しても '9' のまま (自分のエコーとして扱う)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("external-95.5"));
    clear(input());
    typeChars(input(), "9");
    expect(input().value).toBe("9");
  });
  it("blur せず1文字ずつ入力した直後に、親は既に 90.5 を保持している (保存ボタン直押し対策)", () => {
    const commits: Array<number | null> = [];
    render(<Harness commits={commits} />);
    typeChars(input(), "1:30.50");
    expect(parent()).toBe("90.5");
    expect(commits[commits.length - 1]).toBe(90.5);
  });
  it("既存 65 秒の欄を '1:' で止めて blur -> 親は null (65 に戻らない) + INVALID 表示", () => {
    const commits: Array<number | null> = [];
    render(<Harness initial={65} required commits={commits} />);
    expect(input().value).toBe("1:05.00");
    clear(input());
    typeChars(input(), "1:");
    expect(commits[commits.length - 1]).toBeNull();
    expect(parent()).toBe("null");
    fireEvent.blur(input());
    expect(screen.getByText("INVALID")).toBeTruthy();
    expect(commits[commits.length - 1]).toBeNull();
  });
});

describe("null→0 往復 (MilestoneParams 経路, web 3件相当)", () => {
  it("親が null を 0 に変換して書き戻しても '45.50' の入力が消えない / blur 後 '45.50'", () => {
    render(<Harness nullToZero />);
    typeChars(input(), "45.50");
    expect(input().value).toBe("45.50");
    fireEvent.blur(input());
    expect(input().value).toBe("45.50");
  });
  it("'1:05.00' も同様 (reps_time の平均タイム欄)", () => {
    render(<Harness nullToZero />);
    typeChars(input(), "1:05.00");
    expect(input().value).toBe("1:05.00");
    fireEvent.blur(input());
    expect(input().value).toBe("1:05.00");
  });
  it("[非退行] 確定済み 45.5 のあと親が明示的に 0 に戻すと表示は空欄に戻る", () => {
    render(<Harness nullToZero />);
    typeChars(input(), "45.50");
    fireEvent.blur(input());
    fireEvent.click(screen.getByText("external-zero"));
    expect(input().value).toBe("");
  });
});

describe("受理形式と正規化 (S6)", () => {
  it.each([
    ["1:23.45", "1:23.45", 83.45],
    ["83.45", "1:23.45", 83.45],
    ["1.23.45", "1:23.45", 83.45],
  ])("'%s' を受理し blur で '%s' に正規化、親は %s", (raw, shown, secs) => {
    const commits: Array<number | null> = [];
    render(<Harness commits={commits} />);
    typeChars(input(), raw);
    fireEvent.blur(input());
    expect(input().value).toBe(shown);
    expect(commits[commits.length - 1]).toBe(secs);
  });

  it("'0' はパースできない (0 以下は未入力扱い) ため親へ null が通知され、入力した文字はそのまま表示に残る", () => {
    const commits: Array<number | null> = [];
    render(<Harness commits={commits} />);
    typeChars(input(), "0");
    expect(commits[commits.length - 1]).toBeNull();
    expect(input().value).toBe("0");
  });

  it("初期値 0 / 負数は未入力として空欄表示 (null と同等)", () => {
    const { unmount } = render(<Harness initial={0} />);
    expect(input().value).toBe("");
    unmount();
    render(<Harness initial={-5} />);
    expect(input().value).toBe("");
  });

  it("不正形式 abc / -23.45 は blur で INVALID。親は null", () => {
    for (const raw of ["abc", "-23.45"]) {
      const commits: Array<number | null> = [];
      const { unmount } = render(<Harness commits={commits} />);
      typeChars(input(), raw);
      fireEvent.blur(input());
      expect(screen.getByText("INVALID"), raw).toBeTruthy();
      expect(commits[commits.length - 1], raw).toBeNull();
      unmount();
    }
  });

  it("空欄 blur: required=false は無エラー、required=true は REQUIRED", () => {
    const a = render(<Harness />);
    fireEvent.blur(input());
    expect(screen.queryByText("REQUIRED")).toBeNull();
    expect(screen.queryByText("INVALID")).toBeNull();
    a.unmount();
    render(<Harness required />);
    fireEvent.blur(input());
    expect(screen.getByText("REQUIRED")).toBeTruthy();
  });

  it("disabled=true では入力欄が disabled (ベストタイム取得後の固定)", () => {
    render(<Harness disabled initial={80} />);
    expect(input().disabled).toBe(true);
    expect(input().value).toBe("1:20.00");
  });

  it("forceInvalid=true の間は blur を経なくても invalidErrorMessage を出す", () => {
    render(
      <TimeSecondsInput value={null} onChange={() => {}} invalidErrorMessage="FORCED" forceInvalid testID="tsi" />,
    );
    expect(screen.getByText("FORCED")).toBeTruthy();
  });
});

describe("v5 H1: onInvalidChange (保存時の不正入力検出) と外部値更新での解除", () => {
  function InvalidHarness({ events }: { events: boolean[] }) {
    const [value, setValue] = React.useState<number | null>(null);
    const onInvalid = React.useCallback((b: boolean) => { events.push(b); }, [events]);
    return (
      <div>
        <button type="button" onClick={() => setValue(95.5)}>external-95.5</button>
        <button type="button" onClick={() => setValue(null)}>external-null</button>
        <TimeSecondsInput value={value} onChange={setValue} invalidErrorMessage="INVALID" onInvalidChange={onInvalid} testID="tsi" />
      </div>
    );
  }
  it("解釈できない文字列を入力すると true、有効な値/空欄にすると false が通知される", () => {
    const events: boolean[] = [];
    render(<InvalidHarness events={events} />);
    typeChars(input(), "abc");
    expect(events[events.length - 1]).toBe(true);
    clear(input());
    expect(events[events.length - 1]).toBe(false);
    typeChars(input(), "abc");
    expect(events[events.length - 1]).toBe(true);
    clear(input());
    typeChars(input(), "1:30.50");
    expect(events[events.length - 1]).toBe(false);
  });

  it("[H1] 不正入力 ('abc') が残った状態で、外部から非 null の値 (ベストタイム取得) が来ると false が通知され、表示も置き換わる", () => {
    const events: boolean[] = [];
    render(<InvalidHarness events={events} />);
    typeChars(input(), "abc");
    expect(events[events.length - 1]).toBe(true);
    fireEvent.click(screen.getByText("external-95.5"));
    expect(events[events.length - 1]).toBe(false);
    expect(input().value).toBe("1:35.50");
  });

  it("[H1] 不正入力のあと、外部値が 95.5 に再設定されると invalid が解除され表示が置き換わる (null を挟んだ往復後も同様)", () => {
    const events: boolean[] = [];
    render(<InvalidHarness events={events} />);
    fireEvent.click(screen.getByText("external-95.5"));
    expect(input().value).toBe("1:35.50");
    typeChars(input(), "9x");
    expect(events[events.length - 1]).toBe(true);
    // 外部リセット (親が null に戻す): 自分が通知した値 (null) と同じため表示は残るが、残留フラグを放置しないこと
    fireEvent.click(screen.getByText("external-null"));
    fireEvent.click(screen.getByText("external-95.5"));
    expect(events[events.length - 1]).toBe(false);
    expect(input().value).toBe("1:35.50");
  });
});

describe("v5 H1 補足: インライン関数の onInvalidChange (毎レンダー新しい参照)", () => {
  it("親が毎レンダーで新しい onInvalidChange を渡しても、再レンダーだけで invalid が勝手に解除 (false 通知) されない", () => {
    const events: boolean[] = [];
    function Inline() {
      const [value, setValue] = React.useState<number | null>(null);
      const [tick, setTick] = React.useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((t) => t + 1)}>rerender</button>
          <span data-testid="tick">{tick}</span>
          <TimeSecondsInput value={value} onChange={setValue} invalidErrorMessage="INVALID" onInvalidChange={(b) => events.push(b)} testID="tsi" />
        </div>
      );
    }
    render(<Inline />);
    typeChars(input(), "abc");
    expect(events[events.length - 1]).toBe(true);
    const before = events.length;
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText("rerender"));
    expect(screen.getByTestId("tick").textContent).toBe("3");
    expect(events.length).toBe(before);
    expect(events[events.length - 1]).toBe(true);
    expect(input().value).toBe("abc");
  });
});

describe("act 付きで発火順 change -> blur を再現 (偽 green 防止の自己検査)", () => {
  it("change を act 内で発火 -> 直後に表示が更新済み (act 無しの waitFor に頼らない)", () => {
    render(<Harness />);
    act(() => {
      fireEvent.change(input(), { target: { value: "2" } });
    });
    expect(input().value).toBe("2");
  });
});
