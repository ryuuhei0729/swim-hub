// Next.js HTTPS開発サーバー（mkcert使用）
// 使用方法: npm run dev:https
const { createServer } = require('https')
const { parse } = require('url')
const next = require('next')
const fs = require('fs')
const path = require('path')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = 3000

// mkcertで作成した証明書のパス
const certPath = path.join(__dirname, 'localhost.pem')
const keyPath = path.join(__dirname, 'localhost-key.pem')

// 証明書ファイルの存在確認
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error('❌ 証明書ファイルが見つかりません')
  console.error('以下のコマンドで証明書を作成してください:')
  console.error('  mkcert -install')
  console.error(`  mkcert localhost 127.0.0.1 ::1`)
  console.error(`  mv localhost+2.pem ${certPath}`)
  console.error(`  mv localhost+2-key.pem ${keyPath}`)
  process.exit(1)
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }

  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on https://${hostname}:${port}`)
  })
})
