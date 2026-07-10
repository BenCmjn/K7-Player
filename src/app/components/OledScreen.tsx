import { useEffect, useRef } from 'react';

// ─── Hardware target: AZDelivery 0.91" SSD1306 OLED, 128×32, monochrome ────
// Every screen (play/pause, effects, menus…) renders into this exact pixel
// grid so what you see here is what the physical DAP's firmware will show.

export const OLED_W = 128;
export const OLED_H = 32;

// Matches the real AZDelivery panel: cyan-blue with a photographed bloom/glow.
export const OLED_COLOR = '#2FE0FF';
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
};

const GLYPH_W = 5;
const GLYPH_H = 7;
const ADVANCE = GLYPH_W + 1; // 1px letter-spacing

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

export function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, scale = 1) {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    drawGlyph(ctx, cx, y, FONT[ch] ?? FONT[' '], scale);
    cx += ADVANCE * scale;
  }
}

/** A 1-bit progress/level bar: hollow outline with a proportional solid fill. */
export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number) {
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  const innerW = Math.max(0, Math.round((w - 2) * Math.max(0, Math.min(1, frac))));
  if (innerW > 0) ctx.fillRect(x + 1, y + 1, innerW, h - 2);
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

// ─── The actual screen content (v1: play/pause deck) ───────────────────────

export interface OledDeckState {
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

function fmtTimeOled(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function rateLabelOled(r: number) {
  if (Math.abs(r - 1) < 0.03) return 'NORMAL';
  return r > 1 ? `CHIPMUNK X${r.toFixed(2)}` : `SLOW X${r.toFixed(2)}`;
}

/** Draws `text` horizontally centered in the full 128px width. */
export function drawCentered(ctx: CanvasRenderingContext2D, y: number, text: string, scale = 1) {
  drawText(ctx, Math.round((OLED_W - textWidth(text, scale)) / 2), y, text, scale);
}

const MARQUEE_SPEED = 14; // canvas px/second — a slow, readable crawl
const MARQUEE_GAP = 20;   // blank px between loops

/**
 * Centers `text` if it fits in the visible width; otherwise scrolls it
 * right-to-left forever. The physical viewing window is narrower than the
 * full 128px panel (it crops the outer edges), so a slow crawl — not a
 * hard truncation — is how a real device would let you read a long title.
 */
export function drawMarquee(ctx: CanvasRenderingContext2D, y: number, text: string) {
  const w = textWidth(text);
  if (w <= OLED_W) {
    drawText(ctx, Math.round((OLED_W - w) / 2), y, text);
    return;
  }
  const period = w + MARQUEE_GAP;
  const offset = ((performance.now() / 1000) * MARQUEE_SPEED) % period;
  const x = Math.round(-offset);
  drawText(ctx, x, y, text);
  if (x + period < OLED_W) drawText(ctx, x + period, y, text);
}

export function drawDeckScreen(ctx: CanvasRenderingContext2D, s: OledDeckState, color: string = OLED_COLOR) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = GLOW_BLUR;

  if (!s.isLoaded) {
    drawCentered(ctx, 4, 'NO SIGNAL');
    drawCentered(ctx, 18, 'LOAD A TAPE');
    return;
  }

  // Row 1 — track name: centered, or a slow marquee if it's too long
  drawMarquee(ctx, 0, s.trackName || 'UNKNOWN');

  // Row 2 — status + time, centered
  const status = s.isScrubbing ? 'SCRUB' : s.isPlaying ? 'PLAY' : 'PAUSE';
  drawCentered(ctx, 9, `${status} ${fmtTimeOled(s.currentTime)}/${fmtTimeOled(s.duration)}`);

  // Row 3 — progress bar (full width by design — a bar's edge isn't a legibility issue)
  const frac = s.duration > 0 ? s.currentTime / s.duration : 0;
  drawBar(ctx, 0, 18, OLED_W, 4, frac);

  // Row 4 — rate label, or a transient volume readout while adjusting — centered as a group
  if (s.volumeActive) {
    const label = 'VOL';
    const barW = 70;
    const gap = 4;
    const groupW = textWidth(label) + gap + barW;
    const x = Math.round((OLED_W - groupW) / 2);
    drawText(ctx, x, 24, label);
    drawBar(ctx, x + textWidth(label) + gap, 25, barW, 6, s.volume);
  } else {
    drawCentered(ctx, 24, rateLabelOled(s.playbackRate));
  }
}
