// Propagate the reviewed Codesandbox roles, not its literal dark colours.
// Unlisted UI keys stay variant-owned (canvas, selections, git colours, etc.).
import { analyzeStructure, buildSyntax, buildIconColors } from './structure.js';
import { composite, toHex } from './color.js';

export const UI_GROUPS = {
  float: ['breadcrumbPicker.background', 'debugToolBar.background', 'dropdown.listBackground',
    'editorActionList.background', 'editorGroup.dropIntoPromptBackground', 'editorHoverWidget.background',
    'editorMarkerNavigation.background', 'editorSuggestWidget.background', 'editorWidget.background',
    'inlineChat.background', 'listFilterWidget.background', 'menu.background', 'notifications.background',
    'peekViewEditor.background', 'peekViewEditorGutter.background', 'peekViewEditorStickyScroll.background',
    'peekViewEditorStickyScrollGutter.background', 'peekViewResult.background', 'quickInput.background'],
  border: ['debugToolBar.border', 'editorGroup.dropIntoPromptBorder', 'editorHoverWidget.border',
    'editorSuggestWidget.border', 'editorWidget.border', 'inlineChat.border', 'listFilterWidget.outline',
    'menu.border', 'notificationCenter.border', 'notificationToast.border', 'peekView.border',
    'settings.dropdownListBorder', 'widget.border'],
  header: ['editorHoverWidget.statusBarBackground', 'peekViewTitle.background'],
  focus: ['editorActionList.focusBackground', 'editorSuggestWidget.selectedBackground',
    'menu.selectionBackground', 'peekViewResult.selectionBackground', 'quickInputList.focusBackground'],
  icon: ['activityBar.inactiveForeground', 'activityBarTop.inactiveForeground',
    'commandCenter.inactiveForeground', 'titleBar.inactiveForeground', 'checkbox.border', 'settings.checkboxBorder'],
  muted: ['gitDecoration.ignoredResourceForeground', 'list.deemphasizedForeground',
    'panelTitle.inactiveForeground', 'tab.inactiveForeground', 'tab.unfocusedInactiveForeground', 'statusBar.foreground'],
  secondary: ['breadcrumb.foreground'],
  accent: ['agentsGradient.tintColor', 'button.background', 'chart.line', 'chat.inputWorkingBorderColor1',
    'editor.findMatchBorder', 'extensionButton.prominentBackground', 'inlineEdit.gutterIndicator.primaryBorder',
    'inlineEdit.gutterIndicator.successfulBackground', 'inlineEdit.gutterIndicator.successfulBorder', 'terminal.findMatchBorder'],
  buttonText: ['button.foreground', 'extensionButton.prominentForeground', 'inlineEdit.gutterIndicator.successfulForeground'],
  buttonHover: ['button.hoverBackground', 'extensionButton.prominentHoverBackground'],
};

export function buildVariant(source, current, config) {
  const structure = analyzeStructure(source);
  if (structure.warnings.length) throw new Error(structure.warnings.join('\n'));
  const palette = { roles: config.roles, commentItalic: false };
  const colors = { ...current.colors };
  // Light Soft's former pale blue is unsuitable for small text on light surfaces.
  // Keep every existing accent use (including alpha) coherent with the new accent.
  for (const [key, alpha] of Object.entries(config.accentUses)) {
    colors[key] = config.ui.accent + alpha;
  }
  for (const [role, keys] of Object.entries(UI_GROUPS)) {
    for (const key of keys) colors[key] = config.ui[role];
  }
  const set = (value, ...keys) => { for (const key of keys) colors[key] = value; };
  const c = current.colors;
  const accent = config.ui.accent;
  set(config.ui.buttonText + '66', 'button.separator', 'extensionButton.separator');
  set(c['input.background'], 'checkbox.background', 'settings.checkboxBackground',
    'dropdown.background', 'settings.dropdownBackground', 'editorWidget.resizeBorder', 'notifications.border');
  set(c['input.border'], 'dropdown.border', 'settings.dropdownBorder');
  set(config.roles.comment, 'editorInlayHint.foreground', 'editorInlayHint.parameterForeground', 'editorInlayHint.typeForeground');
  set(config.roles.plain, 'editorSuggestWidget.foreground');
  set(accent + 'b3', 'agentsUpdateButton.downloadedBackground');
  set(accent + '66', 'agentsUpdateButton.downloadingBackground', 'inlineEdit.gutterIndicator.primaryBackground');
  set(accent + '33', 'chat.findMatchBackground', 'editor.findMatchBackground', 'terminal.findMatchBackground');
  set(accent + '99', 'editorOverviewRuler.rangeHighlightForeground');
  set(accent + '80', 'terminalOverviewRuler.findMatchForeground');
  set(c['editorOverviewRuler.selectionHighlightForeground'], 'editorOverviewRuler.findMatchForeground');
  const modified = c['gitDecoration.modifiedResourceForeground'];
  set(modified + '99', 'editorOverviewRuler.incomingContentForeground');
  set(toHex(composite(modified + '80', c['editor.background'])), 'editorGutter.modifiedSecondaryBackground');
  return { ...current, colors: { ...colors, ...buildIconColors(structure, palette) },
    ...buildSyntax(structure, palette), semanticHighlighting: true };
}
