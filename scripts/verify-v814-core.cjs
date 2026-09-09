#!/usr/bin/env node
/* ============================================================================
 * v8.1.4 核心引擎单测：歌词高光三律的宿主侧配套
 *
 * 用户实机反馈（v8.1.3 部件 + 宿主）：
 *   ①「逐字歌词播放完一句，只要没到下一句就持续高亮」——宿主侧根因：
 *     unitizeLine 伪逐字时长铺满行距（lrc 行 e=下一行 s、末行 s+8000），
 *     唱完后扫光仍匀速爬行/停在 100% 直到下一句开始。
 *   ②「回退进度后之前高光过的歌词一直保持高光」——宿主侧配合根因：
 *     alignAt 间奏返回不含已唱界（lastLine），部件只能拿回退前行号当 ref。
 * 本测试驱动真实 __chushiMusicCoreV6（vm 切片 + 假时钟）断言：
 *   伪逐字按字数估算时长 / 下限上限 / 间奏 lastLine / now 透出 / src 标记。
 * ==========================================================================*/
const { readFileSync } = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

const SRC = '/home/z/my-project/public/sandbox.js';
const src = readFileSync(SRC, 'utf8');
const start = src.indexOf('function __chushiMusicCoreV6(hooks)');
let depth = 0, end = -1;
for (let k = src.indexOf('{', start); k < src.length; k++) {
  if (src[k] === '{') depth++;
  else if (src[k] === '}') { depth--; if (!depth) { end = k + 1; break; } }
}

let clock = 2_000_000;
const queue = [];
const sandbox = {
  console, Math, isFinite, String, Number, Boolean, Array, Object, JSON, Promise,
  Date: { now: () => clock },
  setTimeout: (fn) => { queue.push(fn); return 0; }, clearTimeout: () => {},
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);
vm.runInContext('var hooks = { control: function () { return Promise.resolve(true); }, requestSubscribe: function () {} };', sandbox);

function freshCore() {
  const r = vm.runInContext('__chushiMusicCoreV6(hooks)', sandbox);
  clock += 1000;
  return r;
}
function feedLyric(r, lyric) {
  r.feed({
    connected: true,
    track: { app: 'NetEase Music', songId: 42, title: 'T', artist: 'A', album: 'L',
      playing: true, position: 0, duration: 300, rate: 1, coverRev: '', fetchedAt: clock },
    cover: null, coverUrl: '', lyric, lyricRev: 'lyr-1',
    pluginVer: '8.1.4', smtcVer: '3.2.11', seekNote: '',
    cmdLast: null, needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
  });
}

async function main() {
  /* ---- U1 伪逐字时长估算：10 CJK 字行（行距 8s 末行）→ 估 2.6s 而非 8s ---- */
  {
    const r = freshCore();
    feedLyric(r, { yrc: '', lrc: '[00:01.000]一二三四五六七八九十\n[00:09.000]下一句歌词', songId: 42 });
    const ly = r.lyrics();
    ok(ly && ly.mode === 1 && ly.src === 'lrc', 'U1 lrc 解析为伪逐字且带 src:"lrc"', JSON.stringify(ly && ly.src));
    const ln = ly.lines[0];
    const lastEnd = ln.w[ln.w.length - 1].s + ln.w[ln.w.length - 1].d;
    ok(Math.abs(lastEnd - (1000 + 2600)) <= 30, 'U1 末词结束=行起点+估算时长(2600ms)', `end=${lastEnd}（旧行为=${1000 + 8000}）`);
    ok(lastEnd < ln.e - 4000, 'U1 估算时长显著短于行距（唱完即停扫）', `end=${lastEnd} e=${ln.e}`);
  }

  /* ---- U2 伪逐字下限：2 字行估算 <1.2s → 钳到 1.2s ---- */
  {
    const r = freshCore();
    feedLyric(r, { yrc: '', lrc: '[00:01.000]你好\n[00:31.000]很久之后的一句', songId: 42 });
    const ln = r.lyrics().lines[0];
    const lastEnd = ln.w[ln.w.length - 1].s + ln.w[ln.w.length - 1].d;
    ok(Math.abs(lastEnd - (1000 + 1200)) <= 30, 'U2 短行下限 1.2s（扫光不至于一闪而过）', `end=${lastEnd}`);
  }

  /* ---- U3 伪逐字上限：行距小于估算 → 不超过行距（不越进下一句） ---- */
  {
    const r = freshCore();
    feedLyric(r, { yrc: '', lrc: '[00:01.000]一二三四五六七八九十\n[00:03.000]下一句', songId: 42 });
    const ln = r.lyrics().lines[0];
    const lastEnd = ln.w[ln.w.length - 1].s + ln.w[ln.w.length - 1].d;
    ok(Math.abs(lastEnd - 3000) <= 30, 'U3 紧凑行仍铺满行距 2s（上限=行距）', `end=${lastEnd}`);
  }

  /* ---- U4 真逐字（yrc）不受估算影响 + src:"yrc" ---- */
  {
    const r = freshCore();
    const yrc = '[1000,2600](1000,900,0)真(1900,800,0)逐(2700,900,0)字\n[5000,1500](5000,700,0)第(5700,800,0)二(6500,700,0)句';
    feedLyric(r, { yrc, lrc: '', songId: 42 });
    const ly = r.lyrics();
    ok(ly.src === 'yrc', 'U4 yrc 解析带 src:"yrc"', JSON.stringify(ly.src));
    const ln = ly.lines[0];
    ok(ln.e === 3600, 'U4 yrc 行 e 仍为词级真值（s+d）', `e=${ln.e}`);
  }

  /* ---- U5 间奏 lastLine：yrc 行间真 gap 越过行尾+200ms → lastLine=已唱行 ----
     （lrc 行 e=下一行 s，行尾后即下一行——行间间奏只存在于 yrc/末行尾声） */
  {
    const r = freshCore();
    const yrc = '[1000,1500](1000,700,0)第(1700,800,0)一\n[8000,1500](8000,700,0)第(8700,800,0)二';
    feedLyric(r, { yrc, lrc: '', songId: 42 });
    clock += 1000;
    r.tick({ position: 4.0, playing: true, fetchedAt: clock }); /* 行0(e=2.5) 尾后 1.5s：真间奏 */
    const n = r.now();
    ok(n.lineIndex === -1, 'U5 行尾后进入间奏态', `lineIndex=${n.lineIndex}`);
    ok(n.lastLine === 0, 'U5 间奏携带 lastLine=0（已唱界）', `lastLine=${n.lastLine}`);
    clock += 1000;
    r.tick({ position: 9.0, playing: true, fetchedAt: clock }); /* 前进到行 1 内 */
    const n2 = r.now();
    ok(n2.lineIndex === 1 && n2.wordIndex >= 0, 'U5 行内定位正常', `line=${n2.lineIndex} wi=${n2.wordIndex}`);
    clock += 1000;
    r.tick({ position: 4.0, playing: true, fetchedAt: clock }); /* 大幅回退 6s：越过熔断带诚实放行 */
    const n3 = r.now();
    ok(n3.lineIndex === -1 && n3.lastLine === 0, 'U5 回退落间奏 lastLine 跟随新位置', `line=${n3.lineIndex} last=${n3.lastLine}`);
  }

  /* ---- U6 快照 lyric 透传 src（部件判定通道） ---- */
  {
    const r = freshCore();
    feedLyric(r, { yrc: '', lrc: '[00:01.000]一句', songId: 42 });
    const snap = r.snapshot();
    ok(snap.lyric && snap.lyric.src === 'lrc', 'U6 snapshot.lyric.src="lrc"', JSON.stringify(snap.lyric && snap.lyric.src));
    ok(typeof snap.lyric.lines[0].w === 'object' && snap.lyric.lines[0].w.length > 0, 'U6 伪逐字行带 w 时间轴');
  }

  /* ---- U7 行内定位不受估算影响（词二分仍按新时间轴工作） ---- */
  {
    const r = freshCore();
    feedLyric(r, { yrc: '', lrc: '[00:01.000]一二三四五六七八九十\n[00:09.000]下一句歌词', songId: 42 });
    r.tick({ position: 1.0 + 1.3, playing: true, fetchedAt: clock }); /* 估算时长 2.6s 的中段 */
    const n = r.now();
    ok(n.lineIndex === 0 && n.wordIndex >= 3 && n.wordIndex <= 6, 'U7 估算时间轴中段词定位合理', `wi=${n.wordIndex} wp=${n.wordProgress.toFixed(2)}`);
    r.tick({ position: 1.0 + 2.8, playing: true, fetchedAt: clock }); /* 估算时长已过、行距未过 */
    const n2 = r.now();
    ok(n2.lineIndex === 0 && n2.wordIndex === n2.lineIndex + 9 && n2.wordProgress >= 1, 'U7 估算时长后词进度定格 100%（部件渐隐律输入）', `wi=${n2.wordIndex} wp=${n2.wordProgress}`);
  }

  console.log('\n========================================================');
  console.log(`v8.1.4 歌词宿主配套单测: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
