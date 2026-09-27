"use client";

/* 「初始」— 预设域：声明式预设系统 + 沙箱脚本 + 焕新作用面
 *
 * 五个声明式作用面（装了即生效，删除即整体还原，安装顺序后者胜）：
 *  · layout   布局覆写（隐藏区块/垂直对齐/时钟缩放/磁贴列数）
 *  · icons    图标替换（dock 按钮字形）
 *  · tokens   主题令牌（白名单 CSS 变量 setProperty，含 --mo-speed 动效倍率）
 *  · motion   动效语言（profile 档位）
 *  · clock    时钟覆写（showDate/greeting 声明式；hour12/showSeconds 安装时一次性合入用户设置）
 * 另有 animations（自定义 CSS）/ commands（指令）/ dock（栏按钮）/ widgets（小部件）/
 * scripts（沙箱 JS）/ pages（自定义页）/ settings（白名单设置字段）。
 *
 * 沙箱脚本（高阶模式）：脚本经 sandboxBridge 单例同步激活集；冻结标记持久化；
 * 运行时注册命令与设置面 schema 随激活集增删。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStored, readLS, uid, writeLS } from "@/hooks/use-start";
import {
  PRESET_TOKEN_KEYS,
  parsePreset,
  type InstalledPreset,
  type PresetAction,
  type PresetClock,
  type PresetIconTarget,
  type PresetLayout,
  type PresetMotion,
  type PresetPayload,
} from "@/lib/startpage/preset";
import { inlineOfficialAssets } from "@/lib/startpage/pack";
import { OFFICIAL_PRESETS } from "@/lib/startpage/official-presets";
import {
  sandboxBridge,
  type SandboxCommandInfo,
  type SandboxScript,
} from "@/lib/startpage/sandbox";
import {
  prunePresetSettings,
  readPresetSettingValues,
  writePresetSettingValues,
  type PresetSettingValues,
  type PresetSettingsSchema,
} from "@/lib/startpage/preset-settings";
import { getEngine } from "@/lib/startpage/engines";
import { openExternalUrl } from "@/lib/startpage/nav";
import type { ActiveWidget } from "@/components/startpage/PresetWidgets";
import type { ActivePage } from "@/components/startpage/SandboxPage";
import type { PanelId, Settings, StartLink } from "@/lib/startpage/types";
import type { ToastFn } from "./toast-types";
import { KEYS } from "./keys";

export interface PresetSettingSection {
  scriptKey: string;
  presetName: string;
  schema: PresetSettingsSchema;
}

/** 预设 action 中 script / page 类型的 id 展开为本预设内复合键（运行时再由桥/overlay 路由） */
function resolvePresetAction(a: PresetAction, presetId: string): PresetAction {
  if (a.type === "script" || a.type === "page") {
    return { type: a.type, id: `${presetId}:${a.id}` } as PresetAction;
  }
  return a;
}

export function useStartPresets({
  mounted,
  accent,
  patchSettings,
  setLinks,
  setDockWidget,
  gotoPanel,
  setActivePage,
  toast,
}: {
  mounted: boolean;
  /** 用户强调色：令牌注入的回落值（无预设令牌时还原用户设置） */
  accent: string;
  patchSettings: (patch: Partial<Settings>) => void;
  setLinks: React.Dispatch<React.SetStateAction<StartLink[]>>;
  setDockWidget: React.Dispatch<React.SetStateAction<string | null>>;
  gotoPanel: (p: PanelId) => void;
  setActivePage: (p: ActivePage | null) => void;
  toast: ToastFn;
}) {
  const [presets, setPresets] = useStored<InstalledPreset[]>(KEYS.presets, []);
  /* 沙箱脚本冻结标记：持久化 + 运行时注册命令 + 设置面 schema */
  const [frozenScripts, setFrozenScripts] = useState<Record<string, boolean>>(() =>
    readLS<Record<string, boolean>>(KEYS.sandboxFrozen, {})
  );
  const [scriptCmds, setScriptCmds] = useState<SandboxCommandInfo[]>([]);
  const [presetSchemas, setPresetSchemas] = useState<
    Record<string, { presetName: string; schema: PresetSettingsSchema }>
  >({});
  /* 部件自报高度（v2.0.0 统一舞台）：chushi.resize → 这里 → 舞台高度盒弹簧 */
  const [widgetHeights, setWidgetHeights] = useState<Record<string, number>>({});

  const markFrozen = useCallback((key: string) => {
    setFrozenScripts((prev) => {
      const next = { ...prev, [key]: true };
      writeLS(KEYS.sandboxFrozen, next);
      return next;
    });
  }, []);

  /* ---------- 预设安装（含官方预设的替换更新语义 v8.4.11） ---------- */
  const installPreset = useCallback(
    (payload: PresetPayload, opts?: { replaceByName?: boolean }) => {
      /* 同名替换（官方预设重装更新）：先移除再装，不产生重名副本；普通导入 append */
      const replacing =
        opts?.replaceByName === true && presets.some((p) => p.name === payload.name);
      setPresets((prev) => {
        const base = opts?.replaceByName ? prev.filter((p) => p.name !== payload.name) : prev;
        return [
          ...base,
          {
            id: uid(),
            name: payload.name,
            author: payload.author,
            installedAt: Date.now(),
            raw: payload,
          },
        ];
      });
      /* 磁贴一次性合入（url 去重，重复导入不产生副本） */
      if (payload.links.length > 0) {
        setLinks((prev) => {
          const seen = new Set(prev.map((l) => l.url.replace(/\/+$/, "")));
          const add = payload.links
            .filter((l) => !seen.has(l.url.replace(/\/+$/, "")))
            .map((l) => ({ id: uid(), name: l.name, url: l.url }));
          return add.length > 0 ? [...prev, ...add] : prev;
        });
      }
      /* 设置白名单字段一次性合并（用户可再改） */
      if (payload.settings) patchSettings(payload.settings);
      /* 时钟格式中的小时制/秒数：一次性合入用户设置（v1.7.1 语义修正）——
         声明式覆写会永久遮蔽设置面板；改为导入时写一次，之后与手调设置同源。
         日期行/问候语无面板控件，仍走声明式覆写（presetExtras.clock） */
      if (
        payload.clock &&
        (payload.clock.hour12 !== undefined || payload.clock.showSeconds !== undefined)
      ) {
        patchSettings({
          ...(payload.clock.hour12 !== undefined ? { hour12: payload.clock.hour12 } : null),
          ...(payload.clock.showSeconds !== undefined
            ? { showSeconds: payload.clock.showSeconds }
            : null),
        } as Partial<Settings>);
      }
      const extras = [
        payload.scripts?.length ? `${payload.scripts.length} 个脚本` : null,
        payload.animations?.length ? `${payload.animations.length} 段样式` : null,
        payload.pages?.length ? `${payload.pages.length} 个页面` : null,
        payload.widgets?.length ? `${payload.widgets.length} 个小部件` : null,
        payload.layout ? "布局覆写" : null,
      ].filter(Boolean);
      toast({
        title: replacing
          ? `官方预设「${payload.name}」已更新`
          : `预设「${payload.name}」已安装`,
        description: [
          `新增 ${payload.commands.length} 条命令、${payload.dock.length} 个栏按钮、${payload.links.length} 个磁贴`,
          extras.length > 0 ? extras.join(" · ") : null,
        ]
          .filter(Boolean)
          .join("；"),
      });
    },
    [setPresets, setLinks, patchSettings, toast, presets]
  );

  /* ---------- 官方预设一键安装（⌘K → 官方预设；内嵌包与仓库 examples/ 同源） ---------- */
  const installOfficialPreset = useCallback(
    (id: string) => {
      const entry = OFFICIAL_PRESETS.find((x) => x.id === id);
      if (!entry) return;
      const parsed = parsePreset(entry.manifest);
      if (!parsed.ok) {
        toast({ title: "官方预设数据异常", description: parsed.errors.join("；") });
        return;
      }
      installPreset(inlineOfficialAssets(parsed.preset, entry.assets), {
        replaceByName: true,
      });
    },
    [installPreset, toast]
  );

  /* ---------- 预设移除：连带清理冻结标记与设置面持久化值 ---------- */
  const removePreset = useCallback(
    (id: string) => {
      setPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        if (target) toast({ title: `预设「${target.name}」已移除` });
        return prev.filter((p) => p.id !== id);
      });
      setFrozenScripts((prev) => {
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(prev)) if (!k.startsWith(`${id}:`)) next[k] = prev[k];
        if (Object.keys(next).length !== Object.keys(prev).length) {
          writeLS(KEYS.sandboxFrozen, next);
          return next;
        }
        return prev;
      });
      /* 与分区消失对称：回收该预设全部脚本的设置面持久化值 */
      prunePresetSettings(`${id}:`);
    },
    [setPresets, toast]
  );

  /* ---------- 沙箱脚本派生 ---------- */
  const sandboxScripts = useMemo<SandboxScript[]>(
    () =>
      presets.flatMap((p) =>
        (p.raw.scripts ?? []).map((sc) => ({
          key: `${p.id}:${sc.id}`,
          presetName: p.name,
          name: sc.name ?? sc.id,
          code: sc.code,
        }))
      ),
    [presets]
  );
  const activeSandboxScripts = useMemo(
    () => sandboxScripts.filter((sc) => !frozenScripts[sc.key]),
    [sandboxScripts, frozenScripts]
  );
  /** 激活脚本键集：声明式 script 命令/按钮只在此集合内的脚本上展示（冻结即隐藏） */
  const activeScriptKeys = useMemo(
    () => new Set(activeSandboxScripts.map((sc) => sc.key)),
    [activeSandboxScripts]
  );

  /* ---------- 预设命令 / dock 按钮 / 小部件派生 ---------- */
  const presetCommands = useMemo(
    () =>
      presets.flatMap((p) =>
        p.raw.commands.flatMap((c, i) => {
          if (c.action.type === "script" && !activeScriptKeys.has(`${p.id}:${c.action.id}`)) {
            return [];
          }
          return [
            {
              title: c.title,
              action: resolvePresetAction(c.action, p.id),
              key: `${p.id}:${i}`,
              presetName: p.name,
            },
          ];
        })
      ),
    [presets, activeScriptKeys]
  );
  const presetDock = useMemo(
    () =>
      presets.flatMap((p) =>
        p.raw.dock.flatMap((d, i) => {
          if (d.action.type === "script" && !activeScriptKeys.has(`${p.id}:${d.action.id}`)) {
            return [];
          }
          return [
            {
              title: d.title,
              icon: d.icon,
              action: resolvePresetAction(d.action, p.id),
              key: `${p.id}:d${i}`,
            },
          ];
        })
      ),
    [presets, activeScriptKeys]
  );
  const presetWidgets = useMemo<ActiveWidget[]>(
    () =>
      presets.flatMap((p) =>
        (p.raw.widgets ?? []).map((w) => ({
          key: `${p.id}:${w.id}`,
          presetName: p.name,
          name: w.name ?? w.id,
          surface: w.surface ?? ("corner" as const),
          icon: w.icon,
          corner: w.corner ?? ("top-left" as const),
          width: w.width ?? 216,
          height: w.height ?? 88,
          html: w.html,
        }))
      ),
    [presets]
  );
  /** dock 表面小部件（tab 栏按钮 + 弹出面板的清单） */
  const presetDockWidgets = useMemo(
    () => presetWidgets.filter((w) => w.surface === "dock"),
    [presetWidgets]
  );

  const onWidgetResize = useCallback((key: string, height: number) => {
    setWidgetHeights((prev) => (prev[key] === height ? prev : { ...prev, [key]: height }));
  }, []);

  /* 兜底：dock 弹出面板指向的小部件被删（预设移除）时自动关闭 */
  useEffect(() => {
    setDockWidget((k) =>
      k != null && !presetDockWidgets.some((w) => w.key === k) ? null : k
    );
  }, [presetDockWidgets, setDockWidget]);

  /* ---------- 沙箱桥事件与同步生命周期 ---------- */
  useEffect(() => {
    sandboxBridge.onEvent = (ev) => {
      switch (ev.kind) {
        case "commands":
          setScriptCmds((prev) => [
            ...prev.filter((c) => c.scriptKey !== ev.scriptKey),
            ...ev.commands,
          ]);
          break;
        case "notify":
          toast({ title: ev.title, description: ev.description || undefined });
          break;
        case "open":
          if (/^https:\/\//i.test(ev.url)) openExternalUrl(ev.url);
          break;
        case "copy":
          navigator.clipboard
            .writeText(ev.text)
            .then(() =>
              toast({
                title: "已复制",
                description: ev.text.slice(0, 30) + (ev.text.length > 30 ? "…" : ""),
              })
            )
            .catch(() => toast({ title: "复制失败", description: "浏览器未授权剪贴板" }));
          break;
        case "error":
          toast({ title: "沙箱脚本", description: ev.message });
          break;
        case "frozen":
          markFrozen(ev.key);
          toast({
            title: `脚本「${ev.name}」已自动停用`,
            description: "启动超时（疑似死循环）；删除并重新导入该预设可恢复",
            duration: 8000,
          });
          break;
        case "settingsSchema":
          setPresetSchemas((prev) => ({
            ...prev,
            [ev.scriptKey]: { presetName: ev.presetName, schema: ev.schema },
          }));
          break;
      }
    };
    return () => {
      sandboxBridge.onEvent = null;
    };
  }, [toast, markFrozen]);

  useEffect(() => {
    sandboxBridge.sync(activeSandboxScripts);
  }, [activeSandboxScripts]);

  /* 预设变更后同步清理失主脚本（删除/冻结）的运行时命令条目 */
  useEffect(() => {
    setScriptCmds((prev) => {
      const next = prev.filter((c) => activeScriptKeys.has(c.scriptKey));
      return next.length === prev.length ? prev : next;
    });
  }, [activeScriptKeys]);

  /* 预设设置面 schema 同律：脚本不再激活即从设置面板移除分区 */
  useEffect(() => {
    setPresetSchemas((prev) => {
      const next: typeof prev = {};
      for (const k of Object.keys(prev)) if (activeScriptKeys.has(k)) next[k] = prev[k];
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [activeScriptKeys]);

  /* 预设设置值读取器：注入桥，settingsGet 回执时按 schema 校验 LS 持久化值 */
  useEffect(() => {
    sandboxBridge.settingsProvider = (key, schema) => readPresetSettingValues(key, schema);
    return () => {
      sandboxBridge.settingsProvider = null;
    };
  }, []);

  /* 设置面板变更：持久化整组值 + 下发沙箱（onChange 热调引擎参数） */
  const changePresetSetting = useCallback(
    (scriptKey: string, values: PresetSettingValues) => {
      writePresetSettingValues(scriptKey, values);
      sandboxBridge.pushSettingsValues(scriptKey, values);
    },
    []
  );

  /* 预设设置分区（渲染进设置面板）：脚本激活即出现，删除/冻结即消失 */
  const presetSettingSections = useMemo(
    () =>
      Object.entries(presetSchemas).map(([scriptKey, v]) => ({
        scriptKey,
        presetName: v.presetName,
        schema: v.schema,
      })),
    [presetSchemas]
  );

  /* 沙箱脚本运行时注册的命令 → ⌘K 派生项（与声明式命令同组展示） */
  const sandboxDerivedCommands = useMemo(
    () =>
      scriptCmds.map((c) => ({
        title: c.title,
        action: { type: "script", id: `${c.scriptKey}:${c.id}` } as PresetAction,
        key: `sc:${c.scriptKey}:${c.id}`,
        presetName: c.presetName,
      })),
    [scriptCmds]
  );
  const presetCommandsAll = useMemo(
    () => [...presetCommands, ...sandboxDerivedCommands],
    [presetCommands, sandboxDerivedCommands]
  );

  /* ---------- 预设自定义 CSS（animations 字段，导入时已净化） ----------
     单一 <style> 承载全部已装预设的样式，安装顺序即优先级；删除预设即整体重算 */
  const presetCss = useMemo(
    () =>
      presets
        .flatMap((p) => (p.raw.animations ?? []).map((a) => `/* ${p.name} · ${a.name ?? a.id} */\n${a.css}`))
        .join("\n"),
    [presets]
  );
  useEffect(() => {
    if (!mounted) return;
    let el = document.getElementById("chushi-preset-css") as HTMLStyleElement | null;
    if (!presetCss) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "chushi-preset-css";
      document.head.appendChild(el);
    }
    el.textContent = presetCss;
  }, [mounted, presetCss]);

  /* ---------- 布局覆写派生：安装顺序后者胜，删除预设即还原 ---------- */
  const layout = useMemo<PresetLayout>(() => {
    const merged: PresetLayout = {};
    for (const p of presets) {
      const l = p.raw.layout;
      if (l) Object.assign(merged, l);
    }
    return merged;
  }, [presets]);

  /* ---------- 焕新四作用面派生：图标 / 主题令牌 / 动效语言 / 时钟格式 ---------- */
  const presetExtras = useMemo(() => {
    const icons: Partial<Record<PresetIconTarget, string>> = {};
    const tokens: Record<string, string> = {};
    let motion: PresetMotion = {};
    let clock: PresetClock = {};
    for (const p of presets) {
      for (const ic of p.raw.icons ?? []) icons[ic.target] = ic.icon;
      if (p.raw.tokens) Object.assign(tokens, p.raw.tokens);
      if (p.raw.motion) motion = { ...motion, ...p.raw.motion };
      if (p.raw.clock) clock = { ...clock, ...p.raw.clock };
    }
    return { icons, tokens, motion, clock };
  }, [presets]);

  /* 主题令牌注入：白名单键 setProperty 到根元素；预设占用期间反复覆盖
     （含强调色设置变更时），删除预设/值消失即 removeProperty 还原。
     同时承载动效语言的 --mo-speed（CSS 入退场动画时长倍率）。
     ⚠ 本 effect 必须在 settings 域的强调色 effect 之后注册（Provider 调用序
     保证）：同键（--ui-accent）时预设令牌胜（焕新语义）。
     令牌净空兜底：presets 快速变化时旧值残留由本 effect 全量重算排除。
     v8.6.21 修复强调色失效：--ui-accent 的「还原值」是 JS 注入的用户设置，
     removeProperty 会把强调色 effect 刚写好的变量删掉——无预设值时回落
     用户强调色（装了带令牌的预设仍预设胜，删除预设回落用户值）。 */
  const presetTokenSig =
    Object.values(presetExtras.tokens).join("\n") +
    Object.keys(presetExtras.tokens).join(",");
  const motionSpeed = presetExtras.motion.speed ?? 1;
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement.style;
    for (const key of Object.keys(PRESET_TOKEN_KEYS)) {
      const v = presetExtras.tokens[key];
      if (v) root.setProperty(key, v);
      else if (key === "--ui-accent") root.setProperty(key, accent);
      else root.removeProperty(key);
    }
    root.setProperty("--mo-speed", String(motionSpeed));
  }, [mounted, presetTokenSig, motionSpeed, presetExtras.tokens, accent]);

  /* ---------- 搜索执行（引擎检索；壳 iframe 内提升到顶层整页打开） ---------- */
  const runSearch = useCallback((engineId: string, q: string) => {
    const engine = getEngine(engineId);
    openExternalUrl(engine.search(q));
  }, []);

  /* ---------- 预设 action 执行（白名单分发） ---------- */
  const runPresetAction = useCallback(
    (a: PresetAction) => {
      switch (a.type) {
        case "open":
          openExternalUrl(a.url);
          break;
        case "search":
          runSearch(a.engine, a.q);
          break;
        case "panel":
          gotoPanel(a.id as PanelId);
          break;
        case "theme":
          patchSettings({ themeMode: a.mode });
          break;
        case "copy":
          navigator.clipboard
            .writeText(a.text)
            .then(() =>
              toast({
                title: "已复制",
                description: a.text.slice(0, 30) + (a.text.length > 30 ? "…" : ""),
              })
            )
            .catch(() => toast({ title: "复制失败", description: "浏览器未授权剪贴板" }));
          break;
        case "script": {
          /* id = `${presetId}:${scriptId}`（入口）或 `${presetId}:${scriptId}:${cmdId}`（命令），
             由沙箱内统一路由（命令表优先，其次脚本入口 chushi.run） */
          const ok = sandboxBridge.invoke(a.id);
          if (!ok) {
            toast({
              title: "沙箱未运行",
              description: "脚本已停用或初始化失败；删除并重新导入预设可恢复",
            });
          }
          break;
        }
        case "page": {
          /* id = `${presetId}:${pageId}`，从已装预设找回页面 HTML */
          const sep = a.id.indexOf(":");
          const presetId = sep > 0 ? a.id.slice(0, sep) : "";
          const pageId = sep > 0 ? a.id.slice(sep + 1) : "";
          const pg = presets
            .find((p) => p.id === presetId)
            ?.raw.pages?.find((x) => x.id === pageId);
          if (!pg) {
            toast({ title: "页面不存在", description: "预设可能已更新或删除，重新导入可恢复" });
            break;
          }
          setActivePage({ key: a.id, name: pg.name ?? pageId, html: pg.html });
          break;
        }
      }
    },
    [runSearch, gotoPanel, patchSettings, toast, presets, setActivePage]
  );

  return {
    presets,
    installPreset,
    installOfficialPreset,
    removePreset,
    presetCommandsAll,
    presetDock,
    presetDockWidgets,
    presetWidgets,
    presetSettingSections,
    changePresetSetting,
    presetIcons: presetExtras.icons,
    presetClock: presetExtras.clock,
    motionProfile: presetExtras.motion.profile ?? ("standard" as const),
    layout,
    widgetHeights,
    onWidgetResize,
    runSearch,
    runPresetAction,
  };
}
