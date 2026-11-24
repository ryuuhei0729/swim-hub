import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";

export function formatDay(value: string | null | undefined): string {
  if (!value) return "-";
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy-MM-dd", { locale: ja }) : "-";
}

export function formatDayTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy-MM-dd HH:mm", { locale: ja }) : "-";
}

export function formatAgo(value: string | null | undefined): string {
  if (!value) return "-";
  const date = parseISO(value);
  return isValid(date) ? formatDistanceToNowStrict(date, { locale: ja, addSuffix: true }) : "-";
}

export function formatStyle(style: { distance: number; style: string } | null): string {
  return style ? `${style.distance}m ${style.style}` : "-";
}

export function formatPool(poolType: number): string {
  return poolType === 1 ? "長水路" : "短水路";
}
