"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { BackgroundMode } from "@/lib/startpage/types";
import { resolveWallpaper, wallpaperKindOf, type WallpaperKind } from "@/lib/startpage/gallery";
import { idbGet } from "@/lib/startpage/idb";

type Phase = "dawn" | "day" | "dusk" | "night";

function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 9) return "dawn";
  if (hour >= 9 && hour < 16) return "day";
  if (hour >= 16 && hour < 21) return "dusk";
  return "night";
}

/** 各时段光斑强度：随昼夜柔和过渡 */
const BLOB_OPACITY: Record<Phase, number> = {
  night: 0.55,
  dawn: 0.75,
  day: 0.65,
  dusk: 0.85,
};

/** 黑幕节奏：渐入遮蔽 → 黑透换画面 → 预热 → 渐出揭示（明暗主题一致） */
const VEIL_IN_MS = 620;
const VEIL_IN_WAIT = 660; // 渐入时长 + 合成缓冲
const REVEAL_DELAY = 60; // 新壁纸挂载后的帧缓冲
const PRELOAD_BUDGET = 3000; // 预热竞速上限，任何情况都揭开黑幕

/** 预加载 + 解码壁纸（decode 确保揭幕瞬间可完整绘制；失败也继续，揭示后露底色而非卡黑屏） */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => resolve(), () => resolve());
      } else {
        resolve();
      }
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** 视频预热：等 canplay（可首播）或 2s 预算内放行——视频体积大，
 *  全量缓冲不值得等，黑幕揭开后边播边缓冲即可 */
function preloadVideo(url: string): Promise<void> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeAttribute("src");
      v.load();
      resolve();
    };
    v.muted = true;
    v.preload = "auto";
    v.oncanplay = finish;
    v.onerror = finish;
    window.setTimeout(finish, 2000);
    v.src = url;
  });
}

function preloadMedia(url: string, kind: WallpaperKind): Promise<void> {
  return kind === "video" ? preloadVideo(url) : preloadImage(url);
}

function AuroraBackground({
  mode,
  photoId,
  wallpaperUrl = "",
  wallpaperRev = 0,
}: {
  mode: BackgroundMode;
  photoId: string;
  /** 自定义壁纸的 URL 导入源（v1.7.2）：非空时优先于 IndexedDB 本地文件 */
  wallpaperUrl?: string;
  /** 自定义壁纸导入版本号（v1.7.3）：每次导入自增——custom 模式下重复导入
   *  时 photoId/wallpaperUrl 均不变，无此依赖则 effect 不重跑、壁纸不刷新 */
  wallpaperRev?: number;
}) {
  const [phase, setPhase] = useState<Phase>("night");
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [customKind, setCustomKind] = useState<WallpaperKind>("image");
  const blobUrlRef = useRef<string | null>(null);
  const customKindRef = useRef<WallpaperKind>("image");
  const customUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setPhase(phaseOf(new Date().getHours()));
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  /* 官方图库 / 每日精选：同步解析（thumb 另供禅模式提示词背景亮度采样） */
  const galleryMeta = useMemo(() => {
    if (photoId === "custom") return null;
    return resolveWallpaper(photoId);
  }, [photoId]);
  const galleryUrl = galleryMeta?.url ?? null;

  /* 自定义壁纸（v1.7.2）：URL 导入优先（远程图片/视频直链，零下载持久化），
     否则回退 IndexedDB 本地上传（Blob objectURL）。两种来源互斥由设置侧维护。
     photoId 离开 custom 时同步清引用，避免下次回到 custom 时闪旧画面。
     wallpaperRev（v1.7.3）：导入版本号入依赖——同一 custom 源下重复导入
     （本地换新文件 / URL 重导）也强制重读，根除「导入后不刷新」 */
  useEffect(() => {
    if (photoId !== "custom") {
      customUrlRef.current = null;
      return;
    }
    let alive = true;
    if (wallpaperUrl) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      const k = wallpaperKindOf(wallpaperUrl);
      customKindRef.current = k;
      customUrlRef.current = wallpaperUrl;
      setCustomKind(k);
      setCustomUrl(wallpaperUrl);
      return () => {
        alive = false;
      };
    }
    idbGet<Blob>("custom-wallpaper").then((blob) => {
      if (!alive) return;
      if (!blob) {
        setCustomUrl(null);
        return;
      }
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const k = wallpaperKindOf(url, blob.type);
      customKindRef.current = k;
      customUrlRef.current = url;
      setCustomKind(k);
      setCustomUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [photoId, wallpaperUrl, wallpaperRev]);

  /* 卸载时回收 objectURL */
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const photoUrl = photoId === "custom" ? customUrl : galleryUrl;

  /* ---------- 壁纸黑幕过渡状态机 ----------
   * 画面身份 shownKey："bg:glow" | "bg:pure" | "photo:<url>" | "photo:none"。
   * 目标身份 targetKey 变化时分流（详见渲染期直切与 effect 序列两处注释），
   * 连点中断合并：旧序列作废，新序列视黑幕现状续接（未全黑则补等剩余渐入）。 */
  const targetKey =
    mode === "photo" ? `photo:${photoUrl ?? "none"}` : `bg:${mode}`;
  const [shownKey, setShownKey] = useState(targetKey);
  const [veiled, setVeiled] = useState(false);
  const veiledRef = useRef(false);
  const veiledAtRef = useRef(0); // 黑幕开始渐入的时刻（续接时补等剩余渐入）
  const shownRef = useRef(targetKey);
  const timersRef = useRef<number[]>([]); // 跨序列的散置 timer（如回原点揭幕）

  /* 渲染期直切分流（读/写均为 state；黑幕序列留给 effect 异步编排）：
   *  · glow ↔ pure → 直接换身份，光斑层 2500ms 渐变柔化；
   *  · 自定义壁纸从无到有（IndexedDB 异步就绪）→ 直切，靠壁纸自身渐显（底下本为底色）；
   *  · 其余涉及掠影的变化 → 交给下方 effect 走黑幕序列。 */
  const [prevTarget, setPrevTarget] = useState(targetKey);
  if (targetKey !== prevTarget) {
    setPrevTarget(targetKey);
    const toPhoto = targetKey.startsWith("photo:");
    const involvesPhoto = toPhoto || shownKey.startsWith("photo:");
    const customReady =
      involvesPhoto &&
      shownKey === "photo:none" &&
      toPhoto &&
      !targetKey.endsWith(":none");
    if (!involvesPhoto || customReady) {
      setShownKey(targetKey);
    }
  }

  /* 显示身份镜像：供序列 effect 判断「是否已被直切消化」 */
  useEffect(() => {
    shownRef.current = shownKey;
  }, [shownKey]);

  useEffect(() => {
    if (targetKey === shownRef.current) {
      /* 连点回到原点：前一序列可能已把黑幕渐入到半途——目标既然不变，
         不换装、黑幕直接回落揭开（否则黑幕无人收尾，卡死全黑） */
      if (veiledRef.current) {
        veiledRef.current = false;
        const t = window.setTimeout(() => setVeiled(false), 0);
        timersRef.current.push(t);
      }
      return;
    }
    const toPhoto = targetKey.startsWith("photo:");
    let alive = true;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        timers.push(window.setTimeout(r, ms));
      });

    (async () => {
      /* 1) 黑幕渐入（已在黑幕中则续接：补等剩余渐入时间，保证全黑才换装） */
      if (!veiledRef.current) {
        veiledRef.current = true;
        veiledAtRef.current = performance.now();
        setVeiled(true);
        await wait(VEIL_IN_WAIT);
      } else {
        const remain = VEIL_IN_WAIT - (performance.now() - veiledAtRef.current);
        if (remain > 0) await wait(remain);
      }
      if (!alive) return;
      /* 2) 黑透瞬间：切换画面身份（挂载/卸载都发生在全黑之下，无瞬跳） */
      shownRef.current = targetKey;
      setShownKey(targetKey);
      /* 3) 新壁纸预热解码后揭示（带预算竞速，网络悬挂不卡黑屏；视频按 canplay 放行） */
      if (toPhoto && !targetKey.endsWith(":none")) {
        const url = targetKey.slice("photo:".length);
        const kind =
          url === customUrlRef.current
            ? customKindRef.current
            : wallpaperKindOf(url);
        await Promise.race([preloadMedia(url, kind), wait(PRELOAD_BUDGET)]);
        if (!alive) return;
        await wait(REVEAL_DELAY);
        if (!alive) return;
      }
      /* 4) 黑幕渐出，揭示新画面 */
      veiledRef.current = false;
      setVeiled(false);
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [targetKey]);

  /* 掠影前景反白跟随「实际显示的画面」而非设置值：
   * class 在黑透时刻切换，反白前景不会悬在旧画面上 */
  useEffect(() => {
    document.documentElement.classList.toggle(
      "photo-mode",
      shownKey.startsWith("photo:")
    );
  }, [shownKey]);

  const blobStrength = BLOB_OPACITY[phase];
  const showBlobs = shownKey === "bg:glow";
  const shownUrl =
    shownKey.startsWith("photo:") && !shownKey.endsWith(":none")
      ? shownKey.slice("photo:".length)
      : null;
  const photoReady = shownUrl != null && loadedUrl === shownUrl;
  /* 显示中的媒体形态：blob/URL 源用记录值；图库恒为静态图（kenburns 专属） */
  const shownKind: WallpaperKind = shownUrl
    ? shownUrl === customUrlRef.current
      ? customKindRef.current
      : wallpaperKindOf(shownUrl)
    : "image";

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      {/* 底色 */}
      <div className="absolute inset-0 bg-[#f6f5f2] dark:bg-[#0a0a0e]" />

      {/* 极光光斑层：启停由「显示身份」驱动；黑幕掩护下瞬时就位（避免揭幕时露底色发白），
          黑幕外（辉光↔纯净直切）保留 2000ms 光斑柔化 */}
      <div
        className={`absolute inset-0 transition-opacity ${
          veiled ? "duration-0" : "duration-[2000ms]"
        }`}
        style={{ opacity: showBlobs ? blobStrength : 0 }}
      >
        <div className="aurora-blob aurora-a bg-emerald-400/35 dark:bg-emerald-500/25" />
        <div className="aurora-blob aurora-b bg-fuchsia-300/30 dark:bg-fuchsia-400/20" />
        <div className="aurora-blob aurora-c bg-amber-200/40 dark:bg-amber-300/15" />
        <div className="aurora-blob aurora-d bg-teal-200/30 dark:bg-teal-400/15" />
      </div>

      {/* 摄影壁纸层：挂载身份 = 显示身份，换图发生在黑幕全黑时刻。
          黑幕掩护下免渐入（揭幕即完整画面，根除米白底透出的白闪）；
          黑幕外直切（自定义壁纸就绪）保留 1800ms 自身柔化渐显。
          v1.7.2：视频走 <video muted loop>（kenburns 让位于视频自身动效），
          GIF 走 <img> 同样免 kenburns（自身已动，叠加易晕） */}
      {shownUrl && (
        <div key={shownUrl} className="absolute inset-0">
          {shownKind === "video" ? (
            <video
              src={shownUrl}
              muted
              loop
              autoPlay
              playsInline
              preload="auto"
              onCanPlay={() => setLoadedUrl(shownUrl)}
              onError={() => setLoadedUrl(null)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                veiled ? "duration-0" : "duration-[1800ms]"
              } ${photoReady ? "opacity-100" : "opacity-0"}`}
            />
          ) : (
            <img
              src={shownUrl}
              alt=""
              data-wallpaper
              data-thumb={galleryMeta?.thumb ?? undefined}
              referrerPolicy="no-referrer"
              onLoad={() => setLoadedUrl(shownUrl)}
              onError={() => setLoadedUrl(null)}
              className={`${shownKind === "gif" ? "" : "kenburns "}absolute inset-0 h-full w-full object-cover transition-opacity ${
                veiled ? "duration-0" : "duration-[1800ms]"
              } ${photoReady ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {/* 双层压暗：整体平底 + 上下渐变，保证浅色主题下白字亦可读 */}
          <div
            className={`photo-scrim absolute inset-0 transition-opacity ${
              veiled ? "duration-0" : "duration-[1800ms]"
            } ${photoReady ? "opacity-100" : "opacity-0"}`}
          />
        </div>
      )}

      {/* 壁纸切换黑幕：渐入遮蔽旧画面 → 黑透换装 → 渐出揭示新画面 */}
      <div
        aria-hidden
        data-veil
        className="absolute inset-0 bg-black"
        style={{
          opacity: veiled ? 1 : 0,
          transition: `opacity ${
            veiled ? VEIL_IN_MS : 900
          }ms cubic-bezier(${veiled ? "0.45, 0, 0.55, 1" : "0.22, 1, 0.36, 1"})`,
        }}
      />

      {/* 胶片颗粒（消除渐变色带） */}
      <div className="grain absolute inset-0 opacity-[0.035] dark:opacity-[0.05]" />

      {/* 暗角 */}
      <div className="vignette absolute inset-0" />
    </div>
  );
}

export default memo(AuroraBackground);
