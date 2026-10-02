"use client";

/* 「初始」— 自绘快捷服务图标（v8.7.44）：按 host 匹配内联 SVG 磁贴。
 *
 * 来源与口径：187 站全部为自绘矢量 path（v9 全量描摹册，用户逐轮审阅认可，
 * 见 download/icon-preview-v8744/preview-v9.html 的审阅口径）。本模块只带
 * 两样轻量东西：
 *   ① host → 注册表 key 的映射表（suffix 最长匹配，数 KB）；
 *   ② useSelfdrawIcon() hook —— 仅当用户在设置里选「自绘图标」且当前磁贴
 *      host 命中映射时，才惰性 fetch 注册表数据 selfdraw-icons.json
 *      （15MB 全彩堆叠描摹，不进 bundle；相对 URL 与页面 chunk 同服务层，
 *      扩展包内置与云端热更两态皆达）。未命中 host 走 favicon 链兜底，
 *      加载失败同理 —— 永不因自绘册拖死磁贴渲染。
 * 渲染约定（v8.7.46 铺满律）：条目 = 完整磁贴面设计 + 主色 dom，vb 已在构建
 * 期收紧至画作真实边界（描摹源图 2.34% 系统性透明边距退役），selfdrawSvg 按
 * 宽高比选 slice/meet 铺满磁贴面（absolute inset-0），四角由磁贴自身
 * rounded+overflow-hidden 统一裁切——图标角即磁贴角，磁贴圆角直接裁在画作
 * 上，再无 dom 晕环与第二套圆角；磁贴底色 = 条目主色 dom：有满幅底的条目
 * dom 即光栅主色，同色无缝；无底 glyph 条目（50 站）dom 为策略底色（白底/
 * 主色相淡 tint/主色相深调），防 glyph 被同色吞没。
 */

import { useEffect, useState } from "react";

export interface SelfdrawEntry {
  vb: string;
  body: string;
  /** 磁贴面主色（#RRGGBB）：有底条目=光栅主色；无底 glyph 条目=策略底色 */
  dom: string;
}

export type SelfdrawIcon =
  | { state: "off" } /* 风格未启用（iconStyle 非 selfdraw），不拉数据 */
  | { state: "loading" } /* 命中映射，数据块拉取中 */
  | { state: "hit"; entry: SelfdrawEntry }
  | { state: "miss" }; /* 未命中映射或数据不可达 → favicon 链兜底 */

/* ---------- host → key 映射（suffix 最长匹配） ----------
 * 形如 "music.163.com" 的长键优先于 "163.com" 这类短键命中（最长 suffix 胜），
 * 故同域多站的家族（baidu/163/qq/tencent/microsoft/google）不需要单独的
 * 精确表——一个 map 足够，键名即匹配域。 */
const HOST_MAP: Record<string, string> = {
  /* 门户 · 新闻 · 资讯 */
  "36kr.com": "36kr",
  "baidu.com": "baidu",
  "cctv.com": "cctvnews",
  "eastmoney.com": "eastmoney",
  "ithome.com": "ithome",
  "news.163.com": "netnews",
  "163.com": "netnews",
  "netease.com": "netnews",
  "sspai.com": "sspai",
  "news.qq.com": "tencentnews",
  "thepaper.cn": "thepaper",
  "toutiao.com": "toutiao",
  "xuexi.cn": "xuexi",
  /* 社交 · 社区 */
  "douban.com": "douban",
  "miyoushe.com": "miyoushe",
  "weibo.com": "sinaweibo",
  "weibo.cn": "sinaweibo",
  "qq.com": "tencentqq",
  "tieba.baidu.com": "tieba",
  "tieba.com": "tieba",
  "weixin.qq.com": "wechat",
  "wechat.com": "wechat",
  "xiaohongshu.com": "xiaohongshu",
  "xhslink.com": "xiaohongshu",
  "zhihu.com": "zhihu",
  /* 电商 · 购物 */
  "1688.com": "b1688",
  "cainiao.com": "cainiao",
  "dewu.com": "dewu",
  "poizon.com": "dewu",
  "freshippo.com": "hema",
  "hema.com": "hema",
  "jd.com": "jd",
  "jd.hk": "jd",
  "360buy.com": "jd",
  "smzdm.com": "smzdm",
  "taobao.com": "taobao",
  "tmall.com": "tmall",
  "tmall.hk": "tmall",
  "vip.com": "vipshop",
  "vipshop.com": "vipshop",
  "goofish.com": "xianyu",
  "2.taobao.com": "xianyu",
  /* 视频 · 流媒体 */
  "bilibili.com": "bilibili",
  "b23.tv": "bilibili",
  "douyin.com": "douyin",
  "iesdouyin.com": "douyin",
  "fanqienovel.com": "fanqie",
  "iqiyi.com": "iqiyi",
  "iq.com": "iqiyi",
  "kuaishou.com": "kuaishou",
  "mgtv.com": "mgtv",
  "v.qq.com": "tencentvideo",
  "ixigua.com": "xigua",
  "youku.com": "youku",
  /* 音乐 · 音频 */
  "kugou.com": "kugou",
  "kuwo.cn": "kuwo",
  "music.163.com": "neteasemusic",
  "qishui.douyin.com": "qishui",
  "y.qq.com": "qqmusic",
  "kg.qq.com": "wesing",
  "ximalaya.com": "ximalaya",
  /* 直播 */
  "douyu.com": "douyu",
  "huya.com": "huya",
  "yy.com": "yy",
  /* 游戏 */
  "battle.net": "battlenet",
  "blizzard.com": "battlenet",
  "epicgames.com": "epicgames",
  "4399.com": "game4399",
  "4399.cn": "game4399",
  "minecraft.net": "minecraft",
  "nintendo.com": "nintendoswitch",
  "playstation.com": "playstation",
  "playstation.net": "playstation",
  "riotgames.com": "riotgames",
  "roblox.com": "roblox",
  "steampowered.com": "steam",
  "steamcommunity.com": "steam",
  "taptap.cn": "taptap",
  "taptap.io": "taptap",
  "wegame.com": "wegame",
  "xbox.com": "xbox",
  /* 理财 · 支付 */
  "abchina.com": "abc",
  "alipay.com": "alipay",
  "bankofchina.com": "boc",
  "bankcomm.com": "bocom",
  "ccb.com": "ccb",
  "ccb.cn": "ccb",
  "cmbchina.com": "cmb",
  "cmbc.com.cn": "cmbc",
  "duxiaoman.com": "duxiaoman",
  "fund123.org": "fund123",
  "1234567.com.cn": "fund123",
  "icbc.com.cn": "icbc",
  "psbc.com": "psbc",
  "10jqka.com.cn": "thb10jqka",
  "unionpay.com": "unionpay",
  "95516.com": "unionpay",
  "xueqiu.com": "xueqiu",
  /* 民生 · 出行 */
  "12306.cn": "12306",
  "amap.com": "amap",
  "autonavi.com": "amap",
  "ke.com": "beike",
  "beike.com": "beike",
  "10086.cn": "cmcc",
  "cmcc.com": "cmcc",
  "ctrip.com": "ctrip",
  "trip.com": "ctrip",
  "didiglobal.com": "didi",
  "didi.cn": "didi",
  "fliggy.com": "fliggy",
  "alitrip.com": "fliggy",
  "hellobike.com": "hello",
  "hello.com": "hello",
  "122.gov.cn": "jiaoguan",
  "qunar.com": "qunar",
  "sf-express.com": "sf",
  "189.cn": "telecom",
  "chinatelecom.com.cn": "telecom",
  "ly.com": "tongcheng",
  "maps.google.com": "gmaps",
  "10010.com": "unicom",
  "chinaunicom.com": "unicom",
  /* 本地生活 · 票务 */
  "damai.cn": "damai",
  "dianping.com": "dianping",
  "ele.me": "eleme",
  "maoyan.com": "maoyan",
  "meituan.com": "meituan",
  "taopiaopiao.com": "taopiaopiao",
  "58.com": "wuba",
  /* 工具 · 办公 · 网盘 · 阅读 */
  "aliyundrive.com": "aliyunpan",
  "alipan.com": "aliyunpan",
  "pan.baidu.com": "baidunetdisk",
  "dingtalk.com": "dingtalk",
  "feishu.cn": "feishu",
  "mail.163.com": "mail163",
  "126.com": "mail163",
  "126.net": "mail163",
  "qidian.com": "qidian",
  "mail.qq.com": "qqmail",
  "quark.cn": "quark",
  "sm.cn": "quark",
  "docs.qq.com": "tencentdocs",
  "meeting.tencent.com": "tencentmeeting",
  "uc.cn": "uc",
  "ucweb.com": "uc",
  "work.weixin.qq.com": "wecom",
  "weread.qq.com": "weread",
  "wps.cn": "wps",
  "wps.com": "wps",
  "kdocs.cn": "wps",
  "xunlei.com": "xunlei",
  /* 开发者 · 设计 */
  "csdn.net": "csdn",
  "figma.com": "figma",
  "github.com": "github",
  "gitee.com": "gitee",
  "juejin.cn": "juejin",
  "juejin.im": "juejin",
  "leetcode.cn": "leetcode",
  "leetcode.com": "leetcode",
  "stackoverflow.com": "stackoverflow",
  "v2ex.com": "v2ex",
  /* AI 平台 */
  "claude.ai": "claude",
  "claude.com": "claude",
  "copilot.microsoft.com": "copilot",
  "deepseek.com": "deepseek",
  "doubao.com": "doubao",
  "gemini.google.com": "gemini",
  "grok.com": "grok",
  "x.ai": "grok",
  "kimi.com": "kimi",
  "moonshot.cn": "kimi",
  "minimaxi.com": "minimax",
  "midjourney.com": "midjourney",
  "openai.com": "openai",
  "chatgpt.com": "openai",
  "perplexity.ai": "perplexity",
  "tongyi.aliyun.com": "qwen",
  "tongyi.com": "qwen",
  "yiyan.baidu.com": "wenxin",
  "xfyun.cn": "xfspark",
  "iflytek.com": "xfspark",
  "yuanbao.tencent.com": "yuanbao",
  "chatglm.cn": "zhipu",
  "zhipuai.cn": "zhipu",
  /* 外国网站 */
  "airbnb.com": "airbnb",
  "airbnb.cn": "airbnb",
  "amazon.com": "amazon",
  "amazon.cn": "amazon",
  "amazon.co.jp": "amazon",
  "amazon.co.uk": "amazon",
  "amazon.de": "amazon",
  "bbc.com": "bbc",
  "bbc.co.uk": "bbc",
  "bing.com": "bing",
  "booking.com": "booking",
  "cnn.com": "cnn",
  "coursera.org": "coursera",
  "crunchyroll.com": "crunchyroll",
  "discord.com": "discord",
  "discord.gg": "discord",
  "dropbox.com": "dropbox",
  "duckduckgo.com": "duckduckgo",
  "duolingo.com": "duolingo",
  "duolingo.cn": "duolingo",
  "ebay.com": "ebay",
  "ebay.co.uk": "ebay",
  "ebay.de": "ebay",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "mail.google.com": "gmail",
  "drive.google.com": "gdrive",
  "max.com": "hbomax",
  "hbomax.com": "hbomax",
  "imdb.com": "imdb",
  "instagram.com": "instagram",
  "khanacademy.org": "khanacademy",
  "linkedin.com": "linkedin",
  "medium.com": "medium",
  "netflix.com": "netflix",
  "notion.so": "notion",
  "notion.com": "notion",
  "notion.site": "notion",
  "outlook.com": "outlook",
  "outlook.office.com": "outlook",
  "live.com": "outlook",
  "hotmail.com": "outlook",
  "office.com": "outlook",
  "pinterest.com": "pinterest",
  "pin.it": "pinterest",
  "primevideo.com": "primevideo",
  "quora.com": "quora",
  "reddit.com": "reddit",
  "redd.it": "reddit",
  "reuters.com": "reuters",
  "snapchat.com": "snapchat",
  "soundcloud.com": "soundcloud",
  "spotify.com": "spotify",
  "telegram.org": "telegram",
  "t.me": "telegram",
  "threads.net": "threads",
  "threads.com": "threads",
  "tiktok.com": "tiktok",
  "tripadvisor.com": "tripadvisor",
  "tripadvisor.cn": "tripadvisor",
  "tumblr.com": "tumblr",
  "twitch.tv": "twitch",
  "twitch.com": "twitch",
  "uber.com": "uber",
  "vimeo.com": "vimeo",
  "whatsapp.com": "whatsapp",
  "wa.me": "whatsapp",
  "wikipedia.org": "wikipedia",
  "x.com": "x",
  "twitter.com": "x",
  "zoom.us": "zoom",
  "zoom.com": "zoom",
  "google.com": "google",
  "google.cn": "google",
  "teams.microsoft.com": "msteams",
  "teams.live.com": "msteams",
  "microsoftteams.com": "msteams",
  "paypal.com": "paypal",
  "slack.com": "slack",
  "udemy.com": "udemy",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
};

const MODULE_SUFFIXES = Object.keys(HOST_MAP);

/** host → 自绘注册表 key；未收录返回 null（调用方走 favicon 链兜底）。
 *  suffix 最长匹配：music.163.com 命中 neteasemusic 而非裸 163.com 的 netnews。 */
/** #RRGGBB → HSL 色相（0-360）；无饱和（白/灰/黑）返回 null。
 *  v8.7.45：自绘命中时磁贴描边环取主色色相，环与磁贴面同族不跳色。 */
export function hexHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (d < 1e-6) return null;
  let h: number;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

export function selfdrawKeyForHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/\.+$/, "").replace(/:\d+$/, "");
  if (!h) return null;
  let best: string | null = null;
  let bestLen = -1;
  for (const dom of MODULE_SUFFIXES) {
    if ((h === dom || h.endsWith("." + dom)) && dom.length > bestLen) {
      best = HOST_MAP[dom];
      bestLen = dom.length;
    }
  }
  return best;
}

/* ---------- 注册表数据（惰性单飞 fetch） ----------
 * 存储形状：{key: [vb, body, dom]}——元组省键名（15MB 级资产，键名冗余可观），
 * 数据边界处展开为 SelfdrawEntry 对象，消费方只见对象。dom 由构建期光栅化
 * 提取（scripts/domcolor-v8745.mjs + build-dom-v8745.py），运行时零计算。 */
type SelfdrawData = Record<string, [string, string, string]>;

let dataP: Promise<SelfdrawData> | null = null;

function loadSelfdrawData(): Promise<SelfdrawData> {
  dataP ??= fetch("selfdraw-icons.json", { cache: "no-cache" })
    .then((r) => {
      if (!r.ok) throw new Error("selfdraw-icons.json " + r.status);
      return r.json() as Promise<SelfdrawData>;
    })
    .catch((e) => {
      dataP = null; /* 失败不缓存：下个磁贴/下个新标签页可重试 */
      throw e;
    });
  return dataP;
}

const OFF: SelfdrawIcon = { state: "off" };
const MISS: SelfdrawIcon = { state: "miss" };
const LOADING: SelfdrawIcon = { state: "loading" };

/** 自绘图标解析：enabled（风格开关）+ host。状态机见 SelfdrawIcon。
 *  miss 是终态兜底——映射未收录或数据块拉取失败都落到它，磁贴继续走
 *  原有的 favicon 链/字母路径，自绘册永远只是增强而非依赖。 */
export function useSelfdrawIcon(
  host: string | null | undefined,
  enabled: boolean
): SelfdrawIcon {
  const key = enabled ? selfdrawKeyForHost(host) : null;
  const [st, setSt] = useState<SelfdrawIcon>(() =>
    enabled ? (key ? LOADING : MISS) : OFF
  );

  useEffect(() => {
    if (!enabled) {
      setSt(OFF);
      return;
    }
    if (!key) {
      setSt(MISS);
      return;
    }
    let alive = true;
    setSt(LOADING);
    loadSelfdrawData()
      .then((d) => {
        if (!alive) return;
        const raw = d[key];
        setSt(
          raw
            ? { state: "hit", entry: { vb: raw[0], body: raw[1], dom: raw[2] } }
            : MISS
        );
      })
      .catch(() => {
        if (alive) setSt(MISS);
      });
    return () => {
      alive = false;
    };
  }, [enabled, key]);

  return st;
}

/** 条目 → 可 innerHTML 的 <svg> 全文（铺满磁贴面；圆角/裁切归磁贴容器统一）。
 *  v8.7.46 铺满律：vb 已收紧至画作实边界，preserveAspectRatio 一律
 *  xMidYMid slice——方形视口 × 方形 vb 时 slice 与 meet 数学等价（glyph 居中
 *  构图不变），非方形（huya 1024×800）slice 裁长边铺满短边，meet 的
 *  letterbox dom 空带退役（冒烟实证：宽高比分支会让 huya 落回 meet 出空带）。
 *  数据侧纪律：未来非方形 glyph 入册前先归方形 vb，渲染侧不再设分支。 */
export function selfdrawSvg(e: SelfdrawEntry): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
    e.vb +
    '" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">' +
    e.body +
    "</svg>"
  );
}
