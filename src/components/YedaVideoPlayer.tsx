import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import type { YedaPlayerInput } from "../types";
import {
  AD_DURATION_SEC,
  AD_PLACEHOLDER_HEADLINES,
  pickRandom,
  resumeTimeAfterChapterAd,
  shouldSkipAdAtChapterEnd,
} from "../utils/ads";
import {
  chapterAtTime,
  formatTime,
  segmentIndexFromTrackRatio,
} from "../utils/time";
import styles from "./YedaVideoPlayer.module.css";

type Props = { input: YedaPlayerInput };

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function timeFromClientX(
  clientX: number,
  rect: DOMRect,
  duration: number,
): number {
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  return clamp(ratio, 0, 1) * duration;
}

export function YedaVideoPlayer({ input }: Props) {
  const {
    hlsPlaylistUrl,
    videoLength,
    chapters,
    adVideoUrls = [],
    adDurationSec = AD_DURATION_SEC,
  } = input;
  const videoRef = useRef<HTMLVideoElement>(null);
  const adVideoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const qualityWrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const prevTimeRef = useRef(0);
  const firedChapterAdsRef = useRef<Set<number>>(new Set());
  const adActiveRef = useRef(false);
  const adChapterIndexRef = useRef(0);
  const endAdRef = useRef<() => void>(() => {});

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(videoLength);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);

  const [levels, setLevels] = useState<{ height: number; label: string }[]>(
    [],
  );
  const [qualityIndex, setQualityIndex] = useState(-1);
  const [qualityOpen, setQualityOpen] = useState(false);

  const [hover, setHover] = useState<{
    active: boolean;
    time: number;
    ratio: number;
  }>({ active: false, time: 0, ratio: 0 });

  const [adActive, setAdActive] = useState(false);
  const [adRemainingSec, setAdRemainingSec] = useState(adDurationSec);
  const [adMediaUrl, setAdMediaUrl] = useState<string | null>(null);
  const [adHeadline, setAdHeadline] = useState("");
  const [adHue, setAdHue] = useState(210);

  const effectiveDuration = useMemo(() => {
    const d = duration;
    return Number.isFinite(d) && d > 0 ? d : videoLength;
  }, [duration, videoLength]);

  const playedPct =
    effectiveDuration > 0
      ? clamp((currentTime / effectiveDuration) * 100, 0, 100)
      : 0;

  useEffect(() => {
    firedChapterAdsRef.current.clear();
    prevTimeRef.current = 0;
  }, [hlsPlaylistUrl]);

  useEffect(() => {
    adActiveRef.current = adActive;
  }, [adActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsPlaylistUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const lv = hls.levels.map((level, i) => {
          const h = level.height ?? level.width ?? 0;
          const label = h ? `${h}p` : `Quality ${i + 1}`;
          return { height: h, label };
        });
        setLevels(lv);
        setQualityIndex(hls.currentLevel);
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsPlaylistUrl;
      setLevels([]);
    }
  }, [hlsPlaylistUrl]);

  const endAd = useCallback(() => {
    if (!adActiveRef.current) return;
    adActiveRef.current = false;
    const video = videoRef.current;
    const adVideo = adVideoRef.current;
    if (adVideo) {
      adVideo.pause();
      adVideo.removeAttribute("src");
      adVideo.load();
    }
    setAdActive(false);
    setAdMediaUrl(null);
    if (!video) return;
    const resume = resumeTimeAfterChapterAd(
      chapters,
      adChapterIndexRef.current,
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : videoLength,
    );
    video.currentTime = resume;
    prevTimeRef.current = resume;
    setCurrentTime(resume);
    void video.play();
  }, [chapters, videoLength]);

  useEffect(() => {
    endAdRef.current = endAd;
  }, [endAd]);

  const startAdChapter = useCallback(
    (chapterIndex: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      const end = chapters[chapterIndex]!.end;
      video.currentTime = end;
      prevTimeRef.current = end;
      setCurrentTime(end);
      adChapterIndexRef.current = chapterIndex;
      adActiveRef.current = true;
      setAdActive(true);
      setAdMediaUrl(
        adVideoUrls.length > 0 ? pickRandom(adVideoUrls) : null,
      );
      setAdHeadline(pickRandom(AD_PLACEHOLDER_HEADLINES));
      setAdHue(Math.floor(Math.random() * 360));
      setAdRemainingSec(adDurationSec);
    },
    [chapters, adVideoUrls, adDurationSec],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      const t = video.currentTime;
      const prev = prevTimeRef.current;
      const dur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : videoLength;

      if (!adActiveRef.current) {
        for (let i = 0; i < chapters.length; i++) {
          if (shouldSkipAdAtChapterEnd(chapters[i]!, i, chapters.length, dur)) {
            continue;
          }
          if (firedChapterAdsRef.current.has(i)) continue;
          const end = chapters[i]!.end;
          if (prev < end && t >= end) {
            firedChapterAdsRef.current.add(i);
            startAdChapter(i);
            prevTimeRef.current = end;
            setCurrentTime(end);
            return;
          }
        }
      }

      prevTimeRef.current = t;
      setCurrentTime(t);
    };
    const onDur = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("loadedmetadata", onDur);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("loadedmetadata", onDur);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [chapters, videoLength, startAdChapter]);

  useEffect(() => {
    if (!adActive) return;
    const deadline = Date.now() + adDurationSec * 1000;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setAdRemainingSec(left);
      if (left <= 0) {
        window.clearInterval(id);
        endAdRef.current();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [adActive, adDurationSec]);

  useEffect(() => {
    if (!adActive || !adMediaUrl) return;
    const v = adVideoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    v.loop = true;
    v.currentTime = 0;
    void v.play();
  }, [adActive, adMediaUrl, volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  const seekTo = useCallback(
    (t: number) => {
      if (adActiveRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      const max = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : videoLength;
      video.currentTime = clamp(t, 0, max);
      prevTimeRef.current = video.currentTime;
    },
    [videoLength],
  );

  const onTrackPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = timeFromClientX(clientX, rect, effectiveDuration);
      const ratio =
        rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
      setHover({ active: true, time: t, ratio });
    },
    [effectiveDuration],
  );

  const onTrackMove = useCallback(
    (e: React.MouseEvent) => {
      onTrackPointer(e.clientX);
    },
    [onTrackPointer],
  );

  const onTrackLeave = useCallback(() => {
    setHover((h) => ({ ...h, active: false }));
  }, []);

  const onTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = timeFromClientX(e.clientX, rect, effectiveDuration);
      seekTo(t);
    },
    [effectiveDuration, seekTo],
  );

  const setHlsQuality = useCallback((index: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (!hls || !video) return;
    if (index < 0) {
      hls.currentLevel = -1;
      setQualityIndex(-1);
      return;
    }
    hls.currentLevel = index;
    setQualityIndex(index);
  }, []);

  const qualityLabel = useMemo(() => {
    if (levels.length === 0) return "Auto";
    if (qualityIndex < 0) return "Auto";
    return levels[qualityIndex]?.label ?? "Auto";
  }, [levels, qualityIndex]);

  const togglePlay = useCallback(() => {
    if (adActiveRef.current) {
      const av = adVideoRef.current;
      if (av && adMediaUrl) {
        if (av.paused) void av.play();
        else av.pause();
      }
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [adMediaUrl]);

  const toggleFs = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (!document.fullscreenElement) void shell.requestFullscreen();
    else void document.exitFullscreen();
  }, []);

  const hoverChapter = chapterAtTime(hover.time, chapters);
  const tooltipLeftPct = hover.ratio * 100;

  const chapterSpan = useMemo(
    () => chapters.reduce((a, c) => a + (c.end - c.start), 0),
    [chapters],
  );
  const remainderDuration = Math.max(0, videoLength - chapterSpan);

  const chapterDurations = useMemo(
    () => chapters.map((c) => c.end - c.start),
    [chapters],
  );

  const hoverSegmentIndex = useMemo(() => {
    if (!hover.active) return -1;
    return segmentIndexFromTrackRatio(
      hover.ratio,
      chapterDurations,
      remainderDuration,
    );
  }, [hover.active, hover.ratio, chapterDurations, remainderDuration]);

  const tooltipTitle = useMemo(() => {
    if (!hover.active) return "";
    if (hoverChapter) return hoverChapter.title;
    if (hoverSegmentIndex >= 0 && hoverSegmentIndex < chapters.length) {
      return chapters[hoverSegmentIndex]?.title ?? "";
    }
    return "Between chapters";
  }, [hover.active, hoverChapter, hoverSegmentIndex, chapters]);

  useEffect(() => {
    if (!qualityOpen) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target;
      if (n instanceof Node && qualityWrapRef.current?.contains(n)) return;
      setQualityOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [qualityOpen]);

  return (
    <div ref={shellRef} className={styles.root}>
      <div className={styles.inner}>
        <div
          className={`${styles.videoWrap} ${!playing && !adActive ? styles.videoWrapPaused : ""}`}
        >
          <video
            ref={videoRef}
            className={styles.video}
            playsInline
            onClick={togglePlay}
          />

          {adActive ? (
            <div className={styles.adOverlay} role="dialog" aria-live="polite">
              {adMediaUrl ? (
                <video
                  key={adMediaUrl}
                  ref={adVideoRef}
                  className={styles.adVideo}
                  src={adMediaUrl}
                  playsInline
                  muted={muted}
                />
              ) : (
                <div
                  className={styles.adPlaceholder}
                  style={{
                    background: `linear-gradient(135deg, hsl(${adHue}, 42%, 28%) 0%, hsl(${(adHue + 40) % 360}, 38%, 18%) 100%)`,
                  }}
                >
                  <span className={styles.adPlaceholderBrand}>Sponsored</span>
                  <p className={styles.adPlaceholderHeadline}>{adHeadline}</p>
                </div>
              )}
              <div className={styles.adChrome}>
                <span className={styles.adBadge}>
                  Ad · {adRemainingSec}s
                </span>
              </div>
            </div>
          ) : null}

          {!playing && !adActive ? (
            <button
              type="button"
              className={styles.centerPlay}
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label="Play"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : null}

          {!adActive ? (
          <div className={styles.overlayBottom}>
            <div className={styles.trackWrap}>
              <div
                ref={trackRef}
                className={styles.trackHit}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={Math.round(effectiveDuration)}
                aria-valuenow={Math.round(currentTime)}
                aria-label="Seek timeline"
                onMouseMove={onTrackMove}
                onMouseLeave={onTrackLeave}
                onClick={onTrackClick}
                onKeyDown={(e) => {
                  const step = 5;
                  if (e.key === "ArrowRight") {
                    seekTo(currentTime + step);
                  } else if (e.key === "ArrowLeft") {
                    seekTo(currentTime - step);
                  }
                }}
              >
                <div className={styles.trackLine}>
                <div className={styles.chapterSegments}>
                  {chapters.map((c, i) => (
                    <div
                      key={c.title + c.start}
                      className={`${styles.segment} ${hover.active && hoverSegmentIndex === i ? styles.segmentHovered : ""}`}
                      style={{
                        flex: `${c.end - c.start} 1 0`,
                        minWidth: 0,
                      }}
                    />
                  ))}
                  {remainderDuration > 0.001 ? (
                    <div
                      className={`${styles.segment} ${styles.segmentRemainder} ${hover.active && hoverSegmentIndex === chapters.length ? styles.segmentHovered : ""}`}
                      style={{
                        flex: `${remainderDuration} 1 0`,
                        minWidth: 0,
                      }}
                    />
                  ) : null}
                </div>
                <div
                  className={styles.played}
                  style={{ width: `${playedPct}%` }}
                />
                <div
                  className={styles.scrubHead}
                  style={{ left: `${playedPct}%` }}
                />

                <div
                  className={`${styles.tooltip} ${hover.active ? styles.visible : ""}`}
                  style={{ left: `${tooltipLeftPct}%` }}
                >
                  <div className={styles.tooltipTitle}>{tooltipTitle}</div>
                  <div className={styles.tooltipTime}>
                    {formatTime(hover.time)}
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div className={styles.controls}>
              <div className={styles.controlsLeft}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={togglePlay}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <div className={styles.volumeBlock}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => setMuted((m) => !m)}
                    aria-label={muted ? "Unmute" : "Mute"}
                  >
                    {muted || volume === 0 ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                      </svg>
                    )}
                  </button>
                  <input
                    className={styles.volumeSlider}
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      if (v > 0) setMuted(false);
                    }}
                    aria-label="Volume"
                  />
                </div>

                <span className={styles.timeReadout}>
                  {formatTime(currentTime)}
                  {" / "}
                  {formatTime(effectiveDuration)}
                </span>
              </div>

              <div className={styles.spacer} />

              <div ref={qualityWrapRef} className={styles.qualityWrap}>
                <button
                  type="button"
                  className={styles.gearBtn}
                  onClick={() => setQualityOpen((o) => !o)}
                  aria-expanded={qualityOpen}
                  aria-haspopup="listbox"
                  aria-label={`Quality: ${qualityLabel}`}
                  title={qualityLabel}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                  </svg>
                </button>
                {qualityOpen ? (
                  <div className={styles.qualityMenu} role="listbox">
                    <button
                      type="button"
                      role="option"
                      className={`${styles.qualityOption} ${qualityIndex < 0 ? styles.active : ""}`}
                      onClick={() => {
                        setHlsQuality(-1);
                        setQualityOpen(false);
                      }}
                    >
                      Auto
                    </button>
                    {levels.map((lv, i) => (
                      <button
                        key={`${lv.label}-${i}`}
                        type="button"
                        role="option"
                        className={`${styles.qualityOption} ${qualityIndex === i ? styles.active : ""}`}
                        onClick={() => {
                          setHlsQuality(i);
                          setQualityOpen(false);
                        }}
                      >
                        {lv.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className={styles.iconBtn}
                onClick={toggleFs}
                aria-label="Fullscreen"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              </button>
            </div>
          </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
