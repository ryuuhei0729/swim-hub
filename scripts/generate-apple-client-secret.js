/**
 * Apple Sign In 用の Client Secret (JWT) を生成するスクリプト
 *
 * 使用方法:
 * node scripts/generate-apple-client-secret.js
 *
 * 環境変数または以下の値を直接編集してください
 */

const jwt = require('jsonwebtoken')
const fs = require('fs')
const path = require('path')

// ===== 設定値（編集してください） =====
const TEAM_ID = process.env.APPLE_TEAM_ID || 'TVJ2JG75MZ'  // Apple Developer の Team ID
const KEY_ID = process.env.APPLE_KEY_ID || 'QKK8K4ST76'       // .p8 ファイルの Key ID
const CLIENT_ID = process.env.APPLE_CLIENT_ID || 'app.swimhub.web'  // Service ID（Web用）
const P8_FILE_PATH = process.env.APPLE_P8_PATH || path.join(__dirname, '..', 'AuthKey_QKK8K4ST76.p8')
// =====================================

// .p8 ファイルを読み込み
let privateKey
try {
  privateKey = fs.readFileSync(P8_FILE_PATH, 'utf8')
} catch (error) {
  console.error('Error: .p8 ファイルが見つかりません:', P8_FILE_PATH)
  console.error('P8_FILE_PATH を正しく設定してください')
  process.exit(1)
}

// JWT を生成（有効期限: 6ヶ月）
const now = Math.floor(Date.now() / 1000)
const expiresIn = 15777000 // 約6ヶ月（秒）

const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + expiresIn,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
}

const header = {
  alg: 'ES256',
  kid: KEY_ID,
}

try {
  const clientSecret = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    header: header,
  })

  console.log('\n===== Apple Client Secret (JWT) =====\n')
  console.log(clientSecret)
  console.log('\n=====================================\n')
  console.log('この JWT を Supabase Dashboard の "Secret Key" フィールドに貼り付けてください。')
  console.log(`有効期限: ${new Date((now + expiresIn) * 1000).toISOString()}`)
  console.log('\n注意: JWT は約6ヶ月で期限切れになります。期限切れ前に再生成してください。')
} catch (error) {
  console.error('JWT 生成エラー:', error.message)
  if (TEAM_ID === 'YOUR_TEAM_ID') {
    console.error('\nTEAM_ID を設定してください')
  }
  process.exit(1)
}
