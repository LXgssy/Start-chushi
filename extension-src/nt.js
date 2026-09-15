/* 「初始」新标签页入口跳板（v8.5.4）
   覆盖页必须留在 manifest 里，但顶层不能停在覆盖页 URL —— 否则地址栏隐藏扩展
   地址、且被浏览器抢着聚焦。这里用一次 location.replace（页面自发的顶层导航）
   切到 shell.html：地址栏随即显示 chrome-extension://<id>/shell.html，焦点让给
   页面。用 replace 不用 assign：不在历史里留跳板，后退不会回到它。 */
location.replace("shell.html");
