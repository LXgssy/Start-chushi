/* =========================================================================
 * ChuShi SMTC Broker (v7.1.0) — 独立 SMTC 进程
 * -------------------------------------------------------------------------
 * v7.1.0 架构律（终局教训）：WinRT 绝不进宿主进程。
 *   v7.0.x 把 SMTC 会话建在网易云进程内，四代修复后仍崩宿主：
 *   v7.0.0 缺 apartment 初始化（combase AV）→ v7.0.1 TimelineProperties
 *   误判值类型栈传（WMM AV）→ v7.0.2 ABI 全对（windows-rs 逐槽位核实）
 *   仍崩：RoActivateInstance(TimelineProperties) 成功后对系统对象 QI 时
 *   AV 于 Windows.Media.MediaControl.dll 内部 —— 系统侧路径崩，只能是宿主
 *   进程内 COM 环境被污染（网易云自身 SMTC 会话/其它插件共存）。
 *   本版把全部 WinRT 工作搬进本独立进程：宿主进程零 WinRT，结构上不可能
 *   再崩宿主；本进程即使异常也只自杀退出（无 WER 弹窗），由监督者重启。
 * 职责：
 *   1. STA + 隐藏窗口 + GetForWindow 注册系统媒体会话（Firefox 同款序列）
 *   2. HTTP 枢纽 127.0.0.1:26901/26902/26903（协议与 v7.0.2 完全一致，
 *      插件B/新标签页零改动）：state/lyric/cmd/smtc.update/smtc.events...
 *   3. 元数据/状态/时间线落 SMTC；媒体键与系统拖动事件回吐队列
 *   4. 时间线对象 = 自实现 CCW（TpObj）——绝不再激活 TimelineProperties
 *      系统类（v7.0.2 崩溃路径，整体绕开）
 *   5. 每步 HRESULT 检查 + SEH 全包裹；致命异常 = 记日志后干净退出(2)
 *   6. --parent <pid> 看门狗：父进程（网易云）死亡即退出
 *   7. 单实例互斥体；--log 指定日志路径
 * ========================================================================== */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <objbase.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>
#include <stddef.h>


#pragma comment(lib, "user32")
#pragma comment(lib, "kernel32")
#pragma comment(lib, "ws2_32")
#pragma comment(lib, "ole32")

#define BROKER_VERSION "7.2.0"
#define HUB_NAME       "chushi-smtc-hub"
#define MUTEX_NAMEW    L"ChuShi.Smtc.Broker.v1"
#define WINDOW_CLASSW  L"ChuShiSmtcBrokerWnd"
#define HTTP_PORTS     { 26901, 26902, 26903 }

/* ------------------------------------------------------------------ */
/* WinRT 基础（IID/槽位序与 v7.0.2 一致，已对照 windows-rs 逐项核实）      */
/* ------------------------------------------------------------------ */

typedef unsigned char BOOL08;
typedef long LONG_;
typedef unsigned long ULONG_;
typedef long long INT64_;

#define DEFINE_GUID_CONST(name, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8) \
    static const GUID name = { l, w1, w2, { b1, b2, b3, b4, b5, b6, b7, b8 } }

DEFINE_GUID_CONST(IID_IUnknown,    0x00000000,0x0000,0x0000,0xC0,0x00,0x00,0x00,0x00,0x00,0x00,0x46);
DEFINE_GUID_CONST(IID_IInspectable,0xAF86E2E0,0xB12D,0x4C6A,0x9C,0x5A,0xD7,0xAA,0x65,0x10,0x1E,0x90);
DEFINE_GUID_CONST(IID_IMarshal,    0x00000003,0x0000,0x0000,0xC0,0x00,0x00,0x00,0x00,0x00,0x00,0x46);
DEFINE_GUID_CONST(IID_SMTC,            0x99FA3FF4,0x1742,0x42A6,0x90,0x2E,0x08,0x7D,0x41,0xF9,0x65,0xEC);
DEFINE_GUID_CONST(IID_SMTC2,           0xEA98D2F6,0x7F3C,0x4AF2,0xA5,0x86,0x72,0x88,0x98,0x08,0xEF,0xB1);
DEFINE_GUID_CONST(IID_SMTCDisplayUpdater, 0x8ABBC53E,0xFA55,0x4ECF,0xAD,0x8E,0xC9,0x84,0xE5,0xDD,0x15,0x50);
DEFINE_GUID_CONST(IID_MusicDisplayProperties,  0x6BBF0C59,0xD0A0,0x4D26,0x92,0xA0,0xF9,0x78,0xE1,0xD1,0x8E,0x7B);
DEFINE_GUID_CONST(IID_MusicDisplayProperties2, 0x00368462,0x97D3,0x44B9,0xB0,0x0F,0x00,0x8A,0xFC,0xEF,0xAF,0x18);
DEFINE_GUID_CONST(IID_SMTCButtonPressedEventArgs, 0xB7F47116,0xA56F,0x4DC8,0x9E,0x11,0x92,0x03,0x1F,0x4A,0x87,0xC2);
DEFINE_GUID_CONST(IID_PlaybackPositionChangeRequestedEventArgs, 0xB4493F88,0xEB28,0x4961,0x9C,0x14,0x33,0x5E,0x44,0xF3,0xE1,0x25);
DEFINE_GUID_CONST(IID_SMTCInterop, 0xDDB0472D,0xC911,0x4A1F,0x86,0xD9,0xDC,0x3D,0x71,0xA9,0x5F,0x5A);
DEFINE_GUID_CONST(IID_TimelineProps, 0x5125316A,0xC3A2,0x475B,0x85,0x07,0x93,0x53,0x4D,0xC8,0x8F,0x15);
DEFINE_GUID_CONST(IID_IAgileObject, 0x94EA2B94,0xE9CC,0x49E0,0xC0,0xFF,0xEE,0x64,0xCA,0x8F,0x5B,0x90);
DEFINE_GUID_CONST(IID_HandlerButtonPressed, 0x0557E996,0x7B23,0x5BAE,0xAA,0x81,0xEA,0x0D,0x67,0x11,0x43,0xA4);
DEFINE_GUID_CONST(IID_HandlerPositionChange,0x44E34F15,0xBDC0,0x50A7,0xAC,0xE4,0x39,0xE9,0x1F,0xB7,0x53,0xF1);
DEFINE_GUID_CONST(IID_UriRuntimeClassFactory, 0x44A9796F,0x723E,0x4FDF,0xA2,0x18,0x03,0x3E,0x75,0xB0,0xC0,0x84);
DEFINE_GUID_CONST(IID_RandomAccessStreamReferenceStatics, 0x857309DC,0x3FBF,0x4E7D,0x98,0x6F,0xEF,0x3B,0x1A,0x07,0xA9,0x64);

static const wchar_t* CLSID_SMTC      = L"Windows.Media.SystemMediaTransportControls";
static const wchar_t* CLSID_URI       = L"Windows.Foundation.Uri";
static const wchar_t* CLSID_STREAMREF = L"Windows.Storage.Streams.RandomAccessStreamReference";

enum { MediaPlaybackType_Unknown = 0, MediaPlaybackType_Music = 1 };
enum { MediaPlaybackStatus_Closed = 0, MediaPlaybackStatus_Changing = 1,
       MediaPlaybackStatus_Stopped = 2, MediaPlaybackStatus_Playing = 3,
       MediaPlaybackStatus_Paused = 4 };
enum { SMTCBTN_Play = 0, SMTCBTN_Pause = 1, SMTCBTN_Stop = 2, SMTCBTN_Record = 3,
       SMTCBTN_FastForward = 4, SMTCBTN_Rewind = 5, SMTCBTN_Next = 6,
       SMTCBTN_Previous = 7, SMTCBTN_ChannelUp = 8, SMTCBTN_ChannelDown = 9 };

typedef struct TimeSpan { INT64_ Duration; } TimeSpan;
typedef struct EventToken { INT64_ value; } EventToken;

typedef long HRESULT_;
#define S_OK_     ((HRESULT_)0)
#define FAILED_(hr) (((HRESULT_)(hr)) < 0)
#define SUCCEEDED_(hr) (((HRESULT_)(hr)) >= 0)
#define E_NOINTERFACE_ ((HRESULT_)0x80004002L)

typedef HSTR HSTR_;
typedef UINT32 UINT32_;

/* combase 动态加载 */
typedef HRESULT_ (WINAPI *PFN_RoInitialize)(int initType);
typedef HRESULT_ (WINAPI *PFN_RoGetActivationFactory)(HSTR_ classId, const GUID* iid, void** factory);
typedef HRESULT_ (WINAPI *PFN_WindowsCreateString)(const wchar_t* src, UINT32_ len, HSTR_* out);
typedef HRESULT_ (WINAPI *PFN_WindowsDeleteString)(HSTR_ s);
static PFN_RoInitialize              pRoInitialize;
static PFN_RoGetActivationFactory    pRoGetActivationFactory;
static PFN_WindowsCreateString       pWindowsCreateString;
static PFN_WindowsDeleteString       pWindowsDeleteString;

void Queue_SmtcEventButton(int btn);
void Queue_SmtcEventSeek(double posSec);
static HSTR_ mk_hstr(const wchar_t* s);
static double atof_n(const wchar_t* s);
static int atoi_n(const wchar_t* s);

/* v7.2.0 事件 raise 可观测性：前 20 条全记，之后每 50 条记 1 条 */
static void logf_line(const char* fmt, ...);
static volatile LONG_ g_evtSeen = 0;
static void evt_log(const char* what, int v) {
    long n = InterlockedIncrement(&g_evtSeen);
    if (n <= 20 || (n % 50) == 0)
        logf_line("[evt] %s=%d (seen=%ld)", what, v, n);
}

/* ------------------------------------------------------------------ */
/* vtable（槽位序 = windows-rs 投影，逐槽位核实）                          */
/* ------------------------------------------------------------------ */

typedef struct InspectableVtbl {
    HRESULT_ (WINAPI *QueryInterface)(void* self, const GUID* riid, void** out);
    ULONG_   (WINAPI *AddRef)(void* self);
    ULONG_   (WINAPI *Release)(void* self);
    HRESULT_ (WINAPI *GetIids)(void* self, ULONG_* count, GUID** iids);
    HRESULT_ (WINAPI *GetRuntimeClassName)(void* self, HSTR_* name);
    HRESULT_ (WINAPI *GetTrustLevel)(void* self, int* level);
} InspectableVtbl;

typedef struct SMTCVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_PlaybackStatus)(void*, int* value);
    HRESULT_ (WINAPI *put_PlaybackStatus)(void*, int value);
    HRESULT_ (WINAPI *get_DisplayUpdater)(void*, void** value);
    HRESULT_ (WINAPI *get_SoundLevel)(void*, int* value);
    HRESULT_ (WINAPI *get_IsEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsPlayEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsPlayEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsStopEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsStopEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsPauseEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsPauseEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsRecordEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsRecordEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsFastForwardEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsFastForwardEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsRewindEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsRewindEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsPreviousEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsPreviousEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsNextEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsNextEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsChannelUpEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsChannelUpEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_IsChannelDownEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_IsChannelDownEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *add_ButtonPressed)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_ButtonPressed)(void*, EventToken token);
    HRESULT_ (WINAPI *add_PropertyChanged)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_PropertyChanged)(void*, EventToken token);
} SMTCVtbl;

typedef struct SMTC2Vtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_AutoRepeatMode)(void*, int* value);
    HRESULT_ (WINAPI *put_AutoRepeatMode)(void*, int value);
    HRESULT_ (WINAPI *get_ShuffleEnabled)(void*, BOOL08* value);
    HRESULT_ (WINAPI *put_ShuffleEnabled)(void*, BOOL08 value);
    HRESULT_ (WINAPI *get_PlaybackRate)(void*, double* value);
    HRESULT_ (WINAPI *put_PlaybackRate)(void*, double value);
    HRESULT_ (WINAPI *UpdateTimelineProperties)(void*, void* timelineProperties);
    HRESULT_ (WINAPI *add_PlaybackPositionChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_PlaybackPositionChangeRequested)(void*, EventToken token);
    HRESULT_ (WINAPI *add_PlaybackRateChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_PlaybackRateChangeRequested)(void*, EventToken token);
    HRESULT_ (WINAPI *add_ShuffleEnabledChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_ShuffleEnabledChangeRequested)(void*, EventToken token);
    HRESULT_ (WINAPI *add_AutoRepeatModeChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT_ (WINAPI *remove_AutoRepeatModeChangeRequested)(void*, EventToken token);
} SMTC2Vtbl;

typedef struct DisplayUpdaterVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_Type)(void*, int* value);
    HRESULT_ (WINAPI *put_Type)(void*, int value);
    HRESULT_ (WINAPI *get_AppMediaId)(void*, HSTR_* value);
    HRESULT_ (WINAPI *put_AppMediaId)(void*, HSTR_ value);
    HRESULT_ (WINAPI *get_Thumbnail)(void*, void** value);
    HRESULT_ (WINAPI *put_Thumbnail)(void*, void* value);
    HRESULT_ (WINAPI *get_MusicProperties)(void*, void** value);
    HRESULT_ (WINAPI *get_VideoProperties)(void*, void** value);
    HRESULT_ (WINAPI *get_ImageProperties)(void*, void** value);
    HRESULT_ (WINAPI *CopyFromFileAsync)(void*, int type, void* source, void** operation);
    HRESULT_ (WINAPI *ClearAll)(void*);
    HRESULT_ (WINAPI *Update)(void*);
} DisplayUpdaterVtbl;

typedef struct MusicPropsVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_Title)(void*, HSTR_* value);
    HRESULT_ (WINAPI *put_Title)(void*, HSTR_ value);
    HRESULT_ (WINAPI *get_AlbumArtist)(void*, HSTR_* value);
    HRESULT_ (WINAPI *put_AlbumArtist)(void*, HSTR_ value);
    HRESULT_ (WINAPI *get_Artist)(void*, HSTR_* value);
    HRESULT_ (WINAPI *put_Artist)(void*, HSTR_ value);
} MusicPropsVtbl;

typedef struct MusicProps2Vtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_AlbumTitle)(void*, HSTR_* value);
    HRESULT_ (WINAPI *put_AlbumTitle)(void*, HSTR_ value);
    HRESULT_ (WINAPI *get_TrackNumber)(void*, UINT32_* value);
    HRESULT_ (WINAPI *put_TrackNumber)(void*, UINT32_ value);
    HRESULT_ (WINAPI *get_Genres)(void*, void** value);
} MusicProps2Vtbl;

typedef struct TimelinePropsVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_StartTime)(void*, TimeSpan* value);
    HRESULT_ (WINAPI *put_StartTime)(void*, TimeSpan value);
    HRESULT_ (WINAPI *get_EndTime)(void*, TimeSpan* value);
    HRESULT_ (WINAPI *put_EndTime)(void*, TimeSpan value);
    HRESULT_ (WINAPI *get_MinSeekTime)(void*, TimeSpan* value);
    HRESULT_ (WINAPI *put_MinSeekTime)(void*, TimeSpan value);
    HRESULT_ (WINAPI *get_MaxSeekTime)(void*, TimeSpan* value);
    HRESULT_ (WINAPI *put_MaxSeekTime)(void*, TimeSpan value);
    HRESULT_ (WINAPI *get_Position)(void*, TimeSpan* value);
    HRESULT_ (WINAPI *put_Position)(void*, TimeSpan value);
} TimelinePropsVtbl;

typedef struct ButtonPressedArgsVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_Button)(void*, int* value);
} ButtonPressedArgsVtbl;

typedef struct PositionArgsVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *get_RequestedPlaybackPosition)(void*, TimeSpan* value);
} PositionArgsVtbl;

typedef struct InteropVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *GetForWindow)(void* self, HWND window, const GUID* riid, void** out);
} InteropVtbl;

typedef struct UriFactoryVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *CreateUri)(void* self, HSTR_ uri, void** instance);
    HRESULT_ (WINAPI *CreateWithRelativeUri)(void* self, HSTR_ baseUri, HSTR_ relativeUri, void** instance);
} UriFactoryVtbl;

typedef struct StreamRefStaticsVtbl {
    InspectableVtbl ins;
    HRESULT_ (WINAPI *CreateFromFile)(void* self, void* file, void** ref);
    HRESULT_ (WINAPI *CreateFromUri)(void* self, void* uri, void** ref);
    HRESULT_ (WINAPI *CreateFromStream)(void* self, void* stream, void** ref);
} StreamRefStaticsVtbl;

/* ------------------------------------------------------------------ */
/* 日志（exe 同目录 broker-log.txt 或 --log 指定）                        */
/* ------------------------------------------------------------------ */

static char g_logPathA[MAX_PATH * 2];

static void logf_line(const char* fmt, ...) {
    FILE* f;
    SYSTEMTIME st;
    va_list ap;
    if (!g_logPathA[0]) return;
    f = fopen(g_logPathA, "ab");
    if (!f) return;
    GetLocalTime(&st);
    fprintf(f, "[%02u-%02u %02u:%02u:%02u.%03u][pid %lu] ",
        st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, st.wMilliseconds,
        (unsigned long)GetCurrentProcessId());
    va_start(ap, fmt);
    vfprintf(f, fmt, ap);
    va_end(ap);
    fputc('\n', f);
    fclose(f);
}

/* ------------------------------------------------------------------ */
/* ABI 静态断言（编译期证明 vtable 槽位 = windows-rs 投影布局）             */
/*   比 objdump 反汇编模式匹配更强：任何布局漂移直接编译失败。              */
/* ------------------------------------------------------------------ */
_Static_assert(offsetof(SMTCVtbl, get_DisplayUpdater) == 0x40, "SMTC.get_DisplayUpdater @0x40");
_Static_assert(offsetof(SMTCVtbl, put_IsEnabled) == 0x58, "SMTC.put_IsEnabled @0x58");
_Static_assert(offsetof(SMTCVtbl, put_PlaybackStatus) == 0x38, "SMTC.put_PlaybackStatus @0x38");
_Static_assert(offsetof(SMTCVtbl, add_ButtonPressed) == 0x100, "SMTC.add_ButtonPressed @0x100");
_Static_assert(offsetof(SMTC2Vtbl, UpdateTimelineProperties) == 0x60, "SMTC2.UpdateTimelineProperties @0x60");
_Static_assert(offsetof(SMTC2Vtbl, add_PlaybackPositionChangeRequested) == 0x68, "SMTC2.add_PositionChangeReq @0x68");
_Static_assert(offsetof(DisplayUpdaterVtbl, put_Type) == 0x38, "DisplayUpdater.put_Type @0x38");
_Static_assert(offsetof(DisplayUpdaterVtbl, put_Thumbnail) == 0x58, "DisplayUpdater.put_Thumbnail @0x58");
_Static_assert(offsetof(DisplayUpdaterVtbl, get_MusicProperties) == 0x60, "DisplayUpdater.get_MusicProperties @0x60");
_Static_assert(offsetof(DisplayUpdaterVtbl, Update) == 0x88, "DisplayUpdater.Update @0x88");
_Static_assert(offsetof(MusicPropsVtbl, put_Title) == 0x38, "MusicProps.put_Title @0x38");
_Static_assert(offsetof(MusicPropsVtbl, put_Artist) == 0x58, "MusicProps.put_Artist @0x58");
_Static_assert(offsetof(MusicProps2Vtbl, put_AlbumTitle) == 0x38, "MusicProps2.put_AlbumTitle @0x38");
_Static_assert(offsetof(TimelinePropsVtbl, put_StartTime) == 0x38, "TimelineProps.put_StartTime @0x38");
_Static_assert(offsetof(TimelinePropsVtbl, put_EndTime) == 0x48, "TimelineProps.put_EndTime @0x48");
_Static_assert(offsetof(TimelinePropsVtbl, put_MinSeekTime) == 0x58, "TimelineProps.put_MinSeekTime @0x58");
_Static_assert(offsetof(TimelinePropsVtbl, put_MaxSeekTime) == 0x68, "TimelineProps.put_MaxSeekTime @0x68");
_Static_assert(offsetof(TimelinePropsVtbl, put_Position) == 0x78, "TimelineProps.put_Position @0x78");
_Static_assert(offsetof(ButtonPressedArgsVtbl, get_Button) == 0x30, "ButtonArgs.get_Button @0x30");
_Static_assert(offsetof(PositionArgsVtbl, get_RequestedPlaybackPosition) == 0x30, "PositionArgs.get_ReqPos @0x30");
_Static_assert(offsetof(InteropVtbl, GetForWindow) == 0x30, "Interop.GetForWindow @0x30");
_Static_assert(offsetof(UriFactoryVtbl, CreateUri) == 0x30, "UriFactory.CreateUri @0x30");
_Static_assert(offsetof(StreamRefStaticsVtbl, CreateFromUri) == 0x38, "StreamRefStatics.CreateFromUri @0x38");

/* ------------------------------------------------------------------ */
/* 事件 handler CCW（IAgileObject + IMarshal→FTM，真 agile）               */
/* ------------------------------------------------------------------ */

typedef struct HandlerVtbl {
    HRESULT_ (WINAPI *QueryInterface)(void* self, const GUID* riid, void** out);
    ULONG_   (WINAPI *AddRef)(void* self);
    ULONG_   (WINAPI *Release)(void* self);
    HRESULT_ (WINAPI *GetIids)(void* self, ULONG_* count, GUID** iids);
    HRESULT_ (WINAPI *GetRuntimeClassName)(void* self, HSTR_* name);
    HRESULT_ (WINAPI *GetTrustLevel)(void* self, int* level);
    HRESULT_ (WINAPI *Invoke)(void* self, void* sender, void* args);
} HandlerVtbl;

typedef struct HandlerObj {
    HandlerVtbl* vtbl;
    volatile LONG_ refs;
    int kind; /* 0 = button, 1 = position */
} HandlerObj;

static IUnknown* g_ftm = NULL; /* free-threaded marshaler（agile 正规军） */

static HRESULT_ WINAPI h_QI(void* self, const GUID* riid, void** out) {
    HandlerObj* h = (HandlerObj*)self;
    if (!out) return E_NOINTERFACE_;
    *out = NULL;
    if (!riid) return E_NOINTERFACE_;
    if (memcmp(riid, &IID_IMarshal, sizeof(GUID)) == 0 && g_ftm) {
        return ((InspectableVtbl*)(*(void**)g_ftm))->QueryInterface(g_ftm, riid, out);
    }
    if (memcmp(riid, &IID_IUnknown, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IInspectable, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IAgileObject, sizeof(GUID)) == 0 ||
        (h->kind == 0 && memcmp(riid, &IID_HandlerButtonPressed, sizeof(GUID)) == 0) ||
        (h->kind == 1 && memcmp(riid, &IID_HandlerPositionChange, sizeof(GUID)) == 0)) {
        InterlockedIncrement(&h->refs);
        *out = self;
        return S_OK_;
    }
    return E_NOINTERFACE_;
}
static ULONG_ WINAPI h_AddRef(void* self) { return InterlockedIncrement(&((HandlerObj*)self)->refs); }
static ULONG_ WINAPI h_Release(void* self) {
    /* 与进程同生命周期，永不真释放 */
    return InterlockedDecrement(&((HandlerObj*)self)->refs);
}
static HRESULT_ WINAPI h_GetIids(void* self, ULONG_* count, GUID** iids) {
    (void)self; if (count) *count = 0; if (iids) *iids = NULL; return S_OK_;
}
static HRESULT_ WINAPI h_GetRuntimeClassName(void* self, HSTR_* name) {
    (void)self; if (name) *name = NULL; return (HRESULT_)0x80004001L; /* E_NOTIMPL */
}
static HRESULT_ WINAPI h_GetTrustLevel(void* self, int* level) {
    (void)self; if (level) *level = 0; return S_OK_;
}
static HRESULT_ WINAPI h_InvokeButton(void* self, void* sender, void* args) {
    (void)self; (void)sender;
    evt_log("raise-button", args ? 1 : 0);
    if (args) {
        ButtonPressedArgsVtbl* v = (ButtonPressedArgsVtbl*)(*(void**)args);
        int btn = -1;
        if (SUCCEEDED_(v->get_Button(args, &btn)) && btn >= 0) Queue_SmtcEventButton(btn);
    }
    return S_OK_;
}
static HRESULT_ WINAPI h_InvokePosition(void* self, void* sender, void* args) {
    (void)self; (void)sender;
    evt_log("raise-seek", args ? 1 : 0);
    if (args) {
        PositionArgsVtbl* v = (PositionArgsVtbl*)(*(void**)args);
        TimeSpan ts; ts.Duration = 0;
        if (SUCCEEDED_(v->get_RequestedPlaybackPosition(args, &ts)) && ts.Duration > 0)
            Queue_SmtcEventSeek((double)ts.Duration / 10000000.0);
    }
    return S_OK_;
}

static HandlerVtbl g_handlerVtblButton = {
    h_QI, h_AddRef, h_Release, h_GetIids, h_GetRuntimeClassName, h_GetTrustLevel, h_InvokeButton
};
static HandlerVtbl g_handlerVtblPosition = {
    h_QI, h_AddRef, h_Release, h_GetIids, h_GetRuntimeClassName, h_GetTrustLevel, h_InvokePosition
};
static HandlerObj g_handlerButton   = { &g_handlerVtblButton, 1, 0 };
static HandlerObj g_handlerPosition = { &g_handlerVtblPosition, 1, 1 };

/* ------------------------------------------------------------------ */
/* TimelineProperties CCW（v7.1.0 唯一路径）                              */
/*   v7.0.2 实锤：对系统激活的 TimelineProperties 对象做 QI 会崩（宿主进
 *   程环境问题）。本版彻底绕开：时间线对象一律用自实现 COM 对象，系统侧
 *   UpdateTimelineProperties 只需 QI 接口成功并读取属性即可。               */
/* ------------------------------------------------------------------ */

typedef struct TpObj {
    TimelinePropsVtbl* vtbl;
    volatile LONG_     refs;
    TimeSpan startTime, endTime, minSeek, maxSeek, position;
} TpObj;

static HRESULT_ WINAPI tp_QI(void* self, const GUID* riid, void** out) {
    TpObj* o = (TpObj*)self;
    if (!out) return (HRESULT_)0x80004003L;
    *out = NULL;
    if (!riid) return (HRESULT_)0x80070057L;
    if (memcmp(riid, &IID_IMarshal, sizeof(GUID)) == 0 && g_ftm) {
        return ((InspectableVtbl*)(*(void**)g_ftm))->QueryInterface(g_ftm, riid, out);
    }
    if (memcmp(riid, &IID_IUnknown, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IInspectable, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IAgileObject, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_TimelineProps, sizeof(GUID)) == 0) {
        InterlockedIncrement(&o->refs);
        *out = self;
        return S_OK_;
    }
    return E_NOINTERFACE_;
}
static ULONG_ WINAPI tp_AddRef(void* self) { return InterlockedIncrement(&((TpObj*)self)->refs); }
static ULONG_ WINAPI tp_Release(void* self) {
    TpObj* o = (TpObj*)self;
    ULONG_ n = InterlockedDecrement(&o->refs);
    if (n == 0) HeapFree(GetProcessHeap(), 0, o);
    return n;
}
static HRESULT_ WINAPI tp_GetIids(void* self, ULONG_* count, GUID** iids) {
    (void)self; if (count) *count = 0; if (iids) *iids = NULL; return S_OK_;
}
static HRESULT_ WINAPI tp_GetRuntimeClassName(void* self, HSTR_* name) {
    (void)self; if (name) *name = NULL; return (HRESULT_)0x80004001L;
}
static HRESULT_ WINAPI tp_GetTrustLevel(void* self, int* level) {
    (void)self; if (level) *level = 0; return S_OK_;
}
#define TP_PROP(pname) \
static HRESULT_ WINAPI tp_get_##pname(void* self, TimeSpan* v) { \
    if (!v) return (HRESULT_)0x80004003L; *v = ((TpObj*)self)->pname; return S_OK_; } \
static HRESULT_ WINAPI tp_put_##pname(void* self, TimeSpan v) { \
    ((TpObj*)self)->pname = v; return S_OK_; }
TP_PROP(startTime)
TP_PROP(endTime)
TP_PROP(minSeek)
TP_PROP(maxSeek)
TP_PROP(position)
#undef TP_PROP

static TimelinePropsVtbl g_tpVtbl = {
    { tp_QI, tp_AddRef, tp_Release, tp_GetIids, tp_GetRuntimeClassName, tp_GetTrustLevel },
    tp_get_startTime, tp_put_startTime,
    tp_get_endTime,   tp_put_endTime,
    tp_get_minSeek,   tp_put_minSeek,
    tp_get_maxSeek,   tp_put_maxSeek,
    tp_get_position,  tp_put_position
};

static TpObj* TpObj_Create(void) {
    TpObj* o = (TpObj*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(TpObj));
    if (!o) return NULL;
    o->vtbl = &g_tpVtbl;
    o->refs = 1;
    return o;
}

/* ------------------------------------------------------------------ */
/* 共享状态                                                              */
/* ------------------------------------------------------------------ */

#define EVQ_CAP   128
#define CMDQ_CAP  64
#define BLOB_MAX  (3 * 1024 * 1024)
#define OP_META_MAX 1024

typedef struct SmtcOp {
    int     pending;
    int     hasMeta;
    wchar_t title[192];
    wchar_t artist[192];
    wchar_t album[192];
    wchar_t cover[768];
    int     status;
    int     hasTimeline;
    double  pos;
    double  dur;
} SmtcOp;

static SRWLOCK g_lock = SRWLOCK_INIT;

static SmtcOp      g_op;
static char*       g_stateBlob   = NULL;
static SIZE_T      g_stateLen    = 0;
static char*       g_lyricBlob   = NULL;
static SIZE_T      g_lyricLen    = 0;
static char*       g_cmdQueue[CMDQ_CAP];
static int         g_cmdHead = 0, g_cmdTail = 0;
static char*       g_evQueue[EVQ_CAP];
static int         g_evHead = 0, g_evTail = 0;

static volatile LONG_ g_smtcReady   = 0;
static volatile LONG_ g_httpPort    = 0;
static volatile LONG_ g_updApplied  = 0;
static volatile LONG_ g_metaApplied = 0;
static volatile LONG_ g_eventsIn    = 0;
static volatile LONG_ g_lastHr      = 0;
static volatile LONG_ g_shutdown    = 0;

static void lock_init_all(void) {
    InitializeSRWLock(&g_lock);
    memset(&g_op, 0, sizeof(g_op));
    g_op.status = -1;
}

static char* dup_blob(const char* src, SIZE_T len) {
    char* p = (char*)HeapAlloc(GetProcessHeap(), 0, len + 1);
    if (!p) return NULL;
    memcpy(p, src, len);
    p[len] = 0;
    return p;
}

static void replace_blob(char** dst, SIZE_T* dstLen, const char* src, SIZE_T len) {
    if (len > BLOB_MAX) len = BLOB_MAX;
    char* nb = dup_blob(src, len);
    if (!nb) return;
    AcquireSRWLockExclusive(&g_lock);
    if (*dst) HeapFree(GetProcessHeap(), 0, *dst);
    *dst = nb; *dstLen = len;
    ReleaseSRWLockExclusive(&g_lock);
}

static void Queue_SmtcEventJson(const char* json) {
    char* copy = dup_blob(json, strlen(json));
    if (!copy) return;
    AcquireSRWLockExclusive(&g_lock);
    int next = (g_evTail + 1) % EVQ_CAP;
    if (next == g_evHead) {
        HeapFree(GetProcessHeap(), 0, g_evQueue[g_evHead]);
        g_evHead = (g_evHead + 1) % EVQ_CAP;
    }
    g_evQueue[g_evTail] = copy;
    g_evTail = next;
    ReleaseSRWLockExclusive(&g_lock);
    InterlockedIncrement(&g_eventsIn);
}

void Queue_SmtcEventButton(int btn) {
    const char* name = "unknown";
    switch (btn) {
        case SMTCBTN_Play:   name = "play";   break;
        case SMTCBTN_Pause:  name = "pause";  break;
        case SMTCBTN_Stop:   name = "stop";   break;
        case SMTCBTN_Next:   name = "next";   break;
        case SMTCBTN_Previous: name = "prev"; break;
        case SMTCBTN_FastForward: name = "ff"; break;
        case SMTCBTN_Rewind: name = "rew";  break;
        case SMTCBTN_Record: name = "record"; break;
        case SMTCBTN_ChannelUp: name = "chup"; break;
        case SMTCBTN_ChannelDown: name = "chdown"; break;
    }
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"type\":\"button\",\"button\":\"%s\",\"btn\":%d}", name, btn);
    Queue_SmtcEventJson(buf);
}

void Queue_SmtcEventSeek(double posSec) {
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"type\":\"seek\",\"pos\":%.3f}", posSec);
    Queue_SmtcEventJson(buf);
}

static void Queue_Cmd(const char* json, SIZE_T len) {
    if (len > BLOB_MAX) return;
    char* copy = dup_blob(json, len);
    if (!copy) return;
    AcquireSRWLockExclusive(&g_lock);
    int next = (g_cmdTail + 1) % CMDQ_CAP;
    if (next == g_cmdHead) {
        HeapFree(GetProcessHeap(), 0, g_cmdQueue[g_cmdHead]);
        g_cmdHead = (g_cmdHead + 1) % CMDQ_CAP;
    }
    g_cmdQueue[g_cmdTail] = copy;
    g_cmdTail = next;
    ReleaseSRWLockExclusive(&g_lock);
}

static void Post_SmtcOp(SmtcOp* op) {
    AcquireSRWLockExclusive(&g_lock);
    g_op = *op;
    g_op.pending = 1;
    ReleaseSRWLockExclusive(&g_lock);
}

/* ------------------------------------------------------------------ */
/* SEH 辅助：捕获访问违例 → 记日志 → 干净退出（不弹 WER，监督者会重启）     */
/* ------------------------------------------------------------------ */

static volatile LONG_ g_sehCode = 0;
static volatile void* g_sehAddr = NULL;

static LONG WINAPI seh_filter(EXCEPTION_POINTERS* ep) {
    if (ep && ep->ExceptionRecord) {
        g_sehCode = (LONG_)ep->ExceptionRecord->ExceptionCode;
        g_sehAddr = ep->ExceptionRecord->ExceptionAddress;
    }
    return EXCEPTION_EXECUTE_HANDLER;
}

/* v7.2.0 最后防线：任何线程任何路径的未处理异常（含 SEH 未覆盖的
 * raise 回调路径）先落日志再退场——监督者会重启，日志永远说真话。 */
static LONG WINAPI last_resort_filter(EXCEPTION_POINTERS* ep) {
    DWORD code = 0;
    void* addr = NULL;
    if (ep && ep->ExceptionRecord) {
        code = ep->ExceptionRecord->ExceptionCode;
        addr = ep->ExceptionRecord->ExceptionAddress;
    }
    logf_line("[seh] UNHANDLED 0x%08lX @ %p — broker 退场(code=2)，监督者将重启",
              (unsigned long)code, addr);
    fflush(stderr);
    return EXCEPTION_EXECUTE_HANDLER;
}
static void install_last_resort(void) {
    SetUnhandledExceptionFilter(last_resort_filter);
}

#define GUARD(call) \
    __try { call; } \
    __except (seh_filter(GetExceptionInformation())) { \
        logf_line("[seh] AV 0x%08lX @ %p — broker 自杀退出，监督者将重启", \
                  (unsigned long)g_sehCode, g_sehAddr); \
        ExitProcess(2); \
    }

/* ------------------------------------------------------------------ */
/* SMTC 应用（元数据/状态/时间线）                                         */
/* ------------------------------------------------------------------ */

static HSTR_ g_hClsSmtc, g_hClsUri, g_hClsStreamRef;

static HSTR_ mk_hstr(const wchar_t* s) {
    HSTR_ h = NULL;
    UINT32_ len = 0;
    while (s[len]) len++;
    if (FAILED_(pWindowsCreateString(s, len, &h))) return NULL;
    return h;
}

/* 封面（全 hr 检查 + 一次失败日志；任何失败只丢封面不丢元数据） */
static int g_coverFailLogged = 0;

static void apply_cover(wchar_t* cover, void* updater, DisplayUpdaterVtbl* du) {
    void* uriFactory = NULL;
    HRESULT_ hr;
    if (!cover[0]) return;
    hr = pRoGetActivationFactory(g_hClsUri, &IID_UriRuntimeClassFactory, &uriFactory);
    if (FAILED_(hr) || !uriFactory) {
        if (!g_coverFailLogged) { logf_line("[cover] UriFactory hr=0x%08lX（封面降级）", (unsigned long)hr); g_coverFailLogged = 1; }
        return;
    }
    {
        UriFactoryVtbl* uf = (UriFactoryVtbl*)(*(void**)uriFactory);
        HSTR_ hCover = mk_hstr(cover);
        void* uri = NULL;
        if (hCover && SUCCEEDED_(uf->CreateUri(uriFactory, hCover, &uri)) && uri) {
            void* refStatics = NULL;
            if (SUCCEEDED_(pRoGetActivationFactory(g_hClsStreamRef, &IID_RandomAccessStreamReferenceStatics, &refStatics)) && refStatics) {
                StreamRefStaticsVtbl* rs = (StreamRefStaticsVtbl*)(*(void**)refStatics);
                void* streamRef = NULL;
                if (SUCCEEDED_(rs->CreateFromUri(refStatics, uri, &streamRef)) && streamRef) {
                    hr = du->put_Thumbnail(updater, streamRef);
                    if (FAILED_(hr) && !g_coverFailLogged) { logf_line("[cover] put_Thumbnail hr=0x%08lX", (unsigned long)hr); g_coverFailLogged = 1; }
                    ((InspectableVtbl*)(*(void**)streamRef))->Release(streamRef);
                }
                ((InspectableVtbl*)(*(void**)refStatics))->Release(refStatics);
            }
            ((InspectableVtbl*)(*(void**)uri))->Release(uri);
        }
        if (hCover) pWindowsDeleteString(hCover);
        ((InspectableVtbl*)(*(void**)uriFactory))->Release(uriFactory);
    }
}

static void apply_op(SmtcOp* op, void* smtc, void* smtc2) {
    SMTCVtbl* v = (SMTCVtbl*)(*(void**)smtc);
    HRESULT_ hr;

    /* 0) v7.2.0：全空元数据不推送 —— 卡片上那个「未知曲目」就是空 title
     *    走了 fallback 字符串上卡；桥插件拿不到歌名时宁可不更新元数据，
     *    保留上一次真实元数据，也不把「未知曲目」刷上系统卡片。 */
    if (op->hasMeta && !op->title[0] && !op->artist[0] && !op->album[0] && !op->cover[0]) {
        op->hasMeta = 0;
    }

    /* 1) 元数据 */
    static wchar_t lastTitle[192], lastArtist[192], lastAlbum[192], lastCover[768];
    static int lastMetaValid = 0;
    int metaChanged = op->hasMeta && (!lastMetaValid ||
        wcscmp(lastTitle, op->title) || wcscmp(lastArtist, op->artist) ||
        wcscmp(lastAlbum, op->album) || wcscmp(lastCover, op->cover));

    if (metaChanged) {
        void* updater = NULL;
        hr = v->get_DisplayUpdater(smtc, &updater);
        if (SUCCEEDED_(hr) && updater) {
            DisplayUpdaterVtbl* du = (DisplayUpdaterVtbl*)(*(void**)updater);
            du->put_Type(updater, MediaPlaybackType_Music);

            void* music = NULL;
            if (SUCCEEDED_(du->get_MusicProperties(updater, &music)) && music) {
                MusicPropsVtbl* mp = (MusicPropsVtbl*)(*(void**)music);
                HSTR_ hTitle = mk_hstr(op->title[0] ? op->title : L"未知曲目");
                HSTR_ hArtist = mk_hstr(op->artist);
                if (hTitle) { mp->put_Title(music, hTitle); pWindowsDeleteString(hTitle); }
                if (hArtist) { mp->put_Artist(music, hArtist); pWindowsDeleteString(hArtist); }
                void* music2 = NULL;
                if (SUCCEEDED_(((InspectableVtbl*)mp)->QueryInterface(music, &IID_MusicDisplayProperties2, &music2)) && music2) {
                    MusicProps2Vtbl* mp2 = (MusicProps2Vtbl*)(*(void**)music2);
                    HSTR_ hAlbum = mk_hstr(op->album);
                    if (hAlbum) { mp2->put_AlbumTitle(music2, hAlbum); pWindowsDeleteString(hAlbum); }
                    ((InspectableVtbl*)mp2)->Release(music2);
                }
                ((InspectableVtbl*)mp)->Release(music);
            }

            apply_cover(op->cover, updater, du);

            hr = du->Update(updater);
            if (FAILED_(hr)) { g_lastHr = hr; logf_line("[meta] DisplayUpdater::Update hr=0x%08lX", (unsigned long)hr); }
            ((InspectableVtbl*)(*(void**)updater))->Release(updater);
            if (SUCCEEDED_(hr)) {
                InterlockedIncrement(&g_metaApplied);
                logf_line("[meta] applied title='%.*ls' artist='%.*ls' album='%.*ls'",
                          40, op->title, 40, op->artist, 24, op->album);
                wcsncpy(lastTitle, op->title, 191); lastTitle[191] = 0;
                wcsncpy(lastArtist, op->artist, 191); lastArtist[191] = 0;
                wcsncpy(lastAlbum, op->album, 191); lastAlbum[191] = 0;
                wcsncpy(lastCover, op->cover, 767); lastCover[767] = 0;
                lastMetaValid = 1;
            }
        } else {
            g_lastHr = hr;
            logf_line("[meta] get_DisplayUpdater hr=0x%08lX", (unsigned long)hr);
        }
    }

    /* 2) 播放状态 */
    if (op->status >= 0) {
        static int lastStatus = -999;
        if (op->status != lastStatus) {
            hr = v->put_PlaybackStatus(smtc, op->status);
            if (SUCCEEDED_(hr)) {
                lastStatus = op->status;
                evt_log("status-set", op->status);
            }
            else { g_lastHr = hr; logf_line("[st] put_PlaybackStatus(%d) hr=0x%08lX", op->status, (unsigned long)hr); }
        }
    }

    /* 3) 时间线：CCW 唯一路径（绝不激活系统 TimelineProperties 类） */
    if (op->hasTimeline && smtc2) {
        static double lastPos = -1, lastDur = -1;
        if (lastPos < 0 || lastDur < 0 ||
            (op->pos - lastPos) > 0.35 || (lastPos - op->pos) > 0.35 ||
            (op->dur - lastDur) > 0.01 || (lastDur - op->dur) > 0.01) {
            TimeSpan tZero, tEnd, tPos;
            tZero.Duration = 0;
            tEnd.Duration = (INT64_)(op->dur * 10000000.0);
            tPos.Duration = (INT64_)(op->pos * 10000000.0);
            if (tEnd.Duration < 0) tEnd.Duration = 0;
            if (tPos.Duration < 0) tPos.Duration = 0;
            if (tPos.Duration > tEnd.Duration) tPos.Duration = tEnd.Duration;

            {
                TpObj* ccw = TpObj_Create();
                if (ccw) {
                    void* tp = (void*)ccw;
                    TimelinePropsVtbl* tv = (TimelinePropsVtbl*)(*(void**)tp);
                    int ok = 1;
                    ok &= (SUCCEEDED_(tv->put_StartTime(tp, tZero)) ? 1 : 0);
                    ok &= (SUCCEEDED_(tv->put_EndTime(tp, tEnd)) ? 1 : 0);
                    ok &= (SUCCEEDED_(tv->put_MinSeekTime(tp, tZero)) ? 1 : 0);
                    ok &= (SUCCEEDED_(tv->put_MaxSeekTime(tp, tEnd)) ? 1 : 0);
                    ok &= (SUCCEEDED_(tv->put_Position(tp, tPos)) ? 1 : 0);
                    hr = ((SMTC2Vtbl*)(*(void**)smtc2))->UpdateTimelineProperties(smtc2, tp);
                    if (SUCCEEDED_(hr) && ok) {
                        if (lastPos < 0)
                            logf_line("[upd] timeline applied (ccw) pos=%.2f dur=%.2f", op->pos, op->dur);
                        lastPos = op->pos; lastDur = op->dur;
                        InterlockedIncrement(&g_updApplied);
                    } else {
                        g_lastHr = SUCCEEDED_(hr) ? (HRESULT_)0x80004005L : hr;
                        logf_line("[upd] UpdateTimelineProperties hr=0x%08lX propsOk=%d", (unsigned long)hr, ok);
                    }
                    tp_Release(ccw);
                } else {
                    logf_line("[upd] TpObj create failed (OOM)");
                }
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* SMTC 线程（STA：初始化 → 窗口 → 注册 → 泵）                            */
/* ------------------------------------------------------------------ */

static HWND  g_hwnd = NULL;
static void* g_smtc = NULL;
static void* g_smtc2 = NULL;

static int smtc_setup(void) {
    HMODULE combase;
    HRESULT_ hr;
    void* interop = NULL;
    InteropVtbl* iv;
    void* smtc = NULL;
    SMTCVtbl* sv;
    void* smtc2 = NULL;
    EventToken tok;
    BOOL08 one = 1, zero = 0;
    WNDCLASSW wc;

    combase = GetModuleHandleW(L"combase.dll");
    if (!combase) combase = LoadLibraryW(L"combase.dll");
    if (!combase) { logf_line("[smtc] combase.dll not found"); return 0; }
    pRoInitialize           = (PFN_RoInitialize)(void*)GetProcAddress(combase, "RoInitialize");
    pRoGetActivationFactory = (PFN_RoGetActivationFactory)(void*)GetProcAddress(combase, "RoGetActivationFactory");
    pWindowsCreateString    = (PFN_WindowsCreateString)(void*)GetProcAddress(combase, "WindowsCreateString");
    pWindowsDeleteString    = (PFN_WindowsDeleteString)(void*)GetProcAddress(combase, "WindowsDeleteString");
    if (!pRoInitialize || !pRoGetActivationFactory || !pWindowsCreateString || !pWindowsDeleteString) {
        logf_line("[smtc] combase exports missing");
        return 0;
    }

    /* STA（RO_INIT_SINGLETHREADED = 1）。GetForWindow 系会话按窗口消息驱动，
     * Firefox/Microsoft 官方样例均为 STA + 专用线程 + 消息泵，此处对齐。 */
    hr = pRoInitialize(1);
    if (FAILED_(hr) && hr != (HRESULT_)0x80010106L /* RPC_E_CHANGED_MODE */) {
        logf_line("[smtc] RoInitialize hr=0x%08lX", (unsigned long)hr);
        return 0;
    }
    logf_line("[smtc] RoInitialize ok (STA)");

    g_hClsSmtc      = mk_hstr(CLSID_SMTC);
    g_hClsUri       = mk_hstr(CLSID_URI);
    g_hClsStreamRef = mk_hstr(CLSID_STREAMREF);
    if (!g_hClsSmtc || !g_hClsUri || !g_hClsStreamRef) {
        logf_line("[smtc] HSTRING create failed");
        return 0;
    }

    /* agile 基建：FTM（事件回调跨单元投递的正规解法） */
    {
        HRESULT_ hrF = CoCreateFreeThreadedMarshaler(NULL, &g_ftm);
        logf_line("[smtc] FTM hr=0x%08lX", (unsigned long)hrF);
    }

    memset(&wc, 0, sizeof(wc));
    wc.lpfnWndProc = DefWindowProcW;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = WINDOW_CLASSW;
    if (!RegisterClassW(&wc)) {
        logf_line("[smtc] RegisterClass failed %lu", (unsigned long)GetLastError());
        return 0;
    }
    g_hwnd = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, WINDOW_CLASSW,
        L"ChuShi SMTC Broker", WS_OVERLAPPED, 0, 0, 0, 0, NULL, NULL, wc.hInstance, NULL);
    if (!g_hwnd) {
        logf_line("[smtc] CreateWindow failed %lu", (unsigned long)GetLastError());
        return 0;
    }
    logf_line("[smtc] broker window created");

    hr = pRoGetActivationFactory(g_hClsSmtc, &IID_SMTCInterop, &interop);
    if (FAILED_(hr) || !interop) {
        g_lastHr = hr;
        logf_line("[smtc] RoGetActivationFactory(Interop) hr=0x%08lX", (unsigned long)hr);
        return 0;
    }
    iv = (InteropVtbl*)(*(void**)interop);
    hr = iv->GetForWindow(interop, g_hwnd, &IID_SMTC, &smtc);
    ((InspectableVtbl*)(*(void**)interop))->Release(interop);
    if (FAILED_(hr) || !smtc) {
        g_lastHr = hr;
        logf_line("[smtc] GetForWindow hr=0x%08lX", (unsigned long)hr);
        return 0;
    }
    logf_line("[smtc] GetForWindow OK — system media session registered (broker process)");

    sv = (SMTCVtbl*)(*(void**)smtc);
    sv->put_IsEnabled(smtc, one);
    sv->put_IsPlayEnabled(smtc, one);
    sv->put_IsPauseEnabled(smtc, one);
    sv->put_IsNextEnabled(smtc, one);
    sv->put_IsPreviousEnabled(smtc, one);
    sv->put_IsStopEnabled(smtc, zero);
    sv->put_IsRecordEnabled(smtc, zero);
    sv->put_IsChannelUpEnabled(smtc, zero);
    sv->put_IsChannelDownEnabled(smtc, zero);

    if (SUCCEEDED_(((InspectableVtbl*)sv)->QueryInterface(smtc, &IID_SMTC2, &smtc2)) && smtc2) {
        SMTC2Vtbl* s2 = (SMTC2Vtbl*)(*(void**)smtc2);
        tok.value = 0;
        hr = s2->add_PlaybackPositionChangeRequested(smtc2, &g_handlerPosition, &tok);
        logf_line("[smtc] add_PlaybackPositionChangeRequested hr=0x%08lX", (unsigned long)hr);
    } else {
        logf_line("[smtc] SMTC2 QI failed (拖动请求不可用)");
    }
    tok.value = 0;
    hr = sv->add_ButtonPressed(smtc, &g_handlerButton, &tok);
    logf_line("[smtc] add_ButtonPressed hr=0x%08lX", (unsigned long)hr);

    InterlockedExchange(&g_smtcReady, 1);

    /* 暴露给消息循环（全局存活至进程退出，不释放——与进程同生命周期） */
    g_smtc = smtc;
    g_smtc2 = smtc2;
    return 1;
}

static DWORD WINAPI smtc_thread(LPVOID param) {
    (void)param;
    MSG msg;

    GUARD(if (!smtc_setup()) { ExitProcess(3); });

    SetTimer(g_hwnd, 1, 100, NULL);
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        /* v7.2.0：【raise 路径全覆盖】ButtonPressed/PlaybackPositionChangeRequested
         * 的系统 raise 发生在 DispatchMessageW 内部 —— 这里若无 SEH，任何
         * raise 路径异常都会静默杀死 broker → 系统卡片消失。全部包住。 */
        GUARD({
            if (msg.message == WM_TIMER && msg.hwnd == g_hwnd) {
                SmtcOp local; int has = 0;
                AcquireSRWLockShared(&g_lock);
                if (g_op.pending) { local = g_op; has = 1; }
                ReleaseSRWLockShared(&g_lock);
                if (has) {
                    AcquireSRWLockExclusive(&g_lock);
                    g_op.pending = 0;
                    ReleaseSRWLockExclusive(&g_lock);
                    apply_op(&local, g_smtc, g_smtc2);
                }
            }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        });
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* HTTP 枢纽（协议与 v7.0.2 完全一致，插件B/页面零改动）                    */
/* ------------------------------------------------------------------ */

#define RESP_MAX (BLOB_MAX + 4096)

static volatile LONG_ g_activeConns = 0;
static DWORD WINAPI conn_thread(LPVOID param);

static void http_send(SOCKET s, const char* code, const char* contentType, const char* body, SIZE_T bodyLen) {
    char head[512];
    int hn = snprintf(head, sizeof(head),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %llu\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
        "Access-Control-Expose-Headers: *\r\n"
        "Access-Control-Max-Age: 86400\r\n"
        "Access-Control-Allow-Private-Network: true\r\n"
        "Connection: close\r\n"
        "\r\n",
        code, contentType, (unsigned long long)bodyLen);
    if (hn <= 0) return;
    send(s, head, (int)hn, 0);
    if (bodyLen) {
        SIZE_T off = 0;
        while (off < bodyLen) {
            int chunk = (int)((bodyLen - off) > 65536 ? 65536 : (bodyLen - off));
            int n = send(s, body + off, chunk, 0);
            if (n <= 0) break;
            off += (SIZE_T)n;
        }
    }
}

static void send_json(SOCKET s, const char* json) {
    http_send(s, "200 OK", "application/json; charset=utf-8", json, strlen(json));
}

static int read_line(SOCKET s, char* buf, int max) {
    int i = 0;
    while (i < max - 1) {
        char c;
        int n = recv(s, &c, 1, 0);
        if (n <= 0) return -1;
        if (c == '\n') break;
        if (c != '\r') buf[i++] = c;
    }
    buf[i] = 0;
    return i;
}

static int hexv(int c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void url_decode(const char* src, wchar_t* dst, int maxChars) {
    unsigned char tmp[OP_META_MAX * 2];
    SIZE_T n = 0;
    SIZE_T sl = strlen(src);
    for (SIZE_T i = 0; i < sl && n < sizeof(tmp) - 4; i++) {
        if (src[i] == '%' && i + 2 < sl && hexv(src[i+1]) >= 0 && hexv(src[i+2]) >= 0) {
            tmp[n++] = (unsigned char)(hexv(src[i+1]) * 16 + hexv(src[i+2]));
            i += 2;
        } else if (src[i] == '+') {
            tmp[n++] = ' ';
        } else {
            tmp[n++] = (unsigned char)src[i];
        }
    }
    tmp[n] = 0;
    int wlen = MultiByteToWideChar(CP_UTF8, 0, (const char*)tmp, (int)n, dst, maxChars - 1);
    if (wlen < 0) wlen = 0;
    dst[wlen] = 0;
}

static void form_get(const char* body, const char* key, wchar_t* out, int maxChars) {
    out[0] = 0;
    SIZE_T klen = strlen(key);
    const char* p = body;
    while (p && *p) {
        const char* amp = strchr(p, '&');
        SIZE_T segLen = amp ? (SIZE_T)(amp - p) : strlen(p);
        if (segLen > klen && strncmp(p, key, klen) == 0 && p[klen] == '=') {
            char val[OP_META_MAX * 2];
            SIZE_T vlen = segLen - klen - 1;
            if (vlen >= sizeof(val)) vlen = sizeof(val) - 1;
            memcpy(val, p + klen + 1, vlen);
            val[vlen] = 0;
            url_decode(val, out, maxChars);
            return;
        }
        p = amp ? amp + 1 : NULL;
    }
}

static void handle_client(SOCKET s) {
    char line[8192];
    if (read_line(s, line, sizeof(line)) < 0) return;
    char method[8] = {0}, path[2048] = {0};
    if (sscanf(line, "%7s %2047s", method, path) != 2) return;

    long long contentLen = 0;
    for (;;) {
        char h[4096];
        if (read_line(s, h, sizeof(h)) < 0) return;
        if (h[0] == 0) break;
        if (_strnicmp(h, "Content-Length:", 15) == 0)
            contentLen = _atoi64(h + 15);
    }
    if (contentLen < 0) contentLen = 0;
    if (contentLen > BLOB_MAX) contentLen = BLOB_MAX;

    char* body = NULL;
    if (contentLen > 0) {
        body = (char*)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)contentLen + 1);
        if (!body) { http_send(s, "500 Internal Server Error", "text/plain", "oom", 3); return; }
        SIZE_T got = 0;
        while (got < (SIZE_T)contentLen) {
            int n = recv(s, body + got, (int)((SIZE_T)contentLen - got), 0);
            if (n <= 0) break;
            got += (SIZE_T)n;
        }
        body[got] = 0;
    }

    char route[2048];
    strncpy(route, path, sizeof(route) - 1);
    route[sizeof(route) - 1] = 0;
    char* qm = strchr(route, '?');
    if (qm) *qm = 0;

    if (strcmp(method, "OPTIONS") == 0) {
        http_send(s, "204 No Content", "text/plain", "", 0);
    } else if (strcmp(route, "/api/ping") == 0 && strcmp(method, "GET") == 0) {
        char buf[256];
        snprintf(buf, sizeof(buf),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"pid\":%lu,\"host\":true,\"port\":%lu,\"broker\":true}",
            HUB_NAME, BROKER_VERSION, (unsigned long)GetCurrentProcessId(), (unsigned long)g_httpPort);
        send_json(s, buf);
    } else if (strcmp(route, "/api/state") == 0 && strcmp(method, "GET") == 0) {
        AcquireSRWLockShared(&g_lock);
        if (g_stateBlob) http_send(s, "200 OK", "application/json; charset=utf-8", g_stateBlob, g_stateLen);
        else send_json(s, "{\"ok\":false,\"reason\":\"empty\"}");
        ReleaseSRWLockShared(&g_lock);
    } else if (strcmp(route, "/api/state") == 0 && strcmp(method, "POST") == 0 && body) {
        replace_blob(&g_stateBlob, &g_stateLen, body, (SIZE_T)contentLen);
        send_json(s, "{\"ok\":true}");
    } else if (strcmp(route, "/api/lyric") == 0 && strcmp(method, "GET") == 0) {
        AcquireSRWLockShared(&g_lock);
        if (g_lyricBlob) http_send(s, "200 OK", "application/json; charset=utf-8", g_lyricBlob, g_lyricLen);
        else send_json(s, "{\"ok\":false,\"reason\":\"empty\"}");
        ReleaseSRWLockShared(&g_lock);
    } else if (strcmp(route, "/api/lyric") == 0 && strcmp(method, "POST") == 0 && body) {
        replace_blob(&g_lyricBlob, &g_lyricLen, body, (SIZE_T)contentLen);
        send_json(s, "{\"ok\":true}");
    } else if (strcmp(route, "/api/cmd") == 0 && strcmp(method, "GET") == 0) {
        char* out = (char*)HeapAlloc(GetProcessHeap(), 0, BLOB_MAX + 64);
        if (out) {
            SIZE_T off = 0;
            out[off++] = '[';
            int first = 1;
            for (;;) {
                char* item = NULL;
                AcquireSRWLockExclusive(&g_lock);
                if (g_cmdHead != g_cmdTail) {
                    item = g_cmdQueue[g_cmdHead];
                    g_cmdHead = (g_cmdHead + 1) % CMDQ_CAP;
                }
                ReleaseSRWLockExclusive(&g_lock);
                if (!item) break;
                SIZE_T il = strlen(item);
                if (off + il + 3 < BLOB_MAX) {
                    if (!first) out[off++] = ',';
                    memcpy(out + off, item, il); off += il;
                    first = 0;
                }
                HeapFree(GetProcessHeap(), 0, item);
            }
            out[off++] = ']';
            out[off] = 0;
            http_send(s, "200 OK", "application/json; charset=utf-8", out, off);
            HeapFree(GetProcessHeap(), 0, out);
        } else send_json(s, "[]");
    } else if (strcmp(route, "/api/cmd") == 0 && strcmp(method, "POST") == 0 && body) {
        Queue_Cmd(body, (SIZE_T)contentLen);
        send_json(s, "{\"ok\":true}");
    } else if (strcmp(route, "/api/smtc/events") == 0 && strcmp(method, "GET") == 0) {
        char* out = (char*)HeapAlloc(GetProcessHeap(), 0, EVQ_CAP * 128 + 64);
        if (out) {
            SIZE_T off = 0;
            out[off++] = '[';
            int first = 1;
            for (;;) {
                char* item = NULL;
                AcquireSRWLockExclusive(&g_lock);
                if (g_evHead != g_evTail) {
                    item = g_evQueue[g_evHead];
                    g_evHead = (g_evHead + 1) % EVQ_CAP;
                }
                ReleaseSRWLockExclusive(&g_lock);
                if (!item) break;
                SIZE_T il = strlen(item);
                if (off + il + 3 < EVQ_CAP * 128) {
                    if (!first) out[off++] = ',';
                    memcpy(out + off, item, il); off += il;
                    first = 0;
                }
                HeapFree(GetProcessHeap(), 0, item);
            }
            out[off++] = ']';
            out[off] = 0;
            http_send(s, "200 OK", "application/json; charset=utf-8", out, off);
            HeapFree(GetProcessHeap(), 0, out);
        } else send_json(s, "[]");
    } else if (strcmp(route, "/api/smtc/status") == 0 && strcmp(method, "GET") == 0) {
        char buf[384];
        snprintf(buf, sizeof(buf),
            "{\"ok\":true,\"smtcReady\":%s,\"updApplied\":%lu,\"metaApplied\":%lu,"
            "\"eventsEmitted\":%lu,\"lastHr\":\"0x%08lX\",\"broker\":true,\"version\":\"%s\"}",
            g_smtcReady ? "true" : "false",
            (unsigned long)g_updApplied, (unsigned long)g_metaApplied,
            (unsigned long)g_eventsIn, (unsigned long)g_lastHr, BROKER_VERSION);
        send_json(s, buf);
    } else if (strcmp(route, "/api/smtc/update") == 0 && strcmp(method, "POST") == 0 && body) {
        SmtcOp op; memset(&op, 0, sizeof(op));
        op.status = -1;
        wchar_t tmp[64];
        form_get(body, "title", op.title, 192);
        form_get(body, "artist", op.artist, 192);
        form_get(body, "album", op.album, 192);
        form_get(body, "cover", op.cover, 768);
        op.hasMeta = 1;
        form_get(body, "status", tmp, 32);
        if (tmp[0]) {
            int st = atoi_n(tmp);
            op.status = (st >= 0 && st <= 4) ? st : -1;
        }
        form_get(body, "pos", tmp, 32);
        if (tmp[0]) { op.pos = atof_n(tmp); op.hasTimeline = 1; }
        form_get(body, "dur", tmp, 32);
        if (tmp[0]) op.dur = atof_n(tmp);
        Post_SmtcOp(&op);
        send_json(s, "{\"ok\":true}");
    } else if (strcmp(route, "/api/broker/shutdown") == 0 && strcmp(method, "POST") == 0) {
        send_json(s, "{\"ok\":true,\"bye\":true}");
        logf_line("[life] shutdown requested via HTTP");
        g_shutdown = 1;
        ExitProcess(0);
    } else {
        const char* nf = "{\"ok\":false,\"reason\":\"no-route\"}";
        http_send(s, "404 Not Found", "application/json; charset=utf-8", nf, strlen(nf));
    }
    if (body) HeapFree(GetProcessHeap(), 0, body);
}

static double atof_n(const wchar_t* s) { return wcstod(s, NULL); }
static int atoi_n(const wchar_t* s) { return (int)wcstol(s, NULL, 10); }

static DWORD WINAPI http_thread(LPVOID param) {
    (void)param;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;
    int ports[3] = HTTP_PORTS;
    SOCKET lsn = INVALID_SOCKET;
    for (int i = 0; i < 3 && lsn == INVALID_SOCKET; i++) {
        lsn = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (lsn == INVALID_SOCKET) break;
        BOOL reuse = TRUE;
        setsockopt(lsn, SOL_SOCKET, SO_REUSEADDR, (const char*)&reuse, sizeof(reuse));
        struct sockaddr_in addr; memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        addr.sin_port = htons((unsigned short)ports[i]);
        if (bind(lsn, (struct sockaddr*)&addr, sizeof(addr)) != 0) {
            closesocket(lsn);
            lsn = INVALID_SOCKET;
            continue;
        }
        InterlockedExchange(&g_httpPort, (LONG_)ports[i]);
    }
    if (lsn == INVALID_SOCKET || listen(lsn, 8) != 0) {
        logf_line("[http] listen failed (all ports busy)");
        /* 枢纽起不来 = 全链路不可用：留给监督者重启 */
        ExitProcess(4);
    }
    logf_line("[http] hub listening on 127.0.0.1:%lu", (unsigned long)g_httpPort);
    for (;;) {
        SOCKET c = accept(lsn, NULL, NULL);
        if (c == INVALID_SOCKET) continue;
        DWORD tv = 2500;
        setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
        setsockopt(c, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
        InterlockedIncrement(&g_activeConns);
        if (g_activeConns > 32) {
            InterlockedDecrement(&g_activeConns);
            shutdown(c, SD_BOTH);
            closesocket(c);
            continue;
        }
        HANDLE th = CreateThread(NULL, 0, conn_thread, (LPVOID)(intptr_t)c, 0, NULL);
        if (th) CloseHandle(th);
        else {
            handle_client(c);
            shutdown(c, SD_BOTH);
            closesocket(c);
            InterlockedDecrement(&g_activeConns);
        }
    }
    return 0;
}

static DWORD WINAPI conn_thread(LPVOID param) {
    SOCKET c = (SOCKET)(intptr_t)param;
    GUARD(handle_client(c));
    shutdown(c, SD_BOTH);
    closesocket(c);
    InterlockedDecrement(&g_activeConns);
    return 0;
}

/* ------------------------------------------------------------------ */
/* 父进程看门狗：网易云退出 → broker 退出                                  */
/* ------------------------------------------------------------------ */

static DWORD WINAPI watchdog_thread(LPVOID param) {
    HANDLE hParent = (HANDLE)param;
    if (hParent && hParent != INVALID_HANDLE_VALUE) {
        WaitForSingleObject(hParent, INFINITE);
        logf_line("[life] parent process exited — broker bye");
        ExitProcess(0);
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* main                                                                   */
/* ------------------------------------------------------------------ */

int main(int argc, char** argv) {
    DWORD parentPid = 0;
    HANDLE hParent = NULL;
    HANDLE mx;

    /* 绝不弹 WER/调试器框 */
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
    install_last_resort();

    for (int i = 1; i + 1 < argc; i += 2) {
        if (strcmp(argv[i], "--parent") == 0) parentPid = (DWORD)strtoul(argv[i + 1], NULL, 10);
        else if (strcmp(argv[i], "--log") == 0) {
            int n = MultiByteToWideChar(CP_UTF8, 0, argv[i + 1], -1, NULL, 0);
            if (n > 0 && n < (int)sizeof(g_logPathA)) {
                wchar_t wtmp[MAX_PATH * 2];
                MultiByteToWideChar(CP_UTF8, 0, argv[i + 1], -1, wtmp, MAX_PATH * 2);
                char atmp[MAX_PATH * 2];
                int m = WideCharToMultiByte(CP_ACP, 0, wtmp, -1, atmp, sizeof(atmp), NULL, NULL);
                if (m > 0) strncpy(g_logPathA, atmp, sizeof(g_logPathA) - 1);
            }
        }
    }
    if (!g_logPathA[0]) {
        wchar_t wexe[MAX_PATH];
        if (GetModuleFileNameW(NULL, wexe, MAX_PATH)) {
            wchar_t* cut = wcsrchr(wexe, L'\\');
            if (cut) { wcscpy(cut + 1, L"broker-log.txt");
                WideCharToMultiByte(CP_ACP, 0, wexe, -1, g_logPathA, sizeof(g_logPathA), NULL, NULL); }
        }
    }

    /* 单实例 */
    mx = CreateMutexW(NULL, TRUE, MUTEX_NAMEW);
    if (!mx) return 5;
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        logf_line("[life] another broker already running, exit(3)");
        return 3;
    }

    lock_init_all();
    logf_line("[boot] ChuShi SMTC Broker v%s (parent pid %lu)", BROKER_VERSION, (unsigned long)parentPid);

    if (parentPid) {
        hParent = OpenProcess(SYNCHRONIZE, FALSE, parentPid);
        if (hParent) {
            HANDLE th = CreateThread(NULL, 0, watchdog_thread, hParent, 0, NULL);
            if (th) CloseHandle(th);
        } else {
            logf_line("[life] parent pid %lu not openable (errno %lu) — 无看门狗运行",
                      (unsigned long)parentPid, (unsigned long)GetLastError());
        }
    }

    {
        HANDLE t1 = CreateThread(NULL, 0, smtc_thread, NULL, 0, NULL);
        HANDLE t2 = CreateThread(NULL, 0, http_thread, NULL, 0, NULL);
        if (t1) CloseHandle(t1);
        if (t2) CloseHandle(t2);
    }

    Sleep(INFINITE);
    return 0;
}
