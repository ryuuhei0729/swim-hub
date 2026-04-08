#!/usr/bin/env node

/**
 * Playwright 向けテストデータ初期化スクリプト
 * - 既存のテスト用ユーザーを削除（auth.users + 連動テーブルが cascade）
 * - オプションで標準テストユーザーを再作成
 *
 * 使用例:
 *   node apps/web/e2e/scripts/reset-test-data.js
 *   node apps/web/e2e/scripts/reset-test-data.js --no-seed   // ユーザー再作成をスキップ
 */

const { createClient } = require("@supabase/supabase-js");
const { createTestUsers } = require("./create-test-user.js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!supabaseServiceKey) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY が設定されていません。環境変数を確認してください。");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Playwright のシナリオで作成する可能性があるメールアドレスとパターン
const STATIC_TEST_EMAILS = new Set([
  "test@example.com",
  "test@swimhub.com",
  "test-admin@swimhub.com",
  "test-user@swimhub.com",
  "e2e-test@swimhub.com",
  "logout-test@swimhub.com",
  "logout-test@swimmanager.com", // テスト内でのタイプミス対策
  "persistence-test@swimhub.com",
  "reset-test@swimhub.com",
  "single-register@swimhub.com",
  "attendance-test@swimhub.com",
]);

const PREFIX_PATTERNS = [/^e2e-/i, /^playwright-/i, /^test-/i];

const DOMAIN_WHITELIST = ["@swimhub.com", "@swimmanager.com"];

const args = process.argv.slice(2);
const shouldSeed = !args.includes("--no-seed");

function shouldDeleteEmail(email) {
  if (!email) return false;

  const normalized = email.toLowerCase();
  if (STATIC_TEST_EMAILS.has(normalized)) {
    return true;
  }

  const matchedDomain = DOMAIN_WHITELIST.some((domain) => normalized.endsWith(domain));
  if (!matchedDomain) {
    return false;
  }

  return PREFIX_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function fetchTargetUsers() {
  const targets = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const { users } = data;
    if (!users || users.length === 0) {
      break;
    }

    for (const user of users) {
      if (shouldDeleteEmail(user.email)) {
        targets.push(user);
      }
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return targets;
}

async function deleteUsers(targetUsers) {
  const failed = [];

  for (const user of targetUsers) {
    const email = user.email || "unknown email";
    process.stdout.write(`🧹 削除中: ${email} ... `);

    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      failed.push({ email, message: error.message });
      console.log("失敗");
    } else {
      console.log("完了");
    }
  }

  return failed;
}

async function main() {
  console.log("🚀 Playwright テストデータ初期化を開始します");

  try {
    const targetUsers = await fetchTargetUsers();

    if (targetUsers.length === 0) {
      console.log("✅ 削除対象のユーザーはありませんでした");
    } else {
      console.log(`📦 削除対象ユーザー件数: ${targetUsers.length} 件`);
      const failed = await deleteUsers(targetUsers);

      if (failed.length > 0) {
        console.warn("⚠️ 一部ユーザーの削除に失敗しました:");
        failed.forEach((item) => {
          console.warn(`   - ${item.email}: ${item.message}`);
        });
      }
    }

    if (shouldSeed) {
      console.log("\n👥 標準テストユーザーを再作成します");
      await createTestUsers();
    } else {
      console.log("\n⏭️  --no-seed オプションのためユーザー再作成をスキップしました");
    }

    console.log("\n🎉 リセット処理が完了しました");
  } catch (error) {
    console.error("\n❌ リセット処理中にエラーが発生しました:", error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
