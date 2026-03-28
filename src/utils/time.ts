export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/** Which visual segment (0..n-1) the pointer sits in, from horizontal position 0–1 on the track. */
export function segmentIndexFromTrackRatio(
  ratio: number,
  chapterDurations: number[],
  remainderDuration: number,
): number {
  const weights = [
    ...chapterDurations,
    ...(remainderDuration > 0.001 ? [remainderDuration] : []),
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0 || total <= 0) return 0;
  const r = clamp(ratio, 0, 1);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    const frac = weights[i] / total;
    acc += frac;
    if (r <= acc) return i;
  }
  return weights.length - 1;
}

export function chapterAtTime(
  t: number,
  chapters: { start: number; end: number; title: string }[],
): { title: string; start: number; end: number } | null {
  for (const c of chapters) {
    if (t >= c.start && t <= c.end) return c;
  }
  return null;
}
