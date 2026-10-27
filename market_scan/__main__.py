#!/usr/bin/env python3
"""
market-scan — срез рынка вакансий hh.ru по нише «no-code + AI-автоматизация».

Команды:

  python3 -m market_scan analyze  data/vacancies_hh_sample.csv --top 40 -o report.md
  python3 -m market_scan clip     my_vacancies.txt        -o report.md
  python3 -m market_scan html     saved_search.html       -o report.md
  python3 -m market_scan fetch    --token $HH_TOKEN --query n8n --pages 3 -o raw.json

`fetch` требует рабочую авторизацию dev.hh.ru (публичный поиск закрыт с апреля 2026).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from . import analyzer, fetch


def _load_csv(path: Path):
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return data if isinstance(data, list) else data.get("items", [])


def _write(path, text: str):
    if path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        print(f"→ записано: {p}")
    else:
        print(text)


def cmd_demo(args):
    """Прогон на встроенной выборке реальных вакансий — работает без файлов."""
    from . import sample_data
    res = analyzer.analyze(sample_data.as_rows())
    _write(args.out, analyzer.render_report(res, title=args.title or
           "Срез рынка: ниша no-code + AI-автоматизация (встроенная выборка)"))
    return 0


def cmd_analyze(args):
    path = Path(args.source)
    rows = _load_csv(path) if path.suffix.lower() == ".csv" else _load_json(path)
    res = analyzer.analyze(rows)
    if res["count"] == 0:
        print("Выборка пуста — проверьте файл.", file=sys.stderr)
        return 1
    _write(args.out, analyzer.render_report(res, title=args.title or f"Срез рынка: {path.name}", top=args.top))
    if args.json_out:
        payload = {
            "count": res["count"],
            "with_salary": res["with_salary"],
            "salary_median": res["salary_median"],
            "skills": res["skills"].most_common(),
            "problems": res["problems"].most_common(),
            "archetypes": res["archetypes"].most_common(),
            "formats": res["formats"].most_common(),
            "flags": res["flags"].most_common(),
        }
        _write(args.json_out, json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_clip(args):
    blob = Path(args.source).read_text(encoding="utf-8")
    rows = fetch.parse_clip_text(blob)
    print(f"Разобрано записей: {len(rows)}")
    res = analyzer.analyze(rows)
    _write(args.out, analyzer.render_report(res, title=args.title or "Ручной сбор вакансий"))
    return 0


def cmd_html(args):
    html = Path(args.source).read_text(encoding="utf-8", errors="replace")
    rows = fetch.parse_search_html(html)
    print(f"Разобрано карточек: {len(rows)}")
    res = analyzer.analyze(rows)
    _write(args.out, analyzer.render_report(res, title=args.title or "Срез по сохранённой выдаче"))
    return 0


def cmd_fetch(args):
    all_rows = []
    queries = [args.query] if args.query else fetch.DEFAULT_QUERIES
    for q in queries:
        try:
            rows = fetch.fetch_search_api(q, token=args.token, pages=args.pages, area=args.area)
        except fetch.HHAccessError as e:
            print(f"[{q}] {e}", file=sys.stderr)
            print("\nЧто делать: зарегистрируйте приложение на https://dev.hh.ru и получите "
                  "токен, либо используйте режимы `clip` / `html`.", file=sys.stderr)
            return 2
        print(f"[{q}] +{len(rows)}")
        all_rows.extend(rows)
    seen, dedup = set(), []
    for r in all_rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        dedup.append(r)
    print(f"Всего уникальных вакансий: {len(dedup)}")
    Path(args.out).write_text(
        json.dumps(dedup, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"→ записано: {args.out}")
    if dedup:
        res = analyzer.analyze(dedup)
        print(analyzer.render_report(res, title="Срез рынка (свежая выборка)"))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="market_scan", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="разобрать CSV/JSON с вакансиями")
    a.add_argument("source")
    a.add_argument("-o", "--out")
    a.add_argument("--json-out")
    a.add_argument("--title")
    a.add_argument("--top", type=int, default=40)
    a.set_defaults(func=cmd_analyze)

    c = sub.add_parser("clip", help="разобрать вручную скопированные тексты вакансий")
    c.add_argument("source")
    c.add_argument("-o", "--out")
    c.add_argument("--title")
    c.set_defaults(func=cmd_clip)

    h = sub.add_parser("html", help="разобрать сохранённую страницу поиска hh.ru")
    h.add_argument("source")
    h.add_argument("-o", "--out")
    h.add_argument("--title")
    h.set_defaults(func=cmd_html)

    f = sub.add_parser("fetch", help="собрать через официальный API (нужен токен)")
    f.add_argument("--token", default=None)
    f.add_argument("--query", default=None)
    f.add_argument("--pages", type=int, default=2)
    f.add_argument("--area", default=None)
    f.add_argument("-o", "--out", default="raw_vacancies.json")
    f.set_defaults(func=cmd_fetch)

    d = sub.add_parser("demo", help="прогон на встроенной выборке реальных вакансий")
    d.add_argument("-o", "--out")
    d.add_argument("--title")
    d.set_defaults(func=cmd_demo)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except fetch.HHAccessError as e:
        # Не сыплем трейсбеком: у пользователя закрыт API или поменялась вёрстка.
        print(f"\nНе удалось получить данные: {e}", file=sys.stderr)
        return 2
    except FileNotFoundError as e:
        print(f"\nФайл не найден: {e.filename}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
