import type { RcSubscription, StripeInvoice, StripeSubscription } from "@/lib/billing";
import { formatDay, formatDayTime, formatStripeAmount, formatUsd } from "@/lib/format";
import { Empty, Table } from "./ui";

const STRIPE_STATUS_LABEL: Record<string, string> = {
  active: "有効",
  trialing: "トライアル中",
  past_due: "支払い遅延",
  canceled: "解約済み",
  unpaid: "未払い",
  incomplete: "初回決済が未完了",
  incomplete_expired: "初回決済が期限切れ",
  paused: "一時停止",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  paid: "支払い済み",
  open: "未払い",
  draft: "下書き",
  void: "無効",
  uncollectible: "回収不能",
};

const RC_STATUS_LABEL: Record<string, string> = {
  active: "有効",
  trialing: "トライアル中",
  expired: "失効",
  in_grace_period: "猶予期間",
  in_billing_retry: "請求リトライ中",
  paused: "一時停止",
  unknown: "不明",
};

const RC_RENEWAL_LABEL: Record<string, string> = {
  will_renew: "更新する",
  will_not_renew: "更新しない (解約予約)",
  will_change_product: "商品を変更予定",
  will_pause: "一時停止予定",
  requires_price_increase_consent: "値上げの同意待ち",
  has_already_renewed: "更新済み",
};

export function stripeStatusLabel(status: string): string {
  return STRIPE_STATUS_LABEL[status] ?? status;
}

export function rcStatusLabel(status: string): string {
  return RC_STATUS_LABEL[status] ?? status;
}

export function stripePlanLabel(subscription: StripeSubscription): string {
  const interval =
    subscription.interval === "year"
      ? "年額"
      : subscription.interval === "month"
        ? "月額"
        : (subscription.interval ?? "-");
  return `${interval} ${formatStripeAmount(subscription.amount, subscription.currency)}`;
}

export function rcRenewalLabel(subscription: RcSubscription): string {
  if (!subscription.autoRenewalStatus) return "-";
  return RC_RENEWAL_LABEL[subscription.autoRenewalStatus] ?? subscription.autoRenewalStatus;
}

export function LoadError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      取得できませんでした ({message})
    </p>
  );
}

export function StripeSubscriptionRows({ subscriptions }: { subscriptions: StripeSubscription[] }) {
  if (subscriptions.length === 0) return <Empty>Stripe に契約がありません</Empty>;
  return (
    <Table head={["状態", "プラン", "開始", "次回更新 / 期間の終わり", "解約予約", "解約日", "終了日"]}>
      {subscriptions.map((subscription) => (
        <tr key={subscription.id}>
          <td>{stripeStatusLabel(subscription.status)}</td>
          <td>{stripePlanLabel(subscription)}</td>
          <td>{formatDay(subscription.createdAt)}</td>
          <td>{formatDay(subscription.currentPeriodEnd)}</td>
          <td>{subscription.cancelAtPeriodEnd ? "あり" : "-"}</td>
          <td>{formatDay(subscription.canceledAt)}</td>
          <td>{formatDay(subscription.endedAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function StripeInvoiceRows({ invoices }: { invoices: StripeInvoice[] }) {
  if (invoices.length === 0) return <Empty>請求の履歴がありません</Empty>;
  return (
    <Table head={["請求日時", "状態", "支払い済み", "請求額"]}>
      {invoices.map((invoice) => (
        <tr key={invoice.id}>
          <td>{formatDayTime(invoice.createdAt)}</td>
          <td>{invoice.status ? (INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status) : "-"}</td>
          <td className="text-right tabular-nums">
            {formatStripeAmount(invoice.amountPaid, invoice.currency)}
          </td>
          <td className="text-right tabular-nums">
            {formatStripeAmount(invoice.amountDue, invoice.currency)}
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function RcSubscriptionRows({ subscriptions }: { subscriptions: RcSubscription[] }) {
  if (subscriptions.length === 0) return <Empty>RevenueCat に契約がありません</Empty>;
  return (
    <Table
      head={["状態", "アプリ", "商品", "ストア", "環境", "自動更新", "開始", "期間の終わり", "累計売上 (USD)"]}
    >
      {subscriptions.map((subscription) => (
        <tr key={subscription.id}>
          <td>{rcStatusLabel(subscription.status)}</td>
          <td>{subscription.appName}</td>
          <td className="font-mono text-xs">{subscription.productName}</td>
          <td>{subscription.store}</td>
          <td>{subscription.environment}</td>
          <td>{rcRenewalLabel(subscription)}</td>
          <td>{formatDay(subscription.startsAt)}</td>
          <td>{formatDay(subscription.currentPeriodEndsAt)}</td>
          <td className="text-right tabular-nums">{formatUsd(subscription.grossUsd)}</td>
        </tr>
      ))}
    </Table>
  );
}
