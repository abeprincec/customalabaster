// How VS Code colours a TextMate scope path with a theme's tokenColors.
// A port of vscode-textmate's theme trie: most specific selector wins, and
// inner scopes override outer ones one attribute at a time.

import { normalizeHex } from './color.js';

const NOT_SET = -1;

function parseFontStyle(value) {
  if (typeof value !== 'string') return NOT_SET;
  let style = 0;
  for (const part of value.split(' ')) {
    if (part === 'italic') style |= 1;
    else if (part === 'bold') style |= 2;
    else if (part === 'underline') style |= 4;
    else if (part === 'strikethrough') style |= 8;
  }
  return style;
}

const strcmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function arrcmp(a, b) {
  if (a === b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const r = strcmp(a[i], b[i]);
    if (r) return r;
  }
  return 0;
}

class Rule {
  constructor(depth, parents, fontStyle, foreground) {
    this.depth = depth;
    this.parents = parents;
    this.fontStyle = fontStyle;
    this.foreground = foreground;
  }
  clone() {
    return new Rule(this.depth, this.parents, this.fontStyle, this.foreground);
  }
  overwrite(depth, fontStyle, foreground) {
    if (this.depth <= depth) this.depth = depth;
    if (fontStyle !== NOT_SET) this.fontStyle = fontStyle;
    if (foreground) this.foreground = foreground;
  }
}

function bySpecificity(a, b) {
  if (a.depth !== b.depth) return b.depth - a.depth;
  const pa = a.parents;
  const pb = b.parents;
  for (let i = 0; i < pa.length && i < pb.length; i++) {
    const diff = pb[i].length - pa[i].length;
    if (diff) return diff;
  }
  return pb.length - pa.length;
}

class Node {
  constructor(main, withParents) {
    this.main = main;
    this.withParents = withParents;
    this.children = new Map();
  }
  insert(depth, scope, parents, fontStyle, foreground) {
    if (scope === '') {
      this.insertHere(depth, parents, fontStyle, foreground);
      return;
    }
    const dot = scope.indexOf('.');
    const head = dot < 0 ? scope : scope.slice(0, dot);
    const tail = dot < 0 ? '' : scope.slice(dot + 1);
    let child = this.children.get(head);
    if (!child) {
      child = new Node(this.main.clone(), this.withParents.map(r => r.clone()));
      this.children.set(head, child);
    }
    child.insert(depth + 1, tail, parents, fontStyle, foreground);
  }
  insertHere(depth, parents, fontStyle, foreground) {
    if (!parents.length) {
      this.main.overwrite(depth, fontStyle, foreground);
      return;
    }
    for (const rule of this.withParents) {
      if (arrcmp(rule.parents, parents) === 0) {
        rule.overwrite(depth, fontStyle, foreground);
        return;
      }
    }
    this.withParents.push(new Rule(
      depth,
      parents,
      fontStyle === NOT_SET ? this.main.fontStyle : fontStyle,
      foreground || this.main.foreground,
    ));
  }
  match(scope) {
    if (scope !== '') {
      const dot = scope.indexOf('.');
      const head = dot < 0 ? scope : scope.slice(0, dot);
      const child = this.children.get(head);
      if (child) return child.match(dot < 0 ? '' : scope.slice(dot + 1));
    }
    return [...this.withParents, this.main].sort(bySpecificity);
  }
}

/**
 * Compile tokenColors the way VS Code does: rules without a scope are dropped
 * (the editor foreground is the default instead).
 */
export function compileTheme(tokenColors, defaults) {
  const parsed = [];
  (tokenColors || []).forEach((rule, index) => {
    if (!rule || !rule.scope || !rule.settings) return;
    const scopes = typeof rule.scope === 'string'
      ? rule.scope.replace(/^,+|,+$/g, '').split(',')
      : Array.isArray(rule.scope) ? rule.scope : [];
    const fontStyle = parseFontStyle(rule.settings.fontStyle);
    const foreground = normalizeHex(rule.settings.foreground);
    for (const selector of scopes) {
      const segments = String(selector).trim().split(' ').filter(Boolean);
      if (!segments.length) continue;
      parsed.push({
        scope: segments[segments.length - 1],
        parents: segments.slice(0, -1).reverse(),
        index,
        fontStyle,
        foreground,
      });
    }
  });
  parsed.sort((a, b) => strcmp(a.scope, b.scope) || arrcmp(a.parents, b.parents) || a.index - b.index);
  const root = new Node(new Rule(0, [], NOT_SET, null), []);
  for (const r of parsed) root.insert(0, r.scope, r.parents, r.fontStyle, r.foreground);
  return { root, defaults: { foreground: defaults.foreground, fontStyle: defaults.fontStyle ?? 0 } };
}

const matchesScope = (scope, selector) =>
  scope === selector || (scope.startsWith(selector) && scope[selector.length] === '.');

function parentsMatch(scopes, from, parents) {
  if (!parents.length) return true;
  let index = 0;
  for (let i = from; i >= 0; i--) {
    if (parents[index] === '>') index++;
    if (matchesScope(scopes[i], parents[index])) {
      index++;
      if (index === parents.length) return true;
    }
  }
  return false;
}

/** Foreground and font style (bit mask: 1 italic, 2 bold, 4 underline, 8 strikethrough) for a scope path, outermost first. */
export function styleFor(compiled, scopes) {
  let { foreground, fontStyle } = compiled.defaults;
  scopes.forEach((scope, i) => {
    const rule = compiled.root.match(scope).find(r => parentsMatch(scopes, i - 1, r.parents));
    if (!rule) return;
    if (rule.fontStyle !== NOT_SET) fontStyle = rule.fontStyle;
    if (rule.foreground) foreground = rule.foreground;
  });
  return { foreground, fontStyle };
}
