/* cb_server.h — 初始音乐桥独立版 HTTP 服务（127.0.0.1 回环） */
#ifndef CB_SERVER_H
#define CB_SERVER_H

#include <windows.h>

#define CB_VERSION     "2.0.2"
#define CB_NAME        "chushi-music-bridge"
#define CB_DEFAULT_PORT 10754
#define CB_PORT_SPAN   10
#define CB_BODY_MAX    (4 * 1024)
#define CB_SNAP_MAX    (64 * 1024)

/* 共享状态（cdp 线程写，server 线程读；锁保护可变部分） */
typedef struct {
    CRITICAL_SECTION lock;
    char  *snap;                /* 最新快照 JSON 文本（malloc，归属本结构） */
    ULONGLONG snap_tick;        /* 快照更新时刻（GetTickCount64） */
    volatile LONG cdp_ok;           /* CDP 已附加到网易云页面 */
    volatile LONG bridge_installed; /* 页内桥 JS 已安装 */
    int   cdp_port;             /* CEF 调试端口（配置/启动参数决定） */
    int   http_port;            /* HTTP 服务实际绑定端口（顺延后） */
    DWORD ncm_pid;
    wchar_t ncm_path[MAX_PATH];
    volatile LONG ncm_running;
    /* 命令队列（单链 FIFO） */
    struct cb_cmd *cmd_head, *cmd_tail;
} cb_state;

extern cb_state g_cb;

void cb_state_init(cb_state *s);
void cb_state_free(cb_state *s);

/* server 线程入口：起 HTTP 服务（10754 起顺延） */
DWORD WINAPI cb_server_thread(LPVOID arg);
int   cb_server_port(void);

/* 供 cdp 线程：压入控制命令（body 为请求原文，内部拷贝）；返回 1=成功 */
int cb_cmd_push(const char *body, int len);
/* 弹出一条命令（调用方 free 返回值）；无命令返回 NULL */
char *cb_cmd_pop(void);

/* 快照更新（拷贝入参） */
void cb_snap_set(const char *snap_json);
/* 取快照（调用方 free）；过期（>4s 未更新）或从未有 → NULL */
char *cb_snap_get(void);
/* 快照年龄 ms；从未有 → 0xFFFFFFFF */
ULONGLONG cb_snap_age(void);

/* 宽字符串 → JSON 字符串体（非 ASCII/控制字符 → \uXXXX） */
void cb_json_escape_w(const wchar_t *w, char *out, size_t cap);

/* attach 诊断状态（cdp 线程写，server 线程读）：
 * state ∈ ok / ws-fail / probe-eval-fail / probe-miss / install-fail /
 *          snap-fail / poll-fail / idle；detail 为最近失败详情（人读） */
void cb_attach_set(const char *state, const char *detail);
void cb_attach_get(char *state, size_t scap, char *detail, size_t dcap);

/* 日志（控制台 + 文件），cb_main.c 实现 */
void cb_log(const char *line);
void cb_logf(const char *fmt, ...);

#endif
