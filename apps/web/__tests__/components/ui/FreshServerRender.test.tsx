/**
 * FreshServerRender
 *
 * ページ遷移のキャッシュ (staleTimes) で使い回された古いサーバーの描画を、入力フォームの
 * 初期値として使わせないための囲い。保存直後に同じ入力画面を開き直したとき、保存前の
 * データでフォームが開くと重複登録や上書き (データ消失) になる。
 */

import React, { StrictMode, useState } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { FreshServerRender, resetShownRenderIdsForTest } from "@/components/ui/FreshServerRender";

/** フォームの初期値をマウント時に一度だけ props から作る (実際の入力画面と同じ作り) */
function Form({ initial }: { initial: string }) {
  const [value] = useState(initial);
  return <p>form:{value}</p>;
}

function Page({ renderId, data }: { renderId: string; data: string }) {
  return (
    <FreshServerRender renderId={renderId} fallback={<p>loading</p>}>
      <Form initial={data} />
    </FreshServerRender>
  );
}

beforeEach(() => {
  resetShownRenderIdsForTest();
  refresh.mockClear();
});

describe("FreshServerRender", () => {
  it("初めて表示する描画はそのまま出し、取り直さない", () => {
    render(<Page renderId="r-1" data="保存前" />);

    expect(screen.getByText("form:保存前")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("一度表示した描画が (キャッシュの使い回しで) もう一度表示されたら、中身を出さずに取り直す", () => {
    const first = render(<Page renderId="r-1" data="保存前" />);
    first.unmount(); // 保存して一覧へ戻った

    render(<Page renderId="r-1" data="保存前" />); // 30秒以内に同じ画面を開き直した

    expect(screen.queryByText("form:保存前")).toBeNull();
    expect(screen.getByText("loading")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("取り直した最新の描画が届いたら、フォームを新しいデータで作り直して表示する", () => {
    const first = render(<Page renderId="r-1" data="保存前" />);
    first.unmount();

    const reopened = render(<Page renderId="r-1" data="保存前" />);
    reopened.rerender(<Page renderId="r-2" data="保存後" />); // router.refresh() の結果

    expect(screen.getByText("form:保存後")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("表示中に同じ描画のまま再描画されても、取り直さない", () => {
    const view = render(<Page renderId="r-1" data="保存前" />);
    view.rerender(<Page renderId="r-1" data="保存前" />);

    expect(screen.getByText("form:保存前")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("開発時の StrictMode の二重マウントを、使い回しと誤判定しない (取り直しの無限ループにしない)", () => {
    render(
      <StrictMode>
        <Page renderId="r-1" data="保存前" />
      </StrictMode>,
    );

    expect(screen.getByText("form:保存前")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
