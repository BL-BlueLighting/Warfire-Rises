#!/usr/bin/env python3
"""Rebuild `public/fonts/body-cjk.woff2` from the text the game can print.

The UI's CJK face is a subset: shipping the whole of Noto Sans CJK would be tens
of megabytes for the ~5,000 characters this game actually uses. The catch is
that the subset is only as good as the text it was built from — write a new
word in a language file and it renders as a tofu box until this runs again.

Run it after adding or changing Chinese text anywhere:

    python3 scripts/build-body-font.py

It needs `brotli` for WOFF2 output, which Arch's system Python cannot install
(externally managed), so use a virtualenv:

    python3 -m venv /tmp/fontenv
    /tmp/fontenv/bin/pip install fonttools brotli
    /tmp/fontenv/bin/python scripts/build-body-font.py

The headroom is deliberate: the scanned set is the *current* text, and a font
subset cannot be extended after the fact. Provinces, cities and decision files
are player-editable, so they are scanned too — a new decision naming a new city
must not come out as boxes.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path("/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc")
# 0 JP · 1 KR · 2 SC · 3 TC · 4 HK — the same face the game has always used.
SC_FACE = 2
TARGET = ROOT / "public/fonts/body-cjk.woff2"

# Punctuation, digits and the symbols the interface prints directly.
EXTRA = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "　、。〈〉《》「」『』【】〔〕・ーー—–…‘’“”※→←↑↓↔⚔☢⚠✔✘▸▾▴■□●○◆◇★☆"
    + "０１２３４５６７８９％＋－×÷＝"
)


def common_hanzi() -> set[str]:
    """The 3,755 characters of GB2312 level 1 — the usual "common Chinese" set.

    This is the headroom. The scanned set below is exactly the text the game
    has today, and a subset cannot be extended afterwards: the moment a player
    writes one new word in a decision file, any character outside it is a tofu
    box. Level 1 covers everyday written Chinese, so new prose almost always
    lands inside it.
    """
    chars: set[str] = set()
    for high in range(0xB0, 0xD8):
        for low in range(0xA1, 0xFF):
            try:
                char = bytes([high, low]).decode("gb2312")
            except UnicodeDecodeError:
                continue
            chars.add(char)
    return chars


def scan() -> set[str]:
    """Every character the game can put on screen."""
    chars: set[str] = set(EXTRA) | common_hanzi()

    for path in (ROOT / "src/langs").glob("*.txt"):
        chars.update(path.read_text(encoding="utf-8"))

    for path in (ROOT / "decisions").rglob("*.warf-decision"):
        # Decision files are JSON written by players: every string in them can
        # end up on screen, so the whole file is fair game.
        chars.update(path.read_text(encoding="utf-8"))

    # Source files carry text too — the general names, the console's replies.
    for path in (ROOT / "src/game").glob("*.ts"):
        chars.update(path.read_text(encoding="utf-8"))

    for name in ("admin1.json", "cities.json"):
        path = ROOT / "src/map/data" / name
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))

        def walk(node):
            if isinstance(node, str):
                chars.update(node)
            elif isinstance(node, list):
                for item in node:
                    walk(item)
            elif isinstance(node, dict):
                for item in node.values():
                    walk(item)

        walk(data)

    # Whitespace and control characters are not worth subsetting.
    return {c for c in chars if c.strip() and not c.isspace()}


def main() -> int:
    if not SOURCE.exists():
        print(f"source font not found: {SOURCE}", file=sys.stderr)
        print("install noto-fonts-cjk, or edit SOURCE to point at your own.", file=sys.stderr)
        return 1

    chars = scan()
    print(f"scanning the game's text: {len(chars)} characters")

    target = ROOT / "tmp/body-cjk.ttf"
    target.parent.mkdir(exist_ok=True)
    text_file = ROOT / "tmp/body-cjk.txt"
    text_file.write_text("".join(sorted(chars)), encoding="utf-8")

    subprocess.run(
        [
            sys.executable, "-m", "fontTools.subset", str(SOURCE),
            f"--font-number={SC_FACE}",
            f"--text-file={text_file}",
            "--flavor=woff2",
            "--layout-features=*",
            "--name-IDs=*",
            "--drop-tables+=DSIG",
            f"--output-file={TARGET}",
        ],
        check=True,
    )
    print(f"wrote {TARGET} ({(TARGET.stat().st_size / 1024):.0f} KB)")
    text_file.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
