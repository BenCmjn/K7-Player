import { useState, useRef, useEffect, useCallback } from 'react';
import { CassetteWheel } from './components/CassetteWheel';
import svgPaths from '../imports/Cassette/svg-kn4si39m8f';
import { imgCover } from '../imports/Cassette/svg-58mld';

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

  const startFrom = useCallback((offset: number, rate: number) => {
    const ctx = getCtx();
    const buffer = bufferRef.current;
    if (!buffer) return;
    void ctx.resume();
    killSource();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(0.1, Math.min(16, rate));
    src.connect(ctx.destination);
    const safe = Math.max(0, Math.min(offset, buffer.duration - 0.05));
    src.start(0, safe);
    src.onended = () => {
      const pos = startOffsetRef.current + (ctx.currentTime - startCtxTimeRef.current) * rateRef.current;
      if (isPlayingRef.current && pos >= durationRef.current - 0.3) {
        isPlayingRef.current = false;
        startOffsetRef.current = 0;
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };
    startCtxTimeRef.current = ctx.currentTime;
    startOffsetRef.current = safe;
    sourceRef.current = src;
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
    if (isPlayingRef.current) pause(); else play();
  }, [play, pause]);

  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seek = useCallback((deltaSeconds: number) => {
    const newOff = Math.max(0, Math.min(getCurrentOffset() + deltaSeconds, durationRef.current - 0.05));
    startOffsetRef.current = newOff;
    setCurrentTime(newOff);
    setIsScrubbing(true);
    // Brief playback at scrub speed for audio feedback
    startFrom(newOff, (deltaSeconds >= 0 ? 3.5 : 3.5) * rateRef.current);
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = setTimeout(() => {
      setIsScrubbing(false);
      if (isPlayingRef.current) startFrom(startOffsetRef.current, rateRef.current);
      else killSource();
    }, 280);
  }, [getCurrentOffset, startFrom, killSource]);

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, newRate));
    rateRef.current = clamped;
    setPlaybackRateState(clamped);
    if (isPlayingRef.current) startFrom(getCurrentOffset(), clamped);
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
      setTrackName(file.name.replace(/\.(mp3|wav|ogg|m4a|aac|flac)$/i, ''));
      setDuration(buffer.duration);
      setCurrentTime(0);
      setIsPlaying(false);
      setPlaybackRateState(1.0);
      setIsLoaded(true);
    } catch (err) {
      console.error('Failed to decode audio:', err);
    }
  }, [killSource]);

  useEffect(() => {
    const id = setInterval(() => {
      if (isPlayingRef.current) setCurrentTime(getCurrentOffset());
    }, 80);
    return () => clearInterval(id);
  }, [getCurrentOffset]);

  return { isPlaying, playbackRate, currentTime, duration, trackName, isLoaded, isScrubbing, togglePlay, seek, setRate, loadFile };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function rateLabel(r: number) {
  if (Math.abs(r - 1.0) < 0.03) return 'NORMAL';
  return r > 1 ? `CHIPMUNK ×${r.toFixed(2)}` : `SLOW ×${r.toFixed(2)}`;
}

// ─── Waveform bars ─────────────────────────────────────────────────────────

function WaveformBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(() => Array(14).fill(15));
  useEffect(() => {
    if (!active) { setHeights(Array(14).fill(15)); return; }
    const id = setInterval(() => {
      setHeights(prev => prev.map((h) => Math.round(h * 0.4 + (10 + Math.random() * 80) * 0.6)));
    }, 90);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 22 }}>
      {heights.map((h, i) => (
        <div key={i} style={{ width: 3, height: `${h}%`, background: color, borderRadius: 2, opacity: active ? 0.85 : 0.2, transition: 'height 0.09s ease-out' }} />
      ))}
    </div>
  );
}

// ─── LCD Screen content ────────────────────────────────────────────────────

interface LCDProps {
  isLoaded: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  trackName: string;
}

function LCDContent({ isLoaded, isPlaying, isScrubbing, currentTime, duration, playbackRate, trackName }: LCDProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const rateColor = playbackRate > 1.05 ? '#f0a030' : playbackRate < 0.95 ? '#60c8ff' : '#2aff7a';

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <p style={{ color: '#1a5025', fontSize: 28, letterSpacing: 4, margin: 0, fontFamily: "'VT323', monospace" }}>NO SIGNAL</p>
        <p style={{ color: '#1a5025', fontSize: 16, letterSpacing: 3, margin: 0, opacity: 0.7, fontFamily: "'VT323', monospace" }}>LOAD A TAPE ▼</p>
        <div style={{ color: '#1a5025', fontSize: 11, opacity: 0.4, letterSpacing: 2, fontFamily: "'Space Mono', monospace", textAlign: 'center', lineHeight: 1.6 }}>
          <div>.MP3  .WAV  .OGG</div>
          <div>.M4A  .AAC  .FLAC</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
      {/* Track name */}
      <div style={{ color: '#1a8040', fontSize: 11, letterSpacing: 2, fontFamily: "'Space Mono', monospace", textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {trackName}
      </div>
      {/* Status */}
      <div style={{ color: isScrubbing ? '#f0a030' : isPlaying ? '#2aff7a' : '#1a6030', fontSize: 14, letterSpacing: 3, fontFamily: "'VT323', monospace" }}>
        {isScrubbing ? '⟨⟨ SCRUB ⟩⟩' : isPlaying ? '▶ PLAY' : '⏸ PAUSE'}
      </div>
      {/* Time */}
      <div style={{ color: '#2aff7a', fontSize: 28, lineHeight: 1, letterSpacing: 2, textShadow: '0 0 10px rgba(42,255,122,0.45)', fontFamily: "'VT323', monospace" }}>
        {fmtTime(currentTime)}
        <span style={{ color: '#1a6030', fontSize: 18 }}> / {fmtTime(duration)}</span>
      </div>
      {/* Progress bar */}
      <div style={{ width: '100%', height: 4, background: '#0a2010', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#1aaa50,#2aff7a)', borderRadius: 2, transition: 'width 0.08s linear' }} />
      </div>
      {/* Rate */}
      <div style={{ color: rateColor, fontSize: 13, letterSpacing: 3, fontFamily: "'VT323', monospace", textShadow: `0 0 6px ${rateColor}55` }}>
        {rateLabel(playbackRate)}
      </div>
      {/* Waveform */}
      <WaveformBars active={isPlaying && !isScrubbing} color="#2aff7a" />
    </div>
  );
}

// ─── Interactive TapeControls (replaces Figma static TapeControls) ─────────

interface TapeControlsProps extends LCDProps {
  leftAngle: number;
  rightAngle: number;
  onLeftRotate: (delta: number) => void;
  onRightRotate: (delta: number) => void;
  onLeftCenter: () => void;
  onRightCenter: () => void;
}

function InteractiveTapeControls(props: TapeControlsProps) {
  const { leftAngle, rightAngle, onLeftRotate, onRightRotate, onLeftCenter, onRightCenter, ...lcdProps } = props;
  return (
    <div
      className="absolute overflow-clip rounded-[88px]"
      style={{ left: 224, top: 213, width: 634, height: 178, background: '#e6e6e6' }}
    >
      {/* Pill shape border (matches Figma TapeControls SVG) */}
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 634 178">
        <path d={svgPaths.p3c4202f0} fill="var(--fill-0, #E6E6E6)" stroke="var(--stroke-0, #202020)" strokeWidth="3" />
      </svg>

      {/* Left wheel — SCRUB */}
      <CassetteWheel
        side="left"
        rotationAngle={leftAngle}
        onRotate={onLeftRotate}
        onCenterClick={onLeftCenter}
      />

      {/* LCD Screen */}
      <div
        className="-translate-y-1/2 absolute rounded-[7px]"
        style={{
          left: 207,
          right: 207,
          top: '50%',
          height: 148,
          background: '#060e07',
          border: '2px solid #0a1c0c',
          boxShadow: 'inset 0 3px 10px rgba(0,0,0,0.8), 0 0 20px rgba(51,255,122,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 12px',
          overflow: 'hidden',
        }}
      >
        {/* Scanlines */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,rgba(0,0,0,0.16) 0px,rgba(0,0,0,0.16) 1px,transparent 1px,transparent 3px)', pointerEvents: 'none', zIndex: 2 }} />
        {/* Glare */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.03) 0%,transparent 100%)', pointerEvents: 'none', zIndex: 2 }} />
        <div style={{ position: 'relative', zIndex: 3, width: '100%' }}>
          <LCDContent {...lcdProps} />
        </div>
      </div>

      {/* Right wheel — SPEED */}
      <CassetteWheel
        side="right"
        rotationAngle={rightAngle}
        onRotate={onRightRotate}
        onCenterClick={onRightCenter}
      />
    </div>
  );
}

// ─── Figma Cassette Shell components ──────────────────────────────────────

function Holes() {
  return (
    <div className="absolute bottom-[19px] h-[56px] left-[257px] w-[567px]" data-name="Holes">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 567 56">
        <g>
          <circle cx="28" cy="28" fill="#202020" r="28" />
          <circle cx="539" cy="28" fill="#202020" r="28" />
          <rect fill="#202020" height="38" rx="6" width="38" x="112" />
          <rect fill="#202020" height="38" rx="6" width="38" x="417" />
        </g>
      </svg>
    </div>
  );
}

function Bump() {
  return (
    <div className="absolute contents left-[173px] top-[511px]">
      <div className="absolute h-[151px] left-[173px] top-[511px] w-[735px]">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 735 151">
          <path d={svgPaths.pa8f1480} stroke="#202020" strokeWidth="3" />
        </svg>
      </div>
      <Holes />
      <div className="-translate-x-1/2 absolute bottom-[102px] left-1/2 overflow-clip size-[36px]">
        <div className="absolute left-0 size-[36px] top-0">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="#202020" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Screws() {
  const screw = (className: string) => (
    <div className={`${className} overflow-clip size-[36px]`}>
      <div className="absolute left-0 size-[36px] top-0">
        <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
          <path d={svgPaths.p1a047080} fill="#202020" />
        </svg>
      </div>
    </div>
  );
  return (
    <div className="absolute contents left-[27px] top-[27px]">
      {screw('absolute left-[27px] top-[27px]')}
      {screw('absolute bottom-[27px] left-[27px]')}
      {screw('absolute right-[27px] top-[27px]')}
      {screw('absolute bottom-[27px] right-[27px]')}
    </div>
  );
}

function RainbowStripes() {
  return (
    <div className="content-stretch flex flex-col items-start relative shrink-0 w-full">
      <div className="bg-[#202020] flex-[1_0_0] min-h-px relative w-full" />
      <div className="bg-[#9c000f] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#f0ee75] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#259f6c] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#1975ff] h-[24px] relative shrink-0 w-full" />
      <div className="bg-[#f9faf1] flex-[1_0_0] min-h-px relative w-full" />
      <div className="bg-[#f9faf1] flex-[1_0_0] min-h-px relative w-full" />
    </div>
  );
}

function OvalsVertical({ uid }: { uid: string }) {
  return (
    <div className="relative shrink-0 size-[59px]">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 59 59">
        <mask fill="white" id={uid}>
          <path d={svgPaths.p29fdb300} />
        </mask>
        <path d={svgPaths.p863b000} fill="#202020" mask={`url(#${uid})`} />
      </svg>
    </div>
  );
}

function ScrubLabel() {
  return (
    <div className="absolute bottom-[11.14px] flex items-center justify-center left-[22px]">
      <div className="flex-none rotate-180">
        <div className="content-stretch flex items-center relative">
          <OvalsVertical uid="ov-scrub" />
          <div className="content-stretch flex h-[59px] items-start overflow-clip py-[4.917px] relative shrink-0">
            <span style={{ fontFamily: 'Oswald, "Barlow Condensed", sans-serif', fontSize: 49, fontWeight: 700, letterSpacing: -3, lineHeight: 1, color: '#202020', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              SCRUB
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpeedLabel() {
  return (
    <div className="absolute bottom-[13px] content-stretch flex items-center right-[27.99px]">
      <OvalsVertical uid="ov-speed" />
      <div className="content-stretch flex h-[59px] items-start overflow-clip py-[4.917px] relative shrink-0">
        <span style={{ fontFamily: 'Oswald, "Barlow Condensed", sans-serif', fontSize: 49, fontWeight: 700, letterSpacing: -3, lineHeight: 1, color: '#202020', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          SPEED
        </span>
      </div>
    </div>
  );
}

function RecordingTimeDetail() {
  return (
    <div className="-translate-x-1/2 absolute bottom-[13.41px] content-stretch flex gap-[5.714px] items-center justify-center left-[calc(50%-4.34px)] overflow-clip">
      <div className="content-stretch flex items-start pr-[2.286px] pt-[1.714px] relative shrink-0">
        <p style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 5.83, fontWeight: 700, textAlign: 'right', lineHeight: 1.13, color: '#202020', margin: 0, whiteSpace: 'nowrap' }}>
          Longer<br />Recording<br />Time
        </p>
      </div>
      <div className="relative shrink-0" style={{ width: 16, height: 32 }}>
        <div style={{ position: 'absolute', inset: 0, border: '0.857px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 6, transform: 'rotate(-90deg)', color: '#202020', whiteSpace: 'nowrap' }}>Min</span>
        </div>
      </div>
      <span style={{ fontFamily: '"Futura", "Oswald", "Barlow Condensed", sans-serif', fontSize: 27.43, color: '#202020', lineHeight: 'normal' }}>90</span>
    </div>
  );
}

function CoverLabel({ trackName }: { trackName: string }) {
  const displayName = trackName || 'K7 rebirth v_1';
  const fontSize = displayName.length > 18 ? 28 : displayName.length > 12 ? 36 : 44;
  return (
    <div className="absolute bg-[#f9faf1] border-[#202020] border-[1.5px] border-solid h-[83px] left-[180px] overflow-clip rounded-[64px] top-[39px] w-[598px]">
      {/* Red lines */}
      <div className="absolute h-0 left-[46.5px] right-[46.5px] top-[62.5px]">
        <div className="absolute inset-[-1.5px_0_0_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 502 1.5">
            <line stroke="#9C000F" strokeOpacity="0.56" strokeWidth="1.5" x2="502" y1="0.75" y2="0.75" />
          </svg>
        </div>
      </div>
      <div className="absolute h-0 left-[46.5px] right-[46.5px] top-[40.5px]">
        <div className="absolute inset-[-1.5px_0_0_0]">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 502 1.5">
            <line stroke="#9C000F" strokeOpacity="0.56" strokeWidth="1.5" x2="502" y1="0.75" y2="0.75" />
          </svg>
        </div>
      </div>
      {/* Track name */}
      <div
        className="-translate-x-1/2 -translate-y-1/2 absolute left-1/2 text-center"
        style={{
          top: 'calc(50% - 0.5px)',
          fontFamily: '"Rock Salt", cursive',
          fontSize,
          color: '#202020',
          letterSpacing: trackName ? 2 : 8.8,
          whiteSpace: 'nowrap',
          maxWidth: '90%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.1,
        }}
      >
        {displayName}
      </div>
    </div>
  );
}

function CoverArea({ trackName }: { trackName: string }) {
  return (
    <div
      className="absolute overflow-clip"
      style={{
        height: 426,
        left: 62,
        top: 56,
        width: 958,
        maskImage: `url("${imgCover}")`,
        WebkitMaskImage: `url("${imgCover}")`,
        maskSize: '958px 426px',
        WebkitMaskSize: '958px 426px',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskMode: 'alpha',
        maskComposite: 'intersect',
      }}
    >
      {/* Rainbow stripes */}
      <div className="absolute content-stretch flex flex-col inset-[0.5px_-0.5px_-254.5px_0.5px] items-start">
        <RainbowStripes />
      </div>

      {/* SCRUB label (bottom left, rotated 180°) */}
      <ScrubLabel />

      {/* Central label */}
      <CoverLabel trackName={trackName} />

      {/* A SIDE */}
      <div className="absolute content-stretch flex flex-col items-center left-[60px] top-[57px] whitespace-nowrap">
        <span style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 63.4, fontWeight: 900, letterSpacing: -2.85, lineHeight: 0.9, color: '#f3f3f3' }}>A</span>
        <span style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', fontSize: 32.33, fontWeight: 700, letterSpacing: -1.94, lineHeight: 1.13, color: '#f3f3f3', textTransform: 'uppercase' }}>Side</span>
      </div>

      {/* Bottom detail: Longer Recording Time / 90 */}
      <RecordingTimeDetail />

      {/* SPEED label (bottom right) */}
      <SpeedLabel />
    </div>
  );
}

function CoverOutline() {
  return (
    <div className="absolute h-[426px] left-[62px] right-[60px] top-[56px]">
      <div className="absolute inset-[-0.35%_-0.16%]">
        <svg className="block size-full rounded-[0px] m-[0px]" fill="none" preserveAspectRatio="none" viewBox="0 0 961 429"><path></path><path d={svgPaths.pbd08600} stroke="#202020" strokeWidth="3" /></svg>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const audio = useAudioEngine();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Wheel angles — only updated when user drags (no playback animation)
  const [leftAngle, setLeftAngle] = useState(0);
  const [rightAngle, setRightAngle] = useState(0);

  // Responsive scale
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(1, (window.innerWidth - 32) / 1080));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const handleLeftRotate = useCallback((delta: number) => {
    audio.seek(delta * 0.07);
    setLeftAngle(a => a + delta); // only visual, only on drag
  }, [audio]);

  const handleRightRotate = useCallback((delta: number) => {
    audio.setRate(audio.playbackRate + delta * 0.012);
    setRightAngle(a => a + delta); // only visual, only on drag
  }, [audio]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await audio.loadFile(file);
    e.target.value = '';
  };

  // Natural cassette dimensions from Figma
  const CW = 1080;
  const CH = 662;

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, #18140e 0%, #0b0a08 60%, #060504 100%)',
        padding: '24px 16px',
        gap: 28,
        boxSizing: 'border-box',
      }}
    >
      {/* ── Scaled cassette wrapper ── */}
      <div style={{ width: CW * scale, height: CH * scale, position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            width: CW,
            height: CH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {/* Cassette BG */}
          <div
            className="absolute bg-[#e6e6e6] rounded-[44px]"
            style={{ height: 656, left: 3, top: 3, width: 1074 }}
          >
            <div aria-hidden className="absolute border-[3px] border-[#202020] border-solid inset-[-3px] pointer-events-none rounded-[47px]" />
          </div>

          {/* Bump (bottom tab) */}
          <Bump />

          {/* Corner screws */}
          <Screws />

          {/* Cover with label */}
          <CoverArea trackName={audio.trackName} />

          {/* Cover outline */}
          <CoverOutline />

          {/* Interactive tape controls */}
          <InteractiveTapeControls
            leftAngle={leftAngle}
            rightAngle={rightAngle}
            onLeftRotate={handleLeftRotate}
            onRightRotate={handleRightRotate}
            onLeftCenter={audio.togglePlay}
            onRightCenter={() => audio.setRate(1.0)}
            isLoaded={audio.isLoaded}
            isPlaying={audio.isPlaying}
            isScrubbing={audio.isScrubbing}
            currentTime={audio.currentTime}
            duration={audio.duration}
            playbackRate={audio.playbackRate}
            trackName={audio.trackName}
          />
        </div>
      </div>

      {/* ── LOAD button (below cassette,  bg-[#00000000]unscaled) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'none',
            border: '1.5px solid #3a3020',
            color: '#a08840',
            padding: '10px 28px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            letterSpacing: 3,
            fontFamily: "'Space Mono', monospace",
            transition: 'border-color 0.2s, color 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#e8961c';
            e.currentTarget.style.color = '#e8961c';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(232,150,28,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = '#3a3020';
            e.currentTarget.style.color = '#a08840';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          ▲ INSERT TAPE
        </button>
        <div style={{ color: '#a08840', fontSize: 10, letterSpacing: 3, fontFamily: "'Space Mono', monospace" }}>
          TAP WHEEL CENTERS · LEFT = PLAY/PAUSE · RIGHT = RESET SPEED
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,audio/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
