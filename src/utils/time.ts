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

export function chapterAtTime(
  t: number,
  chapters: { start: number; end: number; title: string }[],
): { title: string; start: number; end: number } | null {
  for (const c of chapters) {
    if (t >= c.start && t <= c.end) return c;
  }
  return null;
}
