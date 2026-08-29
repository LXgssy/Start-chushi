# 初始 · ChuShi 起始页

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![React](https://img.shields.io/badge/React-19-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8) ![Motion](https://img.shields.io/badge/framer--motion-12-e74c8b) ![License](https://img.shields.io/badge/Code_License-MIT-green) ![Images](https://img.shields.io/badge/Images-Unsplash_License-lightgrey)

> 一个把「开始新标签页」变成仪式感的浏览器起始页：时钟、搜索、快捷服务、天气、待办、笔记、番茄钟与壁纸图库，全部装进一方极简而克制的画布。

**在线体验**：<https://lxgssy.github.io/Start-chushi/>（GitHub Pages 静态部署，所有数据仅存本地浏览器）

![预览 · 深](docs/preview-dark.png)

## 这是什么

「初始」是一个纯前端浏览器起始页。它不追求信息堆叠，而是把最高频的几个动作——搜索、打开常用网站、看时间、专注计时——打磨到足够优雅：磨砂玻璃的层次、随动画渐凝渐散的雾化过渡、按壁纸明暗自适应的墨色提示词，以及一个可以完全放空的禅模式。

![预览 · 浅](docs/preview-light.png)

## 功能特性

- **时钟**：大字极简时钟，附农历与日期
- **搜索**：多引擎切换（搜索引擎在设置中自定义），支持命令面板快速跳转
- **快捷服务**：Dock 栏与快捷链接卡片，长按可编辑、拖拽排序，favicon 运行时加载
- **天气**：天气面板与栏内天气字标（可配置位置）
- **效率套件**：待办清单、速记笔记、番茄钟（正/倒计时、自动阶段轮转、提示音、Dock 徽标）
- **壁纸系统**：
  - 「辉光」动态光斑背景与「纯净」纯色背景
  - 「掠影」官方图库（Unsplash 精选摄影，含国风十帧本地化高清图）
  - 每日一图按日期自动轮换
  - 自定义壁纸（IndexedDB 本地存储，不上传）
- **禅模式**：一键进入只留时钟与呼吸番茄钟的极简视野；进出有雾化散场/聚拢过渡；退出提示词按背景明暗自动切换墨色；番茄钟计时中会以同色系迷你时钟行浮现，停止计时不打扰
- **明暗主题**：跟随系统，也可手动切换
- **动效**：入场、悬浮、进出禅模式全部使用同一套克制的动画语言，并尊重 `prefers-reduced-motion`

## 快速开始

环境要求：Node.js 18+ 与 [bun](https://bun.sh)（或直接使用 npm）。

```bash
# 安装依赖
bun install        # 或 npm install

# 配置数据库连接（Prisma SQLite，相对路径以 prisma/ 为基准）
echo 'DATABASE_URL="file:../db/custom.db"' > .env
# 仓库已自带空库 db/custom.db；如缺表可执行 bun run db:push

# 开发模式（:3000）
bun run dev        # 或 npm run dev

# 生产构建 + 启动
bun run build
bun run start
```

打开 `http://localhost:3000` 即可。起始页功能不依赖数据库；仓库内的 Prisma/shadcn 脚手架保持平台默认配置，未使用的数据表不影响运行。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15（App Router）+ React 19 |
| 样式 | Tailwind CSS 4 |
| 动效 | framer-motion + 原生 CSS 动画（磨砂玻璃存活原则） |
| 组件 | shadcn/ui（Radix 系列） |
| 数据 | localStorage（偏好/番茄钟）+ IndexedDB（自定义壁纸） |
| 字体 | Geist（经 next/font 自托管，SIL OFL） |
| 图标 | lucide-react（ISC） |

## 图片来源与致谢

本项目的美，一半来自这些摄影师。**代码以 MIT 许可开源，图片不在此列**——所有摄影作品均来自 [Unsplash](https://unsplash.com)，适用 [Unsplash License](https://unsplash.com/license)（免费用于商业与非商业用途，无需逐案授权；唯不可将其汇编为竞争性图库服务或未经修改单独售卖）。

### 随仓库分发的本地壁纸（`public/gallery/`，国风十帧）

以下十张图已本地化存储于本仓库，特此逐张标明出处（编号与 `src/lib/startpage/gallery.ts` 中的 gallery id 一致）：

| gallery id | 名称 | 摄影师 / 机构 | 原片 |
|---|---|---|---|
| `great-wall-sunrise` | 长城映日 | [Johannes Plenio](https://unsplash.com/@jplenio) | [unsplash.com/photos/e7nDDmyZH54](https://unsplash.com/photos/great-wall-of-china-e7nDDmyZH54) |
| `li-river` | 漓江山水 | [Ekaterina Zlotnikova](https://unsplash.com/@katja_zlotnikova) | [unsplash.com/photos/f_jBvzQIgig](https://unsplash.com/photos/lush-green-karst-mountains-flank-a-winding-river-f_jBvzQIgig) |
| `huangshan-peaks` | 黄山云峰 | [Sherry Xu](https://unsplash.com/@sherry_bird) | [unsplash.com/photos/YNximhgXa9k](https://unsplash.com/photos/a-view-of-a-mountain-range-covered-in-fog-YNximhgXa9k) |
| `palace-turret` | 角楼落日 | [Yilei (Jerry) Bao](https://unsplash.com/@yileijerrybao) | [unsplash.com/photos/zbOLCwA9Fq0](https://unsplash.com/photos/brown-concrete-building-near-green-trees-and-lake-during-daytime-zbOLCwA9Fq0) |
| `yulong-river` | 遇龙河畔 | [Joshua Earle](https://unsplash.com/@joshuaearle) | [unsplash.com/photos/EqztQX9btrE](https://unsplash.com/photos/bamboo-raft-EqztQX9btrE) |
| `bamboo-sea` | 竹海幽篁 | [Keisuke Kuribara](https://unsplash.com/@ksukkuri) | [unsplash.com/photos/2CY5P28RdDI](https://unsplash.com/photos/low-angle-photography-of-green-trees-during-daytime-2CY5P28RdDI) |
| `ink-wash-hills` | 墨韵远山 | [Art Institute of Chicago](https://unsplash.com/@artchicago) | [unsplash.com/photos/vjrzHCu0ONk](https://unsplash.com/photos/a-painting-of-a-landscape-with-a-mountain-in-the-background-vjrzHCu0ONk) |
| `ink-pine-cliff` | 松崖云雾 | [The Walters Art Museum](https://unsplash.com/@thewalters) | [unsplash.com/photos/17cN3tYHJrI](https://unsplash.com/photos/traditional-chinese-ink-painting-of-misty-mountains-and-pine-17cN3tYHJrI) |
| `longji-terraces` | 龙脊绿浪 | [Chopsticks on the Loose](https://unsplash.com/@chopsticksontheloose) | [unsplash.com/photos/_75I7lCDgY8](https://unsplash.com/photos/aerial-view-of-green-mountain-during-daytime-_75I7lCDgY8) |
| `misty-terraces` | 云雾梯田 | [Simonetta Pugnaghi](https://unsplash.com/@pugnaghis) | [unsplash.com/photos/JI0aBYrZgkI](https://unsplash.com/photos/beautiful-rice-terraces-winding-up-a-green-mountainside-JI0aBYrZgkI) |

### 运行时热链的图库壁纸（不随仓库分发）

图库其余十四张以 Unsplash CDN 直链热链加载（仓库仅存 URL 字符串，运行时从 Unsplash 官方 CDN 取图），出处以 CDN 文件地址标明：

| gallery id | 名称 | CDN 出处 |
|---|---|---|
| `mist-lake` | 晨雾湖山 | [photo-1470071459604-3b5ec3a7fe05](https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05) |
| `lake-glow` | 湖光斜阳 | [photo-1501785888041-af3ef285b470](https://images.unsplash.com/photo-1501785888041-af3ef285b470) |
| `turquoise-canoe` | 青湖独舟 | [photo-1476514525535-07fb3b4ae5f1](https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1) |
| `green-cliff` | 崖壁青峦 | [photo-1506744038136-46273834b3fb](https://images.unsplash.com/photo-1506744038136-46273834b3fb) |
| `ridge-clouds` | 云海山脊 | [photo-1464822759023-fed622ff2c3b](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b) |
| `sunbeam-ridge` | 山间光柱 | [photo-1469474968028-56623f02e42e](https://images.unsplash.com/photo-1469474968028-56623f02e42e) |
| `forest-path` | 林间幽径 | [photo-1441974231531-c6227db76b6e](https://images.unsplash.com/photo-1441974231531-c6227db76b6e) |
| `pine-mist` | 雾雪松林 | [photo-1418065460487-3e41a6c84dc5](https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5) |
| `golden-field` | 暮野流金 | [photo-1472214103451-9374bd1c798e](https://images.unsplash.com/photo-1472214103451-9374bd1c798e) |
| `coast-dusk` | 海岸暮色 | [photo-1507525428034-b723cf961d3e](https://images.unsplash.com/photo-1507525428034-b723cf961d3e) |
| `ember-dusk` | 烬色黄昏 | [photo-1508739773434-c26b3d09e071](https://images.unsplash.com/photo-1508739773434-c26b3d09e071) |
| `snow-night` | 雪夜星野 | [Benjamin Voros](https://unsplash.com/@benjaminvoros) · [photo-1519681393784-d120267933ba](https://images.unsplash.com/photo-1519681393784-d120267933ba) |
| `galaxy-vault` | 星河天穹 | [photo-1462331940025-496dfbfc7564](https://images.unsplash.com/photo-1462331940025-496dfbfc7564) |
| `city-light` | 城市夜航 | [photo-1477959858617-67f85cf4f1df](https://images.unsplash.com/photo-1477959858617-67f85cf4f1df) |

### 其他资产

- **logo.svg / start.svg**：本项目原创，随 MIT 许可分发
- **快捷服务 favicon**：运行时从 DuckDuckGo 图标服务加载，仓库不含图标文件
- **Geist 字体**：Vercel，SIL Open Font License，经 `next/font` 自托管

> 若您是上述图片的权利人并希望调整署名方式或移除图片，请提 Issue，我们会在第一时间处理。

## 项目结构

```
src/
├── app/                    # 页面入口（单页起始页）
├── components/startpage/   # 时钟/搜索/Dock/面板/禅模式等组件
└── lib/startpage/          # 图库、搜索引擎、农历、天气、亮度采样等纯逻辑
public/gallery/             # 本地化壁纸（全图 + 缩略图）
docs/                       # README 预览图
```

## 贡献者

| 贡献者 | 角色 |
|---|---|
| **Super Z**（AI 智能体 · [Z.ai](https://z.ai) GLM） | 界面与动效设计、工程实现、发布工程、文档 |
| **[LXgssy](https://github.com/LXgssy)** | 产品发起人、需求定义、验收 |

后续版本迭代由 Super Z 以作者身份提交署名。

## 许可证

- **源代码**：[MIT License](./LICENSE)
- **摄影图片**：各自适用 [Unsplash License](https://unsplash.com/license)，与代码许可相互独立
- **字体与图标**：SIL OFL / ISC（详见上文）

---

*初始 · 每一次新标签页，都是一次重新开始。*
