import type { Chapter } from "../types";

export const AD_DURATION_SEC = 10;

export const AD_PLACEHOLDER_HEADLINES = [
  "Learn something new today",
  "Your next chapter awaits",
  "Skills that stick with you",
  "Smarter learning, on your time",
  "Unlock the full experience",
  "Built for curious minds",
];

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Where main content resumes after an ad following `chapterIndex` ending. */
export function resumeTimeAfterChapterAd(
  chapters: Chapter[],
  chapterIndex: number,
  videoDuration: number,
): number {
  const next = chapters[chapterIndex + 1];
  if (next) return next.start;
  return Math.min(chapters[chapterIndex]!.end + 0.001, videoDuration);
}

export function shouldSkipAdAtChapterEnd(
  chapter: Chapter,
  chapterIndex: number,
  chaptersLength: number,
  videoDuration: number,
): boolean {
  if (chapterIndex === chaptersLength - 1 && chapter.end >= videoDuration - 0.25) {
    return true;
  }
  return false;
}
