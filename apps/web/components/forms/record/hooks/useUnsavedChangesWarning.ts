"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

interface UseUnsavedChangesWarningOptions {
  isOpen: boolean;
  hasUnsavedChanges: boolean;
  isSubmitted: boolean;
}

/**
 * 未保存の変更がある場合にブラウザの離脱警告を表示するフック
 */
export const useUnsavedChangesWarning = ({
  isOpen,
  hasUnsavedChanges,
  isSubmitted,
}: UseUnsavedChangesWarningOptions): void => {
  const t = useTranslations("forms.unsavedChanges");
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handlePopState = () => {
      if (hasUnsavedChanges && !isSubmitted) {
        const confirmed = window.confirm(t("messageBack"));
        if (!confirmed) {
          window.history.pushState(null, "", window.location.href);
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isOpen, hasUnsavedChanges, isSubmitted, t]);
};

export default useUnsavedChangesWarning;
