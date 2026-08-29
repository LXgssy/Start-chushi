"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImagePlus } from "lucide-react";
import type { Settings } from "@/lib/startpage/types";
import { GALLERY, dailyPhoto } from "@/lib/startpage/gallery";
import { idbGet, idbSet } from "@/lib/startpage/idb";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 强调色预置 */
export const ACCENTS: Array<{ name: string; hex: string }> = [
  { name: "紫罗兰", hex: "#8b5cf6" },
  { name: "海盐蓝", hex: "#3b82f6" },
  { name: "青碧", hex: "#06b6d4" },
  { name: "松石绿", hex: "#10b981" },
  { name: "琥珀", hex: "#f59e0b" },
  { name: "玫瑰", hex: "#f43f5e" },
];

/** 自定义壁纸在 IndexedDB 中的键 */
export const CUSTOM_WALLPAPER_KEY = "custom-wallpaper";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  segKey,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  segKey: string;
}) {
  const activeIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="relative flex shrink-0 rounded-full border border-zinc-900/10 bg-zinc-900/[0.04] p-0.5 dark:border-white/10 dark:bg-white/[0.06]"
      >
        <motion.span
          layoutId={`seg-thumb-${segKey}`}
          className="absolute inset-y-0.5 rounded-full bg-white shadow-sm ring-1 ring-zinc-900/10 dark:bg-zinc-700/80 dark:ring-white/10"
          initial={false}
          animate={{ left: `calc(${(activeIdx * 100) / options.length}% + 2px)` }}
          style={{ width: `calc(${100 / options.length}% - 4px)` }}
          transition={{ duration: 0.35, ease: EASE }}
        />
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`relative z-10 min-w-[44px] rounded-full px-2 py-1 text-center text-[11px] font-light tracking-wide transition-colors duration-300 ${
              value === o.value
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-normal uppercase tracking-[0.18em] text-zinc-400 dark:text-zinc-500">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

/* ---------- 迷你开关（每日一图） ---------- */

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-zinc-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
        checked
          ? "border-transparent"
          : "border-zinc-900/15 bg-zinc-900/[0.05] dark:border-white/15 dark:bg-white/[0.08]"
      }`}
      style={checked ? { background: "var(--ui-accent, #8b5cf6)" } : undefined}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 34 }}
        className="absolute left-[3px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm dark:bg-zinc-100"
      />
    </button>
  );
}

/* ---------- 强调色 ---------- */

function AccentSwatch({
  hex,
  name,
  active,
  onSelect,
}: {
  hex: string;
  name: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`强调色 ${name}`}
      aria-pressed={active}
      title={name}
      className="relative flex h-8 w-8 items-center justify-center rounded-full outline-none transition-transform duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-zinc-400/60"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span
          aria-hidden
          className="block h-5 w-5 rounded-full shadow-inner"
          style={{ background: hex }}
        />
        {/* 选框：outline 扩展环（同色细线即选中语义，无需对钩）。
            outline+offset 从偏移处起画——间隙与环同属一次绘制，
            不依赖逐边 inset+border 定位，真机 DPR 取整导致的
            四向间隙不均（"环歪了"）在结构上不可能发生；
            （box-shadow 方案不可行：透明阴影层透出下层同色环，间隙会消失）
            选中时自 0.7 微缩放沉淀到位，未选中淡出 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full transition-all duration-300"
          style={{
            outline: `1.5px solid ${active ? hex : "transparent"}`,
            outlineOffset: 1.5,
            transform: active ? "scale(1)" : "scale(0.7)",
          }}
        />
      </span>
    </button>
  );
}

/* ---------- 掠影壁纸缩略图 ---------- */

function WallThumb({
  active,
  label,
  src,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  src?: string | null;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    /* 外层相对 wrapper 承载选框：选框画在图片之外（外扩 4px + 2px 环），
       与图片圆角裁剪零重叠——四角漏色在结构上不可能发生；
       accent 色选框在浅色/深色/任何壁纸上均清晰（白框浅色模式不显眼的根治） */
    <span className="relative block shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        title={label}
        className={`relative block h-14 w-[88px] overflow-hidden rounded-xl border transition-colors duration-300 ${
          active
            ? "border-transparent"
            : "border-zinc-900/10 hover:border-zinc-900/30 dark:border-white/10 dark:hover:border-white/30"
        }`}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-500">
            {children}
          </span>
        )}
        {/* 角标：accent 圆点 + 对钩（壁纸选择器的选中惯例） */}
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-white shadow"
            style={{ background: "var(--ui-accent, #8b5cf6)" }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path
                d="M2 6.5 4.8 9 10 3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </button>
      {/* 选中态：外扩 accent 环。半径必须从主题 token 派生而非写死，且要与图片
          「可见裁剪弧」同心而非与 border-box 同心——Blink 实测（合成页像素验证）：
          overflow 裁剪弧心 = padding 盒角 + 完整 border-radius（半径不因 1px 边框缩减），
          即弧心距图片盒角 (1px边框 + --radius-xl)。环盒角在图片盒角外扩 3px 处，
          同心条件：环半径 = 弧心距 - 外扩 = (--radius-xl + 1px) - (-3px) = --radius-xl + 4px。
          本项目 --radius-xl = var(--radius)+4px = 16px → 环 20px；
          写死 15px（误按 Tailwind 默认 12px 推算）曾致四角缝隙 4.2px vs 直边 2.5px。
          缝隙恒定：环带内缘(18.5px) - 图片可见弧(16px) = 2.5px，直边同值 */}
      {active && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="pointer-events-none absolute -inset-[3px] rounded-[calc(var(--radius-xl)+4px)] border-[1.5px]"
          style={{ borderColor: "var(--ui-accent, #8b5cf6)" }}
        />
      )}
    </span>
  );
}

/** 图片降采样：控制在适合浏览器存储的体积内 */
async function fileToSizedBlob(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  let dim = 2200;
  let q = 0.85;
  let blob: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, w, h);
    blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", q)
    );
    if (blob && blob.size <= 3 * 1024 * 1024) break;
    dim = Math.round(dim * 0.8);
    q = Math.max(0.55, q - 0.08);
  }
  img.close?.();
  if (!blob) throw new Error("encode failed");
  return blob;
}

function SettingsPanel({
  settings,
  onPatch,
  onExport,
  onImportFile,
  onReset,
}: {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const wallFileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [uploadHint, setUploadHint] = useState<string | null>(null);

  /* 读取自定义壁纸缩略图（IndexedDB → objectURL） */
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    idbGet<Blob>(CUSTOM_WALLPAPER_KEY).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setCustomUrl(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  async function handleWallFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setUploadHint("仅支持图片文件");
      return;
    }
    try {
      const blob = await fileToSizedBlob(f);
      await idbSet(CUSTOM_WALLPAPER_KEY, blob);
      if (customUrl) URL.revokeObjectURL(customUrl);
      setCustomUrl(URL.createObjectURL(blob));
      onPatch({ photoId: "custom", photoLast: "custom" });
      setUploadHint(null);
    } catch {
      setUploadHint("图片处理失败，请换一张试试");
    }
  }

  function resetClick() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setConfirmReset(false);
    onReset();
  }

  return (
    /* overflow-x-hidden：根除面板整体横向滑动（壁纸行的 -mx 外挂曾让根容器
       产生 x 向可滚 + 底部横滚动条，真机上面板随手势左右晃）；
       横向滑动只属于壁纸行 */
    <div className="slim-scroll max-h-[380px] space-y-5 overflow-x-hidden overflow-y-auto pr-1">
      <Section title="外观">
        <Segmented
          segKey="theme"
          label="主题"
          value={settings.themeMode}
          options={[
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
            { value: "system", label: "跟随" },
          ]}
          onChange={(v) => onPatch({ themeMode: v })}
        />
        <Segmented
          segKey="bg"
          label="背景"
          value={settings.background}
          options={[
            { value: "glow", label: "辉光" },
            { value: "pure", label: "纯净" },
            { value: "photo", label: "掠影" },
          ]}
          onChange={(v) => onPatch({ background: v })}
        />
        {/* 强调色：与其他设置行同构（左标签 + 右色点组） */}
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
            强调色
          </span>
          <div className="flex items-center gap-2.5">
            {ACCENTS.map((a) => (
              <AccentSwatch
                key={a.hex}
                hex={a.hex}
                name={a.name}
                active={settings.accent.toLowerCase() === a.hex.toLowerCase()}
                onSelect={() => onPatch({ accent: a.hex })}
              />
            ))}
          </div>
        </div>
      </Section>

      {/* 掠影壁纸源：每日一图开关 / 官方图库 / 自定义上传
          进出场：背景切到/切离「掠影」时雾化展开/收拢（高度+下边距+模糊同步缓动）。
          AnimatePresence initial={false}：面板打开时若已是掠影则静态呈现，仅切换瞬间有动画；
          快速往返切换时同 key 反向续接，动画自然回弹不打断。
          下边距纳入动画的原因：Tailwind 4 的 space-y-5 编译为「给非最后子元素设
          margin-block-end:20px」（上邻间距来自前一块的 margin-block-end，恒定不动），
          本块的 20px 间距恒在 margin-bottom 上；若只动画高度，收拢末端残留 20px、
          卸载瞬间视口内容猛跳 20px（rAF 探针实测 sh 646→626），挂载瞬间也先砸出
          20px 再展开；由动画接管 marginBottom（0↔20px，与编译值同向同量）后
          全程零跳变。区块内无 backdrop-filter 后代，动画 filter 不触发磨砂玻璃存活原则 */}
      <AnimatePresence initial={false}>
        {settings.background === "photo" && (
          <motion.div
            key="gallery-section"
            initial={{ height: 0, opacity: 0, marginBottom: 0, filter: "blur(6px)" }}
            animate={{ height: "auto", opacity: 1, marginBottom: 20, filter: "blur(0px)" }}
            exit={{ height: 0, opacity: 0, marginBottom: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.42, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
        <Section title="掠影壁纸">
          {/* 每日一图：开启后按日期在官方图库中自动轮换；关闭回退到最近手选壁纸 */}
          <div className="flex items-center justify-between gap-4 rounded-xl px-1 py-1.5">
            <div className="min-w-0">
              <div className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
                每日一图
              </div>
              <div className="mt-0.5 truncate text-[11px] font-extralight tracking-wide text-zinc-400 dark:text-zinc-500">
                今天：{dailyPhoto().name}
              </div>
            </div>
            <Switch
              checked={settings.photoId === "daily"}
              label="每日一图"
              onChange={(on) => {
                if (on) {
                  onPatch({
                    photoLast: settings.photoId !== "daily" ? settings.photoId : settings.photoLast,
                    photoId: "daily",
                  });
                } else {
                  const last = settings.photoLast;
                  const valid =
                    last === "custom" || GALLERY.some((g) => g.id === last);
                  onPatch({ photoId: valid ? last : GALLERY[0].id });
                }
              }}
            />
          </div>
          <div className="slim-scroll flex gap-2.5 overflow-x-auto px-1.5 py-2 overscroll-x-contain">
            {GALLERY.map((g) => (
              <WallThumb
                key={g.id}
                /* 每日一图开启时，今日命中的图库缩略图同样亮选框（可视化今天用哪张） */
                active={
                  settings.photoId === g.id ||
                  (settings.photoId === "daily" && dailyPhoto().id === g.id)
                }
                label={g.name}
                src={g.thumb}
                onClick={() => onPatch({ photoId: g.id, photoLast: g.id })}
              />
            ))}
            <WallThumb
              active={settings.photoId === "custom"}
              label="自定义壁纸"
              src={customUrl}
              onClick={() => wallFileRef.current?.click()}
            >
              <ImagePlus className="h-5 w-5" strokeWidth={1.25} />
            </WallThumb>
          </div>
          <p className="mt-1.5 pb-1 text-[11px] font-extralight leading-relaxed tracking-wide text-zinc-400 dark:text-zinc-500">
            {uploadHint ??
              "选择官方图库或点击末尾卡片上传本地图片（仅保存在本机浏览器）。"}
          </p>
          <input
            ref={wallFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleWallFile(f);
              e.target.value = "";
            }}
          />
        </Section>
          </motion.div>
        )}
      </AnimatePresence>

      <div aria-hidden className="border-t border-zinc-900/5 dark:border-white/5" />

      <Section title="时钟">
        <Segmented
          segKey="hour"
          label="时制"
          value={settings.hour12 ? "12" : "24"}
          options={[
            { value: "24", label: "24 时" },
            { value: "12", label: "12 时" },
          ]}
          onChange={(v) => onPatch({ hour12: v === "12" })}
        />
        <Segmented
          segKey="seconds"
          label="秒针"
          value={settings.showSeconds ? "on" : "off"}
          options={[
            { value: "off", label: "隐藏" },
            { value: "on", label: "显示" },
          ]}
          onChange={(v) => onPatch({ showSeconds: v === "on" })}
        />
      </Section>

      <div aria-hidden className="border-t border-zinc-900/5 dark:border-white/5" />

      <Section title="链接">
        <Segmented
          segKey="icon"
          label="图标风格"
          value={settings.iconStyle}
          options={[
            { value: "letter", label: "字母磁贴" },
            { value: "favicon", label: "站点图标" },
          ]}
          onChange={(v) => onPatch({ iconStyle: v })}
        />
        <div className="flex items-center justify-between gap-4 py-2.5">
          <span className="text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
            称呼
          </span>
          <input
            type="text"
            value={settings.userName}
            maxLength={12}
            onChange={(e) => onPatch({ userName: e.target.value })}
            placeholder="问候语中显示的名字"
            aria-label="称呼"
            className="h-8 w-36 rounded-lg border border-transparent bg-zinc-900/[0.04] px-3 text-xs font-light text-zinc-700 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-200 dark:placeholder:text-zinc-500"
          />
        </div>
      </Section>

      <div aria-hidden className="border-t border-zinc-900/5 dark:border-white/5" />

      <Section title="数据">
        <div className="flex flex-wrap gap-2 pt-1 pb-2">
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-zinc-900/10 px-3.5 py-1.5 text-[11px] font-light tracking-wide text-zinc-600 transition-colors duration-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            导出备份
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-zinc-900/10 px-3.5 py-1.5 text-[11px] font-light tracking-wide text-zinc-600 transition-colors duration-300 hover:bg-zinc-900/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            导入
          </button>
          <button
            type="button"
            onClick={resetClick}
            className={`rounded-full border px-3.5 py-1.5 text-[11px] font-light tracking-wide transition-colors duration-300 ${
              confirmReset
                ? "border-red-400/50 bg-red-400/10 text-red-500 dark:text-red-400"
                : "border-zinc-900/10 text-zinc-600 hover:bg-red-400/10 hover:text-red-500 dark:border-white/10 dark:text-zinc-300 dark:hover:text-red-400"
            }`}
          >
            {confirmReset ? "确认重置？" : "恢复默认"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="pb-1 text-[11px] font-extralight leading-relaxed tracking-wide text-zinc-400 dark:text-zinc-500">
          所有数据仅保存在本浏览器中，不会上传。
        </p>
      </Section>
    </div>
  );
}

export default memo(SettingsPanel);
