/* =========================================================================
 * ChuShi SMTC Manager — native BetterNCM plugin (v7.0.1)
 * 自研 Windows 系统媒体控制（SMTC）原生模块。
 * 设计目标：
 *   1. 创建真正独立的 Windows SMTC 会话（ISystemMediaTransportControlsInterop
 *      ::GetForWindow，自有隐藏窗口），不依赖网易云自带 SMTC 开关。
 *   2. 支持媒体键（播放/暂停/上一首/下一首）与系统悬浮窗可拖进度
 *      （TimelineProperties 必设 MinSeekTime/MaxSeekTime）。
 *   3. 内置本机回环 HTTP 枢纽（127.0.0.1:26901，备选 26902/26903），
 *      作为「初始」新标签页与网易云插件之间的纯传输中继。
 *   4. 全部 WinRT 调用走 combase 动态加载 + 手工 vtable（槽位与 IID 已
 *      逐项对照 windows-rs 官方投影验证），零第三方依赖。
 * 进程模型：BetterNCM 会在 Main/Renderer/GPU 等每个进程加载本 DLL；
 *   以命名互斥体选举唯一 Host，Host 承载 SMTC 会话与 HTTP 枢纽；
 *   v7.0.1 起 Host 若 SMTC 注册失败会释放互斥体让位（不再死守）。
 * v7.0.2 崩溃修复（真机实锤 Windows.Media.MediaControl.dll AV，
 *   崩溃点 = UpdateTimelineProperties 内部，反汇编 +266E 处 call *0x60）：
 *   v7.0.1 把 TimelineProperties 误判为「struct 值类型」并栈上直传——错。
 *   windows-rs 官方投影源实锤：SystemMediaTransportControlsTimelineProperties
 *   是【可激活 runtime class】（FactoryCache 默认构造 + RuntimeName），
 *   UpdateTimelineProperties 的 ABI 参数 = ISystemMediaTransportControls-
 *   TimelineProperties 接口指针（{5125316A-C3A2-475B-8507-93534DC88F15}）。
 *   传裸栈结构体 = 系统把前 8 字节当虚表指针解引用 → 必崩。
 *   v7.0.2 改为：RoActivateInstance(类名) → QI 接口 → 逐属性 put →
 *   UpdateTimelineProperties(接口指针)；激活失败则回退到自实现 CCW 对象。
 *   事件 handler 额外应答 IAgileObject 标记（对齐 C++/WinRT 投影行为）。
 *   本版已把全部 IID/vtable 逐项对照 windows-rs master 投影源 + Microsoft
 *   SDK 原版 SystemMediaTransportControlsInterop.idl + pinterface 盐算法
 *   （sha1({11F47AD5-7B73-42C0-ABAE-878B1E16ADEE} + 签名串)）复核通过。
 * 新增：DLL 同目录 native-log.txt 文件日志（报障直接发此文件）。
 * ========================================================================= */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdarg.h>

#define WIN32_EXTRA_LEAN

#pragma comment(lib, "user32")
#pragma comment(lib, "kernel32")
#pragma comment(lib, "ws2_32")

#define PLUGIN_VERSION "7.0.2"
#define HUB_NAME       "chushi-smtc-hub"
#define MUTEX_NAMEW    L"ChuShi.Smtc.v7.Host"
#define WINDOW_CLASSW  L"ChuShiSmtcHostWnd7"
#define HTTP_PORTS     { 26901, 26902, 26903 }

/* ------------------------------------------------------------------ */
/* WinRT 基础                                                          */
/* ------------------------------------------------------------------ */

typedef unsigned char BOOL08; /* WinRT ABI boolean = 1 byte */


typedef long LONG_;
typedef unsigned long ULONG_;
typedef long long INT64_;

#define DEFINE_GUID_CONST(name, l, w1, w2, b1, b2, b3, b4, b5, b6, b7, b8) \
    static const GUID name = { l, w1, w2, { b1, b2, b3, b4, b5, b6, b7, b8 } }

DEFINE_GUID_CONST(IID_IUnknown,    0x00000000,0x0000,0x0000,0xC0,0x00,0x00,0x00,0x00,0x00,0x00,0x46);
DEFINE_GUID_CONST(IID_IInspectable,0xAF86E2E0,0xB12D,0x4C6A,0x9C,0x5A,0xD7,0xAA,0x65,0x10,0x1E,0x90);
/* Windows.Media */
DEFINE_GUID_CONST(IID_SMTC,            0x99FA3FF4,0x1742,0x42A6,0x90,0x2E,0x08,0x7D,0x41,0xF9,0x65,0xEC);
DEFINE_GUID_CONST(IID_SMTC2,           0xEA98D2F6,0x7F3C,0x4AF2,0xA5,0x86,0x72,0x88,0x98,0x08,0xEF,0xB1);
DEFINE_GUID_CONST(IID_SMTCDisplayUpdater, 0x8ABBC53E,0xFA55,0x4ECF,0xAD,0x8E,0xC9,0x84,0xE5,0xDD,0x15,0x50);
DEFINE_GUID_CONST(IID_MusicDisplayProperties,  0x6BBF0C59,0xD0A0,0x4D26,0x92,0xA0,0xF9,0x78,0xE1,0xD1,0x8E,0x7B);
DEFINE_GUID_CONST(IID_MusicDisplayProperties2, 0x00368462,0x97D3,0x44B9,0xB0,0x0F,0x00,0x8A,0xFC,0xEF,0xAF,0x18);
DEFINE_GUID_CONST(IID_SMTCButtonPressedEventArgs, 0xB7F47116,0xA56F,0x4DC8,0x9E,0x11,0x92,0x03,0x1F,0x4A,0x87,0xC2);
DEFINE_GUID_CONST(IID_PlaybackPositionChangeRequestedEventArgs, 0xB4493F88,0xEB28,0x4961,0x9C,0x14,0x33,0x5E,0x44,0xF3,0xE1,0x25);
DEFINE_GUID_CONST(IID_SMTCInterop, 0xDDB0472D,0xC911,0x4A1F,0x86,0xD9,0xDC,0x3D,0x71,0xA9,0x5F,0x5A);
/* ISystemMediaTransportControlsTimelineProperties（windows-rs master 实锤） */
DEFINE_GUID_CONST(IID_TimelineProps, 0x5125316A,0xC3A2,0x475B,0x85,0x07,0x93,0x53,0x4D,0xC8,0x8F,0x15);
/* IAgileObject（agile 标记，DirectN/NAudio 投影实锤） */
DEFINE_GUID_CONST(IID_IAgileObject, 0x94EA2B94,0xE9CC,0x49E0,0xC0,0xFF,0xEE,0x64,0xCA,0x8F,0x5B,0x90);
/* 事件特化（参数化接口实例 GUID，取自 SDK 16299 投影头） */
DEFINE_GUID_CONST(IID_HandlerButtonPressed, 0x0557E996,0x7B23,0x5BAE,0xAA,0x81,0xEA,0x0D,0x67,0x11,0x43,0xA4);
DEFINE_GUID_CONST(IID_HandlerPositionChange,0x44E34F15,0xBDC0,0x50A7,0xAC,0xE4,0x39,0xE9,0x1F,0xB7,0x53,0xF1);
/* Windows.Foundation / Storage.Streams */
DEFINE_GUID_CONST(IID_UriRuntimeClassFactory, 0x44A9796F,0x723E,0x4FDF,0xA2,0x18,0x03,0x3E,0x75,0xB0,0xC0,0x84);
DEFINE_GUID_CONST(IID_RandomAccessStreamReferenceStatics, 0x857309DC,0x3FBF,0x4E7D,0x98,0x6F,0xEF,0x3B,0x1A,0x07,0xA9,0x64);

/* 运行时类名 */
static const wchar_t* CLSID_SMTC      = L"Windows.Media.SystemMediaTransportControls";
static const wchar_t* CLSID_URI       = L"Windows.Foundation.Uri";
static const wchar_t* CLSID_STREAMREF = L"Windows.Storage.Streams.RandomAccessStreamReference";
/* v7.0.2 定性纠正：SystemMediaTransportControlsTimelineProperties 是
 * 【可激活 runtime class】（windows-rs: FactoryCache + RuntimeName 实锤），
 * 默认接口 = ISystemMediaTransportControlsTimelineProperties。
 * ISystemMediaTransportControls2::UpdateTimelineProperties 的 ABI 参数是
 * 该接口的 COM 对象指针——绝不能栈上构造值结构体直传（v7.0.1 崩溃根因）。 */
static const wchar_t* CLSID_TIMELINE  = L"Windows.Media.SystemMediaTransportControlsTimelineProperties";

/* 枚举（SDK 16299 原值） */
enum { MediaPlaybackType_Unknown = 0, MediaPlaybackType_Music = 1 };
enum { MediaPlaybackStatus_Closed = 0, MediaPlaybackStatus_Changing = 1,
       MediaPlaybackStatus_Stopped = 2, MediaPlaybackStatus_Playing = 3,
       MediaPlaybackStatus_Paused = 4 };
enum { SMTCBTN_Play = 0, SMTCBTN_Pause = 1, SMTCBTN_Stop = 2, SMTCBTN_Record = 3,
       SMTCBTN_FastForward = 4, SMTCBTN_Rewind = 5, SMTCBTN_Next = 6,
       SMTCBTN_Previous = 7, SMTCBTN_ChannelUp = 8, SMTCBTN_ChannelDown = 9 };

typedef struct TimeSpan { INT64_ Duration; } TimeSpan; /* 100ns */
typedef struct EventToken { INT64_ value; } EventToken;

/* v7.0.2：TimelineProps 已是接口（见上），值结构体不再单独使用 */

/* combase.dll 动态函数指针 */
typedef HRESULT (WINAPI *PFN_RoInitialize)(int initType);
typedef HRESULT (WINAPI *PFN_RoActivateInstance)(HSTR classId, void** instance);
typedef HRESULT (WINAPI *PFN_RoGetActivationFactory)(HSTR classId, const GUID* iid, void** factory);
typedef HRESULT (WINAPI *PFN_WindowsCreateString)(const wchar_t* src, UINT32 len, HSTR* out);
typedef HRESULT (WINAPI *PFN_WindowsDeleteString)(HSTR s);
typedef const wchar_t* (WINAPI *PFN_WindowsGetStringRawBuffer)(HSTR s, UINT32* len);
static PFN_RoInitialize                 pRoInitialize;
static PFN_RoActivateInstance           pRoActivateInstance;
static PFN_RoGetActivationFactory       pRoGetActivationFactory;
static PFN_WindowsCreateString          pWindowsCreateString;
static PFN_WindowsDeleteString          pWindowsDeleteString;
static PFN_WindowsGetStringRawBuffer    pWindowsGetStringRawBuffer;

/* 前向声明 */
void Queue_SmtcEventButton(int btn);
void Queue_SmtcEventSeek(double posSec);
static HSTR mk_hstr(const wchar_t* s);
static double atof_n(const wchar_t* s);
static int atoi_n(const wchar_t* s);
static volatile LONG_ g_processType = 0;

/* ------------------------------------------------------------------ */
/* WinRT 接口 vtable（槽位序与 SDK 16299 MIDL 头一致）                    */
/* ------------------------------------------------------------------ */

typedef struct InspectableVtbl {
    /* IUnknown */
    HRESULT (WINAPI *QueryInterface)(void* self, const GUID* riid, void** out);
    ULONG_  (WINAPI *AddRef)(void* self);
    ULONG_  (WINAPI *Release)(void* self);
    /* IInspectable */
    HRESULT (WINAPI *GetIids)(void* self, ULONG_* count, GUID** iids);
    HRESULT (WINAPI *GetRuntimeClassName)(void* self, HSTR* name);
    HRESULT (WINAPI *GetTrustLevel)(void* self, int* level);
} InspectableVtbl;

/* ISystemMediaTransportControls：26 个成员槽位 */
typedef struct SMTCVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_PlaybackStatus)(void*, int* value);
    HRESULT (WINAPI *put_PlaybackStatus)(void*, int value);
    HRESULT (WINAPI *get_DisplayUpdater)(void*, void** value);
    HRESULT (WINAPI *get_SoundLevel)(void*, int* value);
    HRESULT (WINAPI *get_IsEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsPlayEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsPlayEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsStopEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsStopEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsPauseEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsPauseEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsRecordEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsRecordEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsFastForwardEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsFastForwardEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsRewindEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsRewindEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsPreviousEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsPreviousEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsNextEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsNextEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsChannelUpEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsChannelUpEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_IsChannelDownEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_IsChannelDownEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *add_ButtonPressed)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_ButtonPressed)(void*, EventToken token);
    HRESULT (WINAPI *add_PropertyChanged)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_PropertyChanged)(void*, EventToken token);
} SMTCVtbl;

/* ISystemMediaTransportControls2：15 个成员槽位 */
typedef struct SMTC2Vtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_AutoRepeatMode)(void*, int* value);
    HRESULT (WINAPI *put_AutoRepeatMode)(void*, int value);
    HRESULT (WINAPI *get_ShuffleEnabled)(void*, BOOL08* value);
    HRESULT (WINAPI *put_ShuffleEnabled)(void*, BOOL08 value);
    HRESULT (WINAPI *get_PlaybackRate)(void*, double* value);
    HRESULT (WINAPI *put_PlaybackRate)(void*, double value);
    HRESULT (WINAPI *UpdateTimelineProperties)(void*, void* timelineProperties);
    HRESULT (WINAPI *add_PlaybackPositionChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_PlaybackPositionChangeRequested)(void*, EventToken token);
    HRESULT (WINAPI *add_PlaybackRateChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_PlaybackRateChangeRequested)(void*, EventToken token);
    HRESULT (WINAPI *add_ShuffleEnabledChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_ShuffleEnabledChangeRequested)(void*, EventToken token);
    HRESULT (WINAPI *add_AutoRepeatModeChangeRequested)(void*, void* handler, EventToken* token);
    HRESULT (WINAPI *remove_AutoRepeatModeChangeRequested)(void*, EventToken token);
} SMTC2Vtbl;

/* ISystemMediaTransportControlsDisplayUpdater：12 个成员槽位 */
typedef struct DisplayUpdaterVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_Type)(void*, int* value);
    HRESULT (WINAPI *put_Type)(void*, int value);
    HRESULT (WINAPI *get_AppMediaId)(void*, HSTR* value);
    HRESULT (WINAPI *put_AppMediaId)(void*, HSTR value);
    HRESULT (WINAPI *get_Thumbnail)(void*, void** value);
    HRESULT (WINAPI *put_Thumbnail)(void*, void* value);
    HRESULT (WINAPI *get_MusicProperties)(void*, void** value);
    HRESULT (WINAPI *get_VideoProperties)(void*, void** value);
    HRESULT (WINAPI *get_ImageProperties)(void*, void** value);
    HRESULT (WINAPI *CopyFromFileAsync)(void*, int type, void* source, void** operation);
    HRESULT (WINAPI *ClearAll)(void*);
    HRESULT (WINAPI *Update)(void*);
} DisplayUpdaterVtbl;

/* IMusicDisplayProperties：6 槽位；IMusicDisplayProperties2：5 槽位 */
typedef struct MusicPropsVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_Title)(void*, HSTR* value);
    HRESULT (WINAPI *put_Title)(void*, HSTR value);
    HRESULT (WINAPI *get_AlbumArtist)(void*, HSTR* value);
    HRESULT (WINAPI *put_AlbumArtist)(void*, HSTR value);
    HRESULT (WINAPI *get_Artist)(void*, HSTR* value);
    HRESULT (WINAPI *put_Artist)(void*, HSTR value);
} MusicPropsVtbl;

typedef struct MusicProps2Vtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_AlbumTitle)(void*, HSTR* value);
    HRESULT (WINAPI *put_AlbumTitle)(void*, HSTR value);
    HRESULT (WINAPI *get_TrackNumber)(void*, UINT32* value);
    HRESULT (WINAPI *put_TrackNumber)(void*, UINT32 value);
    HRESULT (WINAPI *get_Genres)(void*, void** value);
} MusicProps2Vtbl;

/* ISystemMediaTransportControlsTimelineProperties：10 槽位
 * （windows-rs master：StartTime/EndTime/MinSeekTime/MaxSeekTime/Position
 *   五对 get/put，getter 在前；无 LastUpdatedTime） */
typedef struct TimelinePropsVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_StartTime)(void*, TimeSpan* value);
    HRESULT (WINAPI *put_StartTime)(void*, TimeSpan value);
    HRESULT (WINAPI *get_EndTime)(void*, TimeSpan* value);
    HRESULT (WINAPI *put_EndTime)(void*, TimeSpan value);
    HRESULT (WINAPI *get_MinSeekTime)(void*, TimeSpan* value);
    HRESULT (WINAPI *put_MinSeekTime)(void*, TimeSpan value);
    HRESULT (WINAPI *get_MaxSeekTime)(void*, TimeSpan* value);
    HRESULT (WINAPI *put_MaxSeekTime)(void*, TimeSpan value);
    HRESULT (WINAPI *get_Position)(void*, TimeSpan* value);
    HRESULT (WINAPI *put_Position)(void*, TimeSpan value);
} TimelinePropsVtbl;

/* 事件参数 */
typedef struct ButtonPressedArgsVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_Button)(void*, int* value);
} ButtonPressedArgsVtbl;

typedef struct PositionArgsVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *get_RequestedPlaybackPosition)(void*, TimeSpan* value);
} PositionArgsVtbl;

/* 互操作 */
typedef struct InteropVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *GetForWindow)(void* self, HWND window, const GUID* riid, void** out);
} InteropVtbl;

/* Uri 工厂 / 流引用静态工厂 */
typedef struct UriFactoryVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *CreateUri)(void* self, HSTR uri, void** instance);
    HRESULT (WINAPI *CreateWithRelativeUri)(void* self, HSTR baseUri, HSTR relativeUri, void** instance);
} UriFactoryVtbl;

typedef struct StreamRefStaticsVtbl {
    InspectableVtbl ins;
    HRESULT (WINAPI *CreateFromFile)(void* self, void* file, void** ref);
    HRESULT (WINAPI *CreateFromUri)(void* self, void* uri, void** ref);
    HRESULT (WINAPI *CreateFromStream)(void* self, void* stream, void** ref);
} StreamRefStaticsVtbl;

/* ------------------------------------------------------------------ */
/* 事件 handler 对象（实现 ITypedEventHandler 特化的 CCW）                */
/* ------------------------------------------------------------------ */

typedef struct HandlerVtbl {
    HRESULT (WINAPI *QueryInterface)(void* self, const GUID* riid, void** out);
    ULONG_  (WINAPI *AddRef)(void* self);
    ULONG_  (WINAPI *Release)(void* self);
    HRESULT (WINAPI *GetIids)(void* self, ULONG_* count, GUID** iids);
    HRESULT (WINAPI *GetRuntimeClassName)(void* self, HSTR* name);
    HRESULT (WINAPI *GetTrustLevel)(void* self, int* level);
    HRESULT (WINAPI *Invoke)(void* self, void* sender, void* args);
} HandlerVtbl;

typedef struct HandlerObj {
    HandlerVtbl* vtbl;
    volatile LONG_ refs;
    int kind; /* 0 = button, 1 = position */
} HandlerObj;

static HRESULT WINAPI h_QI(void* self, const GUID* riid, void** out) {
    HandlerObj* h = (HandlerObj*)self;
    if (!out) return E_NOINTERFACE;
    *out = NULL;
    if (!riid) return E_NOINTERFACE;
    if (memcmp(riid, &IID_IUnknown, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IInspectable, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IAgileObject, sizeof(GUID)) == 0 ||
        (h->kind == 0 && memcmp(riid, &IID_HandlerButtonPressed, sizeof(GUID)) == 0) ||
        (h->kind == 1 && memcmp(riid, &IID_HandlerPositionChange, sizeof(GUID)) == 0)) {
        InterlockedIncrement(&h->refs);
        *out = self;
        return S_OK;
    }
    return E_NOINTERFACE;
}
static ULONG_ WINAPI h_AddRef(void* self) { HandlerObj* h = (HandlerObj*)self; return InterlockedIncrement(&h->refs); }
static ULONG_ WINAPI h_Release(void* self) {
    /* 事件 handler 与进程同生命周期：永不真正释放，只递减 */
    HandlerObj* h = (HandlerObj*)self;
    return InterlockedDecrement(&h->refs);
}
static HRESULT WINAPI h_GetIids(void* self, ULONG_* count, GUID** iids) {
    (void)self; if (count) *count = 0; if (iids) *iids = NULL; return S_OK;
}
static HRESULT WINAPI h_GetRuntimeClassName(void* self, HSTR* name) {
    (void)self; if (name) *name = NULL; return E_NOTIMPL; /* 参数化接口无运行时类名 */
}
static HRESULT WINAPI h_GetTrustLevel(void* self, int* level) {
    (void)self; if (level) *level = 0; return S_OK;
}
static HRESULT WINAPI h_InvokeButton(void* self, void* sender, void* args) {
    (void)self; (void)sender;
    if (args) {
        ButtonPressedArgsVtbl* v = (ButtonPressedArgsVtbl*)(*(void**)args);
        int btn = -1;
        if (SUCCEEDED(v->get_Button(args, &btn)) && btn >= 0) Queue_SmtcEventButton(btn);
    }
    return S_OK;
}
static HRESULT WINAPI h_InvokePosition(void* self, void* sender, void* args) {
    (void)self; (void)sender;
    if (args) {
        PositionArgsVtbl* v = (PositionArgsVtbl*)(*(void**)args);
        TimeSpan ts; ts.Duration = 0;
        if (SUCCEEDED(v->get_RequestedPlaybackPosition(args, &ts)) && ts.Duration > 0)
            Queue_SmtcEventSeek((double)ts.Duration / 10000000.0);
    }
    return S_OK;
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
/* TimelineProperties CCW（v7.0.2 兜底）                                 */
/*   主路径 = RoActivateInstance(Windows.Media.SystemMediaTransport-     */
/*   ControlsTimelineProperties) + QI；若激活失败（理论上不该发生），      */
/*   用本自实现 COM 对象（实现 ISystemMediaTransportControlsTimeline-    */
/*   Properties 全部 10 槽位）顶上，保证 UpdateTimelineProperties 永远    */
/*   拿到的是 COM 对象指针，绝不会重演 v7.0.1 栈结构体直传崩溃。           */
/* ------------------------------------------------------------------ */

typedef struct TpObj {
    TimelinePropsVtbl* vtbl;
    volatile LONG_     refs;
    TimeSpan startTime, endTime, minSeek, maxSeek, position;
} TpObj;

static HRESULT WINAPI tp_QI(void* self, const GUID* riid, void** out) {
    TpObj* o = (TpObj*)self;
    if (!out) return E_POINTER;
    *out = NULL;
    if (!riid) return E_INVALIDARG;
    if (memcmp(riid, &IID_IUnknown, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IInspectable, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_IAgileObject, sizeof(GUID)) == 0 ||
        memcmp(riid, &IID_TimelineProps, sizeof(GUID)) == 0) {
        InterlockedIncrement(&o->refs);
        *out = self;
        return S_OK;
    }
    return E_NOINTERFACE;
}
static ULONG_ WINAPI tp_AddRef(void* self) { return InterlockedIncrement(&((TpObj*)self)->refs); }
static ULONG_ WINAPI tp_Release(void* self) {
    TpObj* o = (TpObj*)self;
    ULONG_ n = InterlockedDecrement(&o->refs);
    if (n == 0) HeapFree(GetProcessHeap(), 0, o);
    return n;
}
static HRESULT WINAPI tp_GetIids(void* self, ULONG_* count, GUID** iids) {
    (void)self; if (count) *count = 0; if (iids) *iids = NULL; return S_OK;
}
static HRESULT WINAPI tp_GetRuntimeClassName(void* self, HSTR* name) {
    (void)self; if (name) *name = NULL; return E_NOTIMPL;
}
static HRESULT WINAPI tp_GetTrustLevel(void* self, int* level) {
    (void)self; if (level) *level = 0; return S_OK;
}
#define TP_PROP(pname) \
static HRESULT WINAPI tp_get_##pname(void* self, TimeSpan* v) { \
    if (!v) return E_POINTER; *v = ((TpObj*)self)->pname; return S_OK; } \
static HRESULT WINAPI tp_put_##pname(void* self, TimeSpan v) { \
    ((TpObj*)self)->pname = v; return S_OK; }
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
/* 共享状态（HTTP 线程 / SMTC 线程 / 事件回调线程）                        */
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
    int     status;      /* MediaPlaybackStatus，<0 = 不变 */
    int     hasTimeline;
    double  pos;
    double  dur;
} SmtcOp;

static SRWLOCK g_lock = SRWLOCK_INIT; /* Win7+：SRWLOCK 即可用 */

static SmtcOp      g_op;                     /* 待应用的最新操作（合并） */
static char*       g_stateBlob   = NULL;     /* 插件B 上报的完整状态 JSON（原样中继） */
static SIZE_T      g_stateLen    = 0;
static char*       g_lyricBlob   = NULL;     /* 歌词 JSON（原样中继） */
static SIZE_T      g_lyricLen    = 0;
static char*       g_cmdQueue[CMDQ_CAP];     /* 页面命令（原样 JSON 行中继） */
static int         g_cmdHead = 0, g_cmdTail = 0;
static char*       g_evQueue[EVQ_CAP];       /* SMTC 事件（本 DLL 产生） */
static int         g_evHead = 0, g_evTail = 0;

static volatile LONG_ g_smtcReady   = 0;    /* SMTC 会话建立成功 */
static volatile LONG_ g_hostActive  = 0;    /* 本实例是 Host */
static volatile LONG_ g_httpPort    = 0;
static volatile LONG_ g_updApplied  = 0;
static volatile LONG_ g_metaApplied = 0;
static volatile LONG_ g_eventsIn    = 0;
static volatile LONG_ g_lastHr      = 0;

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

/* ------------------------------------------------------------------ */
/* 文件日志（DLL 同目录 native-log.txt；报障直接发此文件）              */
/* ------------------------------------------------------------------ */

static HMODULE g_hSelf = NULL; /* 本 DLL 模块句柄（FROM_ADDRESS 取） */

static void logf_line(const char* fmt, ...) {
    wchar_t path[MAX_PATH];
    if (!g_hSelf) return;
    if (!GetModuleFileNameW(g_hSelf, path, MAX_PATH)) return;
    wchar_t* cut = wcsrchr(path, L'\\');
    if (!cut) return;
    wcscpy(cut + 1, L"native-log.txt");
    /* 超过 1.5MB 重开（防无限增长） */
    WIN32_FIND_DATAW fd;
    HANDLE fh = FindFirstFileW(path, &fd);
    if (fh != INVALID_HANDLE_VALUE) {
        FindClose(fh);
        if (fd.nFileSizeHigh == 0 && fd.nFileSizeLow > 1536 * 1024)
            DeleteFileW(path);
    }
    FILE* f = _wfopen(path, L"ab");
    if (!f) return;
    SYSTEMTIME st;
    GetLocalTime(&st);
    fprintf(f, "[%02u-%02u %02u:%02u:%02u.%03u][pid %lu] ",
        st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, st.wMilliseconds,
        (unsigned long)GetCurrentProcessId());
    va_list ap;
    va_start(ap, fmt);
    vfprintf(f, fmt, ap);
    va_end(ap);
    fputc('\n', f);
    fclose(f);
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
    int drop = 0;
    AcquireSRWLockExclusive(&g_lock);
    int next = (g_evTail + 1) % EVQ_CAP;
    if (next == g_evHead) { /* 满：丢最旧 */
        HeapFree(GetProcessHeap(), 0, g_evQueue[g_evHead]);
        g_evHead = (g_evHead + 1) % EVQ_CAP;
        drop = 1;
    }
    g_evQueue[g_evTail] = copy;
    g_evTail = next;
    ReleaseSRWLockExclusive(&g_lock);
    InterlockedIncrement(&g_eventsIn);
    (void)drop;
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
/* SMTC 会话线程                                                        */
/* ------------------------------------------------------------------ */

/* 运行时类名 HSTRING（smtc_thread 开头一次性建立） */
static HSTR g_hClsSmtc, g_hClsUri, g_hClsStreamRef, g_hClsTimeline;
#define mk_hstr_once(cls)  \
    ( (cls) == CLSID_URI ? g_hClsUri \
    : (cls) == CLSID_TIMELINE ? g_hClsTimeline \
    : g_hClsStreamRef )

static HSTR mk_hstr(const wchar_t* s) {
    HSTR h = NULL;
    UINT32 len = 0;
    while (s[len]) len++;
    if (FAILED(pWindowsCreateString(s, len, &h))) return NULL;
    return h;
}

static void apply_op(SmtcOp* op, void* smtc, void* smtc2) {
    SMTCVtbl* v = (SMTCVtbl*)(*(void**)smtc);
    HRESULT hr;

    /* 1) 元数据（仅变化时） */
    static wchar_t lastTitle[192], lastArtist[192], lastAlbum[192], lastCover[768];
    static int lastMetaValid = 0;
    int metaChanged = op->hasMeta && (!lastMetaValid ||
        wcscmp(lastTitle, op->title) || wcscmp(lastArtist, op->artist) ||
        wcscmp(lastAlbum, op->album) || wcscmp(lastCover, op->cover));

    if (metaChanged) {
        void* updater = NULL;
        hr = v->get_DisplayUpdater(smtc, &updater);
        if (SUCCEEDED(hr) && updater) {
            DisplayUpdaterVtbl* du = (DisplayUpdaterVtbl*)(*(void**)updater);
            du->put_Type(updater, MediaPlaybackType_Music);

            void* music = NULL;
            if (SUCCEEDED(du->get_MusicProperties(updater, &music)) && music) {
                MusicPropsVtbl* mp = (MusicPropsVtbl*)(*(void**)music);
                HSTR hTitle = mk_hstr(op->title[0] ? op->title : L"未知曲目");
                HSTR hArtist = mk_hstr(op->artist);
                if (hTitle) { mp->put_Title(music, hTitle); pWindowsDeleteString(hTitle); }
                if (hArtist) { mp->put_Artist(music, hArtist); pWindowsDeleteString(hArtist); }
                void* music2 = NULL;
                if (SUCCEEDED(((InspectableVtbl*)mp)->QueryInterface(music, &IID_MusicDisplayProperties2, &music2)) && music2) {
                    MusicProps2Vtbl* mp2 = (MusicProps2Vtbl*)(*(void**)music2);
                    HSTR hAlbum = mk_hstr(op->album);
                    if (hAlbum) { mp2->put_AlbumTitle(music2, hAlbum); pWindowsDeleteString(hAlbum); }
                    ((InspectableVtbl*)mp2)->Release(music2);
                }
                ((InspectableVtbl*)mp)->Release(music);
            }

            /* 封面 */
            if (op->cover[0]) {
                void* uriFactory = NULL;
                if (SUCCEEDED(pRoGetActivationFactory(mk_hstr_once(CLSID_URI), &IID_UriRuntimeClassFactory, &uriFactory)) && uriFactory) {
                    UriFactoryVtbl* uf = (UriFactoryVtbl*)(*(void**)uriFactory);
                    HSTR hCover = mk_hstr(op->cover);
                    void* uri = NULL;
                    if (hCover && SUCCEEDED(uf->CreateUri(uriFactory, hCover, &uri)) && uri) {
                        void* refStatics = NULL;
                        if (SUCCEEDED(pRoGetActivationFactory(mk_hstr_once(CLSID_STREAMREF), &IID_RandomAccessStreamReferenceStatics, &refStatics)) && refStatics) {
                            StreamRefStaticsVtbl* rs = (StreamRefStaticsVtbl*)(*(void**)refStatics);
                            void* streamRef = NULL;
                            if (SUCCEEDED(rs->CreateFromUri(refStatics, uri, &streamRef)) && streamRef) {
                                du->put_Thumbnail(updater, streamRef);
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
            du->Update(updater);
            ((InspectableVtbl*)(*(void**)updater))->Release(updater);
            InterlockedIncrement(&g_metaApplied);
            wcsncpy(lastTitle, op->title, 191); lastTitle[191] = 0;
            wcsncpy(lastArtist, op->artist, 191); lastArtist[191] = 0;
            wcsncpy(lastAlbum, op->album, 191); lastAlbum[191] = 0;
            wcsncpy(lastCover, op->cover, 767); lastCover[767] = 0;
            lastMetaValid = 1;
        } else {
            g_lastHr = hr;
        }
    }

    /* 2) 播放状态 */
    if (op->status >= 0) {
        static int lastStatus = -999;
        if (op->status != lastStatus) {
            hr = v->put_PlaybackStatus(smtc, op->status);
            if (SUCCEEDED(hr)) lastStatus = op->status; else g_lastHr = hr;
        }
    }

    /* 3) 时间线（可拖进度条的先决条件：Min/MaxSeekTime 必设）。
     *    v7.0.2 根因修复：UpdateTimelineProperties 的 ABI 参数是
     *    ISystemMediaTransportControlsTimelineProperties 的 COM 对象指针。
     *    主路径 = RoActivateInstance(TimelineProperties 类) → QI → 逐属性 put；
     *    激活/QI 失败则回退自实现 CCW 对象（TpObj），绝不再裸结构体直传。 */
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

            void* tp = NULL;
            void* osInst = NULL;
            TpObj* ccw = NULL;
            if (pRoActivateInstance && g_hClsTimeline) {
                void* inst = NULL;
                HRESULT hrA = pRoActivateInstance(g_hClsTimeline, &inst);
                if (SUCCEEDED(hrA) && inst) {
                    if (SUCCEEDED(((InspectableVtbl*)inst)->QueryInterface(inst, &IID_TimelineProps, &tp))) {
                        osInst = inst; /* 持有实例：tp 生命周期与实例一致 */
                    } else {
                        ((InspectableVtbl*)inst)->Release(inst);
                    }
                } else {
                    logf_line("[upd] RoActivateInstance(TimelineProps) hr=0x%08lX，用 CCW 兜底", (unsigned long)hrA);
                }
            }
            if (!tp) {
                ccw = TpObj_Create();
                tp = (void*)ccw;
            }
            if (tp) {
                TimelinePropsVtbl* tv = (TimelinePropsVtbl*)(*(void**)tp);
                int ok = 1;
                ok &= (SUCCEEDED(tv->put_StartTime(tp, tZero)) ? 1 : 0);
                ok &= (SUCCEEDED(tv->put_EndTime(tp, tEnd)) ? 1 : 0);
                ok &= (SUCCEEDED(tv->put_MinSeekTime(tp, tZero)) ? 1 : 0);
                ok &= (SUCCEEDED(tv->put_MaxSeekTime(tp, tEnd)) ? 1 : 0);
                ok &= (SUCCEEDED(tv->put_Position(tp, tPos)) ? 1 : 0);
                hr = ((SMTC2Vtbl*)(*(void**)smtc2))->UpdateTimelineProperties(smtc2, tp);
                if (SUCCEEDED(hr) && ok) {
                    if (lastPos < 0)
                        logf_line("[upd] timeline applied first time pos=%.2f dur=%.2f src=%s",
                                  op->pos, op->dur, osInst ? "os" : "ccw");
                    lastPos = op->pos; lastDur = op->dur;
                    InterlockedIncrement(&g_updApplied);
                } else {
                    g_lastHr = SUCCEEDED(hr) ? (HRESULT)0x80004005L : hr;
                    logf_line("[upd] UpdateTimelineProperties hr=0x%08lX propsOk=%d src=%s",
                              (unsigned long)hr, ok, osInst ? "os" : "ccw");
                }
                if (osInst) ((InspectableVtbl*)osInst)->Release(osInst);
                else if (ccw) tp_Release(ccw);
            } else {
                logf_line("[upd] TimelineProps object create failed (OOM)");
            }
        }
    }
}

static HANDLE g_hostMutex = NULL; /* Host 互斥体：持至进程退出或让位 */

/* SMTC 注册失败时释放互斥体让位，让其它进程有机会当 Host */
static void Relinquish_Host(void) {
    if (g_hostMutex) {
        ReleaseMutex(g_hostMutex);
        CloseHandle(g_hostMutex);
        g_hostMutex = NULL;
    }
    InterlockedExchange(&g_hostActive, 0);
}

static DWORD WINAPI smtc_thread(LPVOID param) {
    (void)param;
    HMODULE combase = GetModuleHandleW(L"combase.dll");
    if (!combase) combase = LoadLibraryW(L"combase.dll");
    if (!combase) { logf_line("[smtc] combase.dll not found, give up host"); Relinquish_Host(); return 1; }
    pRoInitialize              = (PFN_RoInitialize)(void*)GetProcAddress(combase, "RoInitialize");
    pRoActivateInstance        = (PFN_RoActivateInstance)(void*)GetProcAddress(combase, "RoActivateInstance");
    pRoGetActivationFactory    = (PFN_RoGetActivationFactory)(void*)GetProcAddress(combase, "RoGetActivationFactory");
    pWindowsCreateString       = (PFN_WindowsCreateString)(void*)GetProcAddress(combase, "WindowsCreateString");
    pWindowsDeleteString       = (PFN_WindowsDeleteString)(void*)GetProcAddress(combase, "WindowsDeleteString");
    pWindowsGetStringRawBuffer = (PFN_WindowsGetStringRawBuffer)(void*)GetProcAddress(combase, "WindowsGetStringRawBuffer");
    if (!pRoInitialize || !pRoActivateInstance || !pRoGetActivationFactory ||
        !pWindowsCreateString || !pWindowsDeleteString) {
        logf_line("[smtc] combase exports missing, give up host");
        Relinquish_Host(); return 1;
    }

    HRESULT hr = pRoInitialize(1 /* RO_INIT_MULTITHREADED */);
    if (FAILED(hr) && hr != (HRESULT)0x80010106L /* RPC_E_CHANGED_MODE */) {
        logf_line("[smtc] RoInitialize hr=0x%08lX, give up host", (unsigned long)hr);
        Relinquish_Host(); return 1;
    }
    logf_line("[smtc] RoInitialize ok (MTA)");

    /* 类名 HSTRING 一次性建立 */
    g_hClsSmtc      = mk_hstr(CLSID_SMTC);
    g_hClsUri       = mk_hstr(CLSID_URI);
    g_hClsStreamRef = mk_hstr(CLSID_STREAMREF);
    g_hClsTimeline  = mk_hstr(CLSID_TIMELINE);
    if (!g_hClsSmtc || !g_hClsUri || !g_hClsStreamRef || !g_hClsTimeline) {
        logf_line("[smtc] HSTRING create failed, give up host");
        Relinquish_Host(); return 1;
    }

    /* 隐藏宿主窗口（自有窗口 = 独立会话，绝不触碰网易云自己的窗口） */
    WNDCLASSW wc; memset(&wc, 0, sizeof(wc));
    wc.lpfnWndProc = DefWindowProcW;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.lpszClassName = WINDOW_CLASSW;
    if (!RegisterClassW(&wc)) {
        logf_line("[smtc] RegisterClass failed %lu, give up host", (unsigned long)GetLastError());
        Relinquish_Host(); return 1;
    }
    HWND hwnd = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, WINDOW_CLASSW,
        L"ChuShi SMTC Host", WS_OVERLAPPED, 0, 0, 0, 0, NULL, NULL, wc.hInstance, NULL);
    if (!hwnd) {
        logf_line("[smtc] CreateWindow failed %lu, give up host", (unsigned long)GetLastError());
        Relinquish_Host(); return 1;
    }
    logf_line("[smtc] host window created");

    /* SMTC 会话：经互操作接口从自有窗口取会话
     * （IID_SMTCInterop = DDB0472D-C911-4A1F-86D9-DC3D71A95F5A，已对照
     *   MinGW-w64 官方 systemmediatransportcontrolsinterop.idl 验证） */
    void* interop = NULL;
    hr = pRoGetActivationFactory(g_hClsSmtc, &IID_SMTCInterop, &interop);
    if (FAILED(hr) || !interop) {
        g_lastHr = hr;
        logf_line("[smtc] RoGetActivationFactory(Interop) hr=0x%08lX, give up host", (unsigned long)hr);
        Relinquish_Host(); return 1;
    }
    InteropVtbl* iv = (InteropVtbl*)(*(void**)interop);
    void* smtc = NULL;
    hr = iv->GetForWindow(interop, hwnd, &IID_SMTC, &smtc);
    ((InspectableVtbl*)(*(void**)interop))->Release(interop);
    if (FAILED(hr) || !smtc) {
        g_lastHr = hr;
        logf_line("[smtc] GetForWindow hr=0x%08lX, give up host", (unsigned long)hr);
        Relinquish_Host(); return 1;
    }
    logf_line("[smtc] GetForWindow OK — system media session registered");

    SMTCVtbl* sv = (SMTCVtbl*)(*(void**)smtc);
    BOOL08 one = 1;
    sv->put_IsEnabled(smtc, one);
    sv->put_IsPlayEnabled(smtc, one);
    sv->put_IsPauseEnabled(smtc, one);
    sv->put_IsNextEnabled(smtc, one);
    sv->put_IsPreviousEnabled(smtc, one);
    BOOL08 zero = 0;
    sv->put_IsStopEnabled(smtc, zero);
    sv->put_IsRecordEnabled(smtc, zero);
    sv->put_IsChannelUpEnabled(smtc, zero);
    sv->put_IsChannelDownEnabled(smtc, zero);

    /* SMTC2：时间线 + 拖动请求事件 */
    void* smtc2 = NULL;
    if (SUCCEEDED(((InspectableVtbl*)sv)->QueryInterface(smtc, &IID_SMTC2, &smtc2)) && smtc2) {
        SMTC2Vtbl* s2 = (SMTC2Vtbl*)(*(void**)smtc2);
        EventToken tok; tok.value = 0;
        hr = s2->add_PlaybackPositionChangeRequested(smtc2, &g_handlerPosition, &tok);
        logf_line("[smtc] add_PlaybackPositionChangeRequested hr=0x%08lX", (unsigned long)hr);
    } else {
        logf_line("[smtc] SMTC2 QI failed hr=0x%08lX (拖动请求不可用)", (unsigned long)((HRESULT)0));
    }
    /* 媒体键事件 */
    {
        EventToken tok; tok.value = 0;
        hr = sv->add_ButtonPressed(smtc, &g_handlerButton, &tok);
        logf_line("[smtc] add_ButtonPressed hr=0x%08lX", (unsigned long)hr);
    }

    InterlockedExchange(&g_smtcReady, 1);

    SetTimer(hwnd, 1, 100, NULL);
    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        if (msg.message == WM_TIMER && msg.hwnd == hwnd) {
            SmtcOp local; int has = 0;
            AcquireSRWLockShared(&g_lock);
            if (g_op.pending) { local = g_op; has = 1; }
            ReleaseSRWLockShared(&g_lock);
            if (has) {
                AcquireSRWLockExclusive(&g_lock);
                g_op.pending = 0;
                ReleaseSRWLockExclusive(&g_lock);
                apply_op(&local, smtc, smtc2);
            }
        }
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* HTTP 枢纽线程                                                        */
/* ------------------------------------------------------------------ */

#define RESP_MAX (BLOB_MAX + 4096)

static volatile LONG_ g_activeConns = 0; /* 当前连接数（过载保护） */
static DWORD WINAPI conn_thread(LPVOID param); /* 前向声明：每连接一线程 */

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
    /* percent-decode -> UTF-8 bytes -> UTF-16 */
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

/* 从 urlencoded body 取字段（裁剪长度，防注入超长） */
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

    /* 读头部 */
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

    /* 路由（忽略 query string，路径精确匹配） */
    char route[2048];
    strncpy(route, path, sizeof(route) - 1);
    route[sizeof(route) - 1] = 0;
    char* qm = strchr(route, '?');
    if (qm) *qm = 0;

    if (strcmp(method, "OPTIONS") == 0) {
        http_send(s, "204 No Content", "text/plain", "", 0);
    } else if (strcmp(route, "/api/ping") == 0 && strcmp(method, "GET") == 0) {
        char buf[192];
        snprintf(buf, sizeof(buf),
            "{\"ok\":true,\"name\":\"%s\",\"version\":\"%s\",\"pid\":%lu,\"host\":%s,\"port\":%lu}",
            HUB_NAME, PLUGIN_VERSION, (unsigned long)GetCurrentProcessId(),
            g_hostActive ? "true" : "false", (unsigned long)g_httpPort);
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
        /* 出队全部命令 */
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
            "\"eventsEmitted\":%lu,\"lastHr\":\"0x%08lX\"}",
            g_smtcReady ? "true" : "false",
            (unsigned long)g_updApplied, (unsigned long)g_metaApplied,
            (unsigned long)g_eventsIn, (unsigned long)g_lastHr);
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
        logf_line("[http] listen failed (all ports busy or no socket)");
        return 1;
    }
    logf_line("[http] hub listening on 127.0.0.1:%lu", (unsigned long)g_httpPort);
    /* v7.0.1：每连接一线程，避免慢客户端串行阻塞心跳推送 */
    for (;;) {
        SOCKET c = accept(lsn, NULL, NULL);
        if (c == INVALID_SOCKET) continue;
        DWORD tv = 2500;
        setsockopt(c, SOL_SOCKET, SO_RCVTIMEO, (const char*)&tv, sizeof(tv));
        setsockopt(c, SOL_SOCKET, SO_SNDTIMEO, (const char*)&tv, sizeof(tv));
        InterlockedIncrement(&g_activeConns);
        if (g_activeConns > 32) { /* 过载保护：直接拒绝 */
            InterlockedDecrement(&g_activeConns);
            shutdown(c, SD_BOTH);
            closesocket(c);
            continue;
        }
        HANDLE th = CreateThread(NULL, 0, conn_thread, (LPVOID)(intptr_t)c, 0, NULL);
        if (th) CloseHandle(th);
        else { /* 线程创建失败：同步处理兑底 */
            handle_client(c);
            shutdown(c, SD_BOTH);
            closesocket(c);
            InterlockedDecrement(&g_activeConns);
        }
    }
    return 0;
}

/* ------------------------------------------------------------------ */
/* BetterNCM 原生插件入口                                               */
/* ------------------------------------------------------------------ */

/* 原生 API：诊断信息（渲染进程注册；参数形态 [String]，1 个。
 * BetterNCM v2 ABI：NativeAPIType{ Int=0, Boolean=1, Double=2, String=3, V8Value=4 }） */
static char g_infoBuf[256];
static char* native_info(void** args) {
    (void)args;
    snprintf(g_infoBuf, sizeof(g_infoBuf),
        "{\"ok\":true,\"plugin\":\"ChuShi SMTC Manager\",\"version\":\"%s\","
        "\"processType\":%ld,\"host\":%s,\"smtcReady\":%s}",
        PLUGIN_VERSION, (long)g_processType,
        g_hostActive ? "true" : "false", g_smtcReady ? "true" : "false");
    return g_infoBuf;
}

/* 每连接工作线程 */
static DWORD WINAPI conn_thread(LPVOID param) {
    SOCKET c = (SOCKET)(intptr_t)param;
    handle_client(c);
    shutdown(c, SD_BOTH);
    closesocket(c);
    InterlockedDecrement(&g_activeConns);
    return 0;
}

void WINAPI BetterNCMPluginMain(void* apiPtr) {
    /* BetterNCMNativePlugin::PluginAPI 布局（对照 NanoRocky/BetterNCM v2
       src/BetterNCMNativePlugin.h）：
       [0] addNativeAPI fn  [1] betterncmVersion char*  [2] processType int  [3] ncmVersion ptr */
    void** api = (void**)apiPtr;

    /* 日志需要本 DLL 路径：从函数地址反查模块句柄 */
    GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                       GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                       (LPCWSTR)&BetterNCMPluginMain, &g_hSelf);

    if (!api) return;
    typedef int (*AddNativeAPIFn)(int* args, int argsNum, const char* identifier, char* (*fn)(void**));
    AddNativeAPIFn addNativeAPI = (AddNativeAPIFn)api[0];
    LONG_ ptype = (LONG_)(intptr_t)api[2];
    InterlockedExchange(&g_processType, ptype);

    logf_line("[boot] ChuShi SMTC Manager native v%s loaded (ptype=0x%lX)",
        PLUGIN_VERSION, (unsigned long)ptype);

    lock_init_all();

    /* GPU/Utility 进程：完全静默（NCMProcessType: Main=0x1 Renderer=0x10） */
    if (ptype != 0x1 /*Main*/ && ptype != 0x10 /*Renderer*/) return;

    /* 注册诊断 API（仅渲染进程生效，BetterNCM 侧已做门禁） */
    if (addNativeAPI) {
        static int argTypes[1] = { 3 /* String */ };
        addNativeAPI(argTypes, 1, "ChuShi.Smtc.info", native_info);
    }

    /* Host 选举：同机只允许一个 Host；SMTC 注册失败时自动让位（v7.0.1） */
    HANDLE mx = CreateMutexW(NULL, TRUE, MUTEX_NAMEW);
    if (!mx) { logf_line("[boot] CreateMutex failed %lu", (unsigned long)GetLastError()); return; }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        /* 已有 Host：不是候选，直接退出 */
        CloseHandle(mx);
        logf_line("[boot] another host already active, standby");
        return;
    }
    g_hostMutex = mx; /* 交由 smtc_thread 持有；失败路径 Relinquish_Host 释放 */
    InterlockedExchange(&g_hostActive, 1);
    logf_line("[boot] elected as host, starting smtc + http threads");

    HANDLE t1 = CreateThread(NULL, 0, smtc_thread, NULL, 0, NULL);
    HANDLE t2 = CreateThread(NULL, 0, http_thread, NULL, 0, NULL);
    if (t1) CloseHandle(t1);
    if (t2) CloseHandle(t2);
}
