"use client";

/* 「初始」— 搜索栏（beta 重写架构）
 *
 * 结构律：布局锚点恒占静息尺寸（h-14）；表单脱流绝对定位、自锚点向下生长
 * ——建议下拉就是搜索栏本体的延伸（同一块玻璃面），展开时直接覆盖在快捷
 * 服务上方，页面布局零位移。
 *
 * 动效分工：
 *  · 高度展开 = framer height 动画（显式公式 58+n×40 而非 auto——聚焦态表单
 *    自带 scale(1.015)，framer 对 auto 的一次性测量会被变换污染）；
 *  · 列表浮现 = 常驻 DOM + data-open CSS 过渡（v8.7.2 ㊸：AnimatePresence
 *    条件重挂 + framer WAAPI opacity 空窗是「出现闪动一拍」的根因，
 *    panel-fade 教训同族——常驻结构 + visibility 离散插值免疫）；
 *  · 行级联入场 = v8.7.3 展开动画打磨：showDrop false→true 边沿【渲染期】
 *    挂 .sug-cascade（与首帧行同 commit，零空窗），SUG_CASCADE_MS 后摘除——
 *    逐行 opacity+y+blur 升起聚拢（globals.css sug-row-in-kf）；窗口内结果
 *    替换（真实网络二次 fetch 落地）新行同样级联，弹出中「第一行复位」的
 *    换装硬切同步消除；窗口后换装零动画零噪音；
 *  · 高亮持久 = v8.7.3：fetch 回调不再 setActive(-1)——悬停/键选高亮跨
 *    重取保留（旧实现二次 fetch 落地即清高亮 = 「第一行复位」第二根因；
 *    鼠标不动无新 mouseenter，高亮清后不会自愈），越界索引自然失活、
 *    位移键位自校正，与桌面 omnibox 行为同构；
 *  · 玻璃壳体入场 = CSS pill-shell-in（globals.css，祖先 opacity/filter 禁律）。
 *
 * 联想源：百度 sugrec JSONP（免 CORS、免密钥、国内可达）；扩展环境（MV3 CSP
 * 禁跨域脚本注入）改 fetch 直取。词表只作「输入联想」，回车仍用当前所选引擎
 * 检索，与引擎语义解耦。3s 超时/出错静默降级为无建议，不阻塞输入。
 */

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Search } from "lucide-react";
import { ENGINES, getEngine, looksLikeUrl, toUrl } from "@/lib/startpage/engines";
import { openExternalUrl } from "@/lib/startpage/nav";
import type { Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;
/** 建议行高恒定 40px；下拉总高 = 58 + 行数×SUG_ROW_H（58 = 内容 56 + 上下 1px
 *  边框，border-box）。收起 56 时输入行在 54px 内容盒中上下各溢 1px 空白带，
 *  无可见裁切 */
const SUG_ROW_H = 40;
const SUG_MAX = 6;
/** 级联窗口：展开首帧行逐行入场（末行延迟 5×24ms + 0.26s ≈ 380ms）+ 覆盖
 *  窗口内结果替换（防抖 180ms + 网络往返典型 <500ms 落在窗内） */
const SUG_CASCADE_MS = 520;
/** 联想防抖 */
const SUG_DEBOUNCE_MS = 180;
/** 联想请求超时 */
const SUG_TIMEOUT_MS = 3000;

/** 百度 sugrec 联想源（扩展环境 fetch 直取 / 网页版 JSONP） */
function fetchSuggest(q: string, cb: (list: string[]) => void) {
  if (location.protocol === "chrome-extension:") {
    const timer = window.setTimeout(() => cb([]), SUG_TIMEOUT_MS);
    fetch(`https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}&cb=cb`)
      .then((r) => r.text())
      .then((t) => {
        window.clearTimeout(timer);
        try {
          const m = t.match(/\(([\s\S]*)\)\s*;?\s*$/);
          const parsed = m ? JSON.parse(m[1]) : null;
          const g = Array.isArray(parsed?.g) ? parsed.g : [];
          cb(g.map((x) => String(x?.q ?? "")).filter(Boolean));
        } catch {
          cb([]);
        }
      })
      .catch(() => {
        window.clearTimeout(timer);
        cb([]);
      });
    return;
  }
  const name = `__chushi_sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const w = window as unknown as Record<string, unknown>;
  const script = document.createElement("script");
  let settled = false;
  const done = (list: string[]) => {
    if (settled) return;
    settled = true;
    w[name] = undefined;
    script.remove();
    window.clearTimeout(timer);
    cb(list);
  };
  const timer = window.setTimeout(() => done([]), SUG_TIMEOUT_MS);
  w[name] = (data: { g?: Array<{ q?: string }> }) => {
    const g = Array.isArray(data?.g) ? data.g : [];
    done(g.map((x) => String(x?.q ?? "")).filter(Boolean));
  };
  script.src = `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}&cb=${name}`;
  script.onerror = () => done([]);
  document.head.appendChild(script);
}

function SearchHint({ query, above }: { query: string; above: boolean }) {
  return (
    <div
      className={`pointer-events-none flex h-4 justify-center ${above ? "mb-3" : "mt-3"}`}
    >
      <AnimatePresence>
        {query.trim() && (
          <motion.p
            initial={{ opacity: 0, y: above ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: above ? 4 : -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="search-hint text-[11px] font-light tracking-wider text-zinc-400 dark:text-zinc-500"
          >
            ↩ 直接前往{looksLikeUrl(query) ? "该网址" : ""}
            　·　Alt + ↩ 新标签页打开
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function SearchBar({
  settings,
  onPatchSettings,
}: {
  settings: Settings;
  onPatchSettings: (patch: Partial<Settings>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [sugs, setSugs] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const engine = getEngine(settings.engineId);
  const suggestOn = settings.searchSuggest;

  /* 页面级快捷键通过事件请求聚焦搜索框；可携带欲直输的首字符 */
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { char?: string } | undefined;
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const ch = detail?.char;
      if (ch) {
        const next = input.value + ch;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(input, next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.setSelectionRange(next.length, next.length);
      } else {
        input.select();
      }
    };
    window.addEventListener("start:focus-search", onFocus);
    return () => window.removeEventListener("start:focus-search", onFocus);
  }, []);

  /* 联想获取：开关开启 + 聚焦 + 非空非 URL 词 → 防抖后请求；
     关闭/失焦/清空即收起；URL 形态输入无需联想 */
  useEffect(() => {
    const q = query.trim();
    if (!suggestOn || !focused || !q || looksLikeUrl(q)) {
      setSugs([]);
      setActive(-1);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      fetchSuggest(q, (list) => {
        /* v8.7.3 高亮持久：不再 setActive(-1)——二次 fetch 落地即清高亮 =
           「第一行复位」根因（鼠标不动无新 mouseenter，清后不自愈）；
           越界索引自然失活（i===active 无匹配），↑↓ 取模自校正 */
        if (alive) setSugs(list.slice(0, SUG_MAX));
      });
    }, SUG_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, focused, suggestOn]);

  function navigate(url: string, newTab: boolean) {
    /* 扩展壳 iframe 内提升到顶层框架（拒绝连接修复）；网页版行为不变 */
    openExternalUrl(url, newTab);
  }

  function submit(newTab: boolean, word?: string) {
    const q = (word ?? query).trim();
    if (!q) return;
    if (looksLikeUrl(q)) navigate(toUrl(q), newTab);
    else navigate(engine.search(q), newTab);
  }

  const showDrop = suggestOn && focused && sugs.length > 0;

  /* 级联窗口（v8.7.3）：showDrop false→true 边沿在【渲染期】挂类（官方
     「渲染期间调整 state」模式，PanelStage 相位机同款）——类与首帧行同
     commit 提交，CSS 动画从首帧起播零空窗（effect 里挂会晚一帧 = 行先
     裸态入画再跳进动画，正是要消灭的那一拍）；收起同帧摘除。计时摘除
     走 effect（渲染期不能起定时器）。 */
  const [cascade, setCascade] = useState(false);
  const [prevShow, setPrevShow] = useState(showDrop);
  if (prevShow !== showDrop) {
    setPrevShow(showDrop);
    if (showDrop) setCascade(true);
    else if (cascade) setCascade(false);
  }
  useEffect(() => {
    if (!cascade) return;
    const t = window.setTimeout(() => setCascade(false), SUG_CASCADE_MS);
    return () => window.clearTimeout(t);
  }, [cascade]);

  return (
    <div className="cl-search relative w-[min(92vw,580px)]">
      {/* 操作提示：建议开启时置于搜索框上方（与下拉展开方向对称） */}
      {suggestOn && <SearchHint query={query} above />}

      <div className="relative h-14">
        <motion.form
          role="search"
          initial={false}
          animate={{ height: showDrop ? 58 + sugs.length * SUG_ROW_H : 56 }}
          transition={{ duration: 0.32, ease: EASE }}
          onSubmit={(e) => {
            e.preventDefault();
            submit(false, active >= 0 ? sugs[active] : undefined);
          }}
          onKeyDown={(e) => {
            /* Alt/⌘/Ctrl + Enter → 新标签页打开（SubmitEvent 不携带修饰键） */
            if (e.key === "Enter" && (e.altKey || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit(true, active >= 0 ? sugs[active] : undefined);
              return;
            }
            /* 建议键位：↑↓ 循环高亮，Esc 收起 */
            if (e.key === "ArrowDown" && showDrop) {
              e.preventDefault();
              setActive((a) => (a + 1) % sugs.length);
            } else if (e.key === "ArrowUp" && showDrop) {
              e.preventDefault();
              setActive((a) => (a - 1 + sugs.length) % sugs.length);
            } else if (e.key === "Escape" && showDrop) {
              setSugs([]);
              setActive(-1);
            }
          }}
          className={`glass-pill backdrop-blur-2xl backdrop-saturate-150 search-pill group absolute inset-x-0 top-0 z-30 flex flex-col overflow-hidden rounded-[28px] transition duration-500 ${
            focused
              ? "scale-[1.015] shadow-[0_10px_50px_-8px_rgba(0,0,0,0.25)] ring-1 ring-zinc-900/15 dark:ring-white/25"
              : ""
          }`}
          style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
        >
          {/* 输入行：恒居顶部、高度锁定；建议列表在其下，由表单 height 动画整体
              揭示。transition 只含默认属性表（不含 height）——禅雾化与聚焦缩放/
              阴影照常，且不与 framer 逐帧内联 height 打架 */}
          <div className="flex h-14 shrink-0 items-center gap-2 px-3">
            {/* 引擎选择 */}
            <Popover.Root>
              <Popover.Trigger
                aria-label="切换搜索引擎"
                className="search-trigger flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-normal tracking-wide text-zinc-500 transition-colors duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <span>{engine.name}</span>
                <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={1.5} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  sideOffset={10}
                  align="start"
                  className="z-50 w-44 overflow-hidden rounded-xl border border-zinc-200/70 bg-white/85 shadow-xl backdrop-blur-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-white/10 dark:bg-[#17171c]/90"
                >
                  <div className="p-1.5">
                    {ENGINES.map((e) => (
                      <Popover.Close
                        key={e.id}
                        onClick={() => onPatchSettings({ engineId: e.id })}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition-colors duration-150 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/10"
                      >
                        <span className="font-light">{e.name}</span>
                        {e.id === settings.engineId && (
                          <Check
                            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                            strokeWidth={1.5}
                          />
                        )}
                      </Popover.Close>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            <span aria-hidden className="h-5 w-px shrink-0 bg-zinc-900/10 dark:bg-white/10" />

            {/* 输入区域 */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={engine.hint}
              enterKeyHint="search"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label="搜索或输入网址"
              aria-expanded={showDrop}
              aria-controls={showDrop ? "search-sug-list" : undefined}
              role="combobox"
              className="search-input h-full min-w-0 flex-1 bg-transparent text-[15px] font-light text-zinc-900 outline-none placeholder:text-zinc-400/90 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />

            {/* 提交按钮 */}
            <button
              type="submit"
              aria-label="开始搜索"
              tabIndex={query.trim() ? 0 : -1}
              className={`search-submit flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                query.trim()
                  ? "bg-zinc-900 text-zinc-50 opacity-100 hover:opacity-80 dark:bg-zinc-100 dark:text-zinc-900"
                  : "-mr-1 opacity-0"
              }`}
            >
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          {/* 建议列表：搜索栏向下拉长的部分。常驻 DOM（v8.7.2 ㊸结构免疫律）：
              显隐走 data-open CSS 过渡（opacity+visibility，globals.css
              .search-sug-list）——无 AnimatePresence 条件重挂、无 framer WAAPI
              opacity，「出现闪动一拍」从结构上不存在；展开首帧行级联入场由
              .sug-cascade 窗口标记承载（v8.7.3，渲染期边沿派生见上）；
              高度揭示统一由表单 height 动画承载，列表自身无 margin 参与，
              收起零残留。首行上缘 hairline 兼作输入行与建议区的分隔线 */}
          <div
            id="search-sug-list"
            role="listbox"
            aria-label="搜索建议"
            aria-hidden={!showDrop}
            data-open={showDrop ? "true" : undefined}
            onMouseLeave={() => setActive(-1)}
            className={`search-sug-list${cascade ? " sug-cascade" : ""}`}
          >
            {sugs.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active ? "true" : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(false, s)}
                onMouseEnter={() => setActive(i)}
                style={{ height: SUG_ROW_H, "--sug-i": i } as CSSProperties}
                className={`search-sug-row flex w-full items-center gap-3 px-4 text-left text-[13px] font-light transition-colors duration-150 ${
                  i === 0
                    ? "border-t border-zinc-900/[0.07] dark:border-white/[0.07]"
                    : ""
                } ${
                  i === active
                    ? "bg-zinc-900/5 text-zinc-900 dark:bg-white/10 dark:text-zinc-50"
                    : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                <Search className="h-3.5 w-3.5 shrink-0 opacity-40" strokeWidth={1.5} />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        </motion.form>
      </div>

      {/* 操作提示：建议关闭时保持原版形态（位于搜索框下方） */}
      {!suggestOn && <SearchHint query={query} above={false} />}
    </div>
  );
}

export default memo(SearchBar);
