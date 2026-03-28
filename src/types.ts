export type Chapter = {
  title: string;
  start: number;
  end: number;
};

export type YedaPlayerInput = {
  hlsPlaylistUrl: string;
  videoLength: number;
  chapters: Chapter[];
  /** MP4 URLs (one picked at random per break). If empty, a generated placeholder is shown. */
  adVideoUrls?: string[];
  /** Ad duration after each chapter ends (default 15). */
  adDurationSec?: number;
};
