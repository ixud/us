"""Generate ground-truth token counts with the real ctok package.

Run with:  uv run --python 3.13 --with ctok python tests/gen_fixtures.py

Writes tests/generated/fixtures.json: a list of {text, counts} where counts maps
"3.0", "4.7", "4.8" to ctok.token_count(text, version).
"""

import json
import random
from pathlib import Path

from ctok import token_count

OUT = Path(__file__).parent / "generated" / "fixtures.json"
VERSIONS = ("3.0", "4.7", "4.8")

random.seed(20261012)

CURATED = [
    "",
    " ",
    "  ",
    "a",
    " a",
    "  a",
    "a ",
    "a\n",
    "a\n\n\n",
    "\n",
    "\n\n",
    "hello, world",
    "Hello, world! How are you?",
    "it's a test, don't worry, we're fine",
    "I'll he'd she's they've",
    "iPhone eBay McDonald NASA HTTP fooBAR",
    "NASA likes tokenizers",
    "GaN WiFi QQ ABC abcd ABCD ABCDE",
    "İstanbul İzmir",
    "ẞ SCHARFES ESZETT",
    "ΣΣΣΣ ΟΔΟΣ σς",
    "ϴϴ ϴ theta",
    "① ② ③ Ⅰ Ⅱ Ⅲ ⅳ",
    "7 42 042 3.14 1,000 0xFF 0777",
    "١٢٣ ٤٥٦ ०१२ ३४५ ๑๒๓",
    "日本語のテキストです。",
    "한국어 텍스트입니다.",
    "中文测试文本。",
    "Emoji 😀😃😄 test ⚖️ ⚖ ⛳️",
    "“ quotes ” ‘ single ’ „ low-9",
    "—»«•°„–−£§€…√→（№†└│།·─═█",
    "〄〒〓〠〶〷〾〿",
    "x'REXX a 'b 'First x 'S x'LL x'llo",
    "a'b n't it's",
    "const x = {a: 1, b: [2, 3]}; // comment\nconsole.log(`hi ${x}`);",
    "def f(x):\n    return x ** 2\n",
    "SELECT * FROM t WHERE a = 'x' AND b >= 3;",
    "https://example.com/path?q=1&r=2#frag",
    "한글123abc!@# ไทย456",
    "ภาษาไทยล้วนๆ ไม่มีอังกฤษ",
    "สวัสดีครับ ผมชื่อโทเคน",
    "กำลังทดสอบจำนวนโทเคนของข้อความภาษาไทย",
    "น้ำ จำนวน นำ ก่ำ ดำ",
    "สระอำแบบแยกส่วน \u0E4D\u0E32 กับแบบรวม \u0E33",
    "ก\u0E48\u0E32 ก\u0E49า เก่งมาก",
    "ทดสอบ\nบรรทัดใหม่\nและ\tแท็บ",
    "  นำหน้าด้วยช่องว่าง",
    "ตามด้วยช่องว่าง ",
    "ท้ายด้วยขึ้นบรรทัด\n\n",
    "ผสมไทย English 123 ทดสอบ",
    "ครับ! หายไปไหน? (ทดสอบ)",
    "ท\u0E31\u0E49\u0E07 หมด",
    "ᛒ ᛒᛒ ᛒᛒᛒ",
    "ܑ ܒ ܑܒ ܒܑ",
    "a\u0301 e\u0301 combining",
    "क\u093C क़",
    "𝔘𝔫𝔦𝔠𝔬𝔡𝔢",
    "𐐷 𐐷𐐷 astral letters",
    "X\u00A0Y\u2009Z\u202FY",
    "\u3000ideo space",
    "a\tb\tc",
    "a\r\nb",
    "1 。？ 1",
    "1。？ 1",
    "1 ？。1",
    "1？。 1",
    "x = 1; y = 2; z = x >= y ? 1 : 0;",
    "(){ }[] 🎉",
    "🥲🥹🫠",
    "ﬁﬂ ǆ ǅ Ǆ",
]


def build_pools():
    pools = {}
    pools["thai"] = [chr(o) for o in range(0x0E01, 0x0E3B)] + \
                    [chr(o) for o in range(0x0E40, 0x0E4F)] + [chr(0x0E33), "\u0E4D\u0E32"]
    pools["thai_digit"] = [chr(o) for o in range(0x0E50, 0x0E5A)]
    pools["latin_lower"] = [chr(o) for o in range(0x61, 0x7B)]
    pools["latin_upper"] = [chr(o) for o in range(0x41, 0x5B)]
    pools["ascii_punct"] = list("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
    pools["space"] = [" ", " ", " ", "  ", "\n", "\t", " \n", "\n\n"]
    pools["cjk"] = [chr(o) for o in range(0x4E00, 0x4E80)] + [chr(o) for o in range(0x3041, 0x30A0)]
    pools["hangul"] = [chr(o) for o in range(0xAC00, 0xAC40)]
    pools["emoji"] = [chr(o) for o in range(0x1F300, 0x1F360)]
    pools["arabic_digits"] = [chr(o) for o in range(0x0660, 0x066A)]
    pools["devanagari"] = [chr(o) for o in range(0x0966, 0x0970)]
    pools["combining"] = [chr(o) for o in range(0x0300, 0x0320)]
    pools["quotes"] = list("\u2018\u2019\u201C\u201D\u201E\u00AB\u00BB")
    pools["punct_syms"] = list("—»«•°„–−£§€…√→（№†└│།·─═█")
    pools["ideo_marks"] = list("〄〒〓〠〶〷〾〿")
    pools["variation"] = ["\uFE0F", "\uFE00"]
    pools["syriac"] = ["\u0711"] + [chr(o) for o in range(0x0730, 0x0740)]
    pools["symbol_letters"] = ["\u2160", "\u2161", "\u24B6", "\uA6E6", "\u16EE"]
    pools["contractions"] = ["'s", "'t", "'ll", "'re", "'ve", "'d", "'m"]
    pools["digits"] = list("0123456789")
    pools["code"] = list("{}()[]<>=;:.*+-/&|%$#@!?")
    walks = []
    for name, pool in pools.items():
        walks.append((name, pool))
    return pools, walks


def random_text(rng, pools, walks):
    n = rng.choice([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144])
    out = []
    for _ in range(n):
        name, pool = rng.choice(walks)
        w = rng.random()
        if name == "space":
            out.append(rng.choice(pool))
        elif w < 0.15 and rng.random() < 0.5 and out:
            out.append(rng.choice(pools["contractions"]))  # glue a contraction after a word
        else:
            out.append(rng.choice(pool))
    text = "".join(out)
    if rng.random() < 0.2:
        text = " " + text
    if rng.random() < 0.2:
        text = text.rstrip("\n") + "\n" * rng.randint(0, 4)
    return text


def main():
    pools, walks = build_pools()
    cases = list(CURATED)
    seen = set(cases)

    def add(t):
        if t not in seen:
            seen.add(t)
            cases.append(t)

    rng = random.Random(987654321)
    for _ in range(1500):
        add(random_text(rng, pools, walks))

    rng2 = random.Random(24680)
    # longer mixed-script "message-like" texts
    for _ in range(500):
        parts = []
        for _ in range(rng2.randint(1, 6)):
            parts.append(random_text(rng2, pools, walks))
            parts.append(rng2.choice([" ", " ", " ", "\n", " ที่ ", " and ", ", "]))
        add("".join(parts))

    # wild unicode fuzz: random codepoints from everywhere
    WILD_RANGES = (
        (0x0000, 0x007F),   # ASCII + controls
        (0x0080, 0x024F),   # Latin ext
        (0x0250, 0x02FF),   # IPA / modifiers
        (0x0300, 0x036F),   # combining diacriticals
        (0x0370, 0x03FF),   # Greek
        (0x0400, 0x04FF),   # Cyrillic
        (0x0590, 0x05FF),   # Hebrew
        (0x0600, 0x06FF),   # Arabic
        (0x0700, 0x074F),   # Syriac
        (0x0900, 0x097F),   # Devanagari
        (0x0E00, 0x0E7F),   # Thai
        (0x0F00, 0x0FFF),   # Tibetan
        (0x1000, 0x109F),   # Myanmar
        (0x1100, 0x11FF),   # Hangul Jamo
        (0x1200, 0x137F),   # Ethiopic
        (0x13A0, 0x13FF),   # Cherokee
        (0x16A0, 0x16FF),   # Runic
        (0x1780, 0x17FF),   # Khmer
        (0x1800, 0x18AF),   # Mongolian
        (0x1D00, 0x1D7F),   # Phonetic ext
        (0x1E00, 0x1EFF),   # Latin ext additional
        (0x2000, 0x206F),   # general punctuation
        (0x2070, 0x209F),   # super/subscripts
        (0x20A0, 0x20CF),   # currency
        (0x2100, 0x214F),   # letterlike
        (0x2150, 0x218F),   # number forms
        (0x2190, 0x21FF),   # arrows
        (0x2200, 0x22FF),   # math operators
        (0x2300, 0x23FF),   # misc technical
        (0x2460, 0x24FF),   # enclosed alphanumerics
        (0x2500, 0x257F),   # box drawing
        (0x25A0, 0x25FF),   # geometric shapes
        (0x2600, 0x26FF),   # misc symbols
        (0x2700, 0x27BF),   # dingbats
        (0x2E80, 0x2EFF),   # CJK radicals
        (0x3000, 0x303F),   # CJK punctuation
        (0x3040, 0x30FF),   # kana
        (0x3100, 0x312F),   # bopomofo
        (0x3400, 0x4DBF),   # CJK ext A
        (0x4E00, 0x4F00),   # CJK
        (0xA000, 0xA48F),   # Yi
        (0xAC00, 0xAC80),   # Hangul syllables
        (0xFB00, 0xFB4F),   # ligatures / Hebrew presentation
        (0xFE00, 0xFE0F),   # variation selectors
        (0xFF00, 0xFFEF),   # halfwidth/fullwidth
        (0x10000, 0x1007F),  # Linear B
        (0x10400, 0x1044F),  # Deseret
        (0x1D400, 0x1D4FF),  # math alphanumerics
        (0x1F300, 0x1F3FF),  # emoji
        (0x1F600, 0x1F64F),  # emoji faces
        (0x20000, 0x20080),  # CJK ext B
        (0xE000, 0xE01F),   # private use (BMP)
        (0xE0100, 0xE0105),  # variation selectors supplement
        (0xF0000, 0xF0010),  # private use plane 15
    )

    def wild_char(rng):
        lo, hi = WILD_RANGES[rng.randrange(len(WILD_RANGES))]
        while True:
            cp = rng.randint(lo, hi)
            if not (0xD800 <= cp <= 0xDFFF):
                return chr(cp)

    def wild_text(rng):
        n = rng.choice([1, 2, 3, 5, 8, 13, 21])
        parts = []
        for _ in range(n):
            parts.append(wild_char(rng))
            if rng.random() < 0.15:
                parts.append(rng.choice([" ", " ", "\n", "\t"]))
        return "".join(parts)

    rng3 = random.Random(1357911)
    for _ in range(2500):
        add(wild_text(rng3))

    # combining-mark and format-char torture
    rng4 = random.Random(424242)
    for _ in range(400):
        base = rng4.choice("aeiouyABCDEFTnaeดทก") + rng4.choice(["", "x", "1"])
        marks = "".join(wild_char(rng4) for _ in range(rng4.randint(1, 3)))
        tail = rng4.choice(["", " ", "b", "\n", "1"])
        add(base + marks + tail)

    # lone surrogates and raw edges
    add("\ud800")
    add("a\udfffb")
    add("\u0000")
    add("a\u0000b")
    add("\u0001\u0002\u0003")
    add("\u007F\u0080\u009F")
    add("a\u00A0b\u2028c\u2029d")
    add("\u0E4D\u0E32\u0E33\u0E4D\u0E32")

    # Thai-focused fuzz: consonants + vowels + tones + SARA AM + mixing
    rng5 = random.Random(0xBEEF)
    thai_cons = [chr(o) for o in range(0x0E01, 0x0E2F)]
    thai_vowel = [chr(o) for o in range(0x0E30, 0x0E3B)] + [chr(o) for o in range(0x0E40, 0x0E4F)]
    thai_tone = [chr(o) for o in (0x0E48, 0x0E49, 0x0E4A, 0x0E4B, 0x0E4C)]
    thai_mix = ["\u0E4D\u0E32", "\u0E33", "\u0E4D", "\u0E32", "\u0E3A", "\u0E47"]
    for _ in range(600):
        parts = []
        for _ in range(rng5.randint(1, 12)):
            parts.append(rng5.choice(thai_cons))
            for _ in range(rng5.randint(0, 2)):
                parts.append(rng5.choice(thai_vowel + thai_tone + thai_mix))
            w = rng5.random()
            if w < 0.2:
                parts.append(rng5.choice([" ", " ", "\n", " "]))
            elif w < 0.3:
                parts.append(rng5.choice(["ครับ", "ทดสอบ", "token", "123", "🙂", "ok"]))
        add("".join(parts))

    # second independent fuzz batch (different seed) — extra regression coverage
    rng6 = random.Random(0xC0FFEE)
    for _ in range(1500):
        add(wild_text(rng6))
    for _ in range(400):
        base = rng6.choice("aeiouyABCDEFTnaeดทก") + rng6.choice(["", "x", "1"])
        marks = "".join(wild_char(rng6) for _ in range(rng6.randint(1, 3)))
        tail = rng6.choice(["", " ", "b", "\n", "1"])
        add(base + marks + tail)
    for _ in range(300):
        parts = []
        for _ in range(rng6.randint(1, 10)):
            parts.append(rng6.choice(thai_cons))
            for _ in range(rng6.randint(0, 2)):
                parts.append(rng6.choice(thai_vowel + thai_tone + thai_mix))
            if rng6.random() < 0.25:
                parts.append(rng6.choice([" ", "\n", "ครับ", "🙂", "token"]))
        add("".join(parts))

    fixtures = []
    for t in cases:
        fixtures.append({
            "text": t,
            "counts": {v: token_count(t, v) for v in VERSIONS},
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=True keeps lone surrogates representable as \uXXXX escapes in the file.
    OUT.write_text(json.dumps(fixtures, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    total_chars = sum(len(f["text"]) for f in fixtures)
    print(f"wrote {OUT}: {len(fixtures)} cases, {total_chars} chars")


if __name__ == "__main__":
    main()
