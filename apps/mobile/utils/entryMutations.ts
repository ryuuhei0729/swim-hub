// =============================================================================
// セルフエントリー保存の衝突解決ロジック（純粋関数）
// =============================================================================
// EntryLogFormScreen の保存処理から「フォーム上の各 style_id に対する最終意図」を
// 1回で解決する中核ロジックを切り出したもの。副作用（API 呼び出し・認証）を含まず、
// 入力（フォーム行・既存 DB エントリー）から create / update / delete の意図のみを算出する。
//
// 設計上の不変条件:
//   - (competition_id, user_id, style_id) UNIQUE 制約を尊重し、同一 style に 2 行を作らない。
//   - 同一 DB エントリー id を二度 update しない（updates の id は一意）。
//   - update の id と delete の id は互いに素（同じ id を update かつ delete しない）。
//   - フォームに残った style の編集値が、後続反復で旧値に上書きされない（style 単位で最終意図を一元化）。
// web apps/web/hooks/useTeamEntry.ts:230-242 の「既存あれば update / 無ければ create」セマンティクスに準拠。

/** 解決処理への入力となる正規化済みフォーム行（表示文字列ではなく確定値で渡す）。 */
export interface ResolveFormEntry {
  /** フォーム行のローカル id（DB の UUID または一時 id "1" / "entry-..."）。並び順の安定化に使用。 */
  formId: string;
  /** 数値の style_id（フォームで選択された種目）。 */
  styleId: number;
  /** 秒単位のエントリータイム。未入力は null。 */
  entryTime: number | null;
  /** サニタイズ済みのメモ。空は null。 */
  note: string | null;
}

/** 解決処理への入力となる既存 DB エントリー（このユーザー・この大会のもの）。 */
export interface ResolveExistingEntry {
  id: string;
  styleId: number;
}

/** create する内容（DB id を持たない）。 */
export interface EntryCreate {
  styleId: number;
  entryTime: number | null;
  note: string | null;
}

/** update する内容（対象 DB id を持つ）。 */
export interface EntryUpdate {
  id: string;
  styleId: number;
  entryTime: number | null;
  note: string | null;
}

/** 解決結果。create / update / delete の意図を相互に素な集合で返す。 */
export interface ResolvedEntryMutations {
  creates: EntryCreate[];
  updates: EntryUpdate[];
  /** 削除対象の DB エントリー id 一覧。 */
  deletes: string[];
}

/**
 * フォーム行と既存 DB エントリーから、保存に必要な create / update / delete を解決する。
 *
 * アルゴリズム:
 *   1. フォーム行を styleId でグルーピングし、同一 style に複数行がある場合は
 *      「最後に現れた行」の値を採用して 1 つにまとめる（重複 style を 1 行に集約）。
 *      → これにより同一 style の 2 行入力でも UNIQUE 制約を侵さず、編集値が旧値に上書きされない。
 *   2. 集約後の各 style について、対応する既存 DB エントリー（style 一致）があれば update、
 *      なければ create とする。種目入替（A: Fr→Br）も「Br に既存があれば update / 無ければ create」
 *      として扱うため、A の編集意図が Br エントリーに反映され Br は 1 行だけ残る。
 *   3. フォームに残らなかった既存 style（フォームから消えた style）の DB エントリーのみ delete。
 *   4. update に使った DB id は集合管理し、delete からは除外する（二重処理・データ損失を防止）。
 *
 * @param formEntries フォーム上の入力行（正規化済み）。styleId が 0 / NaN の無効行は無視される。
 * @param existingEntries 既存 DB エントリー（このユーザー・この大会）。
 * @param isEditMode 編集モードか。false（新規作成）の場合、フォームに無い既存 style の delete は行わない（web 同様、新規作成は削除を伴わない）。
 */
export function resolveEntryMutations(
  formEntries: ResolveFormEntry[],
  existingEntries: ResolveExistingEntry[],
  isEditMode: boolean,
): ResolvedEntryMutations {
  // 既存 DB エントリーを style_id で索引化。
  // UNIQUE(competition_id, user_id, style_id) 前提のため style ごとに 1 件だが、
  // 万一重複があっても最初の 1 件を採用し、残りは「未処理 → 削除」に回す。
  const existingByStyle = new Map<number, ResolveExistingEntry>();
  for (const existing of existingEntries) {
    if (!existingByStyle.has(existing.styleId)) {
      existingByStyle.set(existing.styleId, existing);
    }
  }

  // (1) フォーム行を styleId で集約。同一 style は最後の行で上書き（後勝ち）。
  //     挿入順を保つため Map を使う（JS の Map は挿入順を保持）。
  const intendedByStyle = new Map<number, ResolveFormEntry>();
  for (const form of formEntries) {
    if (!Number.isInteger(form.styleId) || form.styleId <= 0) continue; // 無効 style は無視
    intendedByStyle.set(form.styleId, form);
  }

  const creates: EntryCreate[] = [];
  const updates: EntryUpdate[] = [];
  const processedExistingIds = new Set<string>();

  // (2) 各意図 style を create / update に振り分け。
  for (const [styleId, form] of intendedByStyle) {
    const existing = existingByStyle.get(styleId);
    if (existing) {
      updates.push({
        id: existing.id,
        styleId,
        entryTime: form.entryTime,
        note: form.note,
      });
      processedExistingIds.add(existing.id);
    } else {
      creates.push({
        styleId,
        entryTime: form.entryTime,
        note: form.note,
      });
    }
  }

  // (3)(4) 編集モードのみ: フォームに残らなかった既存エントリーを削除。
  //        update 済み id は processedExistingIds で除外され、二重処理されない。
  const deletes: string[] = [];
  if (isEditMode) {
    for (const existing of existingEntries) {
      if (!processedExistingIds.has(existing.id)) {
        deletes.push(existing.id);
      }
    }
  }

  return { creates, updates, deletes };
}
