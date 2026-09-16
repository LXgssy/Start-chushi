"use client";

/**
 * 完成提示音：三音上行琶音（C5-E5-G5），音量克制，
 * 使用 WebAudio 合成，无外部资源。
 */
export function playChime() {
  if (typeof window === "undefined") return;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [523.25, 0],
      [659.25, 0.16],
      [783.99, 0.32],
    ];
    for (const [freq, dt] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + dt);
      gain.gain.exponentialRampToValueAtTime(0.08, now + dt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dt + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + dt);
      osc.stop(now + dt + 1.2);
    }
    window.setTimeout(() => ctx.close().catch(() => undefined), 2500);
  } catch {
    /* 自动播放策略等场景下静默失败 */
  }
}
