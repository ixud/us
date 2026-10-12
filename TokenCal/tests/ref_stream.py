"""Print ctok reference output for one tricky string. Dev tool."""
import json

from ctok import token_count, marked_stream, tokenize

T = "\u216d\u0e16\u0264\n\uac4e\u04a1"  # Ⅽ ถ ɤ \n 걸 ҡ (exact fixture string)

for v in ("3.0", "4.7", "4.8"):
    print(v, token_count(T, v))
    print("  stream:", json.dumps(marked_stream(T, v)))
    toks = [t for t in tokenize(T, v) if t != "\u27e8pad\u27e9"]
    print("  tokens:", json.dumps(toks))
