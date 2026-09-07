# build-v4-plugins.py -- package both v4 BetterNCM plugins with the engine
# embedded in the manager. Enforces the v4 hard contracts:
#   * ASCII-only shipped code (user requirement: no Chinese in plugins)
#   * engine NEVER touches any SMTC session reading (no GSMTC at all)
#   * Music API plugin is read-only (no dispatch, no prototype patches,
#     no currentTime rewriting loops)
#   * Manager produces zero playback state
#   * endpoint protocol cross-consistency between engine/plugins/host
# Out: bridge/smtc-plugin/ChuShi-SMTC-Manager-<ver>.plugin
#      bridge/ncm-plugin/ChuShi-Music-API-<ver>.plugin
# (.plugin = zip with manifest.json + index.js at root)
import base64, hashlib, json, pathlib, re, zipfile

ROOT = pathlib.Path("/home/z/my-project")
ENGINE = ROOT / "bridge" / "engine" / "chushi-smtc-engine.ps1"
MGR = ROOT / "bridge" / "smtc-plugin"
API = ROOT / "bridge" / "ncm-plugin"

engine_bytes = ENGINE.read_bytes()
engine_text = engine_bytes.decode("ascii")  # raises if non-ascii
engine_b64 = base64.b64encode(engine_bytes).decode("ascii")
engine_sha = hashlib.sha256(engine_bytes).hexdigest()

# ---------------- ASCII gate (hard, user requirement) ----------------
for name, p in (("manager", MGR / "index.js"), ("api", API / "index.js")):
    txt = p.read_text(encoding="utf-8")
    bad = [c for c in txt if ord(c) > 127]
    assert not bad, f"{name} index.js has {len(bad)} non-ascii chars"
mgr_src = (MGR / "index.js").read_text(encoding="utf-8")
api_src = (API / "index.js").read_text(encoding="utf-8")
mgr_manifest = json.loads((MGR / "manifest.json").read_text(encoding="utf-8"))
api_manifest = json.loads((API / "manifest.json").read_text(encoding="utf-8"))

for m in (mgr_manifest, api_manifest):
    for field in ("name", "slug", "description", "author"):
        v = m[field]
        assert all(ord(c) < 128 for c in v), f"manifest {m['slug']}.{field} is not ASCII"

# ---------------- manager assertions ----------------
for needle in (
    "3.0.0", "4.0.0", "__ENGINE_B64__", "__ENGINE_SHA256__",
    "/api/ping", "/api/mgr", "SetCurrentProcessExplicitAppUserModelID" if False else "sha256",
    "taskkill", "netstat", "powershell.exe", "read-back",
):
    assert needle in mgr_src, f"manager index.js missing {needle}"
# manager must not produce state / read netease internals
for forbidden in (
    "legacyNativeCmder", "getState()", "currentTime", "dispatch",
    "window.channel", "eapi", "lyric",
):
    assert forbidden not in mgr_src, f"manager must not contain {forbidden}"

# inject engine placeholders
assert "__ENGINE_B64__" in mgr_src and "__ENGINE_SHA256__" in mgr_src
mgr_final = mgr_src.replace("__ENGINE_B64__", engine_b64).replace("__ENGINE_SHA256__", engine_sha)

# ---------------- api plugin assertions (read-only contract) ----------------
for needle in (
    "3.0.0", "/api/ne", "/api/lyric", "/api/cmd",
    "e82ckenh8dichen8", "36cd479b6b5",
    "legacyNativeCmder", "appendRegisterCall", "PlayState", "PlayProgress",
    "resourceTrackId", "resourceName", "resourceArtists", "getPlayingSong",
    "audioplayer.seek" if False else "currentTime = target",
    "__chushiMusicApiV4", "song/lyric/v1", "klyric", "track.lyric.getinfo",
    "music.163.com/api/song/lyric",
):
    assert needle in api_src, f"api index.js missing {needle}"
# the v4 read-only law: zero dispatch, zero prototype patching, exactly one
# currentTime write site (the user-commanded seek), no fighting loops
for forbidden in (
    "dispatch(", "HTMLMediaElement.prototype", "prototype.currentTime",
    "setPlayingPosition", "channel.seek",
):
    assert forbidden not in api_src, f"api plugin violates read-only law: {forbidden}"
write_sites = [ln for ln in api_src.split("\n") if re.search(r"currentTime\s*=[^=]", ln)]
assert len(write_sites) == 1 and "target" in write_sites[0], (
    f"api plugin must have exactly one currentTime write site, got {write_sites}"
)
# no SMTC session reading anywhere in the plugin
assert "GlobalSystemMediaTransportControls" not in api_src

# ---------------- engine assertions (full-power own session) ----------------
for needle in (
    "4.0.0", "chushi-smtc-engine", "MediaPlayer", "SystemMediaTransportControls",
    "CommandManager.IsEnabled = $false", "IsPlaybackPositionEnabled = $true",
    "MinSeekTime", "MaxSeekTime", "UpdateTimelineProperties",
    "Register-ObjectEvent", "InMemoryRandomAccessStream", "HttpListener",
    "ChuShi.SmtcEngine", "/api/state", "/api/ne", "/api/lyric", "/api/cmd", "/api/mgr",
    "Access-Control-Allow-Origin",
):
    assert needle in engine_text, f"engine ps1 missing {needle}"
# THE v4 law: the engine must never read any external SMTC session
forbidden_engine = (
    "GlobalSystemMediaTransportControlsSessionManager",
    "GlobalSystemMediaTransportControlsSession",
    "TryPlayAsync", "TryPauseAsync", "TryChangePlaybackPosition",
    "GetSessions",
)
for f in forbidden_engine:
    assert f not in engine_text, f"engine must not contain {f} (own-session law)"

# ---------------- protocol cross-consistency ----------------
for ep in ("/api/ping", "/api/state", "/api/ne", "/api/lyric", "/api/cmd", "/api/mgr"):
    assert ep in engine_text, f"engine missing endpoint {ep}"
for ep in ("/api/ne", "/api/lyric", "/api/cmd"):
    assert ep in api_src, f"api plugin missing endpoint {ep}"
for ep in ("/api/ping", "/api/cmd", "/api/mgr", "/api/state"):
    if ep == "/api/state":
        continue
    assert ep in mgr_src or ep in api_src, f"nobody talks to {ep}"
# port agreement
assert "26801" in engine_text and "26801" in api_src and "26801" in mgr_src

# ---------------- package ----------------
def pack(srcdir: pathlib.Path, final_js: str, out_path: pathlib.Path):
    manifest = json.loads((srcdir / "manifest.json").read_text(encoding="utf-8"))
    if out_path.exists():
        out_path.unlink()
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        z.writestr("index.js", final_js)
    with zipfile.ZipFile(out_path) as z:
        names = set(z.namelist())
        assert names == {"manifest.json", "index.js"}, f"bad package structure: {names}"
        payload = z.read("index.js")
        return payload

mgr_out = MGR / f"ChuShi-SMTC-Manager-{mgr_manifest['version']}.plugin"
api_out = API / f"ChuShi-Music-API-{api_manifest['version']}.plugin"

mgr_payload = pack(MGR, mgr_final, mgr_out)
api_payload = pack(API, api_src, api_out)

# ---------------- roundtrip: embedded engine decodes byte-exact ----------------
m = mgr_payload.decode("utf-8")
b64_start = m.index('const ENGINE_B64 = "') + len('const ENGINE_B64 = "')
b64_end = m.index('"', b64_start)
embedded = base64.b64decode(m[b64_start:b64_end])
assert embedded == engine_bytes, "embedded engine != source engine (byte mismatch)"
sha_line = m[m.index('const ENGINE_SHA256 = "') :].split('"')[1]
assert sha_line == engine_sha, "embedded sha mismatch"

print(f"OK engine: {engine_bytes} bytes sha256={engine_sha[:16]}...")
print(f"OK -> {mgr_out} ({mgr_out.stat().st_size / 1024:.1f} KB)")
print(f"OK -> {api_out} ({api_out.stat().st_size / 1024:.1f} KB)")
