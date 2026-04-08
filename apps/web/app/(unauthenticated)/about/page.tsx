import React from "react";
import Link from "next/link";
import {
  BuildingOfficeIcon,
  UserCircleIcon,
  ClockIcon,
  ChartBarIcon,
  UserGroupIcon,
  FlagIcon,
  DevicePhoneMobileIcon,
  SparklesIcon,
  LightBulbIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/outline";
import { BackButton } from "@/components/ui/BackButton";

export const revalidate = 3600;

export const metadata = {
  title: "運営者情報・サービス概要 | SwimHub",
  description:
    "SwimHubの運営者情報・サービス概要・開発ストーリーについてご紹介します。水泳選手・コーチ・チーム管理者のための記録管理サービスSwimHubの詳細をご覧ください。",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <BackButton />
          <div className="flex items-center mb-4">
            <BuildingOfficeIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">運営者情報・サービス概要</h1>
          </div>
          <p className="text-gray-600">
            SwimHubの運営者情報、サービスの詳細、開発に込めた想いについてご案内します。
          </p>
        </div>

        {/* コンテンツ */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-10">
          {/* サービス概要 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">サービス概要</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                SwimHub は、水泳選手・コーチ・チーム管理者のための総合記録管理サービスです。
                日々の練習記録から公式大会の結果まで、水泳に関するあらゆるデータを
                一つのプラットフォームで一元管理できるWebアプリケーションを提供しています。
                スマートフォンやタブレット、パソコンなど、どのデバイスからでもアクセスでき、
                いつでもどこでも記録の入力・閲覧が可能です。
              </p>
              <p>
                主な機能として、練習メニューの記録と振り返り、大会エントリーの管理と結果の記録、
                ベストタイムの自動更新と成長グラフの可視化、チームメンバーの管理と記録共有、
                目標タイムの設定と達成度の追跡などがあります。これらの機能を通じて、
                選手の日々の努力を「見える化」し、モチベーションの維持と競技力の向上をサポートします。
              </p>
              <p>
                SwimHub は個人の選手から、スイミングクラブや学校の部活動といったチーム単位まで、
                幅広い規模でご利用いただけます。コーチが選手の記録を一括で確認したり、
                チーム全体のベストタイムランキングを表示したりする機能も備えており、
                チーム運営の効率化にも貢献します。
              </p>
              <p>
                また、水泳というスポーツの特性を深く理解した上で設計されているため、
                種目（自由形・背泳ぎ・平泳ぎ・バタフライ・個人メドレー）や距離（25m〜1500m）、
                プールの種類（短水路・長水路）といった水泳固有の情報を正確に扱うことができます。
                汎用的なフィットネスアプリでは実現できない、水泳に最適化された記録管理体験を提供します。
              </p>
            </div>
          </section>

          {/* SwimHubが生まれた理由 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <span className="inline-flex items-center">
                <LightBulbIcon className="w-6 h-6 text-blue-600 mr-2" />
                SwimHubが生まれた理由
              </span>
            </h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                SwimHub の開発は、運営者自身の水泳経験から生まれた課題意識がきっかけです。
                小学生の頃からスイミングクラブに通い、中学・高校・大学と競泳を続ける中で、
                練習記録や大会結果の管理には常に苦労していました。
                練習ノートに手書きでタイムを記録し、大会の結果は紙のプログラムに赤ペンで書き込む。
                そんなアナログな管理方法が当たり前の時代でした。
              </p>
              <p>
                大学では Excelのスプレッドシートを使って記録を管理するようになりましたが、
                データの入力が面倒で続かなかったり、ファイルがどこにあるか分からなくなったり、
                スマートフォンからはうまく閲覧できなかったりと、新たな問題が生まれました。
                チームの記録を共有しようとすると、さらに管理は煩雑になります。
                「もっとシンプルに、もっと直感的に記録を管理できるツールがあれば」
                ——そう感じたことが、SwimHub 構想の原点です。
              </p>
              <p>
                ソフトウェアエンジニアとしてのスキルを活かし、自分が本当に欲しかったツールを
                自分の手で作ろうと決意しました。開発初期は、自分自身や身近な水泳仲間が
                使いやすいことを最優先に設計しました。実際に練習後にプールサイドでスマートフォンから
                タイムを入力し、使い勝手を検証しながら改善を重ねていきました。
                この「自分がユーザーである」という強みが、SwimHub の使いやすさの根幹にあります。
              </p>
              <p>
                開発を進める中で、同じ悩みを持つ水泳選手やコーチが想像以上に多いことを実感しました。
                特にジュニア選手の保護者から「子どもの成長記録を残したい」という声や、
                コーチから「チーム全員のタイムを効率的に管理したい」という要望をいただき、
                個人利用だけでなくチーム機能の開発にも力を入れるようになりました。
              </p>
              <p>
                現在も、ユーザーの皆さまからのフィードバックをもとに機能の追加・改善を続けています。
                「水泳を頑張るすべての人が、自分の成長を実感できるように」——この想いは、 SwimHub
                を立ち上げた日から変わっていません。技術の力で水泳というスポーツを
                もっと楽しく、もっと充実したものにしていきたいと考えています。
              </p>
            </div>
          </section>

          {/* SwimHubの特徴 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <span className="inline-flex items-center">
                <SparklesIcon className="w-6 h-6 text-blue-600 mr-2" />
                SwimHubの特徴
              </span>
            </h2>
            <div className="space-y-6">
              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <ClockIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">直感的な記録入力</h3>
                  <p className="text-gray-700 leading-relaxed">
                    水泳の記録入力に最適化されたインターフェースを採用しています。
                    種目・距離を選択し、タイムを入力するだけで記録が完了します。
                    分・秒・ミリ秒の入力欄が分かれているため、タイムの打ち間違いを防ぎ、
                    練習直後のプールサイドでもストレスなく素早く入力できます。
                    過去に入力した種目が候補として表示されるため、繰り返し入力する手間も軽減されます。
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <ChartBarIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">ベストタイム自動更新</h3>
                  <p className="text-gray-700 leading-relaxed">
                    記録を入力するたびに、種目・距離・プール種別ごとのベストタイムが
                    自動的に判定・更新されます。自己ベストを更新した際には通知が表示され、
                    モチベーションの向上につながります。ベストタイムの推移をグラフで確認できるため、
                    長期的な成長の軌跡を視覚的に把握することも可能です。
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <UserGroupIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">チーム管理機能</h3>
                  <p className="text-gray-700 leading-relaxed">
                    スイミングクラブや学校の部活動など、チーム単位での利用に対応しています。
                    コーチや管理者はチームメンバーの記録を一覧で確認でき、
                    選手の代わりに記録を入力する「代理入力」機能も搭載しています。
                    チーム内のベストタイムランキングや、大会ごとの出場メンバー管理など、
                    チーム運営に必要な機能を幅広く提供します。
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <FlagIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">目標設定と進捗管理</h3>
                  <p className="text-gray-700 leading-relaxed">
                    種目ごとに目標タイムを設定し、現在のベストタイムとの差を常に確認できます。
                    目標に対する達成度がパーセンテージで表示されるため、
                    「あと何秒縮めればいいか」が一目で分かります。
                    大会に向けた中間目標を複数設定することもでき、
                    段階的な目標達成をサポートします。
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">マルチデバイス対応</h3>
                  <p className="text-gray-700 leading-relaxed">
                    レスポンシブデザインを採用しており、スマートフォン・タブレット・パソコンの
                    いずれからでも快適にご利用いただけます。練習後はスマートフォンからサッと記録を入力し、
                    自宅のパソコンでじっくりデータを分析するといった使い分けが可能です。
                    すべてのデータはクラウドに保存されるため、デバイスの故障や機種変更時にも
                    データが失われる心配がありません。
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4 mt-1">
                  <CheckBadgeIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">水泳に特化した設計</h3>
                  <p className="text-gray-700 leading-relaxed">
                    一般的なフィットネスアプリとは異なり、競泳の慣習やルールを深く理解した上で
                    設計されています。短水路と長水路の区別、個人メドレーのラップタイム管理、
                    公式大会と練習記録の分類など、水泳選手が日常的に必要とする機能を
                    過不足なく搭載しています。水泳経験者が開発しているからこそ実現できる、
                    かゆいところに手が届く使い心地です。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 他サービスとの違い */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">他サービスとの違い</h2>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">汎用フィットネスアプリとの違い</h3>
                <p>
                  一般的なフィットネスアプリは、ランニング・ウォーキング・ジムトレーニングなど
                  多種多様なスポーツに対応していますが、水泳の記録管理に関しては機能が限定的です。
                  例えば、種目ごとのベストタイム管理や短水路・長水路の区別、大会記録の管理などは
                  汎用アプリではサポートされていないことがほとんどです。SwimHub
                  は水泳専用に設計されているため、
                  競泳選手が本当に必要とする機能を過不足なく提供できます。
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">スプレッドシート管理との違い</h3>
                <p>
                  Excel や Google スプレッドシートでの管理は柔軟性がありますが、
                  データの入力に手間がかかり、ベストタイムの自動判定や成長グラフの生成はできません。
                  また、チームで共有する場合は編集権限の管理やデータの整合性維持が難しくなります。
                  SwimHub では記録入力からデータ分析まで一貫した体験を提供し、
                  管理の手間を大幅に削減します。
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">紙のノート・手書き管理との違い</h3>
                <p>
                  練習ノートに手書きで記録する方法は今でも多くの選手が実践していますが、
                  過去の記録を検索したり、タイムの推移をグラフで確認したりすることが困難です。
                  ノートを紛失するリスクもあります。SwimHub ではすべてのデータがクラウドに安全に
                  保存され、いつでも瞬時に過去の記録を検索・参照できます。
                  紙のノートとの併用も可能で、デジタルとアナログの良いところを両立できます。
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">水泳経験者が開発している強み</h3>
                <p>
                  SwimHub は、実際に長年水泳に取り組んできた運営者が開発しています。
                  そのため、選手やコーチが「あったら嬉しい」と感じる機能を的確に実装できます。
                  例えば、大会前のテーパリング期間における調整記録の管理や、
                  リレーメンバーの選考に役立つランキング表示など、水泳の現場を知っているからこそ
                  実現できる細やかな機能が SwimHub の強みです。
                </p>
              </div>
            </div>
          </section>

          {/* 運営者情報テーブル */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">運営者情報</h2>
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="w-full text-left">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700 w-1/3">
                      サービス名
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">SwimHub</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      運営者
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">Ryuhei Hosoi</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      所在地
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">日本</td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      連絡先
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                        お問い合わせフォーム
                      </Link>
                      よりご連絡ください
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-gray-50 px-6 py-4 text-sm font-medium text-gray-700">
                      サービスURL
                    </th>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <a
                        href="https://swim-hub.app"
                        className="text-blue-600 hover:text-blue-800 underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        https://swim-hub.app
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 運営者プロフィール */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              <span className="inline-flex items-center">
                <UserCircleIcon className="w-6 h-6 text-blue-600 mr-2" />
                運営者プロフィール
              </span>
            </h2>
            <div className="bg-blue-50 rounded-lg p-6 space-y-4">
              <p className="text-gray-700 leading-relaxed">
                はじめまして。SwimHub 運営者の <strong>Ryuhei</strong> です。
                このページをご覧いただきありがとうございます。
                ここでは、私自身の水泳経験と技術的なバックグラウンドについて
                詳しくご紹介させていただきます。
              </p>

              <h3 className="font-medium text-gray-900 pt-2">水泳との出会いと選手時代</h3>
              <p className="text-gray-700 leading-relaxed">
                水泳を始めたのは小学校1年生の時でした。地元のスイミングクラブに通い始め、
                最初は水に顔をつけるのも怖かったのを今でも覚えています。
                しかし、少しずつ泳げるようになる喜びに夢中になり、
                小学校3年生からは選手コースに進みました。週6回の練習に打ち込み、
                地方大会や全国ジュニアオリンピックにも出場する機会をいただきました。
              </p>

              <p className="text-gray-700 leading-relaxed">
                中学・高校では学校の水泳部に所属し、インターハイや国体予選を目指して
                練習に励みました。朝練・午後練の二部練習は体力的にハードでしたが、
                仲間と切磋琢磨しながら自己ベストを更新していく過程は、
                今の自分の原点になっています。大学でも体育会水泳部に所属し、
                インカレ出場を目標に4年間競技を続けました。
              </p>

              <h3 className="font-medium text-gray-900 pt-2">コーチング・指導経験</h3>
              <p className="text-gray-700 leading-relaxed">
                選手としての活動と並行して、大学時代からジュニア選手の指導にも携わってきました。
                スイミングクラブで小中学生の選手コースを担当し、泳法指導だけでなく、
                練習メニューの作成や大会への引率も経験しました。
                指導者の立場に立つことで、「選手一人ひとりの記録を正確に把握し、
                適切なフィードバックを返すことの大切さ」を身をもって学びました。
                同時に、多くの選手の記録を手作業で管理することの限界も痛感し、
                デジタルツールによる効率化の必要性を強く感じるようになりました。
              </p>

              <p className="text-gray-700 leading-relaxed">
                現在もマスターズスイマーとして大会に出場しており、
                年齢を重ねても水泳を楽しみ続けています。マスターズ大会では、
                ジュニアから社会人まで幅広い年齢層の方と交流する機会があり、
                「年代を問わず使いやすいサービス」の重要性を実感しています。
              </p>

              <h3 className="font-medium text-gray-900 pt-2">技術的バックグラウンド</h3>
              <p className="text-gray-700 leading-relaxed">
                本業はソフトウェアエンジニアとして、Webアプリケーションやモバイルアプリの
                開発に従事しています。フロントエンドからバックエンド、インフラまで
                幅広い技術領域をカバーしており、その経験をSwimHubの開発に活かしています。
                特に、ユーザーインターフェースの使いやすさ（UI/UX）には強いこだわりを持っており、
                技術的な知識がない方でも直感的に操作できるデザインを心がけています。
              </p>

              <h3 className="font-medium text-gray-900 pt-2">SwimHub に込めた想い</h3>
              <p className="text-gray-700 leading-relaxed">
                私は「水泳の知識」と「技術力」の両方を持ち合わせていることが、 SwimHub
                の最大の強みだと考えています。水泳の現場を知らないエンジニアが作るツールでは、
                選手やコーチの本当のニーズに応えることは難しい。逆に、水泳の知識だけでは
                使いやすいアプリケーションを作ることはできません。
                この2つの専門性を掛け合わせることで、他にはない価値を提供できると信じています。
              </p>

              <p className="text-gray-700 leading-relaxed">
                SwimHub はまだ成長途中のサービスですが、ユーザーの皆さまの声を大切にしながら、
                一つひとつ機能を充実させていきます。「こんな機能が欲しい」「ここが使いにくい」
                といったご意見がございましたら、ぜひ
                <Link href="/contact" className="text-blue-600 hover:text-blue-800 underline">
                  お問い合わせ
                </Link>
                からお気軽にご連絡ください。水泳を愛するすべての方にとって、 SwimHub
                が日々の練習や大会を「もっと楽しく、もっと充実したもの」にする
                お手伝いができれば幸いです。
              </p>
            </div>
          </section>

          {/* 関連サービス */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">関連サービス</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              SwimHub では、メインの記録管理サービスに加えて、
              水泳に役立つ以下の関連サービスも提供しています。 いずれも SwimHub
              と連携して使うことで、より充実した水泳ライフをサポートします。
            </p>
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">SwimHub Timer</h3>
                <p className="text-gray-700 leading-relaxed">
                  水泳練習用のインターバルタイマーアプリです。
                  練習メニューに合わせてインターバル時間や本数を設定し、
                  音声やバイブレーションで通知を受けることができます。
                  プールサイドでの使用を想定した大きな文字表示と、
                  水しぶきがかかっても操作しやすいシンプルなインターフェースが特徴です。
                  オフライン環境でも動作するため、Wi-Fi
                  のないプール施設でも問題なくご利用いただけます。
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-5">
                <h3 className="font-medium text-gray-900 mb-2">SwimHub Scanner</h3>
                <p className="text-gray-700 leading-relaxed">
                  AI（人工知能）を活用した大会結果の自動読み取りサービスです。
                  大会で配布される紙のリザルトシートやタイムシートをスマートフォンのカメラで撮影するだけで、
                  記載されているタイムや順位を自動的にデジタルデータとして取り込みます。
                  手入力の手間を大幅に省き、大会直後でもすぐに結果をSwimHubに記録できます。
                  複数選手の結果を一括で読み取ることにも対応しており、チームでの利用にも最適です。
                </p>
              </div>
            </div>
          </section>

          {/* ポリシー */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">各種ポリシー</h2>
            <p className="text-gray-700 leading-relaxed mb-3">
              当サービスの各種ポリシーについては、以下のページをご確認ください。
            </p>
            <ul className="space-y-3 ml-4">
              <li>
                <Link href="/privacy" className="text-blue-600 hover:text-blue-800 underline">
                  プライバシーポリシー
                </Link>
                <span className="text-gray-500 text-sm ml-2">— 個人情報の取り扱いについて</span>
              </li>
              <li>
                <Link href="/terms" className="text-blue-600 hover:text-blue-800 underline">
                  利用規約
                </Link>
                <span className="text-gray-500 text-sm ml-2">— サービスのご利用条件について</span>
              </li>
              <li>
                <Link href="/tokushoho" className="text-blue-600 hover:text-blue-800 underline">
                  特定商取引法に基づく表記
                </Link>
                <span className="text-gray-500 text-sm ml-2">— 販売事業者情報・返品ポリシー等</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
