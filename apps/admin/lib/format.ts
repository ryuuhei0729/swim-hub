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

export function unixSecondsToIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export function unixMillisToIso(millis: number | null | undefined): string | null {
  return millis ? new Date(millis).toISOString() : null;
}

// Stripe の金額は最小通貨単位。円は小数が無いのでそのまま、それ以外は 1/100
export function formatStripeAmount(amount: number | null, currency: string): string {
  if (amount === null) return "-";
  const value = currency.toLowerCase() === "jpy" ? amount : amount / 100;
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    Math.round(value),
  );
}
