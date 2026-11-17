#!/usr/bin/env node
/**
 * 轻聊 → 热铁盒部署（GitHub Actions 版）
 * - 使用官方 CLI 同款 UA：Mozilla/5.0 (linux) RTHHostHelper/6.2.2（WAF 只放行 Mozilla 前缀）
 * - host/site 接口只存在于 overseas 后端（api.retiehe.com 对这些路径一律 501），按官方顺序尝试
 * - 列表接口失败时降级为全量上传（旧哈希文件无害），仅列表成功才清理远端多余文件
 */
const API_KEY = process.env.RTH_API_KEY
const DOMAIN = process.argv[2] || 'qingliao-ai'
const OUTDIR = process.argv[3] || 'release/app/dist/renderer'
const BACKENDS = [
  'https://api-overseas.retiehe.com/backend',
  'https://api-eo.retiehe.com/backend',
  'https://api.retiehe.com/backend',
]

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  'User-Agent': 'Mozilla/5.0 (linux) RTHHostHelper/6.2.2',
  'Accept-Language': 'zh-CN',
})

async function anyBackend(fn) {
  let lastErr
  for (const base of BACKENDS) {
    try {
      return await fn(base)
    } catch (e) {
      lastErr = e
      console.warn(`  [backend ${base}] ${String(e.message || e).slice(0, 140)}`)
    }
  }
  throw lastErr
}

async function verify() {
  const res = await anyBackend(async (base) => {
    const r = await fetch(`${base}/api-key-v2/verification?key=${encodeURIComponent(API_KEY)}`, { headers: headers() })
    if (!r.ok) throw new Error(`verify ${r.status}`)
    return r.json()
  })
  const username = res?.username || res?.result?.username
  if (!username) throw new Error('no username: ' + JSON.stringify(res).slice(0, 200))
  return username
}

async function listRemote() {
  return anyBackend(async (base) => {
    const r = await fetch(`${base}/host/site/content?domain=${encodeURIComponent(DOMAIN)}`, { headers: headers() })
    if (!r.ok) throw new Error(`list ${r.status}`)
    const j = await r.json()
    return j?.result ?? j
  })
}

function* walk(dir) {
  const { readdirSync, statSync } = require('node:fs')
  const { join } = require('node:path')
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else yield [p, st.size]
  }
}

async function uploadBinary(username, relPath, absPath) {
  const { readFileSync } = require('node:fs')
  const { basename } = require('node:path')
  const buf = readFileSync(absPath)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await anyBackend(async (base) => {
        const form = new FormData()
        form.append('content', new Blob([buf], { type: 'application/octet-stream' }), basename(relPath))
        form.append('domain', DOMAIN)
        form.append('key', relPath)
        form.append('username', username)
        const r = await fetch(`${base}/host/site/binary`, { method: 'POST', headers: headers(), body: form })
        if (!r.ok) {
          const text = await r.text()
          throw new Error(`upload ${r.status} ${text.slice(0, 120)}`)
        }
        await r.json()
      })
      return true
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  return false
}

async function deleteRemote(paths) {
  if (!paths.length) return
  await anyBackend(async (base) => {
    const r = await fetch(`${base}/host/site/changes`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changes: paths.map((p) => ({ operation: 'delete', path: p })),
        domain: DOMAIN,
      }),
    })
    if (!r.ok) throw new Error(`delete ${r.status} ${(await r.text()).slice(0, 120)}`)
    await r.json()
  })
}

async function main() {
  const { readdirSync, statSync } = await import('node:fs')
  const { join, relative } = await import('node:path')
  const username = await verify()
  console.log('verified as', username)

  // 远端列表：失败不致命，降级为全量上传
  let remote = null
  try {
    remote = await listRemote()
    console.log('remote list ok,', Object.keys(remote).length, 'entries')
  } catch (e) {
    console.warn('remote list unavailable → 全量上传模式:', String(e.message || e).slice(0, 140))
  }

  const locals = []
  for (const [p, size] of walk(OUTDIR)) {
    locals.push({ rel: relative(OUTDIR, p).split('\\').join('/'), abs: p, size })
  }
  const localSet = new Set(locals.map((f) => f.rel))
  console.log(`local files: ${locals.length}`)

  // 远端有同名文件且 size 一致则跳过（列表不可用时 need 恒为 true）
  let uploaded = 0
  let skipped = 0
  const concurrency = 4
  const queue = [...locals]
  async function worker() {
    while (queue.length) {
      const f = queue.shift()
      const remoteEntry = remote ? remote[f.rel] : undefined
      let need = true
      if (remoteEntry && typeof remoteEntry === 'object' && remoteEntry.size != null && remoteEntry.size === f.size) {
        need = false
      }
      if (!need) {
        skipped++
        continue
      }
      try {
        await uploadBinary(username, f.rel, f.abs)
        uploaded++
        if (uploaded % 25 === 0 || uploaded === locals.length) {
          console.log(`progress: ${uploaded}/${locals.length}`)
        }
      } catch (e) {
        console.error(`FAILED: ${f.rel}: ${String(e.message || e).slice(0, 200)}`)
        process.exitCode = 1
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))

  // 清理远端多余文件（仅列表成功时）
  let staleRemoved = 0
  if (remote) {
    const remotePaths = new Set(Object.keys(remote).filter((p) => !p.endsWith('/')))
    const stale = [...remotePaths].filter((p) => !localSet.has(p) && !p.endsWith('.rth'))
    if (stale.length) {
      console.log(`cleaning ${stale.length} stale files...`)
      for (let i = 0; i < stale.length; i += 50) {
        await deleteRemote(stale.slice(i, i + 50))
          .then(() => { staleRemoved += Math.min(50, stale.length - i) })
          .catch((e) => console.error('delete failed:', String(e.message || e).slice(0, 150)))
      }
    }
  }
  console.log(`done. uploaded=${uploaded} skipped=${skipped} staleRemoved=${staleRemoved}`)
  if (process.exitCode) throw new Error('存在上传失败文件')
}

main().catch((e) => {
  console.error('fatal:', e?.message || e)
  process.exit(1)
})
