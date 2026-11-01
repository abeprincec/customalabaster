# Codesandbox variant propagation

This follow-up is based on PR #3's `3217fc925ab26179d8c468547602a3aeaf161262`.
The existing stack is `main` <- #1 <- #2 <- #3. It does not change Codesandbox itself,
Pierre, Pierre 2, Pierre Dark Soft, Solarized, the extension manifest, or release version.

## Generation

The playground's existing `analyzeStructure`, `buildSyntax`, and `buildIconColors` functions
remain the source of shared syntax rules. `data/variant-palettes.json` records each variant's
palette explicitly. `lib/variants.js` maps the reviewed interface roles to variant-specific
surfaces. The generator only writes Dark Soft, Light and Light Soft; it preserves their other
interface keys. Edit the palette configuration and generator, then regenerate the JSON files:

```sh
cd playground
npm run generate:variants
npm run check:variants
npm test
```

No dependencies are required; use Node 22 or later. The PR workflow runs the last two commands.
The generation check is read-only and fails on stale generated output. It does not publish.

The old palette extractor interprets old regex-class and label colours as intentional detail
choices. Those overrides are deliberately absent from the new palette configuration: regex
classes follow Built-ins, labels follow Plain. The regex detail role's parent is also corrected
in the playground. Python builtin/self/cls/local-readonly overrides and interpolation scopes
are rebuilt from the reviewed source instead of copied from the stale variants.

## Palette decisions

The canvases and code colours retain the original One Dark/One Light family and soft variants.
Dark Soft already had readable comments, so it keeps that grey. Light comments become a darker,
slightly cool grey. Interpolation uses a distinct burnt orange in each palette instead of tag red
or pink. Ordinary syntax colours remain unchanged apart from the reviewed role corrections and
mapping diff text to each variant's existing dimmed git-modified colour.

| Variant | Canvas | Comments | Canvas contrast | Interpolation | Canvas contrast | Muted UI text |
| --- | --- | --- | --- | --- | --- | --- |
| Dark Soft | `#1f1f1f` | `#8d929b` | 5.27:1 | `#d98e76` | 6.34:1 | `#969696` |
| Light | `#ffffff` | `#65676e` | 5.65:1 | `#b04320` | 5.72:1 | `#6b6b6b` |
| Light Soft | `#fafafa` | `#65676e` | 5.41:1 | `#af4323` | 5.51:1 | `#686868` |

Docked surfaces stay one colour. Floating surfaces, their headers, focused rows, and borders
get separate palette-specific steps. On light themes, elevation uses darker neutral steps,
not the dark theme's hex values. Checkboxes and dropdowns use the existing filled input colour.
Button separators follow button text, including Dark Soft's new dark-on-light accent button.

Light accents are blue `#075fcd` / `#075cc5`, darkened enough for small highlighted text on
focused floating rows (4.68:1 / 4.71:1). White button text remains above 4.5:1; hover is darker.
Dark Soft keeps its pale `#98d8f9` accent with dark button text. The config enumerates existing
accent uses, preserving their alpha, rather than globally replacing unrelated blue syntax.

## Verification and limits

Local checks pass: 13 tests, deterministic regeneration, JSON parsing, manifest resource paths,
reviewed language-scope probes, semantic overrides, and palette round-tripping with zero mismatches.
Contrast checks use the repository's alpha-aware contrast helper. Comments/interpolation meet
4.5:1 on their canvases, comments meet it on inlay backgrounds, and both also meet it on the
light themes' current-line backgrounds. Affected inactive labels, hovered ignored files,
buttons, suggestion highlights and selected rows are checked on their actual surfaces;
inactive icons and checkbox boundaries meet 3:1.

These are targeted checks, not a full accessibility certification. Existing light-palette
colours such as types, strings and tags remain below 4.5:1; brightening or darkening the whole
syntax palette would be a separate design change. Dark Soft's existing comments fall below
4.5:1 on its current-line highlight, though they pass on the editor canvas and inlay surfaces.
Line numbers, dimmed unused code, ANSI colours, all possible selection/diff overlays and
colour-vision deficiencies are not certified by these checks.

The checked-in VS Code 1.143 capture has the same structure hash (`947ee568`). All 5004 saved
characters replay consistently for each variant. This confirms rule/palette consistency;
it is not a new render or an independent visual review. `data/samples.json` is unchanged.

A fresh `npm run capture -- --verify` was attempted here and failed because the installed
`code` launcher reports that VS Code is not installed; no workbench started. No new screenshots
or model scores are claimed. Before marking the PR ready, run on a machine with desktop VS Code
and the same Pylance and TypeScript native-preview extensions as the saved capture:

```sh
cd playground
npm run capture -- --verify
```

Inspect its per-theme results: older Pierre/Solarized themes are outside this change and may
still mismatch; Codesandbox plus these three variants should match all captured characters.
The capture regenerates samples: inspect the diff and retain it only when intentional.

For visual approval, launch the repository's Extension Development Host with F5 (or
`code --new-window --extensionDevelopmentPath=/absolute/path/to/customalabaster`), switch among
all four Codesandbox themes, and compare against the same session on the parent commit.
Check TS/TSX comments, template/JSX braces, local consts and readonly props; Python builtin types,
self/cls and f-strings; Go packages/format placeholders; Rust paths/format strings; HTML entities
and regex escapes/brackets. Also inspect palette, hover, suggest, peek, menus, notifications,
buttons including hover/separators, find results, ignored files including hover, inactive tabs,
panel labels and inlay hints. Preserve identical editor settings, zoom, font and sample files.
The playground (`npm start`) is a useful preview, but does not replace this VS Code review.

## Stack integration and release gate

Keep this follow-up based on PR #3, not `main` or an older stack branch. Before merging, refresh
all four PR heads and checks. Merge #1 into `main` first, preserving ancestry with a merge commit;
retarget #2 to `main`, recheck and merge it; then retarget/check/merge #3; finally retarget/check
this follow-up. Do not delete a parent branch while a descendant still targets it. If squash or
rebase merging is chosen instead, restack descendants deliberately and inspect their diffs to
avoid duplicate commits. No force push or automatic merge is part of this change.

`main` is still version 0.77.0 and the PR stack is 0.80.0. PR #1's claim that 0.78–0.80 were
published has not been independently verified. Verify Marketplace history separately before
choosing any future release number. This work performs no version bump, tagging, packaging
or Marketplace publication. Obtain the owner's visual approval and explicit release approval
before publishing.
