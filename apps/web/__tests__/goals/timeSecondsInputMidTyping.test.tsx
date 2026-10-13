/**
 * apps/web/__tests__/goals/timeSecondsInputMidTyping.test.tsx
 *
 * goals/_components/shared/TimeSecondsInput.tsx の回帰ガード。
 *
 * この部品は「秒数 (number|null)」を親の controlled value として受け取る設計のため、
 * キー入力のたびに parseTimeFlexible(raw) が成功すると onChange(seconds) が同期的に
 * 呼ばれ、親経由で value が更新されて戻ってくる。この「自分がついさっき通知した値が
 * そのまま返ってきただけ」のケースと「親や外部操作 (ベストタイム取得ボタン等) による
 * 本当の変更」を区別できないと、1文字打つたびに useEffect が displayValue を
 * formatTimeBest で上書きしてしまい入力が壊れる (例: 「9」と打った瞬間に "9.00" に
 * 化け、続けて「0」を打つと "9.00" + "0" のような意図と無関係な文字列に対して
 * 再度パースが走る)。
 *
 * 対照: 同じアプリ内の RecordLogEntry.tsx (大会記録入力) の時間入力は、onChange で
 * 親に渡すのが「秒数」ではなく「入力途中の生文字列」そのものであり、
 * parseTimeFlexible による正規化は onBlur のときだけ行う。本部品は「1文字ごとに
 * 秒数へ変換して formatTimeBest で書き戻す」設計のため、`lastNotifiedValueRef` で
 * 自分のエコーバックかどうかを判定する対策が入っている。
 *
 * 期待値は「ユーザーが入力した通りに表示され、blur 後に正しい秒数へ確定する」という
 * 本来あるべき仕様であり、実装の挙動をそのまま転記したものではない。
 */

import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TimeSecondsInput from "../../app/[locale]/(authenticated)/goals/_components/shared/TimeSecondsInput";

/**
 * GoalForm / MilestoneParamsForm と同じ実際の利用パターンを再現する
 * (value: number | null を state に持ち、onChange でそのまま更新する controlled 利用)。
 */
function ControlledHarness({ onCommit }: { onCommit?: (seconds: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <TimeSecondsInput
      value={value}
      onChange={(seconds) => {
        setValue(seconds);
        onCommit?.(seconds);
      }}
      invalidErrorMessage="invalid"
      data-testid="time-seconds-input"
    />
  );
}

describe("TimeSecondsInput — 入力途中の文字列が潰れない (RecordLogEntry と同じ操作感)", () => {
  it("空欄から '1' '3' '0' '.' '5' '0' の順にキー入力すると、表示が入力どおり '1:30.50' のまま維持され、blur 後に 90.5 秒として確定する", async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    await user.click(input);
    // "1:30.50" を1文字ずつ入力する (userEvent.type は既定で1文字ずつ dispatch する)
    await user.type(input, "1:30.50");

    // 入力途中の値が (onChange 経由の秒数への丸め込みで) 潰れていないこと。
    // 現状の実装では 1文字目の "1" (parseTimeFlexible("1")=1) の時点で
    // useEffect が displayValue を "1.00" 等に書き換えてしまい、
    // 最終的な表示がユーザーの入力した "1:30.50" と一致しなくなる (red の再現)。
    expect(input.value).toBe("1:30.50");

    await user.tab(); // blur

    // blur 後に正規化された表示 (formatTimeBest(90.5) = "1:30.50") になっていること
    expect(input.value).toBe("1:30.50");
  });

  it("確定した秒数が 90.5 (1分30.50秒) であること (onChange 経由で親に伝わる最終値)", async () => {
    const user = userEvent.setup();
    let committed: number | null = null;
    render(<ControlledHarness onCommit={(seconds) => { committed = seconds; }} />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "1:30.50");
    await user.tab();

    expect(committed).toBe(90.5);
  });

  it("単一の '9' を入力した直後は、表示が即座に '9.00' 等へ書き換わらず '9' のまま維持される (最初の1文字で壊れる再現)", async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "9");

    // ユーザーはまだ blur していないので、表示は入力したままの "9" であるべき。
    // 現状の実装は parseTimeFlexible("9")=9 が同期的に成功し、useEffect が
    // displayValue を formatTimeBest(9) で即座に上書きするため、
    // ここで "9" 以外の値になる (red の再現)。
    expect(input.value).toBe("9");
  });
});

/**
 * lastNotifiedValueRef による「自分のエコーバックか、外部からの変更か」の判定が
 * 正しく機能していることを、上の3件 (自分のエコーバック時に表示が壊れないこと) とは
 * 逆方向 — 外部からの変更時には正しく表示に反映されること、および blur を経ない
 * submit (Enter 直後) でも親が最新値を持っていること、途中入力のまま確定しようと
 * した場合に古い値のまま保存されないこと — から検証する。
 */
function ControlledHarnessWithControls({
  initialValue = null,
  required = false,
  requiredErrorMessage,
  onCommit,
}: {
  initialValue?: number | null;
  required?: boolean;
  requiredErrorMessage?: string;
  onCommit?: (seconds: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initialValue);
  return (
    <div>
      {/* 「ベストタイム取得」ボタンを模す。onChange を経由せず、親が直接 value を
          差し替える (=外部からの変更) パターン。 */}
      <button
        type="button"
        onClick={() => setValue(95.5)}
      >
        ベストタイム取得
      </button>
      <span data-testid="current-value">{value === null ? "null" : value}</span>
      <TimeSecondsInput
        value={value}
        onChange={(seconds) => {
          setValue(seconds);
          onCommit?.(seconds);
        }}
        required={required}
        requiredErrorMessage={requiredErrorMessage}
        invalidErrorMessage="invalid"
        data-testid="time-seconds-input"
      />
    </div>
  );
}

describe("TimeSecondsInput — 外部からの値変更・blur を経ない submit・途中入力での確定", () => {
  it("「ベストタイム取得」のように外から value を書き換えると、表示がその値に更新される", async () => {
    const user = userEvent.setup();
    render(<ControlledHarnessWithControls />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    expect(input.value).toBe(""); // 初期値 null -> 未入力表示

    await user.click(screen.getByText("ベストタイム取得"));

    // 外部からの変更 (自分がキー入力で通知した値ではない) なので、
    // useEffect が displayValue を formatTimeBest(95.5) = "1:35.50" に同期する。
    expect(input.value).toBe("1:35.50");
  });

  it("外部からの値変更の後でも、続けてユーザーがキー入力すると自分のエコーバックとして扱われ表示が壊れない", async () => {
    const user = userEvent.setup();
    render(<ControlledHarnessWithControls />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    await user.click(screen.getByText("ベストタイム取得"));
    expect(input.value).toBe("1:35.50");

    await user.click(input);
    await user.clear(input);
    await user.type(input, "9");

    // 直前の外部変更 (95.5) とは無関係に、ユーザーが今打った "9" がそのまま表示される
    // (=自分の入力を useEffect が上書きしていない)。
    expect(input.value).toBe("9");
  });

  it("1文字ずつ入力した直後 (blur を経ない Enter 相当) に、親は既に最新の確定値 90.5 を保持している", async () => {
    const user = userEvent.setup();
    const commits: Array<number | null> = [];
    render(<ControlledHarnessWithControls onCommit={(seconds) => commits.push(seconds)} />);

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "1:30.50");
    // blur せずに Enter のみ押す (フォームに包んでいないため実際に submit はされないが、
    // 「blur を経ていない」状態を再現する)。
    await user.keyboard("{Enter}");

    // blur 前の時点で、親 (state) は既に確定値 90.5 を持っている必要がある
    // (キー入力のたびに onChange が呼ばれる設計だから)。
    expect(screen.getByTestId("current-value")).toHaveTextContent("90.5");
    expect(commits[commits.length - 1]).toBe(90.5);
    // blur していないので表示はまだ正規化 ("1:30.50" と同一だが念のため確認)
    expect(input.value).toBe("1:30.50");
  });

  it("既存の値 (65秒) を編集中に「1:」で入力を止めて確定しようとすると、古い値のまま保存されず invalid エラーになる", async () => {
    const user = userEvent.setup();
    const commits: Array<number | null> = [];
    render(
      <ControlledHarnessWithControls
        initialValue={65}
        required
        requiredErrorMessage="required"
        onCommit={(seconds) => commits.push(seconds)}
      />,
    );

    const input = screen.getByTestId("time-seconds-input") as HTMLInputElement;
    // 既存値 65 秒 (=1:05.00) が表示されている
    expect(input.value).toBe("1:05.00");

    await user.click(input);
    await user.clear(input);
    await user.type(input, "1:");

    // 入力途中でパースできない ("1:" は分:秒の区切りだけで秒部分が無い) ため、
    // 親には null が通知され、古い値 65 のままにはならない。
    expect(commits[commits.length - 1]).toBeNull();
    expect(screen.getByTestId("current-value")).toHaveTextContent("null");

    await user.tab(); // blur (=フォーム送信前のフォーカスアウトを想定)

    // 途中入力のまま blur した場合、invalidErrorMessage が表示される
    // (空文字ではないため required 分岐ではなく不正値分岐に入る)。
    expect(screen.getByText("invalid")).toBeInTheDocument();
    // 直前に確定していた古い値 (65) が黙って保存された形跡が無い
    // (commits の最後が null のままであること = 65 に巻き戻っていない)。
    expect(commits[commits.length - 1]).toBeNull();
  });
});

/**
 * TimeSecondsInput 単体 (ControlledHarness: onChange で受け取った null をそのまま
 * value に戻す) では検出できなかった不具合の回帰ガード。
 *
 * MilestoneParamsForm (TimeParamsForm/RepsTimeParamsForm) は
 * `onChange={(seconds) => onChange({ ...params, target_time: seconds ?? 0 })}` の
 * ように、途中入力でパースできず通知される null を「0」に変換してから
 * TimeSecondsInput へ書き戻す。ControlledHarness のように null をそのまま
 * 保持する経路ではこの「null→0」変換が再現できないため、実際に
 * MilestoneCreateModal/MilestoneEditModal が使っているのと同じ
 * TimeParamsForm/RepsTimeParamsForm を経由して検証する。
 */
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import { TimeParamsForm, RepsTimeParamsForm } from "../../app/[locale]/(authenticated)/goals/_components/forms/MilestoneParamsForm";
import type { MilestoneTimeParams, MilestoneRepsTimeParams } from "@apps/shared/types";

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function TimeParamsFormHarness({
  onCommit,
}: {
  onCommit?: (params: MilestoneTimeParams) => void;
}) {
  const [params, setParams] = useState<MilestoneTimeParams>({
    distance: 100,
    target_time: 0,
    style: "Fr",
    swim_category: "Swim",
  });
  return (
    <div>
      <button type="button" onClick={() => setParams((p) => ({ ...p, target_time: 0 }))}>
        リセット
      </button>
      <TimeParamsForm
        params={params}
        onChange={(p) => {
          setParams(p);
          onCommit?.(p);
        }}
      />
    </div>
  );
}

function RepsTimeParamsFormHarness() {
  const [params, setParams] = useState<MilestoneRepsTimeParams>({
    distance: 50,
    reps: 4,
    sets: 1,
    target_average_time: 0,
    style: "Fr",
    swim_category: "Swim",
    circle: 90,
  });
  return <RepsTimeParamsForm params={params} onChange={setParams} />;
}

describe("TimeParamsForm/RepsTimeParamsForm (MilestoneParamsForm) を通した TimeSecondsInput — null→0 の往復を含む経路", () => {
  it("[time型 目標タイム] '45.50' を1文字ずつ入力しても、途中で target_time が 0 に変換されて書き戻される影響で表示が消えない", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TimeParamsFormHarness />);

    const input = screen.getByPlaceholderText("2.00.00") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "45.50");

    // 実装上の想定挙動: "45." の時点で parseTimeFlexible が失敗し親へ null が
    // 通知される → MilestoneParamsForm が target_time: 0 に変換して書き戻す。
    // TimeSecondsInput が「自分がついさっき null を通知した直後の 0」を外部変更と
    // 誤認すると、この時点で displayValue が "" にリセットされ、続けて打った
    // "50" が孤立した入力として残ってしまう (=表示が消える不具合の再現条件)。
    expect(input.value).toBe("45.50");

    await user.tab();
    expect(input.value).toBe("45.50"); // formatTimeBest(45.5) と同一表記
  });

  it("[reps_time型 平均目標タイム] '1:05.00' を1文字ずつ入力しても表示が消えない", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RepsTimeParamsFormHarness />);

    const input = screen.getByPlaceholderText("2.00.00") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "1:05.00");

    expect(input.value).toBe("1:05.00");

    await user.tab();
    expect(input.value).toBe("1:05.00");
  });

  it("[非退行] 親が target_time を明示的に 0 にリセットすると (種類変更・テンプレート適用等)、表示が空欄に戻る", async () => {
    const user = userEvent.setup();
    renderWithIntl(<TimeParamsFormHarness />);

    const input = screen.getByPlaceholderText("2.00.00") as HTMLInputElement;
    await user.click(input);
    await user.type(input, "45.50");
    await user.tab();
    expect(input.value).toBe("45.50");

    // 確定済みの値 (45.5) とは異なる 0 が親から明示的に渡された場合は
    // 「外部からの変更」として正しく反映され、表示が空欄に戻る。
    await user.click(screen.getByText("リセット"));
    expect(input.value).toBe("");
  });
});
