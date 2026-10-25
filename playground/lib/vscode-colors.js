// VS Code's default colours, read from the workbench bundle of the VS Code you have
// installed (its registerColor calls), cached per VS Code version. Node only.
import fs from 'node:fs';
import path from 'node:path';

const APP_DIRS = [
  process.env.VSCODE_APP,
  '/snap/code/current/usr/share/code/resources/app',
  '/usr/share/code/resources/app',
  '/opt/visual-studio-code/resources/app',
  '/Applications/Visual Studio Code.app/Contents/Resources/app',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'resources', 'app'),
].filter(Boolean);
const BUNDLE = 'out/vs/workbench/workbench.desktop.main.js';

export function findVSCodeApp() {
  return APP_DIRS.find(dir => fs.existsSync(path.join(dir, BUNDLE)) && fs.existsSync(path.join(dir, 'product.json')));
}

// ---- a tiny parser for the expressions passed to registerColor ---------------------------

function parseExpression(src, start) {
  let i = start;
  const ws = () => { while (/\s/.test(src[i])) i++; };
  const ident = () => {
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
    if (!m) throw new Error(`identifier expected at ${i}`);
    i += m[0].length;
    return m[0];
  };
  const string = () => {
    const quote = src[i++];
    let out = '';
    while (src[i] !== quote) {
      if (src[i] === '\\') i++;
      out += src[i++];
    }
    i++;
    return out;
  };
  const args = () => {
    const list = [];
    i++; // (
    ws();
    while (src[i] !== ')') {
      list.push(expr());
      ws();
      if (src[i] === ',') i++;
      ws();
    }
    i++;
    return list;
  };
  const primary = () => {
    ws();
    const c = src[i];
    if (c === '"' || c === "'") return { t: 'str', v: string() };
    if (/[\d.]/.test(c) || (c === '-' && /[\d.]/.test(src[i + 1]))) {
      const m = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i, i + 40));
      i += m[0].length;
      return { t: 'num', v: Number(m[0]) };
    }
    if (c === '{') {
      i++;
      const props = {};
      ws();
      while (src[i] !== '}') {
        const key = src[i] === '"' || src[i] === "'" ? string() : ident();
        ws();
        i++; // :
        props[key] = expr();
        ws();
        if (src[i] === ',') i++;
        ws();
      }
      i++;
      return { t: 'obj', props };
    }
    if (c === '(') {
      i++;
      const e = expr();
      ws();
      i++;
      return e;
    }
    if (c === '!') {
      i++;
      return { t: 'num', v: primary().v ? 0 : 1 };
    }
    const name = ident();
    if (name === 'null' || name === 'undefined') return { t: 'null' };
    if (name === 'new') {
      ws();
      const callee = postfix({ t: 'id', v: ident() }, true);
      return { t: 'new', callee: callee.callee ?? callee, args: callee.args ?? [] };
    }
    return { t: 'id', v: name };
  };
  const postfix = (node, stopAfterCall = false) => {
    for (;;) {
      ws();
      if (src[i] === '.') {
        i++;
        node = { t: 'member', obj: node, prop: ident() };
      } else if (src[i] === '(') {
        node = { t: 'call', callee: node, args: args() };
        if (stopAfterCall) return node;
      } else {
        return node;
      }
    }
  };
  const expr = () => postfix(primary());
  const node = expr();
  return { node, end: i };
}

const NAMED = { white: '#ffffff', black: '#000000', transparent: '#00000000', red: '#ff0000', blue: '#0000ff', green: '#00ff00', cyan: '#00ffff', lightgrey: '#d3d3d3' };
const OPS = { 0: 'darken', 1: 'lighten', 2: 'transparent', 3: 'opaque', 4: 'oneOf', 5: 'lessProminent', 6: 'ifDefined' };
const hex2 = v => Math.round(v).toString(16).padStart(2, '0');

function makeConverter(ctx, warnings) {
  const convert = node => {
    switch (node.t) {
      case 'null': return null;
      case 'str': return node.v.startsWith('#') ? { hex: node.v.toLowerCase() } : { ref: node.v };
      case 'id':
        if (ctx.vars.has(node.v)) return { ref: ctx.vars.get(node.v) };
        break;
      case 'member':
        if (node.obj.t === 'id' && node.obj.v === ctx.colorClass && NAMED[node.prop]) return { hex: NAMED[node.prop] };
        break;
      case 'new':
        // new Color(new RGBA(r, g, b, a))
        if (node.args[0]?.t === 'new') {
          const [r, g, b, a = { v: 1 }] = node.args[0].args;
          return { hex: '#' + hex2(r.v) + hex2(g.v) + hex2(b.v) + (a.v < 1 ? hex2(a.v * 255) : '') };
        }
        break;
      case 'call': {
        const { callee, args } = node;
        if (callee.t === 'member' && callee.obj.t === 'id' && callee.obj.v === ctx.colorClass && callee.prop === 'fromHex') {
          return { hex: args[0].v.toLowerCase() };
        }
        if (callee.t === 'member' && ['transparent', 'darken', 'lighten'].includes(callee.prop)) {
          return { op: callee.prop, value: convert(callee.obj), factor: args[0].v };
        }
        if (callee.t === 'id' && ctx.transforms.has(callee.v)) {
          const op = ctx.transforms.get(callee.v);
          if (op === 'oneOf') return { op, values: args.map(convert) };
          if (op === 'ifDefined') return { op, if: convert(args[0])?.ref, then: convert(args[1]), else: convert(args[2]) };
          if (op === 'opaque') return { op, value: convert(args[0]), background: convert(args[1]) };
          if (op === 'lessProminent') {
            return { op, value: convert(args[0]), background: convert(args[1]), factor: args[2].v, transparency: args[3].v };
          }
          return { op, value: convert(args[0]), factor: args[1].v };
        }
        break;
      }
      default:
        break;
    }
    warnings.push(JSON.stringify(node).slice(0, 120));
    return null;
  };
  const top = node => {
    // A transform written inline: { op: 7, color, with, ratio } is a mix.
    if (node.t === 'obj' && node.props.op?.v === 7) {
      return { op: 'mix', color: convert(node.props.color), with: convert(node.props.with), ratio: node.props.ratio.v };
    }
    return convert(node);
  };
  return node => {
    if (node.t === 'obj' && ['dark', 'light', 'hcDark', 'hcLight'].some(k => k in node.props)) {
      return { byType: Object.fromEntries(['dark', 'light', 'hcDark', 'hcLight'].map(k => [k, node.props[k] ? top(node.props[k]) : null])) };
    }
    return { all: top(node) };
  };
}

/** Every registerColor default in the bundle, as { id: { all } | { byType: { dark, light, hcDark, hcLight } } }. */
export function extractDefaults(src) {
  const register = /([\w$]+)\("editor\.background",/.exec(src)?.[1];
  if (!register) throw new Error("couldn't find registerColor in the VS Code bundle");
  const classCounts = {};
  for (const m of src.matchAll(/([\w$]+)\.fromHex\(/g)) classCounts[m[1]] = (classCounts[m[1]] || 0) + 1;
  const colorClass = Object.entries(classCounts).sort((a, b) => b[1] - a[1])[0][0];
  const transforms = new Map();
  for (const m of src.matchAll(/function ([\w$]+)\([^)]*\)\{return\{op:(\d),/g)) transforms.set(m[1], OPS[m[2]]);

  const callRe = new RegExp(`(?:([\\w$]+)=)?(?<![\\w$.])${register.replace(/\$/g, '\\$')}\\("([a-zA-Z][\\w-]*(?:\\.[\\w-]+)*)",`, 'g');
  const calls = [];
  const vars = new Map();
  for (const m of src.matchAll(callRe)) {
    calls.push({ id: m[2], at: m.index + m[0].length });
    if (m[1]) vars.set(m[1], m[2]);
  }
  const warnings = [];
  const convert = makeConverter({ vars, colorClass, transforms }, warnings);
  const colors = {};
  for (const { id, at } of calls) {
    if (id in colors) continue;
    try {
      colors[id] = convert(parseExpression(src, at).node);
    } catch (e) {
      warnings.push(`${id}: ${e.message}`);
    }
  }
  // Terminal ANSI colours are registered in a loop from a map of defaults.
  for (const m of src.matchAll(/"(terminal\.ansi\w+)":\{index:\d+,defaults:/g)) {
    colors[m[1]] = convert(parseExpression(src, m.index + m[0].length).node);
  }
  return { colors, warnings };
}

/** Colours contributed by VS Code's built-in extensions (git decorations and others). */
export function extensionDefaults(appDir) {
  const colors = {};
  const root = path.join(appDir, 'extensions');
  const value = v => (typeof v !== 'string' || !v ? null : v.startsWith('#') ? { hex: v.toLowerCase() } : { ref: v });
  for (const name of fs.readdirSync(root)) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const c of pkg.contributes?.colors || []) {
      const d = c.defaults || {};
      colors[c.id] = {
        byType: {
          dark: value(d.dark),
          light: value(d.light),
          hcDark: value(d.highContrast),
          hcLight: value(d.highContrastLight ?? d.light),
        },
      };
    }
  }
  return colors;
}

/** Defaults for the installed VS Code, cached in `cacheFile` until VS Code's version changes. */
export function loadDefaults(cacheFile) {
  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch { /* no cache */ }
  const app = findVSCodeApp();
  if (!app) return cached; // no VS Code here: use whatever was cached
  const version = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8')).version;
  if (cached?.version === version) return cached;
  const { colors, warnings } = extractDefaults(fs.readFileSync(path.join(app, BUNDLE), 'utf8'));
  const data = { version, colors: { ...extensionDefaults(app), ...colors }, warnings: warnings.slice(0, 50) };
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data) + '\n');
  return data;
}
