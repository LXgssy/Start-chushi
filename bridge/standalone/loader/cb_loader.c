/*
 * cb_loader.c — msimg32.dll 代理装载器（初始音乐桥独立版组件）
 *
 * 机制与 BetterNCM 相同（ AheadLib 式 msimg32 代理劫持）：放在 cloudmusic.exe
 * 同目录时，Windows DLL 搜索顺序会优先加载它。区别在于本装载器【不做任何
 * CEF 内部 hook】——那是 BetterNCM 随网易云升级失效的根源——只做一件事：
 * 在进程初始化早期把 CEF 调试端口开关追加进 PEB 进程参数的命令行：
 *     --remote-debugging-port=18754 --remote-allow-origins=*
 * 之后 CEF/Chromium 初始化读命令行时即可看到端口开关（对任意启动方式生效：
 * 双击网易云原图标、开机自启、快捷方式皆可）。真正的桥接由 ChuShiBridge.exe 完成。
 *
 * 规则：
 *   - 仅主进程追加（命令行含 --type= 的是 Chromium 子进程，跳过）
 *   - 幂等：命令行已含 --remote-debugging-port 时不重复追加
 *   - 导出转发：5 个 msimg32 导出全部转发到系统 msimg32.dll（懒解析）
 * 编译：x86_64-w64-mingw32-gcc -shared（见 scripts/build-chushibridge.py）
 */
#include <windows.h>
#include <stdio.h>
#include <wchar.h>

#define CDP_PORT_DEFAULT 18754

/* ---------- 懒解析转发 ---------- */

static HMODULE g_real = NULL;
static FARPROC g_fn[5] = { NULL, NULL, NULL, NULL, NULL };
static CRITICAL_SECTION g_lock;
static LONG g_init = 0;

typedef int    (__stdcall *fn_AlphaBlend)(HDC, int, int, int, int, HDC, int, int, int, int, unsigned long);
typedef int    (__stdcall *fn_TransparentBlt)(HDC, int, int, int, int, HDC, int, int, int, int, unsigned int);
typedef int    (__stdcall *fn_GradientFill)(HDC, void *, unsigned long, void *, unsigned long, unsigned long);
typedef void   (__stdcall *fn_vSetDdrawflag)(void);
typedef int    (__stdcall *fn_DllInitialize)(void *);

static const char *g_names[5] = {
    "AlphaBlend", "TransparentBlt", "GradientFill", "vSetDdrawflag", "DllInitialize"
};

static FARPROC resolve(int idx) {
    if (!InterlockedCompareExchange(&g_init, 0, 0)) {
        EnterCriticalSection(&g_lock);
        if (!InterlockedCompareExchange(&g_init, 0, 0)) {
            wchar_t path[MAX_PATH];
            UINT n = GetSystemDirectoryW(path, MAX_PATH);
            if (n && n < MAX_PATH - 16) {
                wcscat_s(path, MAX_PATH, L"\\msimg32.dll");
                g_real = LoadLibraryW(path);
                if (g_real) {
                    for (int i = 0; i < 5; i++) g_fn[i] = GetProcAddress(g_real, g_names[i]);
                }
            }
            InterlockedExchange(&g_init, 1);
        }
        LeaveCriticalSection(&g_lock);
    }
    return g_fn[idx];
}

__declspec(dllexport) int __stdcall cb_AlphaBlend(HDC a, int b, int c, int d, int e, HDC f, int g2, int h, int i, int j, unsigned long k) {
    fn_AlphaBlend fn = (fn_AlphaBlend)resolve(0);
    if (fn) return fn(a, b, c, d, e, f, g2, h, i, j, k);
    return 0;
}
__declspec(dllexport) int __stdcall cb_TransparentBlt(HDC a, int b, int c, int d, int e, HDC f, int g2, int h, int i, int j, unsigned int k) {
    fn_TransparentBlt fn = (fn_TransparentBlt)resolve(1);
    if (fn) return fn(a, b, c, d, e, f, g2, h, i, j, k);
    return 0;
}
__declspec(dllexport) int __stdcall cb_GradientFill(HDC a, void *b, unsigned long c, void *d, unsigned long e, unsigned long f) {
    fn_GradientFill fn = (fn_GradientFill)resolve(2);
    if (fn) return fn(a, b, c, d, e, f);
    return 0;
}
__declspec(dllexport) void __stdcall cb_vSetDdrawflag(void) {
    fn_vSetDdrawflag fn = (fn_vSetDdrawflag)resolve(3);
    if (fn) fn();
}
__declspec(dllexport) int __stdcall cb_DllInitialize(void *a) {
    fn_DllInitialize fn = (fn_DllInitialize)resolve(4);
    if (fn) return fn(a);
    return 1;
}

/* 导出名映射（.def 由构建脚本生成：AlphaBlend=cb_AlphaBlend 等） */

/* ---------- PEB 命令行追加 ---------- */

typedef struct _MY_UNICODE_STRING {
    USHORT Length;
    USHORT MaximumLength;
    PWSTR  Buffer;
} MY_UNICODE_STRING;

/* x64 PEB：ProcessParameters 位于偏移 0x20；RTL_USER_PROCESS_PARAMETERS：CommandLine 偏移 0x70 */
static void *get_peb(void) {
    void *peb = NULL;
#if defined(__x86_64__)
    __asm__ volatile ("movq %%gs:0x60, %0" : "=r"(peb));
#endif
    return peb;
}

static MY_UNICODE_STRING *peb_cmdline(void) {
    unsigned char *p = (unsigned char *)get_peb();
    if (!p) return NULL;
    void *pp = *(void **)(p + 0x20);          /* PEB->ProcessParameters */
    if (!pp) return NULL;
    return (MY_UNICODE_STRING *)((unsigned char *)pp + 0x70);  /* ->CommandLine */
}

static void append_switches(void) {
    MY_UNICODE_STRING *cl = peb_cmdline();
    if (!cl || !cl->Buffer || cl->Length == 0) return;
    /* 子进程跳过 */
    if (wcsstr(cl->Buffer, L"--type=")) return;
    /* 幂等 */
    if (wcsstr(cl->Buffer, L"--remote-debugging-port")) return;

    wchar_t add[96];
    swprintf_s(add, 96, L" --remote-debugging-port=%d --remote-allow-origins=* --chushi-bridge", CDP_PORT_DEFAULT);
    size_t addlen = wcslen(add);

    size_t old_chars = cl->Length / sizeof(wchar_t);
    size_t new_chars = old_chars + addlen;
    size_t new_bytes = (new_chars + 1) * sizeof(wchar_t);

    /* 新缓冲（进程默认堆——此阶段分配安全，且 PEB 参数归进程整个生命周期） */
    PWSTR buf = (PWSTR)HeapAlloc(GetProcessHeap(), 0, new_bytes);
    if (!buf) return;
    memcpy(buf, cl->Buffer, cl->Length);
    memcpy(buf + old_chars, add, addlen * sizeof(wchar_t));
    buf[new_chars] = 0;

    /* 原 MaximumLength 若已足够则原地写（保 Buffer 指针不变，最稳） */
    if ((size_t)cl->MaximumLength >= new_bytes) {
        memcpy(cl->Buffer, buf, new_bytes);
        cl->Length = (USHORT)(new_chars * sizeof(wchar_t));
        HeapFree(GetProcessHeap(), 0, buf);
    } else {
        cl->Buffer = buf;   /* Chromium 每次经 GetCommandLineW 读 PEB，直接换指针即可 */
        cl->Length = (USHORT)(new_chars * sizeof(wchar_t));
        cl->MaximumLength = (USHORT)new_bytes;
    }
}

BOOL WINAPI DllMain(HINSTANCE hinst, DWORD reason, LPVOID reserved) {
    (void)hinst; (void)reserved;
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hinst);
        InitializeCriticalSection(&g_lock);
        append_switches();
    } else if (reason == DLL_PROCESS_DETACH) {
        DeleteCriticalSection(&g_lock);
    }
    return TRUE;
}
