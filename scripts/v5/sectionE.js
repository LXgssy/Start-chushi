/* ---------- 沙箱小部件模式（?mode=widget，v1.0.7 角落磁贴 / v1.8.2 dock 弹出面板）----------
 * 作为小部件的「沙箱宿主」：接收应用层 renderWidget（含主题/强调色/panelMode），
 * 把 HTML 写进嵌套的 srcdoc iframe（sandbox="allow-scripts"，不透明源），并把
 * 部件内 chushi API（notify/open/storage/resize/close）带上 widgetKey 中继回应用层；
 * 应用层回传的 storage 结果与主题变更反向下发进部件。
 * panelMode（v1.8.2）：dock 表面部件以面板形态渲染，置 dataset.panel=1。
 * v5：音乐引擎核心经 Function.toString() 原文内嵌（同一份源码，两通道零漂移）。 */
function widgetShim(theme, accent, panelMode) {
  var accentSet = /^#[0-9a-fA-F]{3,8}$/.test(accent || "")
    ? "document.documentElement.style.setProperty('--w-accent','" + accent + "');"
    : "";
  var musicSrc =
    "var __music=(" + __chushiMusicCoreV5.toString() + ")({" +
    "control:function(c,p){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcControl'};" +
    "post({type:'widgetApi',op:'smtcControl',cmd:String(c||'').slice(0,8)," +
    "position:(typeof p==='number'&&isFinite(p))?p:null,reqId:id})})}," +
    "requestSubscribe:function(){post({type:'widgetApi',op:'smtcSubscribe'})}});";
  return (
    "<script>(function(){var seq=0,pending={};function post(m){try{parent.postMessage(m,'*')}catch(e){}}" +
    "document.documentElement.dataset.theme='" + (theme === "dark" ? "dark" : "light") + "';" +
    (panelMode ? "document.documentElement.dataset.panel='1';" : "") +
    accentSet +
    "var smtcCbs=[];var lastSmtc=null;" +
    musicSrc +
    "window.chushi={notify:function(o){o=o||{};post({type:'widgetApi',op:'notify'," +
    "title:String(o.title||'').slice(0,24),description:String(o.description||'').slice(0,60)})}," +
    "open:function(u){post({type:'widgetApi',op:'open',url:String(u||'').slice(0,500)})}," +
    "close:function(){post({type:'widgetApi',op:'closePanel'})}," +
    "resize:function(w,h){post({type:'widgetApi',op:'resize',width:+w||0,height:+h||0})}," +
    "storage:{get:function(k){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageGet'};" +
    "post({type:'widgetApi',op:'storageGet',key:String(k||'').slice(0,64),reqId:id})})}," +
    "set:function(k,v){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'storageSet'};var s='';" +
    "try{var j=JSON.stringify(v);s=j==null?'':j}catch(e){}" +
    "post({type:'widgetApi',op:'storageSet',key:String(k||'').slice(0,64),value:s.slice(0,4000),reqId:id})})}}," +
    "smtc:{get:function(){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcGet'};" +
    "post({type:'widgetApi',op:'smtcGet',reqId:id})})}," +
    "control:function(c,p){return new Promise(function(res){var id=++seq;pending[id]={f:res,op:'smtcControl'};" +
    "post({type:'widgetApi',op:'smtcControl',cmd:String(c||'').slice(0,8)," +
    "position:(typeof p==='number'&&isFinite(p))?p:null,reqId:id})})}," +
    "subscribe:function(cb){if(typeof cb!=='function')return function(){};smtcCbs.push(cb);" +
    "post({type:'widgetApi',op:'smtcSubscribe'});return function(){var i=smtcCbs.indexOf(cb);" +
    "if(i>=0)smtcCbs.splice(i,1)}}}," +
    "music:{snapshot:function(){return __music.snapshot()},now:function(){return __music.now()}," +
    "lyrics:function(){return __music.lyrics()},subscribe:__music.subscribe,seek:__music.seek," +
    "play:__music.play,pause:__music.pause,toggle:__music.toggle,next:__music.next,prev:__music.prev}};" +
    "window.addEventListener('message',function(ev){var d=ev.data;if(!d||typeof d!=='object')return;" +
    "if(d.type==='widgetStorage'){var p=pending[d.reqId];if(!p)return;delete pending[d.reqId];" +
    "if(p.op==='storageGet'){var v=null;if(typeof d.value==='string'&&d.value.length){try{v=JSON.parse(d.value)}catch(e){v=d.value}}p.f(v)}else{p.f(d.ok===true)}};" +
    "if(d.type==='widgetSmtcResult'){var pc=pending[d.reqId];if(!pc)return;delete pending[d.reqId];pc.f(d.ok===true)};" +
    "if(d.type==='widgetSmtc'){var s=d.state&&typeof d.state==='object'?d.state:null;" +
    "lastSmtc=s;__music.feed(s);" +
    "for(var i=smtcCbs.length-1;i>=0;i--){try{smtcCbs[i](s)}catch(e){}}};" +
    "if(d.type==='widgetSmtcTick'){var tk=d.tick&&typeof d.tick==='object'?d.tick:null;" +
    "if(tk&&lastSmtc&&lastSmtc.track){" +
    "if(typeof tk.position==='number')lastSmtc.track.position=tk.position;" +
    "if(typeof tk.duration==='number')lastSmtc.track.duration=tk.duration;" +
    "if(typeof tk.playing==='boolean')lastSmtc.track.playing=tk.playing;" +
    "if(typeof tk.rate==='number')lastSmtc.track.rate=tk.rate;" +
    "if(typeof tk.fetchedAt==='number')lastSmtc.track.fetchedAt=tk.fetchedAt;" +
    "__music.tick(tk);" +
    "for(var i=smtcCbs.length-1;i>=0;i--){try{smtcCbs[i](lastSmtc)}catch(e){}}}};" +
    "if(d.type==='widgetTheme'){document.documentElement.dataset.theme=d.theme==='dark'?'dark':'light';" +
    "if(d.accent)document.documentElement.style.setProperty('--w-accent',d.accent)}});" +
    "})();</script>"
  );
}
