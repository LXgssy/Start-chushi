import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "初始 · Start",
  description: "极简、优雅、功能齐全的浏览器起始页：时钟 · 搜索 · 快捷链接 · 天气 · 待办 · 便签。",
  icons: {
    /* basePath 需手动前缀化（Next 不会自动处理 metadata 图标路径），
       Pages 项目站部署于 /Start-chushi 子路径；默认构建 env 为空 → /start.svg */
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/start.svg`,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0e" },
  ],
};

/* 在首帧绘制前恢复用户主题，避免明暗闪烁 */
const themeInit = `(()=>{try{var s=JSON.parse(localStorage.getItem("start:settings")||"{}");var m=s.themeMode||"dark";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
