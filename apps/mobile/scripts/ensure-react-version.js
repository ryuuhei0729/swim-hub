/**
 * モノレポ環境で react のバージョンが react-native-renderer と一致するように
 * ローカル node_modules に正しいバージョンの react をインストールするスクリプト。
 *
 * pnpm の hoisted node-linker では、Web アプリ (react@19.2.3) の react が
 * ルート node_modules に hoisted され、Mobile アプリ (react@19.1.0) と
 * react-native-renderer のバージョンが不一致になる問題を解消する。
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const EXPECTED_REACT_VERSION = "19.1.0";
const mobileRoot = path.resolve(__dirname, "..");
const localReactDir = path.resolve(mobileRoot, "node_modules", "react");
const localReactPkg = path.resolve(localReactDir, "package.json");

// 既に正しいバージョンがインストールされていればスキップ
if (fs.existsSync(localReactPkg)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(localReactPkg, "utf8"));
    if (pkg.version === EXPECTED_REACT_VERSION) {
      console.log(`[ensure-react] react@${EXPECTED_REACT_VERSION} already installed locally.`);
      process.exit(0);
    }
  } catch {
    // パースエラーの場合は再インストール
  }
}

console.log(`[ensure-react] Installing react@${EXPECTED_REACT_VERSION} to apps/mobile/node_modules/react...`);

try {
  // npm pack でダウンロードして展開
  const tmpDir = require("os").tmpdir();
  const tgzPath = path.join(tmpDir, `react-${EXPECTED_REACT_VERSION}.tgz`);

  execSync(`npm pack react@${EXPECTED_REACT_VERSION} --pack-destination "${tmpDir}"`, {
    stdio: "pipe",
    cwd: tmpDir,
  });

  // 古いディレクトリを削除して再作成
  if (fs.existsSync(localReactDir)) {
    fs.rmSync(localReactDir, { recursive: true });
  }

  fs.mkdirSync(localReactDir, { recursive: true });
  execSync(`tar xzf "${tgzPath}" --strip-components=1 -C "${localReactDir}"`, {
    stdio: "pipe",
  });

  // tgz を削除
  fs.unlinkSync(tgzPath);

  console.log(`[ensure-react] Successfully installed react@${EXPECTED_REACT_VERSION}`);
} catch (err) {
  console.error("[ensure-react] Failed to install react:", err.message);
  process.exit(1);
}
