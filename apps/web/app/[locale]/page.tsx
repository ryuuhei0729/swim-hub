// LP は localePrefix: 'always' 環境のため、locale-aware な Link を使う。
// `next/link` だと href="/signup" が middleware の 308 リダイレクトに飛ばされ
// 二重 round-trip になる。`@/i18n/navigation` の Link は現在の locale を保持する。
import { getTranslations, setRequestLocale } from "next-intl/server";

import LpNav from "./_components/lp/LpNav";
import LpHero from "./_components/lp/LpHero";
import LpMarquee from "./_components/lp/LpMarquee";
import LpFeatures from "./_components/lp/LpFeatures";
import LpScanner from "./_components/lp/LpScanner";
import LpPricing from "./_components/lp/LpPricing";
import LpServices from "./_components/lp/LpServices";
import LpFinalCta from "./_components/lp/LpFinalCta";
import LpFooter from "./_components/lp/LpFooter";
// LapProgressBar は LpNav 内部でレンダリングされる
import LpStopwatch from "./_components/lp/LpStopwatch";
import LpScrollEffects from "./_components/lp/LpScrollEffects";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Turbopack 環境で requestLocale 伝播が失敗するケースに備え、locale を明示的に渡す
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "lp.v42" });
  // lp.footer は既存 lp namespace から (lp.footer.terms 等)
  const tLpFooter = await getTranslations({ locale, namespace: "lp.footer" });

  // features items は配列 — t.raw() で取得
  const f1Items = t.raw("features.f1.items") as string[];
  const f2Items = t.raw("features.f2.items") as string[];
  const f3Items = t.raw("features.f3.items") as string[];
  const freePlanItems = t.raw("pricing.free.items") as string[];
  const premiumPlanItems = t.raw("pricing.premium.items") as string[];

  return (
    <div
      style={{
        background: "var(--lp-bg)",
        color: "var(--lp-ink)",
        fontFamily: "var(--font-zen-kaku-gothic-new, var(--font-inter), sans-serif)",
        fontSize: 15,
        lineHeight: 1.95,
        overflowX: "clip",
      }}
    >
      {/* LP スコープの CSS: body の overflow-x 対応 */}
      <style>{`
        html, body { overflow-x: clip; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* ナビ (Client) */}
      <LpNav
        t={{
          practice: t("nav.practice"),
          competition: t("nav.competition"),
          proxy: t("nav.proxy"),
          pricing: t("nav.pricing"),
          signup: t("hero.cta.signup"),
          login: t("hero.cta.login"),
        }}
      />

      {/* ヒーロー (Server) */}
      <LpHero
        t={{
          ghostText: t("hero.ghostText"),
          h1Line1: t("hero.h1Line1"),
          h1Line2: t("hero.h1Line2"),
          h1Line3Blue: t("hero.h1Line3Blue"),
          h1Line3Suffix: t("hero.h1Line3Suffix"),
          lead: t("hero.lead"),
          ctaSignup: t("hero.cta.signup"),
          ctaLogin: t("hero.cta.login"),
          appStoreLabel: t("hero.store.appStore"),
          googlePlayLabel: t("hero.store.googlePlay"),
          comingSoon: t("hero.store.comingSoon"),
          deviceCaption: t("hero.deviceCaption"),
          downloadOn: t("hero.downloadOn"),
        }}
      />

      {/* マーキー (Client, dark) */}
      <LpMarquee items={[]} light={false} />

      {/* 機能 ×3 (Server) */}
      <LpFeatures
        t={{
          introLabel: t("features.introLabel"),
          introH2: t("features.introH2"),
          f1: {
            label: t("features.f1.label"),
            title: t("features.f1.title"),
            desc: t("features.f1.desc"),
            items: f1Items,
          },
          f2: {
            label: t("features.f2.label"),
            title: t("features.f2.title"),
            desc: t("features.f2.desc"),
            items: f2Items,
          },
          f3: {
            label: t("features.f3.label"),
            title: t("features.f3.title"),
            desc: t("features.f3.desc"),
            items: f3Items,
          },
        }}
      />

      {/* Scanner (Server, dark) */}
      <LpScanner
        t={{
          label: t("scanner.label"),
          h2: t("scanner.h2"),
          desc1: t("scanner.desc1"),
          desc2: t("scanner.desc2"),
          cta: t("scanner.cta"),
        }}
      />

      {/* 白band: Pricing + Services */}
      <div style={{ background: "var(--lp-panel)" }}>
        <LpPricing
          t={{
            label: t("pricing.label"),
            h2: t("pricing.h2"),
            lead: t("pricing.lead"),
            detailLink: t("pricing.detailLink"),
            free: {
              name: t("pricing.free.name"),
              price: t("pricing.free.price"),
              note: t("pricing.free.note"),
              items: freePlanItems,
              cta: t("pricing.free.cta"),
            },
            premium: {
              name: t("pricing.premium.name"),
              price: t("pricing.premium.price"),
              badge: t("pricing.premium.badge"),
              annualNote: t("pricing.premium.annualNote"),
              items: premiumPlanItems,
              cta: t("pricing.premium.cta"),
            },
          }}
        />

        <LpServices
          t={{
            label: t("services.label"),
            h2: t("services.h2"),
            lead: t("services.lead"),
            timer: {
              name: t("services.timer.name"),
              tagline: t("services.timer.tagline"),
              desc: t("services.timer.desc"),
              cta: t("services.timer.cta"),
            },
            scanner: {
              name: t("services.scanner.name"),
              tagline: t("services.scanner.tagline"),
              desc: t("services.scanner.desc"),
              cta: t("services.scanner.cta"),
            },
          }}
        />
      </div>

      {/* マーキー 2 (Client, light / reverse) */}
      <LpMarquee items={[]} light={true} />

      {/* 最終 CTA (Server) */}
      <LpFinalCta
        t={{
          label: t("finalCta.label"),
          h2: t("finalCta.h2"),
          desc: t("finalCta.desc"),
          signup: t("hero.cta.signup"),
          login: t("hero.cta.login"),
          appStoreLabel: t("hero.store.appStore"),
          googlePlayLabel: t("hero.store.googlePlay"),
          downloadOn: t("hero.downloadOn"),
          comingSoon: t("hero.store.comingSoon"),
        }}
      />

      {/* フッター (Server, dark) */}
      <LpFooter
        t={{
          tagline: t("footer.tagline"),
          copyright: t("footer.copyright"),
          slogan: t("footer.slogan"),
          terms: tLpFooter("terms"),
          privacy: tLpFooter("privacy"),
          about: tLpFooter("about"),
        }}
      />

      {/* ストップウォッチ (Client, fixed) */}
      <LpStopwatch ariaLabel={t("stopwatch.ariaLabel")} />

      {/* スクロールエフェクト (Client): §6.4 パララックス / §6.6 リベール */}
      <LpScrollEffects />
    </div>
  );
}
