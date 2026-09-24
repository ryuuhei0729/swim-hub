// =============================================================================
// タブフォーム共通ユーティリティ（純粋関数）
// =============================================================================
// QA が単体テストで利用する純粋関数群。副作用を持たない。
// ファイルパス: apps/mobile/utils/tabFormUtils.ts

import { parseISO, isValid } from "date-fns";

// ---------------------------------------------------------------------------
// isEntryTabVisible
// ---------------------------------------------------------------------------
/**
 * エントリータブを表示するかどうかを判定する純粋関数。
 * 大会日付が「未来（tomorrow以降）」の場合のみ true を返す。
 * 今日・過去・日付未入力はすべて false。
 *
 * @param date YYYY-MM-DD 形式の日付文字列。null/undefined/空文字も許容。
 * @returns 大会日付が厳密に未来(date > today)のとき true
 */
export function isEntryTabVisible(date: string | null | undefined): boolean {
  if (!date || date.trim() === "") return false;
  const parsed = parseISO(date);
  if (!isValid(parsed)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed > today;
}

// ---------------------------------------------------------------------------
// isDefaultUntouchedEntry
// ---------------------------------------------------------------------------
/**
 * エントリー行が「未編集のデフォルト行」かどうかを判定する純粋関数。
 * 未来大会の新規作成時、種目取得完了後にデフォルト種目が自動セットされた
 * 1行目が、ユーザーが一切操作しないまま保存されてしまうバグを防ぐために使う。
 *
 * styleId は `defaultStyleId` との一致に加えて空文字も「未編集」とみなす
 * (isDefaultUntouchedRecord と同じ理由・同じ形)。「種目一覧取得」effect
 * (defaultStyleId を書き込む) と「既存データ初期化」effect (編集モードでエントリー
 * 0件のとき styleId="" の空行にフォールバックする) の解決順序は保証されないため、
 * `entry.styleId === defaultStyleId` のみの判定では、後者が後に解決する順序で
 * 空行の styleId ("") が既に非空になった defaultStyleId と食い違い、他の全フィールド
 * が未入力にもかかわらず「未編集ではない」と誤判定されうる。他の全フィールド
 * (entryTime/note/isRelaying 等) が空であることは既に上のガードで確定しているため、
 * styleId が空文字であること自体は defaultStyleId の値に関わらず「まだ何も選んでいない
 * 未編集行」の証拠として常に成立する。
 *
 * @param entry 判定対象のエントリー行 (EntryDraftRow の判定に必要な部分集合)
 * @param defaultStyleId 種目取得後に自動セットされたデフォルト種目 ID。未取得時は空文字。
 * @returns 既存DBエントリーではなく、かつ全項目が未編集のデフォルト値のとき true
 */
export interface EntryRowForDefaultCheck {
  existingEntryId?: string;
  styleId: string;
  entryTime: number;
  entryTimeDisplayValue: string;
  note: string;
  isRelaying: boolean;
}

export function isDefaultUntouchedEntry(
  entry: EntryRowForDefaultCheck,
  defaultStyleId: string,
): boolean {
  if (entry.existingEntryId) return false;
  if (entry.entryTime !== 0) return false;
  if (entry.entryTimeDisplayValue.trim() !== "") return false;
  if (entry.note.trim() !== "") return false;
  if (entry.isRelaying) return false;
  return entry.styleId === "" || entry.styleId === defaultStyleId;
}

// ---------------------------------------------------------------------------
// hasUnsavedChanges
// ---------------------------------------------------------------------------
/**
 * JSON シリアライズで比較して「未保存変更があるか」を判定する純粋関数。
 * オブジェクトの参照ではなく値で比較する。
 *
 * @param current 現在のフォーム state
 * @param snapshot 画面オープン時の初期スナップショット
 */
export function hasUnsavedChanges<T>(current: T, snapshot: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(snapshot);
}

// ---------------------------------------------------------------------------
// diffPracticeLogDraft
// ---------------------------------------------------------------------------
/**
 * 練習ログドラフトリストの差分を計算する純粋関数。
 * 編集モード用: 追加/更新/削除の意図を返す。
 *
 * @param drafts 現在のドラフト一覧（id が存在するものは既存、なければ新規）
 * @param existingIds 既存 DB ログの id 一覧
 */
export interface PracticeLogDiff {
  creates: string[]; // ドラフトのローカルID（新規作成対象）
  updates: string[]; // 既存DBのlogId（更新対象）
  deletes: string[]; // 既存DBのlogId（削除対象）
}

export function diffPracticeLogDraft(
  drafts: Array<{ draftId: string; existingLogId?: string }>,
  existingIds: string[],
): PracticeLogDiff {
  const creates: string[] = [];
  const updates: string[] = [];
  const handledExistingIds = new Set<string>();

  for (const draft of drafts) {
    if (draft.existingLogId) {
      updates.push(draft.existingLogId);
      handledExistingIds.add(draft.existingLogId);
    } else {
      creates.push(draft.draftId);
    }
  }

  const deletes = existingIds.filter((id) => !handledExistingIds.has(id));
  return { creates, updates, deletes };
}

// ---------------------------------------------------------------------------
// getTabNavAdjacency
// ---------------------------------------------------------------------------
/**
 * アクティブタブの前後タブ(フッターの「前に戻る」「次に進む」ボタン用)を
 * 算出する純粋関数。web (apps/web/utils/tabModalUtils.ts) とシグネチャ・
 * 挙動を同一にミラーする。
 *
 * @param visibleTabs 現在表示されているタブの並び順
 * @param activeTab 現在アクティブなタブ
 * @param options.guardedNextTab ガード対象のタブ (例: 大会の "record")
 * @param options.isGuarded true のとき、nextTab が guardedNextTab と一致する場合に
 *   nextTab を undefined に上書きする ("次に進む" ボタンを出さない)
 */
export interface TabNavAdjacency<T extends string> {
  prevTab?: T;
  nextTab?: T;
}

export function getTabNavAdjacency<T extends string>(
  visibleTabs: T[],
  activeTab: T,
  options?: { guardedNextTab?: T; isGuarded?: boolean },
): TabNavAdjacency<T> {
  const idx = visibleTabs.indexOf(activeTab);
  const prevTab = idx > 0 ? visibleTabs[idx - 1] : undefined;
  let nextTab = idx >= 0 && idx < visibleTabs.length - 1 ? visibleTabs[idx + 1] : undefined;
  if (nextTab && options?.guardedNextTab === nextTab && options.isGuarded) {
    nextTab = undefined;
  }
  return { prevTab, nextTab };
}

// ---------------------------------------------------------------------------
// findLinkedRowDraftId
// ---------------------------------------------------------------------------
/** findLinkedRowDraftId が突き合わせに使う最小の行形状 (CompetitionTabFormScreen の
 *  EntryDraftRow / RecordDraftRow がどちらもこれを構造的に満たす)。 */
export interface StyleLinkableRow {
  draftId: string;
  styleId: string;
}

/**
 * 双方向リンク (エントリー行 ⇔ レコード行) の相手行の draftId を、styleId で
 * 突き合わせて返す純粋関数。entries と records は行数・並び順が一致しなくなりうる
 * ため (理由は mergeEntriesIntoRecords の JSDoc を参照)、配列インデックスで相手を
 * 決め打ちすると無関係な行を黙って上書きしてしまう。
 *
 * 【鍵は変更前の styleId】styleId 変更ハンドラは、updateEntry/updateRecord で state
 * を更新する**前**の entries/records をそのまま渡すこと。変更後の新しい styleId で
 * 引くと、自分自身か、偶然その値を持つ無関係な行に一致する。
 *
 * 【一致がちょうど1件のときだけ返す】targetRows に同じ styleId の行が複数ある場合
 * (records 側では予選/決勝など同一種目の複数行は正常なドメイン)、どちらが本来のペア
 * かは styleId 以外に手がかりが無く区別できないため、2件以上は undefined = 一致なし
 * と同じ扱いにする。これは「曖昧ならリンクを張らない」という設計判断であって、
 * 保護機構ではない: **ユーザーへのフィードバックは一切無い**。片側の種目を変えても
 * 他方は追従せず、エラーも警告も出ないまま静かにリンクが切れる。validateEntryTab の
 * 重複チェックはこの状態を救わない (records 方向には重複チェック自体が無く、entries
 * 方向でも未編集デフォルト行は除外されるうえ !showEntryTab では走らない)。
 *
 * sourceRows 側の重複は無関係: sourceRow は sourceDraftId (行固有の一意キー) で引く。
 *
 * @param sourceRows 変更元の行一覧 (変更前の状態のまま渡すこと)
 * @param sourceDraftId 変更対象行の draftId
 * @param targetRows 相手候補の行一覧
 * @returns 相手行の draftId。一致が0件 (相手を持たない正常なケースを含む) または
 *   2件以上のときは undefined
 */
export function findLinkedRowDraftId(
  sourceRows: StyleLinkableRow[],
  sourceDraftId: string,
  targetRows: StyleLinkableRow[],
): string | undefined {
  const sourceRow = sourceRows.find((r) => r.draftId === sourceDraftId);
  if (!sourceRow || !sourceRow.styleId) return undefined;
  let matchedDraftId: string | undefined;
  let matchCount = 0;
  for (const row of targetRows) {
    if (row.styleId === sourceRow.styleId) {
      matchCount += 1;
      matchedDraftId = row.draftId;
    }
  }
  return matchCount === 1 ? matchedDraftId : undefined;
}

// ---------------------------------------------------------------------------
// resolveSaveReturnTarget
// ---------------------------------------------------------------------------
/**
 * 大会フォーム保存後の戻り先を判定する純粋関数。
 *
 * チーム大会・練習の保存後に `navigation.popToTop()` で MainTabs (チーム一覧) まで
 * 吹き飛ばされ、直前にいた TeamDetail の大会タブへ戻れなくなるバグの修正に使う。
 * `teamId` は「チームの大会フローで開いている」ことを示す唯一の手がかりなので、
 * これが非空文字なら TeamDetail の大会タブへ戻す対象、そうでなければ個人フロー
 * (ダッシュボード起点) とみなす。
 *
 * 個人フロー (`teamId` なし) 時のフォールバックは呼び出し画面が `options.fallback` で
 * 指定する。省略時は `popToTop` (この関数が導入された時点の既定値)。
 * `CompetitionTabFormScreen` は中間に別画面を挟まず直接開かれる経路 (ダッシュボード
 * 日次詳細・個人の大会一覧等) が主であり `goBack()` で正しく戻れるため、
 * `options.fallback: "goBack"` を明示的に渡している。
 *
 * @param teamId 大会フォームの route.params.teamId。個人フローでは undefined。
 * @param options.fallback 個人フロー時のフォールバック種別 (省略時 "popToTop")
 * @returns 戻り先を表す判別可能なユニオン
 */
export type SaveReturnTarget =
  | { kind: "team"; teamId: string }
  | { kind: "popToTop" }
  | { kind: "goBack" };

export function resolveSaveReturnTarget(
  teamId: string | null | undefined,
  options?: { fallback?: "popToTop" | "goBack" },
): SaveReturnTarget {
  if (teamId && teamId.trim() !== "") {
    return { kind: "team", teamId };
  }
  return options?.fallback === "goBack" ? { kind: "goBack" } : { kind: "popToTop" };
}

// ---------------------------------------------------------------------------
// isDefaultUntouchedRecord
// ---------------------------------------------------------------------------
/**
 * レコード行が「未編集のデフォルト行」かどうかを判定する純粋関数。
 * isDefaultUntouchedEntry (エントリー行版) の判定パターンをそのまま踏襲する。
 * mergeEntriesIntoRecords が「未編集のデフォルト空行1件のみ」の状態を検出し、
 * 追加ではなくその行自体を置き換えるために使う。
 *
 * styleId は `defaultStyleId` との一致に加えて空文字も「未編集」とみなす。
 * 理由: 「既存データ初期化」effect (competitions/entries/records の複数直列 await)
 * と「種目一覧取得」effect (defaultEntryStyleIdRef.current を書き込む単純な1回の GET)
 * はどちらが先に解決するか保証されない。前者が後に解決する順序では、その fallback で
 * 作られる空行の styleId ("") と、この関数が比較する defaultStyleId (既に "1" 等の
 * 実値になっている) が食い違い、他の全フィールドが未入力にもかかわらず「未編集では
 * ない」と誤判定されて記録タブに空行が残ってしまう (mergeEntriesIntoRecords の
 * isSingleDefaultRow 判定が false になる)。他の全フィールド (time/note/isRelaying 等)
 * が空であることは既に上のガードで確定しているため、styleId が空文字であること
 * 自体は「まだ何も選んでいない未編集行」の証拠として defaultStyleId の値に関わらず
 * 常に成立する。この判定は defaultEntryStyleIdRef.current の解決順序に依存しない。
 *
 * @param record 判定対象のレコード行 (RecordDraftRow の判定に必要な部分集合)
 * @param defaultStyleId 種目取得後に自動セットされたデフォルト種目 ID。未取得時は空文字。
 * @returns 既存DBレコードではなく、かつ全項目が未編集のデフォルト値のとき true
 */
export interface RecordRowForMerge {
  existingRecordId?: string;
  draftId: string;
  styleId: string;
  time: number;
  timeDisplayValue: string;
  note: string;
  isRelaying: boolean;
  reactionTime: string;
  splitTimes: unknown[];
  videoPath: string | null;
  videoThumbnailPath: string | null;
}

export function isDefaultUntouchedRecord(
  record: RecordRowForMerge,
  defaultStyleId: string,
): boolean {
  if (record.existingRecordId) return false;
  if (record.time !== 0) return false;
  if (record.timeDisplayValue.trim() !== "") return false;
  if (record.note.trim() !== "") return false;
  if (record.isRelaying) return false;
  if (record.reactionTime.trim() !== "") return false;
  if (record.splitTimes.length !== 0) return false;
  if (record.videoPath) return false;
  if (record.videoThumbnailPath) return false;
  return record.styleId === "" || record.styleId === defaultStyleId;
}

// ---------------------------------------------------------------------------
// mergeEntriesIntoRecords
// ---------------------------------------------------------------------------
/**
 * エントリータブで入力された種目を、記録タブの入力行として引き継ぐ純粋関数。
 * 旧 EntryLogFormScreen の「続けて大会記録を作成」(エントリー保存後にエントリー
 * 済み種目ぶんの記録行を自動生成する導線) を、統合タブ画面向けに再現する。
 *
 * - 追加のみで削除・上書きはしない: 既存の記録行 (DB復元行・ユーザー入力済み行) は
 *   ユーザー本人の入力であり、エントリー側の状態だけを根拠に消してよい理由がないため。
 *   この設計により、呼び出し後は entries と records の行数・並び順が一致しなくなり
 *   うる (削除は一切しないが追加はする一方通行のため)。対応する行を突き合わせる際は
 *   配列インデックスではなく styleId を使うこと (findLinkedRowDraftId 参照)。
 * - styleId で突き合わせる: 記録行とエントリー行は生成元 (DB行/自動生成/手入力) が
 *   異なり配列インデックスが対応する保証がないため、ドメイン上の同一性は styleId のみ。
 * - 「未編集のデフォルト空行1件のみ」の場合はその行を置き換える (追加しない): 空行が
 *   先頭に残り続けるとユーザーが必ず手動で消す羽目になるため (isDefaultUntouchedEntry
 *   と同じ理由)。
 * - タイムは prefill しない: エントリータイムは目標タイムであり実績値ではないため、
 *   誤って記録として保存される事故を避ける (createRecord が呼ぶ空行ファクトリに
 *   styleId 以外の値を混ぜないこと)。
 * - `alreadyMergedStyleIds` に含まれる styleId は二度と追加しない: この関数はタブが
 *   開かれるたびに呼ばれうるため、styleId 単位の突き合わせだけでは「一度自動生成した
 *   行をユーザーが手動削除した後、タブを再度開くと復活する」という事故が起きる
 *   (削除は明示的なユーザー操作であり、エントリー側の状態を理由に上書きしてよい
 *   根拠がないため、削除を尊重し続ける必要がある)。呼び出し側は本関数が返す
 *   `addedStyleIds` を保存しておき、次回呼び出し時に `alreadyMergedStyleIds` として
 *   渡し返すことで「1種目につき自動生成は一度だけ」を実現する。
 *
 * @param records 現在の記録行一覧
 * @param entries 現在のエントリー行一覧 (未編集のデフォルト行は無視する)
 * @param defaultStyleId 種目取得後に自動セットされたデフォルト種目 ID
 * @param createRecord 種目 ID のみを指定した空の記録行を作るファクトリ (呼び出し側の
 *   createEmptyRecord() をラップする想定。時刻・備考等の他フィールドは初期値のまま)
 * @param alreadyMergedStyleIds これまでに自動追加済みの styleId 集合。含まれる styleId は
 *   記録行が現存しなくても再追加しない
 * @returns `records`: 引き継ぎ後の記録行一覧 (追加すべき種目が無ければ引数と同一参照)。
 *   `addedStyleIds`: 今回新たに追加した styleId の一覧 (呼び出し側が
 *   `alreadyMergedStyleIds` の更新に使う。追加が無ければ空配列)
 */
export interface MergeEntriesIntoRecordsResult<R extends RecordRowForMerge> {
  records: R[];
  addedStyleIds: string[];
}

export function mergeEntriesIntoRecords<R extends RecordRowForMerge>(
  records: R[],
  entries: EntryRowForDefaultCheck[],
  defaultStyleId: string,
  createRecord: (styleId: string) => R,
  alreadyMergedStyleIds: ReadonlySet<string>,
): MergeEntriesIntoRecordsResult<R> {
  const validEntryStyleIds: string[] = [];
  for (const entry of entries) {
    if (!entry.styleId) continue;
    if (isDefaultUntouchedEntry(entry, defaultStyleId)) continue;
    if (alreadyMergedStyleIds.has(entry.styleId)) continue;
    if (!validEntryStyleIds.includes(entry.styleId)) {
      validEntryStyleIds.push(entry.styleId);
    }
  }
  if (validEntryStyleIds.length === 0) return { records, addedStyleIds: [] };

  const firstRecord = records[0];
  const isSingleDefaultRow =
    records.length === 1 && firstRecord != null && isDefaultUntouchedRecord(firstRecord, defaultStyleId);
  const baseRecords = isSingleDefaultRow ? [] : records;

  const existingStyleIds = new Set(
    baseRecords.map((r) => r.styleId).filter((id) => id !== ""),
  );
  const missingStyleIds = validEntryStyleIds.filter((id) => !existingStyleIds.has(id));
  if (missingStyleIds.length === 0) return { records, addedStyleIds: [] };

  const newRecords = missingStyleIds.map((styleId) => createRecord(styleId));
  return { records: [...baseRecords, ...newRecords], addedStyleIds: missingStyleIds };
}

// ---------------------------------------------------------------------------
// diffRecordDraft
// ---------------------------------------------------------------------------
/**
 * レースレコードドラフトリストの差分を計算する純粋関数。
 * 編集モード用: 追加/更新/削除の意図を返す。
 *
 * @param drafts 現在のドラフト一覧（recordId が存在するものは既存、なければ新規）
 * @param existingIds 既存 DB レコードの id 一覧
 */
export interface RecordDiff {
  creates: string[]; // ドラフトのローカルID（新規作成対象）
  updates: string[]; // 既存DBのrecordId（更新対象）
  deletes: string[]; // 既存DBのrecordId（削除対象）
}

export function diffRecordDraft(
  drafts: Array<{ draftId: string; existingRecordId?: string }>,
  existingIds: string[],
): RecordDiff {
  const creates: string[] = [];
  const updates: string[] = [];
  const handledExistingIds = new Set<string>();

  for (const draft of drafts) {
    if (draft.existingRecordId) {
      updates.push(draft.existingRecordId);
      handledExistingIds.add(draft.existingRecordId);
    } else {
      creates.push(draft.draftId);
    }
  }

  const deletes = existingIds.filter((id) => !handledExistingIds.has(id));
  return { creates, updates, deletes };
}
