# AI テスター (agent-testers)

モバイルアプリ (`apps/mobile`) を GitHub Actions 上でビルドし、ペルソナごとに 1 台の Android エミュレーター /
iOS シミュレーターを用意して、Claude Code のエージェントに新規ユーザーとして触らせる仕組み。
大きな文字サイズ・小さい画面・タブレット・多言語でのレイアウト崩れや、迷いやすい導線を探すのが目的で、
決まった手順を毎回確かめる E2E テストの代わりではない（結果は毎回変わる）。

[pierridotite/mobile-agent-testers](https://github.com/pierridotite/mobile-agent-testers)
（コミット `dd6e726`、MIT, [LICENSE.upstream](LICENSE.upstream)）を swim-hub 用に取り込んだもの。

## 構成

| ファイル | 内容 |
|---|---|
| `.github/workflows/agent-testers.yml` | 手動実行のワークフロー（ビルド → ペルソナごとのジョブ → 暗号化してアップロード） |
| `personas.json` | ペルソナ 12 人（Android 7 / iOS 5）。端末・OS・文字サイズ・言語・Android のナビゲーションモード (`device.nav`: `3button` / `gesture`、省略で端末イメージの既定)・目的 |
| `AGENT_BRIEF.md` | エージェントへの指示（ログイン手順、禁止事項、確認項目、レポート形式） |
| `scripts/build/` | pnpm モノレポ + Expo prebuild でのビルド（swim-hub 用に書き直し） |
| `scripts/android/`, `scripts/ios/` | 画面を見る・タップする・入力するツールと、エージェントの起動 |
| `setup.sh` | 初回セットアップ（鍵ペアと Secrets） |
| `collect.sh` | 結果のダウンロードと復号、`SUMMARY.md` の作成 |

## 初回セットアップ

1. **development の Supabase にテスト専用アカウントを作る**（メール + パスワード、オンボーディング済み、
   できればテスト用チームに所属）。複数のエージェントが同時に使うので、本番や個人のアカウントは使わない。
2. 自分のターミナルで実行する（認証情報はここでだけ入力する）:
   ```bash
   bash tools/agent-testers/setup.sh
   ```
   - `~/.mobile-agent-testers/<owner>_swim-hub.pem` に秘密鍵を作り、`results_public.pem` に公開鍵を書く
   - Secrets を設定: `ARTIFACT_PASSPHRASE`、`CLAUDE_CODE_OAUTH_TOKEN`（または `ANTHROPIC_API_KEY`）、
     `AGENT_TESTERS_LOGIN_EMAIL`、`AGENT_TESTERS_LOGIN_PASSWORD`
   - `apps/mobile/.env.keys` から `DOTENV_PRIVATE_KEY_DEVELOPMENT_MOBILE` を設定（`apps/mobile/.env.development` の復号用。
     web/ルートの `DOTENV_PRIVATE_KEY_DEVELOPMENT` とは別の鍵）
3. `tools/agent-testers/results_public.pem` をコミットし、main にマージする
   （`workflow_dispatch` のワークフローはデフォルトブランチにないと実行できない）。

## 実行と回収

```bash
# 既定: Android 2 人 (haruto, sachiko) + iOS 2 人 (yui, sato)
gh workflow run agent-testers.yml

# ペルソナを選ぶ / 全員 / 片方だけ / ブランチを指定
gh workflow run agent-testers.yml -f android_personas=haruto,daniel -f ios_personas=none --ref feature/xxx
gh workflow run agent-testers.yml -f android_personas=all -f ios_personas=all

# 終わったら手元で復号（tools/agent-testers/runs/<run id>/ に展開。gitignore 済み）
bash tools/agent-testers/collect.sh <run id>
```

`runs/<run id>/SUMMARY.md` に重大度順の一覧が出る（`claude` CLI があれば同じバグのレポートをまとめる。
その際、レポートのタイトル・画面名・重大度だけが Claude に送られる。`SUMMARY_GROUPING=0` で無効）。
エージェントは画面を読み違えることがあるので、**修正や issue 化の前に必ずスクリーンショットを確認する**。

## ペルソナ

| id | 端末 | 設定 | 主な狙い |
|---|---|---|---|
| haruto | Pixel 7 / Android 14 | 標準 | 練習記録の登録 |
| sachiko | Pixel 7 / Android 14 | フォント 200% | 大きい文字での大会記録の登録 |
| kenta | Nexus 5 / Android 11 | フォント 130%・ダーク | 小さい画面、目標設定 |
| mei | Pixel Tablet / Android 14 | 標準 | タブレットでのチーム画面 |
| daniel | Pixel 6 / Android 13 | 英語・115% | 英語の翻訳漏れ |
| riku | Pixel 7 / Android 15 | 3 ボタンナビゲーション | Edge-to-Edge（バーとの重なり） |
| aoi | Pixel 7 / Android 15 | ジェスチャーナビゲーション | Edge-to-Edge（バーとの重なり） |
| yui | iPhone SE (3rd) | 文字 XXXL | 小さい画面 × 大きい文字 |
| tomoko | iPhone 16 Pro Max | アクセシビリティ最大 | 最大の文字サイズでの崩れ |
| sato | iPad Air 11" | ダーク | iPad での一括登録 |
| minjun | iPhone 16 | 韓国語 | 韓国語の翻訳漏れ |
| lena | iPhone 16e | ドイツ語・XL | 長いドイツ語のはみ出し |

## 費用と制限

- swim-hub は公開リポジトリなので、GitHub のランナー（macOS 含む）は無料。macOS は同時 5 ジョブまで。
- Claude の使用量は 1 エージェントあたりおよそ $0.15〜0.55（上流の実績）。Pro/Max のサブスクリプションだと、
  20 エージェントを同時に回すと 5 時間枠を約 15 分で使い切るので、一度に 4〜6 人程度にする。
- ビルドは Android 約 20〜30 分、iOS 約 30〜45 分。

## セキュリティ上の設計

- **公開リポジトリのログ・アーティファクトは誰でも見られる**: ビルドログ・レポート・スクリーンショット・動画は
  RSA 公開鍵で暗号化してからアップロードし、復号できるのは秘密鍵を持つ手元のマシンだけ。アプリ本体は
  `ARTIFACT_PASSPHRASE` で暗号化。暗号化前の内容をログに出すステップを追加しないこと。
- **本番に向けない**: ビルドは `.env.development` を使い、`EXPO_PUBLIC_ENVIRONMENT=production` なら止まる。
- **エージェントの権限を絞っている**: 許可するのは画面操作のスクリプト、`adb`、`sleep` / `ls` / `mkdir`、
  ファイルの読み取り、`results/` の下への書き込みだけ（スクリプトの書き換えはできない）。`/proc` や
  `~/.claude` などの読み取りは拒否。
- **依存は固定**: Actions はコミット SHA、Claude Code・Pillow はバージョン、AXe はリリースの sha256 で固定。
  上げるときは公開から 2 週間以上たったものにする。
- **実行できるのは書き込み権限のある人だけ**（`workflow_dispatch` のみ。フォークの PR からは動かない）。
- 残るリスク: `adb` はエミュレーター内で任意のコマンドを実行できる。テスト用アカウントの認証情報は
  エージェントのプロンプトに入る（ログではマスクされ、エージェントの出力は暗号化される）。テスト用アカウントは
  使い捨てのものにしておく。
