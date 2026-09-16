/* 「初始」音乐面板 — 接入网易云音乐（经初始音乐桥）
 *
 * v1.7.8（端口自动发现）：
 *   - 保存地址连不上时自动扫常见端口（10754 / 8008），命中即换址并记住 ——
 *     插件设置页改「服务端口」后面板不再敲死旧端口
 *   - 错误态提示可自动扫描范围与自定义端口填法
 *
 * v1.7.7 翻新（配插件 1.3.0）：
 *   - 大封面 + 播放态 accent 光晕；歌名 / 歌手 / 专辑信息层级
 *   - 诊断卡（/api/debug）：桥版本、三源状态、状态文件年龄，一键复制回传排障
 *   - 状态陈旧自解释提示（1.2.0 及更早插件暂停时不写盘 → stateAgeMs 虚高）
 *   - 接入指引改 BetterNCM 插件路线主推（.plugin 与官方商店同构），独立版兜底
 *
 * 三态：
 *   未接入/出错 → 连接指引 + 服务地址修正 + 重试
 *   已连接     → 封面 / 歌名 / 进度条（可拖 seek）/ 播放控制 / 音量 / 诊断
 *   空态       → 已连接但未在播放
 *
 * 数据面见 lib/startpage/music.ts：1s 轮询快照 + 本地时钟插值出平滑进度；
 * 控制为乐观命令（play/pause/next/prev/seek/volume），真实状态由下一拍快照校正。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  Music2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DEFAULT_MUSIC_URL,
  MusicBridgeClient,
  fmtTime,
  normalizeMusicUrl,
  type MusicBridgeDebug,
  type MusicFailReason,
  type MusicSnapshot,
  type MusicStatus,
} from "@/lib/startpage/music";
import { useStored } from "@/hooks/use-start";

const RANGE_CLS =
  "h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-900/10 outline-none dark:bg-white/10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-zinc-900/15 dark:[&::-webkit-slider-thumb]:ring-white/20";

function reasonText(r: MusicFailReason | undefined): string {
  switch (r) {
    case "refused":
      return "连不上桥接服务（网易云没开、桥未装/未运行，或在插件设置里改过服务端口）";
    case "blocked":
      return "请求被浏览器拦截了（混合内容或本地网络权限）";
    case "bad":
      return "端口上不是初始音乐桥（可能被其他程序占用）";
    default:
      return "连接失败";
  }
}

/* 直链（GitHub Release latest 资产名固定，ASCII 规避 URL 编码坑） */
const BRIDGE_PLUGIN_URL =
  "https://github.com/LXgssy/Start-chushi/releases/latest/download/ChuShi-MusicBridge-1.3.0.plugin";
const BETTERNCM_INSTALLER_URL =
  "https://github.com/std-microblock/BetterNCM-Installer/releases";
const STANDALONE_URL =
  "https://github.com/LXgssy/Start-chushi/releases/latest/download/ChuShiBridge-2.0.0-Setup.zip";

const LINK_CLS =
  "font-normal text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-zinc-500 dark:text-zinc-200 dark:decoration-zinc-600";

export default function MusicPanel() {
  const [savedUrl, setSavedUrl] = useStored<string>("start:music-url", DEFAULT_MUSIC_URL);
  const [urlDraft, setUrlDraft] = useState(savedUrl);
  const [snap, setSnap] = useState<MusicSnapshot | null>(null);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const [failReason, setFailReason] = useState<MusicFailReason | undefined>(undefined);
  const clientRef = useRef<MusicBridgeClient | null>(null);
  const [, setTick] = useState(0);
  const [coverOk, setCoverOk] = useState(true);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diag, setDiag] = useState<MusicBridgeDebug | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  /* 面板挂载即接入（地址变化由「重试」触发重连，不在输入时抖动重连） */
  useEffect(() => {
    const c = new MusicBridgeClient({
      onSnapshot: (s) => {
        setSnap(s);
        if (!s?.song?.cover) setCoverOk(true);
      },
      onStatus: (st, reason) => {
        setStatus(st);
        setFailReason(reason);
      },
      onAdopted: (u) => {
        /* 自动发现命中非请求地址 → 记住并回填输入框，下次直连 */
        setSavedUrl(u);
        setUrlDraft(u);
      },
    });
    clientRef.current = c;
    void c.connect(savedUrl);
    return () => {
      c.disconnect();
      clientRef.current = null;
    };
    /* savedUrl 只在挂载时读取一次（重连走 retry），避免输入过程反复重建客户端 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 进度刷新驱动（本地插值），500ms 一拍足够顺滑且省电 */
  useEffect(() => {
    if (status !== "connected") return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [status]);

  const send = (action: string, extra?: Record<string, number>) => {
    void clientRef.current?.control({ action, ...extra });
  };

  function retry() {
    const u = normalizeMusicUrl(urlDraft);
    setUrlDraft(u);
    setSavedUrl(u);
    setDiagOpen(false);
    setDiag(null);
    void clientRef.current?.connect(u);
  }

  async function toggleDiag() {
    const next = !diagOpen;
    setDiagOpen(next);
    if (next) {
      setDiagLoading(true);
      try {
        setDiag((await clientRef.current?.debug()) ?? null);
      } finally {
        setDiagLoading(false);
      }
    }
  }

  async function copyDiag() {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  }

  const song = snap?.song ?? null;
  const playing = snap?.playing ?? false;
  const dur = song?.durationMs ?? 0;
  const pos = clientRef.current?.getPositionMs() ?? snap?.positionMs ?? 0;
  const staleSec =
    diag?.stateAgeMs != null ? Math.max(1, Math.round(diag.stateAgeMs / 1000)) : null;

  /* ---------- 未连接 ---------- */
  if (status !== "connected") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              status === "connecting" ? "animate-pulse bg-amber-400" : "bg-zinc-400/70 dark:bg-zinc-500/70"
            }`}
            aria-hidden
          />
          <p className="text-sm font-light text-zinc-700 dark:text-zinc-200">
            {status === "connecting" ? "正在连接音乐桥…" : "未连接到网易云音乐"}
          </p>
        </div>

        {status === "error" && (
          <p className="rounded-lg bg-zinc-900/[0.03] px-3 py-2 text-xs font-light leading-relaxed text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            {reasonText(failReason)}
            <span className="mt-1 block text-[11px] text-zinc-400 dark:text-zinc-500">
              面板会自动尝试常见端口（10754 / 8008）；改过其他端口的话，在下方地址栏填
              <code className="mx-0.5 font-mono">http://127.0.0.1:端口</code>
              再点「重试」即可。
            </span>
          </p>
        )}

        {status !== "connecting" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") retry();
              }}
              spellCheck={false}
              aria-label="桥接服务地址"
              className="h-9 min-w-0 flex-1 rounded-xl border border-transparent bg-zinc-900/[0.04] px-3 font-mono text-xs text-zinc-700 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-200"
            />
            <button
              type="button"
              onClick={retry}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900/[0.05] px-3.5 text-xs font-light text-zinc-600 transition-colors hover:bg-zinc-900/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              重试
            </button>
          </div>
        )}

        {status !== "connecting" && (
          <div className="rounded-xl bg-zinc-900/[0.03] px-3.5 py-3 text-xs font-light leading-relaxed text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            <p className="mb-1.5 tracking-wide text-zinc-400 dark:text-zinc-500">
              接入三步（BetterNCM 插件路线 · 推荐）
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                安装{" "}
                <a href={BETTERNCM_INSTALLER_URL} target="_blank" rel="noreferrer" className={LINK_CLS}>
                  BetterNCM 框架
                </a>
                （已装可跳过）
              </li>
              <li>
                下载{" "}
                <a href={BRIDGE_PLUGIN_URL} target="_blank" rel="noreferrer" className={LINK_CLS}>
                  初始音乐桥插件包
                </a>{" "}
               （.plugin 文件）
              </li>
              <li>
                放入 <code className="font-mono text-[11px]">C:\betterncm\plugins\</code>{" "}
                文件夹，重启网易云音乐 → 回来点「重试」
              </li>
            </ol>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400/90 dark:text-zinc-500">
              从旧版升级：删除 plugins 里的旧 .plugin 再放入新版（1.3.0 修复了控制不生效）。
              不想用框架可用{" "}
              <a href={STANDALONE_URL} target="_blank" rel="noreferrer" className={LINK_CLS}>
                独立版 ChuShiBridge
              </a>
              。网页版首次连接时浏览器可能询问「访问本地网络」，请允许；扩展版无需此步。
            </p>
          </div>
        )}
      </div>
    );
  }

  /* ---------- 已连接 ---------- */
  return (
    <div className="flex flex-col gap-4" data-testid="music-player">
      {/* 封面 + 曲目信息 */}
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0">
          {playing && (
            <div
              className="accent-bg absolute -inset-1.5 rounded-[1.3rem] opacity-20 blur-md"
              aria-hidden
            />
          )}
          <div
            className={`relative h-24 w-24 overflow-hidden rounded-2xl bg-zinc-900/[0.05] shadow-md ring-1 ring-zinc-900/5 transition-transform duration-500 dark:bg-white/10 dark:ring-white/10 ${
              playing ? "scale-[1.02]" : "scale-100"
            }`}
          >
            {song?.cover && coverOk ? (
              <img
                src={song.cover}
                alt=""
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setCoverOk(false)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-600">
                <Music2 className="h-8 w-8" strokeWidth={1.25} />
              </div>
            )}
            {playing && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                aria-hidden
              />
            )}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[15px] font-normal leading-snug text-zinc-800 dark:text-zinc-100"
            title={song?.name}
          >
            {song ? song.name : "未在播放"}
          </p>
          <p
            className="mt-1 truncate text-xs font-light text-zinc-500 dark:text-zinc-400"
            title={song ? song.artists.join(" / ") : undefined}
          >
            {song ? song.artists.join(" / ") || "未知艺术家" : "打开网易云音乐放一首歌吧"}
          </p>
          {song?.album && (
            <p className="mt-0.5 truncate text-[11px] font-light text-zinc-400 dark:text-zinc-500">
              {song.album}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void clientRef.current?.connect(savedUrl)}
          aria-label="重新连接"
          title="重新连接"
          className="self-start rounded-full p-1.5 text-zinc-400 opacity-70 transition-all hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {/* 进度条 + 时间 */}
      <div className="flex flex-col gap-1" data-testid="music-progress">
        <input
          type="range"
          min={0}
          max={dur > 0 ? dur : 1}
          value={Math.min(pos, dur || 1)}
          onChange={(e) => {
            const v = Number(e.target.value);
            send("seek", { positionMs: v });
          }}
          disabled={dur <= 0}
          aria-label="播放进度"
          className={RANGE_CLS}
          style={{
            background: `linear-gradient(to right, var(--ui-accent, #8b5cf6) ${
              dur > 0 ? (pos / dur) * 100 : 0
            }%, transparent 0)`,
            accentColor: "var(--ui-accent, #8b5cf6)",
          }}
        />
        <div className="flex justify-between text-[10px] font-light tabular-nums text-zinc-400 dark:text-zinc-500">
          <span>{fmtTime(pos)}</span>
          <span>{dur > 0 ? fmtTime(dur) : "--:--"}</span>
        </div>
      </div>

      {/* 控制排 */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => send("prev")}
          aria-label="上一首"
          className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
        >
          <SkipBack className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => send("toggle")}
          aria-label={playing ? "暂停" : "播放"}
          className="accent-bg mx-1 flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md transition-transform duration-200 active:scale-95"
        >
          {playing ? (
            <Pause className="h-4.5 w-4.5" strokeWidth={1.75} />
          ) : (
            <Play className="ml-0.5 h-4.5 w-4.5" strokeWidth={1.75} />
          )}
        </button>
        <button
          type="button"
          onClick={() => send("next")}
          aria-label="下一首"
          className="rounded-full p-2.5 text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
        >
          <SkipForward className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* 音量 */}
      {snap?.volume != null && (
        <div className="flex items-center gap-2.5 px-0.5">
          <button
            type="button"
            onClick={() => send("mute")}
            aria-label={snap.volume === 0 ? "取消静音" : "静音"}
            className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            {snap.volume === 0 ? (
              <VolumeX className="h-3.5 w-3.5" strokeWidth={1.5} />
            ) : (
              <Volume2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={snap.volume}
            onChange={(e) => send("volume", { volume: Number(e.target.value) })}
            aria-label="音量"
            className={`${RANGE_CLS} !w-28`}
            style={{
              background: `linear-gradient(to right, var(--ui-accent, #8b5cf6) ${snap.volume * 100}%, transparent 0)`,
              accentColor: "var(--ui-accent, #8b5cf6)",
            }}
          />
        </div>
      )}

      {/* 连接状态脚注 + 诊断开关 */}
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-light tracking-wide text-zinc-400 dark:text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          已连接 · 网易云音乐
        </p>
        <button
          type="button"
          onClick={() => void toggleDiag()}
          aria-expanded={diagOpen}
          aria-label="桥接诊断"
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-light transition-colors ${
            diagOpen
              ? "bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/10 dark:text-zinc-300"
              : "text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-300"
          }`}
        >
          <Activity className="h-3 w-3" strokeWidth={1.5} />
          诊断
        </button>
      </div>

      {/* 诊断卡 */}
      {diagOpen && (
        <div
          data-testid="music-diag"
          className="rounded-xl bg-zinc-900/[0.03] px-3.5 py-3 dark:bg-white/5"
        >
          {diagLoading ? (
            <p className="text-xs font-light text-zinc-500 dark:text-zinc-400">拉取诊断中…</p>
          ) : !diag ? (
            <p className="text-xs font-light leading-relaxed text-zinc-500 dark:text-zinc-400">
              诊断不可用（1.0.0 之前的旧版桥没有 /api/debug，或连接已中断）。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px] font-light text-zinc-600 dark:text-zinc-300">
                <span className="text-zinc-400 dark:text-zinc-500">桥版本</span>
                <span className="font-mono">
                  {diag.version ?? "?"}
                  {diag.native ? ` · ${diag.native}` : ""}
                  {diag.port ? ` · :${diag.port}` : ""}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">状态文件</span>
                <span className="font-mono">
                  {diag.stateFile
                    ? `存在${staleSec != null ? ` · ${staleSec}s 前更新` : ""}`
                    : "不存在"}
                </span>
                <span className="text-zinc-400 dark:text-zinc-500">数据源</span>
                <span className="flex flex-wrap gap-1">
                  {(
                    [
                      ["store", diag.diag?.storeReady],
                      ["events", diag.diag?.eventsHooked],
                      ["song", diag.diag?.getPlayingSong],
                      ["media", diag.diag?.media],
                    ] as const
                  ).map(([k, v]) => (
                    <span
                      key={k}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                        v
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-zinc-500/10 text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {k} {v ? "✓" : "✕"}
                    </span>
                  ))}
                </span>
                {diag.diag?.href && (
                  <>
                    <span className="text-zinc-400 dark:text-zinc-500">注入页</span>
                    <span className="truncate font-mono" title={diag.diag.href}>
                      {diag.diag.href}
                    </span>
                  </>
                )}
              </div>

              {diag.stateAgeMs != null && diag.stateAgeMs > 15000 && (
                <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] font-light leading-relaxed text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span>
                    状态已 {staleSec}s 未更新——1.2.0 及更早的插件暂停时不写盘属已知现象；
                    若播放中也不更新、或控制不生效，请升级插件到 1.3.0（删除 plugins
                    里的旧 .plugin，换新后重启网易云）。
                  </span>
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[10px] font-light text-zinc-400 dark:text-zinc-500">
                  /api/debug{diag.diag?.v ? ` · 插件 ${diag.diag.v}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void copyDiag()}
                  className="flex items-center gap-1 rounded-lg bg-zinc-900/[0.05] px-2 py-1 text-[11px] font-light text-zinc-600 transition-colors hover:bg-zinc-900/10 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
                >
                  {copied ? (
                    <Check className="h-3 w-3" strokeWidth={1.5} />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.5} />
                  )}
                  {copied ? "已复制" : "复制诊断"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
