// Turn any VS Code theme into a palette for the shared roles.
// Themes that use the structure's own rules are read exactly; for any other theme each
// role takes the colour that theme gives a typical token of that role.
import { compileTheme, styleFor } from './textmate.js';
import { normalizeHex, isDarkColor } from './color.js';
import { extractPalette, editorDefaults, uiFromColors, roleColor, semanticForeground } from './structure.js';

// Representative TextMate scope paths for each role, tried in order.
const PROBES = {
  keyword: [['source.tsx', 'keyword.control.flow.tsx'], ['source.tsx', 'storage.type.tsx']],
  function: [
    ['source.tsx', 'meta.function-call.tsx', 'entity.name.function.tsx'],
    ['source.tsx', 'meta.function.tsx', 'meta.definition.function.tsx', 'entity.name.function.tsx'],
  ],
  type: [
    ['source.tsx', 'meta.class.tsx', 'entity.name.type.class.tsx'],
    ['source.tsx', 'meta.interface.tsx', 'entity.name.type.interface.tsx'],
  ],
  builtin: [['source.tsx', 'meta.type.annotation.tsx', 'support.type.primitive.tsx']],
  constant: [['source.tsx', 'constant.numeric.decimal.tsx']],
  string: [['source.tsx', 'string.quoted.double.tsx']],
  tag: [
    ['source.tsx', 'meta.tag.tsx', 'entity.name.tag.tsx'],
    ['text.html.basic', 'meta.tag.structure.div.start.html', 'entity.name.tag.html'],
  ],
  embedded: [[
    'source.tsx', 'string.template.tsx', 'meta.template.expression.tsx',
    'punctuation.definition.template-expression.begin.tsx',
  ]],
  comment: [['source.tsx', 'comment.line.double-slash.tsx']],
};

// Semantic token types to fall back on for themes that colour mostly through semantic rules.
const SEMANTIC_FALLBACK = {
  keyword: ['keyword'],
  function: ['function', 'method'],
  type: ['class', 'type', 'interface'],
  builtin: ['type.defaultLibrary', 'class.defaultLibrary', 'namespace'],
  constant: ['number', 'enumMember', 'variable.readonly'],
  string: ['string'],
  comment: ['comment'],
};

export function themeIsDark(theme) {
  const t = String(theme.type || theme.uiTheme || '').toLowerCase();
  if (t === 'light' || t === 'vs' || t === 'hc-light' || t === 'hclight') return false;
  if (t === 'dark' || t === 'vs-dark' || t === 'hc-black' || t === 'hc' || t === 'hcdark') return true;
  const bg = theme.colors?.['editor.background'];
  return bg ? isDarkColor(bg) : true;
}

function semanticColor(theme, keys) {
  for (const key of keys || []) {
    const color = normalizeHex(semanticForeground(theme.semanticTokenColors?.[key]));
    if (color) return color;
  }
  return null;
}

export function derivePalette(theme) {
  const colors = theme.colors || {};
  const dark = themeIsDark(theme);
  const defaults = editorDefaults(dark);
  const fg = normalizeHex(colors['editor.foreground']) ?? defaults.foreground;
  const compiled = compileTheme(theme.tokenColors, { foreground: fg, fontStyle: 0 });
  const probe = paths => {
    for (const scopes of paths) {
      const style = styleFor(compiled, scopes);
      if (style.foreground !== fg) return style;
    }
    return null;
  };
  const probeColor = (...scopes) => probe([scopes])?.foreground ?? null;

  const roles = { plain: fg };
  let commentItalic = false;
  for (const role of Object.keys(PROBES)) {
    const style = probe(PROBES[role]);
    roles[role] = style?.foreground ?? semanticColor(theme, SEMANTIC_FALLBACK[role]) ?? fg;
    if (role === 'comment') commentItalic = !!(style && style.fontStyle & 1);
  }
  const status = (scopes, key, fallback) => probeColor(...scopes) ?? normalizeHex(colors[key]) ?? fallback;
  Object.assign(roles, {
    diffInserted: status(['source.diff', 'markup.inserted.diff'], 'gitDecoration.addedResourceForeground', dark ? '#81b88b' : '#587c0c'),
    diffDeleted: status(['source.diff', 'markup.deleted.diff'], 'gitDecoration.deletedResourceForeground', dark ? '#c74e39' : '#ad0707'),
    diffChanged: status(['source.diff', 'markup.changed.diff'], 'gitDecoration.modifiedResourceForeground', dark ? '#e2c08d' : '#895503'),
    logError: status(['text.log', 'token.error-token'], 'editorError.foreground', dark ? '#f44747' : '#cd3131'),
    logWarning: status(['text.log', 'token.warn-token'], 'editorWarning.foreground', '#cd9731'),
    logInfo: status(['text.log', 'token.info-token'], 'editorInfo.foreground', dark ? '#6796e6' : '#316bcd'),
    logDebug: status(['text.log', 'token.debug-token'], 'nonexistent', dark ? '#b267e6' : '#800080'),
  });
  // Themes often draw invalid code white on a red background; the error colour reads better as text.
  const invalid = normalizeHex(colors['editorError.foreground']) ?? probeColor('source.tsx', 'invalid.illegal.tsx');
  if (invalid && invalid !== roleColor({ roles }, 'tag')) roles.invalid = invalid;

  return { type: dark ? 'dark' : 'light', ui: uiFromColors(colors, dark), roles, commentItalic, source: 'derived' };
}

/** Exact palette for themes built on the structure's rules, derived palette for everything else. */
export function paletteFor(theme, structure) {
  return extractPalette(theme, structure, themeIsDark(theme)) ?? derivePalette(theme);
}
