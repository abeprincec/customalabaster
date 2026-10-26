#!/usr/bin/env node
// Records how VS Code colours the sample files under the shared roles.
//
// It opens the samples in a headless VS Code with two probe themes. The probes are
// Codesandbox's rules with a unique colour per rule, so the colour of every token
// tells which rule (or semantic rule) won. Semantic highlighting is included.
//
//   node tools/capture.mjs            capture into data/samples.json
//   node tools/capture.mjs --verify   also render the repo's structure themes and
//                                     check the playground predicts every colour
//   --plain   don't load your Python/tsgo extensions   --keep   keep the temp folder
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../lib/jsonc.js';
import { analyzeStructure, PUNCTUATION_SCOPES, firstScope } from '../lib/structure.js';
import { paletteFor } from '../lib/derive.js';
import { FLAG_COMMENT, FLAG_PUNCTUATION, tokenColor, tokenStyle } from '../lib/samples.js';

const PLAY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PLAY, '..');
const SAMPLES_DIR = path.join(PLAY, 'samples');
const OUT = path.join(PLAY, 'data', 'samples.json');
const SAMPLES = [
  'Dashboard.tsx', 'cache.ts', 'app.py', 'styles.css', 'index.html',
  'package.json', 'README.md', 'deploy.yml', 'deploy.sh',
];
const SEMANTIC_FILES = /\.(tsx?|py)$/;
const args = new Set(process.argv.slice(2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...m) => console.log('[capture]', ...m);

function findCode() {
  const candidates = [
    process.env.VSCODE_BIN,
    '/snap/code/current/usr/share/code/bin/code',
    '/usr/share/code/bin/code',
    '/opt/visual-studio-code/bin/code',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
  ].filter(Boolean);
  const found = candidates.find(c => fs.existsSync(c));
  if (found) return found;
  try {
    return execFileSync('which', ['code']).toString().trim();
  } catch {
    throw new Error('VS Code not found; set VSCODE_BIN to its `code` launcher');
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ---- probe themes ----------------------------------------------------------

const structure = analyzeStructure(parseJsonc(fs.readFileSync(path.join(REPO, 'themes/Abraham-code-sandbox.json'), 'utf8')));
const keys = [
  ...structure.tokenColors.map((_, i) => `t${i}`),
  ...structure.semanticKeys.map((_, j) => `s${j}`),
];
const sentinel = {};
keys.forEach((k, n) => { sentinel[k] = '#4' + (n + 1).toString(16).padStart(5, '0'); });
sentinel.d = '#3fffff';
sentinel.p = '#3ffffe';
const keyOfColor = new Map(Object.entries(sentinel).map(([k, c]) => [c, k]));

function probeTheme(name, variant) {
  const tokenColors = structure.tokenColors.map((rule, i) => {
    const settings = {};
    if (rule.settings.foreground) settings.foreground = sentinel[`t${i}`];
    if (variant === 'A' && rule.settings.fontStyle !== undefined) settings.fontStyle = rule.settings.fontStyle;
    if (variant === 'B' && firstScope(rule) === 'comment') settings.fontStyle = 'italic';
    return { scope: rule.scope, settings };
  });
  if (variant === 'B') tokenColors.push({ scope: PUNCTUATION_SCOPES, settings: { foreground: sentinel.p } });
  const semanticTokenColors = {};
  structure.semanticKeys.forEach((key, j) => {
    const value = structure.semanticTokenColors[key];
    semanticTokenColors[key] = typeof value === 'string'
      ? sentinel[`s${j}`]
      : { ...value, foreground: sentinel[`s${j}`], ...(variant === 'B' ? { fontStyle: '' } : {}) };
  });
  return {
    name,
    type: 'dark',
    colors: { 'editor.background': '#000000', 'editor.foreground': sentinel.d },
    tokenColors,
    semanticHighlighting: true,
    semanticTokenColors,
  };
}

const HELPER = `
const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const path = require('path');
exports.activate = context => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const q = name => url.searchParams.get(name);
    try {
      let out = {};
      if (url.pathname === '/open') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(q('file')));
        await vscode.window.showTextDocument(doc, { preview: false });
        out = { language: doc.languageId, lines: doc.lineCount };
      } else if (url.pathname === '/theme') {
        await vscode.workspace.getConfiguration().update('workbench.colorTheme', q('name'), vscode.ConfigurationTarget.Global);
        out = { theme: q('name') };
      } else if (url.pathname === '/semantic') {
        const tokens = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', vscode.Uri.file(q('file')));
        out = { count: tokens && tokens.data ? tokens.data.length / 5 : 0 };
      } else if (url.pathname === '/version') {
        out = { version: vscode.version, extensions: vscode.extensions.all.filter(e => !e.packageJSON.isBuiltin).map(e => e.id) };
      }
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e && e.stack || e) }));
    }
  });
  server.listen(0, '127.0.0.1', () => fs.writeFileSync(path.join(context.extensionPath, 'port.txt'), String(server.address().port)));
  context.subscriptions.push({ dispose: () => server.close() });
};
`;

// ---- VS Code setup ------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-capture-'));
const userDir = path.join(tmp, 'user-data');
const extDir = path.join(tmp, 'extensions');
const probeDir = path.join(tmp, 'probe');
for (const d of [path.join(userDir, 'User'), extDir, probeDir]) fs.mkdirSync(d, { recursive: true });

fs.writeFileSync(path.join(probeDir, 'a.json'), JSON.stringify(probeTheme('Roles Probe A', 'A'), null, 2));
fs.writeFileSync(path.join(probeDir, 'b.json'), JSON.stringify(probeTheme('Roles Probe B', 'B'), null, 2));
fs.writeFileSync(path.join(probeDir, 'extension.js'), HELPER);
fs.writeFileSync(path.join(probeDir, 'package.json'), JSON.stringify({
  name: 'roles-probe',
  publisher: 'local',
  version: '0.0.1',
  engines: { vscode: '^1.80.0' },
  main: './extension.js',
  activationEvents: ['onStartupFinished'],
  contributes: {
    themes: [
      { label: 'Roles Probe A', uiTheme: 'vs-dark', path: './a.json' },
      { label: 'Roles Probe B', uiTheme: 'vs-dark', path: './b.json' },
    ],
  },
}, null, 2));

// Mirror the language features you use, so semantic tokens match your VS Code.
const userSettingsFile = path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
let userSettings = {};
try { userSettings = parseJsonc(fs.readFileSync(userSettingsFile, 'utf8')); } catch { /* no user settings */ }
const settings = {
  'workbench.colorTheme': 'Roles Probe A',
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.enableExperiments': false,
  'workbench.editor.enablePreview': false,
  'window.newWindowDimensions': 'maximized',
  'window.restoreWindows': 'none',
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'extensions.autoCheckUpdates': false,
  'extensions.autoUpdate': false,
  'security.workspace.trust.enabled': false,
  'git.enabled': false,
  'editor.fontSize': 14,
  'editor.lineHeight': 20,
  'editor.minimap.enabled': false,
  'editor.bracketPairColorization.enabled': false,
  'editor.guides.indentation': false,
  'editor.guides.bracketPairs': false,
  'editor.inlayHints.enabled': 'off',
  'editor.codeLens': false,
  'editor.colorDecorators': false,
  'editor.links': false,
  'editor.stickyScroll.enabled': false,
  'editor.occurrencesHighlight': 'off',
  'editor.selectionHighlight': false,
  'editor.matchBrackets': 'never',
  'editor.renderLineHighlight': 'none',
  'editor.renderWhitespace': 'none',
  'editor.unicodeHighlight.ambiguousCharacters': false,
  'editor.unicodeHighlight.invisibleCharacters': false,
  'editor.lightbulb.enabled': 'off',
  'editor.hover.enabled': false,
  'problems.decorations.enabled': false,
  'breadcrumbs.enabled': false,
  'typescript.disableAutomaticTypeAcquisition': true,
  'python.analysis.inlayHints.variableTypes': false,
  'python.analysis.inlayHints.functionReturnTypes': false,
};
const userExtensions = [];
if (!args.has('--plain')) {
  const manifestFile = path.join(os.homedir(), '.vscode', 'extensions', 'extensions.json');
  let manifest = [];
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { /* none */ }
  const pick = id => manifest.find(e => e.identifier?.id?.toLowerCase() === id);
  const wanted = ['ms-python.python', 'ms-python.vscode-pylance', 'ms-python.vscode-python-envs', 'ms-python.debugpy'];
  const tsgo = userSettings['js/ts.experimental.useTsgo'] ?? userSettings['typescript.experimental.useTsgo'];
  if (tsgo) {
    wanted.push('typescriptteam.native-preview');
    settings['js/ts.experimental.useTsgo'] = true;
    settings['typescript.experimental.useTsgo'] = true;
  }
  for (const id of wanted) {
    const entry = pick(id);
    const location = entry?.location?.path;
    if (!location || !fs.existsSync(location)) continue;
    // VS Code resolves relativeLocation inside --extensions-dir, so link the real folder there.
    fs.symlinkSync(location, path.join(extDir, entry.relativeLocation || path.basename(location)), 'dir');
    userExtensions.push(entry);
  }
}
fs.writeFileSync(path.join(extDir, 'extensions.json'), JSON.stringify(userExtensions));
fs.writeFileSync(path.join(userDir, 'User', 'settings.json'), JSON.stringify(settings, null, 2));

// ---- CDP --------------------------------------------------------------------

class Cdp {
  static async connect(port) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = list.find(t => t.type === 'page' && /workbench/.test(t.url));
        if (page) {
          const cdp = new Cdp();
          await cdp.open(page.webSocketDebuggerUrl);
          return cdp;
        }
      } catch { /* not up yet */ }
      await sleep(300);
    }
    throw new Error('VS Code did not start (no workbench page on the debug port)');
  }
  open(url) {
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(url);
    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    };
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }
  async evaluate(expression) {
    const id = ++this.id;
    const msg = await new Promise(resolve => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    if (msg.result?.exceptionDetails) throw new Error(JSON.stringify(msg.result.exceptionDetails).slice(0, 500));
    return msg.result?.result?.value;
  }
  close() {
    this.ws.close();
  }
}

const READ_EDITOR = `(() => {
  const tab = document.querySelector('.tab.active .label-name');
  const lines = document.querySelector('.editor-instance .monaco-editor .view-lines');
  if (!lines) return { tab: tab && tab.textContent, lines: [] };
  const hex = c => {
    const m = c.match(/[\\d.]+/g).map(Number);
    const h = v => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h(m[0]) + h(m[1]) + h(m[2]) + (m.length > 3 && m[3] < 1 ? h(m[3] * 255) : '');
  };
  const rows = [...lines.querySelectorAll('.view-line')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
  return {
    tab: tab && tab.textContent,
    lines: rows.map(row => [...row.querySelectorAll(':scope > span > span')].map(span => {
      const cs = getComputedStyle(span);
      let style = '';
      if (cs.fontStyle === 'italic') style += 'i';
      if (Number(cs.fontWeight) >= 600) style += 'b';
      if (cs.textDecorationLine.includes('underline')) style += 'u';
      if (cs.textDecorationLine.includes('line-through')) style += 's';
      return [span.textContent.replace(/\\u00a0/g, ' '), hex(cs.color), style];
    })),
  };
})()`;

// ---- run ------------------------------------------------------------------------

const code = findCode();
const debugPort = await freePort();
log('VS Code:', code);
log('user extensions:', userExtensions.map(e => e.identifier.id).join(', ') || 'none');
const launchArgs = [
  '--no-sandbox', '--ozone-platform=headless', '--ozone-override-screen-size=1600,2600',
  `--user-data-dir=${userDir}`, `--extensions-dir=${extDir}`,
  `--extensionDevelopmentPath=${probeDir}`,
  ...(args.has('--verify') ? [`--extensionDevelopmentPath=${REPO}`] : []),
  `--remote-debugging-port=${debugPort}`,
  '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--new-window', SAMPLES_DIR,
];
spawn(code, launchArgs, { stdio: 'ignore', detached: true }).unref();

function stopVSCode() {
  try {
    execFileSync('pkill', ['-f', `user-data-dir=${userDir}`]);
  } catch { /* already gone */ }
}

let cdp;
try {
  cdp = await Cdp.connect(debugPort);
  const portFile = path.join(probeDir, 'port.txt');
  const deadline = Date.now() + 60000;
  while (!fs.existsSync(portFile)) {
    if (Date.now() > deadline) throw new Error('probe extension did not start');
    await sleep(300);
  }
  const helperPort = fs.readFileSync(portFile, 'utf8').trim();
  const helper = async (route, params = {}) => {
    const res = await fetch(`http://127.0.0.1:${helperPort}/${route}?${new URLSearchParams(params)}`);
    const body = await res.json();
    if (body.error) throw new Error(`${route}: ${body.error}`);
    return body;
  };
  const info = await helper('version');
  log('VS Code', info.version, 'extensions loaded:', info.extensions.join(', ') || 'none');

  const fileLines = file => fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8').split('\n');

  // Open a file and wait until its colours stop changing (semantic tokens arrive late).
  async function render(file, waitSemantic) {
    const full = path.join(SAMPLES_DIR, file);
    const opened = await helper('open', { file: full });
    let semantic = 0;
    if (waitSemantic && SEMANTIC_FILES.test(file)) {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        semantic = (await helper('semantic', { file: full })).count;
        if (semantic > 0) break;
        await sleep(1000);
      }
      if (!semantic) log(`warning: no semantic tokens for ${file}`);
    }
    let last = '';
    let stable = 0;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await sleep(350);
      const snap = await cdp.evaluate(READ_EDITOR);
      const text = JSON.stringify(snap.lines);
      if (snap.tab === file && snap.lines.length && text === last) {
        if (++stable >= 3) return { ...opened, semantic, lines: snap.lines };
      } else {
        stable = 0;
      }
      last = text;
    }
    throw new Error(`editor never settled on ${file}`);
  }

  // Per-character view of a rendered file, checked against the file's text.
  function chars(file, rendered) {
    const expected = fileLines(file);
    return expected.map((lineText, li) => {
      const spans = rendered[li] || [];
      const text = spans.map(s => s[0]).join('');
      if (text !== lineText) throw new Error(`${file}:${li + 1} rendered as ${JSON.stringify(text)}, expected ${JSON.stringify(lineText)}`);
      const out = [];
      for (const [t, color, style] of spans) for (const ch of t) out.push({ ch, color, style });
      return out;
    });
  }

  const captured = {};
  for (const variant of ['A', 'B']) {
    await helper('theme', { name: `Roles Probe ${variant}` });
    await sleep(1500);
    for (const file of SAMPLES) {
      const r = await render(file, variant === 'A');
      captured[file] ??= { language: r.language, semantic: r.semantic };
      captured[file][variant] = chars(file, r.lines);
      log(`${variant} ${file}: ${r.lines.length} lines${r.semantic ? `, ${r.semantic} semantic tokens` : ''}`);
    }
  }

  const unknown = new Set();
  let disagreements = 0;
  const samples = SAMPLES.map(file => {
    const { A, B, language, semantic } = captured[file];
    const lines = A.map((lineA, li) => {
      const tokens = [];
      lineA.forEach((a, ci) => {
        const b = B[li][ci];
        const key = keyOfColor.get(a.color);
        const keyB = keyOfColor.get(b.color);
        if (!key) unknown.add(a.color);
        if (keyB !== key && keyB !== 'p') disagreements++;
        const flags = (keyB === 'p' ? FLAG_PUNCTUATION : 0) | (b.style.includes('i') ? FLAG_COMMENT : 0);
        const prev = tokens[tokens.length - 1];
        if (prev && prev[1] === (key ?? 'd') && prev[2] === a.style && prev[3] === flags) prev[0] += a.ch;
        else tokens.push([a.ch, key ?? 'd', a.style, flags]);
      });
      return tokens;
    });
    return { file, language, semantic, lines };
  });
  if (unknown.size) throw new Error(`colours that aren't probe colours: ${[...unknown].join(' ')}`);
  if (disagreements) log(`warning: ${disagreements} characters differ between the two probes`);

  const data = {
    version: 1,
    vscode: info.version,
    extensions: info.extensions,
    captured: new Date().toISOString(),
    structureHash: structure.hash,
    semanticKeys: structure.semanticKeys,
    samples,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data) + '\n');
  log('wrote', path.relative(REPO, OUT));

  if (args.has('--verify')) {
    // Render the repo's structure themes for real and compare with the playground's prediction.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    for (const t of pkg.contributes.themes) {
      const theme = parseJsonc(fs.readFileSync(path.join(REPO, t.path.replace(/^\.?\//, '')), 'utf8'));
      theme.uiTheme = t.uiTheme;
      const palette = paletteFor(theme, structure);
      if (palette.source !== 'exact') continue;
      await helper('theme', { name: t.label });
      await sleep(1500);
      let total = 0;
      const wrong = [];
      for (const sample of samples) {
        const real = chars(sample.file, (await render(sample.file, false)).lines);
        sample.lines.forEach((tokens, li) => {
          let ci = 0;
          for (const token of tokens) {
            const color = tokenColor(token, palette, structure, data.semanticKeys).toLowerCase();
            const style = [...tokenStyle(token, palette)].sort().join('');
            for (let k = 0; k < token[0].length; k++, ci++) {
              const r = real[li][ci];
              total++;
              if (r.color !== color || [...r.style].sort().join('') !== style) {
                wrong.push(`${sample.file}:${li + 1}:${ci + 1} ${JSON.stringify(token[0])} expected ${color}/${style} got ${r.color}/${r.style}`);
              }
            }
          }
        });
      }
      log(`verify ${t.label}: ${total - wrong.length}/${total} characters match`);
      for (const w of wrong.slice(0, 8)) log('  ', w);
    }
  }
} finally {
  cdp?.close();
  stopVSCode();
  if (!args.has('--keep')) fs.rmSync(tmp, { recursive: true, force: true });
  else log('kept', tmp);
}
