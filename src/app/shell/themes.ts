// Cassette shell theming — the plastic colour and the printed label are chosen
// independently (see the customize carousel in App.tsx). The plastic tokens are
// applied as CSS variables (--shell-body / --shell-stroke / --shell-detail) on
// the cassette wrapper, so switching a theme just re-sets a few vars. Labels and
// the transparent-shell internals are drop-in SVG layers.

export type PlasticId = 'offwhite' | 'black' | 'transparent' | 'naked';

export interface PlasticTheme {
  id: PlasticId;
  name: string;
  body: string;   // plastic fill (body + control pill)
  stroke: string; // moulded outlines
  detail: string; // solid dark parts (holes, screws)
  wheel: string;  // the reel wheels — opaque, kept visible on dark shells too
  reveal?: boolean;    // render the OLED at full width + show the internals behind
  hideLabel?: boolean; // don't paint the label sticker
  // (a "naked" shell needs no explicit hide flag for the plastic — setting the
  //  body/stroke/detail vars to `transparent` makes every moulded part vanish.)
}

export const PLASTIC_THEMES: PlasticTheme[] = [
  { id: 'offwhite', name: 'Off-white', body: '#e6e6e6', stroke: '#202020', detail: '#202020', wheel: '#202020' },
  { id: 'black', name: 'Black', body: '#1a1a1a', stroke: '#4a4a4a', detail: '#050505', wheel: '#404040' },
  {
    id: 'transparent', name: 'Transparent',
    body: 'rgba(228,231,234,0.26)', stroke: 'rgba(214,218,222,0.5)', detail: 'rgba(120,124,128,0.42)',
    wheel: '#2b2d30', reveal: true,
  },
  {
    id: 'naked', name: 'Naked',
    body: 'transparent', stroke: 'transparent', detail: 'transparent',
    wheel: '#33363a', reveal: true, hideLabel: true,
  },
];

export function plasticById(id: string | null | undefined): PlasticTheme {
  return PLASTIC_THEMES.find((t) => t.id === id) ?? PLASTIC_THEMES[0];
}

// A label style is either the built-in "Classic" cover art (svg undefined) or a
// drop-in SVG dropped into src/assets/labels/*.svg.
export interface LabelStyle {
  id: string;
  name: string;
  svg?: string; // asset URL; undefined = built-in Classic
}

function prettify(file: string): string {
  return file.replace(/\.svg$/i, '').replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Classic first, then every dropped-in SVG (sorted), each auto-registered. */
export function buildLabelStyles(svgModules: Record<string, string>): LabelStyle[] {
  const classic: LabelStyle = { id: 'classic', name: 'Classic' };
  const extra = Object.entries(svgModules)
    .map(([path, svg]) => {
      const file = path.split('/').pop()!;
      return { id: file.replace(/\.svg$/i, ''), name: prettify(file), svg };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return [classic, ...extra];
}

export function labelById(styles: LabelStyle[], id: string | null | undefined): LabelStyle {
  return styles.find((s) => s.id === id) ?? styles[0];
}
