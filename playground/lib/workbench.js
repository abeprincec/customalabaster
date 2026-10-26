// Interface colours for the window preview, resolved the way VS Code does it:
// a theme's own value, else VS Code's registered default (which may point at another
// colour or transform one). Colour maths follows VS Code's Color/RGBA/HSLA classes.

// ---- VS Code's colour maths -----------------------------------------------------------

const roundFloat = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

class RGBA {
  constructor(r, g, b, a = 1) {
    this.r = Math.min(255, Math.max(0, r)) | 0;
    this.g = Math.min(255, Math.max(0, g)) | 0;
    this.b = Math.min(255, Math.max(0, b)) | 0;
    this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
  }
}

class HSLA {
  constructor(h, s, l, a) {
    this.h = Math.max(Math.min(360, h), 0) | 0;
    this.s = roundFloat(Math.max(Math.min(1, s), 0), 3);
    this.l = roundFloat(Math.max(Math.min(1, l), 0), 3);
    this.a = roundFloat(Math.max(Math.min(1, a), 0), 3);
  }
  static fromRGBA({ r: r8, g: g8, b: b8, a }) {
    const r = r8 / 255;
    const g = g8 / 255;
    const b = b8 / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (min + max) / 2;
    const chroma = max - min;
    if (chroma > 0) {
      s = Math.min(l <= 0.5 ? chroma / (2 * l) : chroma / (2 - 2 * l), 1);
      if (max === r) h = (g - b) / chroma + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      h = Math.round(h * 60);
    }
    return new HSLA(h, s, l, a);
  }
  static hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  static toRGBA({ h: deg, s, l, a }) {
    const h = deg / 360;
    let r;
    let g;
    let b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = HSLA.hue2rgb(p, q, h + 1 / 3);
      g = HSLA.hue2rgb(p, q, h);
      b = HSLA.hue2rgb(p, q, h - 1 / 3);
    }
    return new RGBA(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a);
  }
}

const luminanceOf = c => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

export class Color {
  constructor(rgba) {
    this.rgba = rgba;
  }
  static fromHSLA(hsla) {
    const c = new Color(HSLA.toRGBA(hsla));
    c._hsla = hsla;
    return c;
  }
  get hsla() {
    return (this._hsla ??= HSLA.fromRGBA(this.rgba));
  }
  /** Like VS Code's Color.fromHex: anything that isn't a hex colour becomes red. */
  static fromHex(hex) {
    const m = typeof hex === 'string' && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
    if (!m) return new Color(new RGBA(255, 0, 0, 1));
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return new Color(new RGBA(n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1));
  }
  luminance() {
    const { r, g, b } = this.rgba;
    return roundFloat(0.2126 * luminanceOf(r) + 0.7152 * luminanceOf(g) + 0.0722 * luminanceOf(b), 4);
  }
  isLighterThan(other) {
    return this.luminance() > other.luminance();
  }
  isDarkerThan(other) {
    return this.luminance() < other.luminance();
  }
  lighten(f) {
    const { h, s, l, a } = this.hsla;
    return Color.fromHSLA(new HSLA(h, s, l + l * f, a));
  }
  darken(f) {
    const { h, s, l, a } = this.hsla;
    return Color.fromHSLA(new HSLA(h, s, l - l * f, a));
  }
  mix(other, factor = 0.5) {
    const t = Math.min(Math.max(factor, 0), 1);
    const a = this.rgba;
    const b = other.rgba;
    return new Color(new RGBA(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t));
  }
  transparent(f) {
    const { r, g, b, a } = this.rgba;
    return new Color(new RGBA(r, g, b, a * f));
  }
  isOpaque() {
    return this.rgba.a === 1;
  }
  makeOpaque(bg) {
    if (this.isOpaque() || bg.rgba.a !== 1) return this;
    const { r, g, b, a } = this.rgba;
    const o = bg.rgba;
    return new Color(new RGBA(o.r - a * (o.r - r), o.g - a * (o.g - g), o.b - a * (o.b - b), 1));
  }
  static lighterColor(of, relative, factor) {
    if (of.isLighterThan(relative)) return of;
    factor = factor || 0.5;
    const l1 = of.luminance();
    const l2 = relative.luminance();
    return of.lighten((factor * (l2 - l1)) / l2);
  }
  static darkerColor(of, relative, factor) {
    if (of.isDarkerThan(relative)) return of;
    factor = factor || 0.5;
    const l1 = of.luminance();
    const l2 = relative.luminance();
    return of.darken((factor * (l1 - l2)) / l1);
  }
  toHex() {
    const h = v => v.toString(16).padStart(2, '0');
    const { r, g, b, a } = this.rgba;
    return `#${h(r)}${h(g)}${h(b)}${a === 1 ? '' : h(Math.round(a * 255))}`;
  }
}

// ---- resolution -------------------------------------------------------------------------

export const THEME_TYPES = ['dark', 'light', 'hcDark', 'hcLight'];

export function themeTypeOf(uiTheme, type) {
  const t = String(uiTheme || type || '').toLowerCase();
  if (t === 'vs' || t === 'light') return 'light';
  if (t === 'hc-black' || t === 'hc' || t === 'hcdark') return 'hcDark';
  if (t === 'hc-light' || t === 'hclight') return 'hcLight';
  return 'dark';
}

/**
 * Resolve colour ids for a theme.
 * colors   the theme's own `colors` (values "default" mean "use VS Code's default")
 * type     dark | light | hcDark | hcLight
 * defaults VS Code's registered defaults, as read by lib/vscode-colors.js
 */
export function resolveColors(colors, type, defaults, ids) {
  const own = {};
  for (const [id, value] of Object.entries(colors || {})) {
    if (typeof value === 'string' && value !== 'default') own[id] = Color.fromHex(value);
  }
  const cache = new Map();
  const resolving = new Set();

  const get = id => {
    if (own[id]) return own[id];
    if (cache.has(id)) return cache.get(id);
    if (resolving.has(id)) return undefined;
    resolving.add(id);
    const entry = defaults[id];
    const value = entry && (entry.byType ? entry.byType[type] : entry.all);
    const color = evaluate(value);
    resolving.delete(id);
    cache.set(id, color);
    return color;
  };

  const evaluate = node => {
    if (!node) return undefined;
    if (node.hex) return Color.fromHex(node.hex);
    if (node.ref) return get(node.ref);
    switch (node.op) {
      case 'darken': return evaluate(node.value)?.darken(node.factor);
      case 'lighten': return evaluate(node.value)?.lighten(node.factor);
      case 'transparent': return evaluate(node.value)?.transparent(node.factor);
      case 'opaque': {
        const bg = evaluate(node.background);
        const c = evaluate(node.value);
        return bg ? c?.makeOpaque(bg) : c;
      }
      case 'oneOf':
        for (const candidate of node.values) {
          const c = evaluate(candidate);
          if (c) return c;
        }
        return undefined;
      case 'mix': {
        const clear = Color.fromHex('#00000000');
        return (evaluate(node.color) || clear).mix(evaluate(node.with) || clear, node.ratio);
      }
      case 'ifDefined':
        return evaluate(own[node.if] ? node.then : node.else);
      case 'lessProminent': {
        const from = evaluate(node.value);
        if (!from) return undefined;
        const bg = evaluate(node.background);
        if (!bg) return from.transparent(node.factor * node.transparency);
        return (from.isDarkerThan(bg)
          ? Color.lighterColor(from, bg, node.factor)
          : Color.darkerColor(from, bg, node.factor)).transparent(node.transparency);
      }
      default:
        return undefined;
    }
  };

  const out = {};
  for (const id of ids) out[id] = get(id)?.toHex() ?? null;
  return out;
}

/** The defaults needed to resolve `ids`, including every colour they point at. */
export function defaultsClosure(defaults, ids) {
  const out = {};
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.ref) add(node.ref);
    if (node.if) add(node.if);
    for (const key of ['value', 'background', 'then', 'else', 'color', 'with']) visit(node[key]);
    for (const v of node.values || []) visit(v);
  };
  const add = id => {
    if (id in out || !defaults[id]) return;
    out[id] = defaults[id];
    const entry = defaults[id];
    if (entry.byType) Object.values(entry.byType).forEach(visit);
    else visit(entry.all);
  };
  ids.forEach(add);
  return out;
}

// Every colour the window preview paints with.
export const WORKBENCH_KEYS = [
  'foreground', 'descriptionForeground', 'icon.foreground', 'focusBorder', 'contrastBorder', 'contrastActiveBorder', 'widget.shadow',
  'titleBar.activeBackground', 'titleBar.activeForeground', 'titleBar.border',
  'commandCenter.background', 'commandCenter.foreground', 'commandCenter.border',
  'activityBar.background', 'activityBar.foreground', 'activityBar.inactiveForeground', 'activityBar.border',
  'activityBar.activeBorder', 'activityBar.activeBackground', 'activityBarBadge.background', 'activityBarBadge.foreground',
  'sideBar.background', 'sideBar.foreground', 'sideBar.border', 'sideBarTitle.foreground',
  'sideBarSectionHeader.background', 'sideBarSectionHeader.foreground', 'sideBarSectionHeader.border',
  'list.inactiveSelectionBackground', 'list.inactiveSelectionForeground', 'list.hoverBackground', 'list.hoverForeground',
  'tree.indentGuidesStroke',
  'gitDecoration.modifiedResourceForeground', 'gitDecoration.untrackedResourceForeground',
  'gitDecoration.ignoredResourceForeground', 'gitDecoration.addedResourceForeground',
  'editorGroupHeader.tabsBackground', 'editorGroupHeader.tabsBorder', 'editorGroup.border',
  'tab.activeBackground', 'tab.activeForeground', 'tab.activeBorder', 'tab.activeBorderTop',
  'tab.inactiveBackground', 'tab.inactiveForeground', 'tab.border',
  'breadcrumb.background', 'breadcrumb.foreground',
  'editor.background', 'editor.foreground', 'editorLineNumber.foreground', 'editorLineNumber.activeForeground',
  'editor.lineHighlightBackground', 'editor.lineHighlightBorder', 'editor.selectionBackground',
  'editor.selectionHighlightBackground', 'editor.selectionHighlightBorder',
  'editor.wordHighlightBackground', 'editor.wordHighlightBorder',
  'editor.wordHighlightStrongBackground', 'editor.wordHighlightStrongBorder',
  'editorCursor.foreground', 'editorIndentGuide.background1', 'editorIndentGuide.activeBackground1',
  'editorGutter.background', 'editorGutter.modifiedBackground', 'editorGutter.addedBackground', 'editorGutter.deletedBackground',
  'scrollbarSlider.background', 'scrollbar.shadow', 'editorOverviewRuler.border',
  'editorOverviewRuler.modifiedForeground', 'editorOverviewRuler.addedForeground', 'editorOverviewRuler.deletedForeground',
  'minimap.background', 'minimapSlider.background',
  'panel.background', 'panel.border', 'panelTitle.activeForeground', 'panelTitle.activeBorder', 'panelTitle.inactiveForeground',
  'badge.background', 'badge.foreground',
  'terminal.background', 'terminal.foreground', 'terminalCursor.foreground',
  'terminal.ansiBlack', 'terminal.ansiRed', 'terminal.ansiGreen', 'terminal.ansiYellow',
  'terminal.ansiBlue', 'terminal.ansiMagenta', 'terminal.ansiCyan', 'terminal.ansiWhite',
  'terminal.ansiBrightBlack', 'terminal.ansiBrightRed', 'terminal.ansiBrightGreen', 'terminal.ansiBrightYellow',
  'terminal.ansiBrightBlue', 'terminal.ansiBrightMagenta', 'terminal.ansiBrightCyan', 'terminal.ansiBrightWhite',
  'statusBar.background', 'statusBar.foreground', 'statusBar.border',
  'statusBarItem.remoteBackground', 'statusBarItem.remoteForeground',
];
