"use client";

import { useEffect } from "react";

/**
 * Service Worker 注册——离线缓存（一次加载，长期使用）。
 * - 仅生产构建注册（导出/standalone 均为 production）
 * - Pages 项目站经 NEXT_PUBLIC_BASE_PATH 前缀化，本地根路径构建时为空串
 * - 本地生产预览默认不注册（缓存会干扰 rAF 探针验证），
 *   URL 带 ?__sw 时强制开启，用于离线缓存专项测试
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    /* 扩展页（chrome-extension:// 等）不支持页面 SW 注册，直接跳过 */
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      return;
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      location.hostname
    );
    if (local && !location.search.includes("__sw")) return;
    const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker
      .register(`${bp}/sw.js`, {
        scope: `${bp}/`,
        /* SW 脚本更新检查绕过 HTTP 缓存，部署新版本后尽快被发现 */
        updateViaCache: "none",
      })
      .catch(() => {
        /* 注册失败静默降级：无 SW 时行为与旧版一致 */
      });
  }, []);

  return null;
}
