#!/usr/bin/env python3
"""Builds codesandbox-icons.ttf for the "Custom Alabaster Codesandbox" product icon theme.

VS Code draws each icon as a one-colour font glyph, so a colour theme can't colour only
the + badge on the New File and New Folder icons. This font copies those two codicons
and makes them colour glyphs (COLR/CPAL): the file and folder outlines keep the colour
theme's icon.foreground, and the + badge is Codesandbox's accent, the colour of its
active tab border.

Usage: python3 producticons/build.py [path/to/codicon.ttf]
Needs fontTools (pip install fonttools). codicon.ttf ships with VS Code, in
resources/app/out/media/.

The glyphs are Codicons by Microsoft (https://github.com/microsoft/vscode-codicons),
licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The only change is
splitting each glyph into an outline layer and a badge layer.
"""
import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ACCENT = '#6cc7f6'  # tab.activeBorder in themes/Abraham-code-sandbox.json
ICONS = {'new-file': 0xEA7F, 'new-folder': 0xEA80}
FOREGROUND = 0xFFFF  # COLR palette index for "the text colour", i.e. icon.foreground
OUT = Path(__file__).resolve().parent / 'codesandbox-icons.ttf'
CODICON = [
    '/snap/code/current/usr/share/code/resources/app/out/media/codicon.ttf',
    '/usr/share/code/resources/app/out/media/codicon.ttf',
    '/Applications/Visual Studio Code.app/Contents/Resources/app/out/media/codicon.ttf',
]


def contours(glyph_set, name):
    pen = RecordingPen()
    glyph_set[name].draw(pen)
    out, current = [], []
    for op in pen.value:
        current.append(op)
        if op[0] in ('closePath', 'endPath'):
            out.append(current)
            current = []
    return out


def bounds(contour):
    xs, ys = zip(*(pt for _, args in contour for pt in args if pt is not None))
    return min(xs), min(ys), max(xs), max(ys)


def area(contour):
    x0, y0, x1, y1 = bounds(contour)
    return (x1 - x0) * (y1 - y0)


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def glyph(parts):
    pen = TTGlyphPen(None)
    for contour in parts:
        for op, args in contour:
            getattr(pen, op)(*args)
    return pen.glyph()


def split(glyph_set, name, upm):
    """Returns the whole glyph, its outline layer and its + badge layer."""
    parts = contours(glyph_set, name)
    # The badge is a disc in the bottom-right corner with a +-shaped hole in it.
    corner = [c for c in parts if bounds(c)[0] > upm / 3 and bounds(c)[3] < upm * 0.6]
    if not corner:
        sys.exit(f'{name}: no + badge in the bottom-right corner; has the codicon changed?')
    disc = bounds(max(corner, key=area))
    badge = [c for c in parts if inside(bounds(c), disc)]
    outline = [c for c in parts if not inside(bounds(c), disc)]
    if len(badge) != 2 or not outline:
        sys.exit(f'{name}: expected a disc with a + hole, found {len(badge)} badge contours; has the codicon changed?')
    return glyph(parts), glyph(outline), glyph(badge)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else next((Path(p) for p in CODICON if Path(p).exists()), None)
    if not src or not src.exists():
        sys.exit("codicon.ttf not found; pass its path (VS Code's resources/app/out/media/codicon.ttf)")
    codicon = TTFont(src)
    upm = codicon['head'].unitsPerEm
    cmap = codicon.getBestCmap()
    glyph_set = codicon.getGlyphSet()

    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    layers = {}
    for name, codepoint in ICONS.items():
        whole, outline, badge = split(glyph_set, cmap[codepoint], upm)
        glyphs[name] = whole  # drawn in one colour where colour fonts aren't supported
        glyphs[f'{name}.outline'] = outline
        glyphs[f'{name}.badge'] = badge
        layers[name] = [(f'{name}.outline', FOREGROUND), (f'{name}.badge', 0)]

    # Same metrics as codicon.ttf, so the icons sit exactly where the originals do.
    advance = codicon['hmtx'][cmap[ICONS['new-file']]][0]
    hhea, os2 = codicon['hhea'], codicon['OS/2']
    fb = FontBuilder(upm, isTTF=True)
    fb.setupGlyphOrder(list(glyphs))
    fb.setupCharacterMap({codepoint: name for name, codepoint in ICONS.items()})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (advance, getattr(fb.font['glyf'][n], 'xMin', 0)) for n in glyphs})
    fb.setupHorizontalHeader(ascent=hhea.ascent, descent=hhea.descent, lineGap=hhea.lineGap)
    fb.setupNameTable({
        'copyright': 'Codicons glyphs (c) Microsoft Corporation, CC BY 4.0. Split into colour layers for Custom Alabaster.',
        'familyName': 'Custom Alabaster Icons',
        'styleName': 'Regular',
        'fullName': 'Custom Alabaster Icons',
        'psName': 'CustomAlabasterIcons',
        'version': 'Version 1.0',
        'licenseDescription': 'Creative Commons Attribution 4.0 International',
        'licenseInfoURL': 'https://creativecommons.org/licenses/by/4.0/',
    })
    fb.setupOS2(version=4, sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender,
                sTypoLineGap=os2.sTypoLineGap, usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent,
                fsSelection=os2.fsSelection, usWeightClass=os2.usWeightClass)
    fb.setupPost()
    fb.setupCOLR(layers, version=0)
    r, g, b = (int(ACCENT[i:i + 2], 16) / 255 for i in (1, 3, 5))
    fb.setupCPAL([[(r, g, b, 1.0)]])
    fb.save(OUT)
    print(f'wrote {OUT} from {src}')


if __name__ == '__main__':
    main()
