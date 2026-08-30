# Start-chushi-workspace · 工作空间完整档案

「初始」浏览器起始页（见公开仓库 [Start-chushi](https://github.com/LXgssy/Start-chushi)）
的研发工作空间存档，私有仓库，随开发持续同步。

## 档案结构

| 路径 | 内容 |
|------|------|
| `worklog.md` | 多代理工作日志：每个 Task 的执行记录、踩坑与复盘（项目主史志） |
| `scripts/` | 全部工作脚本白名单：GitHub 发布/同步/Pages 部署、动画冒烟、壁纸溯源管线工具、DOM 采样探针、文叔叔上传器等（体积大的管线中间产物不入档） |
| `src/` `public/` `prisma/` | 「初始」网页完整源码（Next.js 15 App Router + Tailwind 4 + framer-motion） |
| `docs/` | README 预览图 |
| `RESTORE-GUIDE.md` | 完整备份与恢复指南 |
| 其余 | package.json / next.config.ts / tailwind 等全部配置与 README/LICENSE |

## 有意不入档的内容

- `download/`（过程截图）、`upload/`（用户素材）、`db/`（运行时数据）——隐私与数据，非工作记录
- `.pkgtmp/`（临时凭据与缓存）、`.env`——凭据安全
- 主仓库 `.git` 历史——其早期历史跟踪过上述隐私文件，档案一律用净化快照 + 全新历史
- `skills/` `tests/` `mini-services/` `.zscripts/` `examples/`——运行环境脚手架，非本项目产物
- `scripts/` 子目录中间产物（uw/ hd/ 视频帧等，约 70M）——可由脚本重新生成

## 同步方式

主开发机执行 `bash scripts/github-sync.sh "<msg>"`（公开仓库）后，
`bash scripts/workspace-archive.sh` 同步本档案仓。
