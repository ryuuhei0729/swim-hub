"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import { StyleAPI } from "@apps/shared/api/styles";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { useUnreadRecordFeedbacksQuery } from "@apps/shared/hooks/queries/recordFeedbacks";
import type { UnreadRecordFeedback } from "@apps/shared/types/recordFeedback";
import type { Style } from "@apps/shared/types";
import { formatTimeBest } from "@/utils/formatters";
import { buildSwimStyleLabel, styleIdToCodeKey } from "@/utils/swimStyle";

/** 「閉じる」を押したときに出ていた FB のキー (`${id}:${updated_at}`) を入れておく場所 */
export const RECORD_FEEDBACK_DISMISSED_STORAGE_KEY = "swimhub.recordFeedback.dismissed";
/** 手紙が届くアニメーションの長さ (ms) */
export const RECORD_FEEDBACK_ANIMATION_MS = 3000;

export function recordFeedbackDismissKey(feedback: Pick<UnreadRecordFeedback, "id" | "updated_at">) {
  return `${feedback.id}:${feedback.updated_at}`;
}

function readDismissedKeys(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(RECORD_FEEDBACK_DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeDismissedKeys(keys: Set<string>) {
  try {
    window.sessionStorage.setItem(
      RECORD_FEEDBACK_DISMISSED_STORAGE_KEY,
      JSON.stringify(Array.from(keys)),
    );
  } catch {
    // ストレージが使えない環境では再表示されるだけなので握り潰す
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** 「記録画面へ」の遷移先。/competition が該当の記録の詳細モーダルを開く */
export function buildRecordFeedbackHref(feedback: UnreadRecordFeedback): string {
  const params = new URLSearchParams({ recordId: feedback.record_id });
  if (feedback.competition_id) params.set("competitionId", feedback.competition_id);
  return `/competition?${params.toString()}`;
}

type Phase = "idle" | "animating" | "popup" | "closed";

export interface RecordFeedbackArrivalPopupProps {
  /** false の間は表示しない (他のモーダルが出ている間など) */
  enabled?: boolean;
}

const ANIMATION_CSS = `
@keyframes rfb-fly-in {
  0% { transform: translate(140px, -220px) rotate(-25deg) scale(0.6); opacity: 0; }
  55% { transform: translate(-8px, 6px) rotate(4deg) scale(1.05); opacity: 1; }
  75% { transform: translate(3px, -3px) rotate(-2deg) scale(1); }
  100% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; }
}
@keyframes rfb-flap-open {
  0%, 45% { transform: rotateX(0deg); }
  70%, 100% { transform: rotateX(180deg); }
}
@keyframes rfb-letter-up {
  0%, 60% { transform: translateY(0); }
  85%, 100% { transform: translateY(-34px); }
}
@keyframes rfb-glow {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 0.75; transform: scale(1.1); }
}
.rfb-envelope { animation: rfb-fly-in 1.1s cubic-bezier(.2,.8,.3,1) both; }
.rfb-flap { transform-origin: 50% 0%; transform-box: fill-box; animation: rfb-flap-open 2.4s ease-in-out both; }
.rfb-letter { animation: rfb-letter-up 2.8s ease-out both; }
.rfb-glow { animation: rfb-glow 1.6s ease-in-out infinite; }
`;

/**
 * ダッシュボードで、自分宛ての未読フィードバックを知らせるポップアップ。
 * 仕様: docs/specs/record-feedback.md「受信ポップアップ」
 * - ダッシュボードを表示するたびに未読を確認する
 * - 約3秒の「手紙が届く」アニメーション → 一覧ポップアップ (タップで飛ばせる / reduce motion では出さない)
 * - 「閉じる」は既読にしない。出ていた FB はこのセッション中は再表示しない
 */
export default function RecordFeedbackArrivalPopup({ enabled = true }: RecordFeedbackArrivalPopupProps) {
  const t = useTranslations("recordFeedback");
  const tStyles = useTranslations("practice.styles");
  const locale = useLocale();
  const router = useRouter();
  const { supabase, user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [dismissedKeys, setDismissedKeys] = useState<Set<string> | null>(null);

  // sessionStorage はクライアントでだけ読む (SSR との差分を作らない)
  useEffect(() => {
    setDismissedKeys(readDismissedKeys());
  }, []);

  const unreadQuery = useUnreadRecordFeedbacksQuery(supabase, user?.id, { enabled });

  const visibleItems = useMemo(() => {
    if (!dismissedKeys) return [];
    return (unreadQuery.data ?? []).filter(
      (f) => !dismissedKeys.has(recordFeedbackDismissKey(f)),
    );
  }, [unreadQuery.data, dismissedKeys]);

  const hasItems = visibleItems.length > 0;

  const stylesQuery = useQuery<Style[]>({
    queryKey: styleKeys.list(),
    queryFn: async () => await new StyleAPI(supabase).getStyles(),
    staleTime: Infinity,
    enabled: hasItems,
  });

  // 表示開始
  useEffect(() => {
    if (!enabled || phase !== "idle" || !hasItems) return;
    setPhase(prefersReducedMotion() ? "popup" : "animating");
  }, [enabled, phase, hasItems]);

  // アニメーション終了でポップアップへ
  useEffect(() => {
    if (phase !== "animating") return;
    const timer = window.setTimeout(() => setPhase("popup"), RECORD_FEEDBACK_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const handleSkip = useCallback(() => {
    setPhase((current) => (current === "animating" ? "popup" : current));
  }, []);

  const handleClose = () => {
    const next = new Set(dismissedKeys ?? []);
    for (const item of visibleItems) next.add(recordFeedbackDismissKey(item));
    writeDismissedKeys(next);
    setDismissedKeys(next);
    setPhase("closed");
  };

  const handleGoToRecord = (item: UnreadRecordFeedback) => {
    setPhase("closed");
    router.push(buildRecordFeedbackHref(item));
  };

  const styleLabelOf = (styleId: number): string => {
    const style = stylesQuery.data?.find((s) => s.id === styleId);
    const codeKey = styleIdToCodeKey(styleId);
    if (style && codeKey) return buildSwimStyleLabel(style.distance, tStyles(codeKey), locale);
    return style?.name_jp ?? "";
  };

  if (!enabled || !hasItems || phase === "idle" || phase === "closed") return null;

  if (phase === "animating") {
    return (
      <div
        className="fixed inset-0 z-80 flex items-center justify-center bg-black/30"
        role="button"
        tabIndex={0}
        aria-label={t("popup.skipAnimation")}
        onClick={handleSkip}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
            e.preventDefault();
            handleSkip();
          }
        }}
        data-testid="record-feedback-arrival-animation"
      >
        <style>{ANIMATION_CSS}</style>
        <div className="relative flex flex-col items-center">
          <div className="rfb-glow absolute -inset-10 rounded-full bg-amber-200 blur-2xl" aria-hidden="true" />
          <svg
            className="rfb-envelope relative"
            width="180"
            height="150"
            viewBox="0 0 180 150"
            aria-hidden="true"
          >
            {/* 手紙 (封筒から出てくる) */}
            <g className="rfb-letter">
              <rect x="34" y="40" width="112" height="80" rx="6" fill="#ffffff" stroke="#cbd5e1" />
              <rect x="48" y="56" width="70" height="6" rx="3" fill="#93c5fd" />
              <rect x="48" y="70" width="84" height="6" rx="3" fill="#e2e8f0" />
              <rect x="48" y="84" width="60" height="6" rx="3" fill="#e2e8f0" />
            </g>
            {/* 封筒の本体 */}
            <path d="M20 60 L90 108 L160 60 L160 136 L20 136 Z" fill="#3b82f6" />
            <path d="M20 136 L78 96 M160 136 L102 96" stroke="#1d4ed8" strokeWidth="2" fill="none" />
            {/* ふた (開く) */}
            <path className="rfb-flap" d="M20 60 L90 108 L160 60 Z" fill="#2563eb" />
          </svg>
          <p className="relative mt-6 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-blue-700 shadow">
            {t("popup.title")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-80 overflow-y-auto" data-testid="record-feedback-arrival-popup">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={handleClose} />
        <div
          className="relative w-full max-w-md rounded-xl bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-feedback-popup-title"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <EnvelopeIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 id="record-feedback-popup-title" className="text-base font-semibold text-gray-900">
              {t("popup.title")}
            </h3>
          </div>

          <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
            {visibleItems.map((item) => {
              const styleLabel = styleLabelOf(item.style_id);
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-gray-200 p-3"
                  data-testid="record-feedback-popup-item"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {t("popup.from", { name: item.author_name ?? t("unknownAuthor") })}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    <span>{item.competition_title || t("popup.noCompetition")}</span>
                    {styleLabel && <span> · {styleLabel}</span>}
                    {item.is_relaying && <span> ({t("popup.relay")})</span>}
                    <span className="font-semibold text-blue-700"> · {formatTimeBest(item.time)}</span>
                  </p>
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => handleGoToRecord(item)}
                      data-testid="record-feedback-popup-go"
                    >
                      {t("popup.goToRecord")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-4 py-3">
            <Button variant="outline" onClick={handleClose} data-testid="record-feedback-popup-close">
              {t("popup.close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
