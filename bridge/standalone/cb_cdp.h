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

/* 页面判定探针返回码：非网易云页（eval 成功但判据未命中） */
#define CDP_PROBE_MISS (-1)

/* 会话版 evaluate（flatten 时带 sessionId）；ws_eval 为无会话包装 */
int ws_eval_ex(SOCKET ws, const char *session, const char *expression,
               char *out, size_t out_cap);

/* 端口活性（/json/version 可达即活） */
int cdp_port_alive(int port);

/* ---------- r4：browser flatten 会话通道 ---------- */

/* 一条已打通的 CDP 通道：
 *   mode=flatten → ws 为 browser 端点连接，session_id 为 Target.attachToTarget
 *                  (flatten:true) 返回的会话，evaluate 带 sessionId 字段；
 *   mode=page    → ws 直连页端点，session_id 为空。 */
typedef struct {
    SOCKET ws;
    char   session_id[64];
    int    flatten;          /* 1=flatten 会话 0=page 直连 */
} cdp_chan;

/* 打开一条「eval 可用且为网易云页面」的通道。
 * 优先 browser flatten（/json/version → Target.getTargets 按 orpheus/music.163
 * 选 page → Target.attachToTarget flatten:true → probe 判定），
 * 失败回退页端点直连（/json/list 逐 target probe）。
 * desc 输出页面 url（排障）。返回 1=成功。失败原因进 cdp_last_error()。 */
int cdp_open_target(int port, cdp_chan *ch, char *desc, size_t dcap);

/* 页面判定：返回 1=网易云页（desc=location.href）0=eval 失败 -1=非网易云页 */
int cdp_probe_page(cdp_chan *ch, char *desc, size_t dcap);

/* 在通道上执行 JS（flatten 时自动带 sessionId），语义同 ws_eval。 */
int cdp_eval(cdp_chan *ch, const char *expression, char *out, size_t out_cap);

/* 关闭通道。 */
void cdp_close(cdp_chan *ch);

#endif
