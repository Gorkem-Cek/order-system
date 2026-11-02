/**
 * A short two-note alert made with the Web Audio API (no sound file needed). Browsers only
 * allow audio after the user has interacted with the page, so `unlock()` must be called from
 * a click before `play()` makes any sound.
 */
export function createChime() {
  let context: AudioContext | null = null;
  const getContext = () => {
    if (!context && typeof AudioContext !== "undefined") context = new AudioContext();
    return context;
  };

  const tone = (ctx: AudioContext, frequency: number, start: number, duration: number) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  };

  return {
    isSupported: () => typeof AudioContext !== "undefined",
    isUnlocked: () => context?.state === "running",
    async unlock(): Promise<boolean> {
      const ctx = getContext();
      if (!ctx) return false;
      await ctx.resume();
      return ctx.state === "running";
    },
    play(): void {
      const ctx = context;
      if (!ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      tone(ctx, 880, now, 0.18);
      tone(ctx, 1318.5, now + 0.16, 0.28);
    },
  };
}

export type Chime = ReturnType<typeof createChime>;
