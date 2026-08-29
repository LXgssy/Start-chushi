import type { NextConfig } from "next";

/**
 * 三构建模式：
 * - 默认（standalone）：生产部署 .next/standalone，含 /api 动态路由能力
 * - EXPORT_MODE=1（export）：纯静态导出到 out/，供 GitHub Pages 使用；
 *   必须配合 NEXT_PUBLIC_BASE_PATH=/Start-chushi（Pages 项目站为仓库子路径），
 *   代码内的绝对路径引用（gallery.ts 本地壁纸等）经该变量前缀化
 * - EXTENSION_MODE=1（extension）：静态导出到 out/ 且不带 basePath——
 *   Edge/Chrome 扩展打包用，扩展源（chrome-extension://<id>/）即站点根
 */
const isExport = process.env.EXPORT_MODE === "1";
const isExtension = process.env.EXTENSION_MODE === "1";
const BASE_PATH = "/Start-chushi";

const nextConfig: NextConfig = {
  ...(isExtension
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : isExport
      ? {
          output: "export",
          basePath: BASE_PATH,
          assetPrefix: BASE_PATH,
          images: { unoptimized: true },
        }
      : {
          output: "standalone",
        }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
