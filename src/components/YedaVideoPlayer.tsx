import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import type { YedaPlayerInput } from "../types";
import { chapterAtTime, formatTime } from "../utils/time";
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
  const { hlsPlaylistUrl, videoLength, chapters } = input;
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const qualityWrapRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

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

  const effectiveDuration = useMemo(() => {
    const d = duration;
    return Number.isFinite(d) && d > 0 ? d : videoLength;
  }, [duration, videoLength]);

  const playedPct =
    effectiveDuration > 0
      ? clamp((currentTime / effectiveDuration) * 100, 0, 100)
      : 0;

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
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
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  const seekTo = useCallback(
    (t: number) => {
      const video = videoRef.current;
      if (!video) return;
      const max = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : videoLength;
      video.currentTime = clamp(t, 0, max);
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
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const toggleFs = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (!document.fullscreenElement) void shell.requestFullscreen();
    else void document.exitFullscreen();
  }, []);

  const hoverChapter = chapterAtTime(hover.time, chapters);
  const hoverLineLeftPct = hover.ratio * 100;

  const chapterSpan = useMemo(
    () => chapters.reduce((a, c) => a + (c.end - c.start), 0),
    [chapters],
  );
  const remainderRatio =
    videoLength > 0 ? (videoLength - chapterSpan) / videoLength : 0;

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
        <div className={styles.videoWrap}>
          <video
            ref={videoRef}
            className={styles.video}
            playsInline
            onClick={togglePlay}
          />

          {!playing ? (
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

          <div className={styles.overlayBottom}>
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={togglePlay}
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor">
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
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor">
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

              <div className={styles.spacer} />

              <div ref={qualityWrapRef} className={styles.qualityWrap}>
                <button
                  type="button"
                  className={styles.qualityBtn}
                  onClick={() => setQualityOpen((o) => !o)}
                  aria-expanded={qualityOpen}
                  aria-haspopup="listbox"
                >
                  {qualityLabel}
                  <svg
                    className={styles.qualityChevron}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
                {qualityOpen && levels.length > 0 ? (
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
        </div>

        <div className={styles.timelineSection}>
          <div className={styles.timelineLabelRow}>
            <span className={styles.timelineHeading}>Chapters</span>
            <span className={styles.timeReadout}>
              <strong>{formatTime(currentTime)}</strong>
              {" / "}
              {formatTime(effectiveDuration)}
            </span>
          </div>

          <div className={styles.trackWrap}>
            <div
              ref={trackRef}
              className={styles.track}
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
              <div className={styles.chapterSegments}>
                {chapters.map((c) => {
                  const w = ((c.end - c.start) / videoLength) * 100;
                  return (
                    <div
                      key={c.title + c.start}
                      className={styles.segment}
                      style={{ flex: `0 0 ${w}%` }}
                    >
                      <div className={styles.segmentInner} />
                    </div>
                  );
                })}
                {remainderRatio > 0.001 ? (
                  <div
                    className={`${styles.segment} ${styles.segmentRemainder}`}
                    style={{ flex: `0 0 ${remainderRatio * 100}%` }}
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
                className={`${styles.hoverLine} ${hover.active ? styles.visible : ""}`}
                style={{ left: `${hoverLineLeftPct}%` }}
              />

              <div
                className={`${styles.tooltip} ${hover.active ? styles.visible : ""}`}
                style={{ left: `${hoverLineLeftPct}%` }}
              >
                <div className={styles.tooltipTime}>
                  {formatTime(hover.time)}
                </div>
                <div className={styles.tooltipChapter}>
                  {hoverChapter?.title ?? "Between chapters"}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.chapterStripLabels}>
            {chapters.map((c) => {
              const w = ((c.end - c.start) / videoLength) * 100;
              return (
                <div
                  key={`lbl-${c.title}-${c.start}`}
                  className={styles.chapterChip}
                  style={{ flex: `0 0 ${w}%` }}
                  title={c.title}
                >
                  {c.title}
                </div>
              );
            })}
            {remainderRatio > 0.001 ? (
              <div
                className={styles.chapterChip}
                style={{ flex: `0 0 ${remainderRatio * 100}%` }}
                title="Between chapters"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
