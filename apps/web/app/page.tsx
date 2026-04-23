import {
  LpNav,
  LpHero,
  LpHeroLiveCard,
  LpFeatureSection,
  LpScannerBlock,
  LpPricing,
  LpFinalCTA,
} from "./_components/lp";
import StaticFooter from "@/components/layout/StaticFooter";

export default function Home() {
  return (
    <div style={{ background: "#fbfaf6", minHeight: "100vh" }}>
      <LpNav />
      <main>
        <LpHero />
        <LpHeroLiveCard />
        <LpFeatureSection
          id="lp-feature"
          n="01"
          kicker="Practice"
          headingLine1="サークルを5秒、"
          headingLine2="縮めに行く。"
          body="サークル・本数・セット・タイムを3タップで。前回より早く・長く・強く回るための次の目標が、自動で浮かび上がる。"
          bullets={[
            "サークル / 本数 / セット数を一括入力",
            "ログごとに平均タイム自動計算",
            "タグでメニューをフィルタリング",
          ]}
          imageSrc="/screenshots/lp-practice.png"
          imageAlt="SwimHub 練習記録 - サークル・本数・タイム管理画面"
          flip={false}
          bgColor="paper"
        />
        <LpFeatureSection
          n="02"
          kicker="Competition"
          headingLine1="ベストは、"
          headingLine2="勝手に更新される。"
          body="種目・長水路/短水路・途中タイムを入力すると、ラップ・ベスト・引き継ぎ有無まで自動で整合。書き換えミスが起きない。"
          bullets={[
            "途中タイムからラップ自動計算",
            "LC / SC ベスト表自動更新",
            "引き継ぎあり/なしを区別して記録",
          ]}
          imageSrc="/screenshots/lp-competition.png"
          imageAlt="SwimHub 大会記録 - スプリットタイムとベスト表自動更新画面"
          flip={true}
          bgColor="paper2"
        />
        <LpFeatureSection
          n="03"
          kicker="Team · Coach"
          headingLine1="記録は選手の、"
          headingLine2="資産として残る。"
          body="コーチやマネージャーが代理で一括入力。記録は個人アカウントに紐付いて、チームを移っても、引退しても持ち歩ける。"
          bullets={[
            "コーチ・マネージャーが一括登録",
            "記録は個人に紐付いて蓄積",
            "一生使える競技ログブック",
          ]}
          imageSrc="/screenshots/lp-proxy.png"
          imageAlt="SwimHub コーチ代理入力 - チームメンバーへの一括記録登録画面"
          flip={false}
          bgColor="paper"
        />
        <LpScannerBlock />
        <LpPricing />
        <LpFinalCTA />
      </main>
      <StaticFooter />
    </div>
  );
}
