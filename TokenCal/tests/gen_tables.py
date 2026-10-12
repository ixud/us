"""Generate Unicode data tables for the JS port of ctok.

Run with:  uv run --with ctok python tests/gen_tables.py

The tables are computed from the *same* Python runtime ctok was calibrated on
(unicodedata 15.1 in Python 3.13 plus the `regex` module's derived properties),
so the JS port does not depend on the browser engine's Unicode version.

Output: tests/generated/unicode-tables.json
"""

import json
import unicodedata
from pathlib import Path

import regex

from ctok.constants import (
    ATOM_TO_GLYPH,
    BOW_G,
    CAPS_G,
    CONTRACTION_SUFFIXES,
    EOW_G,
    GLYPH_TO_ATOM,
    IDEOGRAPHIC_SYMBOLS,
    PAD_G,
    PUNCT_SYMS,
    QUOTE_FOLD,
    SHIFT_G,
    SYMBOL_LETTERS,
    VARIATION_SELECTORS,
)

OUT = Path(__file__).parent / "generated" / "unicode-tables.json"

ALPHABETIC = regex.compile(r"\p{Alphabetic}")
MARK = regex.compile(r"\p{M}")

MAX_CP = 0x110000


def ranges(pred):
    """Compress a codepoint predicate into inclusive [start, end] ranges."""
    out = []
    start = None
    for o in range(MAX_CP):
        if pred(chr(o)):
            if start is None:
                start = o
        else:
            if start is not None:
                out.append([start, o - 1])
                start = None
    if start is not None:
        out.append([start, MAX_CP - 1])
    return out


def main():
    print("scanning codepoints...")

    cat_queries = {
        "isL": lambda c: unicodedata.category(c)[0] == "L",
        "isM": lambda c: unicodedata.category(c)[0] == "M",
        "isZ": lambda c: unicodedata.category(c)[0] == "Z",
        "isP": lambda c: unicodedata.category(c)[0] == "P",
        "isS": lambda c: unicodedata.category(c)[0] == "S",
        "isNd": lambda c: unicodedata.category(c) == "Nd",
        "isNo": lambda c: unicodedata.category(c) == "No",
        "isCf": lambda c: unicodedata.category(c) == "Cf",
        "isCn": lambda c: unicodedata.category(c) == "Cn",
    }

    data = {
        "codePoints": {
            name: ranges(fn) for name, fn in cat_queries.items()
        },
        "pyAlphabetic": ranges(lambda c: ALPHABETIC.fullmatch(c) is not None),
        "pyMark": ranges(lambda c: MARK.fullmatch(c) is not None),
        "pyCombining": ranges(lambda c: unicodedata.combining(c) != 0),
        "pyIsUpper": ranges(lambda c: c.isupper()),
        "pyIsLower": ranges(lambda c: c.islower()),
        "const": {
            "bowG": BOW_G,
            "eowG": EOW_G,
            "padG": PAD_G,
            "shiftG": SHIFT_G,
            "capsG": CAPS_G,
            "glyphToAtom": list(GLYPH_TO_ATOM.items()),
            "atomToGlyph": list(ATOM_TO_GLYPH.items()),
            "punctSyms": sorted(PUNCT_SYMS),
            "ideographicSymbols": sorted(IDEOGRAPHIC_SYMBOLS),
            "symbolLetters": [list(r) for r in SYMBOL_LETTERS],
            "variationSelectors": list(VARIATION_SELECTORS),
            "quoteFold": [[chr(k), v] for k, v in QUOTE_FOLD.items()],
            "contractionSuffixes": sorted(CONTRACTION_SUFFIXES),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = OUT.stat().st_size
    print(f"wrote {OUT} ({size / 1024:.1f} KiB)")
    for name in ("pyAlphabetic", "pyCombining", "pyIsUpper", "pyIsLower"):
        print(f"  {name}: {len(data[name])} ranges")
    for name in data["codePoints"]:
        print(f"  {name}: {len(data['codePoints'][name])} ranges")


if __name__ == "__main__":
    main()
