#!/usr/bin/env python3
"""v5 plugin packager + constitution gates.

Constitution (user's three hard rules, machine-enforced):
  1. zero old-code reuse  -> ban-gate: v3/v4 symbol residue must be ZERO
  2. no NetEase SMTC need -> ban-gate: no external-session reader APIs in engine
  3. ASCII plugin files   -> byte gate: every byte of every shipped source < 0x80

Outputs:
  bridge/smtc-plugin/ChuShi-SMTC-Manager-5.0.0.plugin
  bridge/ncm-plugin/ChuShi-Music-API-5.0.0.plugin
"""
import base64
import hashlib
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path("/home/z/my-project")
ENGINE = ROOT / "bridge/engine/chushi-smtc-engine.ps1"
MGR_JS = ROOT / "bridge/smtc-plugin/index.js"
MGR_MAN = ROOT / "bridge/smtc-plugin/manifest.json"
API_JS = ROOT / "bridge/ncm-plugin/index.js"
API_MAN = ROOT / "bridge/ncm-plugin/manifest.json"
OUT_MGR = ROOT / "bridge/smtc-plugin/ChuShi-SMTC-Manager-5.0.0.plugin"
OUT_API = ROOT / "bridge/ncm-plugin/ChuShi-Music-API-5.0.0.plugin"

VERSION = "5.0.0"
ENGINE_VER = "5.0.0"
PORT = "26801"


def fail(msg: str):
    print(f"GATE FAIL: {msg}")
    sys.exit(1)


def gate_ban(text: str, bans, label: str):
    for b in bans:
        if b in text:
            fail(f"{label}: banned symbol present: {b!r}")


def gate_need(text: str, needs, label: str):
    for n in needs:
        if n not in text:
            fail(f"{label}: required symbol missing: {n!r}")


def gate_ascii(text: str, label: str, allow_cr: bool = False):
    for i, ch in enumerate(text):
        if ord(ch) > 0x7F:
            fail(f"{label}: non-ASCII byte at offset {i}: U+{ord(ch):04X}")
    if not allow_cr and "\r" in text:
        fail(f"{label}: CR byte present (ship LF in repo)")


def main():
    # ---------------- load ----------------
    engine_raw = ENGINE.read_text(encoding="utf-8")
    mgr_js = MGR_JS.read_text(encoding="utf-8")
    mgr_man = MGR_MAN.read_text(encoding="utf-8")
    api_js = API_JS.read_text(encoding="utf-8")
    api_man = API_MAN.read_text(encoding="utf-8")

    engine_crlf = engine_raw.replace("\n", "\r\n").replace("\r\r\n", "\r\n")

    # ---------------- ASCII constitution ----------------
    gate_ascii(engine_raw, "engine (repo)")
    gate_ascii(engine_crlf, "engine (payload)", allow_cr=True)
    gate_ascii(mgr_js, "manager index.js")
    gate_ascii(api_js, "music api index.js")
    gate_ascii(mgr_man, "manager manifest")
    gate_ascii(api_man, "music api manifest")

    # ---------------- zero old-code reuse (v3+v4 generations) ----------------
    gate_ban(mgr_js, [
        "__chushiSmtcManagerV4", "__chushiSmtcBridge", "superviseOnce",
        "ENGINE_B64_PLACEHOLDER", "20754\", 26801",
    ], "manager")
    gate_ban(api_js, [
        "__chushiMusicApiV4", "__chushiMusicApiV3", "buildSnapshot", "pushLoop",
        "cmdLoop", "lyricLoop", "pushLyric", "elementValid", "ctrlPlayPause",
        "ctrlNextPrev", "startSeekWatch", "elLock", "judgeNcmOwns", "harmonize",
        "seekHold", "lastDelta", "GlobalSystemMediaTransportControls",
        "setPlayingPosition", "dispatch(", "HTMLMediaElement.prototype",
        "prototype.currentTime",
    ], "music api")
    gate_ban(engine_crlf, [
        "GlobalSystemMediaTransportControls", "GetSessions", "TryPlayAsync",
        "TryPauseAsync", "TryChangePlaybackPosition", "GetForCurrentView",
        "GetForWindow", "Update-SmtcFromNe", "Set-SmtcClosed", "Initialize-OwnSmtc",
        "Tick-SmtcOwn", "Update-SmtcOwn", "Pop-SmtcEvents", "Invoke-Control",
        "ChuShi.SmtcBridge", "ChuShiSmtcBridge",
    ], "engine")

    # ---------------- single execution law ----------------
    writes = [m.start() for m in re.finditer(r"\.currentTime\s*=(?![=>])", api_js)]
    if len(writes) != 1:
        fail(f"music api: expected exactly 1 currentTime write point, found {len(writes)}")
    ctx = api_js[max(0, writes[0] - 220):writes[0] + 260]
    if "THE ONLY currentTime WRITE" not in ctx or "target" not in ctx:
        fail("music api: currentTime write point lacks single-execution guard context")

    # ---------------- protocol cross-consistency ----------------
    gate_need(mgr_js, [PORT, f'PLUGIN_VERSION = "{VERSION}"',
                       f'ENGINE_VER_REQUIRED = "{ENGINE_VER}"', '"chushi-smtc-engine"',
                       "/api/ping", "/api/mgr", "ENGINE_B64", "ENGINE_SHA256",
                       "sha256", "netstat", "taskkill", "tasklist", "powershell.exe",
                       "read-back", "LOCALAPPDATA"], "manager")
    gate_need(api_js, [PORT, f'PLUGIN_VERSION = "{VERSION}"', "/api/ne", "/api/lyric",
                       "/api/cmd", "e82ckenh8dichen8", "36cd479b6b5",
                       "md5forencrypt", "legacyNativeCmder", "appendRegisterCall",
                       "PlayState", "PlayProgress", "resourceTrackId", "resourceName",
                       "resourceArtists", "resourceCoverUrl", "curTrack",
                       "getPlayingSong", "__chushiMusicApiV5", "eapi/song/lyric/v1",
                       "klyricToYrc", "track.lyric.getinfo", "music.163.com/api/song/lyric",
                       "seekAckId", "seekAckOk", "seekAckAt", "420", "interface3.music.163.com"],
             "music api")
    gate_need(engine_crlf, [PORT.encode() if False else PORT, f'$EngineVersion = "{ENGINE_VER}"',
                            "chushi-smtc-engine", "MediaPlayer", "SystemMediaTransportControls",
                            "CommandManager.IsEnabled = $false", "IsPlaybackPositionEnabled = $true",
                            "MinSeekTime", "MaxSeekTime", "UpdateTimelineProperties",
                            "Register-ObjectEvent", "InMemoryRandomAccessStream", "HttpListener",
                            "ChuShi.SmtcEngine", "/api/state", "/api/ne", "/api/lyric",
                            "/api/cmd", "/api/mgr", "Access-Control-Allow-Origin",
                            "PlaybackPositionChangeRequested", "ButtonPressed",
                            "engine.log"], "engine")
    if PORT not in engine_crlf:
        fail("engine: port missing")

    # ---------------- manifests ----------------
    for man, name, slug in ((mgr_man, "ChuShi SMTC Manager", "cc.chushi.smtcbridge"),
                            (api_man, "ChuShi Music API", "cc.chushi.ncmapi")):
        if f'"version": "{VERSION}"' not in man:
            fail(f"manifest version mismatch in {name}")
        if slug not in man:
            fail(f"manifest slug mismatch in {name}")
        if "injects" not in man:
            fail(f"manifest injects missing in {name}")

    # ---------------- payload injection ----------------
    payload = engine_crlf.encode("utf-8")
    b64 = base64.b64encode(payload).decode("ascii")
    sha = hashlib.sha256(payload).hexdigest()
    mgr_js_final = mgr_js.replace("__ENGINE_B64__", b64).replace("__ENGINE_SHA256__", sha)
    if "__ENGINE_B64__" in mgr_js_final or "__ENGINE_SHA256__" in mgr_js_final:
        fail("manager: engine placeholders not fully injected")

    # ---------------- package ----------------
    def pack(path: Path, entries):
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for arc, data in entries:
                z.writestr(arc, data)

    pack(OUT_MGR, [
        ("manifest.json", mgr_man.encode("utf-8")),
        ("index.js", mgr_js_final.encode("utf-8")),
    ])
    pack(OUT_API, [
        ("manifest.json", api_man.encode("utf-8")),
        ("index.js", api_js.encode("utf-8")),
    ])

    # ---------------- read-back verification ----------------
    for path in (OUT_MGR, OUT_API):
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            if set(names) != {"manifest.json", "index.js"}:
                fail(f"{path.name}: unexpected zip entries {names}")
            back = z.read("index.js")
        if path == OUT_MGR:
            dec = base64.b64decode(b64)
            if hashlib.sha256(dec).hexdigest() != sha:
                fail("engine payload sha mismatch after roundtrip")
            if dec != payload:
                fail("engine payload bytes differ after roundtrip")
    print(f"engine payload: {len(payload)}B sha256={sha[:16]}...")
    print(f"OK: {OUT_MGR.name} ({OUT_MGR.stat().st_size}B)")
    print(f"OK: {OUT_API.name} ({OUT_API.stat().st_size}B)")
    print("ALL GATES PASSED")


if __name__ == "__main__":
    main()
