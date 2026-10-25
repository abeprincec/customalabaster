// Captured sample tokens are [text, key, style, flags]:
//   key   which rule coloured the token in VS Code: "t<i>" tokenColors rule i of the
//         structure, "s<j>" semantic rule j, "d" no rule (editor.foreground)
//   style fontStyle from the structure: i italic, b bold, u underline, s strikethrough
//   flags 1 = the optional code-punctuation rule would match, 2 = inside a comment
import { roleColor } from './structure.js';

export const FLAG_PUNCTUATION = 1;
export const FLAG_COMMENT = 2;

export function tokenRole(token, palette, structure, semanticKeys) {
  const [, key, , flags] = token;
  if (flags & FLAG_PUNCTUATION && palette.roles.punctuation) return 'punctuation';
  if (key === 'd') return 'defaultText';
  if (key[0] === 't') return structure.ruleRoles[Number(key.slice(1))] ?? 'plain';
  if (key[0] === 's') return structure.semanticRoles[semanticKeys[Number(key.slice(1))]] ?? 'plain';
  return 'plain';
}

export function tokenStyle(token, palette) {
  const [, , style, flags] = token;
  return palette.commentItalic && flags & FLAG_COMMENT && !style.includes('i') ? style + 'i' : style;
}

export function tokenColor(token, palette, structure, semanticKeys) {
  return roleColor(palette, tokenRole(token, palette, structure, semanticKeys));
}
