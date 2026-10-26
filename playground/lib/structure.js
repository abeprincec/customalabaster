// The shared syntax roles: Codesandbox's token rules (VS Code's Dark+ rule set),
// grouped by the role each rule plays. A palette only picks a colour per role.
import { normalizeHex } from './color.js';

export const ROLES = [
  // Main roles: the colours a palette really chooses.
  { id: 'plain', label: 'Plain', hint: 'Variables, parameters, properties, object keys', group: 'main' },
  { id: 'keyword', label: 'Keywords', hint: 'if, return, const, function, this, true, null', group: 'main' },
  { id: 'function', label: 'Functions', hint: 'Function and method names, where declared and called', group: 'main' },
  { id: 'type', label: 'Types', hint: 'Classes, interfaces, type names, JSX components', group: 'main' },
  { id: 'builtin', label: 'Built-ins', hint: 'string, number, Map, namespaces, operators, regex', group: 'main' },
  { id: 'constant', label: 'Constants', hint: 'Numbers, const variables, enum members, attributes', group: 'main' },
  { id: 'string', label: 'Strings', hint: 'Strings, CSS values, inline code', group: 'main' },
  { id: 'tag', label: 'Tags', hint: 'HTML and JSX tags, JSON keys', group: 'main' },
  { id: 'embedded', label: 'Embedded', hint: '${ } in template strings, { } in JSX', group: 'main' },
  { id: 'comment', label: 'Comments', hint: 'Comments, Markdown quotes', group: 'main' },
  // Details follow a main role unless a palette gives them their own colour.
  { id: 'constVariable', label: 'Const variables & enum members', parent: 'constant', group: 'detail' },
  { id: 'attribute', label: 'Attributes & CSS selectors', parent: 'constant', group: 'detail' },
  { id: 'operator', label: 'Operators  = + && =>', parent: 'builtin', group: 'detail' },
  { id: 'jsonKey', label: 'JSON keys', parent: 'tag', group: 'detail' },
  { id: 'tagPunctuation', label: 'Tag brackets  < / >', parent: 'plain', group: 'detail' },
  { id: 'punctuation', label: 'Code punctuation  , ; ( ) { }', parent: 'plain', group: 'detail' },
  { id: 'defaultText', label: 'Unscoped text (editor.foreground)', parent: 'plain', group: 'detail' },
  { id: 'label', label: 'Labels', parent: 'plain', group: 'detail' },
  { id: 'invalid', label: 'Invalid code', parent: 'tag', group: 'detail' },
  { id: 'regexClass', label: 'Regex classes  \\d \\w', parent: 'tag', group: 'detail' },
  // Status colours used by diffs and log files.
  { id: 'diffInserted', label: 'Diff inserted', group: 'status' },
  { id: 'diffDeleted', label: 'Diff deleted', group: 'status' },
  { id: 'diffChanged', label: 'Diff changed', group: 'status' },
  { id: 'logError', label: 'Log error', group: 'status' },
  { id: 'logWarning', label: 'Log warning', group: 'status' },
  { id: 'logInfo', label: 'Log info', group: 'status' },
  { id: 'logDebug', label: 'Log debug', group: 'status' },
];

export const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));

// Each main role takes its colour from one anchor rule; every rule with that colour plays the role.
const ANCHORS = {
  plain: 'variable',
  keyword: 'keyword',
  function: 'entity.name.function',
  type: 'entity.name.class',
  builtin: 'support.type',
  constant: 'constant.numeric',
  string: 'string',
  tag: 'entity.name.tag',
  embedded: 'punctuation.definition.template-expression.begin',
  comment: 'comment',
};

// Rules that play a detail or status role, keyed by their first scope.
const RULE_ROLES = {
  'variable.other.constant': 'constVariable',
  'constant.other.caps.python': 'constVariable',
  'entity.other.attribute-name': 'attribute',
  'entity.other.attribute-name.class.css': 'attribute',
  'keyword.operator': 'operator',
  'support.type.property-name.json': 'jsonKey',
  'punctuation.definition.tag': 'tagPunctuation',
  'entity.name.label': 'label',
  invalid: 'invalid',
  'constant.character.character-class.regexp': 'regexClass',
  'markup.inserted': 'diffInserted',
  'markup.deleted': 'diffDeleted',
  'markup.changed': 'diffChanged',
  'log.error': 'logError',
  'token.error-token': 'logError',
  'log.warning': 'logWarning',
  'token.warn-token': 'logWarning',
  'log.info': 'logInfo',
  'token.info-token': 'logInfo',
  'log.debug': 'logDebug',
  'token.debug-token': 'logDebug',
};

// Code punctuation that a palette may colour on its own (Solarized keeps it gray).
// A targeted list on purpose: a broad `punctuation` selector would also recolour
// string quotes, diff markers and Markdown bullets that inherit their parent's colour.
export const PUNCTUATION_SCOPES = [
  'punctuation.separator', 'punctuation.terminator', 'punctuation.accessor', 'meta.brace',
  'punctuation.definition.block', 'punctuation.definition.parameters', 'punctuation.definition.typeparameters',
  'punctuation.definition.arguments', 'punctuation.definition.dictionary', 'punctuation.definition.array',
  'punctuation.section.block', 'punctuation.section.function', 'punctuation.section.parens',
  'punctuation.section.brackets', 'punctuation.section.braces', 'punctuation.parenthesis', 'punctuation.bracket',
  'punctuation.definition.binding-pattern', 'punctuation.definition.method-parameters',
  'punctuation.definition.template-expression', 'punctuation.curlybrace', 'punctuation.squarebracket',
  'punctuation.section.property-list', 'punctuation.semi', 'punctuation.brackets', 'punctuation.comma',
  'punctuation.definition.entity', 'punctuation.other', 'punctuation.definition.begin.bracket',
  'punctuation.definition.end.bracket', 'punctuation.definition.list.begin.python',
  'punctuation.definition.list.end.python', 'punctuation.definition.dict',
];

export function scopeList(scope) {
  if (Array.isArray(scope)) return scope.map(s => String(s).trim());
  if (typeof scope === 'string') return scope.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

export const firstScope = rule => scopeList(rule.scope)[0] ?? '';

const scopeKey = scope => JSON.stringify(scopeList(scope));

export function semanticForeground(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' ? value.foreground : undefined;
}

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Read the role of every rule in the structure theme (Codesandbox). */
export function analyzeStructure(theme) {
  const tokenColors = (theme.tokenColors || []).filter(r => r && r.scope && r.settings);
  const anchorColor = {};
  for (const [role, scope] of Object.entries(ANCHORS)) {
    const rule = tokenColors.find(r => firstScope(r) === scope && r.settings.foreground);
    if (rule) anchorColor[role] = normalizeHex(rule.settings.foreground);
  }
  const roleOfColor = new Map(Object.entries(anchorColor).map(([role, color]) => [color, role]));
  const warnings = [];
  const ruleRoles = tokenColors.map((rule, i) => {
    if (!rule.settings.foreground) return null;
    const role = RULE_ROLES[firstScope(rule)] ?? roleOfColor.get(normalizeHex(rule.settings.foreground));
    if (role) return role;
    warnings.push(`Rule ${i} (${firstScope(rule)}) uses ${rule.settings.foreground}, which isn't a role colour, so it is treated as Plain.`);
    return 'plain';
  });
  const semanticTokenColors = theme.semanticTokenColors || {};
  const semanticKeys = Object.keys(semanticTokenColors);
  const semanticRoles = {};
  for (const key of semanticKeys) {
    semanticRoles[key] = roleOfColor.get(normalizeHex(semanticForeground(semanticTokenColors[key]))) ?? 'plain';
  }
  const iconRoles = {};
  for (const [key, value] of Object.entries(theme.colors || {})) {
    if (!key.startsWith('symbolIcon.')) continue;
    const role = roleOfColor.get(normalizeHex(value));
    if (role) iconRoles[key] = role;
  }
  const shape = tokenColors.map(r => [scopeList(r.scope), r.settings.fontStyle ?? null, !!r.settings.foreground]);
  return {
    tokenColors,
    semanticTokenColors,
    semanticKeys,
    ruleRoles,
    semanticRoles,
    iconRoles,
    anchorColor,
    warnings,
    hash: hash(JSON.stringify([shape, semanticKeys])),
  };
}

/** The colour a palette gives a role, following detail roles up to their main role. */
export function roleColor(palette, id) {
  let role = ROLE_BY_ID[id];
  while (role) {
    const color = palette.roles[role.id];
    if (color) return color;
    role = role.parent ? ROLE_BY_ID[role.parent] : null;
  }
  return palette.roles.plain || '#cccccc';
}

/** The role whose colour `id` ends up using. */
export function sourceRole(palette, id) {
  let role = ROLE_BY_ID[id];
  while (role) {
    if (palette.roles[role.id]) return role.id;
    role = role.parent ? ROLE_BY_ID[role.parent] : null;
  }
  return 'plain';
}

/** tokenColors and semanticTokenColors for a palette: the structure's rules, recoloured role by role. */
export function buildSyntax(structure, palette) {
  const tokenColors = structure.tokenColors.map((rule, i) => {
    const role = structure.ruleRoles[i];
    const settings = { ...rule.settings };
    if (role) settings.foreground = roleColor(palette, role);
    if (firstScope(rule) === 'comment' && palette.commentItalic) settings.fontStyle = 'italic';
    return { ...(rule.name ? { name: rule.name } : {}), scope: rule.scope, settings };
  });
  if (palette.roles.punctuation) {
    tokenColors.push({
      name: 'Code punctuation',
      scope: PUNCTUATION_SCOPES,
      settings: { foreground: palette.roles.punctuation },
    });
  }
  const semanticTokenColors = {};
  for (const key of structure.semanticKeys) {
    const value = structure.semanticTokenColors[key];
    const color = roleColor(palette, structure.semanticRoles[key]);
    semanticTokenColors[key] = typeof value === 'string' ? color : { ...value, foreground: color };
  }
  return { tokenColors, semanticTokenColors };
}

/** Symbol icon colours that follow the code colours, like Codesandbox's. */
export function buildIconColors(structure, palette) {
  return Object.fromEntries(Object.entries(structure.iconRoles).map(([key, role]) => [key, roleColor(palette, role)]));
}

const DARK_DEFAULTS = { background: '#1e1e1e', foreground: '#bbbbbb', lineNumber: '#858585', lineNumberActive: '#c6c6c6' };
const LIGHT_DEFAULTS = { background: '#ffffff', foreground: '#333333', lineNumber: '#237893', lineNumberActive: '#0b216f' };

export function editorDefaults(dark) {
  return dark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
}

export function uiFromColors(colors, dark) {
  const d = editorDefaults(dark);
  return {
    background: normalizeHex(colors['editor.background']) ?? d.background,
    lineNumber: normalizeHex(colors['editorLineNumber.foreground']) ?? d.lineNumber,
    lineNumberActive: normalizeHex(colors['editorLineNumber.activeForeground']) ?? d.lineNumberActive,
  };
}

/**
 * Read a palette straight from a theme that uses the structure's rules (Codesandbox,
 * its variants, Pierre 2, Solarized). Returns null for themes with other rules.
 */
export function extractPalette(theme, structure, dark) {
  const rules = (theme.tokenColors || []).filter(r => r && r.scope && r.settings);
  const byScope = new Map();
  for (const rule of rules) {
    const key = scopeKey(rule.scope);
    if (!byScope.has(key)) byScope.set(key, rule);
  }
  const matched = structure.tokenColors.map(r => byScope.get(scopeKey(r.scope)));
  if (matched.filter(Boolean).length < structure.tokenColors.length * 0.9) return null;

  const votes = {};
  const vote = (role, color) => {
    const c = normalizeHex(color);
    if (!role || !c) return;
    votes[role] ??= new Map();
    votes[role].set(c, (votes[role].get(c) || 0) + 1);
  };
  structure.tokenColors.forEach((_, i) => vote(structure.ruleRoles[i], matched[i]?.settings?.foreground));
  for (const [key, role] of Object.entries(structure.semanticRoles)) {
    vote(role, semanticForeground(theme.semanticTokenColors?.[key]));
  }
  const top = role => (votes[role] ? [...votes[role].entries()].sort((a, b) => b[1] - a[1])[0][0] : null);

  const colors = theme.colors || {};
  const roles = {};
  for (const role of ROLES) {
    if (role.group !== 'detail') roles[role.id] = top(role.id) ?? structure.anchorColor[role.id] ?? null;
  }
  const punctuationRule = rules.find(r => scopeKey(r.scope) === scopeKey(PUNCTUATION_SCOPES));
  const details = {
    defaultText: normalizeHex(colors['editor.foreground']),
    punctuation: normalizeHex(punctuationRule?.settings?.foreground),
  };
  for (const role of ROLES) {
    if (role.group !== 'detail') continue;
    const color = role.id in details ? details[role.id] : top(role.id);
    if (color && color !== roleColor({ roles }, role.parent)) roles[role.id] = color;
  }
  for (const id of Object.keys(roles)) if (!roles[id]) delete roles[id];

  const commentRule = matched[structure.tokenColors.findIndex(r => firstScope(r) === 'comment')];
  const palette = {
    type: dark ? 'dark' : 'light',
    ui: uiFromColors(colors, dark),
    roles,
    commentItalic: /italic/.test(commentRule?.settings?.fontStyle || ''),
    source: 'exact',
  };
  // Count rules whose colour the role model can't reproduce.
  const rebuilt = buildSyntax(structure, palette).tokenColors;
  palette.mismatches = matched.filter((rule, i) =>
    rule && normalizeHex(rule.settings.foreground) !== normalizeHex(rebuilt[i].settings.foreground)).length;
  return palette;
}
