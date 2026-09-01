import { useCallback, useState } from "react";
import type { PracticeTag } from "@apps/shared/types";

/** タグ選択モーダルが閉じ終わった後に実行する保留アクション。 */
type PendingTagAction = { type: "create" } | { type: "edit"; tag: PracticeTag };

export interface UseTagModalTransitionResult {
  /** TagManageModal に渡す visible。 */
  showTagManageModal: boolean;
  /** TagManageModal に渡す tag (新規作成時は null)。 */
  editingTag: PracticeTag | null;
  /** TagSelectModal の onCreateTag に渡す。 */
  openTagCreateModal: () => void;
  /** TagSelectModal の onEditTag に渡す。 */
  openTagEditModal: (tag: PracticeTag) => void;
  /** TagSelectModal の onClosed に渡す。 */
  handleTagSelectModalClosed: () => void;
  /** TagManageModal の onClosed に渡す。 */
  handleTagManageModalClosed: () => void;
  /** TagManageModal の onClose に渡す (ユーザーが保存/キャンセル/削除で閉じる操作)。 */
  closeTagManageModal: () => void;
}

/**
 * タグ選択モーダル (TagSelectModal) → タグ管理モーダル (TagManageModal) の遷移を
 * 「前のモーダルが実際に閉じ終わった通知 (onClosed) を起点に次を開く」形で管理する。
 *
 * PracticeLogFormScreen / PracticeTabFormScreen / TeamPracticeLogBulkFormScreen の
 * 3画面で同一の状態遷移ロジック (タイミング前提を伴う非自明なレース対策) が複製されて
 * いたため、この1箇所に集約した (Reviewer 指摘: 複製されたレース対策ロジックは
 * 将来1箇所だけ修正され他が取り残される実害が具体的に見込める)。
 *
 * `setShowTagSelectModal` は呼び出し側が持つ TagSelectModal の表示状態セッターを渡す
 * (「TagSelectModal 自体をどう表示するか」は画面ごとの構造差
 * — 例えば TeamPracticeLogBulkFormScreen は対象メニューIDと表示状態を分離している —
 * があるため、このフックの外に置く)。
 */
export function useTagModalTransition(
  setShowTagSelectModal: (visible: boolean) => void,
): UseTagModalTransitionResult {
  const [showTagManageModal, setShowTagManageModal] = useState(false);
  const [editingTag, setEditingTag] = useState<PracticeTag | null>(null);
  const [pendingTagAction, setPendingTagAction] = useState<PendingTagAction | null>(null);

  // タグ管理モーダルを開く（新規作成）: TagSelectModal を閉じ、実際に閉じ終わってから
  // TagManageModal を開くための保留アクションを記録する (handleTagSelectModalClosed 側で処理)。
  const openTagCreateModal = useCallback(() => {
    setPendingTagAction({ type: "create" });
    setShowTagSelectModal(false);
  }, [setShowTagSelectModal]);

  // タグ管理モーダルを開く（編集）: 同上。
  const openTagEditModal = useCallback(
    (tag: PracticeTag) => {
      setPendingTagAction({ type: "edit", tag });
      setShowTagSelectModal(false);
    },
    [setShowTagSelectModal],
  );

  // TagSelectModal (SlideUpModal) が実際にネイティブ Modal の dismiss まで完了した
  // タイミングで呼ばれる (SlideUpModal.onClosed。100ms 固定待ちの廃止)。
  // 保留中のアクションがあれば、ここで初めて TagManageModal を開く。
  const handleTagSelectModalClosed = useCallback(() => {
    if (!pendingTagAction) return;
    setEditingTag(pendingTagAction.type === "edit" ? pendingTagAction.tag : null);
    setShowTagManageModal(true);
    setPendingTagAction(null);
  }, [pendingTagAction]);

  // TagManageModal が実際に閉じ終わったタイミングで、TagSelectModal を再度開く。
  const handleTagManageModalClosed = useCallback(() => {
    setShowTagSelectModal(true);
  }, [setShowTagSelectModal]);

  const closeTagManageModal = useCallback(() => {
    setShowTagManageModal(false);
  }, []);

  return {
    showTagManageModal,
    editingTag,
    openTagCreateModal,
    openTagEditModal,
    handleTagSelectModalClosed,
    handleTagManageModalClosed,
    closeTagManageModal,
  };
}
