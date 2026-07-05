#!/usr/bin/env node
// Figma テンプレの構造を解析して、スクショ流し込み枠の座標を見つけるための調査スクリプト。
// あなたのターミナルで実行してください（Claude のサンドボックスからは外部通信できないため）。
//
//   cd swim-hub/apps/mobile
//   node scripts/screenshots/figma-inspect.mjs > /tmp/figma-tree.txt
//   # 出力をチャットに貼る
//
// トークンは .figma-token から自動で読む（env FIGMA_TOKEN でも可）。
// 対象ファイル/ノードは env で上書き可: FIGMA_FILE_KEY, FIGMA_NODE_ID
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE_KEY = process.env.FIGMA_FILE_KEY || "SiSPtkM2VdTYrKZhwa7CtI";
const NODE_ID = process.env.FIGMA_NODE_ID || "2:802"; // 共有 URL の node-id（2-802 → 2:802）

function token() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN.trim();
  try {
    return readFileSync(join(HERE, "../../.figma-token"), "utf8").trim();
  } catch {
    console.error("ERROR: FIGMA_TOKEN env も .figma-token も見つかりません");
    process.exit(1);
  }
}
const TOKEN = token();

async function api(path) {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { "X-Figma-Token": TOKEN },
  });
  if (!res.ok) {
    console.error(`Figma API ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return res.json();
}

const fillKind = (n) => {
  const fills = n.fills || [];
  const types = fills.map((f) => f.type).filter(Boolean);
  return types.length ? `fills=[${types.join(",")}]` : "";
};

// 画像枠っぽいノードを推定: IMAGE fill を持つ / 名前に screen|mockup|placeholder|画像 を含む
const looksLikePlaceholder = (n) => {
  const name = (n.name || "").toLowerCase();
  const hasImageFill = (n.fills || []).some((f) => f.type === "IMAGE");
  return hasImageFill || /screen|mockup|placeholder|画像|スクショ|image/.test(name);
};

function printNode(n, depth, flagPlaceholders) {
  const b = n.absoluteBoundingBox;
  const size = b ? `${Math.round(b.width)}x${Math.round(b.height)} @(${Math.round(b.x)},${Math.round(b.y)})` : "";
  const flag = flagPlaceholders && looksLikePlaceholder(n) ? "  <== 画像枠候補?" : "";
  const text = n.type === "TEXT" && n.characters ? `  "${n.characters.slice(0, 30).replace(/\n/g, " ")}"` : "";
  console.log(`${"  ".repeat(depth)}- [${n.type}] ${n.name} {${n.id}} ${size} ${fillKind(n)}${text}${flag}`);
  // 枠の中の主要な子だけ（深すぎると読みにくいので depth<=4）
  if (n.children && depth < 4) {
    for (const c of n.children) printNode(c, depth + 1, flagPlaceholders);
  }
}

const pages = await api(`/files/${FILE_KEY}?depth=1`);
console.log(`# FILE: ${pages.name}`);
console.log(`# PAGES:`);
for (const p of pages.document.children || []) {
  console.log(`  - PAGE "${p.name}" {${p.id}}`);
}

console.log(`\n# 共有された NODE ${NODE_ID} のサブツリー（画像枠候補をフラグ表示）:`);
const node = await api(`/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(NODE_ID)}&depth=4`);
const doc = node.nodes?.[NODE_ID]?.document;
if (!doc) {
  console.log("(指定ノードが見つかりません。URL の node-id を確認してください)");
} else {
  printNode(doc, 0, true);
}
