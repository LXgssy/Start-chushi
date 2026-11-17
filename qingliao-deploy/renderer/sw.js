/* 轻聊 Service Worker：静态资源缓存优先（运行时积累），导航网络优先（保证可更新）
   激活时清理一切旧缓存，确保新版本构建总能生效 */
;(function () {
  'use strict'
  var CACHE = 'qingliao-assets-v3'

  self.addEventListener('install', function () {
    self.skipWaiting()
  })

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      (async function () {
        // 清理所有非当前版本的缓存（含旧版本 SW 留下的缓存）
        var names = await caches.keys()
        await Promise.all(
          names
            .filter(function (n) {
              return n !== CACHE
            })
            .map(function (n) {
              return caches.delete(n)
            })
        )
        await self.clients.claim()
      })()
    )
  })

  self.addEventListener('fetch', function (event) {
    var req = event.request
    if (req.method !== 'GET') return
    var url = new URL(req.url)
    if (url.origin !== location.origin) return

    // 页面导航：网络优先，离线时回退缓存（保证新版本可被及时获取）
    if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
      event.respondWith(
        fetch(req)
          .then(function (resp) {
            return resp
          })
          .catch(function () {
            return caches.match(req).then(function (hit) {
              return hit || Response.error()
            })
          })
      )
      return
    }

    // 静态资源（带哈希的 js/css/字体/图片）：缓存优先
    event.respondWith(
      caches.open(CACHE).then(async function (cache) {
        var hit = await cache.match(req)
        if (hit) return hit
        try {
          var resp = await fetch(req)
          if (resp && resp.ok) {
            cache.put(req, resp.clone())
          }
          return resp
        } catch (e) {
          var fallback = await caches.match(req)
          if (fallback) return fallback
          throw e
        }
      })
    )
  })
})()
