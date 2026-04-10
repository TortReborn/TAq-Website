"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import { useExecGraidRaceData } from '@/hooks/useExecGraidLogs';
import type { GraidRaceRaid, GraidRaceFilters } from '@/hooks/useExecGraidLogs';
import { RAID_TYPE_COLORS, getRaidShort } from '@/lib/graid-log-constants';

const RAID_TYPE_ORDER = ['NOTG', 'TCC', 'TNA', 'NOL', 'Unknown'] as const;
type RaidTypeKey = (typeof RAID_TYPE_ORDER)[number];

interface Props {
  dateFrom: string;
  dateTo: string;
}

interface PlayerState {
  key: string;       // uuid or ign
  ign: string;
  total: number;
  types: Record<string, number>;
}

interface Frame {
  date: string;     // YYYY-MM-DD
  players: Map<string, PlayerState>;
}

interface InterpPlayer {
  key: string;
  ign: string;
  totalRaw: number;
  total: number;
  typesRaw: Record<string, number>;
  types: Record<string, number>;
}

interface InterpFrame {
  date: string;
  players: InterpPlayer[];
}

interface LayoutEntry {
  player: InterpPlayer;
  renderedRank: number; // smoothed Y position (lerps toward target)
  targetRank: number;   // integer rank label (snaps instantly)
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card-solid)',
  borderRadius: '0.75rem',
  border: '1px solid var(--border-card)',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '480px',
};

const VISIBLE_BARS = 10;
const BAR_HEIGHT = 28;
const BAR_GAP = 4;

// Canvas dimensions for the recorded video
const CANVAS_W = 700;
const CANVAS_H = 500;

// --- Inline SVG icon components ---

const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);

const PauseIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const ReplayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

const DownloadIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 19h14" />
  </svg>
);

const RecordingDotIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <circle cx="5" cy="5" r="4" fill="#ef4444">
      <animate attributeName="opacity" values="1;0.35;1" dur="1s" repeatCount="indefinite" />
    </circle>
  </svg>
);
// Minimum visible bar width — keeps short bars readable without dominating the chart
const MIN_BAR_FILL_PX = 93;

export default function PlayerRaceChart({ dateFrom: parentDateFrom, dateTo: parentDateTo }: Props) {
  const [dateFrom, setDateFrom] = useState(parentDateFrom);
  const [dateTo, setDateTo] = useState(parentDateTo);
  const [selectedTypes, setSelectedTypes] = useState<Set<RaidTypeKey>>(
    new Set(RAID_TYPE_ORDER)
  );
  const [speed, setSpeed] = useState(7); // days per second
  const [filters, setFilters] = useState<GraidRaceFilters | null>(null);
  const [playing, setPlaying] = useState(false);
  const [animState, setAnimState] = useState<{ idx: number; t: number }>({ idx: 0, t: 0 });
  const [recording, setRecording] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const avatarsRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const recordingRef = useRef(false);

  const { raids, loading, error } = useExecGraidRaceData(filters);

  // Build frames from raid logs
  const { frames, trackedPlayers, finalTotals, finalPlayerOrder } = useMemo(
    () => buildFrames(raids),
    [raids]
  );

  // Reset animation when frames change
  useEffect(() => {
    setAnimState({ idx: 0, t: 0 });
    setPlaying(frames.length > 0);
  }, [frames]);

  // Smooth requestAnimationFrame loop — interpolates between adjacent snapshots
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const delta = now - last;
      last = now;
      setAnimState(prev => {
        const advance = (delta / 1000) * speed; // fractional frames advanced
        let newT = prev.t + advance;
        let newIdx = prev.idx;
        while (newT >= 1 && newIdx < frames.length - 1) {
          newT -= 1;
          newIdx++;
        }
        if (newIdx >= frames.length - 1) {
          return { idx: frames.length - 1, t: 0 };
        }
        return { idx: newIdx, t: newT };
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, frames.length]);

  // Stop playing on end + finish recording if active
  useEffect(() => {
    if (frames.length === 0) return;
    if (animState.idx >= frames.length - 1 && animState.t === 0 && playing) {
      setPlaying(false);
      if (recordingRef.current && recorderRef.current && recorderRef.current.state !== 'inactive') {
        // Hold a tick so the last frame is captured
        setTimeout(() => {
          if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop();
          }
        }, 250);
      }
    }
  }, [animState, frames.length, playing]);

  // Compute the interpolated frame from the current animState
  const interpolatedFrame: InterpFrame | null = useMemo(() => {
    if (frames.length === 0) return null;
    const fromIdx = animState.idx;
    const toIdx = Math.min(fromIdx + 1, frames.length - 1);
    const fromFrame = frames[fromIdx];
    const toFrame = frames[toIdx];
    const t = animState.t;

    const players: InterpPlayer[] = trackedPlayers.map(key => {
      const f = fromFrame.players.get(key);
      const ttp = toFrame.players.get(key);
      const fromTotal = f?.total || 0;
      const toTotal = ttp?.total || 0;
      const totalRaw = fromTotal + (toTotal - fromTotal) * t;

      const types: Record<string, number> = {};
      const typesRaw: Record<string, number> = {};
      for (const tp of RAID_TYPE_ORDER) {
        const fv = f?.types[tp] || 0;
        const tv = ttp?.types[tp] || 0;
        const v = fv + (tv - fv) * t;
        typesRaw[tp] = v;
        types[tp] = Math.round(v);
      }

      return {
        key,
        ign: ttp?.ign || f?.ign || finalPlayerOrder.get(key)?.ign || key,
        totalRaw,
        total: Math.round(totalRaw),
        typesRaw,
        types,
      };
    });

    return { date: t > 0.5 ? toFrame.date : fromFrame.date, players };
  }, [animState, frames, trackedPlayers, finalPlayerOrder]);

  // Sorted top players for current interpolated frame
  const { sortedPlayers, maxValueRaw } = useMemo(() => {
    if (!interpolatedFrame) return { sortedPlayers: [] as InterpPlayer[], maxValueRaw: 1 };
    const sorted = [...interpolatedFrame.players].sort((a, b) =>
      b.totalRaw - a.totalRaw || a.ign.localeCompare(b.ign)
    );
    const max = Math.max(...sorted.slice(0, VISIBLE_BARS).map(p => p.totalRaw), 1);
    return { sortedPlayers: sorted, maxValueRaw: max };
  }, [interpolatedFrame]);

  // Per-player rank for the current frame (used for the DOM bar transforms)
  const ranksByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (let i = 0; i < sortedPlayers.length; i++) m.set(sortedPlayers[i].key, i);
    return m;
  }, [sortedPlayers]);

  // Canvas drawing is fully driven by handleDownload's RAF loop, so the
  // on-screen DOM bars stay independent of the offscreen recording.

  // --- Handlers ---

  const toggleType = (t: RaidTypeKey) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleGenerate = () => {
    if (selectedTypes.size === 0) return;
    const allSelected = selectedTypes.size === RAID_TYPE_ORDER.length;
    setFilters({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      raidTypes: allSelected ? undefined : Array.from(selectedTypes).join(','),
    });
  };

  const handleReplay = () => {
    setAnimState({ idx: 0, t: 0 });
    setPlaying(true);
  };

  const handleDownload = async () => {
    if (frames.length === 0 || !canvasRef.current) return;

    setDownloadStatus('Loading avatars…');
    try {
      const playersToLoad = trackedPlayers.map(k => ({
        key: k,
        ign: finalPlayerOrder.get(k)?.ign || (frames[frames.length - 1]?.players.get(k)?.ign) || '',
      }));
      avatarsRef.current = await preloadAvatars(playersToLoad);
    } catch (e) {
      console.error('avatar preload failed', e);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setRecording(true);
    recordingRef.current = true;

    try {
      // Prefer the WebCodecs path — fast, deterministic, no real-time wait.
      if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
        await encodeWithWebCodecs(canvas);
      } else {
        // Fallback for browsers without WebCodecs (older Safari, etc.).
        await encodeWithMediaRecorder(canvas);
      }
    } catch (err) {
      console.error('Save failed', err);
      setDownloadStatus('Save failed');
      setTimeout(() => setDownloadStatus(null), 3000);
    } finally {
      setRecording(false);
      recordingRef.current = false;
    }
  };

  // --- WebCodecs encode path ---
  // Encodes the race directly with `VideoEncoder` and muxes into a .webm with
  // `webm-muxer`. Decoupled from wall time, so the save completes as fast as
  // the browser can encode VP9 frames (typically 1–3 s for a few hundred days).
  const encodeWithWebCodecs = async (canvas: HTMLCanvasElement) => {
    setDownloadStatus('Encoding 0%');

    const FPS = 60;
    // Match the on-screen preview duration: frames.length days at `speed` days/sec.
    const playbackSeconds = frames.length / Math.max(1, speed);
    const tailSeconds = 0.6; // hold the last frame for 0.6s of video time
    const totalFrames = Math.max(1, Math.ceil((playbackSeconds + tailSeconds) * FPS));

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: CANVAS_W, height: CANVAS_H, frameRate: FPS },
    });

    let encoderError: unknown = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
        console.error('VideoEncoder error', e);
      },
    });

    encoder.configure({
      codec: 'vp09.00.10.08', // VP9 profile 0
      width: CANVAS_W,
      height: CANVAS_H,
      bitrate: 4_000_000,
      framerate: FPS,
    });

    const session = createDrawSession(
      canvas,
      frames,
      trackedPlayers,
      finalPlayerOrder,
      avatarsRef.current
    );

    const dt = 1 / FPS;
    for (let f = 0; f < totalFrames; f++) {
      if (encoderError) throw encoderError;

      const seconds = f / FPS;
      // Clamp into [0, playbackSeconds] so the tail holds the final frame.
      const clampedSeconds = Math.min(playbackSeconds, seconds);
      const dayProgress = clampedSeconds * speed;
      const idx = Math.min(Math.floor(dayProgress), frames.length - 1);
      const t = idx >= frames.length - 1 ? 0 : dayProgress - idx;

      session.draw(idx, t, dt);

      const videoFrame = new VideoFrame(canvas, {
        timestamp: Math.round((f * 1_000_000) / FPS),
      });
      try {
        encoder.encode(videoFrame, { keyFrame: f % FPS === 0 });
      } finally {
        videoFrame.close();
      }

      // Yield to the event loop every ~30 frames so React can repaint the
      // status banner and the page stays responsive.
      if (f % 30 === 0) {
        const pct = Math.round((f / totalFrames) * 100);
        setDownloadStatus(`Encoding ${pct}%`);
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }

    setDownloadStatus('Finalizing…');
    await encoder.flush();
    encoder.close();
    muxer.finalize();

    if (encoderError) throw encoderError;

    const target = muxer.target as ArrayBufferTarget;
    const blob = new Blob([target.buffer], { type: 'video/webm' });
    triggerBlobDownload(blob);

    setDownloadStatus('Saved!');
    setTimeout(() => setDownloadStatus(null), 2500);
  };

  // --- MediaRecorder fallback path (kept for browsers without WebCodecs) ---
  const encodeWithMediaRecorder = async (canvas: HTMLCanvasElement) => {
    if (typeof MediaRecorder === 'undefined') {
      setDownloadStatus('Save not supported in this browser');
      setTimeout(() => setDownloadStatus(null), 3000);
      return;
    }

    setDownloadStatus('Recording…');

    const session = createDrawSession(
      canvas,
      frames,
      trackedPlayers,
      finalPlayerOrder,
      avatarsRef.current
    );

    // Pre-paint frame 0 so the captureStream has something to grab.
    session.draw(0, 0, 0);

    let stream: MediaStream;
    try {
      stream = canvas.captureStream(60);
    } catch (e) {
      console.error('captureStream failed', e);
      setDownloadStatus('Canvas capture not supported');
      setTimeout(() => setDownloadStatus(null), 3000);
      return;
    }

    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    } catch (e) {
      console.error('MediaRecorder failed', e);
      setDownloadStatus('Recording not supported');
      setTimeout(() => setDownloadStatus(null), 3000);
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        triggerBlobDownload(blob);
        resolve();
      };
      recorderRef.current = recorder;
      recorder.start();

      const RECORD_SPEED = speed;
      let last = performance.now();
      let recIdx = 0;
      let recT = 0;
      let stopScheduled = false;

      const tick = (now: number) => {
        const delta = now - last;
        last = now;
        const advance = (delta / 1000) * RECORD_SPEED;
        let newT = recT + advance;
        let newIdx = recIdx;
        while (newT >= 1 && newIdx < frames.length - 1) {
          newT -= 1;
          newIdx++;
        }

        if (newIdx >= frames.length - 1) {
          // Keep redrawing the final frame so the captureStream doesn't stall
          // while we wait for the tail. Without this the saved video used to
          // freeze for 600 ms at the end.
          session.draw(frames.length - 1, 0, delta / 1000);
          if (!stopScheduled) {
            stopScheduled = true;
            setTimeout(() => {
              if (recorder.state !== 'inactive') recorder.stop();
            }, 600);
          }
          requestAnimationFrame(tick);
          return;
        }

        recIdx = newIdx;
        recT = newT;
        session.draw(recIdx, recT, delta / 1000);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    setDownloadStatus('Saved!');
    setTimeout(() => setDownloadStatus(null), 2500);
  };

  const triggerBlobDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `top-guild-raiders-${stamp}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const fmtFrameDate = (s: string) => {
    if (!s) return '';
    const d = new Date(s);
    const month = d.toLocaleString('default', { month: 'short' });
    return `${month} ${d.getDate()}, ${d.getFullYear()}`;
  };

  return (
    <div style={cardStyle}>
      {/* Hidden canvas used for download recording */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}
      />

      {/* Header */}
      <div style={{ marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
          Top Guild Raiders
        </h3>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
          Animated leaderboard. Pick a date range, raid types, and Generate.
        </div>
      </div>

      {/* Date range */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.4rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={miniLabel}>From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={dateInputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label style={miniLabel}>To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={dateInputStyle}
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); }}
            style={{ ...miniBtnStyle, alignSelf: 'flex-end', padding: '0.3rem 0.45rem', fontSize: '0.6rem' }}
            title="Clear date range"
          >
            Clear
          </button>
        )}
      </div>

      {/* Raid type chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.4rem' }}>
        {RAID_TYPE_ORDER.map(t => {
          const selected = selectedTypes.has(t);
          const color = RAID_TYPE_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              style={{
                background: selected ? `${color}25` : 'var(--bg-primary)',
                border: selected ? `1.5px solid ${color}` : '1px solid var(--border-card)',
                borderRadius: '0.375rem',
                padding: '0.2rem 0.45rem',
                fontSize: '0.65rem',
                fontWeight: '700',
                color: selected ? color : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Speed slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: '600', minWidth: '70px' }}>
          {speed} day{speed !== 1 ? 's' : ''}/sec
        </span>
        <input
          type="range"
          min={1}
          max={30}
          value={speed}
          onChange={e => setSpeed(parseInt(e.target.value, 10))}
          style={{ flex: 1, accentColor: 'var(--color-ocean-400)' }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleGenerate}
          disabled={loading || selectedTypes.size === 0 || recording}
          style={{
            flex: 1,
            minWidth: '90px',
            background: 'var(--color-ocean-400)',
            border: 'none',
            borderRadius: '0.375rem',
            padding: '0.4rem',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: '700',
            cursor: loading ? 'wait' : selectedTypes.size === 0 ? 'not-allowed' : 'pointer',
            opacity: loading || selectedTypes.size === 0 || recording ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading…' : filters ? 'Regenerate' : 'Generate'}
        </button>
        {frames.length > 0 && (
          <>
            <button
              onClick={() => setPlaying(p => !p)}
              style={iconBtnStyle}
              title={playing ? 'Pause' : 'Play'}
              aria-label={playing ? 'Pause' : 'Play'}
              disabled={recording}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              onClick={handleReplay}
              style={iconBtnStyle}
              title="Replay from start"
              aria-label="Replay from start"
              disabled={recording}
            >
              <ReplayIcon />
            </button>
            <button
              onClick={handleDownload}
              style={{
                ...iconBtnStyle,
                background: 'var(--color-ocean-400)',
                color: '#fff',
                border: 'none',
                paddingLeft: '0.7rem',
                paddingRight: '0.7rem',
                gap: '0.4rem',
              }}
              title="Encode and download as .webm"
              aria-label="Save as .webm"
              disabled={recording}
            >
              {recording ? <RecordingDotIcon /> : <DownloadIcon />}
              <span>{recording ? 'Saving' : 'Save'}</span>
            </button>
          </>
        )}
      </div>

      {downloadStatus && (
        <div style={{
          marginBottom: '0.4rem',
          padding: '0.3rem 0.45rem',
          background: 'var(--bg-primary)',
          borderRadius: '0.375rem',
          fontSize: '0.65rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
        }}>
          {downloadStatus}
        </div>
      )}

      {/* Frame info */}
      {frames.length > 0 && interpolatedFrame && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.35rem 0.5rem',
          background: 'var(--bg-primary)',
          borderRadius: '0.375rem',
          marginBottom: '0.5rem',
        }}>
          <span style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {fmtFrameDate(interpolatedFrame.date)}
          </span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
            Day {animState.idx + 1} / {frames.length}
          </span>
        </div>
      )}

      {/* Animation area */}
      <div style={{ flex: 1, position: 'relative', minHeight: `${(BAR_HEIGHT + BAR_GAP) * VISIBLE_BARS}px`, overflow: 'hidden' }}>
        {error && (
          <div style={{ textAlign: 'center', color: '#ef4444', fontSize: '0.75rem', padding: '1rem' }}>
            Failed to load race data
          </div>
        )}
        {!error && !filters && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', padding: '1rem',
          }}>
            Pick a date range and raid types, then click Generate to start the race.
          </div>
        )}
        {!error && filters && loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', fontSize: '0.75rem',
          }}>
            Crunching raids…
          </div>
        )}
        {!error && filters && !loading && frames.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', padding: '1rem',
          }}>
            No raids in this range with the selected raid types.
          </div>
        )}
        {!error && frames.length > 0 && interpolatedFrame && (
          <div style={{ position: 'absolute', inset: 0 }}>
            {trackedPlayers.map(key => {
              const player = interpolatedFrame.players.find(p => p.key === key);
              if (!player) return null;
              const rank = ranksByKey.get(key) ?? VISIBLE_BARS;
              const visible = rank < VISIBLE_BARS;
              const widthPct = maxValueRaw > 0 ? (player.totalRaw / maxValueRaw) * 100 : 0;
              return (
                <div
                  key={key}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: `${BAR_HEIGHT}px`,
                    transform: `translateY(${visible ? rank * (BAR_HEIGHT + BAR_GAP) : VISIBLE_BARS * (BAR_HEIGHT + BAR_GAP)}px)`,
                    opacity: visible ? 1 : 0,
                    transition: 'transform 350ms ease-out, opacity 250ms ease-out',
                    pointerEvents: visible ? 'auto' : 'none',
                  }}
                >
                  <Bar
                    rank={rank + 1}
                    ign={player.ign}
                    total={player.total}
                    totalRaw={player.totalRaw}
                    types={player.types}
                    typesRaw={player.typesRaw}
                    widthPct={widthPct}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Final totals (after race finishes) */}
      {frames.length > 0 && animState.idx === frames.length - 1 && finalTotals.size > 0 && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.4rem 0.5rem',
          background: 'var(--bg-primary)',
          borderRadius: '0.375rem',
          fontSize: '0.6rem',
          color: 'var(--text-secondary)',
        }}>
          <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Final totals</span>
          {' · '}
          {RAID_TYPE_ORDER.filter(t => (finalTotals.get(t) || 0) > 0).map((t, i, arr) => (
            <span key={t}>
              <span style={{ color: RAID_TYPE_COLORS[t], fontWeight: '700' }}>{t}</span>
              <span> {finalTotals.get(t) || 0}</span>
              {i < arr.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Single bar (avatar + name + stacked colored fill + total) ---

function Bar({ rank, ign, total, totalRaw, types, typesRaw, widthPct }: {
  rank: number;
  ign: string;
  total: number;
  totalRaw: number;
  types: Record<string, number>;
  typesRaw: Record<string, number>;
  widthPct: number;
}) {
  const segments = RAID_TYPE_ORDER
    .map(t => ({ type: t, value: typesRaw[t] || 0 }))
    .filter(s => s.value > 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.3rem',
      height: '100%',
    }}>
      <span style={{
        fontSize: '0.65rem',
        fontWeight: '800',
        color: 'var(--text-secondary)',
        width: '14px',
        textAlign: 'right',
        flexShrink: 0,
      }}>{rank}</span>
      <div style={{
        width: '20px',
        height: '20px',
        flexShrink: 0,
        backgroundColor: '#1a1a2e',
        borderRadius: '3px',
        backgroundImage: ign ? `url(https://mc-heads.net/avatar/${encodeURIComponent(ign)}/20)` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }} />
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          height: `${BAR_HEIGHT - 8}px`,
          background: 'var(--bg-primary)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            // Clamp the visible bar to a minimum so short bars stay readable
            width: `max(87px, ${widthPct}%)`,
            display: 'flex',
          }}>
            {totalRaw > 0 ? segments.map(seg => (
              <div
                key={seg.type}
                style={{
                  flex: seg.value / totalRaw,
                  background: RAID_TYPE_COLORS[seg.type],
                  height: '100%',
                }}
                title={`${seg.type}: ${Math.round(seg.value)}`}
              />
            )) : (
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)' }} />
            )}
          </div>
          <div style={{
            position: 'absolute',
            top: 0,
            left: '0.4rem',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.62rem',
            fontWeight: '700',
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            pointerEvents: 'none',
            maxWidth: 'calc(100% - 2rem)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {ign.length > 16 ? `${ign.slice(0, 15)}…` : ign}
          </div>
        </div>
      </div>
      <span style={{
        fontSize: '0.7rem',
        fontWeight: '800',
        color: 'var(--text-primary)',
        minWidth: '24px',
        textAlign: 'right',
        flexShrink: 0,
      }}>{total}</span>
    </div>
  );
}

// --- Frame builder ---

// Smoothing window in days. The cumulative-raid time series is smoothed by
// spreading each day's raid increments across this many days, which fixes the
// "1-day-on / 1-day-off" stutter without changing each player's final total.
// Larger window = smoother bars but more "lead-in" before raids actually happen.
const SMOOTH_WINDOW_DAYS = 5;

// Spreads each value in `arr` across a centered window of `windowSize` days,
// returning a new array of the same length whose total exactly equals the
// input total (so re-cumulating preserves each player's final count).
function smoothIncrements(arr: number[], windowSize: number): number[] {
  if (windowSize <= 1 || arr.length <= 1) return arr.slice();
  const halfWindow = Math.floor(windowSize / 2);
  const out = new Array<number>(arr.length).fill(0);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === 0) continue;
    // Count how many output positions land inside [0, arr.length - 1] for
    // this source index, then split v evenly among them. This preserves the
    // total even at the start/end edges of the array.
    const lo = Math.max(0, i - halfWindow);
    const hi = Math.min(arr.length - 1, i + halfWindow);
    const inBounds = hi - lo + 1;
    const share = v / inBounds;
    for (let j = lo; j <= hi; j++) out[j] += share;
  }
  return out;
}

// Returns a new frame array where each player's daily cumulative is smoothed.
// The very last frame is pinned to the unsmoothed truth so the displayed final
// totals stay exact.
function smoothFrames(frames: Frame[], windowDays: number): Frame[] {
  if (frames.length === 0 || windowDays <= 1) return frames;

  const allKeys = new Set<string>();
  for (const f of frames) for (const k of f.players.keys()) allKeys.add(k);

  const out: Frame[] = frames.map(f => ({
    date: f.date,
    players: new Map<string, PlayerState>(),
  }));

  for (const key of allKeys) {
    // Pick the most recent ign for display
    let ign = key;
    for (const f of frames) {
      const p = f.players.get(key);
      if (p) ign = p.ign;
    }

    // Per-day cumulative + per-type cumulative
    const dailyTotal = frames.map(f => f.players.get(key)?.total ?? 0);
    const dailyTypeTotals: Record<string, number[]> = {};
    for (const t of RAID_TYPE_ORDER) {
      dailyTypeTotals[t] = frames.map(f => f.players.get(key)?.types[t] ?? 0);
    }

    // Convert to per-day increments
    const totalInc = dailyTotal.map((v, i) => (i === 0 ? v : v - dailyTotal[i - 1]));
    const typeInc: Record<string, number[]> = {};
    for (const t of RAID_TYPE_ORDER) {
      typeInc[t] = dailyTypeTotals[t].map((v, i) =>
        i === 0 ? v : v - dailyTypeTotals[t][i - 1]
      );
    }

    // Smooth each series independently
    const smoothedTotalInc = smoothIncrements(totalInc, windowDays);
    const smoothedTypeInc: Record<string, number[]> = {};
    for (const t of RAID_TYPE_ORDER) {
      smoothedTypeInc[t] = smoothIncrements(typeInc[t], windowDays);
    }

    // Re-cumulate
    let cumTotal = 0;
    const cumTypes: Record<string, number> = { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 };
    for (let i = 0; i < frames.length; i++) {
      cumTotal += smoothedTotalInc[i];
      for (const t of RAID_TYPE_ORDER) cumTypes[t] += smoothedTypeInc[t][i];
      // Skip writing players whose smoothed cumulative is still effectively 0
      if (cumTotal > 0.001) {
        out[i].players.set(key, {
          key,
          ign,
          total: cumTotal,
          types: { ...cumTypes },
        });
      }
    }

    // Pin the last frame to the unsmoothed final so end-of-race totals are exact
    const lastIdx = frames.length - 1;
    const truthLast = frames[lastIdx].players.get(key);
    if (truthLast) {
      out[lastIdx].players.set(key, {
        key,
        ign,
        total: truthLast.total,
        types: { ...truthLast.types },
      });
    }
  }

  return out;
}

function buildFrames(raids: GraidRaceRaid[]): {
  frames: Frame[];
  trackedPlayers: string[];
  finalTotals: Map<string, number>;
  finalPlayerOrder: Map<string, { ign: string; total: number }>;
} {
  if (raids.length === 0) {
    return { frames: [], trackedPlayers: [], finalTotals: new Map(), finalPlayerOrder: new Map() };
  }

  const raidsByDay = new Map<string, GraidRaceRaid[]>();
  for (const r of raids) {
    const day = new Date(r.completedAt).toISOString().slice(0, 10);
    if (!raidsByDay.has(day)) raidsByDay.set(day, []);
    raidsByDay.get(day)!.push(r);
  }
  const sortedDays = Array.from(raidsByDay.keys()).sort();

  const players = new Map<string, PlayerState>();
  const finalTotals = new Map<string, number>();
  RAID_TYPE_ORDER.forEach(t => finalTotals.set(t, 0));

  const dailySnapshots: Frame[] = [];

  for (const day of sortedDays) {
    for (const r of raidsByDay.get(day)!) {
      const short = getRaidShort(r.raidType);
      finalTotals.set(short, (finalTotals.get(short) || 0) + 1);
      for (const p of r.participants) {
        const key = p.uuid || p.ign.toLowerCase();
        let entry = players.get(key);
        if (!entry) {
          entry = { key, ign: p.ign, total: 0, types: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 } };
          players.set(key, entry);
        }
        entry.ign = p.ign;
        entry.total++;
        entry.types[short] = (entry.types[short] || 0) + 1;
      }
    }
    const snap = new Map<string, PlayerState>();
    for (const [k, v] of players.entries()) {
      snap.set(k, { key: v.key, ign: v.ign, total: v.total, types: { ...v.types } });
    }
    dailySnapshots.push({ date: day, players: snap });
  }

  // Smooth the cumulative time series so the bar growth doesn't stutter on
  // sparse raid patterns (1 day on / 1 day off). Final per-player totals are
  // pinned to the unsmoothed truth so end-of-race numbers stay exact.
  const smoothedSnapshots = smoothFrames(dailySnapshots, SMOOTH_WINDOW_DAYS);

  const everTop = new Set<string>();
  for (const snap of smoothedSnapshots) {
    const sorted = Array.from(snap.players.values()).sort((a, b) => b.total - a.total);
    for (const p of sorted.slice(0, VISIBLE_BARS)) everTop.add(p.key);
  }
  const finalPlayerOrder = new Map<string, { ign: string; total: number }>();
  if (smoothedSnapshots.length > 0) {
    const last = smoothedSnapshots[smoothedSnapshots.length - 1];
    const finalSorted = Array.from(last.players.values()).sort((a, b) => b.total - a.total);
    for (const p of finalSorted.slice(0, VISIBLE_BARS)) {
      everTop.add(p.key);
      finalPlayerOrder.set(p.key, { ign: p.ign, total: p.total });
    }
  }

  return { frames: smoothedSnapshots, trackedPlayers: Array.from(everTop), finalTotals, finalPlayerOrder };
}

// --- Avatar pre-loading for canvas rendering ---

function preloadAvatars(players: { key: string; ign: string }[]): Promise<Map<string, HTMLImageElement>> {
  return new Promise((resolve) => {
    const map = new Map<string, HTMLImageElement>();
    if (players.length === 0) { resolve(map); return; }
    let remaining = players.length;
    const done = () => { if (--remaining <= 0) resolve(map); };
    for (const p of players) {
      if (!p.ign) { done(); continue; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { map.set(p.key, img); done(); };
      img.onerror = () => { done(); };
      img.src = `https://mc-heads.net/avatar/${encodeURIComponent(p.ign)}/40`;
    }
  });
}

// --- Draw session: stable rank transitions for the canvas ---
//
// `createDrawSession` is the canvas-side counterpart to the on-screen DOM bars'
// CSS transitions. The on-screen bars get smooth row movement "for free" via
// `transition: transform 350ms ease-out`. For the canvas we have to do this
// ourselves: per-player ease from `from` to `to` over a fixed 0.35 s window.
//
// Two design choices that fix the audit-reported bugs:
//
// 1. Target ranks are recomputed ONLY when the integer day index `idx` changes,
//    not on every draw call. This means a player's rank can only flip at a real
//    day boundary, exactly matching the on-screen DOM behavior. Without this,
//    interpolating totals would shift the rank order continuously and bars would
//    jitter at fractional positions forever.
//
// 2. Each per-player transition has a fixed start time and a fixed duration.
//    Once `elapsedSeconds - startSec >= TRANSITION_SECONDS`, `lerpTransition`
//    returns the target exactly. Bars at rest sit on integer rows, never on
//    fractional ones — which fixes the "incorrect spacing" complaint.
//
// `dt` is passed in (not measured from wall clock) so the same number of
// "transition seconds" elapse per encoded frame regardless of how fast the
// encoder is actually running.
const TRANSITION_SECONDS = 0.35;

interface RankTransition {
  from: number;
  to: number;
  startSec: number;
}

function lerpTransition(trans: RankTransition, nowSec: number): number {
  const elapsed = nowSec - trans.startSec;
  if (elapsed >= TRANSITION_SECONDS) return trans.to;
  if (elapsed <= 0) return trans.from;
  const t = elapsed / TRANSITION_SECONDS;
  // ease-out cubic — matches the feel of the DOM CSS `ease-out` curve
  const eased = 1 - Math.pow(1 - t, 3);
  return trans.from + (trans.to - trans.from) * eased;
}

interface DrawSession {
  draw: (idx: number, t: number, dtSeconds: number) => void;
}

function createDrawSession(
  canvas: HTMLCanvasElement,
  frames: Frame[],
  trackedPlayers: string[],
  finalPlayerOrder: Map<string, { ign: string; total: number }>,
  avatars: Map<string, HTMLImageElement>
): DrawSession {
  const transitions = new Map<string, RankTransition>();
  let elapsedSeconds = 0;
  let lastIdx = -1;
  let cachedTargets: Map<string, number> | null = null;

  // Compute the integer-snapshot rank order for a given frame index.
  const computeTargetsForIdx = (idx: number): Map<string, number> => {
    const frame = frames[idx];
    if (!frame) return new Map();
    // Sort by the SNAPSHOT total (not interpolated) so ranks change exactly
    // once per integer day boundary.
    const snapshot = trackedPlayers
      .map(key => {
        const p = frame.players.get(key);
        return {
          key,
          total: p?.total || 0,
          ign: p?.ign || finalPlayerOrder.get(key)?.ign || key,
        };
      })
      .sort((a, b) => b.total - a.total || a.ign.localeCompare(b.ign));
    const m = new Map<string, number>();
    snapshot.forEach((p, i) => m.set(p.key, i));
    return m;
  };

  return {
    draw(idx: number, t: number, dtSeconds: number) {
      elapsedSeconds += dtSeconds;

      // Recompute target ranks only when crossing into a new day.
      if (idx !== lastIdx || !cachedTargets) {
        const newTargets = computeTargetsForIdx(idx);

        if (cachedTargets === null) {
          // First draw: seed transitions so frame 0 has no animation in.
          for (const key of trackedPlayers) {
            const target = newTargets.get(key) ?? VISIBLE_BARS;
            transitions.set(key, {
              from: target,
              to: target,
              startSec: elapsedSeconds - TRANSITION_SECONDS,
            });
          }
        } else {
          // Subsequent day: start a new transition for any player whose target changed.
          for (const key of trackedPlayers) {
            const newTarget = newTargets.get(key) ?? VISIBLE_BARS;
            const existing = transitions.get(key);
            if (!existing || existing.to !== newTarget) {
              const currentRendered = existing
                ? lerpTransition(existing, elapsedSeconds)
                : newTarget;
              transitions.set(key, {
                from: currentRendered,
                to: newTarget,
                startSec: elapsedSeconds,
              });
            }
          }
        }

        cachedTargets = newTargets;
        lastIdx = idx;
      }

      // Build the interpolated player list (totals + per-type) for the bar values.
      const fromIdx = idx;
      const toIdx = Math.min(fromIdx + 1, frames.length - 1);
      const fromFrame = frames[fromIdx];
      const toFrame = frames[toIdx];
      const players: InterpPlayer[] = trackedPlayers.map(key => {
        const f = fromFrame.players.get(key);
        const tt = toFrame.players.get(key);
        const fromTotal = f?.total || 0;
        const toTotal = tt?.total || 0;
        const totalRaw = fromTotal + (toTotal - fromTotal) * t;
        const types: Record<string, number> = {};
        const typesRaw: Record<string, number> = {};
        for (const tp of RAID_TYPE_ORDER) {
          const fv = f?.types[tp] || 0;
          const tv = tt?.types[tp] || 0;
          const v = fv + (tv - fv) * t;
          typesRaw[tp] = v;
          types[tp] = Math.round(v);
        }
        return {
          key,
          ign: tt?.ign || f?.ign || finalPlayerOrder.get(key)?.ign || key,
          totalRaw,
          total: Math.round(totalRaw),
          typesRaw,
          types,
        };
      });

      // Build the layout from cachedTargets + lerped transitions.
      const layout: LayoutEntry[] = players.map(p => {
        const trans = transitions.get(p.key);
        const renderedRank = trans ? lerpTransition(trans, elapsedSeconds) : VISIBLE_BARS;
        const targetRank = cachedTargets?.get(p.key) ?? VISIBLE_BARS;
        return { player: p, renderedRank, targetRank };
      });

      // Max value for bar width scaling — based on the integer snapshot's top 10.
      const sortedByTotal = [...players].sort((a, b) => b.totalRaw - a.totalRaw);
      const max = Math.max(...sortedByTotal.slice(0, VISIBLE_BARS).map(p => p.totalRaw), 1);

      drawRaceFrame(
        canvas,
        { date: t > 0.5 ? toFrame.date : fromFrame.date, players },
        layout,
        max,
        avatars
      );
    },
  };
}

// --- Canvas drawing ---

function drawRaceFrame(
  canvas: HTMLCanvasElement,
  frame: InterpFrame,
  layout: LayoutEntry[],
  maxValueRaw: number,
  avatars: Map<string, HTMLImageElement>
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padX = 24;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0f1422');
  grad.addColorStop(1, '#070b14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Title (left) + date (right) on the same baseline
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Top Guild Raiders', padX, 34);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#9aa3b2';
  ctx.textAlign = 'right';
  const d = new Date(frame.date);
  const dateStr = `${d.toLocaleString('default', { month: 'long' })} ${d.getDate()}, ${d.getFullYear()}`;
  ctx.fillText(dateStr, W - padX, 34);
  ctx.textAlign = 'left';

  // Legend just below the header so it can never overlap a bar
  ctx.font = '11px sans-serif';
  let legendX = padX;
  const legendY = 56;
  for (const t of RAID_TYPE_ORDER) {
    ctx.fillStyle = RAID_TYPE_COLORS[t];
    ctx.fillRect(legendX, legendY, 10, 10);
    ctx.fillStyle = '#9aa3b2';
    ctx.fillText(t, legendX + 14, legendY + 9);
    legendX += 14 + ctx.measureText(t).width + 14;
  }

  // Bars
  const barTop = 84;
  const barH = 34;
  const barGap = 6;
  const rowH = barH + barGap;
  const rankColW = 28;
  const avatarSize = barH - 6;
  const totalColW = 56;
  const barLeft = padX + rankColW + avatarSize + 12;
  const barRight = W - padX - totalColW;
  const barTrackW = barRight - barLeft;
  // Clamp the minimum fill width so a 16-char IGN always fits inside the bar
  const minFill = Math.min(MIN_BAR_FILL_PX, barTrackW);

  // Sort by rendered rank so bars draw in the right z-order during transitions.
  const drawList = [...layout].sort((a, b) => a.renderedRank - b.renderedRank);

  for (const entry of drawList) {
    const p = entry.player;
    const renderedRank = entry.renderedRank;
    const targetRank = entry.targetRank;
    const y = barTop + renderedRank * rowH;

    // Visibility decision keys off the TARGET rank — a bar whose target is in
    // the top 10 stays at full opacity, even if its rendered rank is fractionally
    // past 9 mid-transition. Bars whose target is OUT of the top 10 fade as they
    // slide past the boundary.
    const inTopByTarget = targetRank < VISIBLE_BARS;
    const overshoot = Math.max(0, renderedRank - (VISIBLE_BARS - 1));
    const alpha = inTopByTarget
      ? 1
      : Math.max(0, 1 - overshoot * 0.8);
    if (alpha <= 0) continue;
    if (alpha < 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
    }

    // Rank label uses the integer target rank (snaps), matching the DOM
    ctx.fillStyle = '#9aa3b2';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(targetRank + 1), padX + rankColW - 4, y + barH / 2 + 5);
    ctx.textAlign = 'left';

    // Avatar
    const avX = padX + rankColW + 4;
    const avY = y + 3;
    const img = avatars.get(p.key);
    if (img && img.complete && img.naturalWidth > 0) {
      try {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, avX, avY, avatarSize, avatarSize);
      } catch {
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(avX, avY, avatarSize, avatarSize);
      }
    } else {
      ctx.fillStyle = '#1a1f2e';
      ctx.fillRect(avX, avY, avatarSize, avatarSize);
    }

    // Bar background track
    const trackY = y + 4;
    const trackH = barH - 8;
    ctx.fillStyle = '#161b29';
    roundRect(ctx, barLeft, trackY, barTrackW, trackH, 4);
    ctx.fill();

    // Stacked colored fill — clamped to minFill so the IGN is always readable
    const widthRatio = maxValueRaw > 0 ? p.totalRaw / maxValueRaw : 0;
    const naturalFillW = barTrackW * widthRatio;
    const fillW = Math.max(minFill, naturalFillW);
    if (p.totalRaw > 0) {
      ctx.save();
      roundRect(ctx, barLeft, trackY, Math.min(barTrackW, fillW), trackH, 4);
      ctx.clip();
      let segX = barLeft;
      for (const t of RAID_TYPE_ORDER) {
        const v = p.typesRaw[t] || 0;
        if (v <= 0) continue;
        // Distribute segment widths over the actual rendered fill width
        const segW = fillW * (v / p.totalRaw);
        ctx.fillStyle = RAID_TYPE_COLORS[t];
        ctx.fillRect(segX, trackY, segW + 0.5, trackH);
        segX += segW;
      }
      ctx.restore();
    } else {
      // Player with 0 raids: muted placeholder so the IGN still has a backing
      ctx.save();
      roundRect(ctx, barLeft, trackY, minFill, trackH, 4);
      ctx.fillStyle = '#1f2638';
      ctx.fill();
      ctx.restore();
    }

    // IGN overlay (max 16 chars)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 3;
    ctx.fillText(truncate(p.ign, 16), barLeft + 8, y + barH / 2 + 4);
    ctx.shadowBlur = 0;

    // Total
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(p.total), W - padX, y + barH / 2 + 5);
    ctx.textAlign = 'left';

    if (alpha < 1) ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

const miniBtnStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-card)',
  borderRadius: '0.375rem',
  padding: '0.4rem 0.55rem',
  color: 'var(--text-primary)',
  fontSize: '0.7rem',
  cursor: 'pointer',
  fontWeight: '700',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-card)',
  borderRadius: '0.375rem',
  padding: '0.45rem 0.55rem',
  color: 'var(--text-primary)',
  fontSize: '0.7rem',
  cursor: 'pointer',
  fontWeight: '700',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
};

const miniLabel: React.CSSProperties = {
  fontSize: '0.6rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.1rem',
};

const dateInputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-card)',
  borderRadius: '0.375rem',
  padding: '0.3rem 0.4rem',
  color: 'var(--text-primary)',
  fontSize: '0.7rem',
  outline: 'none',
  width: '100%',
};
