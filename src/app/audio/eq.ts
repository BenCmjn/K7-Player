// ─── Equalizer — DSP model ─────────────────────────────────────────────────
//
// This mirrors the ESP32 firmware's architecture rather than the browser's
// easiest option, on purpose: the prototype exists to rehearse the device.
//
// **The 16 bars on screen are NOT 16 independent gains.** The state is a short
// chain of parametric biquads — one low shelf, N_BELLS peaking filters, one
// high shelf — and the bars are that chain's frequency response, evaluated at
// 16 log-spaced points between 20 Hz and 20 kHz. Editing a bar edits a filter;
// once the bells run out, the nearest one in frequency is stolen.
//
// A browser could trivially afford 16 real biquads, and the interaction mockup
// assumed exactly that. But the bell budget is not an implementation detail —
// it is what the finished device will feel like (push a fourth correction and a
// neighbouring bump slides over to meet you), and it is only prototypable if
// the web build lives under the same constraint.
//
// Filter formulas: Robert Bristow-Johnson's Audio EQ Cookbook, the same ones
// the firmware will use.

export type EqFilterType = 'lowshelf' | 'peaking' | 'highshelf';

export interface EqFilter {
  type: EqFilterType;
  f: number; // centre / corner frequency, Hz
  q: number;
  g: number; // dB. 0 means inactive — a peaking or shelf filter at 0 dB is a
             // pass-through, so a "free" slot needs no special case anywhere.
}

export interface EqChain {
  low: EqFilter;      // band 1
  bells: EqFilter[];  // always N_BELLS entries; g === 0 marks a free slot
  high: EqFilter;     // band 16
}

/** The device's sample rate. The displayed curve is computed against it so the
 *  bars match the firmware whatever rate the browser's AudioContext runs at. */
export const FS = 44100;

/** Bells available at once. The firmware starts at 3 and may grow with CPU
 *  headroom; the interface does not change either way. */
export const N_BELLS = 3;

export const BAND_COUNT = 16;
export const EQ_MAX_DB = 12;

/** 16 points, 20 Hz → 20 kHz, log-spaced (one step = 10^0.2 ≈ 2/3 octave). */
export const BAND_HZ: readonly number[] = Array.from(
  { length: BAND_COUNT },
  (_, i) => 20 * Math.pow(1000, i / (BAND_COUNT - 1)),
);

const BAND_RATIO = Math.pow(1000, 1 / (BAND_COUNT - 1));

// Brush width IS the Q of the filter, inverted: a wide brush is a low Q (a
// spread bell), a narrow brush a high Q (a surgical one). The three values are
// derived from the mockup's coupling kernels — [1] / [1,0.55] / [1,0.7,0.35]
// — read as "where does the bell fall to half its gain": within half a band,
// one band out, one and a half bands out. With Q = √(2^BW)/(2^BW − 1) and a
// band step of 2/3 octave, that gives 2/3, 4/3 and 2 octaves of bandwidth.
export const BRUSH_Q: readonly number[] = [2.15, 1.05, 0.67];
export const BRUSH_COUNT = BRUSH_Q.length;

// Corners used when the user raises band 1 or band 16 by hand. Not the bands'
// own centres: a shelf hinged at 20 Hz or 20 kHz would do nothing audible.
// A preset's own corner is kept when you retouch it.
const MANUAL_LOW_HZ = 120;
const MANUAL_HIGH_HZ = 8000;
const SHELF_Q = 0.7; // Butterworth — flattest corner, and what every preset uses

const clampDb = (g: number) => Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, g));

const bell = (f: number, q: number, g: number): EqFilter => ({ type: 'peaking', f, q, g });
const shelf = (type: 'lowshelf' | 'highshelf', f: number, q: number, g: number): EqFilter =>
  ({ type, f, q, g });

const freeBells = () => Array.from({ length: N_BELLS }, () => bell(1000, 1, 0));

function mkChain(low: EqFilter, bells: EqFilter[], high: EqFilter): EqChain {
  const slots = freeBells();
  bells.forEach((b, i) => { if (i < N_BELLS) slots[i] = b; });
  return { low, bells: slots, high };
}

export const FLAT_CHAIN: EqChain = mkChain(
  shelf('lowshelf', MANUAL_LOW_HZ, SHELF_Q, 0),
  [],
  shelf('highshelf', MANUAL_HIGH_HZ, SHELF_Q, 0),
);

export interface EqPreset {
  /** Rendered lowercase, and switched to full caps while it is the loaded,
   *  untouched curve. */
  label: string;
  chain: EqChain;
}

// No genre names. "Rock" / "Jazz" is the reflex of cheap players and it is
// useless — a genre is not a tonal target. Each of these names a listening
// situation or an audible effect instead.
export const EQ_PRESETS: readonly EqPreset[] = [
  {
    // The ferric-tape signature: body around 200 Hz, a veil in the upper mids,
    // and the treble rolled off past 9 kHz. The product's narrative preset.
    label: 'k7',
    chain: mkChain(
      shelf('lowshelf', 220, SHELF_Q, +3),
      [bell(3200, 1.0, -2)],
      shelf('highshelf', 9000, SHELF_Q, -5),
    ),
  },
  {
    label: 'bass',
    chain: mkChain(
      shelf('lowshelf', 110, SHELF_Q, +6),
      [bell(350, 1.2, -2)],
      shelf('highshelf', MANUAL_HIGH_HZ, SHELF_Q, 0),
    ),
  },
  {
    // A smile curve for quiet listening: it compensates the ear's loss of
    // sensitivity in the bass and the far treble at low volume
    // (Fletcher-Munson). The "loudness" button of a 70s hi-fi amp.
    label: 'night',
    chain: mkChain(
      shelf('lowshelf', 100, SHELF_Q, +6),
      [bell(1000, 0.8, -1.5)],
      shelf('highshelf', 8000, SHELF_Q, +4),
    ),
  },
  // Always reachable, always the way out.
  { label: 'flat', chain: FLAT_CHAIN },
];

export const FLAT_PRESET_INDEX = EQ_PRESETS.length - 1;

/** The chain flattened for iteration: low shelf, then the bells, then high. */
export function chainFilters(c: EqChain): EqFilter[] {
  return [c.low, ...c.bells, c.high];
}

/**
 * Magnitude of one biquad at f, in dB. RBJ Cookbook coefficients.
 *
 * The Cookbook normalises everything by a0 before use; that matters for the
 * difference equation, not here — this evaluates |B(e^jw)| / |A(e^jw)|, and
 * the a0 cancels in the ratio.
 */
function magnitudeDb(flt: EqFilter, f: number): number {
  if (flt.g === 0) return 0;
  const A = Math.pow(10, flt.g / 40);
  const w0 = (2 * Math.PI * flt.f) / FS;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * flt.q);

  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (flt.type === 'peaking') {
    b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
  } else {
    const s = 2 * Math.sqrt(A) * alpha;
    if (flt.type === 'lowshelf') {
      b0 = A * ((A + 1) - (A - 1) * cw + s);
      b1 = 2 * A * ((A - 1) - (A + 1) * cw);
      b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s;
      a1 = -2 * ((A - 1) + (A + 1) * cw);
      a2 = (A + 1) + (A - 1) * cw - s;
    } else {
      b0 = A * ((A + 1) + (A - 1) * cw + s);
      b1 = -2 * A * ((A - 1) + (A + 1) * cw);
      b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s;
      a1 = 2 * ((A - 1) - (A + 1) * cw);
      a2 = (A + 1) - (A - 1) * cw - s;
    }
  }

  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(-w), s1 = Math.sin(-w);
  const c2 = Math.cos(-2 * w), s2 = Math.sin(-2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = b1 * s1 + b2 * s2;
  const dr = a0 + a1 * c1 + a2 * c2, di = a1 * s1 + a2 * s2;
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** The chain's response at the 16 band centres, in dB — i.e. the bars. */
export function renderChain(c: EqChain): number[] {
  const filters = chainFilters(c);
  return BAND_HZ.map((f) => filters.reduce((db, flt) => db + magnitudeDb(flt, f), 0));
}

/**
 * Global trim that puts the curve's peak back at 0 dB, so a +6 dB boost at
 * 80 Hz becomes "0 dB at 80 Hz, −6 dB elsewhere".
 *
 * Two reasons. It makes the bypass comparison honest — otherwise you are
 * comparing loudness, not timbre, and louder always wins. And it keeps a preset
 * stacked on a manual boost from clipping the output.
 *
 * The bars keep showing the raw curve: normalisation is a level decision, and
 * watching every other band sink because you raised one would read as a bug.
 */
export function makeupDb(bands: readonly number[]): number {
  return -Math.max(0, ...bands);
}

/** Within half a band step in log frequency — near enough to be the same
 *  correction, which is what the user means when they aim at a visible bump. */
function isNear(f: number, target: number): boolean {
  return Math.abs(Math.log(f / target)) < Math.log(BAND_RATIO) / 2;
}

/**
 * Apply `deltaDb` at `band` (0..15) with the current brush, and return the new
 * chain.
 *
 * Bands 1 and 16 are the shelves — a bell centred at 30 Hz falls away below
 * itself, so pushing the first bar would not lift the sub-bass at all, which
 * reads as a bug. The 14 bands between them are bells, allocated in this order:
 *
 *   1. an active bell already sitting on (or beside) this band → retouch it
 *   2. a free slot → place a new bell at the band's centre
 *   3. nothing free → steal the bell **nearest in frequency**, not the oldest.
 *      It keeps its gain and moves onto the band, so the bump slides across to
 *      meet the finger rather than vanishing.
 */
export function editBand(c: EqChain, band: number, deltaDb: number, brush: number): EqChain {
  if (band === 0) {
    const g = clampDb(c.low.g + deltaDb);
    // A shelf that was sitting idle has no meaningful corner yet.
    const f = c.low.g === 0 ? MANUAL_LOW_HZ : c.low.f;
    return { ...c, low: { ...c.low, f, g } };
  }
  if (band === BAND_COUNT - 1) {
    const g = clampDb(c.high.g + deltaDb);
    const f = c.high.g === 0 ? MANUAL_HIGH_HZ : c.high.f;
    return { ...c, high: { ...c.high, f, g } };
  }

  const target = BAND_HZ[band];
  const bells = c.bells.slice();

  let i = bells.findIndex((b) => b.g !== 0 && isNear(b.f, target));
  let f = i >= 0 ? bells[i].f : target; // retouching keeps the bump where it is
  if (i < 0) i = bells.findIndex((b) => b.g === 0);
  if (i < 0) {
    i = bells.reduce(
      (best, b, k) =>
        Math.abs(Math.log(b.f / target)) < Math.abs(Math.log(bells[best].f / target)) ? k : best,
      0,
    );
    f = target;
  }

  bells[i] = bell(f, BRUSH_Q[brush], clampDb(bells[i].g + deltaDb));
  return { ...c, bells };
}

/** True when the chain is doing nothing at all. */
export function isFlat(c: EqChain): boolean {
  return chainFilters(c).every((f) => f.g === 0);
}
