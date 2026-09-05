/* cb_cdp.h — CEF 调试协议客户端（发现目标 / WS 通道 / 求值） */
#ifndef CB_CDP_H
#define CB_CDP_H

#include <winsock2.h>
#include <windows.h>

/* 连接指定 cdp 端口，列出 page 目标（最多 max 页），
 * wsurl 输出 webSocketDebuggerUrl（截断到 cap-1）。返回命中数（0=失败）。 */
int cdp_list_targets(int port, char wsurls[][256], int max);

/* 连接 wsurl 并完成升级握手。成功返回 socket（调用方 closesocket），失败 INVALID_SOCKET。 */
SOCKET ws_connect(const char *wsurl);

/* 在 ws 通道上执行一段 JS 表达式，取 result.value（字符串）做 JSON 反转义输出到 out。
 * out 调用方保证 ≥ out_cap。返回 1=成功 0=失败。 */
int ws_eval(SOCKET s, const char *expression, char *out, size_t out_cap);

/* 关闭 ws（礼貌发送 close 帧可省——直接半关即可） */
void ws_shutdown(SOCKET s);

/* JS 字符串字面量转义（控制体 → controlText("...") 内嵌；输出纯 ASCII） */
void js_escape_string(const char *in, char *out, size_t cap);
/* JSON 字符串转义（表达式 → CDP 请求体；输出纯 ASCII） */
void json_escape_string(const char *in, char *out, size_t cap);

/* 最近一次 CDP/WS 失败的简短原因（排障用；随每次成功清空）。
 * 供 /api/debug 的 attachDetail 与 bridge.log 输出。 */
const char *cdp_last_error(void);

#endif
