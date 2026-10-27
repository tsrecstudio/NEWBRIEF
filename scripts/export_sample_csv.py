#!/usr/bin/env python3
"""Экспортирует market_scan.sample_data.RECORDS в data/vacancies_hh_sample.csv."""
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from market_scan import sample_data  # noqa: E402

FIELDS = ["id", "source", "name", "employer", "area", "salary_from", "salary_to",
          "currency", "experience", "employment", "published_at", "alternate_url",
          "key_skills", "professional_roles", "description"]


def main():
    out = Path(__file__).resolve().parent.parent / "data" / "vacancies_hh_sample.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = sample_data.as_rows()
    with out.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in FIELDS})
    print(f"{len(rows)} записей → {out}")


if __name__ == "__main__":
    main()
