import { ROLES, ROLE_BY_ID, roleColor, sourceRole, buildSyntax, buildIconColors, extractPalette } from '/lib/structure.js';
import { derivePalette, themeIsDark } from '/lib/derive.js';
import { tokenRole, tokenStyle } from '/lib/samples.js';
import { parseJsonc } from '/lib/jsonc.js';
import { contrast, normalizeHex, opaqueHex, isDarkColor } from '/lib/color.js';
import { resolveColors, WORKBENCH_KEYS } from '/lib/workbench.js';
import { windowHtml, windowStyle, syncWindowScroll, defaultCursor } from '/window.js';

const STORE = 'roles-playground.v1';
const GROUPS = [
  ['custom', 'Your edits'],
  ['repo', 'Your themes'],
  ['installed', 'Installed'],
  ['builtin', 'VS Code'],
];
const SWATCH_ROLES = ['keyword', 'function', 'type', 'constant', 'string', 'tag'];
const THEME_PREFIX = 'Custom Alabaster Codesandbox ';

const state = {
  structure: null,
  samples: null,
  themes: [],
  custom: [],
  activeId: null,
  compareId: null,
  compare: false,
  sample: 0,
  search: '',
  picked: null,
  view: 'window',
  focus: false,
  colorDefaults: {},
  cursors: {},
  rawColors: new Map(),
};

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const styleClass = s => (s.includes('i') ? ' fi' : '') + (s.includes('b') ? ' fb' : '') + (s.includes('u') ? ' fu' : '') + (s.includes('s') ? ' fs' : '');

// ---- data ----------------------------------------------------------------------

const entries = () => [...state.custom, ...state.themes.filter(t => t.palette)];
const entryById = id => entries().find(e => e.id === id);
const active = () => entryById(state.activeId);

function persist() {
  localStorage.setItem(STORE, JSON.stringify({
    custom: state.custom,
    activeId: state.activeId,
    compareId: state.compareId,
    compare: state.compare,
    sample: state.sample,
    view: state.view,
    focus: state.focus,
  }));
}

function restore() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
}

function shortName(label) {
  return label.replace(/^Custom Alabaster (Codesandbox )?/, '').replace(/ \((custom|edited)( \d+)?\)$/, '') || label;
}

function uniqueLabel(base) {
  const taken = new Set(entries().map(e => e.label));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

function sourceText(e) {
  const where = { repo: 'your themes', installed: e.extension || 'an installed extension', builtin: 'VS Code' }[e.group];
  if (e.group === 'custom') {
    const base = e.base && entryById(e.base);
    if (e.importedFrom) return `Imported from ${e.importedFrom}`;
    return base ? `Edited copy of ${base.label}` : 'Your palette';
  }
  return e.palette.source === 'exact'
    ? `Read exactly from a theme built on your roles (${where})`
    : `Each role takes this theme's colour for it (${where})`;
}

/** The palette shown on the left becomes editable by copying it into "Your edits" first. */
function editable() {
  const current = active();
  if (current.group === 'custom') return current;
  const copy = {
    id: `custom:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label: uniqueLabel(`${shortName(current.label)} (edited)`),
    group: 'custom',
    base: current.id,
    palette: structuredClone(current.palette),
  };
  state.custom.unshift(copy);
  state.activeId = copy.id;
  persist();
  renderSidebar();
  renderPanelHead();
  renderPaneHeads();
  return copy;
}

// ---- interface colours ------------------------------------------------------------

/** Colours a palette writes into its theme on top of the source theme's own. */
function themeColorOverrides(palette) {
  return {
    'editor.background': palette.ui.background,
    'editor.foreground': roleColor(palette, 'defaultText'),
    'editorLineNumber.foreground': palette.ui.lineNumber,
    'editorLineNumber.activeForeground': palette.ui.lineNumberActive,
    ...buildIconColors(state.structure, palette),
  };
}

const baseIdOf = e => (e.group === 'custom' ? e.base : e.id);

/** The source theme's own colours, or undefined while they still have to be fetched. */
function rawColorsNow(e) {
  if (e.colors) return e.colors;
  const base = baseIdOf(e) && entryById(baseIdOf(e));
  if (base?.colors) return base.colors;
  if (!baseIdOf(e) || baseIdOf(e).startsWith('custom:')) return {};
  return state.rawColors.get(baseIdOf(e));
}

async function rawColors(e) {
  const now = rawColorsNow(e);
  if (now) return now;
  const id = baseIdOf(e);
  const res = await fetch(`/api/theme?id=${encodeURIComponent(id)}`);
  const colors = res.ok ? (await res.json()).colors || {} : {};
  state.rawColors.set(id, colors);
  return colors;
}

function uiTypeOf(e) {
  if (e.uiType) return e.uiType;
  const base = e.base && entryById(e.base);
  if (base?.uiType) return base.uiType;
  return isDarkColor(e.palette.ui.background) ? 'dark' : 'light';
}

/**
 * Interface colours for the window preview, resolved like VS Code would resolve the theme
 * this palette exports. Returns null while the source theme's colours are loading.
 */
function windowColors(e) {
  if (e.group !== 'custom' && e.workbench) return { colors: e.workbench, defined: new Set(e.workbenchDefined) };
  const raw = rawColorsNow(e);
  if (!raw) {
    rawColors(e).then(() => refreshPanes({ rebuild: true }));
    return null;
  }
  const merged = { ...raw, ...themeColorOverrides(e.palette) };
  const defined = new Set(Object.keys(merged).filter(k => typeof merged[k] === 'string' && merged[k] !== 'default'));
  return { colors: resolveColors(merged, uiTypeOf(e), state.colorDefaults, WORKBENCH_KEYS), defined };
}

function cursorFor(i) {
  return (state.cursors[i] ??= defaultCursor(state.samples.samples[i], state.structure, state.samples.semanticKeys));
}

const roleVars = palette => ROLES.map(r => `--r-${r.id}:${roleColor(palette, r.id)}`).join(';');

// ---- preview ---------------------------------------------------------------------

function paneSignature(palette) {
  return `${state.view}|${state.sample}|${!!palette.roles.punctuation}|${!!palette.commentItalic}`;
}

function codeHtml(palette) {
  const sample = state.samples.samples[state.sample];
  const keys = state.samples.semanticKeys;
  const out = [];
  sample.lines.forEach((line, li) => {
    out.push(`<div class="row"><span class="ln">${li + 1}</span><span class="src">`);
    line.forEach((token, ti) => {
      const role = tokenRole(token, palette, state.structure, keys);
      out.push(`<span class="t r-${role}${styleClass(tokenStyle(token, palette))}" data-l="${li}" data-t="${ti}">${esc(token[0])}</span>`);
    });
    out.push('</span></div>');
  });
  return out.join('');
}

function paint(pane, palette) {
  const s = pane.style;
  for (const role of ROLES) s.setProperty(`--r-${role.id}`, roleColor(palette, role.id));
  s.setProperty('--bg', palette.ui.background);
  s.setProperty('--ln', palette.ui.lineNumber);
  s.colorScheme = isDarkColor(palette.ui.background) ? 'dark' : 'light';
}

function paneEntries() {
  const list = [active()];
  if (state.compare) list.push(entryById(state.compareId) || active());
  return list;
}

function fillPane(pane, e) {
  paint(pane, e.palette);
  const box = $('.view', pane);
  box.dataset.sig = paneSignature(e.palette);
  if (state.view === 'code') {
    box.innerHTML = codeHtml(e.palette);
    return;
  }
  const wc = windowColors(e);
  if (!wc) {
    box.innerHTML = '<div class="pane-loading">Loading interface colours…</div>';
    box.dataset.sig = '';
    return;
  }
  const old = box.querySelector('.w-code');
  const scroll = old && [old.scrollTop, old.scrollLeft];
  box.innerHTML = windowHtml({
    title: e.label,
    colors: wc.colors,
    defined: wc.defined,
    samples: state.samples.samples,
    sampleIndex: state.sample,
    palette: e.palette,
    structure: state.structure,
    semanticKeys: state.samples.semanticKeys,
    cursor: cursorFor(state.sample),
  });
  const win = box.firstElementChild;
  if (scroll) Object.assign(win.querySelector('.w-code'), { scrollTop: scroll[0], scrollLeft: scroll[1] });
  syncWindowScroll(win);
}

function renderPanes() {
  const host = $('#panes');
  host.className = `panes view-${state.view}`;
  if (!state.samples) {
    host.innerHTML = '';
    return;
  }
  if (state.view === 'gallery') {
    renderGallery();
    return;
  }
  const list = paneEntries();
  host.innerHTML = list.map((_, slot) => `
    <div class="pane" data-slot="${slot}">
      <div class="pane-head"></div>
      <div class="view ${state.view === 'code' ? 'code' : 'pane-window'}"></div>
    </div>`).join('');
  list.forEach((e, slot) => fillPane(host.children[slot], e));
  renderPaneHeads();
  if (state.view === 'code') syncScroll();
  markPicked();
}

/** Repaint colours; rebuild a pane only when its tokens, styles or cursor change. */
function refreshPanes({ rebuild = false } = {}) {
  if (state.view === 'gallery') {
    if (rebuild) renderGallery();
    else refreshCard(state.activeId);
    return;
  }
  const panes = [...$('#panes').children];
  const list = paneEntries();
  if (panes.length !== list.length) return renderPanes();
  list.forEach((e, slot) => {
    const pane = panes[slot];
    const box = $('.view', pane);
    if (rebuild || box.dataset.sig !== paneSignature(e.palette)) {
      fillPane(pane, e);
      return;
    }
    paint(pane, e.palette);
    if (state.view === 'window') {
      const wc = windowColors(e);
      if (wc) box.firstElementChild.setAttribute('style', windowStyle(wc.colors, wc.defined));
    }
  });
  markPicked();
}

// ---- gallery ------------------------------------------------------------------------

function cardHtml(e) {
  const wc = windowColors(e);
  const name = e.group === 'repo' ? e.label.replace(/^Custom Alabaster /, '') : e.label;
  const sub = { custom: 'Your edits', repo: 'Your theme', installed: e.extension, builtin: 'VS Code' }[e.group] || '';
  const win = wc
    ? windowHtml({
      mini: true,
      title: e.label,
      colors: wc.colors,
      defined: wc.defined,
      samples: state.samples.samples,
      sampleIndex: state.sample,
      palette: e.palette,
      structure: state.structure,
      semanticKeys: state.samples.semanticKeys,
      cursor: { l: -1, t: -1, select: false },
    })
    : '<div class="pane-loading">Loading…</div>';
  return `<div class="card${e.id === state.activeId ? ' active' : ''}" data-id="${esc(e.id)}" role="button" tabindex="0" title="${esc(e.label)}" style="${roleVars(e.palette)}">
    <div class="card-window">${win}</div>
    <div class="card-caption"><span class="card-name">${esc(name)}</span><span class="card-sub">${esc(sub)}</span></div>
  </div>`;
}

function renderGallery() {
  const list = visibleEntries();
  $('#panes').innerHTML = `<div class="gallery">${list.map(cardHtml).join('') || '<p class="gallery-empty">No themes match.</p>'}</div>`;
}

function refreshCard(id) {
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  const e = entryById(id);
  if (card && e) card.outerHTML = cardHtml(e);
}

function setView(view) {
  state.view = view;
  persist();
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#compareToggle').disabled = view === 'gallery';
  renderPanes();
  renderInspector();
}

function setFocus(on) {
  state.focus = on;
  persist();
  $('.layout').classList.toggle('focus', on);
  $('#focusBtn').classList.toggle('active', on);
  $('#focusBtn').textContent = on ? 'Show panels' : 'Full width';
}

function optionsHtml(selectedId) {
  return GROUPS.map(([group, title]) => {
    const items = entries().filter(e => e.group === group);
    if (!items.length) return '';
    return `<optgroup label="${esc(title)}">${items.map(e =>
      `<option value="${esc(e.id)}"${e.id === selectedId ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</optgroup>`;
  }).join('');
}

function renderPaneHeads() {
  const panes = [...$('#panes').children];
  paneEntries().forEach((e, slot) => {
    const head = panes[slot] && $('.pane-head', panes[slot]);
    if (!head) return;
    head.innerHTML = slot === 0
      ? `<strong>${esc(e.label)}</strong>`
      : `<select class="compare-pick" aria-label="Palette to compare">${optionsHtml(e.id)}</select>`;
  });
}

let syncing = false;
function syncScroll() {
  const codes = [...document.querySelectorAll('.code')];
  for (const code of codes) {
    code.onscroll = () => {
      if (syncing) return;
      syncing = true;
      for (const other of codes) if (other !== code) {
        other.scrollTop = code.scrollTop;
        other.scrollLeft = code.scrollLeft;
      }
      requestAnimationFrame(() => { syncing = false; });
    };
  }
}

function highlightRole(roleId) {
  document.querySelectorAll('.pane').forEach((pane, slot) => {
    const code = $('.code, .w-code', pane);
    if (!code) return;
    const palette = paneEntries()[slot]?.palette;
    code.querySelectorAll('.t.hl').forEach(t => t.classList.remove('hl'));
    if (!roleId || !palette) {
      code.classList.remove('dim');
      return;
    }
    const matching = new Set(ROLES.filter(r => r.id === roleId || sourceRole(palette, r.id) === roleId).map(r => r.id));
    code.classList.add('dim');
    code.querySelectorAll('.t').forEach(t => {
      const role = [...t.classList].find(c => c.startsWith('r-'))?.slice(2);
      if (matching.has(role)) t.classList.add('hl');
    });
  });
}

function renderTabs() {
  const tabs = $('#sampleTabs');
  if (!state.samples) {
    tabs.innerHTML = '';
    return;
  }
  tabs.innerHTML = state.samples.samples.map((s, i) =>
    `<button class="sample-tab${i === state.sample ? ' active' : ''}" data-sample="${i}">${esc(s.file)}</button>`).join('');
}

function renderBanner() {
  const banner = $('#banner');
  const warnings = [...(state.structure?.warnings || [])];
  if (!state.samples) warnings.unshift('No samples captured yet. Run <code>npm run capture</code> in <code>playground/</code>.');
  else if (state.samples.stale) warnings.unshift("Codesandbox's rules changed since the samples were captured, so token roles may be off. Run <code>npm run capture</code> in <code>playground/</code>.");
  banner.hidden = !warnings.length;
  banner.innerHTML = warnings.join('<br>');
}

// ---- inspector --------------------------------------------------------------------

function ruleDescription(key) {
  if (key === 'd') return 'No rule matches, so it uses <code>editor.foreground</code>.';
  if (key[0] === 's') return `Semantic rule <code>${esc(state.samples.semanticKeys[Number(key.slice(1))])}</code>.`;
  const rule = state.structure.tokenColors[Number(key.slice(1))];
  const scopes = Array.isArray(rule.scope) ? rule.scope : String(rule.scope).split(',');
  const shown = scopes.slice(0, 6).map(s => `<code>${esc(s.trim())}</code>`).join(', ');
  return `Rule${rule.name ? ` “${esc(rule.name)}”` : ''}: ${shown}${scopes.length > 6 ? `, and ${scopes.length - 6} more` : ''}`;
}

function renderInspector({ reveal = false } = {}) {
  const box = $('#inspector');
  const p = state.picked;
  const e = p && paneEntries()[p.slot];
  const token = e && state.samples?.samples[state.sample]?.lines[p.l]?.[p.t];
  if (!token) {
    box.textContent = 'Click any token to see which rule and role colour it.';
    return;
  }
  const palette = e.palette;
  const role = tokenRole(token, palette, state.structure, state.samples.semanticKeys);
  const from = sourceRole(palette, role);
  const color = roleColor(palette, role);
  const ratio = contrast(color, palette.ui.background).toFixed(1);
  const roleText = from === role ? ROLE_BY_ID[role].label : `${ROLE_BY_ID[role].label} (uses ${ROLE_BY_ID[from].label})`;
  const punct = role === 'punctuation' ? ' Matched by the code-punctuation rule this palette adds.' : '';
  box.style.setProperty('--ins-bg', palette.ui.background);
  box.innerHTML = `
    <div class="ins-main"><span class="ins-token" style="color:${esc(color)}">${esc(token[0].trim() || token[0])}</span>
      → <strong>${esc(roleText)}</strong> · <code>${esc(color)}</code> · ${ratio}:1 on the background</div>
    <div class="ins-scopes">${ruleDescription(token[1])}${punct}</div>`;
  const row = reveal && document.querySelector(`.role-row[data-role="${from}"]`);
  if (row) {
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    row.scrollIntoView({ block: 'nearest' });
  }
}

function markPicked() {
  document.querySelectorAll('.t.picked').forEach(t => t.classList.remove('picked'));
  const p = state.picked;
  if (!p) return;
  document.querySelectorAll(`.t[data-l="${p.l}"][data-t="${p.t}"]`).forEach(t => t.classList.add('picked'));
}

// ---- sidebar ------------------------------------------------------------------------

function chipHtml(palette) {
  return `<span class="chip" style="background:${esc(palette.ui.background)}">${SWATCH_ROLES.map(r =>
    `<i style="background:${esc(roleColor(palette, r))}"></i>`).join('')}</span>`;
}

function visibleEntries() {
  const q = state.search.trim().toLowerCase();
  return GROUPS.flatMap(([group]) => entries().filter(e => e.group === group &&
    (!q || e.label.toLowerCase().includes(q) || (e.extension || '').toLowerCase().includes(q))));
}

function renderSidebar() {
  const list = $('#paletteList');
  const q = state.search.trim().toLowerCase();
  list.innerHTML = GROUPS.map(([group, title]) => {
    const items = entries().filter(e => e.group === group &&
      (!q || e.label.toLowerCase().includes(q) || (e.extension || '').toLowerCase().includes(q)));
    if (!items.length) return '';
    return `<div class="group-title">${esc(title)}</div>` + items.map(e => {
      const cls = ['pal', e.id === state.activeId ? 'active' : '', state.compare && e.id === state.compareId ? 'compared' : ''].join(' ');
      const sub = e.group === 'installed' ? e.extension : e.group === 'custom' ? sourceText(e) : '';
      const name = e.group === 'repo' ? e.label.replace(/^Custom Alabaster /, '') : e.label;
      return `<button class="${cls}" data-id="${esc(e.id)}" title="${esc(e.label)}">${chipHtml(e.palette)}
        <span class="pal-text"><div class="pal-name">${esc(name)}</div>${sub ? `<div class="pal-ext">${esc(sub)}</div>` : ''}</span></button>`;
    }).join('');
  }).join('');
  list.querySelector('.pal.active')?.scrollIntoView({ block: 'nearest' });
}

// ---- palette editor -------------------------------------------------------------

function ratioClass(r) {
  return r < 3 ? 'low' : r < 4.5 ? 'mid' : '';
}

function rowHtml(id, label, hint) {
  return `<div class="role-row" data-role="${id}">
    <label class="swatch"><input type="color" aria-label="${esc(label)} colour"></label>
    <div class="role-text"><div class="role-name">${esc(label)}</div><div class="role-hint">${hint}</div></div>
    <input class="hex" spellcheck="false" aria-label="${esc(label)} hex">
    <span class="ratio" title="Contrast with the background"></span>
  </div>`;
}

function renderPanelHead() {
  const e = active();
  const head = $('#panelHead');
  if (!head) return;
  const custom = e.group === 'custom';
  head.innerHTML = `
    <input class="pal-title" value="${esc(e.label)}" ${custom ? '' : 'readonly'} aria-label="Palette name" spellcheck="false">
    <div class="pal-meta">${esc(sourceText(e))}${custom ? '' : ' · edits make a copy under “Your edits”'}</div>
    <div class="pal-actions">
      <button data-act="duplicate">Duplicate</button>
      ${custom && e.base && entryById(e.base) ? '<button data-act="reset">Reset to original</button>' : ''}
      ${custom ? '<button data-act="delete">Delete</button>' : ''}
    </div>`;
}

function renderPanel() {
  const panel = $('#panel');
  const e = active();
  if (!e) {
    panel.innerHTML = '';
    return;
  }
  const group = g => ROLES.filter(r => r.group === g);
  panel.innerHTML = `
    <div id="panelHead"></div>
    <h3>Editor</h3>
    ${rowHtml('ui:background', 'Background', 'editor.background')}
    ${rowHtml('ui:lineNumber', 'Line numbers', 'editorLineNumber.foreground')}
    ${rowHtml('ui:lineNumberActive', 'Current line number', 'editorLineNumber.activeForeground')}
    <label class="check"><input type="checkbox" id="commentItalic"> Italic comments</label>
    <h3>Roles</h3>
    ${group('main').map(r => rowHtml(r.id, r.label, esc(r.hint))).join('')}
    <h3>Details</h3>
    <p class="section-hint">These use a main role's colour until you give them their own.</p>
    ${group('detail').map(r => rowHtml(r.id, r.label, '')).join('')}
    <h3>Diffs and logs</h3>
    ${group('status').map(r => rowHtml(r.id, r.label, '')).join('')}`;
  renderPanelHead();
  refreshPanel();
}

function valueOf(palette, key) {
  return key.startsWith('ui:') ? palette.ui[key.slice(3)] : roleColor(palette, key);
}

function refreshPanel() {
  const e = active();
  if (!e) return;
  const palette = e.palette;
  const bg = palette.ui.background;
  document.querySelectorAll('#panel .role-row').forEach(row => {
    const key = row.dataset.role;
    const value = valueOf(palette, key) || '#000000';
    row.querySelector('.swatch').style.background = value;
    const picker = row.querySelector('input[type=color]');
    if (document.activeElement !== picker) picker.value = opaqueHex(value);
    const hex = row.querySelector('.hex');
    if (document.activeElement !== hex) {
      hex.value = value;
      hex.classList.remove('invalid');
    }
    const ratio = row.querySelector('.ratio');
    if (key === 'ui:background') {
      ratio.textContent = '';
    } else {
      const r = contrast(value, bg);
      ratio.textContent = r.toFixed(1);
      ratio.className = `ratio ${ratioClass(r)}`;
    }
    const role = ROLE_BY_ID[key];
    if (role?.group === 'detail') {
      const own = !!palette.roles[key];
      row.classList.toggle('inherited', !own);
      row.querySelector('.role-hint').innerHTML = own
        ? `Own colour <button data-clear="${key}" title="Use ${esc(ROLE_BY_ID[role.parent].label)} again">use ${esc(ROLE_BY_ID[role.parent].label)}</button>`
        : `Uses ${esc(ROLE_BY_ID[sourceRole(palette, key)].label)}`;
    }
  });
  const italic = $('#commentItalic');
  if (italic) italic.checked = !!palette.commentItalic;
}

function updateValue(key, value) {
  const e = editable();
  if (key.startsWith('ui:')) {
    e.palette.ui[key.slice(3)] = value;
    e.palette.type = isDarkColor(e.palette.ui.background) ? 'dark' : 'light';
  } else {
    e.palette.roles[key] = value;
  }
  changed();
}

function changed() {
  persist();
  refreshPanes();
  refreshPanel();
  renderSidebarChip(state.activeId);
  renderInspector();
}

function renderSidebarChip(id) {
  const button = document.querySelector(`.pal[data-id="${CSS.escape(id)}"]`);
  const e = entryById(id);
  if (button && e) button.querySelector('.chip').outerHTML = chipHtml(e.palette);
}

// ---- export and save ------------------------------------------------------------

async function buildTheme(e, name) {
  const palette = e.palette;
  const colors = { ...(await rawColors(e)), ...themeColorOverrides(palette) };
  const { tokenColors, semanticTokenColors } = buildSyntax(state.structure, palette);
  return {
    $schema: 'vscode://schemas/color-theme',
    name,
    type: isDarkColor(palette.ui.background) ? 'dark' : 'light',
    colors,
    tokenColors,
    semanticHighlighting: true,
    semanticTokenColors,
  };
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme';

let toastTimer;
function toast(message, isError = false) {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast${isError ? ' error' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 3500);
}

async function copySyntax() {
  const { tokenColors, semanticTokenColors } = buildSyntax(state.structure, active().palette);
  await navigator.clipboard.writeText(JSON.stringify({ tokenColors, semanticHighlighting: true, semanticTokenColors }, null, 2));
  toast('Copied tokenColors and semanticTokenColors');
}

async function downloadTheme() {
  const e = active();
  const name = `${THEME_PREFIX}${shortName(e.label)}`;
  const theme = await buildTheme(e, name);
  const url = URL.createObjectURL(new Blob([JSON.stringify(theme, null, 2) + '\n'], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `Abraham-code-sandbox-${slug(shortName(e.label))}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openSave() {
  const e = active();
  const dialog = $('#saveDialog');
  const form = $('form', dialog);
  form.label.value = `${THEME_PREFIX}${shortName(e.label)}`;
  form.file.value = `Abraham-code-sandbox-${slug(shortName(e.label))}.json`;
  $('.dialog-error', dialog).hidden = true;
  dialog.showModal();
  form.label.select();
}

async function confirmSave(event) {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  const dialog = $('#saveDialog');
  const form = $('form', dialog);
  const error = $('.dialog-error', dialog);
  const button = $('#saveConfirm');
  button.disabled = true;
  try {
    const label = form.label.value.trim();
    const theme = await buildTheme(active(), label);
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: form.file.value.trim(), label, theme }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Save failed');
    dialog.close();
    toast(body.added ? `Saved ${body.file} and added it to package.json` : `Updated ${body.file}`);
    await reloadThemes();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function reloadThemes() {
  const data = await (await fetch('/api/state')).json();
  state.themes = data.themes;
  state.colorDefaults = data.colorDefaults || state.colorDefaults;
  renderSidebar();
  if (state.view === 'gallery') renderGallery();
}

// ---- import -------------------------------------------------------------------------

async function importFile(file) {
  try {
    const theme = parseJsonc(await file.text());
    if (!theme || (!theme.tokenColors && !theme.colors)) throw new Error('This file has no colors or tokenColors.');
    theme.tokenColors = Array.isArray(theme.tokenColors) ? theme.tokenColors : [];
    const palette = extractPalette(theme, state.structure, themeIsDark(theme)) ?? derivePalette(theme);
    const e = {
      id: `custom:${Date.now().toString(36)}`,
      label: uniqueLabel(theme.name || file.name.replace(/\.jsonc?$/i, '')),
      group: 'custom',
      importedFrom: file.name,
      palette,
      colors: theme.colors || {},
    };
    state.custom.unshift(e);
    state.activeId = e.id;
    persist();
    renderAll();
    toast(theme.include
      ? `Imported ${file.name}. Its "include" base theme isn't read, so some colours may be missing.`
      : `Imported ${file.name}`);
  } catch (err) {
    toast(`Couldn't import ${file.name}: ${err.message}`, true);
  }
}

// ---- events -------------------------------------------------------------------------

function select(id, { compare = false } = {}) {
  if (!entryById(id)) return;
  if (compare) {
    state.compareId = id;
    if (!state.compare) {
      state.compare = true;
      $('#compareToggle').checked = true;
    }
  } else {
    state.activeId = id;
  }
  persist();
  renderSidebar();
  if (!compare) renderPanel();
  if (state.view === 'gallery') setView('window');
  else renderPanes();
  renderInspector();
}

function setSample(i) {
  if (!state.samples) return;
  const n = state.samples.samples.length;
  state.sample = (i + n) % n;
  state.picked = null;
  persist();
  renderTabs();
  renderPanes();
  renderInspector();
}

function bind() {
  $('#search').addEventListener('input', ev => {
    state.search = ev.target.value;
    renderSidebar();
    if (state.view === 'gallery') renderGallery();
  });
  document.querySelector('.seg').addEventListener('click', ev => {
    const button = ev.target.closest('[data-view]');
    if (button) setView(button.dataset.view);
  });
  $('#focusBtn').addEventListener('click', () => setFocus(!state.focus));
  $('#paletteList').addEventListener('click', ev => {
    const button = ev.target.closest('.pal');
    if (button) select(button.dataset.id, { compare: ev.shiftKey });
  });
  $('#sampleTabs').addEventListener('click', ev => {
    const tab = ev.target.closest('.sample-tab');
    if (tab) setSample(Number(tab.dataset.sample));
  });
  $('#compareToggle').addEventListener('change', ev => {
    state.compare = ev.target.checked;
    if (state.compare && !entryById(state.compareId)) state.compareId = state.activeId;
    persist();
    renderSidebar();
    renderPanes();
  });
  $('#panes').addEventListener('change', ev => {
    if (ev.target.matches('.compare-pick')) select(ev.target.value, { compare: true });
  });
  $('#panes').addEventListener('click', ev => {
    const card = ev.target.closest('.card');
    if (card) {
      select(card.dataset.id, { compare: ev.shiftKey });
      return;
    }
    const fileLink = ev.target.closest('[data-sample]');
    if (fileLink) {
      setSample(Number(fileLink.dataset.sample));
      return;
    }
    const t = ev.target.closest('.t');
    const pane = ev.target.closest('.pane');
    if (!t || !pane) return;
    state.picked = { slot: Number(pane.dataset.slot), l: Number(t.dataset.l), t: Number(t.dataset.t) };
    if (state.view === 'window') {
      state.cursors[state.sample] = { l: state.picked.l, t: state.picked.t, select: ev.detail === 2 };
      refreshPanes({ rebuild: true });
    }
    markPicked();
    renderInspector({ reveal: true });
  });
  $('#panes').addEventListener('keydown', ev => {
    const card = ev.target.closest('.card');
    if (card && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      select(card.dataset.id, { compare: ev.shiftKey });
    }
  });

  const panel = $('#panel');
  panel.addEventListener('input', ev => {
    const row = ev.target.closest('.role-row');
    if (ev.target.type === 'color' && row) updateValue(row.dataset.role, ev.target.value);
    if (ev.target.classList.contains('hex') && row) {
      const value = normalizeHex(ev.target.value);
      ev.target.classList.toggle('invalid', !value);
      if (value) updateValue(row.dataset.role, value);
    }
    if (ev.target.id === 'commentItalic') {
      editable().palette.commentItalic = ev.target.checked;
      changed();
    }
  });
  panel.addEventListener('focusout', ev => {
    if (ev.target.classList.contains('hex')) refreshPanel();
    if (ev.target.classList.contains('pal-title') && !ev.target.readOnly) {
      const e = active();
      const label = ev.target.value.trim();
      if (label && label !== e.label) {
        e.label = uniqueLabel(label);
        persist();
        renderSidebar();
        renderPaneHeads();
      }
      ev.target.value = e.label;
    }
  });
  panel.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches('.pal-title, .hex')) ev.target.blur();
  });
  panel.addEventListener('click', ev => {
    const clear = ev.target.closest('[data-clear]');
    if (clear) {
      delete editable().palette.roles[clear.dataset.clear];
      changed();
      return;
    }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    const e = active();
    if (act === 'duplicate') {
      const copy = {
        ...structuredClone(e),
        id: `custom:${Date.now().toString(36)}`,
        label: uniqueLabel(`${shortName(e.label)} (custom)`),
        group: 'custom',
        base: e.group === 'custom' ? e.base : e.id,
      };
      state.custom.unshift(copy);
      select(copy.id);
    } else if (act === 'reset') {
      e.palette = structuredClone(entryById(e.base).palette);
      changed();
      renderPanel();
    } else if (act === 'delete') {
      state.custom = state.custom.filter(c => c.id !== e.id);
      const fallback = (e.base && entryById(e.base)) || entries()[0];
      if (state.compareId === e.id) state.compareId = fallback.id;
      select(fallback.id);
    }
  });
  panel.addEventListener('mouseover', ev => {
    const row = ev.target.closest('.role-row');
    const role = row && !row.dataset.role.startsWith('ui:') ? row.dataset.role : null;
    if (role !== panel.dataset.hover) {
      panel.dataset.hover = role || '';
      highlightRole(role);
    }
  });
  panel.addEventListener('mouseleave', () => {
    panel.dataset.hover = '';
    highlightRole(null);
  });

  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', ev => {
    const file = ev.target.files[0];
    if (file) importFile(file);
    ev.target.value = '';
  });
  $('#copyBtn').addEventListener('click', () => copySyntax().catch(err => toast(err.message, true)));
  $('#downloadBtn').addEventListener('click', () => downloadTheme().catch(err => toast(err.message, true)));
  $('#saveBtn').addEventListener('click', openSave);
  $('#saveDialog form').addEventListener('submit', confirmSave);
  $('#saveCancel').addEventListener('click', () => $('#saveDialog').close());

  let depth = 0;
  window.addEventListener('dragenter', ev => {
    if (![...ev.dataTransfer.types].includes('Files')) return;
    depth++;
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('dragging');
  });
  window.addEventListener('dragover', ev => ev.preventDefault());
  window.addEventListener('drop', ev => {
    ev.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    const file = ev.dataTransfer.files[0];
    if (file) importFile(file);
  });

  document.addEventListener('keydown', ev => {
    if (ev.target.closest('input, select, textarea, dialog') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'j' || ev.key === 'k') {
      const list = visibleEntries();
      const i = list.findIndex(e => e.id === state.activeId);
      const next = list[(i + (ev.key === 'ArrowDown' || ev.key === 'j' ? 1 : -1) + list.length) % list.length];
      if (next) select(next.id);
      ev.preventDefault();
    } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      setSample(state.sample + (ev.key === 'ArrowRight' ? 1 : -1));
      ev.preventDefault();
    } else if (ev.key === 'f') {
      setFocus(!state.focus);
    } else if (ev.key === '1' || ev.key === '2' || ev.key === '3') {
      setView(['window', 'code', 'gallery'][Number(ev.key) - 1]);
    }
  });
}

function installRoleCss() {
  const style = document.createElement('style');
  style.textContent = ROLES.map(r => `.r-${r.id}{color:var(--r-${r.id})}`).join('\n');
  document.head.append(style);
}

function renderAll() {
  $('#compareToggle').checked = state.compare;
  $('#compareToggle').disabled = state.view === 'gallery';
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  setFocus(state.focus);
  renderBanner();
  renderSidebar();
  renderTabs();
  renderPanel();
  renderPanes();
  renderInspector();
}

async function init() {
  const data = await (await fetch('/api/state')).json();
  state.structure = data.structure;
  state.samples = data.samples;
  state.themes = data.themes;
  state.colorDefaults = data.colorDefaults || {};
  const saved = restore();
  if (['window', 'code', 'gallery'].includes(saved.view)) state.view = saved.view;
  state.focus = !!saved.focus;
  state.custom = Array.isArray(saved.custom) ? saved.custom : [];
  state.compare = !!saved.compare;
  state.sample = Math.min(Math.max(saved.sample || 0, 0), Math.max((state.samples?.samples.length || 1) - 1, 0));
  const byLabel = label => state.themes.find(t => t.label === label && t.palette)?.id;
  const first = entries()[0]?.id;
  state.activeId = entryById(saved.activeId) ? saved.activeId : byLabel('Custom Alabaster Codesandbox') ?? first;
  state.compareId = entryById(saved.compareId) ? saved.compareId : byLabel('One Dark Pro') ?? state.activeId;
  installRoleCss();
  bind();
  renderAll();
}

init().catch(err => {
  document.body.innerHTML = `<pre style="padding:20px;color:#ff8a8a">The playground couldn't start: ${esc(err.stack || err)}</pre>`;
});
