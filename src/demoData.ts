import type { YedaPlayerInput } from "./types";
import { AD_DURATION_SEC } from "./utils/ads";
/** Corrected from assignment JSON (Benefits + Conclusion ranges). */
export const DEMO_INPUT: YedaPlayerInput = {
  hlsPlaylistUrl:
    "https://vz-50e60d70-540.b-cdn.net/b87ac5f4-2cf0-42d1-acc8-32a89d3c71c7/playlist.m3u8",
  videoLength: 348,
  adDurationSec: AD_DURATION_SEC,
  adVideoUrls: [
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  ],
  chapters: [
    { title: "Introduction & Course Overview", start: 0, end: 14 },
    {
      title: "Curiosity's Role in Critical & Creative Thinking",
      start: 15,
      end: 57,
    },
    { title: "Analytical vs Creative Thinking Explained", start: 58, end: 116 },
    { title: "Building Your Bank of Dots", start: 117, end: 138 },
    { title: "Practical Strategies to Stay Curious", start: 139, end: 225 },
    { title: "Benefits of Curiosity", start: 226, end: 312 },
    { title: "Conclusion & Recap", start: 313, end: 348 },
  ],
};
