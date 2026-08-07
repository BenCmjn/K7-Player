import { useState, useRef, useEffect, useCallback } from 'react';
import { CassetteWheel } from './components/CassetteWheel';
import { OledCanvas, drawOledScreen, type OledScreenMode, type OledMenu, type OledDeck } from './components/OledScreen';
import svgPaths from '../imports/Cassette/svg-kn4si39m8f';
import { imgCover } from '../imports/Cassette/svg-58mld';
import qrNetlify from '../assets/qr-netlify.svg';
import { PLASTIC_THEMES, plasticById, buildLabelStyles, labelById, type LabelStyle } from './shell/themes';

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

// Drop a Figma-exported label design into src/assets/labels/*.svg and it becomes
// a selectable label style automatically (alongside the built-in "Classic").
const labelModules = import.meta.glob('../assets/labels/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const LABEL_STYLES = buildLabelStyles(labelModules);

// The transparent/naked shells reveal the internal build (ESP32/DAC/SD/battery),
// supplied as a single SVG in src/assets/shell/internals.svg (optional).
const internalsModules = import.meta.glob('../assets/shell/internals.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const INTERNALS_URL: string | undefined = Object.values(internalsModules)[0];

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

// The on-device menu browses a small tree: Hello (home) → folder list → tracks.
// There's one folder for now ("Library"); the structure lets the left tap climb
// tracks → folders → Hello, and lets more folders be added.
interface Folder { name: string; tracks: Megamix[]; }
const FOLDERS: Folder[] = [{ name: 'Library', tracks: MEGAMIXES }];

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

  return { isPlaying, playbackRate, currentTime, duration, trackName, isLoaded, isScrubbing, volume, play, pause, togglePlay, seek, setRate, adjustVolume, loadUrl };
}

// ─── Interactive TapeControls (replaces Figma static TapeControls) ─────────

interface OledProps {
  mode: OledScreenMode;
  currentTime: number;
  duration: number;
  playbackRate: number;
  trackName: string;
  volume: number;
  playing: boolean;
  marqueeSince: number;
  menu?: OledMenu;
  deck?: OledDeck;
}

interface TapeControlsProps extends OledProps {
  leftAngle: number;
  rightAngle: number;
  onLeftRotate: (delta: number) => void;
  onRightRotate: (delta: number) => void;
  onLeftCenter: () => void;
  onRightCenter: () => void;
  leftPressed: boolean;
  rightPressed: boolean;
  onLeftHoldChange: (held: boolean) => void;
  onRightHoldChange: (held: boolean) => void;
  reveal?: boolean; // transparent/naked: expose the panel's plastic-covered edges
}

function InteractiveTapeControls(props: TapeControlsProps) {
  const { leftAngle, rightAngle, onLeftRotate, onRightRotate, onLeftCenter, onRightCenter, leftPressed, rightPressed, onLeftHoldChange, onRightHoldChange, reveal, ...oledState } = props;
  return (
    <div className="absolute overflow-clip rounded-[88px]" style={{ left: 224, top: 213, width: 634, height: 178 }}>
      {/* Full-width OLED panel sitting BEHIND the plastic — its central columns
          are covered bright by the front window; its far edges only show when the
          plastic is see-through (transparent/naked), as the real panel is wider
          than its window. Same size/scale as the front canvas so pixels align. */}
      {reveal && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 241.7, height: 60.26 }}>
          <OledCanvas draw={(ctx) => drawOledScreen(ctx, oledState)} />
        </div>
      )}

      {/* Pill plastic (fill + border) — themed; opaque hides the panel edges */}
      <div className="absolute inset-0 rounded-[88px]" style={{ background: 'var(--shell-body)' }} />
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 634 178">
        <path d={svgPaths.p3c4202f0} fill="var(--shell-body)" stroke="var(--shell-stroke)" strokeWidth="3" />
      </svg>

      {/* Left wheel — BACK (tap) + base-layer modifier (hold) */}
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
          <OledCanvas draw={(ctx) => drawOledScreen(ctx, oledState)} />
        </div>
      </div>

      {/* Right wheel — the action: volume / scrub / speed per deck mode */}
      <CassetteWheel
        side="right"
        rotationAngle={rightAngle}
        onRotate={onRightRotate}
        onCenterClick={onRightCenter}
        forcePressed={rightPressed}
        onHoldChange={onRightHoldChange}
      />
    </div>
  );
}

// ─── Figma Cassette Shell components ──────────────────────────────────────

function Holes() {
  return (
    <div className="absolute bottom-[19px] h-[56px] left-[257px] w-[567px]" data-name="Holes">
      <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 567 56">
        <g fill="var(--shell-detail)">
          <circle cx="28" cy="28" r="28" />
          <circle cx="539" cy="28" r="28" />
          <rect height="38" rx="6" width="38" x="112" />
          <rect height="38" rx="6" width="38" x="417" />
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
          <path d={svgPaths.pa8f1480} stroke="var(--shell-stroke)" strokeWidth="3" />
        </svg>
      </div>
      <Holes />
      <div className="-translate-x-1/2 absolute bottom-[102px] left-1/2 overflow-clip size-[36px]">
        <div className="absolute left-0 size-[36px] top-0">
          <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 36 36">
            <path d={svgPaths.p1a047080} fill="var(--shell-detail)" />
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
          <path d={svgPaths.p1a047080} fill="var(--shell-detail)" />
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

function CoverArea({ label }: { label: LabelStyle }) {
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
      {/* A dropped-in SVG label fills the whole cover silhouette; the built-in
          "Classic" style (svg undefined) falls through to the printed artwork. */}
      {label.svg ? (
        <img src={label.svg} alt="" aria-hidden style={{ width: 958, height: 426, objectFit: 'cover', display: 'block' }} />
      ) : (
        <ClassicCoverArt />
      )}
    </div>
  );
}

function ClassicCoverArt() {
  return (
    <>
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
    </>
  );
}

function CoverOutline() {
  return (
    <div className="absolute h-[426px] left-[62px] right-[60px] top-[56px]">
      <div className="absolute inset-[-0.35%_-0.16%]">
        <svg className="block size-full rounded-[0px] m-[0px]" fill="none" preserveAspectRatio="none" viewBox="0 0 961 429"><path></path><path d={svgPaths.pbd08600} stroke="var(--shell-stroke)" strokeWidth="3" /></svg>
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

// The old centred J-card megamix modal was replaced by the on-device OLED menu
// (browse the tracklist right on the deck with the wheel — see the 'menu' mode
// in OledScreen and the menu wiring below in App).

// ─── Deck modes ────────────────────────────────────────────────────────────
// A sticky overlay on the PLAY context, cycled by the Combo (both wheel centres
// held together for COMBO_MS). It never expires on a timer — only the next
// Combo changes it.
//
// The paradigm in one line: the LEFT wheel is navigation and modifier (tap =
// back, hold = reach the base controls from anywhere), the RIGHT wheel is the
// action, and a mode only changes which verb that action carries. Taps keep
// their meaning across modes, except 'speed', which spends its right tap on
// resetting the rate.
//
// Adding a mode (loop, eq…) = one entry in DeckMode + DECK_ORDER and one row
// here. Only a genuinely new rotation verb also needs a WheelVerb + a case in
// applyWheel. The OLED banner, the sticky chip and the caption strip all read
// the row you just added. `left` is 'none' throughout today — that slot is
// reserved for eq ("left = x axis, right = y axis") and loop.
//
// Historical note: the shell is silkscreened SCRUB (left) and SPEED (right).
// Those printed labels name the two advanced modes, though in this paradigm it
// is the right wheel that executes both. Artwork deliberately left alone.

type DeckMode = 'base' | 'scrub' | 'speed';        // future: | 'loop' | 'eq'
type WheelVerb = 'none' | 'volume' | 'scrub' | 'speed';
type TapVerb = 'play-pause' | 'reset-speed';

interface DeckModeSpec {
  left: WheelVerb;
  right: WheelVerb;
  rightTap: TapVerb;
  label: string;   // big value on the mode banner
  icon: string;    // ICONS key, or 'scrub-arrows' (drawn, not baked into ICONS)
  tag: string;     // <=3-char chip on the resting Playing screen ('' = none)
  hint: { touch: string; keys: string }; // bottom caption strip, per platform
}

const DECK_ORDER: readonly DeckMode[] = ['base', 'scrub', 'speed'];
const COMBO_MS = 400;   // hold both centres this long to cycle the mode

const DECK_SPEC: Record<DeckMode, DeckModeSpec> = {
  base: {
    left: 'none', right: 'volume', rightTap: 'play-pause',
    label: 'Deck', icon: 'music', tag: '',
    hint: {
      touch: 'Tap left = menu · tap right = play · turn right = volume',
      keys: 'A = menu · S = play/pause · ↑↓ = volume',
    },
  },
  scrub: {
    left: 'none', right: 'scrub', rightTap: 'play-pause',
    label: 'Scrub', icon: 'scrub-arrows', tag: 'SCR',
    hint: {
      touch: 'Scrub mode · turn right = scrub · tap right = play',
      keys: 'Scrub mode · ↑↓ = scrub · S = play/pause',
    },
  },
  speed: {
    left: 'none', right: 'speed', rightTap: 'reset-speed',
    label: 'Speed', icon: 'speed-fast', tag: 'SPD',
    hint: {
      touch: 'Speed mode · turn right = speed · tap right = reset',
      keys: 'Speed mode · ↑↓ = speed · S = reset',
    },
  },
};

// ─── Controls guide (same J-card modal, adapts to keyboard vs touch) ────────

interface ControlRow {
  glyph: string;
  action: string;
  keys: string[];   // desktop: keycaps + separators ('+', '/')
  touch: string;    // mobile: gesture phrase
}

// The canonical control map. A mode prerequisite belongs in `action`, never in
// `touch` — `touch` is only rendered on mobile, so a desktop reader would
// otherwise never learn that scrub and speed need their mode.
const CONTROL_ROWS: ControlRow[] = [
  { glyph: '⏯', action: 'Play · Pause', keys: ['S', '/', 'Space'], touch: 'Tap the right wheel' },
  { glyph: '♪', action: 'Volume', keys: ['↑', '/', '↓'], touch: 'Turn the right wheel' },
  { glyph: '☰', action: 'Menu · open · back', keys: ['A', '/', 'Esc'], touch: 'Tap the left wheel' },
  { glyph: '⏎', action: 'Menu · enter · play', keys: ['S'], touch: 'Tap the right wheel' },
  { glyph: '⇅', action: 'Menu · browse', keys: ['←', '/', '→'], touch: 'Turn either wheel' },
  { glyph: '⊙', action: 'Deck mode · cycle', keys: ['hold', 'A', '+', 'S'], touch: 'Hold both wheels' },
  { glyph: '↔', action: 'Scrub · seek (Scrub mode)', keys: ['↑', '/', '↓'], touch: 'Turn the right wheel' },
  { glyph: '≈', action: 'Speed · pitch (Speed mode)', keys: ['↑', '/', '↓'], touch: 'Turn the right wheel' },
  { glyph: '⟲', action: 'Reset speed (Speed mode)', keys: ['S'], touch: 'Tap the right wheel' },
  { glyph: '⇧', action: 'Volume · play/pause anywhere', keys: ['hold', 'A', '+', '↑↓', '/', 'S'], touch: 'Hold left + turn/tap right' },
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
              Type&nbsp;I (Normal) Position · {isMobile ? 'Tap · Turn · Hold' : 'Keyboard shortcuts'}
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
  // The device boots into its menu on the Hello (home) screen.
  const [menuOpen, setMenuOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);

  // Shell appearance: plastic colour + label style, chosen in the customize
  // carousel and remembered across reloads.
  const [customizeMode, setCustomizeMode] = useState(false);
  const [plasticId, setPlasticId] = useState<string>(() => localStorage.getItem('k7-plastic') ?? 'offwhite');
  const [labelId, setLabelId] = useState<string>(() => localStorage.getItem('k7-label') ?? 'classic');
  useEffect(() => { localStorage.setItem('k7-plastic', plasticId); }, [plasticId]);
  useEffect(() => { localStorage.setItem('k7-label', labelId); }, [labelId]);
  const plastic = plasticById(plasticId);
  const label = labelById(LABEL_STYLES, labelId);
  const cycleShell = useCallback((dir: number) => setPlasticId((cur) => {
    const i = Math.max(0, PLASTIC_THEMES.findIndex((t) => t.id === cur));
    return PLASTIC_THEMES[(i + dir + PLASTIC_THEMES.length) % PLASTIC_THEMES.length].id;
  }), []);
  const cycleLabel = useCallback((dir: number) => setLabelId((cur) => {
    const i = Math.max(0, LABEL_STYLES.findIndex((s) => s.id === cur));
    return LABEL_STYLES[(i + dir + LABEL_STYLES.length) % LABEL_STYLES.length].id;
  }), []);
  // In customize mode: ← → flip the shell, ↑ ↓ flip the label, Enter/Esc done.
  useEffect(() => {
    if (!customizeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); cycleShell(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); cycleShell(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycleLabel(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cycleLabel(1); }
      else if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setCustomizeMode(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customizeMode, cycleShell, cycleLabel]);

  // Real-size resize tool (desktop): manualScale overrides the auto fit-scale
  const [resizeMode, setResizeMode] = useState(false);
  const [manualScale, setManualScale] = useState<number | null>(null);

  // Sticky deck mode — only the Combo changes it, never a timer. See DECK_SPEC.
  const [deckMode, setDeckMode] = useState<DeckMode>('base');

  // Keyboard-driven "pressed" visuals + transient volume HUD
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  // Touch/mouse hold on each wheel's center (bridges the same gestures to touch + mouse-drag)
  const [leftHeldTouch, setLeftHeldTouch] = useState(false);
  const [rightHeldTouch, setRightHeldTouch] = useState(false);
  const leftHeld = leftPressed || leftHeldTouch;
  const rightHeld = rightPressed || rightHeldTouch;
  // A pending tap the Combo or the base layer has already spent. Cleared when
  // consumed, and again on that wheel's next press so it can never go stale and
  // swallow an unrelated tap later.
  const suppressLeftClickRef = useRef(false);
  const suppressRightClickRef = useRef(false);
  // Combo bookkeeping lives up here so the rotation handlers can cancel it.
  const comboFiredRef = useRef(false);   // this gesture already cycled a mode
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelCombo = useCallback(() => {
    if (comboTimerRef.current) { clearTimeout(comboTimerRef.current); comboTimerRef.current = null; }
  }, []);
  const handleLeftHoldChange = useCallback((held: boolean) => {
    if (held) suppressLeftClickRef.current = false; // fresh press, clean slate
    setLeftHeldTouch(held);
  }, []);
  const handleRightHoldChange = useCallback((held: boolean) => {
    if (held) suppressRightClickRef.current = false;
    setRightHeldTouch(held);
  }, []);
  // OLED screen mode: the resting screen is 'playing' (playing or paused); a
  // wheel touch (mouse, touch, or keyboard) flashes a feedback screen — wheel
  // feedback for 1s, play/pause for 2s — then reverts.
  const [transientMode, setTransientMode] = useState<OledScreenMode | null>(null);
  const transientTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerTransient = useCallback((mode: OledScreenMode, ms = 1000) => {
    setTransientMode(mode);
    if (transientTimer.current) clearTimeout(transientTimer.current);
    transientTimer.current = setTimeout(() => setTransientMode(null), ms);
  }, []);

  // On-device menu: a tree browsed with the wheels. 'root' is the Hello (home)
  // screen — the ceiling; below it the folder list, then a folder's tracks.
  type MenuLevel = 'root' | 'folders' | 'tracks';
  const [menuLevel, setMenuLevel] = useState<MenuLevel>('root');
  const [menuFolderIndex, setMenuFolderIndex] = useState(0);
  const [menuTrackIndex, setMenuTrackIndex] = useState(0);

  // Boot: the Hello screen greets for 2s, then the device drops into the file
  // system's first folder (Library). (Only advances if still sitting on Hello.)
  useEffect(() => {
    const id = setTimeout(() => setMenuLevel((l) => (l === 'root' ? 'folders' : l)), 2000);
    return () => clearTimeout(id);
  }, []);
  const locateCurrent = useCallback(() => {
    for (let f = 0; f < FOLDERS.length; f++) {
      const t = FOLDERS[f].tracks.findIndex((m) => m.url === currentUrl);
      if (t >= 0) return { f, t };
    }
    return { f: 0, t: 0 };
  }, [currentUrl]);

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

  // ── On-device menu navigation ──────────────────────────────────────
  // Controls (wheels + keyboard A/S mirror each other):
  //   · left centre → climb one level (tracks → folders → Hello), and from the
  //     deck it opens the menu. Hello is the ceiling.
  //   · right centre → enter the folder, or play the track & show Playing
  //   · long-press right centre alone → back to Playing without starting a
  //     track. With the Hello ceiling kept, this is the only such exit.
  //   · turn either wheel → move the highlight (accumulates MENU_STEP° per step)
  const MENU_STEP = 26;
  const menuAccumRef = useRef(0);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Enter the menu from the deck at the current track's sibling list.
  const enterMenu = useCallback(() => {
    const { f, t } = locateCurrent();
    menuAccumRef.current = 0;
    setMenuLevel('tracks');
    setMenuFolderIndex(f);
    setMenuTrackIndex(t);
    setGuideOpen(false);
    setMenuOpen(true);
  }, [locateCurrent]);

  // Left tap — climb one level up the tree. Tracks → folders → Hello
  // (root), and Hello is the ceiling: you can't go higher.
  const menuUp = useCallback(() => {
    if (!menuOpen) { enterMenu(); return; }
    menuAccumRef.current = 0;
    if (menuLevel === 'tracks') setMenuLevel('folders');
    else if (menuLevel === 'folders') setMenuLevel('root');
    // at 'root' (Hello) there's nowhere higher — stay put
  }, [menuOpen, menuLevel, enterMenu]);

  // Play/pause — available from anywhere (deck or menu), via the left centre,
  // the A key, or the space bar.
  const togglePlayPause = useCallback(() => {
    const willPlay = !audio.isPlaying;
    audio.togglePlay();
    triggerTransient(willPlay ? 'play' : 'pause', 2000); // 2s, then back to Playing
  }, [audio, triggerTransient]);

  // Right centre — descend / commit.
  const menuEnter = useCallback(() => {
    if (menuLevel === 'root') { // Hello → into the file system (folder list)
      menuAccumRef.current = 0;
      setMenuLevel('folders');
      return;
    }
    if (menuLevel === 'folders') {
      const cur = locateCurrent();
      menuAccumRef.current = 0;
      setMenuTrackIndex(menuFolderIndex === cur.f ? cur.t : 0);
      setMenuLevel('tracks');
      return;
    }
    const track = FOLDERS[menuFolderIndex]?.tracks[menuTrackIndex];
    if (track) {
      // Choosing the track that's already loaded keeps its current position —
      // only a different track reloads from the start.
      if (track.url !== currentUrl) selectMegamix(track);
      audio.play();
    }
    setMenuOpen(false);
  }, [menuLevel, menuFolderIndex, menuTrackIndex, selectMegamix, audio, locateCurrent, currentUrl]);

  const moveMenu = useCallback((delta: number) => {
    const dir = delta > 0 ? 1 : -1;
    if (menuLevel === 'root') return; // Hello has nothing to scroll
    if (menuLevel === 'folders') {
      setMenuFolderIndex((i) => Math.max(0, Math.min(FOLDERS.length - 1, i + dir)));
    } else {
      const n = FOLDERS[menuFolderIndex]?.tracks.length ?? 0;
      if (n > 0) setMenuTrackIndex((i) => Math.max(0, Math.min(n - 1, i + dir)));
    }
  }, [menuLevel, menuFolderIndex]);

  const scrollMenu = useCallback((deltaDeg: number) => {
    menuAccumRef.current += deltaDeg;
    while (Math.abs(menuAccumRef.current) >= MENU_STEP) {
      const dir = menuAccumRef.current > 0 ? 1 : -1;
      moveMenu(dir);
      menuAccumRef.current -= dir * MENU_STEP;
    }
  }, [moveMenu]);

  // The only path from a wheel to the audio engine. DECK_SPEC says which verb a
  // wheel carries in the current mode; this says what each verb does.
  const applyWheel = useCallback((verb: WheelVerb, delta: number) => {
    switch (verb) {
      case 'volume':
        audio.adjustVolume(delta * 0.004);
        triggerTransient('volume');
        break;
      case 'scrub':
        audio.seek(delta * 0.07);
        triggerTransient(delta > 0 ? 'scrub-fwd' : 'scrub-bwd');
        break;
      case 'speed': {
        const next = Math.max(0.25, Math.min(4.0, audio.playbackRate + delta * 0.012));
        audio.setRate(next);
        triggerTransient(Math.abs(next - 1) < 0.03 ? 'normal-speed' : next > 1 ? 'chipmunk' : 'slow');
        break;
      }
      case 'none':
        break;
    }
  }, [audio, triggerTransient]);

  // The reel always spins with the finger, in every context — only what that
  // rotation *does* changes.
  const handleLeftRotate = useCallback((delta: number) => {
    setLeftAngle(a => a + delta);
    if (menuOpen) { scrollMenu(delta); return; }
    applyWheel(DECK_SPEC[deckMode].left, delta); // 'none' in every mode today
  }, [menuOpen, scrollMenu, applyWheel, deckMode]);

  const handleRightRotate = useCallback((delta: number) => {
    setRightAngle(a => a + delta);
    // Base layer first: holding the left wheel reaches volume from anywhere,
    // including inside the menu. This test must stay ahead of the menu branch.
    if (leftHeld) {
      cancelCombo();                       // turning means this isn't a Combo
      applyWheel('volume', delta);
      suppressLeftClickRef.current = true; // the left tap that follows is spent
      return;
    }
    if (menuOpen) { scrollMenu(delta); return; }
    applyWheel(DECK_SPEC[deckMode].right, delta);
  }, [leftHeld, cancelCombo, menuOpen, scrollMenu, applyWheel, deckMode]);

  // ── Combo ────────────────────────────────────────────────────────────────
  // Both centres held together for COMBO_MS cycles the deck mode. Anything
  // shorter is the base layer (hold left, then use the right wheel), so the two
  // gestures share a start and are told apart purely by how long you hold.
  // Holding rather than requiring two simultaneous taps is deliberate: you can
  // land the second finger at your leisure, which is what makes this workable
  // on a phone.
  const rightLongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cycleDeckMode = useCallback(() => {
    setDeckMode((m) => DECK_ORDER[(DECK_ORDER.indexOf(m) + 1) % DECK_ORDER.length]);
    triggerTransient('deck-mode', 1400); // a deliberate switch earns a longer beat
  }, [triggerTransient]);

  useEffect(() => {
    if (leftHeld && rightHeld) {
      if (!comboTimerRef.current && !comboFiredRef.current) {
        comboTimerRef.current = setTimeout(() => {
          comboTimerRef.current = null;
          // comboFiredRef alone swallows both taps: it stays true until BOTH
          // centres are up, and each tap fires while the other is still down.
          // Setting the per-wheel flags here too would leave them armed (this
          // check runs first and returns early), eating a later, innocent tap.
          comboFiredRef.current = true;
          cycleDeckMode();
        }, COMBO_MS);
      }
    } else {
      cancelCombo();
      if (!leftHeld && !rightHeld) comboFiredRef.current = false; // re-arm once both are up
    }
  }, [leftHeld, rightHeld, cycleDeckMode, cancelCombo]);

  // Long-press the right centre ALONE inside the menu → back to the Playing
  // screen without changing what's loaded. Requires the left to be up, so it
  // can never race the Combo. With the root ceiling kept, this is the only way
  // out of the menu that doesn't start a track.
  useEffect(() => {
    if (rightHeld && !leftHeld && menuOpen) {
      rightLongTimerRef.current = setTimeout(() => {
        suppressRightClickRef.current = true;
        setMenuOpen(false);
      }, 550);
    }
    return () => {
      if (rightLongTimerRef.current) { clearTimeout(rightLongTimerRef.current); rightLongTimerRef.current = null; }
    };
  }, [rightHeld, leftHeld, menuOpen]);

  // A tap is swallowed while a two-wheel gesture is still in flight, or when the
  // Combo / base layer already spent it. Each wheel also clears its own flag on
  // its next press (see handleLeftHoldChange), so a flag can never go stale and
  // eat an unrelated tap later.
  const consumeTap = useCallback((ref: React.MutableRefObject<boolean>) => {
    if (comboFiredRef.current) return true;
    if (ref.current) { ref.current = false; return true; }
    return false;
  }, []);

  // Left centre — always "back": opens the menu from the deck, climbs a level
  // inside it, and stops at the Hello root.
  const handleLeftCenterClick = useCallback(() => {
    if (consumeTap(suppressLeftClickRef)) return;
    menuUp();
  }, [consumeTap, menuUp]);

  // Right centre — the action tap. Its verb follows the deck mode, except while
  // the left wheel is held, which always reaches base play/pause.
  const handleRightCenterClick = useCallback(() => {
    if (consumeTap(suppressRightClickRef)) return;
    if (leftHeld) { // base layer, works in the menu and in every mode
      cancelCombo();
      suppressLeftClickRef.current = true; // the left tap that follows is spent
      togglePlayPause();
      return;
    }
    if (menuOpen) { menuEnter(); return; } // enter folder / play track
    if (DECK_SPEC[deckMode].rightTap === 'reset-speed') {
      audio.setRate(1.0);
      triggerTransient('normal-speed');
      return;
    }
    togglePlayPause();
  }, [consumeTap, leftHeld, cancelCombo, togglePlayPause, menuOpen, menuEnter, deckMode, audio, triggerTransient]);

  // Latest callbacks, read by the (mounted-once) keyboard listener. There is no
  // typecheck in this project, so a key added to the effect but forgotten here
  // fails at runtime inside a raw listener — edit the two together.
  const latestValue = {
    guideBlocked: guideOpen || customizeMode, // Controls modal up: swallow everything
    menuOpen,
    rotateLeft: handleLeftRotate,
    rotateRight: handleRightRotate,
    tapLeft: handleLeftCenterClick,
    tapRight: handleRightCenterClick,
    // A fresh press starts from a clean slate — the pointer path gets this via
    // onHoldChange, so the keyboard has to do the same or a spent flag could
    // outlive its gesture and swallow the next tap.
    armLeftTap: () => { suppressLeftClickRef.current = false; },
    armRightTap: () => { suppressRightClickRef.current = false; },
    playPause: togglePlayPause,
    menuMove: moveMenu,
    closeMenu,
  };
  const latest = useRef(latestValue);
  latest.current = latestValue;

  // ── Keyboard controls — a plain mirror of the two wheels ───────────────────
  //  A = tap the left centre   → back: opens the menu, climbs a level
  //  S = tap the right centre  → enter/play in the menu, else the mode's tap
  //  A held + S / ↑ / ↓        → base layer: play-pause, volume
  //  A + S held for COMBO_MS   → the Combo: cycle the deck mode
  //  ← / → turn the left wheel  ·  ↑ / ↓ turn the right wheel
  //  Space = play/pause anywhere  ·  Esc = leave the menu
  // Every verb is resolved by the shared wheel handlers, so the keyboard can't
  // drift from the touch mapping.
  useEffect(() => {
    const held = new Set<string>();
    let aDown = false;             // only routes arrows; the base layer lives in leftHeld
    let timer: ReturnType<typeof setInterval> | null = null;
    const ROT = 3;                 // degrees per tick
    const isArrow = (k: string) =>
      k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';

    const tick = () => {
      const c = latest.current;
      if (c.guideBlocked) return;
      if (held.has('ArrowLeft')) c.rotateLeft(-ROT);
      if (held.has('ArrowRight')) c.rotateLeft(ROT);
      if (held.has('ArrowUp')) c.rotateRight(ROT);
      if (held.has('ArrowDown')) c.rotateRight(-ROT);
    };
    const start = () => { if (!timer) timer = setInterval(tick, 16); };
    const stopIfIdle = () => { if (timer && held.size === 0) { clearInterval(timer); timer = null; } };

    const onDown = (e: KeyboardEvent) => {
      const c = latest.current;
      const k = e.key;
      if (k === 'Escape') {
        if (c.menuOpen) c.closeMenu();
        return;
      }
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (c.guideBlocked || e.repeat) return;
        c.playPause(); // space = play/pause, from anywhere
      } else if (k === 'a' || k === 'A') {
        e.preventDefault();
        if (c.guideBlocked) return;
        aDown = true;
        if (!e.repeat) c.armLeftTap();
        setLeftPressed(true);  // held alongside S this becomes the Combo
      } else if (k === 's' || k === 'S') {
        e.preventDefault();
        if (c.guideBlocked) return;
        if (!e.repeat) c.armRightTap();
        setRightPressed(true); // acts on release, so A+S can arm the Combo first
      } else if (isArrow(k)) {
        e.preventDefault();
        if (c.guideBlocked) return;
        // A plain arrow steps the menu highlight once per press. With A held it
        // must go through the tick instead, so the base layer (hold left + turn
        // right = volume) keeps working while browsing.
        if (c.menuOpen && !aDown) {
          if (!e.repeat) c.menuMove(k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1);
          return;
        }
        held.add(k);
        start();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const c = latest.current;
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
      } else if (k === 'a' || k === 'A') {
        e.preventDefault();
        aDown = false;
        // Order matters. These are raw listeners, so React batches the state
        // update into a microtask: the Combo effect has not run yet when
        // tapLeft() fires, which is exactly why the tap still sees the
        // suppress flags the Combo set. Call tapLeft() first and A+S would
        // also open the menu.
        setLeftPressed(false);
        if (!c.guideBlocked) c.tapLeft();
      } else if (k === 's' || k === 'S') {
        e.preventDefault();
        setRightPressed(false);
        if (!c.guideBlocked) c.tapRight();
      } else if (isArrow(k)) {
        held.delete(k);
        stopIfIdle();
      }
    };

    const onBlur = () => {
      held.clear(); aDown = false;
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

  // Menu screen content, for the folders / tracks levels ('root' shows Hello).
  const oledMenu: OledMenu | undefined = (() => {
    if (!menuOpen || menuLevel === 'root') return undefined;
    if (menuLevel === 'folders') {
      return {
        folder: 'Home',
        current: FOLDERS[menuFolderIndex]?.name ?? 'Empty',
        next: FOLDERS[menuFolderIndex + 1]?.name ?? '',
      };
    }
    const folder = FOLDERS[menuFolderIndex];
    const tracks = folder?.tracks ?? [];
    return {
      folder: folder?.name ?? 'Library',
      current: tracks[menuTrackIndex]?.name ?? 'Empty',
      next: tracks[menuTrackIndex + 1]?.name ?? '',
    };
  })();
  // Transient feedback wins (so volume/play flash even while in the menu, then
  // hand back); then the open menu — Hello at the root, the browser below it;
  // otherwise the resting Playing screen (playing-vs-paused).
  const oledMode: OledScreenMode =
    transientMode ?? (menuOpen ? (menuLevel === 'root' ? 'hello' : 'menu') : 'playing');

  // Reset the marquee's start-hold whenever the visible screen or the
  // highlighted menu item changes, so every fresh screen shows the title's
  // start for a beat before it begins to crawl.
  const screenKey = `${oledMode}|${menuLevel}|${menuFolderIndex}|${menuTrackIndex}`;
  const marqueeSinceRef = useRef(performance.now());
  const prevScreenKeyRef = useRef(screenKey);
  if (prevScreenKeyRef.current !== screenKey) {
    prevScreenKeyRef.current = screenKey;
    marqueeSinceRef.current = performance.now();
  }

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
      {/* Discreet triggers: skin customiser + controls guide (the song menu
          lives on the device — the left wheel's centre opens it). */}
      {!customizeMode && (
        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', gap: 10 }}>
          <TopTrigger icon="◑" label="SKIN" onClick={() => { setMenuOpen(false); setGuideOpen(false); setCustomizeMode(true); }} />
          <TopTrigger icon="?" label="CONTROLS" onClick={() => { setMenuOpen(false); setGuideOpen(true); }} />
        </div>
      )}

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
            // Active shell theme drives every moulded part via these vars.
            '--shell-body': plastic.body,
            '--shell-stroke': plastic.stroke,
            '--shell-detail': plastic.detail,
            '--shell-wheel': plastic.wheel,
          } as React.CSSProperties}
        >
          {/* Internal build, revealed through a transparent / naked shell */}
          {plastic.reveal && INTERNALS_URL && (
            <img
              src={INTERNALS_URL}
              alt=""
              aria-hidden
              className="absolute pointer-events-none"
              style={{ left: 3, top: 3, width: 1074, height: 656, objectFit: 'contain' }}
            />
          )}

          {/* Cassette BG */}
          <div
            className="absolute bg-[var(--shell-body)] rounded-[44px]"
            style={{ height: 656, left: 3, top: 3, width: 1074 }}
          >
            <div aria-hidden className="absolute border-[3px] border-[var(--shell-stroke)] border-solid inset-[-3px] pointer-events-none rounded-[47px]" />
          </div>

          {/* Bump (bottom tab) */}
          <Bump />

          {/* Corner screws */}
          <Screws />

          {/* Cover with label (swappable sticker; hidden on a naked shell) */}
          {!plastic.hideLabel && <CoverArea label={label} />}

          {/* Cover outline */}
          <CoverOutline />

          {/* Interactive tape controls */}
          <InteractiveTapeControls
            leftAngle={leftAngle}
            rightAngle={rightAngle}
            onLeftRotate={handleLeftRotate}
            onRightRotate={handleRightRotate}
            onLeftCenter={handleLeftCenterClick}
            onRightCenter={handleRightCenterClick}
            leftPressed={leftPressed}
            rightPressed={rightPressed}
            onLeftHoldChange={handleLeftHoldChange}
            onRightHoldChange={handleRightHoldChange}
            mode={oledMode}
            currentTime={audio.currentTime}
            duration={audio.duration}
            playbackRate={audio.playbackRate}
            trackName={audio.trackName}
            volume={audio.volume}
            playing={audio.isPlaying}
            marqueeSince={marqueeSinceRef.current}
            menu={oledMenu}
            deck={DECK_SPEC[deckMode]}
            reveal={plastic.reveal}
          />
        </div>
      </div>

      {/* Non-interactive hint strip. It covers both contexts, because the deck
          mode is sticky and would otherwise be invisible on first use. The PLAY
          text is read from DECK_SPEC.hint, so a new mode can't leave a stale
          caption here. No nowrap: these lines are longer than the old menu-only
          one and must be allowed to wrap on a phone. */}
      <div
        style={{
          position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none', textAlign: 'center', maxWidth: '92vw',
          fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: 2,
          color: '#a08840', textTransform: 'uppercase',
        }}
      >
        {menuOpen
          ? (isMobile
              ? 'Turn to browse · tap right = open/play · tap left = back'
              : 'Turn to browse · S = open/play · A = back · Esc = leave')
          : `${isMobile ? DECK_SPEC[deckMode].hint.touch : DECK_SPEC[deckMode].hint.keys}`
            + (isMobile ? ' · hold both = modes' : ' · hold A+S = modes')}
      </div>

      {customizeMode && (
        <CustomizeOverlay
          shellName={plastic.name}
          labelName={label.name}
          onShell={cycleShell}
          onLabel={cycleLabel}
          onDone={() => setCustomizeMode(false)}
        />
      )}

      {guideOpen && (
        <ControlsModal isMobile={isMobile} onClose={() => setGuideOpen(false)} />
      )}
    </div>
  );
}

// ─── Customize (skin) mode — a flat carousel over the live cassette ─────────
// Horizontal arrows flip the shell, vertical arrows flip the label; the cassette
// behind updates live. Confirm with Done (or Enter/Esc).

interface CustomizeOverlayProps {
  shellName: string;
  labelName: string;
  onShell: (dir: number) => void;
  onLabel: (dir: number) => void;
  onDone: () => void;
}

function CarouselArrow({ glyph, onClick, style }: { glyph: string; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      aria-label={glyph}
      style={{
        position: 'absolute', width: 52, height: 52, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(160,136,64,0.55)',
        color: '#e8961c', fontSize: 24, lineHeight: 1, cursor: 'pointer',
        backdropFilter: 'blur(4px)', pointerEvents: 'auto',
        transition: 'color 0.15s, border-color 0.15s, transform 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#e8961c'; e.currentTarget.style.transform = (style.transform ?? '') + ' scale(1.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(160,136,64,0.55)'; e.currentTarget.style.transform = style.transform ?? ''; }}
    >
      {glyph}
    </button>
  );
}

function CustomizeOverlay({ shellName, labelName, onShell, onLabel, onDone }: CustomizeOverlayProps) {
  const cap = { fontFamily: "'Space Mono', monospace", color: '#a08840', textTransform: 'uppercase', letterSpacing: 2 } as const;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 25, background: 'rgba(6,5,4,0.34)', pointerEvents: 'auto' }}>
      {/* Title */}
      <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', ...cap, fontSize: 11, color: '#e8961c' }}>
        Customize
      </div>

      {/* Shell — horizontal arrows at the sides */}
      <CarouselArrow glyph="‹" onClick={() => onShell(-1)} style={{ left: 24, top: '50%', transform: 'translateY(-50%)' }} />
      <CarouselArrow glyph="›" onClick={() => onShell(1)} style={{ right: 24, top: '50%', transform: 'translateY(-50%)' }} />

      {/* Label — vertical arrows at top/bottom */}
      <CarouselArrow glyph="▲" onClick={() => onLabel(-1)} style={{ top: 44, left: '50%', transform: 'translateX(-50%)' }} />
      <CarouselArrow glyph="▼" onClick={() => onLabel(1)} style={{ bottom: 66, left: '50%', transform: 'translateX(-50%)' }} />

      {/* Current selection HUD (bottom-left, clear of the cassette centre) */}
      <div style={{ position: 'absolute', left: 22, bottom: 18, ...cap, fontSize: 12, lineHeight: 1.9 }}>
        <div><span style={{ color: '#8a8a7e', fontSize: 9 }}>SHELL&nbsp;‹›&nbsp;</span>{shellName}</div>
        <div><span style={{ color: '#8a8a7e', fontSize: 9 }}>LABEL&nbsp;▲▼&nbsp;</span>{labelName}</div>
      </div>

      {/* Done */}
      <button
        onClick={onDone}
        style={{
          position: 'absolute', bottom: 18, right: 18, pointerEvents: 'auto',
          padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
          background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(160,136,64,0.55)',
          color: '#e8961c', fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: 3,
          textTransform: 'uppercase', backdropFilter: 'blur(4px)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#e8961c'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(160,136,64,0.55)'; }}
      >
        ✓ Done
      </button>
    </div>
  );
}
