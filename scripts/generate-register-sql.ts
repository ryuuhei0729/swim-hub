import fs from 'fs'
import path from 'path'

const CSV_PATH = path.join(__dirname, 'users.csv')
const OUTPUT_PATH = path.join(__dirname, 'register-users.sql')

interface UserRow {
  name: string
  email: string
  password: string
  gender: 0 | 1
}

function parseGender(value: string, lineNum: number): 0 | 1 {
  const normalized = value.trim()
  if (normalized === '男' || normalized === '0') return 0
  if (normalized === '女' || normalized === '1') return 1
  throw new Error(`${lineNum}行目: gender は 男/女 または 0/1 で入力してください`)
}

function parseCsv(content: string): UserRow[] {
  const lines = content.trim().split('\n')
  const header = lines[0].split(',').map((h) => h.trim())

  const nameIdx = header.indexOf('name')
  const emailIdx = header.indexOf('email')
  const passwordIdx = header.indexOf('password')
  const genderIdx = header.indexOf('gender')

  if (nameIdx === -1 || emailIdx === -1 || passwordIdx === -1 || genderIdx === -1) {
    throw new Error('CSVのヘッダーに name, email, password, gender が必要です')
  }

  return lines.slice(1).map((line, i) => {
    const cols = line.split(',').map((c) => c.trim())
    const name = cols[nameIdx]
    const email = cols[emailIdx]
    const password = cols[passwordIdx]
    const genderRaw = cols[genderIdx]

    if (!name || !email || !password || !genderRaw) {
      throw new Error(`${i + 2}行目: name, email, password, gender はすべて必須です`)
    }

    return { name, email, password, gender: parseGender(genderRaw, i + 2) }
  })
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

function generateSql(users: UserRow[]): string {
  const now = new Date().toISOString()
  const instanceId = '00000000-0000-0000-0000-000000000000'

  const values = users
    .map(({ name, email, password, gender }) => {
      const safeName = escapeSql(name)
      const safeEmail = escapeSql(email)
      const safePassword = escapeSql(password)
      const meta = JSON.stringify({ name: safeName, gender: String(gender) })

      return (
        `  (gen_random_uuid(), '${instanceId}', '${safeEmail}', ` +
        `crypt('${safePassword}', gen_salt('bf')), ` +
        `now(), now(), now(), ` +
        `'${meta}'::jsonb, 'authenticated', 'authenticated')`
      )
    })
    .join(',\n')

  return `-- 生成日時: ${now}
-- 登録ユーザー数: ${users.length}
-- 実行方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, role, aud
) VALUES
${values}
ON CONFLICT (email) DO NOTHING;
`
}

function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSVファイルが見つかりません: ${CSV_PATH}`)
    process.exit(1)
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8')
  const users = parseCsv(csvContent)

  if (users.length === 0) {
    console.error('❌ CSVにユーザーが1件もありません')
    process.exit(1)
  }

  console.log(`📋 ${users.length} 件のユーザーを読み込みました`)

  const sql = generateSql(users)
  fs.writeFileSync(OUTPUT_PATH, sql, 'utf-8')

  console.log(`✅ SQLファイルを生成しました: ${OUTPUT_PATH}`)
  console.log()
  console.log('次のステップ:')
  console.log('1. scripts/register-users.sql の内容を確認')
  console.log('2. Supabase ダッシュボード > SQL Editor に貼り付けて実行')
  console.log('3. Authentication > Users でユーザー登録を確認')
}

main()
