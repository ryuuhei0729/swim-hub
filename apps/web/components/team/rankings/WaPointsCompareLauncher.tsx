"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts";
import { useMembers } from "../member-management/hooks";
import { useMemberBestTimes } from "../shared/hooks/useMemberBestTimes";
import { WaPointsCompareButton } from "../member-management/components/WaPointsCompareButton";
import { WaPointsCompareModal } from "../member-management/components/WaPointsCompareModal";

export interface WaPointsCompareLauncherProps {
  teamId: string;
}

/** 取得の進行状態。"idle" は「まだ一度も開いていない」= 何も読んでいない状態 */
type LoadPhase = "idle" | "members" | "bestTimes" | "ready";

/**
 * ランキングタブの「WAポイントで比較」ボタン + モーダル。
 *
 * 🚨 **ランキングタブにサブタブを作らないこと。** タブの配線は `TeamTabs.tsx` の
 * `TEAM_TAB_DEFS` / `TeamAdminTabs.tsx` の `TEAM_ADMIN_TAB_DEFS` に集約されている。
 * 比較は一覧と同時に見たい情報ではないのでモーダルで出す。
 *
 * メンバー一覧とベストタイムは**初回オープン時にだけ**取得する。ランキングタブを
 * 開いただけで人数分のベストタイム (loadAllBestTimes の N+1) を引くと、比較を
 * 使わないユーザーにまでコストを払わせることになる。2回目以降のオープンでは
 * 取得済みのデータを再利用する (再フェッチしない)。
 *
 * `members` は `useMembers` の戻り値を **そのまま** モーダルへ渡す。中間で
 * 型を作り直すと `users.gender` (optional) が落ちて全員が男性換算になる
 * 既知障害の再現経路になるため、詰め替えもデフォルト値の補完もしない。
 *
 * ボタン/モーダル本体は member-management 配下の既存実装を再利用する
 * (ファイルを移動すると既存テストの相対 import が壊れる)。
 */
export default function WaPointsCompareLauncher({ teamId }: WaPointsCompareLauncherProps) {
  const { supabase } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<LoadPhase>("idle");

  // 🚨 中断判定は **ref** で持つ。effect のクリーンアップ内のローカル変数で
  // `cancelled` を立てると、この effect は本体で setPhase を呼び deps に phase を
  // 含むため、**次の effect を張る直前に自分のクリーンアップが走って自分自身を
  // キャンセルしてしまう**。その結果 await の解決後に setPhase("ready") が永久に
  // 呼ばれず、取得は終わっているのにスピナーが回り続ける。
  //
  // 🚨 **ref は「立てる」と「戻す」の2つで1組。片方だけ写すと壊れる。**
  // StrictMode (Next 16 既定) は mount 直後に cleanup を1回走らせるため、
  // 再武装が無いと `unmountedRef.current` が **マウント中なのに true** のまま残り、
  // 「アンマウント済み」と誤認して setPhase("ready") を捨てる = 永久スピナー。
  // 参照元の OcrScanModal も2箇所で1組になっている
  // (`:95` で true に立て、`:191` の handleAnalyze 冒頭で false に戻す)。
  // ここでは「使う直前」に相当するのがこの effect 本体なので先頭で戻す。
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const { members, loading: loadingMembers, error: membersError, loadMembers } = useMembers(
    teamId,
    supabase,
  );
  const { memberBestTimes, error: bestTimesError, loadAllBestTimes } = useMemberBestTimes(supabase);

  /**
   * メンバー取得 → ベストタイム取得 を **直列につなぐ**。
   *
   * 2つのフックの `loading` を OR で見ると「メンバー取得は終わったがベストタイム
   * 取得はまだ始まっていない」コミットが 1 フレーム挟まり、その間だけ
   * `isLoading=false` かつ `memberBestTimes` が空 = 「データがありません」が
   * 一瞬出てからスピナーに戻る。`phase` が 1 本の進行状態なので、その中間状態を
   * そもそも表現できない。
   *
   * members が 0 件でも loadAllBestTimes を呼ぶ (空 Map を確定させて ready にする)。
   * ここで早期 return すると phase が "bestTimes" のまま永久にスピナーになる。
   */
  useEffect(() => {
    if (phase !== "members" || loadingMembers) return;
    setPhase("bestTimes");

    // クリーンアップを返さない。ここでキャンセルを仕掛けると上記のとおり自滅する。
    // 二重起動は phase が "members" → "bestTimes" へ前進することで防がれる
    // (phase は後戻りしないので、この分岐に再入することは無い)。
    void (async () => {
      await loadAllBestTimes(members);
      if (unmountedRef.current) return;
      setPhase("ready");
    })();
  }, [phase, loadingMembers, members, loadAllBestTimes]);

  const handleOpen = () => {
    // 2回目以降のオープンでは再取得しない (phase が "idle" に戻ることはない)
    if (phase === "idle") {
      setPhase("members");
      void loadMembers();
    }
    setIsOpen(true);
  };

  return (
    <>
      <WaPointsCompareButton onClick={handleOpen} />
      <WaPointsCompareModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        members={members}
        memberBestTimes={memberBestTimes}
        isLoading={phase === "members" || phase === "bestTimes"}
        error={membersError ?? bestTimesError}
      />
    </>
  );
}
