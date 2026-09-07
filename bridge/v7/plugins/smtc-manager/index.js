/* ============================================================================
 * ChuShi SMTC Manager 7.0.0 — 前端探针（native/chushi_smtc_native.dll 的伴生脚本）
 *
 * 职责：
 *   1. 探测本插件原生模块（BetterNCM native_plugin）是否加载成功，
 *      通过 BetterNCM 注册的 ChuShi.Smtc.info 原生 API 读取诊断信息。
 *   2. 通过 window 事件把 SMTC 侧信息广播给音乐桥插件（cc:smtc-info），
 *      桥据此在状态上报中携带 smtcVer / smtc.ready。
 *   3. 绝不播放/暂停/切歌——播放控制一律由音乐桥执行；本文件零控制语义。
 *
 * 本文件不依赖 Node/require（BetterNCM v2 = CEF 渲染环境，无 Node）。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__chushiSmtcManager) return;

  var VER = '7.0.0';
  var state = {
    ver: VER,
    nativeLoaded: false,   // 原生 DLL 是否在渲染进程注册了诊断 API
    hostActive: null,      // 原生 DLL 是否为 SMTC Host 进程
    smtcReady: null,       // SMTC 会话是否建立
    raw: null              // 原生 info 原始 JSON 串
  };
  window.__chushiSmtcManager = state;

  function broadcast() {
    try {
      window.dispatchEvent(new CustomEvent('cc:smtc-info', { detail: JSON.parse(JSON.stringify(state)) }));
    } catch (e) { /* 事件总线不可用则静默 */ }
  }

  function readNativeInfo() {
    try {
      var bn = window.betterncm_native;
      if (!bn || !bn.native_plugin || typeof bn.native_plugin.call !== 'function') return null;
      // 参数形态：[String]，1 个；返回 JSON 字符串
      var ret = bn.native_plugin.call('ChuShi.Smtc.info', ['']);
      if (typeof ret !== 'string' || ret.indexOf('ChuShi SMTC Manager') < 0) return null;
      return JSON.parse(ret);
    } catch (e) {
      return null;
    }
  }

  function probe() {
    var info = readNativeInfo();
    if (info && info.ok === true) {
      var changed = state.nativeLoaded !== true ||
        state.hostActive !== info.host ||
        state.smtcReady !== info.smtcReady;
      state.nativeLoaded = true;
      state.hostActive = info.host === true;
      state.smtcReady = info.smtcReady === true;
      state.raw = info;
      if (changed) broadcast();
      return true;
    }
    if (state.nativeLoaded !== false) {
      state.nativeLoaded = false;
      broadcast();
    }
    return false;
  }

  /* 启动探测：立即 + 早期重试（DLL 线程初始化需要数秒）+ 周期自检 */
  probe();
  [1200, 3000, 6000, 12000].forEach(function (ms) { setTimeout(probe, ms); });
  setInterval(probe, 15000);
})();
