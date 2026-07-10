import { useState, useRef, useEffect, useCallback } from 'react';
import { CassetteWheel } from './components/CassetteWheel';
import { OledCanvas, drawDeckScreen } from './components/OledScreen';
import svgPaths from '../imports/Cassette/svg-kn4si39m8f';
import { imgCover } from '../imports/Cassette/svg-58mld';
import qrNetlify from '../assets/qr-netlify.svg';

// ─── Content library ────────────────────────────────────────────────────────
// Every .mp3 dropped in src/assets/audio becomes a selectable megamix, and the
// first image dropped in src/assets/textures becomes the background — no manual
// import needed, just drop the file in the folder.

const audioModules = import.meta.glob('../assets/audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const textureModules = import.meta.glob('../assets/textures/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

interface Megamix {
  url: string;
  name: string;
}

function prettifyName(path: string): string {
  const file = path.split('/').pop()!.replace(/\.mp3$/i, '');
  return file.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const MEGAMIXES: Megamix[] = Object.entries(audioModules)
  .map(([path, url]) => ({ url, name: prettifyName(path) }))
  .sort((a, b) => a.name.localeCompare(b.name));

// K7 Rebirth ships as the default tape; fall back to the first one alphabetically.
const DEFAULT_MEGAMIX: Megamix | undefined =
  MEGAMIXES.find((m) => /rebirth/i.test(m.name)) ?? MEGAMIXES[0];

const FABRIC_URL: string | undefined = Object.values(textureModules)[0];

// Real cassette size for the "actual size" tool. CSS mm ≈ physical mm
// (1 CSS px = 1/96 in). 1080 is the cassette's natural width in Figma px.
const REAL_SCALE = (100 * 96) / 25.4 / 1080;

// ─── Audio Engine ──────────────────────────────────────────────────────────

// Let pitch rise/fall with playback speed (the "chipmunk" effect) across engines.
function setPreservesPitch(a: HTMLAudioElement, v: boolean) {
  const el = a as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  el.preservesPitch = v;
  el.mozPreservesPitch = v;
  el.webkitPreservesPitch = v;
}

function useAudioEngine() {
  // A streaming <audio> element keeps memory tiny even for hour-long megamixes,
  // unlike decoding the whole file into a Web Audio buffer (which OOMs on mobile).
  const elRef = useRef<HTMLAudioElement | null>(null);
  if (elRef.current === null && typeof Audio !== 'undefined') {
    const a = new Audio();
    a.preload = 'auto';
    setPreservesPitch(a, false);
    elRef.current = a;
  }

  const rateRef = useRef(1.0);
  const wasPlayingRef = useRef(false);
  const scrubTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackName, setTrackName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolumeState] = useState(1);

  // Wire element events once
  useEffect(() => {
    const a = elRef.current;
    if (!a) return;
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onTime = () => setCurrentTime(a.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { a.currentTime = 0; setCurrentTime(0); setIsPlaying(false); };
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
    };
  }, []);

  // Smooth LCD updates (timeupdate alone only fires ~4×/s)
  useEffect(() => {
    const id = setInterval(() => {
      const a = elRef.current;
      if (a && !a.paused) setCurrentTime(a.currentTime);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const play = useCallback(() => {
    const a = elRef.current;
    if (!a || !a.src) return;
    setPreservesPitch(a, false);
    a.playbackRate = rateRef.current;
    void a.play();
  }, []);

  const pause = useCallback(() => {
    elRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const a = elRef.current;
    if (!a) return;
    if (a.paused) play(); else pause();
  }, [play, pause]);

  const seek = useCallback((deltaSeconds: number) => {
    const a = elRef.current;
    if (!a || !Number.isFinite(a.duration) || a.duration === 0) return;
    const newT = Math.max(0, Math.min(a.currentTime + deltaSeconds, a.duration - 0.05));
    if (!isScrubbing) wasPlayingRef.current = !a.paused;
    a.currentTime = newT;
    setCurrentTime(newT);
    setIsScrubbing(true);
    // Brief fast playback for the tape-scrub screech
    setPreservesPitch(a, false);
    a.playbackRate = 3.0;
    void a.play();
    if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = setTimeout(() => {
      setIsScrubbing(false);
      a.playbackRate = rateRef.current;
      if (!wasPlayingRef.current) a.pause();
    }, 240);
  }, [isScrubbing]);

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.max(0.25, Math.min(4.0, newRate));
    rateRef.current = clamped;
    setPlaybackRateState(clamped);
    const a = elRef.current;
    if (a) {
      setPreservesPitch(a, false);
      if (!isScrubbing) a.playbackRate = clamped; // don't fight the scrub burst
    }
  }, [isScrubbing]);

  const adjustVolume = useCallback((delta: number) => {
    const a = elRef.current;
    if (!a) return;
    const v = Math.max(0, Math.min(1, a.volume + delta));
    a.volume = v;
    setVolumeState(v);
  }, []);

  const loadUrl = useCallback((url: string, name: string) => {
    const a = elRef.current;
    if (!a) return;
    a.pause();
    a.src = url;
    a.load();
    rateRef.current = 1.0;
    setPreservesPitch(a, false);
    a.playbackRate = 1.0;
    setTrackName(name);
    setPlaybackRateState(1.0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsScrubbing(false);
    setIsLoaded(true);
  }, []);

  return { isPlaying, playbackRate, currentTime, duration, trackName, isLoaded, isScrubbing, volume, togglePlay, seek, setRate, adjustVolume, loadUrl };
}

// ─── Interactive TapeControls (replaces Figma static TapeControls) ─────────

interface LCDProps {
  isLoaded: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  trackName: string;
  volume: number;
  volumeActive: boolean;
}

interface TapeControlsProps extends LCDProps {
  leftAngle: number;
  rightAngle: number;
  onLeftRotate: (delta: number) => void;
  onRightRotate: (delta: number) => void;
  onLeftCenter: () => void;
  onRightCenter: () => void;
  leftPressed: boolean;
  rightPressed: boolean;
  onLeftHoldChange: (held: boolean) => void;
}

function InteractiveTapeControls(props: TapeControlsProps) {
  const { leftAngle, rightAngle, onLeftRotate, onRightRotate, onLeftCenter, onRightCenter, leftPressed, rightPressed, onLeftHoldChange, ...lcdProps } = props;
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
        forcePressed={leftPressed}
        onHoldChange={onLeftHoldChange}
      />

      {/* OLED viewing window — like the little cutout in a real cassette shell that
          let you see the magnetic tape spooling, this is a small window (7 × 21mm
          real-world at this cassette's 100mm width) cut into the white plastic,
          centered between the wheels with the OLED mounted behind it. The 128×32
          active pixel area (22.38 × 5.58mm on the datasheet) is centered on the
          same point — since it's wider than this window, its far left/right edges
          are cropped by the plastic; since it's shorter, a black band shows above
          and below, both exactly as a real narrower-than-the-panel cutout would. */}
      <div
        className="-translate-y-1/2 absolute"
        style={{
          left: 203.6,
          right: 203.6,
          top: '50%',
          aspectRatio: '21 / 7',
          borderRadius: 3,
          background: '#000',
          border: '2px solid #141414',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.04), 0 0 10px rgba(47,224,255,0.35), 0 0 24px rgba(47,224,255,0.15)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 241.7, height: 60.26 }}>
          <OledCanvas draw={(ctx) => drawDeckScreen(ctx, lcdProps)} />
        </div>
      </div>

      {/* Right wheel — SPEED */}
      <CassetteWheel
        side="right"
        rotationAngle={rightAngle}
        onRotate={onRightRotate}
        onCenterClick={onRightCenter}
        forcePressed={rightPressed}
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

function CoverLabel() {
  // The cover is fixed branding — it stays "K7 rebirth" regardless of the loaded track.
  const displayName = 'K7 rebirth';
  const fontSize = 44;
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
          letterSpacing: 8.8,
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

function CoverArea() {
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
      <CoverLabel />

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

// ─── Megamix selector (discreet trigger + centred J-card modal) ─────────────

function TopTrigger({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(160,136,64,0.45)',
        color: '#a08840',
        padding: '6px 16px',
        borderRadius: 999,
        cursor: 'pointer',
        fontSize: 10,
        letterSpacing: 3,
        fontFamily: "'Space Mono', monospace",
        backdropFilter: 'blur(4px)',
        transition: 'color 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#e8961c'; e.currentTarget.style.borderColor = '#e8961c'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#a08840'; e.currentTarget.style.borderColor = 'rgba(160,136,64,0.45)'; }}
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Real-size resize tool (desktop only) ──────────────────────────────────

const COTE_COLOR = '#a08840';

function RulerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="7" width="19" height="10" rx="1.5" />
      <path d="M6.5 7v3M10 7v4M13.5 7v3M17 7v4" />
    </svg>
  );
}

function RoundButton({ label, title, onClick }: { label: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      style={{
        width: 34, height: 34, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(160,136,64,0.45)',
        color: '#a08840', borderRadius: '50%', cursor: 'pointer',
        fontSize: 12, fontFamily: "'Space Mono', monospace", lineHeight: 1,
        backdropFilter: 'blur(4px)', transition: 'color 0.2s, border-color 0.2s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#e8961c'; e.currentTarget.style.borderColor = '#e8961c'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#a08840'; e.currentTarget.style.borderColor = 'rgba(160,136,64,0.45)'; }}
    >
      {label}
    </button>
  );
}

// Dimension lines (cotes) drawn along the cassette's top + left edges.
// Anchored to the wrapper edges so they track the cassette size.
function DimensionLines() {
  const mono = { fontFamily: "'Space Mono', monospace", color: COTE_COLOR, fontSize: 10, letterSpacing: 2 } as const;
  return (
    <>
      {/* Top — length */}
      <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 16, pointerEvents: 'none' }}>
        <div style={{ ...mono, textAlign: 'center', marginBottom: 5 }}>100 mm</div>
        <div style={{ position: 'relative', height: 8 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `1px solid ${COTE_COLOR}` }} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderLeft: `1px solid ${COTE_COLOR}` }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, borderLeft: `1px solid ${COTE_COLOR}` }} />
        </div>
      </div>
      {/* Left — height */}
      <div style={{ position: 'absolute', right: '100%', top: 0, bottom: 0, marginRight: 16, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ ...mono, writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', marginRight: 5 }}>65 mm</div>
        <div style={{ position: 'relative', width: 8, alignSelf: 'stretch' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: `1px solid ${COTE_COLOR}` }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, borderTop: `1px solid ${COTE_COLOR}` }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: `1px solid ${COTE_COLOR}` }} />
        </div>
      </div>
    </>
  );
}

interface MegamixModalProps {
  megamixes: Megamix[];
  currentUrl?: string;
  onSelect: (m: Megamix) => void;
  onClose: () => void;
}

function MegamixModal({ megamixes, currentUrl, onSelect, onClose }: MegamixModalProps) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'k7-backdrop-in 0.2s ease-out both',
      }}
    >
      {/* Keyframes for the staggered entry animation */}
      <style>{`
        @keyframes k7-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes k7-card-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes k7-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: '82vh',
          background: '#f9faf1',
          border: '2px solid #202020',
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"Barlow Condensed", "Oswald", sans-serif',
          animation: 'k7-card-in 0.28s ease-out both',
        }}
      >
        {/* Header band — evokes the printed J-card top strip */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '2px solid #202020', flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '7px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1, color: '#202020', textTransform: 'uppercase' }}>
              Megamix Select
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: '#202020', textTransform: 'uppercase', marginTop: 2 }}>
              Type&nbsp;I (Normal) Position · Insert a tape
            </div>
          </div>
          {/* Corner colour stripes */}
          <div style={{ display: 'flex', flexDirection: 'column', width: 74 }}>
            <div style={{ flex: 1, background: '#f0c419' }} />
            <div style={{ flex: 1, background: '#e8801c' }} />
            <div style={{ flex: 1, background: '#c0271e' }} />
          </div>
          {/* Close */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 40, border: 'none', borderLeft: '2px solid #202020', background: '#202020', color: '#f9faf1', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Tracklist — handwritten titles on red dotted lines, fading in one by one */}
        <div style={{ padding: '4px 0', overflowY: 'auto' }}>
          {megamixes.map((m, i) => {
            const selected = m.url === currentUrl;
            return (
              <button
                key={m.url}
                onClick={() => { onSelect(m); onClose(); }}
                title={m.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  background: selected ? 'rgba(192,39,30,0.08)' : 'transparent',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : '1px dotted rgba(192,39,30,0.6)',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  color: '#202020',
                  animation: 'k7-row-in 0.32s ease-out both',
                  animationDelay: `${100 + i * 90}ms`,
                }}
              >
                {/* A-side style marker */}
                <span
                  style={{
                    flexShrink: 0,
                    width: 16,
                    fontSize: 13,
                    fontWeight: 700,
                    color: selected ? '#c0271e' : '#b9b9ad',
                    fontFamily: '"Barlow Condensed", sans-serif',
                  }}
                >
                  {selected ? '▶' : String(i + 1).padStart(2, '0')}
                </span>
                <span
                  style={{
                    fontFamily: '"Rock Salt", cursive',
                    fontSize: 13,
                    lineHeight: 1.35,
                    color: '#202020',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Controls guide (same J-card modal, adapts to keyboard vs touch) ────────

interface ControlRow {
  glyph: string;
  action: string;
  keys: string[];   // desktop: keycaps + separators ('+', '/')
  touch: string;    // mobile: gesture phrase
}

const CONTROL_ROWS: ControlRow[] = [
  { glyph: '⏯', action: 'Play · Pause', keys: ['A'], touch: 'Tap the left wheel' },
  { glyph: '⟲', action: 'Reset speed', keys: ['S'], touch: 'Tap the right wheel' },
  { glyph: '↔', action: 'Scrub · seek', keys: ['←', '/', '→'], touch: 'Scroll the left wheel' },
  { glyph: '≈', action: 'Speed · chipmunk', keys: ['↑', '/', '↓'], touch: 'Scroll the right wheel' },
  { glyph: '♪', action: 'Volume', keys: ['hold', 'A', '+', '↑', '/', '↓'], touch: 'Hold left + scroll right' },
];

function KeyToken({ token }: { token: string }) {
  // Separators / modifiers render as plain text; real keys render as keycaps
  if (token === '+' || token === '/') {
    return <span style={{ color: '#8a8a7e', fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{token}</span>;
  }
  if (token === 'hold') {
    return <span style={{ color: '#8a8a7e', fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' }}>hold</span>;
  }
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 18, height: 20, padding: '0 5px',
        border: '1.5px solid #202020', borderRadius: 4, background: '#fff',
        fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, color: '#202020', lineHeight: 1,
      }}
    >
      {token}
    </span>
  );
}

interface ControlsModalProps {
  isMobile: boolean;
  onClose: () => void;
}

function ControlsModal({ isMobile, onClose }: ControlsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(0,0,0,0.42)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        animation: 'k7-backdrop-in 0.2s ease-out both',
      }}
    >
      <style>{`
        @keyframes k7-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes k7-card-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
        @keyframes k7-row-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '82vh',
          background: '#f9faf1', border: '2px solid #202020', borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          fontFamily: '"Barlow Condensed", "Oswald", sans-serif',
          animation: 'k7-card-in 0.28s ease-out both',
        }}
      >
        {/* Header band */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '2px solid #202020', flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '7px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1, color: '#202020', textTransform: 'uppercase' }}>
              Controls
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: '#202020', textTransform: 'uppercase', marginTop: 2 }}>
              Type&nbsp;I (Normal) Position · {isMobile ? 'Tap · Scroll · Hold' : 'Keyboard shortcuts'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', width: 74 }}>
            <div style={{ flex: 1, background: '#f0c419' }} />
            <div style={{ flex: 1, background: '#e8801c' }} />
            <div style={{ flex: 1, background: '#c0271e' }} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 40, border: 'none', borderLeft: '2px solid #202020', background: '#202020', color: '#f9faf1', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Control rows on red dotted lines, fading in one by one */}
        <div style={{ padding: '4px 0', overflowY: 'auto' }}>
          {CONTROL_ROWS.map((r, i) => (
            <div
              key={r.action}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                borderTop: i === 0 ? 'none' : '1px dotted rgba(192,39,30,0.6)',
                padding: '10px 14px', color: '#202020',
                animation: 'k7-row-in 0.32s ease-out both',
                animationDelay: `${100 + i * 90}ms`,
              }}
            >
              {/* Left: glyph + action name (handwritten, like a track title) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ flexShrink: 0, width: 16, textAlign: 'center', fontSize: 13, color: '#c0271e' }}>{r.glyph}</span>
                <span style={{ fontFamily: '"Rock Salt", cursive', fontSize: 13, lineHeight: 1.3, color: '#202020' }}>
                  {r.action}
                </span>
              </div>
              {/* Right: input — keycaps on desktop, gesture phrase on mobile */}
              {isMobile ? (
                <span style={{ flexShrink: 0, textAlign: 'right', fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 0.5, color: '#4a4a40', textTransform: 'uppercase', maxWidth: '55%' }}>
                  {r.touch}
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {r.keys.map((k, j) => <KeyToken key={j} token={k} />)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop only: scan to open on a phone */}
        {!isMobile && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px', borderTop: '2px solid #202020', background: '#f2f1e6',
              animation: 'k7-row-in 0.32s ease-out both',
              animationDelay: `${100 + CONTROL_ROWS.length * 90}ms`,
            }}
          >
            <img
              src={qrNetlify}
              alt="QR code — open K7 Rebirth on your phone"
              width={78}
              height={78}
              style={{ display: 'block', border: '2px solid #202020', borderRadius: 4, background: '#fff', padding: 4, flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: '"Rock Salt", cursive', fontSize: 15, color: '#202020' }}>Try on your phone!</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: 1, color: '#8a8a7e', textTransform: 'uppercase' }}>
                Scan · k7-rebirth.netlify.app
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const audio = useAudioEngine();

  // Which megamix is loaded in the deck
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_MEGAMIX?.url);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Real-size resize tool (desktop): manualScale overrides the auto fit-scale
  const [resizeMode, setResizeMode] = useState(false);
  const [manualScale, setManualScale] = useState<number | null>(null);

  // Keyboard-driven "pressed" visuals + transient volume HUD
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  // Touch/mouse hold on the left wheel's center (bridges the same combo to touch + mouse-drag)
  const [leftHeldTouch, setLeftHeldTouch] = useState(false);
  const leftHeld = leftPressed || leftHeldTouch;
  // Suppresses the play/pause tap-toggle when the hold was actually used as the volume combo
  const leftComboUsedRef = useRef(false);
  const handleLeftHoldChange = useCallback((held: boolean) => {
    if (held) leftComboUsedRef.current = false;
    setLeftHeldTouch(held);
  }, []);
  const [volumeActive, setVolumeActive] = useState(false);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the default tape on mount
  useEffect(() => {
    if (DEFAULT_MEGAMIX) audio.loadUrl(DEFAULT_MEGAMIX.url, DEFAULT_MEGAMIX.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectMegamix = useCallback((m: Megamix) => {
    setCurrentUrl(m.url);
    audio.loadUrl(m.url, m.name); // loads paused — like inserting a fresh tape
  }, [audio]);

  // Wheel angles — only updated when user drags (no playback animation)
  const [leftAngle, setLeftAngle] = useState(0);
  const [rightAngle, setRightAngle] = useState(0);

  // Responsive scale — on narrow portrait screens the cassette rotates
  // 90° to use the screen's full height instead of floating tiny and wide.
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const PAD = 32;
  const isMobile = Math.min(viewport.w, viewport.h) < 768;
  const isMobilePortrait = isMobile && viewport.h > viewport.w;
  const autoScale = isMobilePortrait
    ? Math.min((viewport.w - PAD) / 662, (viewport.h - PAD) / 1080)
    : Math.min(1, (viewport.w - PAD) / 1080, (viewport.h - PAD) / 662);
  // Desktop real-size override; mobile always auto-fits.
  const scale = (!isMobile && manualScale != null) ? manualScale : autoScale;

  const enterResize = useCallback(() => {
    setManualScale((s) => s ?? REAL_SCALE);
    setResizeMode(true);
  }, []);
  const stepScale = useCallback((factor: number) => {
    setManualScale((s) => Math.max(0.15, Math.min(1.15, (s ?? REAL_SCALE) * factor)));
  }, []);

  const pingVolume = useCallback(() => {
    setVolumeActive(true);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => setVolumeActive(false), 1100);
  }, []);

  const handleLeftRotate = useCallback((delta: number) => {
    // Holding the left wheel down is the volume modifier — don't also scrub while held.
    if (leftHeld) return;
    audio.seek(delta * 0.07);
    setLeftAngle(a => a + delta); // only visual, only on drag
  }, [audio, leftHeld]);

  const handleRightRotate = useCallback((delta: number) => {
    if (leftHeld) {
      // Left held (keyboard A, touch, or mouse) + right wheel drag/scroll → volume
      audio.adjustVolume(delta * 0.004);
      pingVolume();
      leftComboUsedRef.current = true; // suppress the left tap-to-toggle-play once released
    } else {
      audio.setRate(audio.playbackRate + delta * 0.012);
    }
    setRightAngle(a => a + delta); // only visual, only on drag
  }, [audio, leftHeld, pingVolume]);

  const handleLeftCenterClick = useCallback(() => {
    if (leftComboUsedRef.current) { leftComboUsedRef.current = false; return; }
    audio.togglePlay();
  }, [audio]);

  // Latest callbacks, read by the (mounted-once) keyboard listener
  const latest = useRef({
    menuOpen: menuOpen || guideOpen,
    rotateLeft: handleLeftRotate,
    rotateRight: handleRightRotate,
    spinRight: setRightAngle,
    togglePlay: audio.togglePlay,
    resetRate: () => audio.setRate(1.0),
    adjustVolume: audio.adjustVolume,
    pingVolume,
  });
  latest.current = {
    menuOpen: menuOpen || guideOpen,
    rotateLeft: handleLeftRotate,
    rotateRight: handleRightRotate,
    spinRight: setRightAngle,
    togglePlay: audio.togglePlay,
    resetRate: () => audio.setRate(1.0),
    adjustVolume: audio.adjustVolume,
    pingVolume,
  };

  // ── Keyboard controls ──────────────────────────────────────────────
  //  A / S = tap the left / right wheel centre (play-pause / reset speed)
  //  ← / → = turn the left wheel  (scrub)
  //  ↑ / ↓ = turn the right wheel (speed)   ·   hold A + ↑/↓ = volume
  useEffect(() => {
    const held = new Set<string>();
    let aDown = false;
    let aCombo = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const ROT = 3;    // degrees per tick
    const VOL = 0.02; // volume units per tick
    const isArrow = (k: string) =>
      k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';

    const tick = () => {
      const c = latest.current;
      if (c.menuOpen) return;
      if (held.has('ArrowLeft')) { if (aDown) aCombo = true; else c.rotateLeft(-ROT); }
      if (held.has('ArrowRight')) { if (aDown) aCombo = true; else c.rotateLeft(ROT); }
      if (held.has('ArrowUp')) {
        if (aDown) { c.adjustVolume(VOL); c.spinRight((a) => a + ROT); c.pingVolume(); aCombo = true; }
        else c.rotateRight(ROT);
      }
      if (held.has('ArrowDown')) {
        if (aDown) { c.adjustVolume(-VOL); c.spinRight((a) => a - ROT); c.pingVolume(); aCombo = true; }
        else c.rotateRight(-ROT);
      }
    };
    const start = () => { if (!timer) timer = setInterval(tick, 16); };
    const stopIfIdle = () => { if (timer && held.size === 0) { clearInterval(timer); timer = null; } };

    const onDown = (e: KeyboardEvent) => {
      const c = latest.current;
      const k = e.key;
      if (k === 'a' || k === 'A') {
        e.preventDefault();
        if (e.repeat || c.menuOpen) return;
        aDown = true; aCombo = false;
        setLeftPressed(true);
      } else if (k === 's' || k === 'S') {
        e.preventDefault();
        if (e.repeat || c.menuOpen) return;
        setRightPressed(true);
        c.resetRate();
      } else if (isArrow(k)) {
        e.preventDefault();
        if (c.menuOpen) return;
        held.add(k);
        start();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const c = latest.current;
      const k = e.key;
      if (k === 'a' || k === 'A') {
        e.preventDefault();
        setLeftPressed(false);
        if (aDown && !aCombo && !c.menuOpen) c.togglePlay();
        aDown = false;
      } else if (k === 's' || k === 'S') {
        e.preventDefault();
        setRightPressed(false);
      } else if (isArrow(k)) {
        held.delete(k);
        stopIfIdle();
      }
    };

    const onBlur = () => {
      held.clear(); aDown = false; aCombo = false;
      setLeftPressed(false); setRightPressed(false);
      if (timer) { clearInterval(timer); timer = null; }
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      if (timer) clearInterval(timer);
    };
  }, []);

  // Natural cassette dimensions from Figma
  const CW = 1080;
  const CH = 662;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#060504',
        backgroundImage: FABRIC_URL
          ? `radial-gradient(ellipse at 50% 40%, rgba(6,5,4,0) 0%, rgba(6,5,4,0.6) 100%), url(${FABRIC_URL})`
          : 'radial-gradient(ellipse at 50% 40%, #18140e 0%, #0b0a08 60%, #060504 100%)',
        backgroundRepeat: 'no-repeat, repeat',
        backgroundSize: 'cover, 480px',
        padding: '24px 16px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      {/* Discreet triggers: megamix selector + controls guide */}
      <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', gap: 10 }}>
        <TopTrigger icon="▤" label="MEGAMIX" onClick={() => { setGuideOpen(false); setMenuOpen(true); }} />
        <TopTrigger icon="?" label="CONTROLS" onClick={() => { setMenuOpen(false); setGuideOpen(true); }} />
      </div>

      {/* Real-size resize tool (desktop only) */}
      {!isMobile && (
        <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          {resizeMode ? (
            <>
              <RoundButton title="Réduire" label="−" onClick={() => stepScale(1 / 1.06)} />
              <RoundButton title="Agrandir" label="+" onClick={() => stepScale(1.06)} />
              <RoundButton title="Terminé" label="OK" onClick={() => setResizeMode(false)} />
            </>
          ) : (
            <RoundButton title="Taille réelle (100 × 65 mm)" label={<RulerIcon />} onClick={enterResize} />
          )}
        </div>
      )}

      {/* ── Scaled cassette wrapper (rotates 90° to fill narrow portrait screens) ── */}
      <div
        style={{
          width: isMobilePortrait ? CH * scale : CW * scale,
          height: isMobilePortrait ? CW * scale : CH * scale,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {resizeMode && !isMobile && <DimensionLines />}
        <div
          style={{
            width: CW,
            height: CH,
            transform: isMobilePortrait
              ? `translate(-50%, -50%) rotate(90deg) scale(${scale})`
              : `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
            position: 'absolute',
            top: '50%',
            left: '50%',
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
          <CoverArea />

          {/* Cover outline */}
          <CoverOutline />

          {/* Interactive tape controls */}
          <InteractiveTapeControls
            leftAngle={leftAngle}
            rightAngle={rightAngle}
            onLeftRotate={handleLeftRotate}
            onRightRotate={handleRightRotate}
            onLeftCenter={handleLeftCenterClick}
            onRightCenter={() => audio.setRate(1.0)}
            leftPressed={leftPressed}
            rightPressed={rightPressed}
            onLeftHoldChange={handleLeftHoldChange}
            isLoaded={audio.isLoaded}
            isPlaying={audio.isPlaying}
            isScrubbing={audio.isScrubbing}
            currentTime={audio.currentTime}
            duration={audio.duration}
            playbackRate={audio.playbackRate}
            trackName={audio.trackName}
            volume={audio.volume}
            volumeActive={volumeActive}
          />
        </div>
      </div>

      {menuOpen && (
        <MegamixModal
          megamixes={MEGAMIXES}
          currentUrl={currentUrl}
          onSelect={selectMegamix}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {guideOpen && (
        <ControlsModal isMobile={isMobile} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}
