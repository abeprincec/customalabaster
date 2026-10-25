# Roles Playground

Try any colour palette on the syntax roles every Custom Alabaster theme shares.

The roles come from Codesandbox's token rules (`themes/Abraham-code-sandbox.json`, which is
VS Code's Dark+ rule set). Each rule plays a role (Plain, Keywords, Functions, Types, Built-ins,
Constants, Strings, Tags, Embedded, Comments, plus a few details), and a palette only picks a colour per
role. So every palette you try keeps your rules: parameters and `let` variables stay plain, `const`
values use the Constants colour, functions use the Functions colour wherever they appear, and so on.

## Run it

```sh
cd playground
npm start            # or: node server.mjs
```

Then open http://127.0.0.1:7317 (it uses the next free port if 7317 is taken; set `PORT` to choose one).
It needs Node 22 or newer and nothing from npm.

## Views

- **Window**: a VS Code window in the theme. It has the title bar, activity bar, explorer with git colours, tabs,
  breadcrumbs, the editor (current line, word highlights, indent guides, git gutter, minimap), the terminal
  and the status bar. Click a token to move the cursor there, or double-click to select it. Click a file or
  tab to open it.
- **Code**: just the code, larger.
- **Gallery**: every palette as a small window, like vscodethemes.com. Click one to open it.

The window's interface colours are the theme's own. Where a theme leaves a colour out, the app fills it in the
way VS Code does, using the default colour rules it reads from your installed VS Code (cached in
`data/color-defaults.json` and refreshed when VS Code updates). On 2026-10-23 those resolved colours matched
VS Code's own "Generate Color Theme" output on every key the window uses for all 64 themes.

"Full width" (or F) hides the side panels. 1, 2 and 3 switch views.

## What it does

- **Palettes from every theme you have.** Your themes in this repo, every installed extension theme
  (One Dark Pro, Night Owl, GitHub, Pierre…) and VS Code's built-in ones. Themes built on the shared rules
  (Codesandbox and its variants, Pierre 2, Solarized Dark) are read exactly. For any other theme each role
  takes the colour that theme gives a typical token of that role, e.g. Functions take One Dark Pro's colour
  for a function call.
- **Preview that matches VS Code.** The sample files were rendered in a real VS Code, so semantic
  highlighting (from TypeScript and Pylance) is included. `npm run capture -- --verify` re-checks every
  character against VS Code for each theme built on the rules.
- **Edit roles.** Change any role or detail colour, the background and line numbers. Editing a theme
  makes a copy under "Your edits", kept in the browser's local storage. Hover a role to highlight its
  tokens; click a token to see which rule and role colour it.
- **Compare** two palettes side by side. Shift-click a palette to put it on the right.
- **Import** any VS Code theme `.json` (button or drag and drop).
- **Export.** "Download theme" writes a complete theme: the source theme's interface colours plus the
  shared rules in your palette. "Copy syntax JSON" copies only `tokenColors` and `semanticTokenColors`.
- **Save to extension** writes `themes/<file>.json` and adds it to `package.json`. It never overwrites a
  theme it didn't create (those are listed in `data/saved.json`). Reload VS Code to pick the new theme.

Keyboard: ↑ ↓ (or j k) switch palette, ← → switch sample file.

## Refreshing the samples

`data/samples.json` records, for every character of the files in `samples/`, which of Codesandbox's rules
coloured it in VS Code. Re-run the capture after changing Codesandbox's rules (the app warns when they
changed) or the sample files:

```sh
npm run capture              # about 30 seconds
npm run capture -- --verify  # also compare against your themes in a real VS Code
```

The capture starts a hidden VS Code with throwaway settings. It loads your Python and TypeScript (tsgo)
extensions when you have them, so semantic colours match your editor; pass `--plain` to skip them.

## Files

- `server.mjs`: serves the app, finds themes, saves new ones
- `lib/`: shared by the server, the app and the capture tool
  - `structure.js`: the roles, and building `tokenColors` from a palette
  - `derive.js`: palette from any theme
  - `textmate.js`: VS Code's TextMate theme matching
  - `samples.js`: token format
  - `workbench.js`: VS Code's colour maths, and resolving interface colours
  - `vscode-colors.js`: reads VS Code's default colours from its workbench bundle (server only)
- `public/window.js` and `public/window.css`: the VS Code window
- `public/`: the app
- `tools/capture.mjs`: renders the samples in VS Code
- `samples/`: the sample files (plus `types/` and `tsconfig.json` so TypeScript resolves them)
