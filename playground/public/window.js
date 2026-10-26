// A VS Code window drawn with a theme's interface colours and the palette's syntax colours.
import { tokenRole, tokenStyle } from '/lib/samples.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const styleClass = s => (s.includes('i') ? ' fi' : '') + (s.includes('b') ? ' fb' : '') + (s.includes('u') ? ' fu' : '') + (s.includes('s') ? ' fs' : '');
const WORD = /^[A-Za-z_$][\w$-]*$/;

// Small codicon-like icons (drawn here, not copied from codicons).
const svg = (body, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  files: '<path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v13A1.5 1.5 0 0 0 7.5 19h9a1.5 1.5 0 0 0 1.5-1.5V7z"/><path d="M14 3v4h4"/><path d="M3 7v13.5A1.5 1.5 0 0 0 4.5 22H14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 6 6"/>',
  scm: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11 7"/>',
  debug: '<path d="M8 5v14l11-7z"/><circle cx="6" cy="18" r="3" stroke-width="1.3"/>',
  extensions: '<rect x="3" y="11" width="7" height="7"/><rect x="10" y="11" width="7" height="7"/><rect x="10" y="4" width="7" height="7"/><rect x="14.5" y="1.5" width="7" height="7" transform="rotate(0)"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  branch: '<circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="7" r="2"/><path d="M7 7v10M17 9c0 3-4 3-8 6"/>',
  sync: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/>',
  warning: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  remote: '<path d="m4 9 4 3-4 3M20 9l-4 3 4 3"/>',
  layoutSide: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 4v16"/>',
  layoutPanel: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 14h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16"/>',
  min: '<path d="M5 12h14"/>',
  max: '<rect x="5" y="5" width="14" height="14"/>',
};
const icon = (name, size) => svg(ICONS[name], size);

const LANGUAGES = {
  typescriptreact: 'TypeScript JSX', typescript: 'TypeScript', python: 'Python', css: 'CSS', html: 'HTML',
  json: 'JSON', markdown: 'Markdown', yaml: 'YAML', shellscript: 'Shell Script', javascript: 'JavaScript',
};
// File icons come from the icon theme, not the colour theme, so their colours are fixed.
const FILE_ICONS = {
  tsx: ['⚛', '#4fc1ff'], ts: ['TS', '#3178c6'], js: ['JS', '#e8d44d'], mjs: ['JS', '#e8d44d'], py: ['py', '#3d7ab8'],
  css: ['#', '#42a5f5'], html: ['<>', '#e44d26'], json: ['{}', '#cbcb41'], md: ['M', '#519aba'],
  yml: ['!', '#a074c4'], sh: ['$', '#89e051'],
};
const GIT = { 'Dashboard.tsx': 'M', 'cache.ts': 'U', 'styles.css': 'M', 'deploy.yml': 'A' };
const GIT_KEY = { M: 'modified', U: 'untracked', A: 'added' };

const fileIcon = name => {
  const [glyph, color] = FILE_ICONS[name.split('.').pop()] || ['≡', '#8f8f8f'];
  return `<span class="w-ficon" style="color:${color}">${esc(glyph)}</span>`;
};
export const languageName = id => LANGUAGES[id] || id;
const tabSizeOf = file => (file.endsWith('.py') ? 4 : 2);

/** CSS custom properties for every resolved interface colour. */
export function colorVars(colors) {
  return Object.entries(colors)
    .filter(([, v]) => v)
    .map(([k, v]) => `--c-${k.replace(/\./g, '-')}:${v}`)
    .join(';');
}

// ---- cursor and highlights ----------------------------------------------------------

const trimmed = text => {
  const lead = text.length - text.trimStart().length;
  const core = text.trim();
  return { lead: text.slice(0, lead), core, tail: text.slice(lead + core.length) };
};

/** Where the cursor starts: on a variable that appears more than once. */
export function defaultCursor(sample, structure, semanticKeys) {
  const seen = new Map();
  sample.lines.forEach((line, l) => line.forEach((token, t) => {
    const { core } = trimmed(token[0]);
    if (!WORD.test(core)) return;
    const role = tokenRole(token, { roles: {} }, structure, semanticKeys);
    if (!['plain', 'constVariable'].includes(role)) return;
    if (!seen.has(core)) seen.set(core, []);
    seen.get(core).push({ l, t });
  }));
  const best = [...seen.values()].sort((a, b) => b.length - a.length)[0];
  if (!best) return { l: Math.min(1, sample.lines.length - 1), t: -1, select: false };
  return { ...(best[1] || best[0]), select: false };
}

function cursorInfo(sample, cursor) {
  const line = sample.lines[cursor.l] || [];
  const token = line[cursor.t];
  const word = token ? trimmed(token[0]).core : '';
  let col = 1;
  for (let t = 0; t < cursor.t && t < line.length; t++) col += line[t][0].length;
  if (token) col += trimmed(token[0]).lead.length + word.length;
  return { word: WORD.test(word) ? word : '', col };
}

// ---- editor ---------------------------------------------------------------------------

function indentOf(line) {
  const text = line.map(t => t[0]).join('');
  return text.trim() ? text.length - text.trimStart().length : -1;
}

function indentGuides(sample, tab, cursor) {
  const indents = sample.lines.map(indentOf);
  const levels = indents.map((ind, i) => {
    if (ind >= 0) return Math.floor(ind / tab);
    let prev = 0;
    let next = 0;
    for (let j = i - 1; j >= 0; j--) if (indents[j] >= 0) { prev = indents[j]; break; }
    for (let j = i + 1; j < indents.length; j++) if (indents[j] >= 0) { next = indents[j]; break; }
    return Math.floor(Math.min(prev, next) / tab);
  });
  // The active guide belongs to the block around the cursor line.
  const level = levels[cursor.l] ?? 0;
  const active = { level: level - 1, from: cursor.l, to: cursor.l };
  if (level > 0) {
    while (active.from > 0 && levels[active.from - 1] >= level) active.from--;
    while (active.to < levels.length - 1 && levels[active.to + 1] >= level) active.to++;
  }
  return { levels, active };
}

function gitLines(count) {
  const clamp = n => Math.min(n, count - 1);
  return { modified: new Set([clamp(13), clamp(14), clamp(15)]), added: new Set([clamp(29), clamp(30)]), deletedAfter: clamp(8) };
}

function editorRows(ctx) {
  const { sample, palette, structure, semanticKeys, cursor } = ctx;
  const tab = tabSizeOf(sample.file);
  const { levels, active } = indentGuides(sample, tab, cursor);
  const git = gitLines(sample.lines.length);
  const { word } = cursorInfo(sample, cursor);
  const out = [];
  let firstOccurrence = true;
  sample.lines.forEach((line, l) => {
    const current = l === cursor.l;
    const mark = git.modified.has(l) ? 'mod' : git.added.has(l) ? 'add' : '';
    const del = git.deletedAfter === l ? ' w-del' : '';
    out.push(`<div class="w-row${current ? ' current' : ''}${current && cursor.select ? ' selecting' : ''}">`);
    out.push(`<span class="w-gutter${del}">${mark ? `<i class="w-git ${mark}"></i>` : ''}<span class="w-ln">${l + 1}</span></span><span class="w-line">`);
    for (let g = 0; g < levels[l]; g++) {
      const on = g === active.level && l >= active.from && l <= active.to;
      out.push(`<i class="w-guide${on ? ' on' : ''}" style="left:${g * tab}ch"></i>`);
    }
    line.forEach((token, t) => {
      const role = tokenRole(token, palette, structure, semanticKeys);
      const cls = `t r-${role}${styleClass(tokenStyle(token, palette))}`;
      const { lead, core, tail } = trimmed(token[0]);
      const attrs = `data-l="${l}" data-t="${t}"`;
      let hl = '';
      if (word && core === word) {
        if (cursor.select) hl = l === cursor.l && t === cursor.t ? ' w-sel' : ' w-selhl';
        else hl = firstOccurrence ? ' w-whs' : ' w-wh';
        firstOccurrence = false;
      }
      if (lead) out.push(`<span class="${cls}" ${attrs}>${esc(lead)}</span>`);
      if (core) {
        const caret = l === cursor.l && t === cursor.t ? '<i class="w-caret"></i>' : '';
        out.push(`<span class="${cls}${hl}" ${attrs}>${esc(core)}${caret}</span>`);
      }
      if (tail) out.push(`<span class="${cls}" ${attrs}>${esc(tail)}</span>`);
    });
    if (current && cursor.t < 0) out.push('<i class="w-caret"></i>');
    out.push('</span></div>');
  });
  return out.join('');
}

function minimap(ctx) {
  const { sample, palette, structure, semanticKeys } = ctx;
  return sample.lines.map(line => `<div class="w-mm-row">${line.map(token => {
    const text = token[0];
    const lead = text.length - text.trimStart().length;
    const core = text.trim().length;
    const role = tokenRole(token, palette, structure, semanticKeys);
    return (lead ? `<i style="width:${lead}px"></i>` : '') + (core ? `<b class="r-${role}" style="width:${core}px"></b>` : '');
  }).join('')}</div>`).join('');
}

function overviewMarks(count) {
  const git = gitLines(count);
  const marks = [];
  for (const l of git.modified) marks.push(`<i class="w-om mod" style="top:${(l / count) * 100}%"></i>`);
  for (const l of git.added) marks.push(`<i class="w-om add" style="top:${(l / count) * 100}%"></i>`);
  marks.push(`<i class="w-om del" style="top:${(git.deletedAfter / count) * 100}%"></i>`);
  return marks.join('');
}

// ---- workbench parts -----------------------------------------------------------------

function activityBar(mini) {
  const items = ['files', 'search', 'scm', 'debug', 'extensions'];
  return `<div class="w-activity">${items.map((name, i) =>
    `<div class="w-act${i === 0 ? ' active' : ''}">${icon(name, mini ? 16 : 24)}${name === 'scm' ? '<span class="w-badge">3</span>' : ''}</div>`).join('')}
    ${mini ? '' : `<div class="w-act-spacer"></div><div class="w-act">${icon('account')}</div><div class="w-act">${icon('gear')}</div>`}</div>`;
}

function explorer(samples, current) {
  const row = (depth, html, cls = '', attrs = '') => `<div class="w-tree-row${cls}" style="padding-left:${8 + depth * 8}px"${attrs}>${html}</div>`;
  const folder = (depth, name, open, decoration = '') =>
    row(depth, `<span class="w-twisty">${icon(open ? 'chevronDown' : 'chevronRight', 16)}</span><span class="w-name${decoration ? ` w-git-${decoration}` : ''}">${esc(name)}</span>${decoration === 'modified' ? '<span class="w-dot">●</span>' : ''}`, ' w-folder');
  const file = (depth, name, i) => {
    const status = GIT[name];
    const cls = status ? ` w-git-${GIT_KEY[status]}` : '';
    return row(depth, `<span class="w-twisty"></span>${fileIcon(name)}<span class="w-name${cls}">${esc(name)}</span>${status ? `<span class="w-letter${cls}">${status}</span>` : ''}`,
      i === current ? ' selected' : '', i >= 0 ? ` data-sample="${i}"` : '');
  };
  const rows = [
    folder(0, '.vscode', false),
    `<div class="w-ignored">${folder(0, 'node_modules', false)}</div>`,
    folder(0, 'playground', true, 'modified'),
    folder(1, 'lib', false),
    folder(1, 'samples', true, 'modified'),
    ...samples.map((s, i) => file(2, s.file, i)),
    file(1, 'server.mjs', -1),
    folder(0, 'themes', false),
    file(0, 'package.json', -1),
  ];
  return `<div class="w-sidebar">
    <div class="w-sb-title"><span>EXPLORER</span>${icon('more', 16)}</div>
    <div class="w-sb-section">${icon('chevronDown', 16)}<span>CUSTOMALABASTER</span></div>
    <div class="w-tree">${rows.join('')}</div>
    <div class="w-sb-section w-collapsed">${icon('chevronRight', 16)}<span>OUTLINE</span></div>
    <div class="w-sb-section w-collapsed">${icon('chevronRight', 16)}<span>TIMELINE</span></div>
  </div>`;
}

function tabs(samples, current, mini) {
  const shown = mini ? [current] : [current, (current + 1) % samples.length, (current + 2) % samples.length];
  return `<div class="w-tabs">${shown.map((i, n) => {
    const s = samples[i];
    const active = i === current;
    const dirty = !active && n === 2;
    return `<div class="w-tab${active ? ' active' : ''}" data-sample="${i}">${fileIcon(s.file)}<span>${esc(s.file)}</span>${mini ? '' : `<span class="w-tab-action">${dirty ? '●' : active ? icon('close', 14) : ''}</span>`}</div>`;
  }).join('')}${mini ? '' : `<div class="w-tabs-actions">${icon('split', 16)}${icon('more', 16)}</div>`}</div>`;
}

const TERMINAL = [
  [['green', '➜  '], ['cyan', 'customalabaster '], ['blue', 'git:('], ['red', 'main'], ['blue', ') '], ['yellow', '✗ '], ['', 'npm run build']],
  [['', '']],
  [['', '> roles-demo@1.2.0 build']],
  [['', '> tsc && vite build']],
  [['', '']],
  [['cyan', 'vite v5.4.2 '], ['green', 'building for production...']],
  [['green', '✓ '], ['', '42 modules transformed.']],
  [['brightBlack', 'dist/'], ['green', 'index.html               '], ['brightBlack', '  0.46 kB │ gzip:  0.30 kB']],
  [['brightBlack', 'dist/'], ['magenta', 'assets/index-4f2a.css     '], ['brightBlack', '1.12 kB │ gzip:  0.52 kB']],
  [['brightBlack', 'dist/'], ['cyan', 'assets/index-BmV1.js    '], ['brightBlack', '143.21 kB │ gzip: 46.10 kB']],
  [['yellow', '(!) '], ['yellow', 'Some chunks are larger than 100 kB after minification.']],
  [['green', '✓ built in 1.84s']],
  [['green', '➜  '], ['cyan', 'customalabaster '], ['blue', 'git:('], ['red', 'main'], ['blue', ') '], ['yellow', '✗ '], ['cursor', ' ']],
];

function panel() {
  const lines = TERMINAL.map(parts => `<div>${parts.map(([color, text]) =>
    color === 'cursor' ? '<span class="w-tcursor"> </span>' : `<span${color ? ` class="w-a-${color}"` : ''}>${esc(text) || '&nbsp;'}</span>`).join('')}</div>`).join('');
  return `<div class="w-panel">
    <div class="w-panel-tabs">
      <span>PROBLEMS<span class="w-pbadge">2</span></span><span>OUTPUT</span><span>DEBUG CONSOLE</span><span class="active">TERMINAL</span><span>PORTS</span>
      <span class="w-panel-actions">${icon('plus', 16)}${icon('trash', 16)}${icon('more', 16)}${icon('close', 16)}</span>
    </div>
    <div class="w-term">${lines}</div>
  </div>`;
}

function statusBar(sample, cursor, mini) {
  const { col } = cursorInfo(sample, cursor);
  const language = languageName(sample.language);
  if (mini) {
    return `<div class="w-status"><span class="w-si">${icon('error', 12)} 0 ${icon('warning', 12)} 0</span><span class="w-grow"></span><span class="w-si">${esc(language)}</span></div>`;
  }
  return `<div class="w-status">
    <span class="w-si w-remote">${icon('remote', 14)}</span>
    <span class="w-si">${icon('branch', 14)} main*</span>
    <span class="w-si">${icon('sync', 14)}</span>
    <span class="w-si">${icon('error', 14)} 0 ${icon('warning', 14)} 2</span>
    <span class="w-grow"></span>
    <span class="w-si">Ln ${cursor.l + 1}, Col ${col}</span>
    <span class="w-si">Spaces: ${tabSizeOf(sample.file)}</span>
    <span class="w-si">UTF-8</span>
    <span class="w-si">LF</span>
    <span class="w-si">{ } ${esc(language)}</span>
    <span class="w-si">${icon('bell', 14)}</span>
  </div>`;
}

function titleBar(title, mini) {
  if (mini) return `<div class="w-title"><span class="w-title-center">${esc(title)}</span></div>`;
  return `<div class="w-title">
    <span class="w-menu">File&nbsp;&nbsp;Edit&nbsp;&nbsp;Selection&nbsp;&nbsp;View&nbsp;&nbsp;Go&nbsp;&nbsp;Run&nbsp;&nbsp;Terminal&nbsp;&nbsp;Help</span>
    <span class="w-command">${icon('search', 14)}<span>customalabaster</span></span>
    <span class="w-title-actions">${icon('layoutSide', 16)}${icon('layoutPanel', 16)}<span class="w-winctl">${icon('min', 14)}${icon('max', 13)}${icon('close', 14)}</span></span>
  </div>`;
}

/**
 * The line highlight follows VS Code: a background when the theme has one, a 2px border
 * when there's no visible background or the theme sets the border itself.
 */
export function windowStyle(colors, defined) {
  return `${colorVars(colors)};${lineHighlightStyle(colors, defined)}`;
}

function lineHighlightStyle(colors, defined) {
  const bg = colors['editor.lineHighlightBackground'];
  const border = colors['editor.lineHighlightBorder'];
  const clearBg = !bg || /^#[0-9a-f]{6}00$/i.test(bg);
  const showBorder = border && (clearBg || defined.has('editor.lineHighlightBorder'));
  return `--w-line-bg:${bg || 'transparent'};--w-line-border:${showBorder ? border : 'transparent'}`;
}

export function windowHtml({ title, colors, defined, samples, sampleIndex, palette, structure, semanticKeys, cursor, mini = false }) {
  const sample = samples[sampleIndex];
  const ctx = { sample, palette, structure, semanticKeys, cursor };
  const crumbs = ['playground', 'samples', sample.file];
  const editor = mini
    ? `<div class="w-editor"><div class="w-code">${editorRows({ ...ctx, sample: { ...sample, lines: sample.lines.slice(0, 16) } })}</div></div>`
    : `<div class="w-editor">
        <div class="w-code">${editorRows(ctx)}</div>
        <div class="w-minimap"><div class="w-mm-rows">${minimap(ctx)}</div><div class="w-mm-slider"></div></div>
        <div class="w-ruler">${overviewMarks(sample.lines.length)}<div class="w-ruler-slider"></div></div>
      </div>`;
  return `<div class="w-window${mini ? ' w-mini' : ''}" style="${windowStyle(colors, defined)}">
    ${titleBar(title, mini)}
    <div class="w-body">
      ${activityBar(mini)}
      ${mini ? '' : explorer(samples, sampleIndex)}
      <div class="w-main">
        ${tabs(samples, sampleIndex, mini)}
        ${mini ? '' : `<div class="w-crumbs">${crumbs.map(esc).join(' <span class="w-crumb-sep">›</span> ')}</div>`}
        ${editor}
        ${mini ? '' : panel()}
      </div>
    </div>
    ${statusBar(sample, cursor, mini)}
  </div>`;
}

/** Keep the minimap slider and the scrollbar in step with the editor's scroll position. */
export function syncWindowScroll(win) {
  const code = win.querySelector('.w-code');
  const mm = win.querySelector('.w-mm-slider');
  const ruler = win.querySelector('.w-ruler-slider');
  if (!code || !mm || !ruler) return;
  const update = () => {
    const total = code.scrollHeight;
    const view = code.clientHeight;
    const rows = win.querySelector('.w-mm-rows');
    const ratio = total ? view / total : 1;
    mm.style.top = `${(code.scrollTop / total) * rows.offsetHeight}px`;
    mm.style.height = `${Math.max(6, ratio * rows.offsetHeight)}px`;
    ruler.style.top = `${(code.scrollTop / total) * 100}%`;
    ruler.style.height = `${Math.min(100, ratio * 100)}%`;
  };
  code.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);
}
