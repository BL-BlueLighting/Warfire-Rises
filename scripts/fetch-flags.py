#!/usr/bin/env python3
"""Download the era flags from Wikimedia Commons.

The twelve modern flags in `public/flags/` come from Twemoji, drawn as 36x36
SVGs with the flag inside a 32x26 box. The historical ones are the originals
from Commons — nothing here is redrawn — but they are wrapped in the same
canvas so that a flag is a flag at every size the game draws it: the map icon,
the title screen, a panel row.

    python3 scripts/fetch-flags.py

Writes `public/flags/hist/*.svg` (committed; re-run only when the list below
changes). `reich-stream.svg` is the one derivation: the same file with the
swastika replaced by 乐, for streaming mode. See the licence note in
NOTICE.md — the flags are Commons' own files, public domain or PD-ineligible.
"""

import copy
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "flags", "hist")

API = "https://commons.wikimedia.org/w/api.php"
UA = "WarfireRises/2.1 (https://github.com/BL-BlueLighting/Warfire-Rises)"

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

# Commons file title -> the name this game stores it under.
#
# One entry per flag that differs from today's: the twelve nations of the era
# scenarios, at the flag they actually flew. The 1994 and 2000 scenarios need
# none — those countries' flags had already settled into the ones in
# public/flags/.
FLAGS = {
    "roc": "Flag of the Republic of China.svg",  # 1928-1949, China to 1949
    "ussr": "Flag of the Soviet Union (1936–1955).svg",
    "reich": "Flag of Germany (1935–1945).svg",
    "jpn": "Flag of Japan (1870–1999).svg",
    "raj": "British Raj Red Ensign.svg",
    "iran": "State flag of Iran (1933–1964).svg",
    "bra": "Flag of Brazil (1889–1960).svg",
    "usa": "Flag of the United States (1912–1959).svg",  # 48 stars
    "fra_free": "Flag of Free France (1940–1944).svg",
}

# The flag canvas the modern set uses: 36x36, flag drawn inside 32x26.
CANVAS = 36.0
BOX_W, BOX_H = 32.0, 26.0
BOX_X, BOX_Y = (CANVAS - BOX_W) / 2, (CANVAS - BOX_H) / 2

# Streaming mode swaps the swastika for 乐; the character is drawn at this
# share of the flag's height, centred where the swastika was.
STREAM_GLYPH = "乐"
STREAM_SIZE_RATIO = 0.55


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def resolve(titles: list[str]) -> dict[str, str]:
    """Commons file title -> direct upload URL, for the ones that exist."""
    query = urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url",
            "titles": "|".join("File:" + t for t in titles),
        }
    )
    pages = json.loads(fetch(API + "?" + query))["query"]["pages"]
    found: dict[str, str] = {}
    for page in pages.values():
        if "missing" in page or "imageinfo" not in page:
            continue
        found[page["title"].removeprefix("File:")] = page["imageinfo"][0]["url"]
    return found


def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[1] if "}" in tag else tag


def view_box(root: ET.Element) -> str:
    """The source's viewBox, or one built from its width/height."""
    for key, value in root.attrib.items():
        if strip_ns(key) == "viewBox":
            return value
    width = re.sub(r"[^0-9.]", "", root.get("width", "")) or "1"
    height = re.sub(r"[^0-9.]", "", root.get("height", "")) or "1"
    return f"0 0 {width} {height}"


def wrap(raw: bytes) -> ET.Element:
    """Put a downloaded flag on the 36x36 canvas the modern set uses.

    A nested <svg> with `preserveAspectRatio` does the fitting: the artwork is
    untouched, only the box it is drawn into is the game's own.
    """
    root = ET.fromstring(raw)
    outer = ET.Element(f"{{{SVG_NS}}}svg", {"viewBox": f"0 0 {CANVAS:g} {CANVAS:g}"})
    inner = ET.SubElement(
        outer,
        f"{{{SVG_NS}}}svg",
        {
            "x": f"{BOX_X:g}",
            "y": f"{BOX_Y:g}",
            "width": f"{BOX_W:g}",
            "height": f"{BOX_H:g}",
            "viewBox": view_box(root),
            "preserveAspectRatio": "xMidYMid meet",
        },
    )
    for child in root:
        inner.append(child)
    return outer


def glyph_path(char: str, size: float) -> tuple[str, tuple[float, float, float, float]]:
    """`char` as an SVG path, scaled so its longest side is `size`.

    Returns the path and its bounding box in SVG coordinates — y already
    flipped, which is why the box is not anchored at the origin.
    """
    from fontTools.misc.transform import Transform
    from fontTools.pens.boundsPen import BoundsPen
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.ttLib import TTFont

    font_path = subprocess.check_output(
        ["fc-match", "-f", "%{file}", "Noto Sans CJK SC"], text=True
    )
    font = TTFont(font_path, fontNumber=0, lazy=True)
    glyph_set = font.getGlyphSet()
    name = font.getBestCmap()[ord(char)]

    bounds = BoundsPen(glyph_set)
    glyph_set[name].draw(bounds)
    x_min, y_min, x_max, y_max = bounds.bounds

    scale = size / max(x_max - x_min, y_max - y_min)
    # The font's y axis points up; SVG's points down.
    pen = SVGPathPen(glyph_set)
    glyph_set[name].draw(TransformPen(pen, Transform(scale, 0, 0, -scale, 0, 0)))
    box = (x_min * scale, -y_max * scale, x_max * scale, -y_min * scale)
    return pen.getCommands(), box


def swastika_to_joy(root: ET.Element) -> None:
    """Replace the swastika in the Reich flag with 乐.

    Streaming mode only — the flag stays the historical one everywhere else.
    The swastika is the black path; the red field and the white disc are left
    exactly as Commons drew them. The character goes where the disc is, which
    is not quite the centre of the flag.
    """
    box = root.find(f"{{{SVG_NS}}}svg")
    black = [
        el
        for el in box.iter()
        if strip_ns(el.tag) == "path"
        and el.get("stroke", el.get("fill", "")).lower() in ("#000", "#000000", "black")
    ]
    if not black:
        sys.exit("reich.svg: no swastika path found — has Commons' file changed?")

    disc = next((el for el in box.iter() if strip_ns(el.tag) == "circle"), None)
    _, _, width, height = [float(v) for v in box.get("viewBox").split()]
    cx = float(disc.get("cx")) if disc is not None else width / 2
    cy = float(disc.get("cy")) if disc is not None else height / 2
    diameter = float(disc.get("r")) * 2 if disc is not None else height * 0.6

    d, (gx0, gy0, gx1, gy1) = glyph_path(STREAM_GLYPH, diameter * STREAM_SIZE_RATIO)
    for el in black:
        box.remove(el)
    ET.SubElement(
        box,
        f"{{{SVG_NS}}}path",
        {
            "d": d,
            "fill": "#000",
            "transform": f"translate({cx - (gx0 + gx1) / 2:.1f},{cy - (gy0 + gy1) / 2:.1f})",
        },
    )


def write(name: str, root: ET.Element) -> None:
    path = os.path.join(OUT, name + ".svg")
    ET.indent(root, space="")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    print(f"  {os.path.relpath(path, ROOT)}  {os.path.getsize(path):,} bytes")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    urls = resolve(list(FLAGS.values()))
    missing = [t for t in FLAGS.values() if t not in urls]
    if missing:
        sys.exit("not found on Commons: " + ", ".join(missing))

    files: dict[str, ET.Element] = {}
    for name, title in FLAGS.items():
        print(f"{title}  ->  {name}.svg")
        files[name] = wrap(fetch(urls[title]))

    stream = copy.deepcopy(files["reich"])
    swastika_to_joy(stream)

    print("\nwriting:")
    for name, root in files.items():
        write(name, root)
    write("reich-stream", stream)


if __name__ == "__main__":
    main()
