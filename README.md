# K7 Rebirth — Cassette Music Player

A virtual cassette deck you actually play with. The two reels are click‑wheels,
and a real 128×32 monochrome OLED sits behind the little shell window — rendered
pixel‑for‑pixel the way the physical firmware would draw it.

**▶ Live demo: [k7-rebirth.netlify.app](https://k7-rebirth.netlify.app)**

<!-- Tip: drop a screenshot or GIF here, e.g. ![K7 Rebirth](docs/preview.png) -->

---

## What it is

K7 Rebirth is a browser toy modelled on a tiny hardware DAP (digital audio
player). Everything you'd expect from the real device is simulated:

- A **hardware‑accurate OLED** — an AZDelivery 0.91" SSD1306, 128×32, 1‑bit —
  drawn procedurally so it stays crisp at any zoom, glow‑free, one canvas pixel
  per panel pixel.
- **Two cassette wheels** used as click‑wheels: the left navigates (and, held,
  reaches the base controls), the right acts — volume, scrub or speed depending
  on the deck mode.
- A tape‑like **scrub** (with the fast‑forward screech), **speed** control that
  bends the pitch (chipmunk / slow), **volume**, and an on‑device **song menu**.
- Boots to a **Hello** welcome screen with a little animated robot, then drops
  into its file system — just like powering on the real thing.

The whole look and feel comes from a Figma design system; the type and icons are
that file's own assets, baked into the player (see [Under the hood](#under-the-hood)).

## Controls

The device is driven by the two wheels; every gesture also has a keyboard
shortcut. Open the on‑screen **Controls** card (top of the page) any time.

The idea in one line: the **left wheel is navigation** (tap = back, hold =
reach the base controls from anywhere) and the **right wheel is the action**,
whose verb depends on the current deck mode.

| Action | Keyboard | Wheels / touch |
| --- | --- | --- |
| Play · Pause | `S` / `Space` | Tap the right wheel |
| Volume | `↑` / `↓` | Turn the right wheel |
| Song menu · open / back | `A` / `Esc` | Tap the left wheel |
| Song menu · enter / play | `S` | Tap the right wheel |
| Song menu · browse | `←` / `→` | Turn either wheel |
| Deck mode · cycle | hold `A` + `S` | Hold both wheels |
| Scrub · seek *(Scrub mode)* | `↑` / `↓` | Turn the right wheel |
| Speed · chipmunk / slow *(Speed mode)* | `↑` / `↓` | Turn the right wheel |
| Reset speed *(Speed mode)* | `S` | Tap the right wheel |
| Volume · play/pause from anywhere | hold `A` + `↑`/`↓` or `S` | Hold left + turn/tap right |

**Deck modes.** Holding both wheels together for a beat cycles
`base → Scrub → Speed → base`. The mode is sticky — it only changes on the next
hold — and the resting screen shows a small `SCR` / `SPD` chip so you always
know which verb the right wheel is carrying. Holding the left wheel always
reaches the base controls (volume, play/pause), whatever mode you're in.

Holding both is the one gesture reserved for advanced switching, precisely
because two-finger gestures are the least reliable on a phone; everything you
do often is a single tap or turn.

**The song menu** is a small tree: **Hello** (home) → **Library** (folder) →
tracks. Tap the left wheel to climb a level (Hello is the top), the right wheel
to go deeper or play a track, and long‑press the right wheel to jump straight
back to what's playing. Re‑selecting the track that's already loaded keeps its
position instead of restarting.

On phones the cassette rotates to fill the screen; on desktop there's a
real‑size (100 × 65 mm) ruler tool in the top‑right corner.

## Getting started

```bash
npm install
npm run dev      # start the dev server (Vite)
npm run build    # production build into dist/
```

Then open the URL Vite prints (default `http://localhost:5173`).

## Add your own music

The library is just the folder — no code to touch:

- Drop `.mp3` files into `src/assets/audio/`. Each one becomes a selectable
  track (the file name, tidied up, is its title).
- Drop an image into `src/assets/textures/` to change the background fabric.

## Under the hood

The OLED never uses image files at runtime. Two of the Figma design's assets are
**baked into 1‑bit bitmap modules** so the panel can be drawn as plain
`fillRect` grids:

- [`src/app/components/oled/font04b03.ts`](src/app/components/oled/font04b03.ts)
  — the [04b03](https://www.04.jp.org/) pixel font, one 8px glyph per entry.
- [`src/app/components/oled/icons.ts`](src/app/components/oled/icons.ts) — the
  [pixelarticons](https://pixelarticons.com/) set at 24×24.

Everything on the panel is composed from those in
[`src/app/components/OledScreen.tsx`](src/app/components/OledScreen.tsx), driven
by a single `requestAnimationFrame` loop so marquees and the waveform keep
moving even when the audio is paused.

**Regenerating the baked assets:** run the generator in
[`tools/oled-bake/`](tools/oled-bake/) — it rasterizes `04b03.ttf` and the icon
SVGs in a browser, thresholds them to 1‑bit, and writes the two `.ts` modules.

```bash
node tools/oled-bake/server.mjs   # then open http://localhost:8791 and click "save"
```

## Tech stack

React · TypeScript · Vite · Tailwind CSS · shadcn/ui. Audio is a streaming
`<audio>` element so even hour‑long megamixes stay light on memory.

## Credits

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md). In short: UI components from
[shadcn/ui](https://ui.shadcn.com/) (MIT), the [04b03](https://www.04.jp.org/)
pixel font by Yuji Oshimoto (free), [pixelarticons](https://pixelarticons.com/)
by Gerrit Halfmann (MIT), and a background fabric texture from Freepik.

Music tracks are the property of their respective artists and are bundled here
only as demo content.
