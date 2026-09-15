/* 官方预设（v8.4.11，⌘K → 官方预设）——随应用内置的官方预设包清单。
 *
 * 数据源 = 仓库 examples/（页面焕新 = 焕新示例预设.json；音乐面板 =
 * 初始SMTC音乐预设.cshz 的 manifest + assets），由
 * scripts/build-official-presets.py 单向同步生成本目录的
 * official-presets.json —— 禁止手改 JSON；改预设先改 examples/
 * （或 preset-src/ 重建 .cshz），再跑脚本重新生成。
 *
 * 安装管线（page.tsx installOfficialPreset）：
 *   parsePreset(manifest)（结构校验，长度按内联前计，与 parsePack 同序）
 *   → pack.ts inlineOfficialAssets（asset: → data:URL，与 .cshz 导入同形）
 *   → installPreset({ replaceByName: true })（同名已装即替换更新，
 *     v8.4.11 前安装的音乐面板借此一键获得空态修复）。
 */
import data from "./official-presets.json";

export interface OfficialPresetEntry {
  /** 稳定 id（palette 条目 key / onInstallOfficial 参数） */
  id: string;
  /** 预设名（= manifest.name，已装判定键） */
  name: string;
  /** 面板条目展示名 */
  label: string;
  /** 右侧弱化标语（未安装时展示） */
  tagline: string;
  /** chushi:1 结构 manifest（asset: 引用保留原样，安装时内联） */
  manifest: unknown;
  /** base64 资产表（键 = asset: 文件名） */
  assets: Record<string, { b64: string; mime: string }>;
}

/* 断言边界：JSON 推断类型把两条预设的 assets 联合成 `"cover.svg"?: undefined`
   （union 归一化副作用），记录类型无法表达——生成器保证了运行时形态，这里
   一次性收口为接口类型。 */
export const OFFICIAL_PRESETS: OfficialPresetEntry[] = (data as {
  presets: OfficialPresetEntry[];
}).presets;
