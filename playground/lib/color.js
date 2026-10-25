// Hex colour helpers: parsing, alpha compositing and WCAG contrast.

export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map(c => c + c).join('');
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

const hex2 = v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

export function toHex({ r, g, b, a = 1 }) {
  return '#' + hex2(r) + hex2(g) + hex2(b) + (a < 1 ? hex2(a * 255) : '');
}

/** Lower-case #rrggbb or #rrggbbaa, or null when the value isn't a hex colour. */
export function normalizeHex(hex) {
  const c = parseHex(hex);
  return c ? toHex(c) : null;
}

/** The colour as #rrggbb, ignoring alpha (what <input type="color"> accepts). */
export function opaqueHex(hex) {
  const c = parseHex(hex);
  return c ? toHex({ ...c, a: 1 }) : '#000000';
}

/** A possibly translucent colour drawn over an opaque background. */
export function composite(fgHex, bgHex) {
  const f = parseHex(fgHex) || { r: 0, g: 0, b: 0, a: 1 };
  const b = parseHex(bgHex) || { r: 0, g: 0, b: 0, a: 1 };
  const mix = (x, y) => x * f.a + y * (1 - f.a);
  return { r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b), a: 1 };
}

const channel = v => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export function luminance(c) {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrast(fgHex, bgHex) {
  const bg = composite(bgHex, '#000000');
  const fg = composite(fgHex, toHex(bg));
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function isDarkColor(hex) {
  return luminance(composite(hex, '#000000')) < 0.25;
}
