/* 「初始」音乐面板 — 接入网易云音乐（经 初始音乐桥·独立版 ChuShiBridge + 本地服务）
 *
 * 接入路线：ChuShiBridge 一键安装包（不依赖 BetterNCM/chromatic 框架，
 * 用 CEF 调试端口替代内部 hook，不随网易云升级失效）；
 * 旧版客户端（2.x/3.0.x）仍可用 v1.7.5 的 chromatic 插件路线。
 *
 * 三态：
 *   未接入/出错 → 连接指引（一键安装流程）+ 服务地址修正 + 重试
 *   已连接     → 封面 / 歌名 / 进度条（点击拖动 seek）/ 播放控制 / 音量
 *   空态       → 已连接但未在播放
 *
 * 数据面见 lib/startpage/music.ts：1s 轮询快照 + 本地时钟插值出平滑进度；
 * 控制为乐观命令（play/pause/next/prev/seek/volume），真实状态由下一拍快照校正。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Music2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  DEFAULT_MUSIC_URL,
  MusicBridgeClient,
  fmtTime,
  normalizeMusicUrl,
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
      return "连不上桥接服务（网易云没开，或初始音乐桥未运行）";
    case "blocked":
      return "请求被浏览器拦截了（混合内容或本地网络权限）";
    case "bad":
      return "端口上不是初始音乐桥（可能被其他程序占用）";
    default:
      return "连接失败";
  }
}

/* 一键安装包直链（GitHub Release latest 资产名固定） */
const BRIDGE_DOWNLOAD_URL =
  "https://github.com/LXgssy/Start-chushi/releases/latest/download/ChuShiBridge-2.0.0-Setup.zip";
const LEGACY_PLUGIN_URL =
  "https://github.com/LXgssy/Start-chushi/releases/tag/v1.7.5";

export default function MusicPanel() {
  const [savedUrl, setSavedUrl] = useStored<string>("start:music-url", DEFAULT_MUSIC_URL);
  const [urlDraft, setUrlDraft] = useState(savedUrl);
  const [snap, setSnap] = useState<MusicSnapshot | null>(null);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const [failReason, setFailReason] = useState<MusicFailReason | undefined>(undefined);
  const clientRef = useRef<MusicBridgeClient | null>(null);
  const [, setTick] = useState(0);
  const [coverOk, setCoverOk] = useState(true);

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
    void clientRef.current?.connect(u);
  }

  const song = snap?.song ?? null;
  const playing = snap?.playing ?? false;
  const dur = song?.durationMs ?? 0;
  const pos = clientRef.current?.getPositionMs() ?? snap?.positionMs ?? 0;

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
            <p className="mb-1.5 tracking-wide text-zinc-400 dark:text-zinc-500">接入三步（新版客户端推荐）</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                下载{" "}
                <a
                  href={BRIDGE_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-normal text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-zinc-500 dark:text-zinc-200 dark:decoration-zinc-600"
                >
                  初始音乐桥·独立版
                </a>{" "}
                一键安装包（Windows）
              </li>
              <li>解压后双击「安装初始音乐桥.bat」，网易云会自动重启</li>
              <li>回到这里点「重试」</li>
            </ol>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400/90 dark:text-zinc-500">
              不依赖 BetterNCM/chromatic，支持最新版网易云客户端；网易云需保持运行且
              ChuShiBridge 窗口开启。旧版客户端（2.x/3.0.x）仍可用{" "}
              <a
                href={LEGACY_PLUGIN_URL}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-600"
              >
                chromatic 插件路线
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
    <div className="flex flex-col gap-3.5" data-testid="music-player">
      {/* 曲目行 */}
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-900/[0.05] shadow-sm dark:bg-white/10">
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
              <Music2 className="h-6 w-6" strokeWidth={1.25} />
            </div>
          )}
          {playing && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full accent-bg animate-pulse"
              aria-hidden
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-normal text-zinc-800 dark:text-zinc-100">
            {song ? song.name : "未在播放"}
          </p>
          <p className="mt-0.5 truncate text-xs font-light text-zinc-500 dark:text-zinc-400">
            {song
              ? song.artists.join(" / ") || "未知艺术家"
              : "打开网易云音乐放一首歌吧"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void clientRef.current?.connect(savedUrl)}
          aria-label="重新连接"
          title="重新连接"
          className="rounded-full p-1.5 text-zinc-400 opacity-70 transition-all hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
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

      {/* 连接状态脚注 */}
      <p className="flex items-center gap-1.5 text-[10px] font-light tracking-wide text-zinc-400 dark:text-zinc-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        已连接 · 网易云音乐
      </p>
    </div>
  );
}
