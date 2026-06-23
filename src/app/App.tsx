import { useState, useRef, useEffect, useCallback } from 'react';
import { ClickWheel } from './components/ClickWheel';

// ─── Audio Engine ──────────────────────────────────────────────────────────

function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);
  const rateRef = useRef(1.0);
  const durationRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackName, setTrackName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  };

  const getCurrentOffset = useCallback((): number => {
    if (!ctxRef.current || !isPlayingRef.current) return startOffsetRef.current;
    const elapsed = (ctxRef.current.currentTime - startCtxTimeRef.current) * rateRef.current;
    return Math.min(startOffsetRef.current + elapsed, durationRef.current);
  }, []);

  const killSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const startFrom = useCallback((offset: number, rate: number, isScrub = false) => {
    const ctx = getCtx();
    const buffer = bufferRef.current;
    if (!buffer) return;
    void ctx.resume();
    killSource();

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(0.1, Math.min(16, rate));
    src.connect(ctx.destination);

    const safeOffset = Math.max(0, Math.min(offset, buffer.duration - 0.05));
    src.start(0, safeOffset);
    src.onended = () => {
      // Only handle natural end (not stopped by us)
      if (isPlayingRef.current && !isScrub) {
        const remaining = durationRef.current - (startOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current) * rateRef.current);
        if (remaining < 0.5) {
          isPlayingRef.current = false;
          startOffsetRef.current = 0;
          setIsPlaying(false);
          setCurrentTime(0);
        }
      }
    };

    startCtxTimeRef.current = ctx.currentTime;
    startOffsetRef.current = safeOffset;
    sourceRef.current = src;
    isPlayingRef.current = !isScrub ? true : isPlayingRef.current;
  }, [killSource]);

  const play = useCallback(() => {
    if (!bufferRef.current) return;
    startFrom(getCurrentOffset(), rateRef.current);
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [startFrom, getCurrentOffset]);

  const pause = useCallback(() => {
    startOffsetRef.current = getCurrentOffset();
    killSource();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, [getCurrentOffset, killSource]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  const scrubTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seek = useCallback((deltaSeconds: number) => {
    const newOffset = Math.max(0, Math.min(getCurrentOffset() + deltaSeconds, durationRef.current - 0.05));
    startOffsetRef.current = newOffset;
    setCurrentTime(newOffset);
    setIsScrubbing(true);

    // Play a brief snippet at scrub speed so user hears the position
    const scrubRate = Math.abs(deltaSeconds) > 0.5 ? 4.0 : 2.0;
    startFrom(newOffset, scrubRate * rateRef.current, true);
    isPlayingRef.current = isPlayingRef.current; // keep playing state

    if (scrubTimeout.current) clearTimeout(scrubTimeout.current);
    scrubTimeout.current = setTimeout(() => {
      setIsScrubbing(false);
      if (isPlayingRef.current) {
        startFrom(startOffsetRef.current, rateRef.current);
      } else {
        killSource();
      }
    }, 300);
  }, [getCurrentOffset, startFrom, killSource]);

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, newRate));
    rateRef.current = clamped;
    setPlaybackRateState(clamped);
    if (isPlayingRef.current) {
      startFrom(getCurrentOffset(), clamped);
    }
  }, [getCurrentOffset, startFrom]);

  const loadFile = useCallback(async (file: File) => {
    const ctx = getCtx();
    try {
      const arr = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr);
      killSource();
      isPlayingRef.current = false;
      bufferRef.current = buffer;
      durationRef.current = buffer.duration;
      startOffsetRef.current = 0;
      rateRef.current = 1.0;
      const name = file.name.replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, '');
      setTrackName(name);
      setDuration(buffer.duration);
      setCurrentTime(0);
      setIsPlaying(false);
      setPlaybackRateState(1.0);
      setIsLoaded(true);
    } catch (err) {
      console.error('Failed to decode audio:', err);
    }
  }, [killSource]);

  // Poll current time during playback
  useEffect(() => {
    const id = setInterval(() => {
      if (isPlayingRef.current) setCurrentTime(getCurrentOffset());
    }, 80);
    return () => clearInterval(id);
  }, [getCurrentOffset]);

  return {
    isPlaying, playbackRate, currentTime, duration, trackName, isLoaded, isScrubbing,
    togglePlay, seek, setRate, loadFile,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function rateLabel(r: number): string {
  if (Math.abs(r - 1.0) < 0.03) return 'NORMAL';
  if (r > 1.0) return `CHIPMUNK ×${r.toFixed(2)}`;
  return `SLOW ×${r.toFixed(2)}`;
}

// ─── Waveform bars (animated during playback) ──────────────────────────────

function WaveformBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(() => Array(18).fill(15));

  useEffect(() => {
    if (!active) {
      setHeights(Array(18).fill(15));
      return;
    }
    const id = setInterval(() => {
      setHeights(prev => prev.map((_, i) => {
        const base = 10 + Math.random() * 80;
        return Math.round((prev[i] * 0.4) + (base * 0.6));
      }));
    }, 90);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 28 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: `${h}%`,
            background: color,
            borderRadius: 2,
            opacity: active ? 0.8 : 0.2,
            transition: 'height 0.09s ease-out',
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Cassette screw detail ─────────────────────────────────────────────────

function Screw({ x, y }: { x: number; y: number }) {
  return (
    <div style={{
      position: 'absolute',
      left: x - 6,
      top: y - 6,
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 40% 35%, #c0b090, #907860)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
    }}>
      {/* Slot */}
      <div style={{ position: 'absolute', top: '46%', left: '15%', right: '15%', height: 1.5, background: 'rgba(0,0,0,0.5)', borderRadius: 1 }} />
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const audio = useAudioEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leftAngle, setLeftAngle] = useState(0);
  const [rightAngle, setRightAngle] = useState(0);
  const [fileError, setFileError] = useState('');

  // Reel spin animation during playback
  useEffect(() => {
    if (!audio.isPlaying) return;
    let last = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // ~1 full rotation every 22 seconds at 1x speed
      const deg = (dt / 1000) * (audio.playbackRate * 360) / 22;
      setLeftAngle(a => (a + deg) % 360);
      setRightAngle(a => (a - deg * 0.82) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio.isPlaying, audio.playbackRate]);

  const handleLeftRotate = useCallback((delta: number) => {
    // 0.07 seconds per degree → about 12s for a 180° sweep
    const secs = delta * 0.07;
    audio.seek(secs);
    setLeftAngle(a => a + delta * 0.85);
  }, [audio]);

  const handleRightRotate = useCallback((delta: number) => {
    // 0.012× per degree → full range (0.25→4.0) over ~150° rotation
    audio.setRate(audio.playbackRate + delta * 0.012);
    setRightAngle(a => a + delta * 0.85);
  }, [audio]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError('');
    await audio.loadFile(file);
    e.target.value = '';
  };

  const progress = audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0;
  const rateNorm = audio.playbackRate;
  const rateColor = rateNorm > 1.05 ? '#f0a030' : rateNorm < 0.95 ? '#60c8ff' : '#33ff7a';

  // The tape window background simulates tape wound differently depending on progress
  const leftReelSize = 0.45 + (1 - progress / 100) * 0.35; // supply reel starts full
  const rightReelSize = 0.45 + (progress / 100) * 0.35;   // take-up reel fills up

  return (
    <div
      // MARKER-MAKE-KIT-INVOKED
      style={{
        width: '100%',
        height: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, #18140e 0%, #0b0a08 60%, #060504 100%)',
        fontFamily: "'Barlow Condensed', sans-serif",
        padding: 24,
        gap: 20,
      }}
    >
      {/* Ambient floor glow */}
      <div style={{
        position: 'fixed',
        bottom: 0, left: '20%', right: '20%',
        height: 200,
        background: 'radial-gradient(ellipse at 50% 100%, rgba(240,160,48,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── Cassette Body ── */}
      <div
        style={{
          width: 660,
          maxWidth: '100%',
          position: 'relative',
          borderRadius: 18,
          background: 'linear-gradient(155deg, #e0d3b8 0%, #cec19e 45%, #bfb08c 100%)',
          boxShadow: [
            '0 0 0 1.5px #a09070',
            '0 2px 0 2.5px #c8b880',
            '0 -1px 0 1px #d8c898',
            '0 32px 80px rgba(0,0,0,0.92)',
            '0 8px 30px rgba(0,0,0,0.6)',
            'inset 0 1px 0 rgba(255,255,255,0.25)',
            'inset 0 -1px 0 rgba(0,0,0,0.15)',
          ].join(', '),
          padding: '18px 22px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
        }}
      >
        {/* Corner screws */}
        <Screw x={22} y={22} />
        <Screw x={638} y={22} />
        <Screw x={22} y={368} />
        <Screw x={638} y={368} />

        {/* Cassette top edge notches (record protection tabs) */}
        <div style={{ position: 'absolute', top: -1, left: 80, width: 32, height: 6, background: '#0b0a08', borderRadius: '0 0 4px 4px' }} />
        <div style={{ position: 'absolute', top: -1, right: 80, width: 32, height: 6, background: '#0b0a08', borderRadius: '0 0 4px 4px' }} />

        {/* ── Label Area ── */}
        <div
          style={{
            borderRadius: 8,
            height: 112,
            background: 'linear-gradient(135deg, #0f1628 0%, #1a2240 55%, #0a1030 100%)',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          {/* Retro stripe bars */}
          {['#c0392b','#e55a1c','#e8961c','#c8b820','#28a860','#1a78c0','#6030b0','#c0392b'].map((c, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: 0, right: 0,
              top: i * 14 + 2,
              height: 7,
              background: c,
              opacity: 0.55,
            }} />
          ))}

          {/* Label content */}
          <div style={{
            position: 'absolute', inset: 0,
            padding: '12px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 4, fontFamily: "'Space Mono', monospace" }}>
                  SIDE A · 60 MIN
                </div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: audio.trackName ? 22 : 16,
                    fontWeight: 700,
                    letterSpacing: audio.trackName ? 0.5 : 3,
                    marginTop: 4,
                    maxWidth: 380,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                  }}
                >
                  {audio.trackName || 'NO TAPE LOADED'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: 3, fontFamily: "'Space Mono', monospace" }}>TYPE II</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: 2, fontFamily: "'Space Mono', monospace" }}>Cr O₂</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: 2, fontFamily: "'Space Mono', monospace" }}>120µs</div>
              </div>
            </div>

            <div style={{ color: 'rgba(180,180,180,0.5)', fontSize: 9, letterSpacing: 5, fontFamily: "'Space Mono', monospace" }}>
              HIGH BIAS · CHROMIUM DIOXIDE · IEC TYPE II
            </div>
          </div>
        </div>

        {/* ── Reel Window Area ── */}
        <div
          style={{
            borderRadius: 10,
            background: '#0d0b09',
            boxShadow: 'inset 0 4px 14px rgba(0,0,0,0.85), inset 0 0 0 1.5px rgba(0,0,0,0.6)',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            position: 'relative',
          }}
        >
          {/* Tape path line (background) */}
          <div style={{
            position: 'absolute',
            bottom: 18,
            left: '20%',
            right: '20%',
            height: 5,
            background: 'linear-gradient(90deg, #1a1510, #2a2018, #1a1510)',
            borderRadius: 2,
            opacity: 0.6,
          }} />

          {/* ─ Left Click Wheel (SCRUB) ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 1 }}>
            <div style={{ position: 'relative' }}>
              {/* Tape reel shadow fill — shows "wound tape" scale */}
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle at 50% 50%, rgba(60,40,20,${leftReelSize * 0.4}) 0%, transparent 70%)`,
                pointerEvents: 'none',
                zIndex: 5,
              }} />
              <ClickWheel
                size={148}
                rotationAngle={leftAngle}
                onRotate={handleLeftRotate}
                onCenterClick={audio.togglePlay}
                accentColor="#e8961c"
                isActive={audio.isPlaying}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#4a3a20', fontSize: 9, letterSpacing: 3, fontFamily: "'Space Mono', monospace" }}>
                SCRUB
              </div>
              <div style={{ color: '#3a2c14', fontSize: 8, letterSpacing: 2, fontFamily: "'Space Mono', monospace", opacity: 0.7 }}>
                TAP: PLAY/PAUSE
              </div>
            </div>
          </div>

          {/* ─ LCD Screen ─ */}
          <div
            style={{
              flex: 1,
              height: 148,
              borderRadius: 7,
              background: '#060e07',
              border: '2px solid #0a1c0c',
              boxShadow: [
                'inset 0 3px 10px rgba(0,0,0,0.8)',
                `0 0 24px rgba(51,255,122,${audio.isPlaying ? '0.12' : '0.04'})`,
              ].join(', '),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 14px',
              gap: 8,
              position: 'relative',
              overflow: 'hidden',
              transition: 'box-shadow 0.4s ease',
              fontFamily: "'VT323', monospace",
            }}
          >
            {/* Scanlines overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
              pointerEvents: 'none',
              zIndex: 2,
            }} />
            {/* Screen glare */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '35%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            }} />

            {audio.isLoaded ? (
              <>
                {/* Status line */}
                <div style={{ color: '#1a6030', fontSize: 13, letterSpacing: 3, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: audio.isScrubbing ? '#f0a030' : (audio.isPlaying ? '#33ff7a' : '#1a6030') }}>
                    {audio.isScrubbing ? '⟨⟨ SCRUB ⟩⟩' : (audio.isPlaying ? '▶ PLAY' : '⏸ PAUSE')}
                  </span>
                </div>

                {/* Time display */}
                <div style={{ color: '#33ff7a', fontSize: 34, lineHeight: 1, letterSpacing: 3, textShadow: '0 0 12px rgba(51,255,122,0.5)' }}>
                  {fmtTime(audio.currentTime)}
                  <span style={{ color: '#1a6030', fontSize: 20 }}> / {fmtTime(audio.duration)}</span>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: 5, background: '#0a2010', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #1aaa50, #33ff7a)',
                    borderRadius: 3,
                    boxShadow: '0 0 6px rgba(51,255,122,0.6)',
                    transition: 'width 0.08s linear',
                  }} />
                </div>

                {/* Playback rate */}
                <div style={{ color: rateColor, fontSize: 16, letterSpacing: 3, textShadow: `0 0 8px ${rateColor}88` }}>
                  {rateLabel(rateNorm)}
                </div>

                {/* Waveform */}
                <WaveformBars active={audio.isPlaying && !audio.isScrubbing} color="#33ff7a" />
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#1a5025', gap: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 32, letterSpacing: 4 }}>NO SIGNAL</div>
                <div style={{ fontSize: 18, opacity: 0.7, letterSpacing: 3 }}>LOAD A TAPE ▼</div>
                <div style={{ fontSize: 12, opacity: 0.4, letterSpacing: 2, fontFamily: "'Space Mono', monospace", lineHeight: 1.5 }}>
                  .MP3  .WAV  .OGG<br/>.M4A  .AAC  .FLAC
                </div>
              </div>
            )}
          </div>

          {/* ─ Right Click Wheel (CHIPMUNK) ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 1 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle at 50% 50%, rgba(60,40,20,${rightReelSize * 0.4}) 0%, transparent 70%)`,
                pointerEvents: 'none',
                zIndex: 5,
              }} />
              <ClickWheel
                size={148}
                rotationAngle={rightAngle}
                onRotate={handleRightRotate}
                onCenterClick={() => audio.setRate(1.0)}
                accentColor="#33ff7a"
                isActive={Math.abs(audio.playbackRate - 1.0) > 0.03}
              />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#1e4028', fontSize: 9, letterSpacing: 3, fontFamily: "'Space Mono', monospace" }}>
                SPEED
              </div>
              <div style={{ color: '#1a3020', fontSize: 8, letterSpacing: 2, fontFamily: "'Space Mono', monospace", opacity: 0.7 }}>
                TAP: RESET 1×
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Tape Strip / Controls ── */}
        <div
          style={{
            height: 38,
            background: 'linear-gradient(180deg, #181410 0%, #0e0c09 100%)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 16,
            paddingRight: 12,
            gap: 12,
          }}
        >
          {/* Tape path guide posts */}
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 35%, #4a4030, #2a2018)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
              flexShrink: 0,
            }} />
          ))}

          {/* Tape strip progress */}
          <div style={{ flex: 1, height: 5, background: '#0a0806', borderRadius: 2.5, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #3a2a14, #5a4020)',
              borderRadius: 2.5,
              transition: 'width 0.08s linear',
            }} />
            {/* Tape texture lines */}
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: `${i * 5}%`,
                width: 1,
                background: 'rgba(0,0,0,0.3)',
              }} />
            ))}
          </div>

          {/* Load button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'none',
              border: '1px solid #3a3020',
              color: '#a08840',
              padding: '5px 14px',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: 2.5,
              fontFamily: "'Space Mono', monospace",
              flexShrink: 0,
              transition: 'border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget.style.borderColor = '#e8961c'); (e.currentTarget.style.color = '#e8961c'); }}
            onMouseLeave={e => { (e.currentTarget.style.borderColor = '#3a3020'); (e.currentTarget.style.color = '#a08840'); }}
          >
            LOAD ▲
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Cassette body highlight (top edge light catch) */}
        <div style={{
          position: 'absolute',
          top: 10, left: 18, right: 18, height: 2,
          background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.35) 30%, rgba(255,255,255,0.45) 50%, rgba(255,255,255,0.35) 70%, transparent 95%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
        {/* Cassette body bottom shadow */}
        <div style={{
          position: 'absolute',
          bottom: 10, left: 18, right: 18, height: 2,
          background: 'linear-gradient(90deg, transparent 5%, rgba(0,0,0,0.25) 50%, transparent 95%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Usage hints ── */}
      <div style={{
        display: 'flex',
        gap: 28,
        color: '#3a3020',
        fontSize: 10,
        letterSpacing: 2.5,
        fontFamily: "'Space Mono', monospace",
        opacity: 0.75,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 640,
      }}>
        <span>⟵ DRAG LEFT WHEEL TO SCRUB</span>
        <span>DRAG RIGHT WHEEL TO CHIPMUNK ⟶</span>
        <span>TAP CENTERS TO PLAY / RESET</span>
      </div>

      {fileError && (
        <div style={{ color: '#e84030', fontSize: 12, fontFamily: "'Space Mono', monospace", letterSpacing: 2 }}>
          {fileError}
        </div>
      )}
    </div>
  );
}
