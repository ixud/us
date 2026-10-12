"""Generate ISO week fixtures for the helper tests (Python is the reference).

Run: uv run --python 3.13 python tests/gen_iso_weeks.py
Writes tests/generated/iso-weeks.json: [{date:"YYYY-MM-DD", isoYear, isoWeek, isoDay}, ...]
"""

import json
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).parent / "generated" / "iso-weeks.json"

dates = set()

# every year boundary +- 10 days for 2000..2040
for y in range(2000, 2041):
    for d in range(-10, 11):
        dates.add(date(y, 1, 1) + timedelta(days=d))

# every day of 2026 and 2027
d = date(2026, 1, 1)
while d <= date(2027, 12, 31):
    dates.add(d)
    d += timedelta(days=1)

# random sample across 1970..2060
rng = random.Random(555)
base = date(1970, 1, 1)
span = (date(2060, 12, 31) - base).days
for _ in range(800):
    dates.add(base + timedelta(days=rng.randint(0, span)))

rows = []
for d in sorted(dates):
    iso = d.isocalendar()
    rows.append({
        "date": d.isoformat(),
        "isoYear": iso.year,
        "isoWeek": iso.week,
        "isoDay": iso.weekday,
    })

OUT.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
print(f"wrote {OUT}: {len(rows)} rows")
