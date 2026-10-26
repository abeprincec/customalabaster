#!/usr/bin/env node
// Roles Playground: serves the app, lists every theme it can find as a palette,
// and saves new themes into this extension. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from './lib/jsonc.js';
import { analyzeStructure, PUNCTUATION_SCOPES } from './lib/structure.js';
import { paletteFor } from './lib/derive.js';
import { loadDefaults } from './lib/vscode-colors.js';
import { resolveColors, defaultsClosure, themeTypeOf, WORKBENCH_KEYS } from './lib/workbench.js';

const PLAY = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(PLAY, '..');
const PORT = Number(process.env.PORT) || 7317;
const STRUCTURE_FILE = path.join(REPO, 'themes', 'Abraham-code-sandbox.json');
const SAMPLES_FILE = path.join(PLAY, 'data', 'samples.json');
const SAVED_FILE = path.join(PLAY, 'data', 'saved.json');
const DEFAULTS_FILE = path.join(PLAY, 'data', 'color-defaults.json');
const BUILTIN_ROOTS = [
  process.env.VSCODE_BUILTIN_EXTENSIONS,
  '/snap/code/current/usr/share/code/resources/app/extensions',
  '/usr/share/code/resources/app/extensions',
  '/opt/visual-studio-code/resources/app/extensions',
  '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions',
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'resources', 'app', 'extensions'),
].filter(Boolean);
const INSTALLED_ROOT = process.env.VSCODE_EXTENSIONS || path.join(os.homedir(), '.vscode', 'extensions');

const readJsonc = file => parseJsonc(fs.readFileSync(file, 'utf8'));
const readdir = dir => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** A theme file with its `include` chain resolved the way VS Code does it. */
function loadTheme(file, depth = 0) {
  if (depth > 10) throw new Error(`include loop at ${file}`);
  const data = readJsonc(file);
  const base = typeof data.include === 'string'
    ? loadTheme(path.resolve(path.dirname(file), data.include), depth + 1)
    : { colors: {}, tokenColors: [], semanticTokenColors: {} };
  let own = [];
  if (Array.isArray(data.tokenColors)) own = data.tokenColors;
  else if (typeof data.tokenColors === 'string' && /\.jsonc?$/i.test(data.tokenColors)) {
    const t = readJsonc(path.resolve(path.dirname(file), data.tokenColors));
    own = Array.isArray(t) ? t : t.tokenColors || [];
  }
  return {
    name: data.name ?? base.name,
    type: data.type ?? base.type,
    colors: { ...base.colors, ...(data.colors || {}) },
    tokenColors: [...base.tokenColors, ...own],
    semanticHighlighting: data.semanticHighlighting ?? base.semanticHighlighting,
    semanticTokenColors: { ...base.semanticTokenColors, ...(data.semanticTokenColors || {}) },
  };
}

function themesOf(dir, group, idPrefix) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return [];
  }
  let strings = {};
  try {
    strings = JSON.parse(fs.readFileSync(path.join(dir, 'package.nls.json'), 'utf8'));
  } catch { /* no translations */ }
  return (pkg.contributes?.themes || []).map(t => {
    let label = t.label || t.id || path.basename(t.path);
    const key = /^%(.+)%$/.exec(label);
    if (key) label = strings[key[1]] ?? label;
    const rel = t.path.replace(/^\.?\//, '');
    return {
      id: `${idPrefix}:${rel}`,
      label,
      group,
      uiTheme: t.uiTheme,
      file: path.join(dir, rel),
      extension: pkg.displayName && !/^%/.test(pkg.displayName) ? pkg.displayName : pkg.name,
    };
  });
}

const versionParts = v => v.split(/[.-]/).map(n => parseInt(n, 10) || 0);
function newer(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

function discoverThemes() {
  const list = themesOf(REPO, 'repo', 'repo');
  const newest = new Map();
  for (const name of readdir(INSTALLED_ROOT)) {
    const m = /^(.+?)-(\d+\.\d+\.\d+.*)$/.exec(name);
    if (!m) continue;
    const [, id, version] = m;
    if (id.toLowerCase() === 'abraham.customalabaster') continue; // this repo, listed above
    if (!newest.has(id) || newer(version, newest.get(id).version)) newest.set(id, { version, dir: path.join(INSTALLED_ROOT, name) });
  }
  for (const [id, { dir }] of [...newest].sort()) list.push(...themesOf(dir, 'installed', `ext:${id}`));
  const builtin = BUILTIN_ROOTS.find(d => fs.existsSync(d));
  if (builtin) {
    for (const name of readdir(builtin).filter(n => n.startsWith('theme-')).sort()) {
      list.push(...themesOf(path.join(builtin, name), 'builtin', `builtin:${name}`));
    }
  }
  return list;
}

function readSaved() {
  try {
    return JSON.parse(fs.readFileSync(SAVED_FILE, 'utf8'));
  } catch {
    return [];
  }
}

// VS Code's default interface colours, re-read when VS Code updates (checked once a minute).
let defaults = { at: 0, data: null };
function colorDefaults() {
  if (Date.now() - defaults.at > 60000) defaults = { at: Date.now(), data: loadDefaults(DEFAULTS_FILE) };
  return defaults.data?.colors || {};
}

function appState() {
  const structure = analyzeStructure(readJsonc(STRUCTURE_FILE));
  const vsDefaults = colorDefaults();
  let samples = null;
  try {
    samples = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
    samples.stale = samples.structureHash !== structure.hash;
  } catch { /* not captured yet */ }
  const themes = discoverThemes().map(t => {
    const entry = { id: t.id, label: t.label, group: t.group, extension: t.extension, uiTheme: t.uiTheme };
    try {
      const theme = loadTheme(t.file);
      theme.uiTheme = t.uiTheme;
      entry.palette = paletteFor(theme, structure);
      entry.uiType = themeTypeOf(t.uiTheme);
      entry.workbench = resolveColors(theme.colors, entry.uiType, vsDefaults, WORKBENCH_KEYS);
      entry.workbenchDefined = WORKBENCH_KEYS.filter(k => typeof theme.colors[k] === 'string' && theme.colors[k] !== 'default');
    } catch (e) {
      entry.error = String(e.message || e);
    }
    return entry;
  });
  return {
    structure: { ...structure, punctuationScopes: PUNCTUATION_SCOPES },
    samples,
    themes,
    saved: readSaved(),
    colorDefaults: defaultsClosure(vsDefaults, WORKBENCH_KEYS),
  };
}

function themeById(id) {
  return discoverThemes().find(t => t.id === id);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function save({ fileName, label, theme }) {
  if (typeof fileName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(fileName)) {
    throw new HttpError(400, 'The file name can only use letters, digits, dots, dashes and underscores, and must end in .json.');
  }
  if (typeof label !== 'string' || !label.trim()) throw new HttpError(400, 'The theme needs a name.');
  if (!theme || !Array.isArray(theme.tokenColors)) throw new HttpError(400, 'No theme to save.');
  label = label.trim();
  const rel = `themes/${fileName}`;
  const target = path.join(REPO, rel);
  const saved = readSaved();
  if (fs.existsSync(target) && !saved.includes(fileName)) {
    throw new HttpError(409, `${rel} already exists and wasn't made by the playground, so it won't be overwritten.`);
  }
  const pkgFile = path.join(REPO, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const themes = pkg.contributes.themes;
  const samePath = t => t.path.replace(/^\.?\//, '') === rel;
  const clash = themes.find(t => t.label === label && !samePath(t));
  if (clash) throw new HttpError(409, `"${label}" is already the name of ${clash.path}.`);

  fs.writeFileSync(target, JSON.stringify({ ...theme, name: label }, null, 2) + '\n');
  const uiTheme = theme.type === 'light' ? 'vs' : 'vs-dark';
  const existing = themes.find(samePath);
  if (existing) Object.assign(existing, { label, uiTheme });
  else themes.push({ label, uiTheme, path: `./${rel}` });
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  if (!saved.includes(fileName)) {
    saved.push(fileName);
    fs.mkdirSync(path.dirname(SAVED_FILE), { recursive: true });
    fs.writeFileSync(SAVED_FILE, JSON.stringify(saved, null, 2) + '\n');
  }
  return { ok: true, file: rel, label, added: !existing };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serveStatic(urlPath, res) {
  let rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  let root = path.join(PLAY, 'public');
  if (rel.startsWith('lib/')) {
    root = path.join(PLAY, 'lib');
    rel = rel.slice(4);
  }
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 10 * 1024 * 1024) reject(new HttpError(413, 'Too large'));
      else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, appState());
    if (req.method === 'GET' && url.pathname === '/api/theme') {
      const t = themeById(url.searchParams.get('id'));
      if (!t) throw new HttpError(404, 'Unknown theme');
      return json(res, 200, { ...loadTheme(t.file), label: t.label, uiTheme: t.uiTheme });
    }
    if (req.method === 'POST' && url.pathname === '/api/save') return json(res, 200, save(await readBody(req)));
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    throw new HttpError(405, 'Method not allowed');
  } catch (e) {
    json(res, e.status || 500, { error: e.message || String(e) });
  }
});

// Use the next port when the default one is taken, unless PORT was set explicitly.
let port = PORT;
server.on('error', e => {
  if (e.code === 'EADDRINUSE' && !process.env.PORT && port < PORT + 20) {
    server.listen(++port, '127.0.0.1');
  } else {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use; set PORT to another one.` : e);
    process.exit(1);
  }
});
server.on('listening', () => console.log(`Roles Playground: http://127.0.0.1:${port}`));
server.listen(port, '127.0.0.1');
