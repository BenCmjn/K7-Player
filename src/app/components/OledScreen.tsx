import { useEffect, useRef } from 'react';
import { FONT_04B03, CELL_H, type Glyph } from './oled/font04b03';
import { ICONS } from './oled/icons';

// ─── Hardware target: AZDelivery 0.91" SSD1306 OLED, 128×32, monochrome ────
// Every screen (play/pause, effects, menus…) renders into this exact pixel
// grid so what you see here is what the physical DAP's firmware will show.
//
// The design system lives in Figma ("K7 Rebirth — Audio Player", Latest
// screens). Two things are baked from that file's own assets into 1-bit
// bitmaps (see tools/oled-bake): the type is 04b03 (Yuji Oshimoto) and the
// glyphs sit in font04b03.ts; the icons are pixelarticons and sit in icons.ts.
// Both draw as fillRect grids so they stay crisp at any scale, same as an
// SSD1306 pushing pixels via Adafruit-GFX/u8g2.

export const OLED_W = 128;
export const OLED_H = 32;

export const INK = '#06090e';
export const CYAN = '#00e4ff';

// ─── 04b03 text rendering ─────────────────────────────────────────────────
// Proportional font: each glyph carries its own advance width. One 04b03 pixel
// = `scale` canvas px, so scale 1/2/3 reproduce the design's 8/16/24px sizes.

const ADVANCE_GAP = 1; // 1px letter-spacing, matches the Figma text metrics

function glyphFor(ch: string): Glyph {
  return FONT_04B03[ch] ?? FONT_04B03[ch.toUpperCase()] ?? FONT_04B03[ch.toLowerCase()] ?? FONT_04B03[' '];
}

function drawGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: Glyph, scale: number) {
  for (let row = 0; row < CELL_H; row++) {
    const line = glyph.rows[row];
    for (let col = 0; col < glyph.w; col++) {
      if (line[col] === '#') ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

export function textWidth(text: string, scale = 1) {
  let w = 0;
  for (const ch of text) w += (glyphFor(ch).w + ADVANCE_GAP) * scale;
  return w > 0 ? w - ADVANCE_GAP * scale : 0;
}

/** Draws `text` at its exact case (04b03 has distinct upper/lower glyphs). */
export function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, scale = 1) {
  let cx = x;
  for (const ch of text) {
    const g = glyphFor(ch);
    drawGlyph(ctx, cx, y, g, scale);
    cx += (g.w + ADVANCE_GAP) * scale;
  }
}

/** Draws `text` horizontally centered in the full 128px width. */
export function drawCentered(ctx: CanvasRenderingContext2D, y: number, text: string, scale = 1) {
  drawText(ctx, Math.round((OLED_W - textWidth(text, scale)) / 2), y, text, scale);
}

const MARQUEE_SPEED = 14; // canvas px/second — a slow, readable crawl
const MARQUEE_GAP = 16;   // blank px between loops
const MARQUEE_HOLD = 1000; // ms held at the start before a fresh screen scrolls

/**
 * Draws `text` inside the horizontal band [x, x+w]: static (left-aligned) if it
 * fits, otherwise scrolling. The physical viewing window is narrower than the
 * full panel, so a slow crawl — not a hard truncation — is how a real device
 * lets you read a long track name. Clipped to the band so it never bleeds into
 * the icon or neighbouring text.
 *
 * When `sinceMs` is given (the moment this screen/item appeared), the text is
 * held at its start for MARQUEE_HOLD before it begins to crawl — so every new
 * screen shows the beginning first, then scrolls. Omit it for a marquee that
 * should run off the shared wall clock.
 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, text: string, scale = 1, reverse = false, sinceMs?: number,
) {
  const tw = textWidth(text, scale);
  if (tw <= w) {
    drawText(ctx, x, y, text, scale);
    return;
  }
  ctx.save();
  // Clip band spans the full cell height (descenders + big scales included).
  ctx.beginPath();
  ctx.rect(x, 0, w, OLED_H);
  ctx.clip();
  const period = tw + MARQUEE_GAP;
  let t: number;
  if (sinceMs != null) {
    const run = performance.now() - sinceMs - MARQUEE_HOLD;
    t = run <= 0 ? 0 : ((run / 1000) * MARQUEE_SPEED) % period; // hold at start, then crawl
  } else {
    t = ((performance.now() / 1000) * MARQUEE_SPEED) % period;
  }
  const offset = reverse ? period - t : t;
  let px = x - Math.round(offset);
  for (; px < x + w; px += period) drawText(ctx, px, y, text, scale);
  // one more to the left so the tail scrolls in seamlessly
  drawText(ctx, px - period, y, text, scale);
  ctx.restore();
}

// ─── Icons (pixelarticons, 24×24) ─────────────────────────────────────────

function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number) {
  const rows = ICONS[name];
  if (!rows) return;
  for (let iy = 0; iy < rows.length; iy++) {
    const line = rows[iy];
    for (let ix = 0; ix < line.length; ix++) {
      if (line[ix] === '#') ctx.fillRect(x + ix, y + iy, 1, 1);
    }
  }
}

// ─── Hello robot (custom "Happy faces" from Figma, two-frame animation) ─────
// Rectangles in the 24×24 icon box. The head/antenna/ears stay put; the eyes
// and mouth toggle between a neutral face (tall eyes, no mouth) and a happy one
// (dot eyes + a grin), matching the welcome-screen animation.
type Rect = readonly [number, number, number, number];
const ROBOT_HEAD: readonly Rect[] = [
  [7, 3, 4, 2], [11, 5, 2, 2],           // antenna flag + nub
  [5, 7, 14, 2], [5, 19, 14, 2],         // head top / bottom
  [3, 9, 2, 10], [19, 9, 2, 10],         // head sides
  [1, 13, 2, 2], [21, 13, 2, 2],         // ears
];
const ROBOT_NEUTRAL: readonly Rect[] = [
  [8, 12, 2, 4], [14, 12, 2, 4],         // tall bar eyes, no mouth
];
const ROBOT_HAPPY: readonly Rect[] = [
  [8, 12, 2, 2], [14, 12, 2, 2],         // dot eyes
  [8, 16, 8, 1], [8, 17, 2, 1], [14, 17, 2, 1], // open grin
];

function drawRects(ctx: CanvasRenderingContext2D, rects: readonly Rect[], ox: number, oy: number) {
  for (const [x, y, w, h] of rects) ctx.fillRect(ox + x, oy + y, w, h);
}

/** Robot face at the icon slot, expression toggled by the clock (welcome anim). */
function drawRobotFace(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const happy = ((now / 1000) % 1.4) > 0.45; // brief neutral "blink", mostly smiling
  drawRects(ctx, ROBOT_HEAD, x, y);
  drawRects(ctx, happy ? ROBOT_HAPPY : ROBOT_NEUTRAL, x, y);
}

/** Filled triangle (scanline), used for the custom scrub double-arrows. */
function fillTriangle(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
) {
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const edge = (x1: number, y1: number, x2: number, y2: number, y: number) =>
    y2 === y1 ? x1 : x1 + ((x2 - x1) * (y - y1)) / (y2 - y1);
  for (let y = minY; y < maxY; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    const segs = [[ax, ay, bx, by], [bx, by, cx, cy], [cx, cy, ax, ay]];
    for (const [x1, y1, x2, y2] of segs) {
      if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(edge(x1, y1, x2, y2, yc));
    }
    if (xs.length >= 2) {
      xs.sort((p, q) => p - q);
      const x0 = Math.round(xs[0]);
      const x1 = Math.round(xs[xs.length - 1]);
      ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

/** ▶▶ / ◀◀ scrub arrows, drawn in the 24×24 icon slot at (x, y). */
function drawScrubArrows(ctx: CanvasRenderingContext2D, x: number, y: number, forward: boolean) {
  const cy = y + 12;        // vertical centre of the icon box
  const h = 7;              // half-height of each triangle
  const tw = 8;             // triangle width
  const draw = (ox: number) => {
    if (forward) fillTriangle(ctx, x + ox, cy - h, x + ox + tw, cy, x + ox, cy + h);
    else fillTriangle(ctx, x + ox + tw, cy - h, x + ox, cy, x + ox + tw, cy + h);
  };
  draw(3);
  draw(3 + tw + 1);
}

// ─── Waveform (scrolling audio silhouette along the bottom band) ────────────

const WAVE_Y = 25;   // top of the 7px waveform band (matches Figma)
const WAVE_H = 7;

const WAVE_FREQ = 0.20; // spatial frequency (radians per canvas px)

/**
 * A smooth pseudo-audio silhouette scrolled by `scrollPx` canvas pixels — so the
 * caller sets its speed in the same px units as the marquee (they must match on
 * the Playing screen). Freeze it by passing a constant (e.g. 0) when paused.
 */
function drawWaveform(ctx: CanvasRenderingContext2D, scrollPx: number) {
  for (let x = 0; x < OLED_W; x++) {
    const u = (x + scrollPx) * WAVE_FREQ;
    // sum of a few incommensurate sines → an ever-changing, music-like envelope
    const n = Math.sin(u) * 0.5 + Math.sin(u * 0.37 + 1.3) * 0.3 + Math.sin(u * 1.7 + 0.6) * 0.2;
    const h = Math.max(1, Math.round((n * 0.5 + 0.5) * (WAVE_H - 1)) + 1);
    ctx.fillRect(x, OLED_H - h, 1, h);
  }
}

// ─── Equalizer ─────────────────────────────────────────────────────────────
// Geometry lifted from the Figma frame "128-32 EQ".
//
// Zero dB sits at the vertical centre and the bars are bidirectional. That is
// not a style choice: bars growing from the bottom are the visual language of a
// spectrum analyser — an instrument of measurement, whose bars dance on their
// own. An equalizer is an instrument of control. It cuts as much as it boosts,
// and its bars stay where you put them.

const EQ_BANDS = 16;
const EQ_X0 = 20;        // left edge of band 0's body
const EQ_PITCH = 5;      // per band (4px body + 1px gutter)
const EQ_BODY_W = 4;
const EQ_ZERO_Y = 16;    // 0 dB
const EQ_SPAN = 12;      // px each way, so ±12 dB is exactly 1 px per dB

// Figma puts the preset column at x=102 in a 26px box, but 04b03's `NIGHT` is
// 27px wide in caps — the loaded state. The column starts 2px earlier so it
// fits; the band cursor's right dots stop at x=99, so nothing collides.
const EQ_PRESET_X = 100;
const EQ_PRESET_W = 28;
const EQ_PRESET_H = 7;
const EQ_PRESET_PITCH = 8;

// A 14×7 miniature of the bell the right wheel is painting: five columns whose
// heights are the coupling profile. Narrow is one spike, wide is a mound.
const EQ_BRUSH_PROFILE: readonly (readonly number[])[] = [
  [0, 0, 7, 0, 0],
  [0, 4, 7, 4, 0],
  [2, 5, 7, 5, 2],
];

function drawBrush(ctx: CanvasRenderingContext2D, x: number, y: number, brush: number) {
  const profile = EQ_BRUSH_PROFILE[brush] ?? EQ_BRUSH_PROFILE[1];
  profile.forEach((h, i) => { if (h > 0) ctx.fillRect(x + i * 3, y + 7 - h, 2, h); });
}

/** Deck-mode banner glyph: a tiny bidirectional EQ in the 24×24 icon slot. */
const EQ_ICON: readonly Rect[] = [
  [0, 12, 24, 1],                                             // zero line
  [2, 6, 3, 6], [8, 13, 3, 6], [14, 4, 3, 8], [20, 13, 3, 3], // four bands
];

function drawEqScreen(ctx: CanvasRenderingContext2D, e: OledEq, fg: string, bg: string) {
  // ±12 dB rules. Two dots per band cell, so they read as a scale without
  // competing with the curve.
  for (let b = 0; b < EQ_BANDS; b++) {
    const x = EQ_X0 + b * EQ_PITCH;
    for (const dx of [0, 2]) {
      ctx.fillRect(x + dx, EQ_ZERO_Y - EQ_SPAN, 1, 1);
      ctx.fillRect(x + dx, EQ_ZERO_Y + EQ_SPAN, 1, 1);
    }
  }

  // The curve: one 4×1 dash per band, at its gain. At 0 dB they line up into
  // the baseline, so the zero line needs no drawing of its own. Bypass presses
  // them all flat — you watch your own EQ disappear, which reads better than
  // the word "BYPASS" and costs no font.
  for (let b = 0; b < EQ_BANDS; b++) {
    const db = e.bypass ? 0 : Math.max(-EQ_SPAN, Math.min(EQ_SPAN, e.bands[b] ?? 0));
    ctx.fillRect(EQ_X0 + b * EQ_PITCH, EQ_ZERO_Y - Math.round(db), EQ_BODY_W, 1);
  }

  // Cursor: dotted columns bracketing the selected band. None while the cursor
  // is down in the presets — the inverted chip is the cursor there.
  if (e.cursor < EQ_BANDS) {
    const x = EQ_X0 + e.cursor * EQ_PITCH;
    for (let y = EQ_ZERO_Y - EQ_SPAN; y <= EQ_ZERO_Y + EQ_SPAN; y += 3) {
      ctx.fillRect(x - 1, y, 1, 1);
      ctx.fillRect(x + EQ_BODY_W, y, 1, 1);
    }
  }

  drawBrush(ctx, 2, 22, e.brush);

  // Presets. Two independent states: the cursor inverts the chip it is on, and
  // the preset that is actually loaded — and still untouched — is the one in
  // full caps. Edit a band and it drops back to lower case.
  e.presets.forEach((label, i) => {
    const boxY = 1 + i * EQ_PRESET_PITCH;
    const hovered = e.cursor === EQ_BANDS + i;
    if (hovered) {
      ctx.fillRect(EQ_PRESET_X, boxY, EQ_PRESET_W, EQ_PRESET_H);
      ctx.fillStyle = bg;
    }
    // One row above the chip: glyph bodies sit on rows 1-5 of the 8px cell, so
    // this centres them and keeps `night`'s descender inside the inverted box.
    drawText(ctx, EQ_PRESET_X + 1, boxY - 1, e.active === i ? label.toUpperCase() : label, 1);
    if (hovered) ctx.fillStyle = fg;
  });
}

// ─── Canvas host: native 128×32 buffer, scaled crisply via CSS ─────────────

interface OledCanvasProps {
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export function OledCanvas({ draw }: OledCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Keep the latest draw closure so the animation loop always sees fresh state.
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Redraw every frame from a single rAF loop rather than per React render, so
  // marquees and the waveform keep animating even when nothing else changes
  // (e.g. while paused). The 128×32 canvas is cheap enough to repaint at 60fps.
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const frame = () => {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OLED_W, OLED_H);
      drawRef.current(ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      width={OLED_W}
      height={OLED_H}
      style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }}
    />
  );
}

// ─── Screen model ──────────────────────────────────────────────────────────
// Two families, driven by the mode:
//  · Dark ink bg, cyan text — the calm/idle states (hello, play, pause,
//    playing, volume).
//  · Inverted solid-cyan bg, dark text — the "you're pushing it" feedback
//    (all three speeds and scrub), which flash the panel to grab the eye. Still
//    1-bit-accurate: a monochrome OLED inverts which pixels are lit just as
//    easily; it's just most of the panel lit instead of most dark.

export type OledScreenMode =
  | 'hello'
  | 'play'
  | 'pause'
  | 'playing'
  | 'volume'
  | 'chipmunk'
  | 'slow'
  | 'normal-speed'
  | 'scrub-bwd'
  | 'scrub-fwd'
  | 'menu'
  | 'deck-mode'
  | 'eq';

export interface OledMenu {
  folder: string;   // top caption (e.g. the collection name)
  current: string;  // highlighted entry, drawn big
  next: string;     // preview of the following entry
}

/**
 * The active deck mode, mirrored from App's DECK_SPEC. One shape covers every
 * mode present and future, so adding loop/eq needs no change in this file.
 */
export interface OledDeck {
  label: string;  // big value on the mode banner ('Deck' | 'Scrub' | 'Speed')
  icon: string;   // ICONS key, or 'scrub-arrows' for the drawn double-arrows
  tag: string;    // <=3-char chip kept on the resting Playing screen ('' = none)
}

/**
 * The equalizer surface. Unlike every other screen here this one is an editor,
 * not a readout: it stays up for as long as the deck is in `eq` mode.
 */
export interface OledEq {
  bands: readonly number[];   // 16 gains in dB — the chain's response, not 16 knobs
  cursor: number;             // one circular list of 20: bands 0-15, then presets
  brush: number;              // 0 narrow · 1 medium · 2 wide
  presets: readonly string[]; // 4 labels, lower case
  active: number;             // the loaded, untouched preset — or -1 once edited
  bypass: boolean;
}

export interface OledScreenState {
  mode: OledScreenMode;
  trackName: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;  // 0..1
  playing: boolean; // drives the Playing screen's pause badge + frozen waveform
  marqueeSince: number; // performance.now() when this screen/item appeared (marquee hold)
  menu?: OledMenu;
  deck?: OledDeck;
  eq?: OledEq;
}

const INVERTED_MODES: ReadonlySet<OledScreenMode> = new Set([
  'chipmunk', 'slow', 'normal-speed', 'scrub-bwd', 'scrub-fwd', 'deck-mode',
]);

// Shared layout (matches the Figma frames): 24px icon at (8,4), text column at
// x=40, caption on the top 8px row, big value below.
const ICON_X = 8;
const ICON_Y = 4;
const TEXT_X = 40;
const TEXT_W = OLED_W - TEXT_X;

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** "x2.40" / "x0.38" — the speed readout, two decimals like the design. */
function fmtRate(r: number) {
  return `x${r.toFixed(2)}`;
}

/** Compact rate badge for the Playing header: "X1", "X1.5", "X2". */
function fmtRateBadge(r: number) {
  const s = Number.isInteger(r) ? r.toString() : r.toFixed(1);
  return `X${s}`;
}

function volumeIcon(v: number) {
  if (v <= 0.001) return 'volume';
  if (v < 0.5) return 'volume-1';
  if (v < 0.75) return 'volume-2';
  return 'volume-3';
}

/** icon + caption (scale 1) + big value (scale 3) — the common screen shape. */
function drawIconScreen(
  ctx: CanvasRenderingContext2D,
  icon: string, caption: string, value: string,
  opts: { valueY?: number; valueScale?: number; marqueeCaption?: boolean; sinceMs?: number } = {},
) {
  const { valueY = 8, valueScale = 3, marqueeCaption = false, sinceMs } = opts;
  drawIcon(ctx, icon, ICON_X, ICON_Y);
  if (marqueeCaption) drawMarquee(ctx, TEXT_X, 0, TEXT_W, caption, 1, false, sinceMs);
  else drawText(ctx, TEXT_X, 0, caption, 1);
  drawText(ctx, TEXT_X, valueY, value, valueScale);
}

export function drawOledScreen(ctx: CanvasRenderingContext2D, s: OledScreenState) {
  const inverted = INVERTED_MODES.has(s.mode);
  const bg = inverted ? CYAN : INK;
  const fg = inverted ? INK : CYAN;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, OLED_W, OLED_H);
  ctx.fillStyle = fg;
  ctx.shadowBlur = 0; // crisp 1-bit pixels, no bloom

  const track = s.trackName || 'Unknown';
  const now = performance.now();

  switch (s.mode) {
    case 'hello':
      drawRobotFace(ctx, ICON_X, ICON_Y, now); // animated welcome face
      drawText(ctx, TEXT_X, 0, 'K7 rebirth', 1);
      drawText(ctx, TEXT_X, 8, 'Hello!', 3);
      break;

    case 'play':
      drawIconScreen(ctx, 'music', track, 'play!', { marqueeCaption: true, sinceMs: s.marqueeSince });
      break;

    case 'pause':
      drawIconScreen(ctx, 'coffee', track, 'pause', { marqueeCaption: true, sinceMs: s.marqueeSince });
      break;

    case 'volume': {
      const pct = `${Math.round(s.volume * 100)}%`;
      drawIconScreen(ctx, volumeIcon(s.volume), 'volume', pct);
      break;
    }

    case 'chipmunk':
      drawIconScreen(ctx, 'speed-fast', 'Chipmunk!!', fmtRate(s.playbackRate), { valueY: 7 });
      break;

    case 'slow':
      drawIconScreen(ctx, 'speed-slow', 'Slow!', fmtRate(s.playbackRate), { valueY: 7 });
      break;

    case 'normal-speed':
      drawIconScreen(ctx, 'speed-medium', 'speed', 'normal', { valueY: 7 });
      break;

    case 'playing': {
      // No icon: time on the left; top-right shows the speed badge while
      // playing, or "pause" while paused. The title marquee always scrolls;
      // the waveform only scrolls while playing (frozen when paused), and at
      // the same px/s as the marquee so the two move together.
      const time = `${fmtTime(s.currentTime)}/${fmtTime(s.duration)}`;
      drawText(ctx, 2, 0, time, 1);
      let right = OLED_W - 2;
      // Deck-mode chip. The mode is sticky and outlives its banner, so the
      // resting screen has to keep saying which verb the right wheel carries.
      // Inverted so it reads as a state, not as data. Empty in base mode.
      const tag = s.deck?.tag;
      if (tag) {
        const w = textWidth(tag, 1) + 3;
        ctx.fillRect(right - w, 0, w, 7);
        ctx.fillStyle = bg;
        drawText(ctx, right - w + 2, 0, tag, 1);
        ctx.fillStyle = fg;
        right -= w + 3;
      }
      const badge = s.playing ? fmtRateBadge(s.playbackRate) : 'pause';
      drawText(ctx, right - textWidth(badge, 1), 0, badge, 1);
      drawMarquee(ctx, 0, 8, OLED_W, track, 2, false, s.marqueeSince);
      drawWaveform(ctx, s.playing ? (now / 1000) * MARQUEE_SPEED : 0);
      break;
    }

    case 'scrub-fwd':
    case 'scrub-bwd': {
      const fwd = s.mode === 'scrub-fwd';
      drawScrubArrows(ctx, ICON_X, ICON_Y, fwd);
      drawText(ctx, TEXT_X, 1, 'scrubbing', 1);
      drawText(ctx, TEXT_X, 10, fwd ? 'Forward!' : 'Rewind!', 2);
      // Waveform streaks fast, the way the tape is shuttling.
      drawWaveform(ctx, (now / 1000) * MARQUEE_SPEED * 4 * (fwd ? 1 : -1));
      break;
    }

    case 'deck-mode': {
      // Flashed by the Combo. Same geometry as drawIconScreen, but the icon may
      // be drawn here rather than baked into ICONS.
      const d = s.deck ?? { label: 'Deck', icon: 'music', tag: '' };
      if (d.icon === 'scrub-arrows') drawScrubArrows(ctx, ICON_X, ICON_Y, true);
      else if (d.icon === 'eq-bars') drawRects(ctx, EQ_ICON, ICON_X, ICON_Y);
      else drawIcon(ctx, d.icon, ICON_X, ICON_Y);
      drawText(ctx, TEXT_X, 0, 'mode', 1);
      drawText(ctx, TEXT_X, 7, d.label, 3);
      break;
    }

    case 'eq':
      drawEqScreen(ctx, s.eq ?? {
        bands: new Array(16).fill(0), cursor: 0, brush: 1,
        presets: ['k7', 'bass', 'night', 'flat'], active: 3, bypass: false,
      }, fg, bg);
      break;

    case 'menu': {
      const m = s.menu ?? { folder: 'Megamix', current: track, next: '' };
      // top: "‹ folder"
      drawText(ctx, ICON_X, 0, '<', 1);
      drawMarquee(ctx, 20, 0, OLED_W - 20, m.folder, 1);
      // middle: current entry (big), with a "›" enter affordance at the right
      drawMarquee(ctx, ICON_X, 8, OLED_W - ICON_X - 12, m.current, 2, false, s.marqueeSince);
      drawText(ctx, OLED_W - 6, 12, '>', 1);
      // bottom: next entry preview
      if (m.next) drawText(ctx, ICON_X, 24, m.next, 1);
      break;
    }
  }
}
