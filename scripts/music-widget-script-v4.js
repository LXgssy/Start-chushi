(function(){
"use strict";
var $=function(id){return document.getElementById(id)};
/* ============================================================
 * v4 generation music panel -- styles & rendering only, zero math.
 * Data plane = host engine chushi.music:
 *   snapshot()/subscribe(cb) -> discrete snapshots (cover, titles,
 *                              parsed lyric structure, duration)
 *   now()                    -> realtime {position, progress, lineIndex,
 *                              wordIndex, wordProgress, fadeMs} aligned
 *                              against plugin truth by the host core
 *   seek(s)/toggle/next/prev -> controls (host re-anchors optimistically)
 * Pause fade (user pipeline): fadeMs is computed by the host core from
 * the current word's timeline at the pause instant; this layer only
 * consumes it (opacity transition, zero layout impact).
 * ============================================================ */
var card=$("card"),sk=$("sk");
var E={aF:$("aF"),t1:$("t1"),t2:$("t2"),t3:$("t3"),bar:$("bar"),th:$("th"),
  tC:$("tC"),tD:$("tD"),ap:$("ap"),dt:$("dt"),yI:$("yI"),nI:$("nI"),
  e1:$("e1"),e2:$("e2"),ly:$("ly"),noteChip:$("noteChip"),noteTxt:$("noteTxt"),updChip:$("updChip"),updTxt:$("updTxt")};
function verLt(a,b){var pa=String(a||"").split("."),pb=String(b||"").split(".");
  for(var i=0;i<3;i++){var x=parseInt(pa[i],10)||0,y=parseInt(pb[i],10)||0;if(x!==y)return x<y}return false}
var H={fl:248,em:92},LY_H=124;
var DEF="asset:cover.svg";
var snap=null,mode="em",lastKey="",drag=false,dragRatio=0;
var lyHold=false; /* lyric height hysteresis: a temporarily missing lyric
   must not collapse the panel (button would visibly jump) */
var lyBox=E.ly,lyInr=null,lyEls=null,lyWords=null,lyActive=-1,lyMode=0,lyKey="__none__",lyRef=null,lyPrevOn=null;
var mus=window.chushi&&window.chushi.music?window.chushi.music:null;
function txt(el,v){if(el.textContent!==v)el.textContent=v}
function fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+":"+(s%60<10?"0":"")+s%60}
function hasLyric(){return !!(snap&&snap.lyric&&snap.lyric.lines&&snap.lyric.lines.length)}
function hFor(){return mode==="fl"&&(hasLyric()||lyHold)?H.fl+LY_H:H[mode]}
function setMode(m){
  mode=m;card.className="card mode-"+m;
  $("em").classList.toggle("hd",m!=="em");
  try{chushi.resize(340,hFor())}catch(e){}
}
function cover(img){
  var src=(snap&&snap.cover)||(snap&&snap.coverUrl)||DEF;
  if(img.__s!==src){img.src=src;img.__s=src}
  img.classList.add("on");
}
/* Lyric DOM: consumes host-parsed lines (t=text tr=translation w=[{s,d,t}]) */
function buildLyric(){
  lyBox.innerHTML="";lyEls=[];lyWords=[];lyActive=-1;lyInr=null;lyPrevOn=null;
  if(!hasLyric()){lyBox.classList.add("hd");lyMode=0;return}
  var lines=snap.lyric.lines;lyMode=snap.lyric.mode;
  lyBox.classList.remove("hd");lyHold=true;
  lyInr=document.createElement("div");lyInr.className="lyin";lyBox.appendChild(lyInr);
  for(var i=0;i<lines.length;i++){
    var L=lines[i],ln=document.createElement("div");
    ln.className="lyline"+(L.w&&L.w.length?"":" gap");
    var ws=[];
    if(lyMode===1&&L.w&&L.w.length){
      for(var j=0;j<L.w.length;j++){
        var sp=document.createElement("span");sp.className="lyw";
        sp.appendChild(document.createTextNode(L.w[j].t));
        var ov=document.createElement("span");ov.className="ov";ov.textContent=L.w[j].t;
        sp.appendChild(ov);
        ln.appendChild(sp);ws.push(sp);
      }
    }else{ln.textContent=L.t||"· · ·"}
    if(L.tr){var sub=document.createElement("div");sub.className="lysub";sub.textContent=L.tr;ln.appendChild(sub)}
    lyInr.appendChild(ln);
    lyEls.push(ln);lyWords.push(ws);
  }
}
/* Discrete snapshot render */
function render(){
  var s=snap;
  if(!s||!s.connected){
    txt(E.e1,"系统媒体待接入");txt(E.e2,"安装 ChuShi SMTC Manager + ChuShi Music API 双插件并播放音乐即自动接入");
    txt(E.ap,"未连接");
    if(mode!=="em")setMode("em");
    return;
  }
  if(!s.title){
    txt(E.e1,"等待播放");txt(E.e2,"在网易云放首歌即会亮起（无需开启网易云自带 SMTC）");
    if(mode!=="em")setMode("em");
    return;
  }
  /* lyric key = rev + presence + lines array reference */
  var lk=(s.lyricRev||"")+(s.lyric?"#1":"#0");
  var lr=s.lyric?s.lyric.lines:null;
  if(lk!==lyKey||lr!==lyRef){lyKey=lk;lyRef=lr;buildLyric();if(mode!=="em")setMode(mode)}
  var key=[s.title,s.artist,s.album,s.app].join("|");
  if(key!==lastKey){
    lastKey=key;
    lyHold=hasLyric();
    if(mode!=="em")setMode(mode);
    var els=[E.t1,E.t2,E.t3];
    for(var i=0;i<els.length;i++){els[i].classList.remove("sw");void els[i].offsetWidth;els[i].classList.add("sw")}
  }
  txt(E.t1,s.title||"未知曲目");
  txt(E.t2,s.artist||"未知艺术家");
  txt(E.t3,s.album||"");
  /* chips: seekNote + honest update attribution (every text maps to a real
     action -- zero tolerance for dead guidance):
     - engine unreachable -> install Manager plugin (auto-manages engine)
     - Music API plugin missing -> install it (progress/lyrics/seek live there)
     - plugin too old -> update both .plugin files */
  var noteOn=!!s.seekNote;
  E.noteChip.classList.toggle("on",noteOn);
  if(noteOn)txt(E.noteTxt,s.seekNote);
  E.updChip.classList.toggle("on",!!s.needsUpdate);
  if(s.needsUpdate){
    if(s.needsBridge){
      txt(E.updTxt,"引擎未运行 · 安装 ChuShi SMTC Manager 插件自动管理，或双击交付包内 Start-Engine.bat");
    }else if(!s.pluginVer){
      txt(E.updTxt,"未装 ChuShi Music API 插件 · 装后重启网易云即有逐字歌词/精确进度/进度条拖动");
    }else{
      txt(E.updTxt,"组件待更新 · 请更新两个 .plugin 至最新版并重启网易云");
    }
  }
  txt(E.ap, s.seekNote ? s.seekNote : ("已连接 · "+(s.pluginVer?"API v"+s.pluginVer:"")+(s.smtcVer?" · 管理 v"+s.smtcVer:"")));
  cover(E.aF);
  var on;
  if(optAt&&Date.now()-optAt<2500&&s.playing!==optP){on=optP}
  else{on=!!s.playing;optAt=0}
  playVisual(on);
  if(mode==="em")setMode("fl");
}
/* rAF loop: pure consumption of host-precomputed state */
function tick(){
  if(snap&&snap.connected&&snap.title&&mode!=="em"){
    if(drag){
      var dw=(dragRatio*100).toFixed(2)+"%";
      E.bar.style.width=dw;E.th.style.left=dw;
      txt(E.tC,fmt(dragRatio*(snap.duration||0)));
    }else{
      var n=mus?mus.now():null;
      if(n){
        var w=(n.progress*100).toFixed(2)+"%";
        E.bar.style.width=w;E.th.style.left=w;
        txt(E.tC,fmt(n.position));txt(E.tD,n.duration>0?fmt(n.duration):"--:--");
        lyricFrame(n);
      }
    }
  }
  requestAnimationFrame(tick);
}
function lyricFrame(n){
  if(!lyEls||!lyEls.length)return;
  var idx=n.lineIndex;
  if(idx!==lyActive){
    if(idx>=0&&idx<lyEls.length){
      lyActive=idx;
      for(var k=0;k<lyEls.length;k++)lyEls[k].classList.toggle("on",k===idx);
      var el=lyEls[idx];
      var target=(lyBox.clientHeight-el.offsetHeight)/2-el.offsetTop;
      if(lyInr)lyInr.style.transform="translateY("+target.toFixed(1)+"px)";
    }
  }
  if(lyMode===1&&lyActive>=0){
    var ws=lyWords[lyActive];
    for(var wI=0;wI<ws.length;wI++){
      var p=wI===n.wordIndex?n.wordProgress:(wI<n.wordIndex?1:0);
      ws[wI].style.setProperty("--p",(p*100).toFixed(1)+"%");
    }
  }
  /* pause fade-out / resume fade-in (fadeMs from host word timeline) */
  var on2=!!n.playing;
  if(on2!==lyPrevOn&&lyInr){
    var fd=Math.max(120,Math.min(420,n.fadeMs||260));
    lyInr.style.transition="transform .55s var(--ez), opacity "+fd+"ms ease";
    lyInr.style.opacity=on2?"1":"0.38";
    lyPrevOn=on2;
  }
}
requestAnimationFrame(tick);
/* controls: optimistic play/pause flip (confirmed by next snapshot) */
var optP=false,optAt=0;
function playVisual(on){
  E.yI.classList.toggle("off",on);E.nI.classList.toggle("off",!on);
  E.dt.classList.toggle("pz",!on);card.classList.toggle("pl",on);
  E.aF.classList.toggle("pz",!on);
}
$("pB").addEventListener("click",function(){
  var cur=(optAt&&Date.now()-optAt<2500)?optP:!!(snap&&snap.playing);
  optP=!cur;optAt=Date.now();playVisual(optP);
  try{mus.toggle()}catch(e){}
});
$("nx").addEventListener("click",function(){try{mus.next()}catch(e){}});
$("pv").addEventListener("click",function(){try{mus.prev()}catch(e){}});
$("cxB").addEventListener("click",function(){try{chushi.close()}catch(e){}});
/* seek: drag preview by ratio, commit on release */
function ratio(e){
  var r=sk.getBoundingClientRect();
  return Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width)));
}
sk.addEventListener("pointerdown",function(e){
  if(!snap||!(snap.duration>0))return;
  drag=true;dragRatio=ratio(e);
  sk.setPointerCapture(e.pointerId);
});
sk.addEventListener("pointermove",function(e){if(drag){
  dragRatio=ratio(e);
  var w=(dragRatio*100).toFixed(2)+"%";
  E.bar.style.width=w;E.th.style.left=w;
  txt(E.tC,fmt(dragRatio*snap.duration));
}},{passive:true});
sk.addEventListener("pointerup",function(){
  if(!drag)return;drag=false;
  if(snap&&snap.duration>0){try{mus.seek(dragRatio*snap.duration)}catch(e){}}
});
/* subscribe (immediate push of current snapshot) */
if(mus){
  try{mus.subscribe(function(s){snap=s;render()})}catch(e){}
}else{
  txt(E.e1,"宿主版本过旧");txt(E.e2,"请更新「初始」后再导入本预设");
}
setMode("em");
})();
