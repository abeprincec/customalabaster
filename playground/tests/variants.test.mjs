import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseJsonc } from '../lib/jsonc.js';
import { analyzeStructure, extractPalette, firstScope, roleColor } from '../lib/structure.js';
import { compileTheme, styleFor } from '../lib/textmate.js';
import { contrast, normalizeHex } from '../lib/color.js';
import { tokenColor, tokenStyle } from '../lib/samples.js';
import { buildVariant } from '../lib/variants.js';

const root = new URL('../../', import.meta.url);
const read = p => parseJsonc(fs.readFileSync(new URL(p, root), 'utf8'));
const source = read('themes/Abraham-code-sandbox.json');
const structure = analyzeStructure(source);
const configs = read('playground/data/variant-palettes.json');
const samples = read('playground/data/samples.json');
const canonical = scope => JSON.stringify(Array.isArray(scope) ? scope : [scope]);
const expectedCanvas = { 'dark-soft': '#1f1f1f', light: '#ffffff', 'light-soft': '#fafafa' };
const expectedModified = { 'dark-soft': '#5989c0', light: '#2a7bbf', 'light-soft': '#2578bc' };

const probes = [
  ['source.python', 'constant.character.format.placeholder.other.python', 'embedded'],
  ['source.rust', 'punctuation.definition.interpolation', 'embedded'],
  ['source.go', 'constant.other.placeholder', 'embedded'],
  ['source.tsx', 'punctuation.definition.template-expression.begin', 'embedded'],
  ['source.tsx', 'punctuation.section.embedded', 'embedded'],
  ['source.php', 'punctuation.section.embedded.begin.php', 'embedded'],
  ['source.go', 'entity.name.type.package.go', 'builtin'],
  ['source.rust', 'keyword.operator.access.dot.rust', 'plain'],
  ['source.rust', 'keyword.operator.namespace.rust', 'plain'],
  ['source.js', 'constant.character.character-class.regexp', 'builtin'],
  ['text.html.basic', 'constant.character.entity', 'builtin'],
  ['source.js', 'punctuation.definition.character-class.regexp', 'plain'],
  ['text.html.basic', 'comment', 'comment'],
  ['text.html.markdown', 'punctuation.definition.quote.begin.markdown', 'comment'],
  ['source.js', 'entity.name.label', 'plain'],
];

for (const [suffix, config] of Object.entries(configs)) {
  const theme = read(`themes/Abraham-code-sandbox-${suffix}.json`);
  const colors = theme.colors;
  const palette = extractPalette(theme, structure, theme.type === 'dark');
  test(`${suffix}: regenerated output is current and retains variant identity`, () => {
    assert.deepEqual(buildVariant(source, theme, config), theme);
    assert.equal(colors['editor.background'], expectedCanvas[suffix]);
    for (const key of ['sideBar.background', 'panel.background', 'tab.inactiveBackground', 'statusBar.background']) {
      assert.equal(colors[key], expectedCanvas[suffix], key);
    }
    assert.equal(colors['gitDecoration.modifiedResourceForeground'], expectedModified[suffix]);
    assert.equal(colors['editorGutter.modifiedBackground'], expectedModified[suffix]);
    // A syntax-only source edit must not replace variant-owned UI choices.
    const sentinel = structuredClone(theme);
    sentinel.colors['list.hoverBackground'] = '#123456';
    sentinel.colors['editorLineNumber.foreground'] = '#654321';
    const rebuilt = buildVariant(source, sentinel, config);
    assert.equal(rebuilt.colors['list.hoverBackground'], '#123456');
    assert.equal(rebuilt.colors['editorLineNumber.foreground'], '#654321');
    assert.equal(palette.mismatches, 0);
    assert.deepEqual(theme.tokenColors.map(r => canonical(r.scope)), structure.tokenColors.map(r => canonical(r.scope)));
    assert.deepEqual(Object.keys(theme.semanticTokenColors), structure.semanticKeys);
    const edited = structuredClone(config);
    edited.roles.builtin = '#123456';
    const editedTheme = buildVariant(source, theme, edited);
    const regex = editedTheme.tokenColors.find(r => firstScope(r) === 'constant.character.character-class.regexp');
    assert.equal(regex.settings.foreground, '#123456', 'regex inherits Built-ins without an old tag override');
  });
  test(`${suffix}: reviewed language roles and semantic overrides`, () => {
    const compiled = compileTheme(theme.tokenColors, { foreground: colors['editor.foreground'], fontStyle: 0 });
    for (const [language, scope, role] of probes) {
      assert.equal(normalizeHex(styleFor(compiled, [language, scope]).foreground),
        normalizeHex(roleColor(config, role)), scope);
    }
    for (const [key, role] of Object.entries({ 'class.builtin': 'builtin', selfParameter: 'keyword',
      clsParameter: 'keyword', 'property.readonly': 'plain', 'variable.readonly.local': 'plain' })) {
      assert.equal(normalizeHex(theme.semanticTokenColors[key]), normalizeHex(config.roles[role]), key);
    }
    assert.notEqual(config.roles.embedded, config.roles.tag);
  });
  test(`${suffix}: affected text >=4.5:1 and inactive icons/checkboxes >=3:1`, () => {
    const check = (fg, bg, min = 4.5) => {
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= min, `${fg} on ${bg}: ${ratio.toFixed(3)} < ${min}`);
    };
    check(config.roles.comment, colors['editor.background']);
    check(config.roles.embedded, colors['editor.background']);
    // Light palettes also meet the target on their current-line tint.
    if (theme.type === 'light') {
      check(config.roles.comment, colors['editor.lineHighlightBackground']);
      check(config.roles.embedded, colors['editor.lineHighlightBackground']);
    }
    for (const [fg, bg] of [
      ['editorInlayHint.foreground', 'editorInlayHint.background'],
      ['editorInlayHint.parameterForeground', 'editorInlayHint.parameterBackground'],
      ['editorInlayHint.typeForeground', 'editorInlayHint.typeBackground'],
      ['tab.inactiveForeground', 'tab.inactiveBackground'],
      ['tab.unfocusedInactiveForeground', 'tab.unfocusedInactiveBackground'],
      ['panelTitle.inactiveForeground', 'panel.background'],
      ['gitDecoration.ignoredResourceForeground', 'sideBar.background'],
      ['gitDecoration.ignoredResourceForeground', 'list.hoverBackground'],
      ['list.deemphasizedForeground', 'list.inactiveSelectionBackground'],
      ['statusBar.foreground', 'statusBar.background'],
      ['breadcrumb.foreground', 'breadcrumb.background'],
      ['editorSuggestWidget.foreground', 'editorSuggestWidget.background'],
      ['editorSuggestWidget.highlightForeground', 'editorSuggestWidget.background'],
      ['editorSuggestWidget.focusHighlightForeground', 'editorSuggestWidget.selectedBackground'],
      ['editorHoverWidget.highlightForeground', 'editorHoverWidget.background'],
      ['quickInputList.focusHighlightForeground', 'quickInputList.focusBackground'],
      ['editorSuggestWidget.selectedForeground', 'editorSuggestWidget.selectedBackground'],
      ['quickInput.foreground', 'quickInput.background'],
      ['quickInputList.focusForeground', 'quickInputList.focusBackground'],
      ['editorHoverWidget.foreground', 'editorHoverWidget.background'],
      ['button.foreground', 'button.background'], ['button.foreground', 'button.hoverBackground'],
      ['extensionButton.prominentForeground', 'extensionButton.prominentBackground'],
    ]) check(colors[fg], colors[bg]);
    for (const [fg, bg] of [['activityBar.inactiveForeground', 'activityBar.background'],
      ['checkbox.border', 'checkbox.background'], ['settings.checkboxBorder', 'settings.checkboxBackground']]) {
      check(colors[fg], colors[bg], 3);
    }
  });
  test(`${suffix}: replay the saved VS Code rule capture (not a fresh VS Code render)`, () => {
    assert.equal(samples.structureHash, structure.hash, 'capture needs refreshing after structural edits');
    assert.deepEqual(samples.semanticKeys, structure.semanticKeys);
    let characters = 0;
    for (const sample of samples.samples) for (const line of sample.lines) for (const token of line) {
      const [text, key, style] = token;
      let actual = colors['editor.foreground'];
      if (key.startsWith('t')) actual = theme.tokenColors[Number(key.slice(1))].settings.foreground;
      if (key.startsWith('s')) actual = theme.semanticTokenColors[samples.semanticKeys[Number(key.slice(1))]];
      if (typeof actual === 'object') actual = actual.foreground;
      assert.equal(normalizeHex(actual), normalizeHex(tokenColor(token, palette, structure, samples.semanticKeys)), `${sample.file}: ${text}`);
      assert.equal(tokenStyle(token, palette), style);
      characters += text.length;
    }
    assert.equal(characters, 5004);
  });
}

test('manifest themes and product icons still resolve', () => {
  const pkg = read('package.json');
  for (const entry of [...pkg.contributes.themes, ...pkg.contributes.productIconThemes]) {
    assert.ok(fs.existsSync(new URL(entry.path.replace(/^\.?\//, ''), root)), entry.path);
  }
});
