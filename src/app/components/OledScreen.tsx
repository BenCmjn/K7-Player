import { useEffect, useRef } from 'react';

// ─── Hardware target: AZDelivery 0.91" SSD1306 OLED, 128×32, monochrome ────
// Every screen (play/pause, effects, menus…) renders into this exact pixel
// grid so what you see here is what the physical DAP's firmware will show.

export const OLED_W = 128;
export const OLED_H = 32;

// Per-pixel bloom radius, in native 128×32 canvas px (scales up with the canvas).
const GLOW_BLUR = 1.4;

// ─── 5×7 pixel font ─────────────────────────────────────────────────────────
// One glyph = 7 rows of a 5-char string ('#' lit / '.' unlit). Hand-authored
// on a fixed grid — not a scan of a real font — so it stays crisp at 1 canvas
// pixel per dot, same as an SSD1306 draws text via Adafruit-GFX/u8g2.

type Glyph = string[];

const FONT: Record<string, Glyph> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '#....', '####.', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '.....'],
  '%': ['#...#', '#..#.', '...#.', '..#..', '.#...', '.#..#', '#...#'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  'A': ['..#..', '.#.#.', '#...#', '#...#', '#####', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  'J': ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '<': ['....#', '...#.', '..#..', '.#...', '..#..', '...#.', '....#'],
  '>': ['#....', '.#...', '..#..', '...#.', '..#..', '.#...', '#....'],
  'a': ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  'c': ['.....', '.....', '.###.', '#....', '#....', '#....', '.###.'],
  'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  'e': ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  'f': ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  'g': ['.....', '.....', '.####', '#...#', '.####', '....#', '.###.'],
  'h': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'i': ['..#..', '.....', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'j': ['...#.', '.....', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'k': ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  'l': ['.#...', '.#...', '.#...', '.#...', '.#...', '.#...', '..##.'],
  'm': ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  'n': ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  'p': ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
  'q': ['.....', '.....', '.####', '#...#', '.####', '....#', '....#'],
  'r': ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
  's': ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  't': ['.#...', '.#...', '####.', '.#...', '.#...', '.#...', '..##.'],
  'u': ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.####'],
  'v': ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'w': ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  'y': ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  'z': ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const ADVANCE = GLYPH_W + 1; // 1px letter-spacing

function glyphFor(ch: string): Glyph {
  return FONT[ch] ?? FONT[ch.toUpperCase()] ?? FONT[ch.toLowerCase()] ?? FONT[' '];
}

function drawGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: Glyph, scale: number) {
  for (let row = 0; row < GLYPH_H; row++) {
    const line = glyph[row];
    for (let col = 0; col < GLYPH_W; col++) {
      if (line[col] === '#') ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

export function textWidth(text: string, scale = 1) {
  return text.length > 0 ? (text.length * ADVANCE - 1) * scale : 0;
}

/** Draws `text` respecting its exact case (this font has distinct upper/lower glyphs). */
export function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, scale = 1) {
  let cx = x;
  for (const ch of text) {
    drawGlyph(ctx, cx, y, glyphFor(ch), scale);
    cx += ADVANCE * scale;
  }
}

// ─── Canvas host: native 128×32 buffer, scaled crisply via CSS ─────────────

interface OledCanvasProps {
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function OledCanvas({ draw }: OledCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  // Re-run on every render so `draw` always sees the latest closed-over state —
  // the canvas is cheap (128×32) so this is fine even at animation-frame rates.
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, OLED_W, OLED_H);
    draw(ctx);
  });

  return (
    <canvas
      ref={ref}
      width={OLED_W}
      height={OLED_H}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
      }}
    />
  );
}

// ─── Screen content — matches the Figma design system exactly ─────────────
// Two families, driven by which state the deck is in:
//  · Idle (Pause / Playing / Volume) — dark ink bg, cyan text, glowing like a
//    real lit OLED.
//  · Wheel touch (Chipmunk / Slow / Normal / Scrub fwd+bwd) — inverted: solid
//    cyan bg, dark text. This is still 1-bit-accurate: a monochrome OLED can
//    invert which pixels are "on" just as easily, it's just most of the panel
//    lit instead of most of it dark — so no glow here, the bloom would be
//    indistinguishable from the fill itself.

export const INK = '#06090e';
export const CYAN = '#00e4ff';

export type OledScreenMode =
  | 'pause'
  | 'playing'
  | 'volume'
  | 'chipmunk'
  | 'slow'
  | 'normal-speed'
  | 'scrub-bwd'
  | 'scrub-fwd';

export interface OledScreenState {
  mode: OledScreenMode;
  trackName: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number; // 0..1
}

function fmtTimeOled(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Draws `text` horizontally centered in the full 128px width. */
export function drawCentered(ctx: CanvasRenderingContext2D, y: number, text: string, scale = 1) {
  drawText(ctx, Math.round((OLED_W - textWidth(text, scale)) / 2), y, text, scale);
}

const MARQUEE_SPEED = 14; // canvas px/second — a slow, readable crawl
const MARQUEE_GAP = 20;   // blank px between loops

/**
 * Centers `text` if it fits; otherwise scrolls it forever (default
 * right-to-left, or left-to-right when `reverse` is set — used to make the
 * scrub arrows visually flow the same way the tape is moving). The physical
 * viewing window is narrower than the full 128px panel, so a slow crawl —
 * not a hard truncation — is how a real device would let you read the rest.
 */
export function drawMarquee(ctx: CanvasRenderingContext2D, y: number, text: string, scale = 1, reverse = false) {
  const w = textWidth(text, scale);
  if (w <= OLED_W) {
    drawText(ctx, Math.round((OLED_W - w) / 2), y, text, scale);
    return;
  }
  const period = w + MARQUEE_GAP;
  const t = ((performance.now() / 1000) * MARQUEE_SPEED) % period;
  const offset = reverse ? period - t : t;
  const x = Math.round(-offset);
  drawText(ctx, x, y, text, scale);
  if (x + period < OLED_W) drawText(ctx, x + period, y, text, scale);
  if (x - period + OLED_W > 0) drawText(ctx, x - period, y, text, scale);
}

// Scrub arrows shuttle fast, with a velocity that peaks at each loop boundary
// and eases through the middle — a rhythmic "fast-forward" pulse. easePulse
// maps a 0..1 phase to 0..1 travel with e(0)=0, e(1)=1 and speed highest at
// the ends, so the wrap between loops stays velocity-continuous (no jerk).
const SCRUB_CYCLE = 0.4;  // seconds for the arrows to travel one full period
const SCRUB_EASE = 0.9;   // 0..1 pulse strength (0 = constant speed)
function easePulse(p: number) {
  return p + (SCRUB_EASE / (2 * Math.PI)) * Math.sin(2 * Math.PI * p);
}

/** Always-scrolling marquee (no centered/static fallback) — used for the
 * scrub screens' arrow row, which should read as continuous tape motion. */
function drawScrollingArrows(ctx: CanvasRenderingContext2D, y: number, text: string, reverse: boolean) {
  const period = textWidth(text) + MARQUEE_GAP;
  const raw = (performance.now() / (1000 * SCRUB_CYCLE)) % 1;
  const frac = reverse ? 1 - easePulse(raw) : easePulse(raw);
  let x = Math.round(-frac * period);
  x = ((x % period) + period) % period - period; // normalize into (-period, 0]
  for (let px = x; px < OLED_W; px += period) drawText(ctx, px, y, text);
}

function drawVolumeBars(ctx: CanvasRenderingContext2D, volume: number) {
  const y = 26;
  const h = 4;
  const gap = 15; // half-gap from center reserved for the % readout
  const maxLen = 34;
  const len = Math.round(2 + Math.max(0, Math.min(1, volume)) * maxLen);
  const cx = OLED_W / 2;
  ctx.fillRect(Math.round(cx - gap - len), y, len, h);
  ctx.fillRect(Math.round(cx + gap), y, len, h);
}

export function drawOledScreen(ctx: CanvasRenderingContext2D, s: OledScreenState) {
  const touch = s.mode !== 'pause' && s.mode !== 'playing' && s.mode !== 'volume';
  const bg = touch ? CYAN : INK;
  const fg = touch ? INK : CYAN;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, OLED_W, OLED_H);
  ctx.fillStyle = fg;
  if (!touch) {
    // Only the idle family glows — it's the one where most of the panel is unlit.
    ctx.shadowColor = fg;
    ctx.shadowBlur = GLOW_BLUR;
  } else {
    ctx.shadowBlur = 0;
  }

  const track = s.trackName || 'Unknown';
  const time = `${fmtTimeOled(s.currentTime)}/${fmtTimeOled(s.duration)}`;

  switch (s.mode) {
    case 'pause': {
      drawMarquee(ctx, 0, track);
      drawCentered(ctx, 9, 'Pause!', 2);
      drawCentered(ctx, 25, time);
      break;
    }
    case 'playing': {
      const showRate = Math.abs(s.playbackRate - 1) > 0.03;
      if (showRate) {
        const label = `x${s.playbackRate.toFixed(2)}`;
        drawText(ctx, 2, 0, label);
        drawText(ctx, OLED_W - 2 - textWidth(label), 0, label);
      }
      drawCentered(ctx, 0, 'Playing');
      drawMarquee(ctx, 9, track, 2);
      drawCentered(ctx, 25, time);
      break;
    }
    case 'volume': {
      drawMarquee(ctx, 0, track);
      drawCentered(ctx, 9, 'Volume', 2);
      drawCentered(ctx, 25, `${Math.round(s.volume * 100)}%`);
      drawVolumeBars(ctx, s.volume);
      break;
    }
    case 'chipmunk': {
      drawCentered(ctx, 2, `x${s.playbackRate.toFixed(2)}`, 3);
      drawCentered(ctx, 25, 'Chipmunk!!');
      break;
    }
    case 'slow': {
      drawCentered(ctx, 2, `x${s.playbackRate.toFixed(2)}`, 3);
      drawCentered(ctx, 25, 'Slow!');
      break;
    }
    case 'normal-speed': {
      drawCentered(ctx, 2, 'NormaL', 3);
      drawCentered(ctx, 25, 'speed');
      break;
    }
    case 'scrub-bwd': {
      drawCentered(ctx, 3, 'Backward!', 2);
      drawScrollingArrows(ctx, 23, '<<<<<<<< scrubing <<<<<<<<', false);
      break;
    }
    case 'scrub-fwd': {
      drawCentered(ctx, 3, 'Forward!', 2);
      drawScrollingArrows(ctx, 23, '>>>>>>>> scrubing >>>>>>>>', true);
      break;
    }
  }
}
